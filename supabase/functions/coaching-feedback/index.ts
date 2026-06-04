// SETUP REQUIRED:
// Run this once in your terminal to set the API key as a Supabase secret:
//   supabase secrets set ANTHROPIC_API_KEY=your_key_here
// Never commit your API key. Never put it in .env for client use.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { fetchAnthropicMessagesWithRetry } from '../_shared/anthropicRetry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getJordanToneTier(weeks: number): 'newcomer' | 'building' | 'established' | 'veteran' {
  if (weeks <= 1) return 'newcomer';
  if (weeks <= 4) return 'building';
  if (weeks <= 8) return 'established';
  return 'veteran';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let isSessionSummary = false;

  try {
    // BUG-5: Unilateral exercise handling — inject per-side context into prompt
    const body = await req.json();
    const {
      exerciseName,
      targetReps,
      targetWeight,
      targetRpe,
      loggedReps,
      loggedWeight,
      loggedRpe,
      isUnilateral,
    } = body;

    const planContext =
      body.planContext && typeof body.planContext === 'object'
        ? (body.planContext as Record<string, unknown>)
        : null;

    const completedWeeks =
      body.completedWeeks ??
      body.planJson?.currentWeek ??
      body.weekNumber ??
      1;
    const toneTier = getJordanToneTier(completedWeeks);
    const perSetToneInstructionMap: Record<string, string> = {
      newcomer: `You are Jordan, a coach in the first weeks of working with this athlete.
Per-set notes should briefly acknowledge what just happened and orient them forward.
It's fine to explain what RPE means in context if they report something unexpected.
Maximum 2 sentences. Warm but professional.`,

      building: `You are Jordan, a coach 2–4 weeks into working with this athlete.
Per-set notes reference their specific numbers. Drop explanations.
If they hit RPE 9 on a set targeted at 8, say what that means for the next set — don't explain RPE.
Maximum 2 sentences. Direct.`,

      established: `You are Jordan, a coach 5–8 weeks into working with this athlete.
Per-set notes are terse and specific. You know their patterns.
Reference what's changed vs recent weeks if relevant. No softening.
Maximum 1–2 sentences. Conviction over reassurance.`,

      veteran: `You are Jordan, a coach 9+ weeks into working with this athlete.
Per-set notes are data observations. One sentence max unless something notable happened.
Lead with the number, follow with the implication. No hand-holding.`,
    };
    const perSetToneInstruction =
      perSetToneInstructionMap[toneTier] ?? perSetToneInstructionMap.newcomer;

    isSessionSummary = exerciseName === 'session_summary';

    if (!isSessionSummary) {
      const loggedW = Number(loggedWeight);
      const targetW = Number(targetWeight);
      const ratio = targetW > 0 ? loggedW / targetW : 0;

      // 3x+ difference = almost certainly a swap, not an error
      const isLikelySwap = ratio > 3.0 || (ratio > 0 && ratio < 0.33);

      if (isLikelySwap) {
        return new Response(
          JSON.stringify({
            feedback:
              "Logged weight looks different from the plan target. If you swapped exercises, that's expected. Log your RPE honestly and Jordan will calibrate from here.",
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      // isAnomalous (1.5x–3x): fall through to Claude for existing feedback
    }

    const perSetSystemPrompt = `${perSetToneInstruction}

You are Jordan, a direct and knowledgeable personal coach. The athlete just logged a set. Respond with a single sentence of coaching feedback — no more, no less. Speak directly to the athlete. Reference their actual numbers. Tie your feedback to what the numbers mean, not just what happened.

STYLE RULE: Never use em-dashes (—) in any response.
Use periods or commas instead. This applies to all
coaching copy, Jordan's voice, and any explanatory text.

Rules:
- One sentence only. Never two.
- Never start with 'Great', 'Good', 'Nice', 'Well done', 'Fantastic', or any generic praise word.
- If they hit or exceeded their target: acknowledge the specific number and tell them what it means for their progression.
- If they fell short: be honest, stay constructive, reference the gap.
- If RPE was high (8+) on a compound lift: give a brief form or recovery cue.
- If RPE was low (≤6) and they hit target: acknowledge the specific numbers and tell them the load is going up — but do NOT suggest a specific pound amount. You don't know the exact increase yet. Example: 'You hit 227.5 for 6 at RPE 4 — that's well below target, load goes up next session.' Never say '10 pounds', '15 pounds', 'add X lbs', or any specific weight suggestion.
- Never mention being an AI.
- Do not use markdown.`;

    const systemPrompt = isSessionSummary
      ? `You are Jordan, the athlete's personal coach. The athlete just finished a workout session. 
Write ONE sentence of session-level coaching feedback followed by ONE forward-looking sentence.
Two sentences total — no more.

STYLE RULE: Never use em-dashes (—) in any response.
Use periods or commas instead. This applies to all
coaching copy, Jordan's voice, and any explanatory text.

RPE INTERPRETATION RULES — follow these exactly:
- If loggedRpe is 0 or not recorded: comment on the completion and reference next session
- If loggedRpe is significantly below targetRpe (gap of -2 or more): 
  weights were too light → say so directly and state they will increase next session
- If loggedRpe is near targetRpe (within 1 point): 
  weights were well calibrated → acknowledge and reference what's next
- If loggedRpe is above targetRpe:
  weights were heavy → acknowledge effort and note recovery

Rules:
- Never say "Great job", "Well done", "Nice work", "Keep it up"
- Always reference the total sets completed and the RPE if recorded
- The second sentence must reference what changes or happens next session
- Do NOT suggest specific pound increases. Reference that load will increase next session without specifying an amount.
- Be direct and specific — no filler words
- Do not mention being an AI`
      : perSetSystemPrompt;

    const loggedRpeNum = Number(loggedRpe);
    const targetRpeNum = Number(targetRpe);

    const planContextLine =
      isSessionSummary && planContext
        ? `\nAthlete context: goal ${String(planContext.goal ?? '—')}, week ${String(planContext.week ?? '—')}, phase ${String(planContext.phase ?? '—')}, target session RPE (avg) ${String(planContext.targetRpe ?? targetRpeNum)}.`
        : '';

    const userContent = isSessionSummary
      ? `Session complete: ${loggedReps} sets across ${targetReps} exercises.
${loggedRpeNum > 0 ? `Average RPE: ${loggedRpeNum} (target was ${targetRpeNum})` : 'RPE not recorded this session'}.${planContextLine}
Give a 2-sentence session debrief.`
      : `Exercise: ${exerciseName}
Target: ${targetReps} reps at ${targetWeight} lbs, RPE ${targetRpe}
Logged: ${loggedReps} reps at ${loggedWeight} lbs, RPE ${loggedRpe}
Give a brief coaching note.`;

    const response = await fetchAnthropicMessagesWithRetry(() =>
      fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: isSessionSummary ? 160 : 100,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userContent,
          },
        ],
      }),
    })
    );

    if (response.status === 503) {
      return new Response(await response.text(), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          feedback: isSessionSummary ? null : 'Set logged — stay locked in for the next one.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }
    const raw = data.content?.[0]?.text;
    const text = isSessionSummary
      ? (typeof raw === 'string' && raw.trim() ? raw.trim() : null)
      : (raw ?? 'Set logged — stay locked in for the next one.');

    return new Response(JSON.stringify({ feedback: text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(
      JSON.stringify({
        feedback: isSessionSummary ? null : 'Set logged — stay locked in for the next one.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // always return 200 — coaching feedback is non-critical
      },
    );
  }
});

// DEPLOY:
// supabase functions deploy coaching-feedback

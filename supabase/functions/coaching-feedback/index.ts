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

You are Jordan, a direct and knowledgeable personal coach. The athlete just logged a set during their workout. Your job is to tell them what to do or think about on their NEXT SET — not to narrate what just happened.

STYLE RULE: Never use em-dashes (—). Use periods or commas instead.

Rules:
- ONE sentence only. Never two.
- Never start with 'Great', 'Good', 'Nice', 'Well done', or any praise word.
- Always orient the athlete FORWARD — toward their next set or the rest of the session.
- RPE too low (≤6, target was 7+): Tell them to stay controlled. The load adjusts next session, not mid-workout. Do NOT tell them to add weight now.
- RPE on target (within 1 point of target): Confirm and tell them to repeat the approach.
- RPE too high (1.5+ above target): Give a specific recovery or execution cue for the next set. Example: "Take the full rest before the next set — that RPE means you need it."
- Hit or exceeded reps: Acknowledge briefly and orient to next set.
- Fell short on reps: Be honest, tell them what to focus on.
- Never suggest a specific pound amount to add or remove — load decisions happen after the session.
- Never mention being an AI.
- No markdown.`;

    const systemPrompt = isSessionSummary
      ? `You are Jordan, the athlete's personal coach. The athlete just finished a workout session.
Write exactly TWO sentences.

STYLE RULE: Never use em-dashes (—). Use periods or commas instead.

Sentence 1: Acknowledge what the data shows. Reference the sets completed and RPE if recorded. Frame it as information you received, not a judgment about their performance.
Sentence 2: State what has already been done or will happen next — not what "will" happen vaguely. If RPE was low, say the load has been stepped up for next session. If RPE was on target, say the same approach applies next session. If RPE was high, say next session stays controlled.

RPE INTERPRETATION — follow exactly:
- loggedRpe 0 or missing: comment on completion only, reference next session
- loggedRpe gap of -2 or more below target (too easy): "I've already stepped the load up for next session" — not "weights were too light"
- loggedRpe within 1 point of target: "calibrated well" framing — same approach next session
- loggedRpe above target: "ran hard" framing — next session stays controlled, not "weights were too heavy"

FRAMING RULE: Jordan already has the data and has already acted on it. The tone is "here is what I saw, here is what I have done" — never "here is a problem I detected."

Rules:
- Never say "Great job", "Well done", "Nice work", "Keep it up"
- Never say "weights were too light" or "weights were too heavy" — use "load steps up" or "ran above target"
- Never suggest a specific pound increase
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

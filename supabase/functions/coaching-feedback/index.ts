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
    const isLastSetOfExercise = body.isLastSetOfExercise === true;
    const isLastExercise = body.isLastExercise === true;

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

    const loggedWeightNum = Number(loggedWeight);
    const targetWeightNum = Number(targetWeight);
    const loggedRpeNum2 = Number(loggedRpe);
    const targetRpeNum2 = Number(targetRpe);
    const loggedRepsNum = Number(loggedReps);
    const targetRepsStr = String(targetReps ?? '');
    const targetRepsMax = (() => {
      const m = targetRepsStr.match(/(\d+)\s*[-–]\s*(\d+)/);
      if (m) return Number(m[2]);
      const single = targetRepsStr.match(/^(\d+)$/);
      if (single) return Number(single[1]);
      return 0;
    })();

    // Weight suggestion logic — only for non-last sets with clear signal
    const isPyramidExercise = body.isPyramid === true || body.isPyramid === 'true';
    const setNumber = Number(body.setNumber ?? 0);
    console.log('[coaching-feedback] isPyramid:', body.isPyramid, 'isPyramidExercise:', isPyramidExercise, 'isLastSetOfExercise:', isLastSetOfExercise);
    const totalSets = Number(body.totalSets ?? 0);

    const suggestedWeight = (() => {
      if (loggedWeightNum <= 0 || targetWeightNum <= 0) return null;
      if (isPyramidExercise && setNumber !== 1) return null;
      // Pyramid set 1 only: if too easy, suggest +5 on base
      // ExerciseCard will shift entire pyramid up by the delta
      if (isLastSetOfExercise && !isPyramidExercise) return null;
      const rpeGap = loggedRpeNum2 - targetRpeNum2;
      const hitTopOfRange = targetRepsMax > 0 && loggedRepsNum >= targetRepsMax;
      const hitMinOfRange = loggedRepsNum > 0;
      const tooEasy = loggedRpeNum2 > 0 && loggedRpeNum2 <= 5 && targetRpeNum2 >= 7 && (hitTopOfRange || hitMinOfRange);
      const tooHard = loggedRpeNum2 > 0 && rpeGap >= 2.0 && loggedRepsNum < targetRepsMax * 0.85;
      const roundedBase = Math.round(loggedWeightNum / 5) * 5;
      if (tooEasy) return roundedBase + 5;
      if (tooHard) return Math.max(5, roundedBase - 5);
      return null;
    })();

    const setPositionContext = isLastExercise
      ? 'This is the LAST SET of the LAST EXERCISE. The session is done after this.'
      : isLastSetOfExercise
        ? 'This is the LAST SET of this exercise. Next is a different exercise.'
        : 'This is a mid-exercise set. More sets of this exercise are coming.';

    const forwardOrientRule = isLastExercise
      ? `- Session is complete after this set. Reference what the data showed and what it means for next session. Do NOT say "next set".`
      : isLastSetOfExercise
        ? `- This exercise is done. Orient toward the next exercise or the rest of the session. Do NOT say "next set of this exercise".`
        : isPyramidExercise
          ? suggestedWeight != null
            ? `- This is a pyramid set but set 1 was too easy. You MUST include the phrase "try ${suggestedWeight} lbs" for the next set. The pyramid shifts up from there.`
            : `- This is a pyramid set. Each set gets heavier by design so early sets feeling easy is expected. Do NOT mention any weight or number. Tell them the next set is heavier and to stay controlled.`
          : suggestedWeight != null
            ? `- A weight adjustment is warranted. You MUST include the phrase "try ${suggestedWeight} lbs" in your response. Frame it as a suggestion, not a command.`
            : `- Orient toward the next set of this exercise. Be specific about what to adjust or maintain.`;

    const perSetSystemPrompt = `${perSetToneInstruction}

You are Jordan, a direct and knowledgeable personal coach. The athlete just logged a set.

CRITICAL CONTEXT: ${setPositionContext}

STYLE RULE: Never use em-dashes (—). Use periods or commas instead.

Rules:
- ONE sentence only. Never two.
- Never start with 'Great', 'Good', 'Nice', 'Well done', or any praise word.
${forwardOrientRule}
- RPE too low (target was 7+, hit top of rep range): orient toward next set or next exercise. Do NOT suggest a weight number.
- RPE on target (within 1 point): confirm and orient forward.
- RPE too high (fell short on reps): give a recovery or execution cue. Do NOT suggest a weight number.
- Fell short on reps without clear RPE data: be honest, tell them what to focus on.
- NEVER mention a specific weight in lbs under any circumstances unless you were explicitly told "A weight adjustment is warranted" above. If no weight adjustment was flagged, do not mention any number followed by lbs.
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

    return new Response(
      JSON.stringify(
        isSessionSummary
          ? { feedback: text }
          : { feedback: text, suggestedWeight },
      ),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
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

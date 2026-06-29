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
    const goal: string | null = typeof body.goal === 'string'
      ? body.goal
      : null;
    const heartRateAvgBpm =
      typeof body.heartRateAvgBpm === 'number' ? body.heartRateAvgBpm : null;
    const heartRatePeakBpm =
      typeof body.heartRatePeakBpm === 'number' ? body.heartRatePeakBpm : null;
    const hasHeartRateData = heartRateAvgBpm !== null || heartRatePeakBpm !== null;
    const hrTrend = body.hrTrend && typeof body.hrTrend === 'object'
      ? body.hrTrend as { delta: number; direction: 'up' | 'down'; recentAvg: number }
      : null;
    const avgRecoveryDelta =
      typeof body.avgRecoveryDelta === 'number'
        ? body.avgRecoveryDelta
        : null;

    const sleepHours =
      typeof body.sleepHours === 'number' ? body.sleepHours : null;
    const readinessScore =
      typeof body.readinessScore === 'number' ? body.readinessScore : null;
    const hrvMs =
      typeof body.hrvMs === 'number' ? body.hrvMs : null;
    const restingHeartRate =
      typeof body.restingHeartRate === 'number' ? body.restingHeartRate : null;

    const hasRecoveryData =
      sleepHours !== null ||
      readinessScore !== null ||
      hrvMs !== null ||
      restingHeartRate !== null;

    const buildRecoveryContext = (): string => {
      if (!hasRecoveryData) return '';
      const parts: string[] = [];
      if (sleepHours !== null) parts.push(`Sleep: ${sleepHours}h`);
      if (readinessScore !== null) parts.push(`Readiness: ${readinessScore}/5`);
      if (hrvMs !== null) parts.push(`HRV: ${hrvMs}ms`);
      if (restingHeartRate !== null) parts.push(`Resting HR: ${restingHeartRate}bpm`);
      return `Recovery context: ${parts.join(' | ')}`;
    };

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
    const isPreSession = body.mode === 'pre_session';

    if (isPreSession) {
      const lastSessionSignal =
        typeof body.lastSessionSignal === 'string' ? body.lastSessionSignal : null;
      const recoveryLine = hasRecoveryData ? buildRecoveryContext() : null;

      const preSessionSystemPrompt = `You are Jordan, a direct personal coach giving a pre-session briefing.
Write exactly ONE sentence — maximum 20 words.
Never start with "Great", "Good", "Nice", or any praise.
Never use em-dashes. No markdown.
Reference the athlete's actual data — last session signal and recovery metrics.
Be specific, not generic. Sound like a coach who has reviewed their numbers.`;

      const signalContext = (() => {
        if (lastSessionSignal === 'high_fatigue') return 'Last session ran hot — high RPE, high fatigue.';
        if (lastSessionSignal === 'low_fatigue') return 'Last session had plenty left — low RPE, good energy.';
        if (lastSessionSignal === 'on_target') return 'Last session was well calibrated.';
        return 'No signal from last session.';
      })();

      const preSessionUserContent = `${signalContext}${recoveryLine ? `\n${recoveryLine}` : ''}
Write one pre-session coaching sentence for the athlete.`;

      const preSessionResponse = await fetchAnthropicMessagesWithRetry(() =>
        fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 80,
            system: preSessionSystemPrompt,
            messages: [{ role: 'user', content: preSessionUserContent }],
          }),
        })
      );

      const preSessionData = await preSessionResponse.json();
      const preSessionText = preSessionData.content?.[0]?.text?.trim() ?? null;

      return new Response(
        JSON.stringify({ feedback: preSessionText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

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

    // RPE gap: positive = too easy (logged below target), negative = too hard
    const rpeGap = targetRpeNum2 - loggedRpeNum2;
    const hitTopOfRange = targetRepsMax > 0 && loggedRepsNum >= targetRepsMax;
    const roundedBase = Math.round(loggedWeightNum / 5) * 5;

    // ── Straight set weight suggestion ──
    const straightSuggestedWeight = (() => {
      if (loggedWeightNum <= 0) return null;
      if (isPyramidExercise) return null;
      if (isLastSetOfExercise) return null;
      if (loggedRpeNum2 <= 0) return null;
      // Strength plans: if target weight is prescribed (non-zero),
      // do not auto-adjust — the load is percentage-based, not RPE-derived.
      // Jordan can still comment on RPE but should not change the weight.
      const isWeightPrescribed = targetWeightNum > 0;
      if (isWeightPrescribed && goal === 'strength') return null;

      // Too easy: RPE 2+ below target
      // Aggressive bump when RPE very low, moderate when just a bit low
      if (rpeGap >= 3 && hitTopOfRange) {
        // e.g. target RPE 8, logged RPE 5 at top of rep range → +15
        return roundedBase + 15;
      }
      if (rpeGap >= 2 && hitTopOfRange) {
        // e.g. target RPE 8, logged RPE 6 at top of rep range → +10
        return roundedBase + 10;
      }
      if (rpeGap >= 2) {
        // Hit RPE gap of 2+ but didn't hit top of rep range → +5
        return roundedBase + 5;
      }
      if (rpeGap >= 1 && hitTopOfRange) {
        // e.g. target RPE 7, logged RPE 6 at top of rep range → +5
        return roundedBase + 5;
      }

      // Too hard: fell more than 1 RPE above target
      if (rpeGap <= -2) {
        return Math.max(5, roundedBase - 5);
      }

      // On target (gap within ±1): hold same weight
      // Still populate next set so it doesn't stay blank
      return roundedBase;
    })();

    // ── Pyramid set weight suggestion ──
    // For pyramids, Jordan computes what the NEXT set should be
    // based on RPE gap from this set's target. The pyramid weight
    // ladder is pre-programmed, but if RPE signals the ladder is
    // wrong we adjust the next step.
    const pyramidSuggestedWeight = (() => {
      if (!isPyramidExercise) return null;
      if (isLastSetOfExercise) return null;
      if (loggedWeightNum <= 0) return null;
      if (loggedRpeNum2 <= 0) return null;

      // Pyramid sets escalate weight each set. The standard ladder
      // adds roughly 10-15% per step. If RPE is way off, we nudge
      // the next step accordingly.
      // Base next-set estimate: logged weight + standard pyramid step
      const standardStep = Math.round(loggedWeightNum * 0.1 / 5) * 5;
      const nextSetBase = roundedBase + standardStep;

      if (rpeGap >= 3) {
        // Way too easy — jump more aggressively
        return Math.round((roundedBase + standardStep * 1.5) / 5) * 5;
      }
      if (rpeGap >= 2) {
        // Too easy — normal jump is fine, maybe slightly more
        return Math.round((roundedBase + standardStep * 1.2) / 5) * 5;
      }
      if (rpeGap >= 1) {
        // Slightly easy — standard step
        return nextSetBase;
      }
      if (rpeGap >= -1 && rpeGap <= 1) {
        // On target — standard pyramid step, still give the number
        return nextSetBase;
      }
      if (rpeGap <= -2) {
        // Too hard — next pyramid step should be smaller
        return Math.max(5, Math.round((roundedBase + standardStep * 0.5) / 5) * 5);
      }

      return null;
    })();

    const suggestedWeight = isPyramidExercise
      ? pyramidSuggestedWeight
      : straightSuggestedWeight;

    const setPositionContext = isLastExercise
      ? 'This is the LAST SET of the LAST EXERCISE. The session is done after this.'
      : isLastSetOfExercise
        ? 'This is the LAST SET of this exercise. Next is a different exercise.'
        : 'This is a mid-exercise set. More sets of this exercise are coming.';

    const isStrengthPrescribed =
      goal === 'strength' && targetWeightNum > 0;

    const forwardOrientRule = isLastExercise
      ? `- Session is complete after this set. Reference what the data showed and what it means for next session. Do NOT say "next set".`
      : isLastSetOfExercise
        ? `- This exercise is done. Orient toward the next exercise or the rest of the session. Do NOT say "next set of this exercise".`
        : isPyramidExercise && suggestedWeight != null
          ? `- This is a pyramid set building to a heavy top set. The athlete's RPE on this set was ${loggedRpeNum2} against a target of ${targetRpeNum2}. You MUST include the phrase "try ${suggestedWeight} lbs" for the next set. Frame it as a specific coaching adjustment. One sentence only.`
          : isPyramidExercise && rpeGap >= -1 && rpeGap <= 1
            ? `- This is a pyramid set and RPE is on target. The next set is heavier by design. Tell them what to expect. Do NOT mention any specific weight.`
            : isPyramidExercise && rpeGap <= -2
              ? `- This is a pyramid set but RPE ran above target. You MUST include the phrase "try ${suggestedWeight ?? Math.max(5, roundedBase - 5)} lbs" for the next set. One sentence only.`
              : isStrengthPrescribed
                ? `- This is a strength plan with prescribed loads. Do NOT suggest a different weight. Orient toward execution quality on the next set — brace, timing, bar path, or position cues only. One sentence.`
                : suggestedWeight != null
                  ? `- A weight adjustment is warranted. You MUST include the phrase "try ${suggestedWeight} lbs" in your response. Frame it as a coaching directive.`
                  : `- Orient toward the next set of this exercise. Be specific about what to adjust or maintain.`;

    const perSetSystemPrompt = `${perSetToneInstruction}

You are Jordan, a direct and knowledgeable personal coach. The athlete just logged a set.

CRITICAL CONTEXT: ${setPositionContext}

STYLE RULE: Never use em-dashes (—). Use periods or commas instead.

Rules:
- CRITICAL OUTPUT RULE: Your response is delivered directly to an athlete in a fitness app. It must be ONE sentence of coaching. Never output your reasoning, rule-checking, or self-correction process under any circumstances. Banned patterns (any variation of these terminates your response and restarts it internally — NEVER show them): "Wait", "Let me", "I need to", "Re-read", "Rules check", "Let me check", "Actually", "On second thought", "The rule says", "I must", "They already", "per the rules", "according to", or ANY meta-commentary about your own instructions. If you catch yourself writing any of these, stop immediately and output only the final coaching sentence. The user never sees your reasoning. Ever.
- ONE sentence only. Never two.
- Never start with 'Great', 'Good', 'Nice', 'Well done', or any praise word.
${forwardOrientRule}
- RPE too low (target was 7+, hit top of rep range): orient toward next set or next exercise. Do NOT suggest a weight number.
- RPE on target (within 1 point): confirm and orient forward.
- RPE too high (fell short on reps): give a recovery or execution cue. Do NOT suggest a weight number.
- Fell short on reps without clear RPE data: be honest, tell them what to focus on.
- HR data may be provided. Only mention HR when there is a STRONG contradiction with logged RPE:
  * High HR (avg > 150 bpm) AND low RPE (≤ 5): user is underestimating effort — flag briefly
  * Low HR (avg < 110 bpm) AND high RPE (≥ 8): normal for heavy strength work — do NOT mention it, this is expected
  * HR between 110-150 bpm: never mention regardless of RPE — this is normal working range
  * If no strong contradiction exists, do not mention HR at all
  * Never mention HR on the last set of the last exercise — session is done, forward focus only
  * Never mention HR when no HR data is provided
- Recovery context (sleep, readiness, HRV, resting HR) may be provided. Use it ONLY when it is directly relevant to the set just logged — e.g. low sleep + high RPE on a normally easy exercise warrants a brief mention. Do not mention recovery metrics on every set. When you do reference them, be specific: "7h sleep but RPE running high — back off next set" not generic wellness advice. Never mention metrics that weren't provided.
- NEVER mention a specific weight in lbs unless the forwardOrientRule above explicitly tells you to include "try X lbs". If no weight was specified in your instructions, do not mention any number followed by lbs.
- Never mention being an AI.
- No markdown.`;

    const systemPrompt = isSessionSummary
      ? `You are Jordan, the athlete's personal coach. The athlete just finished a workout session.
Write exactly TWO sentences.

CRITICAL OUTPUT RULE: Your response is delivered directly to an athlete in a fitness app. It must be TWO sentences of coaching. Never output your reasoning, rule-checking, or self-correction process under any circumstances. Banned patterns (any variation of these terminates your response and restarts it internally — NEVER show them): "Wait", "Let me", "I need to", "Re-read", "Rules check", "Let me check", "Actually", "On second thought", "The rule says", "I must", "They already", "per the rules", "according to", or ANY meta-commentary about your own instructions. If you catch yourself writing any of these, stop immediately and output only the final coaching sentences. The user never sees your reasoning. Ever.

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
- Recovery context (sleep, readiness, HRV, resting HR) may be provided. Use it ONLY when it directly explains session performance patterns — e.g. low sleep and high session RPE. Do not mention recovery metrics unless they clarify what happened. Never mention metrics that weren't provided.
- HR trend data may be provided (delta vs recent sessions). Use it ONLY when meaningful:
  * HR trending DOWN at same/higher load = fitness adaptation — worth calling out specifically ("your HR is running lower at the same load — that's adaptation")
  * HR trending UP with no load change = accumulated fatigue or poor recovery — mention briefly
  * No trend data or delta < 5 bpm: do not mention HR trend
  * Never fabricate trend data. Only use what is explicitly provided.
- Intra-session HR recovery may be provided (avg bpm drop between sets during rest):
  * ≥ 50 bpm: strong cardiovascular recovery — mention only if it meaningfully
    contrasts with high RPE or high fatigue rating. Example: "Your HR recovered
    well between sets despite the high RPE — fitness is keeping up."
  * 25-49 bpm: adequate — do NOT mention
  * < 25 bpm: slow recovery — mention briefly if RPE also ran high or fatigue
    rating was 1-2. Example: "HR recovery between sets was slow — rest periods
    may need extending next session."
  * Never mention specific bpm numbers to the user
  * Never mention recovery if avgRecoveryDelta was not provided
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
${loggedRpeNum > 0 ? `Average RPE: ${loggedRpeNum} (target was ${targetRpeNum})` : 'RPE not recorded this session'}.${
  heartRateAvgBpm !== null ? `\nSession HR: avg ${heartRateAvgBpm} bpm${heartRatePeakBpm !== null ? `, peak ${heartRatePeakBpm} bpm` : ''}.` : ''
}${
  hrTrend !== null
    ? `\nHR trend vs last 2 sessions: ${hrTrend.direction === 'down'
        ? `${Math.abs(hrTrend.delta)} bpm lower (was avg ${hrTrend.recentAvg} bpm) — same or higher load`
        : `${Math.abs(hrTrend.delta)} bpm higher (was avg ${hrTrend.recentAvg} bpm)`}.`
    : ''
}${avgRecoveryDelta !== null
  ? `\nIntra-session HR recovery (avg bpm drop between sets): ${avgRecoveryDelta} bpm`
  : ''}${planContextLine}${hasRecoveryData ? `\n${buildRecoveryContext()}` : ''}
Give a 2-sentence session debrief.
- If HR trended DOWN meaningfully: call it out as adaptation in sentence 1
- If HR trended UP: note accumulated fatigue if RPE also ran high
- If no trend: ignore HR unless strong RPE contradiction
- Never mention HR if RPE unrecorded`
      : `Exercise: ${exerciseName}
Target: ${targetReps} reps at ${targetWeight} lbs, RPE ${targetRpe}
Logged: ${loggedReps} reps at ${loggedWeight} lbs, RPE ${loggedRpe}${
  hasHeartRateData
    ? `\nHR this set: avg ${heartRateAvgBpm ?? '—'} bpm, peak ${heartRatePeakBpm ?? '—'} bpm (only mention if strong RPE contradiction per rules above)`
    : ''
}${
  hasRecoveryData
    ? `\n${buildRecoveryContext()}`
    : ''
}
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
        model: 'claude-sonnet-4-6',
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

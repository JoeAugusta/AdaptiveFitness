// SETUP REQUIRED:
// Run this once in your terminal to set the API key as a Supabase secret:
//   supabase secrets set ANTHROPIC_API_KEY=your_key_here
// Never commit your API key. Never put it in .env for client use.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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

function parseMidReps(reps: string): number {
  const parts = reps.split('-');
  if (parts.length === 2) {
    return (parseInt(parts[0]) + parseInt(parts[1])) / 2;
  }
  return parseInt(reps) || 0;
}

/** Session-wide average RPE from all logged sets (for deload interpretation). */
function calculateAvgRpeFromLogs(logs: any[]): number {
  let sum = 0;
  let n = 0;
  for (const log of logs) {
    const setsJson = log.sets_json ?? [];
    if (!Array.isArray(setsJson)) continue;
    for (const set of setsJson) {
      const r = Number(set.rpe ?? set.loggedRpe ?? 0);
      if (r > 0) {
        sum += r;
        n++;
      }
    }
  }
  return n > 0 ? sum / n : 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, planId, weekNumber } = await req.json();

    if (!userId || !planId || weekNumber == null) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, planId, weekNumber' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    // Step 1 — Fetch plan row and workout_logs from Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const [planResult, logsResult] = await Promise.all([
      supabase.from('plans').select('plan_json, goal_id').eq('id', planId).single(),
      supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_id', planId)
        .eq('week_number', weekNumber),
    ]);

    if (planResult.error) throw new Error(`Failed to fetch plan: ${planResult.error.message}`);
    if (logsResult.error) throw new Error(`Failed to fetch workout logs: ${logsResult.error.message}`);

    const planJson = planResult.data.plan_json;
    const logs = logsResult.data ?? [];

    // Fetch goal type
    let goalType = planJson.goal ?? 'general';
    if (planResult.data.goal_id) {
      const { data: goalRow } = await supabase
        .from('goals')
        .select('goal_type')
        .eq('id', planResult.data.goal_id)
        .single();
      if (goalRow?.goal_type) goalType = goalRow.goal_type;
    }

    // Build exercise id → name map from all weeks in plan_json
    const exerciseMap: Record<string, string> = {};
    for (const week of planJson.weeks ?? []) {
      for (const day of week.days ?? []) {
        for (const ex of day.exercises ?? []) {
          if (ex.id && ex.name) {
            exerciseMap[ex.id] = ex.name;
          }
        }
      }
    }

    // Step 2 — Find the matching week and extract workout day targets
    const weekData = (planJson.weeks ?? []).find((w: any) => w.weekNumber === weekNumber);
    const workoutDays = (weekData?.days ?? []).filter((d: any) => d.type === 'workout');
    const daysPerWeek: number = planJson.daysPerWeek ?? workoutDays.length;

    type ExerciseTarget = { targetWeight: number; targetRpe: number; targetReps: number };
    const prescribedMap: Record<string, ExerciseTarget> = {};
    for (const day of workoutDays) {
      for (const ex of day.exercises ?? []) {
        prescribedMap[ex.name] = {
          targetWeight: ex.targetWeight ?? 0,
          targetRpe: ex.targetRpe ?? 0,
          targetReps: parseMidReps(ex.reps ?? '0'),
        };
      }
    }

    // Step 3 — Compute performance metrics
    const sessionsCompleted = new Set(logs.map((l: any) => l.day_number)).size;
    const sessionsPlanned = daysPerWeek;
    const completionRate = sessionsPlanned > 0 ? sessionsCompleted / sessionsPlanned : 0;

    const fatigueRatings = logs
      .map((l: any) => l.session_fatigue_rating)
      .filter((r: any) => r != null && !isNaN(Number(r)))
      .map(Number);
    const avgFatigueRating =
      fatigueRatings.length > 0
        ? fatigueRatings.reduce((a: number, b: number) => a + b, 0) / fatigueRatings.length
        : 0;

    const exercisesOverPerformed: string[] = [];
    const exercisesUnderPerformed: string[] = [];
    const exercisesTooLight: string[] = []; // completed with very low RPE
    const prsHit: string[] = [];
    const rpeDeltas: number[] = [];

    type ActualData = {
      totalWeight: number;
      totalReps: number;
      totalRpe: number;
      count: number;
      maxWeight: number;
    };
    const actualMap: Record<string, ActualData> = {};

    for (const log of logs) {
      const setsJson: any[] = log.sets_json ?? [];
      for (const set of setsJson) {
        // FIX: resolve name via exerciseId map first, then fallbacks
        const name: string =
          (set.exerciseId ? exerciseMap[set.exerciseId] : null) ??
          set.exerciseName ??
          set.name ??
          '';
        if (!name) continue;
        if (!actualMap[name]) {
          actualMap[name] = { totalWeight: 0, totalReps: 0, totalRpe: 0, count: 0, maxWeight: 0 };
        }
        // FIX: use weightLbs (the actual field name in sets_json), not weight
        const weight = Number(set.weightLbs ?? set.weight ?? set.loggedWeight ?? 0);
        const reps = Number(set.reps ?? set.loggedReps ?? 0);
        const rpe = Number(set.rpe ?? set.loggedRpe ?? 0);
        actualMap[name].totalWeight += weight;
        actualMap[name].totalReps += reps;
        actualMap[name].totalRpe += rpe;
        actualMap[name].count += 1;
        if (weight > actualMap[name].maxWeight) actualMap[name].maxWeight = weight;
      }
    }

    for (const [name, actual] of Object.entries(actualMap)) {
      const prescribed = prescribedMap[name];
      if (!prescribed) continue;

      const avgReps = actual.count > 0 ? actual.totalReps / actual.count : 0;
      const avgWeight = actual.count > 0 ? actual.totalWeight / actual.count : 0;
      const avgRpe = actual.count > 0 ? actual.totalRpe / actual.count : 0;

      // Over-performed: exceeded reps or weight targets
      if (avgReps > prescribed.targetReps * 1.1 || avgWeight > prescribed.targetWeight * 1.05) {
        exercisesOverPerformed.push(name);
      }

      // Under-performed: fell short on reps or weight
      if (
        avgReps < prescribed.targetReps * 0.85 ||
        avgWeight < prescribed.targetWeight * 0.9
      ) {
        exercisesUnderPerformed.push(name);
      }

      // Too light: completed sets but RPE was well below target
      // This means the weight needs to go UP, NOT that it was a bad week
      if (prescribed.targetRpe > 0 && avgRpe > 0 && avgRpe <= prescribed.targetRpe - 2) {
        exercisesTooLight.push(name);
      }

      if (actual.maxWeight > prescribed.targetWeight * 1.05) {
        prsHit.push(name);
      }

      // RPE delta: positive = harder than target, negative = easier than target
      if (prescribed.targetRpe > 0 && avgRpe > 0) {
        rpeDeltas.push(avgRpe - prescribed.targetRpe);
      }
    }

    const stagnantExercises = Object.entries(actualMap)
      .filter(([name, actual]) => {
        const prescribed = prescribedMap[name];
        if (!prescribed || actual.count === 0) return false;
        const avgWeight = actual.totalWeight / actual.count;
        const rpeOnTarget = actual.totalRpe / actual.count;
        return (
          avgWeight === prescribed.targetWeight &&
          rpeOnTarget >= prescribed.targetRpe - 1 &&
          rpeOnTarget <= prescribed.targetRpe + 1
        );
      })
      .map(([name]) => name);

    const avgRpeVsTarget =
      rpeDeltas.length > 0
        ? rpeDeltas.reduce((a, b) => a + b, 0) / rpeDeltas.length
        : 0;

    const rpeDataRecorded = rpeDeltas.length > 0;
    const isDeloadWeek =
      String(weekData?.phase ?? '').toLowerCase() === 'deload';
    const avgLoggedRpe = calculateAvgRpeFromLogs(logs);

    // Determine performance rating correctly
    // Negative avgRpeVsTarget = weights were too light = NOT a tough week
    let derivedRating: 'strong' | 'on-track' | 'tough-week';
    if (completionRate < 0.6) {
      derivedRating = 'tough-week'; // missed too many sessions
    } else if (avgRpeVsTarget > 1.5 && exercisesUnderPerformed.length > 2) {
      derivedRating = 'tough-week'; // genuinely struggled
    } else if (avgRpeVsTarget < -1 || exercisesTooLight.length > 2) {
      derivedRating = 'on-track'; // easy week — weights need adjustment, not a failure
    } else if (completionRate >= 0.8 && avgRpeVsTarget >= -1 && avgRpeVsTarget <= 1.5) {
      derivedRating = 'strong'; // completed sessions, RPE on target
    } else {
      derivedRating = 'on-track';
    }

    const metrics = {
      sessionsCompleted,
      sessionsPlanned,
      completionRate: Math.round(completionRate * 100) / 100,
      avgFatigueRating: Math.round(avgFatigueRating * 10) / 10,
      exercisesOverPerformed,
      exercisesUnderPerformed,
      exercisesTooLight,
      stagnantExercises,
      prsHit,
      avgRpeVsTarget: Math.round(avgRpeVsTarget * 10) / 10,
      rpeDataRecorded, // true = user logged RPE, false = no RPE data
      isDeloadWeek,
      avgLoggedRpe: Math.round(avgLoggedRpe * 10) / 10,
      derivedRating, // pre-calculated — Claude should use this as the basis
    };

    const completedWeeks =
      (planJson as { currentWeek?: number }).currentWeek ?? weekNumber ?? 1;
    const toneTier = getJordanToneTier(completedWeeks);
    const summaryToneInstructionMap: Record<string, string> = {
      newcomer: `JORDAN SUMMARY TONE — NEW:
This is one of the athlete's first weekly reviews. Be clear and encouraging.
- Explain what the data means in plain terms (what does avg RPE 7.2 tell us?)
- Acknowledge that Week 1-2 is calibration — variability is expected
- End with a specific, concrete forward action for next week
- Warm tone. This is the review that determines whether they trust the system.`,

      building: `JORDAN SUMMARY TONE — BUILDING:
The athlete is starting to see results. Reference their actual numbers freely.
- Compare this week to last week with specific figures
- Acknowledge momentum if it exists — or name the stall if it doesn't
- Less explanation, more observation
- End with a specific adaptation and why it's happening`,

      established: `JORDAN SUMMARY TONE — ESTABLISHED:
The athlete has enough history to see patterns. Reference them.
- Lead with the most significant data point of the week
- Reference multi-week trends where they exist
- No boilerplate — every sentence should contain information specific to this athlete
- Tone: a coach who knows their athlete well and respects their time`,

      veteran: `JORDAN SUMMARY TONE — VETERAN:
Data-first, peer-level review. This athlete doesn't need hand-holding.
- Open with the most important number of the week, no preamble
- Reference the full arc of their training where relevant
- Observations over encouragement — they've earned directness
- If something went wrong, say it plainly and say what changes
- Maximum density. Every sentence earns its place.`,
    };
    const summaryToneInstruction =
      summaryToneInstructionMap[toneTier] ?? summaryToneInstructionMap.newcomer;

    const deloadPerformanceOverrideBlock = isDeloadWeek
      ? `

DELOAD WEEK PERFORMANCE OVERRIDE:
THIS WAS A DELOAD WEEK (phase on plan). Override all normal completion-based performance rating logic for deload weeks.

Rate deload execution using avgLoggedRpe from the metrics (average RPE across all logged sets this week):
- avgLoggedRpe <= 7: Deload executed well — recovery is on track for next week. Appropriate headline and performanceRating.
- avgLoggedRpe > 7: Deload ran too hot — effort was higher than intended. The point of a deload is to let the body recover. High RPE in a deload week means the recovery benefit is reduced. performanceSummary must reflect this honestly; do NOT praise "consistency" or completion if sets were crushed at RPE 9.

Do NOT reference session completion rate as a positive when avgLoggedRpe > 7 in a deload week. Completing every set at RPE 9 in a deload is poor execution, not good consistency.
`
      : '';

    // Step 4 — Call Claude API
    const claudeResponse = await fetchAnthropicMessagesWithRetry(() =>
      fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: `${summaryToneInstruction}

You are Jordan, the athlete's personal coach. You have their full week of training data. Write their weekly debrief.

Your response must be a JSON object with these exact fields:
{
  "headline": "One punchy sentence summarising the week. No filler.",
  "performanceRating": "strong | on-track | tough-week",
  "highlights": ["Array of 2-3 strings. Each is a specific win with real numbers. No generic statements."],
  "performanceSummary": "2-3 sentences. Jordan's honest read of the week. Reference specific exercises and numbers.",
  "nextWeekChanges": "2-3 sentences. What Jordan is changing and exactly why. Reference the performance data.",
  "nutritionCheckin": "1-2 sentences on macro targets. Keep brief.",
  "motivationalNote": "1-2 sentences. Specific to the user's goal. Forward-looking. End with '— Jordan'."
}

Tone rules:
- Write as Jordan in first person throughout
- Reference actual weights, reps, and RPE from the data
- Never use filler praise like 'Great job!', 'Keep it up!', 'Well done!', or 'Fantastic work!'
- The sign-off '— Jordan' appears only at the end of motivationalNote, nowhere else
- Return only valid JSON, no markdown, no prose outside the JSON`,
        messages: [
          {
            role: 'user',
            content: `Generate a weekly coach debrief for Week ${weekNumber}.
Goal type: ${goalType}
Performance metrics:
${JSON.stringify(metrics, null, 2)}
${deloadPerformanceOverrideBlock}
CRITICAL INTERPRETATION RULES — you must follow this exactly:

RPE deltas (only when rpeDataRecorded is true):
- avgRpeVsTarget = (actual RPE) minus (target RPE)
  - NEGATIVE value means weights were TOO LIGHT — the athlete found it easy. 
    This means weights need to go UP next week. This is NOT a tough week.
    A negative avgRpeVsTarget with all sessions completed should be "on-track" or "strong".
  - POSITIVE value means the athlete worked harder than planned.
    If reps were still hit: weights are appropriate or slightly heavy — "strong" or "on-track".
    If reps were missed AND RPE was high: weights were too heavy — "tough-week".
  - Near zero: perfectly calibrated.

- exercisesTooLight = exercises where RPE was 2+ points below target.
  These INCREASE in weight next week. Do NOT treat this as underperformance.

- derivedRating is pre-calculated from the data. Use it as the basis for performanceRating
  unless your analysis of the full data clearly contradicts it.

- NEVER use "tough-week" just because RPE was low. Low RPE = easy = good compliance.
  "tough-week" is reserved for: missed sessions, missed rep targets with HIGH RPE, or injury.

- rpeDataRecorded: if false, the user did NOT log RPE this week.
  Do NOT say "RPE was on target" or reference RPE performance.
  Instead acknowledge that RPE data was not captured and note that
  logging RPE each set will improve the accuracy of next week's plan.
  Base the rating on completion rate and fatigue only.

- isDeloadWeek: if true, this was a planned deload week (see plan phase).
  Follow DELOAD WEEK PERFORMANCE OVERRIDE above when present — it takes
  precedence over this bullet and over derivedRating for how to judge the week.
  When avgLoggedRpe <= 7: acknowledge reduced loads were intentional and
  recovery is on track; nextWeekChanges can reference full loads resuming.
  When avgLoggedRpe > 7: do not treat completion rate or "showing up" as the win.

- stagnantExercises: exercises where weight matched target exactly
  and RPE was on target. If this list has 3+ exercises, mention in
  nextWeekChanges that exercise variations may be introduced to
  provide fresh stimulus.

Return ONLY this exact JSON structure with no other text:
{
  "weekNumber": ${weekNumber},
  "performanceRating": "strong" | "on-track" | "tough-week",
  "headline": string,
  "highlights": string[],
  "performanceSummary": string,
  "nextWeekChanges": string,
  "nutritionCheckin": string,
  "motivationalNote": string
}`,
          },
        ],
      }),
    })
    );

    if (claudeResponse.status === 503) {
      return new Response(await claudeResponse.text(), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const claudeData = await claudeResponse.json();

    if (!claudeResponse.ok) {
      throw new Error(`Claude API error: ${claudeData.error?.message ?? 'unknown'}`);
    }

    const text: string = claudeData.content?.[0]?.text ?? '';

    // Step 5 — Parse Claude JSON and return
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Claude response');

    let summary: unknown;
    try {
      summary = JSON.parse(jsonMatch[0]);
    } catch (e) {
      throw new Error('JSON parse failed: ' + String(e));
    }

    // Save summary to weekly_summaries using service role
    const { error: saveError } = await supabase
      .from('weekly_summaries')
      .upsert(
        {
          user_id: userId,
          plan_id: planId,
          week_number: weekNumber,
          summary_json: summary,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,plan_id,week_number' },
      );

    if (saveError) {
      console.error('weekly_summaries upsert error:', saveError);
      // Non-critical — still return the summary to the client
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('weekly-coach-summary error:', String(error));
    return new Response(JSON.stringify({ error: String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

// DEPLOY:
// supabase functions deploy weekly-coach-summary
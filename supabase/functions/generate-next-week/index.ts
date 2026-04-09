// SETUP REQUIRED:
// Run this once in your terminal to set the API key as a Supabase secret:
//   supabase secrets set ANTHROPIC_API_KEY=your_key_here
// Never commit your API key. Never put it in .env for client use.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COMPOUND_KEYWORDS = ['squat', 'deadlift', 'bench press', 'row', 'press', 'lunge', 'hip thrust'];

function isCompound(name: string): boolean {
  const lower = name.toLowerCase();
  return COMPOUND_KEYWORDS.some((kw) => lower.includes(kw));
}

function parseMidReps(reps: string): number {
  const parts = reps.split('-');
  if (parts.length === 2) {
    return (parseInt(parts[0]) + parseInt(parts[1])) / 2;
  }
  return parseInt(reps) || 0;
}

function parseMinReps(reps: string): number {
  const parts = reps.split('-');
  return parseInt(parts[0]) || 0;
}

function roundTo2_5(value: number): number {
  return Math.round(value / 2.5) * 2.5;
}

type LogSetLike = {
  exerciseId?: string;
  exerciseName?: string;
  name?: string;
  weightLbs?: number;
  weight?: number;
  reps?: number;
  rpe?: number | null;
};

function collectSetsForExercise(
  logs: { sets_json?: LogSetLike[] | null }[],
  exerciseMap: Record<string, string>,
  targetName: string,
): LogSetLike[] {
  const out: LogSetLike[] = [];
  for (const log of logs) {
    const setsJson = log.sets_json ?? [];
    if (!Array.isArray(setsJson)) continue;
    for (const set of setsJson) {
      const resolvedName: string =
        (set.exerciseId ? exerciseMap[set.exerciseId] : '') ||
        String(set.exerciseName ?? '') ||
        String(set.name ?? '');
      if (resolvedName !== targetName) continue;
      out.push(set);
    }
  }
  return out;
}

/** Average of logged working weights (sets_json uses weightLbs). */
function calculateAvgLoggedWeight(sets: LogSetLike[]): number {
  if (!sets || sets.length === 0) return 0;
  const weights = sets
    .filter((s) => s.weightLbs != null && Number(s.weightLbs) > 0)
    .map((s) => Number(s.weightLbs));
  if (weights.length === 0) return 0;
  return weights.reduce((a, b) => a + b, 0) / weights.length;
}

function calculateIncrease(
  currentWeight: number,
  avgRpe: number,
  targetRpe: number,
  trainingAge: string,
  compound: boolean,
): number {
  const rpeGap = avgRpe - targetRpe; // negative = too light

  // Base percentage by RPE gap
  let basePct: number;
  if (rpeGap <= -4) {
    basePct = 0.10; // Way too light — +10%
  } else if (rpeGap <= -2) {
    basePct = 0.05; // Too light — +5%
  } else {
    basePct = 0; // On target — use standard increment
  }

  // Training age multiplier
  let multiplier: number;
  if (trainingAge === 'beginner') {
    multiplier = 1.3; // Beginners adapt faster — larger jumps
  } else if (trainingAge === 'advanced') {
    multiplier = 0.7; // Advanced athletes near ceiling — smaller jumps
  } else {
    multiplier = 1.0; // Intermediate — base percentage
  }

  // If RPE is near target, use standard fixed increment
  if (basePct === 0) {
    return compound ? 2.5 : 1.0;
  }

  // Calculate percentage-based increase
  const rawIncrease = currentWeight * basePct * multiplier;

  // Round to nearest 2.5 lbs
  const rounded = Math.round(rawIncrease / 2.5) * 2.5;

  // Minimum increase of 2.5 lbs — never less
  const withMinimum = Math.max(2.5, rounded);

  // Cap at 12% of current weight — safety ceiling
  const cap = Math.round((currentWeight * 0.12) / 2.5) * 2.5;
  return Math.min(withMinimum, cap);
}

/** Keep day numbers, rest/workout layout, titles, muscleGroups from the week that was completed. */
function mergeNextWeekWithPreviousStructure(
  previousWeek: { days?: any[] } | undefined,
  claudeWeek: any,
  weekNumber: number,
  phase: string,
): any {
  const prevDays = previousWeek?.days ?? [];
  if (prevDays.length === 0) {
    return { ...claudeWeek, weekNumber, phase };
  }
  const aiDays = Array.isArray(claudeWeek?.days) ? claudeWeek.days : [];
  const mergedDays = prevDays.map((prevDay: any, i: number) => {
    const aiDay = aiDays[i] ?? {};
    if (prevDay.type === 'rest') {
      return {
        ...prevDay,
        dayNumber: prevDay.dayNumber,
        type: 'rest',
        sessionFocus: '',
        exercises: [],
      };
    }
    return {
      ...prevDay,
      dayNumber: prevDay.dayNumber,
      type: 'workout',
      sessionFocus:
        typeof aiDay.sessionFocus === 'string'
          ? aiDay.sessionFocus
          : (prevDay.sessionFocus ?? ''),
      exercises: Array.isArray(aiDay.exercises) ? aiDay.exercises : (prevDay.exercises ?? []),
    };
  });
  return {
    ...claudeWeek,
    weekNumber,
    phase,
    days: mergedDays,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, planId, completedWeekNumber } = await req.json();

    if (!userId || !planId || completedWeekNumber == null) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, planId, completedWeekNumber' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Step 1 — Fetch all required data in parallel
    const [planResult, logsResult, profileResult] = await Promise.all([
      supabase
        .from('plans')
        .select('id, plan_json, current_week, total_weeks, goal_id')
        .eq('id', planId)
        .single(),
      supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_id', planId)
        .eq('week_number', completedWeekNumber),
      supabase
        .from('user_profiles')
        .select('training_age, weight_lbs, equipment')
        .eq('user_id', userId)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (planResult.error) throw new Error(`Failed to fetch plan: ${planResult.error.message}`);
    if (logsResult.error) throw new Error(`Failed to fetch logs: ${logsResult.error.message}`);

    const plan = planResult.data;
    const planJson = plan.plan_json;
    const logs = logsResult.data ?? [];
    const profile = profileResult.data;
    const trainingAge: string = profile?.training_age ?? 'intermediate';

    // Fetch goal type via goal_id
    let goalType = 'general';
    if (plan.goal_id) {
      const { data: goalRow } = await supabase
        .from('goals')
        .select('goal_type')
        .eq('id', plan.goal_id)
        .single();
      if (goalRow?.goal_type) goalType = goalRow.goal_type;
    }

    const totalWeeks: number = plan.total_weeks ?? planJson.totalWeeks ?? 12;

    // Step 2 — Guard checks
    if (completedWeekNumber >= totalWeeks) {
      return new Response(
        JSON.stringify({ status: 'plan_complete' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (plan.current_week !== completedWeekNumber) {
      return new Response(
        JSON.stringify({ status: 'already_advanced' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Step 3 — Extract completed week data from plan_json
    const weekData = (planJson.weeks ?? []).find((w: any) => w.weekNumber === completedWeekNumber);
    const workoutDays = (weekData?.days ?? []).filter((d: any) => d.type === 'workout');
    const daysPerWeek: number = planJson.daysPerWeek ?? workoutDays.length;

    const priorWeeksData = (planJson.weeks ?? [])
      .filter(
        (w: any) =>
          w.weekNumber >= completedWeekNumber - 2 &&
          w.weekNumber < completedWeekNumber,
      )
      .sort((a: any, b: any) => a.weekNumber - b.weekNumber);

    // Build exercise map from plan_json for name resolution
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

    type PrescribedEx = {
      targetWeight: number;
      targetRpe: number;
      targetReps: number;
      minReps: number;
      sets: number;
      reps: string;
    };
    const prescribedMap: Record<string, PrescribedEx> = {};
    for (const day of workoutDays) {
      for (const ex of day.exercises ?? []) {
        prescribedMap[ex.name] = {
          targetWeight: ex.targetWeight ?? 0,
          targetRpe: ex.targetRpe ?? 0,
          targetReps: parseMidReps(ex.reps ?? '0'),
          minReps: parseMinReps(ex.reps ?? '1'),
          sets: ex.sets ?? 3,
          reps: ex.reps ?? '8-10',
        };
      }
    }

    const weightHistoryMap: Record<string, number[]> = {};
    const plateauedExercises = new Set<string>();

    for (const priorWeek of priorWeeksData) {
      for (const day of (priorWeek.days ?? []).filter((d: any) => d.type === 'workout')) {
        for (const ex of day.exercises ?? []) {
          if (!weightHistoryMap[ex.name]) weightHistoryMap[ex.name] = [];
          weightHistoryMap[ex.name].push(ex.targetWeight ?? 0);
        }
      }
    }

    for (const [name, prescribed] of Object.entries(prescribedMap)) {
      if (!weightHistoryMap[name]) weightHistoryMap[name] = [];
      weightHistoryMap[name].push(prescribed.targetWeight);
    }

    // Step 4 — Compute performance metrics
    const distinctDays = new Set(logs.map((l: any) => l.day_number)).size;
    const sessionsCompleted = distinctDays;
    const sessionsPlanned = daysPerWeek;
    const completionRate = sessionsPlanned > 0 ? sessionsCompleted / sessionsPlanned : 0;

    let completionTier: 'full' | 'partial' | 'low';
    if (completionRate >= 0.8) completionTier = 'full';
    else if (completionRate >= 0.6) completionTier = 'partial';
    else completionTier = 'low';

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
        // Resolve exercise name — try exerciseId lookup first, then fallbacks
        const name: string =
          (set.exerciseId ? exerciseMap[set.exerciseId] : null) ??
          set.exerciseName ??
          set.name ??
          '';
        if (!name) continue;
        if (!actualMap[name]) {
          actualMap[name] = { totalWeight: 0, totalReps: 0, totalRpe: 0, count: 0, maxWeight: 0 };
        }
        // FIX: use weightLbs (the actual field name in sets_json) not weight
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

    // Build exercise adaptations
    const exerciseAdaptations: any[] = [];

    for (const [name, prescribed] of Object.entries(prescribedMap)) {
      const actual = actualMap[name];
      const avgReps = actual && actual.count > 0 ? actual.totalReps / actual.count : 0;
      const avgRpe = actual && actual.count > 0 ? actual.totalRpe / actual.count : 0;
      const compound = isCompound(name);
      const hasRpeData = avgRpe > 0;
      const priorTargetWeight = prescribed.targetWeight ?? 0;
      const isNonStrengthGoal = goalType !== 'strength';
      const priorWasSelfSelect = isNonStrengthGoal && priorTargetWeight === 0;

      let weightAction: 'increase' | 'decrease' | 'hold';
      let weightDelta: number;
      let newTargetWeight: number;
      let selfSelectCoachingNote: string | undefined;
      let effectiveOldWeight = prescribed.targetWeight;

      if (priorWasSelfSelect) {
        const exerciseSets = collectSetsForExercise(logs, exerciseMap, name);
        const avgLoggedWeight = calculateAvgLoggedWeight(exerciseSets);
        const rawPrior = prescribed.targetWeight;

        console.log('[weight adaptation]', {
          exerciseName: name,
          priorTargetWeight: rawPrior ?? 0,
          avgLoggedWeight,
          hasRpeData,
          setsCount: exerciseSets.length,
          rawSets: exerciseSets.map((s) => ({
            w: s.weightLbs,
            r: s.reps,
            rpe: s.rpe,
          })),
        });

        const rpeIsLow = hasRpeData && avgRpe <= 6;
        const rpeIsHigh = hasRpeData && avgRpe >= 9;
        const tr = prescribed.targetRpe;
        const baseWeight = roundTo2_5(avgLoggedWeight);
        const avgWDisplay = Math.round(avgLoggedWeight);

        if (avgLoggedWeight === 0) {
          newTargetWeight = 0;
          weightAction = 'hold';
          weightDelta = 0;
          effectiveOldWeight = 0;
          selfSelectCoachingNote =
            `No weight logged last week — choose your working weight at RPE ${tr} this session.`;
        } else if (!hasRpeData) {
          newTargetWeight = baseWeight;
          weightAction = 'hold';
          weightDelta = 0;
          effectiveOldWeight = avgWDisplay;
          selfSelectCoachingNote =
            `Set at ${newTargetWeight} lbs from last week. Log your RPE this session so I can start adjusting your progression.`;
        } else if (rpeIsLow) {
          const inc = calculateIncrease(
            avgLoggedWeight,
            avgRpe,
            prescribed.targetRpe,
            trainingAge,
            compound,
          );
          newTargetWeight = Math.max(0, roundTo2_5(avgLoggedWeight + inc));
          weightAction = 'increase';
          weightDelta = newTargetWeight - avgLoggedWeight;
          effectiveOldWeight = avgWDisplay;
          selfSelectCoachingNote =
            `Your ${avgLoggedWeight} lbs felt light — moving to ${newTargetWeight} lbs this week.`;
        } else if (rpeIsHigh) {
          newTargetWeight = Math.max(0, roundTo2_5(avgLoggedWeight * 0.95));
          weightAction = 'decrease';
          weightDelta = newTargetWeight - avgLoggedWeight;
          effectiveOldWeight = avgWDisplay;
          selfSelectCoachingNote =
            `${avgLoggedWeight} lbs was tough — dropping to ${newTargetWeight} lbs for better quality reps.`;
        } else {
          newTargetWeight = baseWeight;
          weightAction = 'hold';
          weightDelta = 0;
          effectiveOldWeight = avgWDisplay;
          selfSelectCoachingNote =
            `${newTargetWeight} lbs confirmed as your working weight. Keep rating your RPE so I can keep dialling it in.`;
        }

        exerciseAdaptations.push({
          name,
          oldWeight: effectiveOldWeight,
          newTargetWeight,
          weightAction,
          rpeGap: Math.round((avgRpe - prescribed.targetRpe) * 10) / 10,
          avgRpe: Math.round(avgRpe * 10) / 10,
          hasRpeData,
          avgReps: Math.round(avgReps * 10) / 10,
          targetRpe: prescribed.targetRpe,
          targetReps: prescribed.targetReps,
          minReps: prescribed.minReps,
          oldReps: prescribed.reps,
          sets: prescribed.sets,
          selfSelectCoachingNote,
        });
        continue;
      }

      if (completionTier === 'full') {
        const rpeIsLow = hasRpeData && avgRpe <= 6;
        const rpeIsHigh = hasRpeData && avgRpe >= 9;
        const repsExceeded = avgReps > 0 && avgReps >= prescribed.targetReps * 1.05;
        // Only decrease if user failed to hit the minimum of the rep range
        // Hitting 3 reps on a "3-5" range is valid — do not decrease
        const repsFell = avgReps > 0 && avgReps < prescribed.minReps;

        if (!hasRpeData && !repsFell && !repsExceeded) {
          // No RPE data logged and reps were within range — hold weight
          // Jordan's note will ask user to log RPE next session
          weightAction = 'hold';
          weightDelta = 0;
        } else if (rpeIsLow || repsExceeded) {
          weightAction = 'increase';
          weightDelta = calculateIncrease(
            prescribed.targetWeight,
            avgRpe,
            prescribed.targetRpe,
            trainingAge,
            compound,
          );
        } else if (rpeIsHigh || repsFell) {
          weightAction = 'decrease';
          weightDelta = -2.5;
        } else {
          weightAction = 'hold';
          weightDelta = 0;
        }
      } else if (completionTier === 'partial') {
        weightAction = 'hold';
        weightDelta = 0;
      } else {
        // Low completion — decrease
        weightAction = 'decrease';
        weightDelta = -2.5;
      }

      newTargetWeight = Math.max(0, prescribed.targetWeight + weightDelta);

      exerciseAdaptations.push({
        name,
        oldWeight: prescribed.targetWeight,
        newTargetWeight,
        weightAction,
        rpeGap: Math.round((avgRpe - prescribed.targetRpe) * 10) / 10,
        avgRpe: Math.round(avgRpe * 10) / 10,
        hasRpeData,
        avgReps: Math.round(avgReps * 10) / 10,
        targetRpe: prescribed.targetRpe,
        targetReps: prescribed.targetReps,
        minReps: prescribed.minReps,
        oldReps: prescribed.reps,
        sets: prescribed.sets,
      });
    }

    for (const adaptation of exerciseAdaptations) {
      if (adaptation.weightAction === 'hold') {
        const history = weightHistoryMap[adaptation.name] ?? [];
        if (history.length >= 3) {
          const last3 = history.slice(-3);
          const allSame = last3.every((w: number) => w === last3[0]);
          if (allSame) {
            plateauedExercises.add(adaptation.name);
            adaptation.plateaued = true;
            adaptation.plateauWeeks = history.filter((w: number) => w === last3[0]).length;
          }
        }
      }
    }

    for (const adaptation of exerciseAdaptations) {
      if (adaptation.plateaued) {
        if (adaptation.plateauWeeks >= 4) {
          adaptation.sets = Math.min(adaptation.sets + 1, 6);
          adaptation.plateauResponse = 'volume_increase';
        } else {
          adaptation.plateauResponse = 'rotation_needed';
        }
      }
    }

    // Step 5 — Determine next week phase
    const nextWeekNumber = completedWeekNumber + 1;
    const weekInCycle = nextWeekNumber % 4;
    let phase: string;
    if (weekInCycle === 0) {
      phase = 'deload';
    } else if (nextWeekNumber <= totalWeeks / 2) {
      phase = 'accumulation';
    } else {
      phase = 'intensification';
    }

    // Deload overrides
    if (phase === 'deload') {
      for (const ex of exerciseAdaptations) {
        ex.newTargetWeight = roundTo2_5(ex.oldWeight * 0.8);
        ex.sets = Math.max(2, ex.sets - 1);
        ex.weightAction = 'deload';
      }
    }

    // Step 6 — Call Claude API
    const split = planJson.split ?? weekData?.title ?? 'mixed';
    const equipment = profile?.equipment ?? 'full gym';
    const templateDays = weekData?.days ?? [];
    const dayCount = templateDays.length;
    const structureLines = templateDays
      .map((d: any) =>
        d.type === 'rest'
          ? `Day ${d.dayNumber}: Rest`
          : `Day ${d.dayNumber}: ${d.title ?? 'Workout'} (${(d.muscleGroups ?? []).join(', ')})`,
      )
      .join('\n');
    const preserveBlock =
      dayCount > 0
        ? `PRESERVE THIS EXACT DAY STRUCTURE for Week ${nextWeekNumber}:
${structureLines}

Do NOT add, remove, or reorder days. Return exactly ${dayCount} days in the same order: same dayNumber and type (workout/rest) for each slot. For each workout slot, provide exercises, sessionFocus, and fields as specified. Only update exercise weights, reps, and coaching notes based on performance data.

`
        : '';

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: `You are Jordan, the athlete's personal coach. You have their last week of performance data and you are writing their next week plan. Generate the training plan as structured JSON with varied exercise selection, smart ordering, and coaching notes that reference the user's actual performance.

RPE INTERPRETATION — read this carefully:
- avgRpe is the athlete's ACTUAL RPE for that exercise last week
- targetRpe is what was programmed
- If avgRpe < targetRpe: the weight was TOO LIGHT. The athlete found it easy. Increase load.
- If avgRpe > targetRpe: the weight was HEAVY. High effort.
- weightAction field tells you exactly what to do: 'increase', 'hold', 'decrease', or 'deload'

For each exercise coachingNote:
- Speak as Jordan directly to the athlete in first person
- Reference the actual numbers: their avgRpe, avgReps, and how the weight is changing
- If weightAction is 'increase': explain why ("You hit this at RPE ${'{avgRpe}'} last week — that's lighter than target. Moving you up to ${'{newTargetWeight}'} lbs.")
- If weightAction is 'hold': explain why ("RPE was on target last week — same weight, focus on quality reps.")
- If weightAction is 'decrease': be honest ("Your RPE was high last week — backing off slightly to reset.")
- If weightAction is 'deload': frame it positively ("This is an intentional deload week — lighter weight is the prescription, not a step back.")
- Keep each note to 1-2 sentences
- Never use generic form cues like 'Focus on good form'
- Never use filler praise like 'Great job!' or 'Keep it up!'

PLATEAU HANDLING:
- If an exercise has plateaued: true and plateauResponse: 'rotation_needed':
  Replace it with a variation that targets the same muscle group and movement pattern. Choose a different implement or angle.
  Examples:
  - Barbell Bench Press plateaued → swap to Dumbbell Bench Press or Incline Barbell Press
  - Back Squat plateaued → swap to Front Squat or Pause Squat
  - Barbell Row plateaued → swap to Chest-Supported Row or Cable Row
  The coachingNote MUST mention the swap: "Your [exercise] has stalled at [weight] for 3 weeks — I'm rotating to [new exercise] to hit the same pattern from a fresh angle."

- If plateauResponse: 'volume_increase':
  Keep the same exercise but use the updated sets value.
  The coachingNote MUST mention the volume increase: "Same weight this week but I'm adding a set — more total work is the stimulus you need to break through this sticking point."

- If no plateau: handle as normal.

For each workout day, include a sessionFocus field: one sentence (max 12 words) that tells the athlete exactly what today is about.
Reference real numbers from the exercise adaptations where possible.
This appears on the athlete's Dashboard before they start the workout.

sessionFocus rules:
- Always reference at least one specific number (weight, RPE, or sets)
- Reference the most important exercise of the day
- If weights are increasing: mention the increase and why
- If it is a deload: say so directly
- Never use filler like 'Great session ahead' or 'You've got this'
- Examples:
  'Bench goes to 302.5 today — your RPE 4 last week earned this.'
  'Volume day: 4x6 at 225, focus on bar speed not max effort.'
  'Deload week — move well at 220, nothing more.'
  'Heavy deadlift day — 410 lbs, chase that RPE 8 target.'

Rest days: sessionFocus must be an empty string "".

Return ONLY valid JSON with no prose, preamble, or markdown.`,
        messages: [
          {
            role: 'user',
            content: `${preserveBlock}Generate Week ${nextWeekNumber} of a ${totalWeeks}-week ${goalType} training plan.

Phase: ${phase}
Training split: ${split}
Days per week: ${daysPerWeek}
Equipment: ${equipment}
Training age: ${trainingAge}
Completion tier last week: ${completionTier} (${sessionsCompleted}/${sessionsPlanned} sessions)

Exercise adaptations for next week (use newTargetWeight for each exercise):
${JSON.stringify(exerciseAdaptations, null, 2)}

Rules:
- Use the newTargetWeight for each exercise listed above — do not change these weights
- Maintain the same core exercise selection as last week unless weightAction is 'decrease' for 3+ sets (then suggest a regression)
- If phase is 'deload': sets are already reduced in the data above, keep reps in lower range
- If completionTier is 'low': add a note in the first workout suggesting the user review their schedule
- If hasRpeData is false for an exercise: the coachingNote MUST ask the user to log RPE next session. Weight is held. Example: "I'm holding 225 lbs here — I need your RPE to know where to take this. Rate every set next session."
- If selfSelectCoachingNote is present on an adaptation: use it as the core of that exercise's coachingNote (you may tighten wording slightly but keep the numbers).
- Never decrease weight solely because RPE was not logged.
- Exercises with plateaued: true require special handling per the system prompt. Do not ignore this field.
- Each exercise must have: id (new uuid), name, muscleGroup, sets, reps (string e.g. '8-10'), targetWeight (number), restSeconds, targetRpe, coachingNote
- Each workout day must include sessionFocus (one sentence, max 12 words — see system prompt). Rest days must have sessionFocus: "" (empty string).
- Include exactly ${dayCount || 7} days in the same order as the structure above. Workout slots have exercises; rest slots have empty exercises array and type 'rest'.

Return ONLY this exact JSON structure:
{
  "weekNumber": ${nextWeekNumber},
  "phase": "${phase}",
  "days": [
    {
      "dayNumber": 1,
      "type": "workout",
      "title": "Push A",
      "sessionFocus": "Bench goes to 302.5 — RPE 4 last week earned this increase.",
      "muscleGroups": ["Chest", "Shoulders", "Triceps"],
      "exercises": [
        {
          "id": "uuid-string",
          "name": "Exercise Name",
          "muscleGroup": "Chest",
          "sets": 4,
          "reps": "8-10",
          "targetWeight": 185,
          "restSeconds": 90,
          "targetRpe": 7,
          "coachingNote": "Jordan's note referencing their actual performance numbers"
        }
      ]
    },
    {
      "dayNumber": 2,
      "type": "rest",
      "title": "Rest Day",
      "sessionFocus": "",
      "muscleGroups": [],
      "exercises": []
    }
  ]
}`,
          },
        ],
      }),
    });

    const claudeData = await claudeResponse.json();

    if (!claudeResponse.ok) {
      console.error('Claude API error:', JSON.stringify(claudeData));
      throw new Error(`Claude API error: ${claudeData.error?.message ?? 'unknown'}`);
    }

    const text: string = claudeData.content?.[0]?.text ?? '';

    // Step 7 — Parse Claude response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response:', text.substring(0, 300));
      throw new Error('No JSON found in Claude response');
    }

    let nextWeekData: any;
    try {
      nextWeekData = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Parse error. Raw text:', text.substring(0, 500));
      throw new Error('JSON parse failed: ' + String(e));
    }

    // Ensure weekNumber and phase are set correctly; lock layout to completed week
    nextWeekData.weekNumber = nextWeekNumber;
    nextWeekData.phase = phase;
    nextWeekData = mergeNextWeekWithPreviousStructure(weekData, nextWeekData, nextWeekNumber, phase);

    // Step 8 — Save to Supabase atomically (fresh read to avoid race)
    const { data: freshPlan, error: freshErr } = await supabase
      .from('plans')
      .select('plan_json')
      .eq('id', planId)
      .single();

    if (freshErr) throw new Error(`Failed to re-fetch plan: ${freshErr.message}`);

    const updatedPlanJson = { ...freshPlan.plan_json };
    if (!Array.isArray(updatedPlanJson.weeks)) updatedPlanJson.weeks = [];

    const existingWeeks = updatedPlanJson.weeks ?? [];
    const nextWeekAlreadyExists = existingWeeks.some(
      (w: any) => w.weekNumber === nextWeekNumber,
    );

    if (nextWeekAlreadyExists) {
      console.log('[generate-next-week] Week already exists — skipping', nextWeekNumber);
      return new Response(
        JSON.stringify({ status: 'already_exists', weekNumber: nextWeekNumber }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    const updatedWeeks = [...existingWeeks, nextWeekData];
    updatedPlanJson.weeks = updatedWeeks;
    updatedPlanJson.currentWeek = nextWeekNumber;

    const { error: updateErr } = await supabase
      .from('plans')
      .update({ plan_json: updatedPlanJson, current_week: nextWeekNumber })
      .eq('id', planId);

    if (updateErr) throw new Error(`Failed to update plan: ${updateErr.message}`);

    // Step 9 — Return success
    return new Response(
      JSON.stringify({ status: 'success', nextWeekNumber, phase, completionTier }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('generate-next-week error:', String(error));
    return new Response(
      JSON.stringify({ error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});

// DEPLOY:
// supabase functions deploy generate-next-week
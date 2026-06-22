// SETUP REQUIRED:
// Run this once in your terminal to set the API key as a Supabase secret:
//   supabase secrets set ANTHROPIC_API_KEY=your_key_here
// Never commit your API key. Never put it in .env for client use.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchAnthropicMessagesWithRetry } from '../_shared/anthropicRetry.ts';
import { enforceSetStructureExercise, isStrengthGoalTargetLift, isTargetLift } from '../_shared/setStructure.ts';
import {
  finalizeStrengthTargetLiftPeriodisationOnDays,
  strengthWeekInCycle,
} from '../_shared/strengthTargetLiftPeriodisation.ts';
import {
  buildWeek1PyramidSetTargets,
  type Week1PyramidTargetSet,
} from '../_shared/week1PyramidSetTargets.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** §2 POSITIVE = logged easier than target; NEGATIVE = harder. Single source — do not redefine elsewhere in this module. */
function computeRpeGap(avgLoggedRpe: number, targetRpe: number): number {
  return targetRpe - avgLoggedRpe;
}

interface AdaptationChange {
  exerciseName: string;
  muscleGroup: string;
  changeType: 'increase' | 'decrease' | 'hold' | 'deload' | 'calibration';
  previousWeight: number;
  newWeight: number;
  weightDelta: number;
  avgLoggedRpe: number | null;
  targetRpe: number | null;
  rpeGap: number | null;
  reason: string;
}

interface AdaptationDraft {
  key: string;
  exerciseName: string;
  muscleGroup: string;
  previousWeight: number;
  progressedWeight: number;
  avgLoggedRpe: number | null;
  targetRpe: number | null;
  rpeGap: number | null;
  repsExceeded: boolean;
  hadRpeData: boolean;
  isCalibration: boolean;
}

function parseRepTargetHigh(reps: unknown, repsMax?: unknown): number {
  if (typeof repsMax === 'number' && repsMax > 0) return repsMax;
  if (typeof reps === 'number' && reps > 0) return reps;
  const s = String(reps ?? '8');
  const range = s.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return Number(range[2]);
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 8;
}

function avgLoggedRepsFromSets(workingSets: any[]): number | null {
  const reps = workingSets
    .map((s: any) => Number(s.reps ?? 0))
    .filter((r: number) => r > 0);
  if (reps.length === 0) return null;
  return reps.reduce((sum: number, r: number) => sum + r, 0) / reps.length;
}

function formatAdaptationLb(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : String(rounded);
}

function determineAdaptationChangeType(
  isCalibration: boolean,
  isDeloadWeek: boolean,
  previousWeight: number,
  newWeight: number,
): AdaptationChange['changeType'] {
  if (isCalibration) return 'calibration';
  if (isDeloadWeek) return 'deload';
  const delta = newWeight - previousWeight;
  if (delta > 0.25) return 'increase';
  if (delta < -0.25) return 'decrease';
  return 'hold';
}

function buildAdaptationReason(params: {
  changeType: AdaptationChange['changeType'];
  avgLoggedRpe: number | null;
  targetRpe: number | null;
  rpeGap: number | null;
  weightDelta: number;
  repsExceeded: boolean;
  completionTier: 'full' | 'partial' | 'low';
  hadRpeData: boolean;
  weekNumber: number;
}): string {
  const deltaAbs = formatAdaptationLb(Math.abs(params.weightDelta));

  if (params.changeType === 'calibration') {
    return "Week 1 baseline — you selected this weight. I'll tune it from here based on your effort ratings.";
  }
  if (params.changeType === 'deload') {
    return `Week ${params.weekNumber} is your scheduled recovery week. Weights drop to 85% — this is programmed, not a setback. Come back stronger Week ${params.weekNumber + 1}.`;
  }
  if (params.changeType === 'increase' && params.repsExceeded) {
    return `You exceeded the rep target last week. Added ${deltaAbs} lbs.`;
  }
  if (
    params.changeType === 'increase' &&
    params.rpeGap != null &&
    params.rpeGap > 0 &&
    params.avgLoggedRpe != null &&
    params.targetRpe != null
  ) {
    return `Average RPE ${params.avgLoggedRpe.toFixed(1)} was below your ${params.targetRpe.toFixed(1)} target. Added ${deltaAbs} lbs.`;
  }
  if (params.changeType === 'decrease' && params.completionTier === 'low') {
    return 'Fewer than 60% of sessions completed. Dropping weight slightly to reset and build back up.';
  }
  if (
    params.changeType === 'decrease' &&
    params.rpeGap != null &&
    params.rpeGap < 0 &&
    params.avgLoggedRpe != null &&
    params.targetRpe != null
  ) {
    return `Average RPE ${params.avgLoggedRpe.toFixed(1)} exceeded your ${params.targetRpe.toFixed(1)} target. Dropped ${deltaAbs} lbs to bring effort back into range.`;
  }
  if (params.changeType === 'hold' && params.completionTier === 'partial') {
    return 'Sessions were inconsistent last week. Holding weight until you have a full week to measure from.';
  }
  if (params.changeType === 'hold' && !params.hadRpeData) {
    return 'No RPE data logged last week. Holding weight until I have your numbers.';
  }
  if (params.changeType === 'hold' && params.avgLoggedRpe != null) {
    return `RPE averaged ${params.avgLoggedRpe.toFixed(1)} — right on target. Holding weight this week.`;
  }
  return 'Holding weight this week based on last week\'s performance.';
}

function upsertAdaptationDraft(drafts: AdaptationDraft[], draft: AdaptationDraft): void {
  const idx = drafts.findIndex((d) => d.key === draft.key);
  if (idx >= 0) drafts[idx] = draft;
  else drafts.push(draft);
}

function buildAdaptationChangesFromDrafts(
  drafts: AdaptationDraft[],
  days: any[] | undefined,
  opts: {
    phase: string;
    nextWeekNumber: number;
    completionTier: 'full' | 'partial' | 'low';
  },
): AdaptationChange[] {
  const finalWeightByKey = new Map<string, number>();
  for (const day of days ?? []) {
    if (day.type !== 'workout') continue;
    for (const ex of day.exercises ?? []) {
      const w = Number(ex.targetWeight ?? 0);
      if (w <= 0) continue;
      const key = String(ex.exerciseName ?? ex.name ?? '')
        .toLowerCase()
        .trim();
      if (key) finalWeightByKey.set(key, w);
    }
  }

  const isDeloadWeek = opts.phase === 'deload';
  const changes: AdaptationChange[] = [];

  for (const d of drafts) {
    const newWeight = finalWeightByKey.get(d.key);
    if (newWeight == null || newWeight <= 0) continue;

    const displayPrevious = d.isCalibration
      ? 0
      : isDeloadWeek
        ? d.progressedWeight
        : d.previousWeight;
    const weightDelta = Math.round((newWeight - displayPrevious) * 10) / 10;
    const changeType = determineAdaptationChangeType(
      d.isCalibration,
      isDeloadWeek,
      d.isCalibration ? d.progressedWeight : d.previousWeight,
      newWeight,
    );

    changes.push({
      exerciseName: d.exerciseName,
      muscleGroup: d.muscleGroup,
      changeType,
      previousWeight: displayPrevious,
      newWeight,
      weightDelta,
      avgLoggedRpe: d.avgLoggedRpe,
      targetRpe: d.targetRpe,
      rpeGap: d.rpeGap,
      reason: buildAdaptationReason({
        changeType,
        avgLoggedRpe: d.avgLoggedRpe,
        targetRpe: d.targetRpe,
        rpeGap: d.rpeGap,
        weightDelta,
        repsExceeded: d.repsExceeded,
        completionTier: opts.completionTier,
        hadRpeData: d.hadRpeData,
        weekNumber: opts.nextWeekNumber,
      }),
    });
  }

  return changes;
}

/** §3 Strength primary lift periodisation row by position in deload-skipped cycle. */
function strengthPeriodisation(weekInCycle: number): {
  sets: number;
  reps: number;
  targetRpe: number;
} {
  switch (weekInCycle) {
    case 1:
      return { sets: 5, reps: 5, targetRpe: 7.0 };
    case 2:
      return { sets: 4, reps: 4, targetRpe: 8.0 };
    case 3:
      return { sets: 3, reps: 3, targetRpe: 8.5 };
    case 4:
      return { sets: 3, reps: 5, targetRpe: 6.0 }; // deload week of cycle
    default:
      return { sets: 5, reps: 5, targetRpe: 7.0 };
  }
}

function isVolumeDay(
  session: any,
  planJson?: any,
  completedWeekDays?: any[],
): boolean {
  // Signal 1: direct title on session (canonical plan_json.weeks[].days[])
  const title = (session.title ?? '').toLowerCase();
  if (title.includes('volume')) return true;

  // Signal 2: focus/label/liftDay (forward compat)
  const focus = (session.focus ?? '').toLowerCase();
  if (focus.includes('volume')) return true;
  const label = (session.label ?? '').toLowerCase();
  if (label.includes('volume')) return true;
  const liftDay = (session.liftDay ?? '').toLowerCase();
  if (liftDay === 'volume') return true;

  const dayNum = session.day ?? session.dayNumber;

  // Signal 3: same slot on the completed week (authoritative for progression)
  if (Array.isArray(completedWeekDays) && completedWeekDays.length > 0) {
    const matchedCompleted = completedWeekDays.find(
      (d: any) => d.dayNumber === dayNum || d.day === dayNum,
    );
    if (matchedCompleted) {
      const completedTitle = (matchedCompleted.title ?? '').toLowerCase();
      if (completedTitle.includes('volume')) return true;
    }
  }

  // Signal 4: week 1 template fallback by dayNumber
  if (planJson?.weeks?.length > 0) {
    const week1 = planJson.weeks[0];
    const days = week1?.days ?? week1?.sessions ?? [];
    const matchedDay = days.find(
      (d: any) => d.dayNumber === dayNum || d.day === dayNum,
    );
    if (matchedDay) {
      const matchedTitle = (matchedDay.title ?? '').toLowerCase();
      if (matchedTitle.includes('volume')) return true;
    }
  }

  return false;
}

/** Strength volume days: target lift only → 8 straight reps (accessories / timed moves unchanged). */
function applyStrengthVolumeDayTargetLiftReps(
  days: any[] | undefined,
  goal: string,
  goalLift: string | null | undefined,
  planJson?: any,
): any[] {
  if (goal !== 'strength' || !goalLift || String(goalLift).trim() === '') {
    return days ?? [];
  }

  const volumeRepsStr = '8';
  const volumeRepsNum = 8;

  return (days ?? []).map((session: any) => {
    if (session.type !== 'workout') return session;

    const volume = isVolumeDay(session, planJson);
    console.log('[SESSION TYPE]', {
      title: session.title,
      dayNumber: session.dayNumber ?? session.day,
      isVolume: volume,
    });

    if (!volume) return session;

    const exercisesIn = session.exercises ?? [];
    const exercisesOut: any[] = [];

    for (const exercise of exercisesIn) {
      if (!isStrengthGoalTargetLift(exercise, goalLift)) {
        exercisesOut.push(exercise);
        continue;
      }

      console.log('[VOLUME DAY REPS]', {
        sessionTitle: session.title,
        isVolume: true,
        volumeReps: volumeRepsNum,
        exercise: exercise.exerciseName ?? exercise.name,
      });

      exercisesOut.push({
        ...exercise,
        reps: volumeRepsStr,
        repsMin: volumeRepsNum,
        repsMax: volumeRepsNum,
      });
    }

    return {
      ...session,
      exercises: exercisesOut,
    };
  });
}

const COMPOUND_KEYWORDS = ['squat', 'deadlift', 'bench press', 'row', 'press', 'lunge', 'hip thrust'];

function isCompound(name: string): boolean {
  const lower = name.toLowerCase();
  return COMPOUND_KEYWORDS.some((kw) => lower.includes(kw));
}

// BUG-5: Unilateral exercise handling — name-based heuristic for Edge Function context
const UNILATERAL_NAMES = new Set([
  'bulgarian split squat', 'walking lunge', 'reverse lunge', 'forward lunge',
  'dumbbell row', 'dumbbell curl', 'hammer curl', 'incline dumbbell curl',
  'cable kickback', 'cable lateral raise', 'pallof press',
  'dumbbell tricep kickback', 'step-up',
]);
function isUnilateralExercise(name: string): boolean {
  const n = name.toLowerCase().trim();
  if (UNILATERAL_NAMES.has(n)) return true;
  if (/single[- ]?(arm|leg)/i.test(n)) return true;
  if (/\b(lunge|split squat|step[- ]?up|pistol|cossack|meadows)\b/i.test(n)) return true;
  return false;
}

function buildFreeSessionSummary(
  sessions: Array<{
    session_name: string;
    sets_json: unknown;
    session_fatigue_rating: number | null;
    logged_at: string;
  }> | null,
): string {
  if (!sessions || sessions.length === 0) return '';

  const lines = sessions.map((s) => {
    const raw = s.sets_json;
    const sets = Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? (() => {
            try {
              const p = JSON.parse(raw) as unknown;
              return Array.isArray(p) ? p : [];
            } catch {
              return [];
            }
          })()
        : [];
    const byExercise: Record<string, { count: number; topWeight: number }> = {};
    for (const set of sets as Array<Record<string, unknown>>) {
      const name: string = String(set.exerciseName ?? set.name ?? 'Unknown');
      const weight = Number(set.weightLbs ?? 0);
      if (!byExercise[name]) byExercise[name] = { count: 0, topWeight: 0 };
      byExercise[name].count++;
      if (weight > byExercise[name].topWeight) {
        byExercise[name].topWeight = weight;
      }
    }
    const exerciseSummary = Object.entries(byExercise)
      .map(([name, data]) =>
        data.topWeight > 0
          ? `${name} (${data.count} sets, up to ${data.topWeight} lbs)`
          : `${name} (${data.count} sets)`,
      )
      .join(', ');

    const fatigue = s.session_fatigue_rating
      ? `fatigue rating ${s.session_fatigue_rating}/5`
      : 'no fatigue rating';
    const date = new Date(s.logged_at).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    return `- ${s.session_name} (${date}, ${fatigue}): ${exerciseSummary}`;
  });

  return `\nFREE SESSIONS THIS WEEK (logged outside the plan):\n${lines.join('\n')}`;
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

function normalizeLogSetWeightLbs(s: LogSetLike): number {
  const w = s.weightLbs ?? s.weight;
  if (w == null) return 0;
  const n = Number(w);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeLogSetRpe(s: LogSetLike): number {
  const r = s.rpe;
  if (r == null) return 0;
  const n = Number(r);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Week 1 baseline: if the athlete ramped weight across sets (e.g. 50→60→70),
 * use peak weight as baseline instead of averaging (which underestimates).
 */
function getWeek1Baseline(setsJson: LogSetLike[]): {
  baselineWeight: number;
  baselineRpe: number;
  isRampPattern: boolean;
} {
  if (!setsJson || setsJson.length === 0) {
    return { baselineWeight: 0, baselineRpe: 0, isRampPattern: false };
  }

  const weights = setsJson.map(normalizeLogSetWeightLbs).filter((w) => w > 0);
  if (weights.length === 0) {
    return { baselineWeight: 0, baselineRpe: 0, isRampPattern: false };
  }

  const isAscending = weights.every((w, i) => i === 0 || w >= weights[i - 1]);
  const hasIncrease = weights[weights.length - 1] > weights[0];
  const isRampPattern = isAscending && hasIncrease;

  if (isRampPattern) {
    const peakWeight = Math.max(...weights);
    const peakSets = setsJson.filter(
      (s) => normalizeLogSetWeightLbs(s) === peakWeight && normalizeLogSetRpe(s) > 0,
    );
    let baselineRpe = 0;
    if (peakSets.length > 0) {
      baselineRpe =
        peakSets.reduce((sum, s) => sum + normalizeLogSetRpe(s), 0) /
        peakSets.length;
    } else {
      const rpeVals = setsJson.map(normalizeLogSetRpe).filter((r) => r > 0);
      baselineRpe =
        rpeVals.length > 0
          ? rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length
          : 0;
    }
    return { baselineWeight: peakWeight, baselineRpe, isRampPattern: true };
  }

    // Use max logged weight as baseline for flat/straight sets.
    // Average punishes users who are still finding working weight
    // (e.g. 40/50/70 → avg=53 would regress them; max=70 is correct).
    // For true straight sets (90/90/90), max === avg so no difference.
    const maxWeight = Math.max(...weights);
    const rpeValues = setsJson.map(normalizeLogSetRpe).filter((r) => r > 0);
    const avgRpe =
      rpeValues.length > 0
        ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length
        : 0;
    return { baselineWeight: maxWeight, baselineRpe: avgRpe, isRampPattern: false };
}

/** Pyramid = top set is the working set; straight = average across working sets. */
function isPyramidExercise(exercise: {
  setStructure?: string;
  setTargets?: Array<{ targetWeight?: number }>;
}): boolean {
  if (exercise?.setStructure === 'pyramid') return true;
  const targets = exercise?.setTargets ?? [];
  if (targets.length < 2) return false;
  const first = Number(targets[0]?.targetWeight ?? 0);
  const last = Number(targets[targets.length - 1]?.targetWeight ?? 0);
  return last > first;
}

function getLoggedBaselineFromSets(
  sets: LogSetLike[],
  isPyramid: boolean,
): { baselineWeight: number; baselineRpe: number } {
  if (!sets || sets.length === 0) {
    return { baselineWeight: 0, baselineRpe: 0 };
  }

  if (isPyramid) {
    const topWeight = Math.max(...sets.map((s) => normalizeLogSetWeightLbs(s)));
    if (topWeight <= 0) {
      return { baselineWeight: 0, baselineRpe: 0 };
    }
    const topSets = sets.filter(
      (s) => normalizeLogSetWeightLbs(s) === topWeight,
    );
    const rpeSum = topSets.reduce(
      (sum, s) => sum + Number((s as LogSetLike).rpe ?? 0),
      0,
    );
    const baselineRpe = topSets.length > 0 ? rpeSum / topSets.length : 0;
    return { baselineWeight: topWeight, baselineRpe };
  }

  const weights = sets.map(normalizeLogSetWeightLbs).filter((w) => w > 0);
  if (weights.length === 0) {
    return { baselineWeight: 0, baselineRpe: 0 };
  }
  // Use max logged weight — same rationale as getWeek1Baseline flat-set path.
  const maxWeight = Math.max(...weights);
  const rpeValues = sets.map(normalizeLogSetRpe).filter((r) => r > 0);
  const avgRpe =
    rpeValues.length > 0
      ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length
      : 0;
  return { baselineWeight: maxWeight, baselineRpe: avgRpe };
}

/** Per workout log, then take strongest session baseline (avoids breaking ramp across days). */
function getWeek1BaselineFromLogs(
  logs: { sets_json?: LogSetLike[] | null }[],
  exerciseMap: Record<string, string>,
  targetName: string,
): { baselineWeight: number; baselineRpe: number; isRampPattern: boolean } {
  let best: {
    baselineWeight: number;
    baselineRpe: number;
    isRampPattern: boolean;
  } = { baselineWeight: 0, baselineRpe: 0, isRampPattern: false };

  for (const log of logs) {
    const setsJson = log.sets_json ?? [];
    if (!Array.isArray(setsJson)) continue;
    const forEx: LogSetLike[] = [];
    for (const set of setsJson) {
      const resolvedName: string =
        (set.exerciseId ? exerciseMap[set.exerciseId] : '') ||
        String(set.exerciseName ?? '') ||
        String(set.name ?? '');
      if (!findExerciseDataKey(targetName, resolvedName)) continue;
      forEx.push(set);
    }
    if (forEx.length === 0) continue;
    const b = getWeek1Baseline(forEx);
    if (b.baselineWeight > best.baselineWeight) {
      best = b;
    }
  }
  return best;
}

/** Goals where Week 1 targetWeight is 0 (self-selected); W2+ anchors from logs when plan prescription is 0. */
const SELF_SELECT_WEIGHT_GOALS = new Set([
  'hypertrophy',
  'recomp',
  'fat_loss',
  'general',
  'power_hypertrophy',
]);

function normalizePlanGoal(goal: string): string {
  return String(goal ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

function isSelfSelectWeightGoal(goal: string): boolean {
  return SELF_SELECT_WEIGHT_GOALS.has(normalizePlanGoal(goal));
}

/**
 * Progression anchor: prior-week plan_json prescription, or logged working
 * weight when prescription was 0 (non-strength self-select Week 1).
 */
function resolveProgressionBaseline(
  planGoal: string,
  priorPlanExercise: any,
  workingSets: LogSetLike[],
  opts?: {
    wasSwapped?: boolean;
    loggedBaselineWeight?: number;
    /** DC-1: false when completed week was a deload — skip logged-weight fallback. */
    isCalibrationWeek?: boolean;
  },
): {
  baseline: number;
  source: 'plan' | 'logged' | 'none' | 'swap_logged';
} {
  if (
    opts?.wasSwapped &&
    Number(opts.loggedBaselineWeight ?? 0) > 0
  ) {
    return {
      baseline: Number(opts.loggedBaselineWeight),
      source: 'swap_logged',
    };
  }

    const priorTargetWeight = Number(priorPlanExercise?.targetWeight ?? 0);

    /** priorTargetWeight 0 = self-select prescription, not calibration — use logged working weight as baseline. */
    if (priorTargetWeight > 0 || !isSelfSelectWeightGoal(planGoal)) {
      const fromPlan = getPlanBaselineWeight(priorPlanExercise);
      if (fromPlan > 0) {
        // If user logged more than plan prescribed (exceeded target),
        // progress from what they actually did — not from the plan.
        // This fixes "Same load" on pyramids and prevents regression
        // on straight sets where user ramped above planned weight.
        const loggedW = Number(opts?.loggedBaselineWeight ?? 0);
        const effectiveBaseline = loggedW > fromPlan ? loggedW : fromPlan;
        return {
          baseline: effectiveBaseline,
          source: effectiveBaseline === loggedW ? 'logged' : 'plan',
        };
      }
    }

  if (!isSelfSelectWeightGoal(planGoal)) {
    return { baseline: 0, source: 'none' };
  }

  // When the completed week was a deload (isCalibrationWeek === false), do not
  // fall through to logged weights. The plan-prescription path (DC-1 pre-deload
  // fields) is the correct anchor; using logged weights here would base
  // progression on the reduced 85% session, not the pre-deload baseline.
  if (opts?.isCalibrationWeek === false) {
    return { baseline: 0, source: 'none' };
  }

  const fromLogs = getLoggedBaselineFromSets(
    workingSets,
    isPyramidExercise(priorPlanExercise ?? {}),
  ).baselineWeight;
  if (fromLogs > 0) {
    return { baseline: fromLogs, source: 'logged' };
  }
  return { baseline: 0, source: 'none' };
}

function getEquipmentForExerciseName(exerciseName: string): string {
  const key = String(exerciseName ?? '').toLowerCase().trim();
  if (EQUIPMENT_MAP[key]) return EQUIPMENT_MAP[key];
  const sortedEntries = [
    ...Object.entries(EQUIPMENT_MAP),
    ...Object.entries(EQUIPMENT_ALIASES ?? {}),
  ].sort((a, b) => b[0].length - a[0].length);
  for (const [mapKey, equip] of sortedEntries) {
    if (key.includes(mapKey) || mapKey.includes(key)) return equip;
  }
  return 'barbell';
}

function deriveEquipmentFromName(name: string): string {
  const n = String(name ?? '').toLowerCase();
  if (n.includes('dumbbell') || n.includes(' db ')) {
    return 'dumbbell';
  }
  if (n.includes('barbell')) return 'barbell';
  if (n.includes('cable')) return 'cable';
  if (
    n.includes('machine') ||
    n.includes('leg press') ||
    n.includes('leg curl') ||
    n.includes('leg extension') ||
    n.includes('calf raise') ||
    n.includes('lat pulldown') ||
    n.includes('hack squat')
  ) {
    return 'machine';
  }
  if (
    n.includes('pull-up') ||
    n.includes('pullup') ||
    n.includes('chin-up') ||
    n.includes('chinup') ||
    n.includes('push-up') ||
    n.includes('pushup') ||
    n.includes('dip')
  ) {
    return 'bodyweight';
  }
  return 'barbell';
}


/** §5 Accessory increments from gap × equipment class. */
function accessoryWeightIncrement(
  avgLoggedRpe: number,
  targetRpe: number,
  equipmentRaw: string,
): number {
  const gap = computeRpeGap(avgLoggedRpe, targetRpe);
  const equipment = String(equipmentRaw ?? 'barbell').toLowerCase();

  const isBarOrDumb = ['barbell', 'dumbbell'].includes(equipment);
  const isCableOrMachine = ['cable', 'machine'].includes(equipment);

  if (gap >= 3) return isBarOrDumb ? 20 : isCableOrMachine ? 15 : 10;
  if (gap >= 2) return isBarOrDumb ? 10 : isCableOrMachine ? 10 : 5;
  if (gap >= 1) return isBarOrDumb ? 5 : isCableOrMachine ? 5 : 2.5;
  if (gap >= 0) return isBarOrDumb ? 5 : isCableOrMachine ? 5 : 2.5;
  if (gap >= -1) return 0;
  if (gap >= -2) return isBarOrDumb ? -5 : isCableOrMachine ? -5 : -2.5;
  return isBarOrDumb ? -10 : isCableOrMachine ? -10 : -5;
}

/** RPE-bucket increments: beginner ×1.3, intermediate ×1.0, advanced ×0.7 */
function experienceProgressionMultiplier(trainingAge: string): number {
  if (trainingAge === 'beginner') return 1.3;
  if (trainingAge === 'advanced') return 0.7;
  return 1.0;
}

/** On-target fixed increments (non-percentage branch) by experience + tier */
function experienceFixedWeightIncrement(
  trainingAge: string,
  compoundTier: string,
): number {
  const isIsolation = compoundTier === 'isolation';
  if (trainingAge === 'beginner') return isIsolation ? 2.5 : 5.0;
  if (trainingAge === 'advanced') {
    if (isIsolation) return 0;
    return 1.25;
  }
  return isIsolation ? 1.0 : 2.5;
}

function resolveAccessoryLoadIncrement(
  avgLoggedRpe: number,
  targetRpe: number,
  equipment: string,
  compoundTier: string,
  trainingAge: string,
): number {
  const gap = computeRpeGap(avgLoggedRpe, targetRpe);
  const onTargetBand = gap >= -1 && gap < 1;

  if (onTargetBand) {
    return experienceFixedWeightIncrement(trainingAge, compoundTier);
  }

  let increment = accessoryWeightIncrement(avgLoggedRpe, targetRpe, equipment);
  if (increment > 0) {
    increment *= experienceProgressionMultiplier(trainingAge);
    if (
      trainingAge === 'advanced' &&
      compoundTier !== 'isolation' &&
      increment > 0
    ) {
      increment = Math.round(increment / 1.25) * 1.25;
    }
  }
  return increment;
}

function capIsolationDumbbellCableIncrement(
  increment: number,
  compoundTier: string,
  equipment: string,
): number {
  const equip = String(equipment ?? '').toLowerCase();
  if (
    compoundTier === 'isolation' &&
    (equip === 'dumbbell' || equip === 'cable')
  ) {
    return Math.min(increment, 2.5);
  }
  return increment;
}

function applyMinimumIncrement(
  rawIncrement: number,
  _equipment: string,
  rpeGap: number,
  compoundTier: string,
): number {
  const isIsolation = compoundTier === 'isolation';
  const isPrimary = compoundTier === 'primary_compound';

  if (isIsolation) {
    if (rpeGap >= 2.0) return 10;
    if (rpeGap >= 1.0) return 5;
    return 5;
  }

  if (isPrimary) {
    if (rpeGap >= 2.0) return Math.max(rawIncrement, 10);
    if (rpeGap >= 1.0) return Math.max(rawIncrement, 10);
    return Math.max(rawIncrement, 5);
  }

  if (rpeGap >= 2.0) return Math.max(rawIncrement, 10);
  if (rpeGap >= 1.0) return Math.max(rawIncrement, 5);
  return Math.max(rawIncrement, 5);
}

function normalizeCompoundTier(
  compoundTier: string | undefined | null,
): 'primary_compound' | 'secondary_compound' | 'isolation' {
  const t = String(compoundTier ?? 'isolation').toLowerCase().trim();
  if (t === 'primary_compound') return 'primary_compound';
  if (t === 'secondary_compound') return 'secondary_compound';
  if (t === 'isolation') return 'isolation';
  return 'isolation';
}

function getAccessoryRawIncrement(
  avgLoggedRpe: number,
  targetRpe: number,
  equipment: string,
  compoundTier: string,
  trainingAge: string,
): number {
  let increment = accessoryWeightIncrement(avgLoggedRpe, targetRpe, equipment);
  if (increment > 0) {
    increment *= experienceProgressionMultiplier(trainingAge);
    if (
      trainingAge === 'advanced' &&
      compoundTier !== 'isolation' &&
      increment > 0
    ) {
      increment = Math.round(increment / 1.25) * 1.25;
    }
    increment = capIsolationDumbbellCableIncrement(
      increment,
      compoundTier,
      equipment,
    );
  }
  return increment;
}

function computeAccessoryProgressionTarget(params: {
  baselineWeight: number;
  avgLoggedRpe: number;
  targetRpe: number;
  equipment: string;
  compoundTier: string;
  trainingAge: string;
  exerciseName?: string;
}): {
  newTargetWeight: number;
  changeType: 'increase' | 'maintain' | 'decrease';
  increment: number;
  rpeGap: number;
} {
  const {
    baselineWeight,
    avgLoggedRpe,
    targetRpe,
    equipment,
    compoundTier,
    trainingAge,
    exerciseName,
  } = params;
  const tier = normalizeCompoundTier(compoundTier);
  const rpeGap = computeRpeGap(avgLoggedRpe, targetRpe);
  const shouldDecrease = rpeGap < -1.0;
  const shouldHold = rpeGap >= -1.0 && rpeGap < 0;
  const rawIncrementValue = getAccessoryRawIncrement(
    avgLoggedRpe,
    targetRpe,
    equipment,
    tier,
    trainingAge,
  );

  if (shouldDecrease) {
    const rawDecrement =
      rawIncrementValue < 0
        ? Math.abs(rawIncrementValue)
        : Math.abs(
            accessoryWeightIncrement(avgLoggedRpe, targetRpe, equipment),
          );
    const newTargetWeight = roundToEquipmentIncrement(
      baselineWeight - rawDecrement,
      equipment,
    );
    return {
      newTargetWeight,
      changeType: 'decrease',
      increment: newTargetWeight - baselineWeight,
      rpeGap,
    };
  }

  if (shouldHold) {
    const newTargetWeight = roundToEquipmentIncrement(
      baselineWeight,
      equipment,
    );
    return {
      newTargetWeight,
      changeType: 'maintain',
      increment: 0,
      rpeGap,
    };
  }

  const rawIncrement =
    rawIncrementValue > 0
      ? rawIncrementValue
      : Math.max(0, accessoryWeightIncrement(avgLoggedRpe, targetRpe, equipment));
  const adjusted = applyMinimumIncrement(
    rawIncrement,
    equipment ?? 'barbell',
    rpeGap,
    tier,
  );
  console.log('[INCREMENT CHECK]', {
    name: exerciseName ?? '',
    compoundTier: tier,
    rpeGap,
    rawIncrement,
    adjustedIncrement: adjusted,
  });
  const newTargetWeight = roundToEquipmentIncrement(
    baselineWeight + adjusted,
    equipment,
  );
  return {
    newTargetWeight,
    changeType: 'increase',
    increment: adjusted,
    rpeGap,
  };
}

function scalePositiveIncrementByExperience(
  increment: number,
  trainingAge: string,
): number {
  if (increment <= 0) return increment;
  let scaled = increment * experienceProgressionMultiplier(trainingAge);
  if (trainingAge === 'advanced' && scaled > 0) {
    scaled = Math.round(scaled / 1.25) * 1.25;
  }
  return scaled;
}

/** Deload week: −15% load and −1 set (min 2) after progression math */
// deno-lint-ignore no-explicit-any
function applyDeloadPassToDays(days: any[] | undefined): any[] {
  const deloadFactor = 0.85;
  return (days ?? []).map((day: any) => {
    if (day.type !== 'workout') return day;
    return {
      ...day,
      exercises: (day.exercises ?? []).map((ex: any) => {
        // DC-1: stash originals before scaling so the next week can progress
        // from the pre-deload prescription rather than the 85% value.
        // Guard with null-check so a manual override that already stamped
        // these fields is not overwritten.
        if (ex.preDeloadTargetWeight == null) {
          const tw = Number(ex.targetWeight ?? 0);
          if (tw > 0) ex.preDeloadTargetWeight = tw;
          ex.preDeloadSetTargets =
            Array.isArray(ex.setTargets) && ex.setTargets.length > 0
              ? JSON.parse(JSON.stringify(ex.setTargets))
              : null;
          ex.preDeloadSets = ex.sets ?? 3;
        }

        const equip = String(ex.equipment ?? 'barbell');
        if (Array.isArray(ex.setTargets) && ex.setTargets.length > 0) {
          ex.setTargets = ex.setTargets.map((st: any) => ({
            ...st,
            targetWeight: roundToEquipmentPrecision(
              Number(st.targetWeight ?? 0) * deloadFactor,
              equip,
            ),
          }));
          ex.targetWeight = Math.max(
            ...ex.setTargets.map((st: any) => Number(st.targetWeight ?? 0)),
          );
        } else {
          const tw = Number(ex.targetWeight ?? 0);
          if (tw > 0) {
            ex.targetWeight = roundToEquipmentPrecision(tw * deloadFactor, equip);
          }
        }
        ex.sets = Math.max(2, (ex.sets ?? 3) - 1);
        return ex;
      }),
    };
  });
}

/** §5 round helper — delegates to equipment-aware increments. */
function accessoryRoundNewWeight(weight: number, equipmentRaw: string): number {
  return roundToEquipmentIncrement(weight, equipmentRaw);
}

/** Top working set ≈ pyramid anchor × this factor (inverse when solving anchor from desired top weight). */
function pyramidTopSetPct(setCount: number): number {
  const n = Math.floor(Number(setCount)) || 0;
  return n === 5 ? 0.9 : 1;
}

/** Rebuild ladder after progressed anchor weight (delegates canonical W2+ pyramid builder). */
function buildProgressionPyramidSetTargets(
  anchor: number,
  setCount: number,
  priorSetTargets?: Array<{ targetRpe?: number; targetReps?: string }>,
): Week1PyramidTargetSet[] {
  let n = Math.floor(Number(setCount));
  if (!Number.isFinite(n) || !(n >= 3 && n <= 5)) n = 4;
  const reps = String(priorSetTargets?.[0]?.targetReps ?? '8');
  const rpeHint = Number(priorSetTargets?.[0]?.targetRpe ?? 8);
  return buildWeek1PyramidSetTargets(anchor, n, reps, rpeHint) ?? [];
}

/**
 * Stamp pyramid setTargets from desired TOP working set weight.
 * buildWeek1PyramidSetTargets treats anchor T as the top set (roundPlate(T)).
 */
// deno-lint-ignore no-explicit-any
function stampPyramidFromDesiredTopSet(
  exercise: any,
  desiredTopSet: number,
  equip: string,
): number {
  const topRounded = roundToEquipmentIncrement(desiredTopSet, equip);

  if (Array.isArray(exercise.setTargets) && exercise.setTargets.length >= 2) {
    const oldTopWeight = Math.max(
      ...exercise.setTargets.map((s: any) => Number(s.targetWeight ?? 0)),
    );
    if (oldTopWeight > 0) {
      exercise.setTargets = scalePyramidSetTargets(
        exercise.setTargets as PyramidSetTargetRow[],
        oldTopWeight,
        topRounded,
        equip,
      );
      exercise.targetWeight = topRounded;
      return topRounded;
    }
  }

  const setCount = Array.isArray(exercise.setTargets)
    ? exercise.setTargets.length
    : exercise.sets ?? 4;
  const nextTargets = buildProgressionPyramidSetTargets(
    topRounded,
    setCount,
    exercise.setTargets,
  );
  if (nextTargets.length > 0) {
    exercise.setTargets = nextTargets;
    const topWeight = Math.max(
      ...nextTargets.map((s) => Number(s.targetWeight ?? 0)),
    );
    exercise.targetWeight = topWeight;
    return topWeight;
  }
  exercise.targetWeight = topRounded;
  return topRounded;
}

function formatJordanSessionPrescription(
  weight: number,
  reps: string,
  targetRpe: number,
): string {
  const r =
    reps && String(reps).trim().length > 0 ? String(reps).trim() : '4';
  return `${weight} lbs × ${r} reps @ RPE ${targetRpe.toFixed(1)}`;
}

/** §6 Gap-tiers — accessories only (canonical gap vs accessory target RPE). */
function accessoryJordanCopyFromGap(
  gap: number,
  priorWeight: number,
  newWeight: number,
  avgLoggedRpe: number,
  weightDeltaLbs: number,
  repsPrescription: string,
  accessoryTargetRpe: number,
): { headline: string; body: string; sessionLine: string } {
  const avgStr = avgLoggedRpe.toFixed(1);
  const pw = Math.round(priorWeight);
  const nw = Math.round(newWeight);
  const incDisp = Math.abs(Math.round(weightDeltaLbs));

  let headline: string;
  let body: string;

  if (gap >= 3) {
    headline = 'Resetting the load — finding your real working weight';
    body =
      `${pw} lbs at RPE ${avgStr} is well below working intensity — jumping to ${nw} lbs to find a load that actually challenges you.`;
  } else if (gap >= 2) {
    headline = `Up ${incDisp} lbs — closing the gap`;
    body = `${pw} lbs at RPE ${avgStr} left too much in the tank.`;
  } else if (gap >= 1) {
    headline = `Up ${incDisp} lbs — building on last week`;
    body =
      `${pw} lbs at RPE ${avgStr} was within your range — adding load to keep the stimulus honest.`;
  } else if (gap >= 0) {
    headline = `Up ${incDisp} lbs — progressing as planned`;
    body =
      'On target last week. Small load increase for continued adaptation.';
  } else if (gap >= -1 && gap < 0) {
    headline = 'Same load — recovery priority';
    body =
      'Last week ran harder than the target — holding weight to let the adaptation land before pushing again.';
  } else {
    headline = 'Pulling back the load';
    body =
      "Last week's effort was above sustainable intensity. Reducing weight to restore quality reps.";
  }

  return {
    headline,
    body,
    sessionLine: formatJordanSessionPrescription(nw, repsPrescription, accessoryTargetRpe),
  };
}

/** §6 Strength programme target lift copy (weights vs logged top-set anchor). */
function strengthTargetJordanCopyFromProgress(
  priorTopSetWeight: number,
  newWeight: number,
  newPeriodisationSets: number,
  newPeriodisationReps: number,
  newPeriodisationTargetRpe: number,
  nextWeekNumber: number,
  weightIncrement: number,
): { headline: string; body: string; sessionLine: string } {
  const nwRounded = Math.round(newWeight / 2.5) * 2.5;
  const repsStr = String(newPeriodisationReps);
  const sessionLine = formatJordanSessionPrescription(
    nwRounded,
    repsStr,
    newPeriodisationTargetRpe,
  );

  const incRounded = Math.abs(Math.round(weightIncrement));
  if (priorTopSetWeight <= 0) {
    return {
      headline: `Week ${nextWeekNumber} intensity block`,
      body: `Moving into ${newPeriodisationSets}×${repsStr}.`,
      sessionLine,
    };
  }

  const pctChange = (nwRounded - priorTopSetWeight) / priorTopSetWeight;
  if (pctChange > 0.01) {
    return {
      headline: `Up ${incRounded} lbs — Week ${nextWeekNumber} intensity block`,
      body:
        `Moving into ${newPeriodisationSets}×${repsStr} — fewer reps, more load. This is where the strength build begins.`,
      sessionLine,
    };
  }
  if (pctChange < -0.01) {
    return {
      headline: 'Pulling back the load',
      body:
        "Last week's effort was above sustainable intensity. Reducing weight to restore quality reps.",
      sessionLine,
    };
  }
  return {
    headline: 'Same load — higher intensity',
    body:
      'Last week ran at the upper edge of the target. Keeping the weight and letting the rep scheme do the work.',
    sessionLine,
  };
}

function isExerciseSwappedThisWeek(exercise: {
  originalName?: string;
  name?: string;
  exerciseName?: string;
}): boolean {
  const original = String(exercise.originalName ?? '').trim();
  const current = String(exercise.name ?? exercise.exerciseName ?? '').trim();
  return (
    original.length > 0 && original.toLowerCase() !== current.toLowerCase()
  );
}

/** Large log vs prescription mismatch — meaningless when the slot was swapped. */
function isLoggingWeightAnomaly(
  loggedWeight: number,
  planBaseline: number,
  wasSwapped: boolean,
): boolean {
  if (wasSwapped) return false;
  if (loggedWeight <= 0 || planBaseline <= 0) return false;
  return loggedWeight > planBaseline * 1.5 || loggedWeight < planBaseline * 0.5;
}

/**
 * Writes coaching / adaptation sheet fields AFTER targetWeight progression so copy matches prescription.
 * Pass accessoryTargetRpeForGap from last week's prescribed target RPE (prior periodisation row for heavy primary).
 */
// deno-lint-ignore no-explicit-any
function stampExerciseAdaptationCopyAfterProgression(params: {
  exercise: any;
  planBaseline: number;
  avgLoggedRpe: number;
  accessoryTargetRpeForGap: number;
  isTargetLiftEx: boolean;
  dayIsVolume: boolean;
  nextWeekNumber: number;
  wasSwapped?: boolean;
  loggedBaselineWeight?: number;
}): void {
  const {
    exercise,
    planBaseline,
    avgLoggedRpe,
    accessoryTargetRpeForGap,
    isTargetLiftEx,
    dayIsVolume,
    nextWeekNumber,
    wasSwapped = false,
    loggedBaselineWeight,
  } = params;

  const newWeight = Number(exercise.targetWeight ?? 0);
  const prevWeight =
    loggedBaselineWeight != null && loggedBaselineWeight > 0
      ? loggedBaselineWeight
      : planBaseline;
  const diff = Math.round(newWeight - prevWeight);
  const gap = computeRpeGap(avgLoggedRpe, accessoryTargetRpeForGap);

  let headline: string;
  let body: string;

  if (wasSwapped) {
    const originalName = String(exercise.originalName ?? '').trim();
    const displayName = String(
      exercise.name ?? exercise.exerciseName ?? '',
    ).trim();
    headline = `New exercise baseline — ${newWeight} lbs`;
    body =
      `Switched from ${originalName} — starting fresh at ${newWeight} lbs for ${displayName}.`;
  } else if (diff > 0) {
    if (gap >= 3) {
      headline = `Up ${diff} lbs — closing the gap`;
      body =
        `${prevWeight} lbs at RPE ${avgLoggedRpe.toFixed(1)} is well below working intensity — jumping to ${newWeight} lbs to find a load that actually challenges you.`;
    } else if (gap >= 2) {
      headline = `Up ${diff} lbs — closing the gap`;
      body =
        `${prevWeight} lbs at RPE ${avgLoggedRpe.toFixed(1)} left too much in the tank. Adding load to bring the stimulus in line with your target.`;
    } else if (gap >= 1) {
      headline = `Up ${diff} lbs — building on last week`;
      body =
        `${prevWeight} lbs at RPE ${avgLoggedRpe.toFixed(1)} was within your range — adding load to keep the stimulus honest.`;
    } else {
      headline = `Up ${diff} lbs — building on last week`;
      body = `On target last week. Small load increase for continued adaptation.`;
    }
  } else if (diff < 0) {
    headline = `Down ${Math.abs(diff)} lbs — recovery week`;
    body =
      `Last week's effort was above sustainable intensity. Reducing weight to restore quality reps.`;
  } else if (gap >= -1) {
    headline = 'Same load — on track';
    body =
      `Last week ran harder than the target — holding weight this session to let the adaptation land before pushing again.`;
  } else {
    headline = 'Same load — on track';
    body = `RPE averaged ${avgLoggedRpe.toFixed(1)} — right on target. Holding weight this week.`;
  }

  if (isTargetLiftEx && !dayIsVolume && !wasSwapped) {
    const newPeriodisationReps = exercise.reps;
    if (diff > 0) {
      headline = `Up ${diff} lbs — Week ${nextWeekNumber} intensity block`;
      body =
        `Moving into ${exercise.sets}×${newPeriodisationReps} — fewer reps, more load. This is where the strength build begins.`;
    } else {
      headline = 'Same load — higher intensity';
      body =
        `Last week ran at the upper edge of the target. Keeping the weight and letting the rep scheme do the work this week.`;
    }
  }

  exercise.coachingNote = body;

  if ('adaptationReason' in exercise) {
    exercise.adaptationReason = headline;
  }

  exercise.adaptationHeadline = headline;
  exercise.adaptationBody = body;
  const tr = Number(exercise.targetRpe ?? 0);
  exercise.adaptationThisSession =
    `${newWeight} lbs × ${String(exercise.reps)} reps @ RPE ${
      Number.isFinite(tr) ? tr.toFixed(1) : String(exercise.targetRpe ?? '?')
    }`;
}

/** Re-stamp adaptationThisSession after pipeline steps that tweak reps/targetRpe (e.g. periodisation finalize, volume reps). */
// deno-lint-ignore no-explicit-any
function refreshAdaptationThisSessionSummaries(days: any[] | undefined): any[] {
  return (days ?? []).map((day: any) => {
    if (day.type !== 'workout') return day;
    return {
      ...day,
      exercises: (day.exercises ?? []).map((exercise: any) => {
        if (
          exercise.adaptationHeadline === undefined &&
          exercise.adaptationThisSession === undefined
        ) {
          return exercise;
        }
        const nw = Number(exercise.targetWeight ?? 0);
        const tr = Number(exercise.targetRpe ?? 0);
        return {
          ...exercise,
          adaptationThisSession: `${nw} lbs × ${String(exercise.reps)} reps @ RPE ${
            Number.isFinite(tr)
              ? tr.toFixed(1)
              : String(exercise.targetRpe ?? '?')
          }`,
        };
      }),
    };
  });
}

/** Keep every exercise slot from the completed week; overlay safe AI narrative fields only. */
function mergeExerciseListsPreservePrior(
  priorList: any[] | undefined | null,
  aiList: any[] | undefined | null,
): any[] {
  const prev = Array.isArray(priorList) ? priorList : [];
  const ai = Array.isArray(aiList) ? aiList : [];
  return prev.map((p, j) => {
    const out = JSON.parse(JSON.stringify(p));
    const a = ai[j];
    if (a && typeof a === 'object') {
      for (const k of ['coachingNote', 'sessionPhase', 'phase'] as const) {
        const v = a[k];
        if (v !== undefined && v !== null && v !== '') {
          (out as any)[k] = v;
        }
      }
    }
    return out;
  });
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
    const daysOnly = Array.isArray(claudeWeek?.days)
      ? claudeWeek.days
      : Array.isArray(claudeWeek?.sessions)
      ? claudeWeek.sessions
      : [];
    const { sessions: _s0, workouts: _w0, ...restCw } = claudeWeek ?? {};
    return {
      ...restCw,
      weekNumber,
      phase,
      days: daysOnly,
    };
  }
  const aiDays = Array.isArray(claudeWeek?.days)
    ? claudeWeek.days
    : Array.isArray(claudeWeek?.sessions)
    ? claudeWeek.sessions
    : [];
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
      title: prevDay.title ?? aiDay.title,
      muscleGroups: Array.isArray(prevDay.muscleGroups)
        ? prevDay.muscleGroups
        : (Array.isArray(aiDay.muscleGroups) ? aiDay.muscleGroups : []),
      sessionFocus:
        typeof aiDay.sessionFocus === 'string'
          ? aiDay.sessionFocus
          : (prevDay.sessionFocus ?? ''),
      weekNumber,
      exercises: mergeExerciseListsPreservePrior(
        prevDay.exercises,
        aiDay.exercises,
      ),
    };
  });
  const { sessions: _s1, workouts: _w1, ...claudeRest } = claudeWeek ?? {};
  return {
    ...claudeRest,
    weekNumber,
    phase,
    days: mergedDays,
  };
}

/** GAP-7b: Exercise name → equipment type for weight rounding in generate-next-week. */
const EQUIPMENT_MAP: Record<string, string> = {
  // Barbell
  'barbell bench press': 'barbell',
  'incline barbell bench press': 'barbell',
  'incline barbell press': 'barbell',
  'decline bench press': 'barbell',
  'close-grip bench press': 'barbell',
  'close grip bench press': 'barbell',
  'barbell row': 'barbell',
  'bent-over row': 'barbell',
  'bent over row': 'barbell',
  'pendlay row': 'barbell',
  't-bar row': 'barbell',
  'barbell curl': 'barbell',
  'ez bar curl': 'barbell',
  'ez-bar curl': 'barbell',
  'preacher curl': 'barbell',
  'skull crushers': 'barbell',
  'overhead press': 'barbell',
  'back squat': 'barbell',
  'front squat': 'barbell',
  'deadlift': 'barbell',
  'romanian deadlift': 'barbell',
  'stiff-leg deadlift': 'barbell',
  'sumo deadlift': 'barbell',
  'good morning': 'barbell',
  'good mornings': 'barbell',
  'barbell shrug': 'barbell',
  'upright row': 'barbell',
  'reverse curl': 'barbell',
  'wrist curl': 'barbell',
  'reverse wrist curl': 'barbell',
  'hip thrust': 'barbell',
  // Dumbbell
  'dumbbell bench press': 'dumbbell',
  'incline dumbbell press': 'dumbbell',
  'dumbbell chest fly': 'dumbbell',
  'dumbbell row': 'dumbbell',
  'dumbbell shoulder press': 'dumbbell',
  'arnold press': 'dumbbell',
  'dumbbell lateral raise': 'dumbbell',
  'dumbbell lateral raises': 'dumbbell',
  'lateral raise': 'dumbbell',
  'lateral raises': 'dumbbell',
  'db lateral raise': 'dumbbell',
  'db lateral raises': 'dumbbell',
  'side lateral raise': 'dumbbell',
  'side raises': 'dumbbell',
  'dumbbell side raise': 'dumbbell',
  'dumbbell front raise': 'dumbbell',
  'front raise': 'dumbbell',
  'dumbbell rear delt fly': 'dumbbell',
  'dumbbell fly': 'dumbbell',
  'dumbbell flys': 'dumbbell',
  'reverse dumbbell fly': 'dumbbell',
  'dumbbell curl': 'dumbbell',
  'hammer curl': 'dumbbell',
  'incline dumbbell curl': 'dumbbell',
  'dumbbell tricep kickback': 'dumbbell',
  'dumbbell romanian deadlift': 'dumbbell',
  'bulgarian split squat': 'dumbbell',
  'walking lunge': 'dumbbell',
  'walking lunges': 'dumbbell',
  'goblet squat': 'dumbbell',
  'dumbbell shrug': 'dumbbell',
  'dumbbell calf raise': 'dumbbell',
  'dumbbell wrist curl': 'dumbbell',
  'farmer carry': 'dumbbell',
  // Cable
  'cable chest fly': 'cable',
  'cable fly': 'cable',
  'cable lateral raises': 'cable',
  'cable lateral raise': 'cable',
  'face pull': 'cable',
  'face pulls': 'cable',
  'seated cable row': 'cable',
  'cable row': 'cable',
  'lat pulldown': 'cable',
  'straight-arm pulldown': 'cable',
  'straight arm pulldown': 'cable',
  'tricep pushdown': 'cable',
  'rope pushdown': 'cable',
  'overhead tricep extension': 'cable',
  'cable overhead extension': 'cable',
  'cable curl': 'cable',
  'cable kickback': 'cable',
  'cable pull-through': 'cable',
  'cable shrug': 'cable',
  'pallof press': 'cable',
  'cable crunch': 'cable',
  // Machine
  'machine chest press': 'machine',
  'machine row': 'machine',
  'machine shoulder press': 'machine',
  'leg press': 'machine',
  'leg extension': 'machine',
  'leg curl': 'machine',
  'lying leg curl': 'machine',
  'hack squat': 'machine',
  'calf raises': 'machine',
  'calf raise': 'machine',
  'standing calf raises': 'machine',
  'seated calf raises': 'machine',
  'standing calf raise': 'machine',
  'seated calf raise': 'machine',
  'leg press calf raise': 'machine',
  'smith machine calf raise': 'machine',
  // Bodyweight
  'pull-up': 'bodyweight',
  'pull up': 'bodyweight',
  'chin-up': 'bodyweight',
  'chin up': 'bodyweight',
  'push-up': 'bodyweight',
  'dips': 'bodyweight',
  'plank': 'bodyweight',
  'hanging leg raise': 'bodyweight',
  'ab wheel rollout': 'bodyweight',
  'dead bug': 'bodyweight',
  'russian twist': 'bodyweight',
  'glute bridge': 'bodyweight',
  'nordic hamstring curl': 'bodyweight',
  // Kettlebell
  'kettlebell swing': 'kettlebell',
  'goblet squat (kb)': 'kettlebell',
  'kettlebell shrug': 'kettlebell',
};

const EQUIPMENT_ALIASES: Record<string, string> = {};

/**
 * Maps exercise names (lowercase) to their compoundTier.
 * Covers exercises used in plans; longest key first in lookup prevents partial match conflicts.
 */
const COMPOUND_TIER_MAP: Record<string, 'primary_compound' | 'secondary_compound' | 'isolation'> = {
  'barbell bench press': 'primary_compound',
  'back squat': 'primary_compound',
  'front squat': 'primary_compound',
  'deadlift': 'primary_compound',
  'sumo deadlift': 'primary_compound',
  'overhead press': 'primary_compound',
  'barbell row': 'primary_compound',
  'barbell bent-over row': 'primary_compound',
  'bent-over row': 'primary_compound',
  'pull-up': 'primary_compound',
  'pull-ups': 'primary_compound',
  'chin-up': 'primary_compound',
  'chin-ups': 'primary_compound',
  't-bar row': 'primary_compound',
  'incline barbell bench press': 'secondary_compound',
  'incline dumbbell press': 'secondary_compound',
  'dumbbell bench press': 'secondary_compound',
  'close grip bench press': 'secondary_compound',
  'close-grip bench press': 'secondary_compound',
  'dips': 'secondary_compound',
  'dumbbell row': 'secondary_compound',
  'dumbbell shoulder press': 'secondary_compound',
  'arnold press': 'secondary_compound',
  'machine shoulder press': 'secondary_compound',
  'machine chest press': 'secondary_compound',
  'machine row': 'secondary_compound',
  'seated cable row': 'secondary_compound',
  'lat pulldown': 'secondary_compound',
  'leg press': 'secondary_compound',
  'hack squat': 'secondary_compound',
  'bulgarian split squat': 'secondary_compound',
  'walking lunge': 'secondary_compound',
  'walking lunges': 'secondary_compound',
  'goblet squat': 'secondary_compound',
  'romanian deadlift': 'secondary_compound',
  'stiff-leg deadlift': 'secondary_compound',
  'stiff leg deadlift': 'secondary_compound',
  'dumbbell romanian deadlift': 'secondary_compound',
  'hip thrust': 'secondary_compound',
  'banded hip thrust': 'secondary_compound',
  'cable pull-through': 'secondary_compound',
  'glute bridge': 'secondary_compound',
  'push-up': 'secondary_compound',
  'push-ups': 'secondary_compound',
  'upright row': 'secondary_compound',
  'farmer carry': 'secondary_compound',
  'kettlebell swing': 'secondary_compound',
  'ab wheel rollout': 'secondary_compound',
  'plank': 'secondary_compound',
  'pallof press': 'secondary_compound',
  // Short-name variants Claude commonly uses (exact match before partial)
  'barbell curl': 'isolation',
  'barbell hip thrust': 'secondary_compound',
  'barbell shrug': 'isolation',
  'barbell squat': 'primary_compound',
  'barbell bent over row': 'primary_compound',
  'bench press': 'primary_compound',
  'bent over row': 'primary_compound',
  'cable rows': 'secondary_compound',
  'calf raises': 'isolation',
  'chinups': 'primary_compound',
  'conventional deadlift': 'primary_compound',
  'face pull': 'isolation',
  'face pulls': 'isolation',
  'hammer curls': 'isolation',
  'hip thrusts': 'secondary_compound',
  'lateral raise': 'isolation',
  'lateral raises': 'isolation',
  'lat pulldowns': 'secondary_compound',
  'leg curls': 'isolation',
  'leg extensions': 'isolation',
  'military press': 'primary_compound',
  'ohp': 'primary_compound',
  'pullups': 'primary_compound',
  'russian twists': 'isolation',
  'squat': 'primary_compound',
  'tricep dips': 'secondary_compound',
};

function getCompoundTierFromName(
  name: string,
): 'primary_compound' | 'secondary_compound' | 'isolation' {
  const lower = name.toLowerCase().trim();

  if (COMPOUND_TIER_MAP[lower]) return COMPOUND_TIER_MAP[lower];

  const stripped = lower
    .replace(
      /^(barbell|dumbbell|cable|machine|kettlebell|banded|smith machine|incline|decline|flat|sumo|conventional|close grip|close-grip|wide grip|wide-grip|narrow grip|paused|tempo)\s+/g,
      '',
    )
    .trim();
  if (stripped !== lower && COMPOUND_TIER_MAP[stripped]) {
    return COMPOUND_TIER_MAP[stripped];
  }

  const keys = Object.keys(COMPOUND_TIER_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (lower.includes(key) || key.includes(lower)) {
      return COMPOUND_TIER_MAP[key];
    }
  }

  return 'isolation';
}

// deno-lint-ignore no-explicit-any
function stampEquipment(exercises: any[]): any[] {
  // Sort entries by key length descending — longer keys are more specific
  const sortedEntries = [
    ...Object.entries(EQUIPMENT_MAP),
    ...Object.entries(EQUIPMENT_ALIASES ?? {}),
  ].sort((a, b) => b[0].length - a[0].length);

  return exercises.map((ex) => {
    const key = String(ex.name ?? '').toLowerCase().trim();

    // 1. Exact match
    if (EQUIPMENT_MAP[key]) return { ...ex, equipment: EQUIPMENT_MAP[key] };

    // 2. Partial match — longer keys first prevents "lateral raise" (dumbbell)
    //    from matching before "cable lateral raise" (cable)
    for (const [mapKey, equip] of sortedEntries) {
      if (key.includes(mapKey) || mapKey.includes(key)) {
        return { ...ex, equipment: equip };
      }
    }

    // 3. Fallback — keep existing or default to barbell
    return { ...ex, equipment: ex.equipment ?? 'barbell' };
  });
}

/** Tier + programme target lift + equipment stamping (matches generate-plan). */
// deno-lint-ignore no-explicit-any
function enforceSetStructure(
  exercises: any[],
  goal: string,
  strengthTargetLift?: string | null,
): any[] {
  return exercises.map((ex) => {
    const compoundTier = getCompoundTierFromName(String(ex.name ?? ''));
    const equipment = String(ex.equipment ?? 'barbell');

    return enforceSetStructureExercise(
      { ...ex, compoundTier, equipment },
      goal,
      strengthTargetLift,
    );
  });
}

/** Returns the appropriate weight rounding increment for the given equipment type. */
function getRoundingIncrement(equipment: string): number {
  switch (equipment) {
    case 'barbell':
      return 2.5;
    case 'dumbbell':
      return 5;
    case 'cable':
      return 5;
    case 'machine':
      return 5;
    case 'kettlebell':
      return 8; // ~4kg standard KB jump
    case 'bodyweight':
      return 0; // no weight to round
    default:
      return 2.5; // safe barbell default
  }
}

/** Drop stale pyramid rows before applying new weight (W2+ rebuild fills setTargets downstream). */
// deno-lint-ignore no-explicit-any
function stripSetTargetsFromExercise(ex: any): any {
  if (ex == null || typeof ex !== 'object') return ex;
  const { setTargets: _omit, ...rest } = ex;
  return rest;
}

/**
 * After all targetWeights are final: stamp setTargets from PRD ladder (`buildWeek1PyramidSetTargets`).
 * Runs before strength-programme periodisation stamp.
 */
// deno-lint-ignore no-explicit-any
function rebuildPyramidAccessorySetTargetsAfterWeights(
  days: any[] | undefined,
  goal: string,
  goalLift: string | null,
): any[] {
  return (days ?? []).map((day: any) => {
    if (day.type !== 'workout') return day;
    return {
      ...day,
      exercises: (day.exercises ?? []).map((ex: any) => {
        if (goal === 'strength' && goalLift && isStrengthGoalTargetLift(ex, goalLift)) {
          const stripped = stripSetTargetsFromExercise(ex);
          return { ...stripped, setStructure: 'straight' };
        }

        const tw = Number(ex.targetWeight ?? 0);

        if ((ex.setStructure ?? '') === 'straight' || !Number.isFinite(tw) || tw <= 0) {
          return stripSetTargetsFromExercise(ex);
        }

        const pyramid =
          isPyramidExercise(ex) ||
          (ex.setStructure ?? '') === 'pyramid';

        if (!pyramid) {
          return stripSetTargetsFromExercise(ex);
        }

        const equip = String(ex.equipment ?? 'barbell');

        if (Array.isArray(ex.setTargets) && ex.setTargets.length >= 2) {
          const oldTopWeight = Math.max(
            ...ex.setTargets.map((st: any) => Number(st.targetWeight ?? 0)),
          );
          if (oldTopWeight > 0 && Math.abs(tw - oldTopWeight) >= 0.01) {
            return {
              ...stripSetTargetsFromExercise(ex),
              targetWeight: tw,
              setTargets: scalePyramidSetTargets(
                ex.setTargets as PyramidSetTargetRow[],
                oldTopWeight,
                tw,
                equip,
              ),
              setStructure: 'pyramid' as const,
            };
          }
          if (oldTopWeight > 0) {
            return {
              ...ex,
              targetWeight: tw,
              setStructure: 'pyramid' as const,
            };
          }
        }

        const setCount =
          typeof ex.sets === 'number' && Number.isFinite(ex.sets)
            ? Math.floor(Number(ex.sets))
            : Array.isArray(ex.setTargets) && ex.setTargets.length > 0
              ? ex.setTargets.length
              : 4;

        const targets = buildWeek1PyramidSetTargets(
          tw,
          setCount,
          String(ex.reps ?? ''),
          Number(ex.targetRpe ?? 8),
        );
        if (targets == null) {
          return stripSetTargetsFromExercise(ex);
        }
        return {
          ...stripSetTargetsFromExercise(ex),
          targetWeight: tw,
          setTargets: targets,
          setStructure: 'pyramid' as const,
        };
      }),
    };
  });
}

/** Map plan_json exercise id / exerciseId → display name so logs keyed by UUID still resolve. */
function mergeExerciseIdMapFromPriorPlanDays(
  base: Record<string, string>,
  priorWeekPlanDays: any[],
): Record<string, string> {
  const out: Record<string, string> = { ...base };
  for (const day of priorWeekPlanDays ?? []) {
    for (const pex of day.exercises ?? []) {
      const nm = String(pex?.exerciseName ?? pex?.name ?? '').trim();
      if (!nm) continue;
      if (pex?.id != null && String(pex.id).trim() !== '') {
        out[String(pex.id).trim()] = nm;
      }
      if (pex?.exerciseId != null && String(pex.exerciseId).trim() !== '') {
        out[String(pex.exerciseId).trim()] = nm;
      }
    }
  }
  return out;
}

/** workout_logs.sets_json may arrive as array or JSON string from Postgres. */
function parseSetsJson(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

type ExerciseNameMatchKind =
  | 'exact'
  | 'case_insensitive'
  | 'normalized'
  | 'partial'
  | null;

/**
 * Conservative normalize for log ↔ plan matching: lowercase, strip parenthetical
 * qualifiers only (e.g. grip/attachment in parens), collapse whitespace.
 * Equipment and grip words outside parens are kept to avoid false positives.
 */
function normalizeExerciseNameForMatch(raw: string): string {
  let s = String(raw ?? '').toLowerCase().trim();
  s = s.replace(/\([^)]*\)/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Partial match: longer normalized name contains shorter (longest key first). */
function normalizedNamesPartialMatch(normPlan: string, normLog: string): boolean {
  if (!normPlan || !normLog) return false;
  const longer = normPlan.length >= normLog.length ? normPlan : normLog;
  const shorter = normPlan.length >= normLog.length ? normLog : normPlan;
  if (shorter.length < 3) return false;
  return longer.includes(shorter);
}

/**
 * Match plan exercise name to a logged set name (sets_json exerciseName).
 * Order: exact → case-insensitive → normalized → partial.
 */
function findExerciseDataKey(
  planName: string,
  logName: string,
): ExerciseNameMatchKind {
  const plan = String(planName ?? '').trim();
  const log = String(logName ?? '').trim();
  if (!plan || !log) return null;

  if (plan === log) return 'exact';

  const planLower = plan.toLowerCase();
  const logLower = log.toLowerCase();
  if (planLower === logLower) return 'case_insensitive';

  const normPlan = normalizeExerciseNameForMatch(plan);
  const normLog = normalizeExerciseNameForMatch(log);
  if (normPlan && normLog && normPlan === normLog) return 'normalized';

  if (normalizedNamesPartialMatch(normPlan, normLog)) return 'partial';

  return null;
}

function resolveSetExerciseDisplayName(
  set: any,
  exerciseIdToName: Record<string, string>,
): string {
  const id = set.exerciseId != null ? String(set.exerciseId).trim() : '';
  const fromId = id && exerciseIdToName[id] ? exerciseIdToName[id] : '';
  return String(set.exerciseName ?? set.name ?? fromId ?? '').trim();
}

function getExerciseSets(
  allSets: any[],
  exercise: any,
  exerciseIdToName: Record<string, string> = {},
): any[] {
  const planName = String(exercise.exerciseName ?? exercise.name ?? '').trim();

  const targetIds = new Set<string>();
  if (exercise.id != null && String(exercise.id).trim() !== '') {
    targetIds.add(String(exercise.id).trim());
  }
  if (exercise.exerciseId != null && String(exercise.exerciseId).trim() !== '') {
    targetIds.add(String(exercise.exerciseId).trim());
  }

  if (!planName && targetIds.size === 0) return [];

  const matched: any[] = [];
  let loggedNormalizationMatch = false;

  for (const s of allSets) {
    const setId = s.exerciseId != null ? String(s.exerciseId).trim() : '';
    if (setId && targetIds.has(setId)) {
      matched.push(s);
      continue;
    }

    if (!planName) continue;

    const logName = resolveSetExerciseDisplayName(s, exerciseIdToName);
    const matchKind = findExerciseDataKey(planName, logName);
    if (!matchKind) continue;

    if (!loggedNormalizationMatch) {
      if (matchKind === 'normalized') {
        console.log(
          `[NAME MATCH] "${planName}" matched "${logName}" via normalization`,
        );
        loggedNormalizationMatch = true;
      } else if (matchKind === 'partial') {
        console.log(
          `[NAME MATCH] "${planName}" matched "${logName}" via partial match`,
        );
        loggedNormalizationMatch = true;
      }
    }

    matched.push(s);
  }

  if (matched.length === 0 && planName) {
    console.log(`[NAME MISS] "${planName}" — no sets found in log`);
  }

  return matched;
}

/** Map exercise display name → completed-week plan exercise (targetWeight baseline). Heavy vs volume split so same exercise on both days does not overwrite. */
// deno-lint-ignore no-explicit-any
function buildPriorPlanHeavyVolumeMaps(
  planJson: any,
  completedWeekNumber: number,
): { heavy: Map<string, any>; volume: Map<string, any> } {
  const priorHeavyExerciseMap = new Map<string, any>();
  const priorVolumeExerciseMap = new Map<string, any>();
  const weeks = planJson?.weeks ?? [];
  const completedNorm = Number(completedWeekNumber);
  /** Prefer weekNumber lookup — blindly using weeks[idx] breaks when ordering or gaps mismatch weekNumber. */
  let resolvedVia: string = 'missing';
  let priorWeek: any =
    weeks.find((w: any) => Number(w.weekNumber) === completedNorm);
  if (priorWeek) {
    resolvedVia = 'weekNumber-find-number';
  } else {
    priorWeek = weeks.find(
      (w: any) => String(w.weekNumber) === String(completedWeekNumber),
    );
    if (priorWeek) resolvedVia = 'weekNumber-find-string';
    else if (Number.isFinite(completedNorm) && completedNorm > 0) {
      priorWeek = weeks[completedNorm - 1];
      if (priorWeek != null) resolvedVia = 'array-index-fallback';
    }
  }
  const priorWeekDays =
    priorWeek?.days ?? priorWeek?.sessions ?? priorWeek?.workouts ?? [];

  console.log('[PRIOR WEEK RESOLVED]', {
    completedWeekNumber: completedNorm,
    priorWeekNumberField: priorWeek?.weekNumber,
    dayCount: priorWeekDays.length,
    resolvedVia,
  });
  console.log('[PRIOR WEEK DAYS]', {
    count: priorWeekDays.length,
    summaries: priorWeekDays.map((d: any) => ({
      title: d.title,
      dayNumber: d.dayNumber ?? d.day,
      type: d.type,
      exerciseCount: (d.exercises ?? []).length,
    })),
  });
  for (const day of priorWeekDays) {
    if ((day?.type ?? 'workout') === 'rest' || day?.type === 'cardio') {
      continue;
    }
    /** Match progression SESSION TYPE — title-only misses focus/label/liftDay/week1-slot volume hints. */
    const isVol = isVolumeDay(day, planJson);
    console.log('[MAP BUILD]', {
      dayTitle: day.title,
      dayNumber: day.dayNumber ?? day.day,
      isVolume: isVol,
      exerciseCount: (day.exercises ?? []).length,
      exerciseNamesPreview: (day.exercises ?? []).slice(0, 12).map(
        (e: any) =>
          String(e.exerciseName ?? e.name ?? '')
            .toLowerCase()
            .trim(),
      ),
      backSquatWeight: day.exercises?.find(
        (e: any) =>
          ((e.name ?? '') || (e.exerciseName ?? '')).toLowerCase() ===
            'back squat',
      )?.targetWeight ?? 'not found',
      benchPressWeight: day.exercises?.find(
        (e: any) =>
          ((e.name ?? '') || (e.exerciseName ?? '')).toLowerCase() ===
            'bench press',
      )?.targetWeight ?? 'not found',
    });
    const map = isVol ? priorVolumeExerciseMap : priorHeavyExerciseMap;

    for (const ex of day.exercises ?? []) {
      const name = String(ex.exerciseName ?? ex.name ?? '')
        .toLowerCase()
        .trim();
      // Index by current name only — never under originalName (swap slots).
      if (name) map.set(name, ex);
    }
  }
  console.log('[MAP CONTENTS]', {
    heavyMapSize: priorHeavyExerciseMap.size,
    heavyMapKeys: [...priorHeavyExerciseMap.keys()],
    volumeMapSize: priorVolumeExerciseMap.size,
    volumeMapKeys: [...priorVolumeExerciseMap.keys()],
  });
  return { heavy: priorHeavyExerciseMap, volume: priorVolumeExerciseMap };
}

/** Baseline increment anchor from prior week's prescription (not logged weights). */
// deno-lint-ignore no-explicit-any
function getPlanBaselineWeight(priorPlanExercise: any): number {
  if (!priorPlanExercise) return 0;

  // DC-1: prefer pre-deload fields so next week progresses from the weight
  // that was prescribed before the 85% reduction, not from the reduced value.
  const preTop = Number(priorPlanExercise.preDeloadTargetWeight ?? 0);
  if (preTop > 0) return preTop;
  const preTargets = priorPlanExercise.preDeloadSetTargets;
  if (Array.isArray(preTargets) && preTargets.length > 0) {
    const maxPre = Math.max(
      ...preTargets.map((s: any) => Number(s.targetWeight ?? 0)),
    );
    if (maxPre > 0) return maxPre;
  }

  if (
    priorPlanExercise.setStructure === 'pyramid' &&
    Array.isArray(priorPlanExercise.setTargets) &&
    priorPlanExercise.setTargets.length > 0
  ) {
    return Math.max(
      ...priorPlanExercise.setTargets.map(
        (s: any) => Number(s.targetWeight ?? 0),
      ),
    );
  }

  return Number(priorPlanExercise.targetWeight ?? 0);
}

function roundToEquipmentIncrement(weight: number, _equipment: string): number {
  return Math.round(weight / 5) * 5;
}

/** @deprecated alias — use roundToEquipmentIncrement */
function roundToEquipmentPrecision(weight: number, equipment: string): number {
  return roundToEquipmentIncrement(weight, equipment);
}

type PyramidSetTargetRow = {
  setNumber: number;
  targetWeight: number;
  targetRpe: number;
  targetReps: string;
};

function scalePyramidSetTargets(
  originalSetTargets: PyramidSetTargetRow[],
  oldTopWeight: number,
  newTopWeight: number,
  equipment: string,
): PyramidSetTargetRow[] {
  if (!originalSetTargets?.length || oldTopWeight === 0) {
    return originalSetTargets;
  }

  return originalSetTargets.map((set, index) => {
    const isLastSet = index === originalSetTargets.length - 1;

    if (isLastSet) {
      return { ...set, targetWeight: newTopWeight };
    }

    const ratio = Number(set.targetWeight ?? 0) / oldTopWeight;
    const scaled = newTopWeight * ratio;
    const rounded = roundToEquipmentIncrement(scaled, equipment);

    return { ...set, targetWeight: rounded };
  });
}

/** Update pyramid setTargets after top-set progression (hold / scale / W1 self-select build). */
// deno-lint-ignore no-explicit-any
function applyPyramidSetTargetsAfterProgression(
  exercise: any,
  matchingSets: LogSetLike[],
  newTargetWeight: number,
  loggedBaselineWeight: number,
  equip: string,
): void {
  if (!Array.isArray(exercise.setTargets) || exercise.setTargets.length === 0) {
    exercise.targetWeight = newTargetWeight;
    return;
  }

  const allZero = exercise.setTargets.every(
    (s: any) => Number(s.targetWeight ?? 0) === 0,
  );

  if (allZero) {
    const loggedWeights = matchingSets
      .map((s) => normalizeLogSetWeightLbs(s))
      .filter((w) => w > 0)
      .sort((a, b) => a - b);

    if (loggedWeights.length > 0) {
      exercise.setTargets = loggedWeights.map((w, i) => ({
        setNumber: i + 1,
        targetWeight: roundToEquipmentIncrement(w, equip),
        targetRpe: Number(exercise.targetRpe ?? 7),
        targetReps: String(exercise.reps ?? '8-12'),
      }));
      const builtTopWeight = Math.max(
        ...exercise.setTargets.map((s: any) => Number(s.targetWeight ?? 0)),
      );
      if (newTargetWeight !== builtTopWeight) {
        exercise.setTargets = scalePyramidSetTargets(
          exercise.setTargets as PyramidSetTargetRow[],
          builtTopWeight,
          newTargetWeight,
          equip,
        );
      }
    }
  } else if (
    newTargetWeight ===
    roundToEquipmentIncrement(loggedBaselineWeight, equip)
  ) {
    const existingTop = Math.max(
      ...exercise.setTargets.map((s: any) => Number(s.targetWeight ?? 0)),
    );
    if (existingTop !== newTargetWeight) {
      exercise.setTargets = exercise.setTargets.map(
        (s: any, i: number) =>
          i === exercise.setTargets.length - 1
            ? { ...s, targetWeight: newTargetWeight }
            : s,
      );
    }
  } else {
    const oldTopWeight = Math.max(
      ...exercise.setTargets.map((s: any) => Number(s.targetWeight ?? 0)),
    );
    exercise.setTargets = scalePyramidSetTargets(
      exercise.setTargets as PyramidSetTargetRow[],
      oldTopWeight,
      newTargetWeight,
      equip,
    );
  }

  exercise.targetWeight = newTargetWeight;
}

function getMaxWeeklyIncrease(equipment: string, compoundTier: string): number {
  const equip = String(equipment ?? 'barbell').toLowerCase();
  const tier = String(compoundTier ?? '');
  const isBarbellCompound =
    equip === 'barbell' &&
    (tier === 'primary_compound' || tier === 'secondary_compound');
  if (isBarbellCompound) return 10;
  if (equip === 'dumbbell' || equip === 'cable' || equip === 'machine') {
    return 10;
  }
  return Infinity;
}

/** Apply cap AFTER increment: rawIncrease = nextWeight - planBaseline. */
function applyMaxWeeklyIncrease(
  planBaseline: number,
  nextWeight: number,
  equipment: string,
  compoundTier: string,
): number {
  let rounded = roundToEquipmentPrecision(nextWeight, equipment);
  if (planBaseline <= 0 || rounded <= planBaseline) {
    return rounded;
  }
  const maxWeeklyIncrease = getMaxWeeklyIncrease(equipment, compoundTier);
  const rawIncrease = rounded - planBaseline;
  if (rawIncrease > maxWeeklyIncrease) {
    rounded = roundToEquipmentPrecision(
      planBaseline + maxWeeklyIncrease,
      equipment,
    );
  }
  return rounded;
}

/** Prior-week exercise for baseline: volume days prefer volume map, heavy days prefer heavy map. */
function getPrevWeekExerciseName(
  planJson: { weeks?: Array<{ weekNumber?: number; days?: Array<{ exercises?: Array<{ name?: string; exerciseName?: string }> }> }> },
  prevWeekNumber: number,
  dayIndex: number,
  exerciseIndex: number,
): string | null {
  const prevWeek = (planJson.weeks ?? []).find(
    (w) => Number(w.weekNumber) === prevWeekNumber,
  );
  const exercise =
    prevWeek?.days?.[dayIndex]?.exercises?.[exerciseIndex];
  return exercise?.name ?? exercise?.exerciseName ?? null;
}

type WorkoutLogRow = {
  week_number: number;
  sets_json?: unknown;
};

function findMostRecentLogForExercise(
  allLogs: WorkoutLogRow[],
  exerciseName: string,
  beforeWeekNumber: number,
): {
  weightLbs: number;
  rpe: number;
  weekNumber: number;
} | null {
  const sorted = [...allLogs].sort(
    (a, b) => Number(b.week_number) - Number(a.week_number),
  );
  const target = exerciseName.toLowerCase().trim();

  for (const log of sorted) {
    if (Number(log.week_number) >= beforeWeekNumber) continue;

    const sets = (log.sets_json ?? []) as Array<{
      exerciseName?: string;
      weightLbs?: number;
      rpe?: number;
    }>;

    const matchingSets = sets.filter(
      (s) =>
        String(s.exerciseName ?? '').toLowerCase().trim() === target &&
        Number(s.weightLbs ?? 0) > 0,
    );

    if (matchingSets.length > 0) {
      const topSet = matchingSets.reduce((best, s) =>
        Number(s.weightLbs ?? 0) > Number(best.weightLbs ?? 0) ? s : best,
      );
      return {
        weightLbs: Number(topSet.weightLbs ?? 0),
        rpe: Number(topSet.rpe ?? 7),
        weekNumber: Number(log.week_number),
      };
    }
  }
  return null;
}

function calculateWeightIncrement(
  avgLoggedRpe: number,
  targetRpe: number,
  equipment: string,
  compoundTier: string,
  trainingAge: string,
): number {
  return resolveAccessoryLoadIncrement(
    avgLoggedRpe,
    targetRpe,
    equipment,
    compoundTier,
    trainingAge,
  );
}

function resolvePriorPlanExercise(
  exName: string,
  dayIsVolume: boolean,
  isTargetLiftEx: boolean,
  priorHeavyExerciseMap: Map<string, any>,
  priorVolumeExerciseMap: Map<string, any>,
): any {
  if (isTargetLiftEx && !dayIsVolume) {
    return priorHeavyExerciseMap.get(exName) ?? null;
  }
  if (isTargetLiftEx && dayIsVolume) {
    return (
      priorVolumeExerciseMap.get(exName) ??
      priorHeavyExerciseMap.get(exName) ??
      null
    );
  }
  if (dayIsVolume) {
    return (
      priorVolumeExerciseMap.get(exName) ??
      priorHeavyExerciseMap.get(exName) ??
      null
    );
  }
  return (
    priorHeavyExerciseMap.get(exName) ??
    priorVolumeExerciseMap.get(exName) ??
    null
  );
}

function runProgressionTests(): void {
  const results: { name: string; pass: boolean; expected: unknown; got: unknown }[] = [];

  function check(name: string, expected: unknown, got: unknown) {
    const pass = JSON.stringify(expected) === JSON.stringify(got);
    results.push({ name, pass, expected, got });
  }

  function buildSetTargets(
    anchor: number,
    setCount: number,
    priorSetTargets?: Array<{ targetRpe?: number; targetReps?: string }>,
  ): Week1PyramidTargetSet[] {
    const reps = String(priorSetTargets?.[0]?.targetReps ?? '8');
    const rpeHint = Number(priorSetTargets?.[0]?.targetRpe ?? 8);
    return buildWeek1PyramidSetTargets(anchor, setCount, reps, rpeHint) ?? [];
  }

  // ── isTargetLift ──────────────────────────────────────────
  check('isTargetLift: exact match bench_press',
    true, isTargetLift({ name: 'bench press' }, 'bench_press'));
  check('isTargetLift: close grip should NOT match',
    false, isTargetLift({ name: 'close grip bench press' }, 'bench_press'));
  check('isTargetLift: incline should NOT match',
    false, isTargetLift({ name: 'incline bench press' }, 'bench_press'));
  check('isTargetLift: squat exact match',
    true, isTargetLift({ name: 'back squat' }, 'barbell_squat'));
  check('isTargetLift: bulgarian split should NOT match squat',
    false, isTargetLift({ name: 'bulgarian split squat' }, 'barbell_squat'));
  check('isTargetLift: deadlift exact match',
    true, isTargetLift({ name: 'deadlift' }, 'deadlift'));

  // ── getExerciseSets (flat sets_json — one row per session) ──
  const mockSetsFlat = [
    { exerciseId: 'e1', exerciseName: 'Bench Press', weightLbs: 140, rpe: 6 },
    { exerciseId: 'e1', exerciseName: 'Bench Press', weightLbs: 170, rpe: 6 },
    { exerciseId: 'e2', exerciseName: 'Back Squat', weightLbs: 315, rpe: 7 },
    { exerciseId: 'e3', exerciseName: 'Barbell Row', weightLbs: 185, rpe: 6 },
  ];
  const benchSets = getExerciseSets(mockSetsFlat, { name: 'Bench Press' });
  check('getExerciseSets: bench only', 2, benchSets.length);
  const benchMax = Math.max(
    0,
    ...benchSets.map((s: any) => s.weightLbs ?? s.weight ?? 0),
  );
  check('bench priorTopSetWeight = 170', 170, benchMax);
  const squatSets = getExerciseSets(mockSetsFlat, { name: 'Back Squat' });
  check('getExerciseSets: squat only', 1, squatSets.length);

  // ── computeRpeGap ─────────────────────────────────────────
  check('gap: RPE 6 vs target 7 = +1 (increase)',   1.0,
    parseFloat(computeRpeGap(6.0, 7.0).toFixed(1)));
  check('gap: RPE 8 vs target 7 = -1 (hold)',       -1.0,
    parseFloat(computeRpeGap(8.0, 7.0).toFixed(1)));
  check('gap: RPE 4 vs target 7 = +3 (reset)',      3.0,
    parseFloat(computeRpeGap(4.0, 7.0).toFixed(1)));
  check('gap: RPE 7 vs target 7 = 0 (on target)',   0.0,
    parseFloat(computeRpeGap(7.0, 7.0).toFixed(1)));

  // ── accessoryWeightIncrement ──────────────────────────────
  // Barbell
  check('barbell RPE 4.0 (gap+3) = +20', 20,
    accessoryWeightIncrement(4.0, 7.0, 'barbell'));
  check('barbell RPE 5.0 (gap+2) = +10', 10,
    accessoryWeightIncrement(5.0, 7.0, 'barbell'));
  check('barbell RPE 5.5 (gap+1.5) = +5', 5,
    accessoryWeightIncrement(5.5, 7.0, 'barbell'));
  check('barbell RPE 6.0 (gap+1) = +5', 5,
    accessoryWeightIncrement(6.0, 7.0, 'barbell'));
  check('barbell RPE 7.0 (gap 0) = +5', 5,
    accessoryWeightIncrement(7.0, 7.0, 'barbell'));
  check('barbell RPE 8.0 (gap-1) = 0', 0,
    accessoryWeightIncrement(8.0, 7.0, 'barbell'));
  check('barbell RPE 9.0 (gap-2) = -5', -5,
    accessoryWeightIncrement(9.0, 7.0, 'barbell'));
  check('barbell RPE 10 (gap-3) = -10', -10,
    accessoryWeightIncrement(10.0, 7.0, 'barbell'));
  // Cable
  check('cable RPE 4.0 (gap+3) = +15', 15,
    accessoryWeightIncrement(4.0, 7.0, 'cable'));
  check('cable RPE 5.0 (gap+2) = +10', 10,
    accessoryWeightIncrement(5.0, 7.0, 'cable'));
  check('cable RPE 8.0 (gap-1) = 0', 0,
    accessoryWeightIncrement(8.0, 7.0, 'cable'));
  // Dumbbell
  check('dumbbell RPE 5.0 (gap+2) = +10', 10,
    accessoryWeightIncrement(5.0, 7.0, 'dumbbell'));

  // ── strengthPeriodisation ─────────────────────────────────
  check('W1: 5x5 RPE7', { sets:5, reps:5, targetRpe:7.0 },
    strengthPeriodisation(1));
  check('W2: 4x4 RPE8', { sets:4, reps:4, targetRpe:8.0 },
    strengthPeriodisation(2));
  check('W3: 3x3 RPE8.5', { sets:3, reps:3, targetRpe:8.5 },
    strengthPeriodisation(3));
  check('W4 deload: 3x5 RPE6', { sets:3, reps:5, targetRpe:6.0 },
    strengthPeriodisation(4));

  // ── Target lift weight increments ────────────────────────
  // W1 RPE 6.0, target 7.0 → gap +1 → +5 → 280
  const benchW1Rpe6 = Math.round((275 + 5) / 2.5) * 2.5;
  check('bench W1 RPE6.0 → W2 = 280', 280, benchW1Rpe6);

  // W1 RPE 7.0, target 7.0 → gap 0 → +5 → 280
  const benchW1Rpe7 = Math.round((275 + 5) / 2.5) * 2.5;
  check('bench W1 RPE7.0 → W2 = 280', 280, benchW1Rpe7);

  // W1 RPE 9.0, target 7.0 → gap -2 → 0 → 275
  const benchW1Rpe9 = Math.round((275 + 0) / 2.5) * 2.5;
  check('bench W1 RPE9.0 → W2 = 275 (hold)', 275, benchW1Rpe9);

  // ── Accessory real-world cases from screenshots ───────────
  // Barbell Row: top set 185, RPE 5.5, target 7.0 → +5 → 190
  const rowIncrement = accessoryWeightIncrement(5.5, 7.0, 'barbell');
  const rowW2 = Math.round((185 + rowIncrement) / 2.5) * 2.5;
  check('Barbell Row RPE5.5 → W2 top set = 190', 190, rowW2);

  // Incline Dumbbell: top set 80, RPE 5.0, target 7.0 → +10 → 90
  const inclineIncrement = accessoryWeightIncrement(5.0, 7.0, 'dumbbell');
  const inclineW2 = Math.round((80 + inclineIncrement) / 2.5) * 2.5;
  check('Incline DB RPE5.0 → W2 top set = 90', 90, inclineW2);

  // Face Pulls: top set 50, RPE 4.0, target 7.0 → +15 → 65
  const faceIncrement = accessoryWeightIncrement(4.0, 7.0, 'cable');
  const faceW2 = Math.round((50 + faceIncrement) / 5) * 5;
  check('Face Pulls RPE4.0 → W2 = 65', 65, faceW2);

  // Close Grip Bench: NOT target lift, barbell, RPE 6.0, top 195 → +5 → 200
  const cgbpIsTarget = isTargetLift({ name: 'close grip bench press' }, 'bench_press');
  check('Close Grip NOT target lift', false, cgbpIsTarget);
  const cgbpIncrement = accessoryWeightIncrement(6.0, 7.0, 'barbell');
  const cgbpW2 = Math.round((195 + cgbpIncrement) / 2.5) * 2.5;
  check('Close Grip RPE6.0 → W2 = 200', 200, cgbpW2);

  // ── buildSetTargets → objects (delegates buildWeek1PyramidSetTargets) ──
  const rowTargets = buildSetTargets(190, 4);
  check('Barbell Row 4-set targets[0] (80%→10)', 150, rowTargets[0]?.targetWeight);
  check('Barbell Row 4-set targets[1] (90%→10)', 170, rowTargets[1]?.targetWeight);
  check('Barbell Row 4-set targets[2] (top→2.5)', 190, rowTargets[2]?.targetWeight);
  check('Barbell Row 4-set targets[3] (85%→10)', 160, rowTargets[3]?.targetWeight);

  // Pyramid back-calculation: accessory increment applies to logged top — anchor T rebuilt from ladder
  const newTW5 = Math.round((210 / 0.9) / 10) * 10;
  check('5-set back-calc targetWeight', 230, newTW5);
  const targets5 = buildSetTargets(230, 5);
  const top5 = Math.max(...targets5.map((s) => s.targetWeight));
  check('5-set new top set = 210', 210, top5);

  const newTW4 = Math.round(190 / 2.5) * 2.5;
  check('4-set back-calc targetWeight', 190, newTW4);
  const targets4 = buildSetTargets(190, 4);
  const top4 = Math.max(...targets4.map((s) => s.targetWeight));
  check('4-set new top set = 190', 190, top4);

  // ── PRINT RESULTS ─────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);

  console.log(`\n══════════════════════════════════════════`);
  console.log(`PROGRESSION TESTS: ${passed}/${results.length} passed`);
  console.log(`══════════════════════════════════════════`);

  if (failed.length > 0) {
    console.log('\nFAILED:');
    failed.forEach((r) => {
      console.log(`  ✗ ${r.name}`);
      console.log(`    expected: ${JSON.stringify(r.expected)}`);
      console.log(`    got:      ${JSON.stringify(r.got)}`);
    });
  } else {
    console.log('All tests passed ✓');
  }
  console.log('══════════════════════════════════════════\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;

    if (body?.mode === 'test') {
      runProgressionTests();

      type ScenarioPayload = {
        input?: unknown;
        output: unknown;
        expected?: unknown;
        pass: boolean;
      };

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );

      const inspect_plan_structure = await (async (): Promise<ScenarioPayload> => {
        const { data: plan, error } = await supabase
          .from('plans')
          .select('id, plan_json, current_week')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          return { pass: false, output: error.message };
        }
        if (!plan) return { pass: false, output: 'no active plan found' };

        const planJson = plan.plan_json;

        const topLevelLegacySlots = planJson?.sessions ?? [];
        const weeksArray = planJson?.weeks ?? [];
        const week1Days = weeksArray[0]?.days ?? [];
        const week2Days = weeksArray[1]?.days ?? [];

        const findVolumeDays = (days: any[]) =>
          days.filter((d: any) => {
            const t =
              `${d.title ?? ''} ${d.sessionFocus ?? ''}`.toLowerCase();
            return t.includes('volume');
          }).map((d: any) => ({
            dayNumber: d.dayNumber ?? d.day,
            title: d.title,
            type: d.type,
            sessionFocus: d.sessionFocus,
          }));

        return {
          pass: true,
          output: {
            planId: plan.id,
            currentWeek: plan.current_week,
            topLegacySessionSlots: topLevelLegacySlots.length,
            week1DayCount: week1Days.length,
            week1VolumeDaysFound: findVolumeDays(week1Days),
            week2DayCount: week2Days.length,
            week2VolumeDaysFound: findVolumeDays(week2Days),
            planJsonTopLevelKeys: Object.keys(planJson ?? {}),
          },
        };
      })();

      const inspect_week_structure = await (async (): Promise<ScenarioPayload> => {
        const { data: plan, error } = await supabase
          .from('plans')
          .select('plan_json')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          return { pass: false, output: error.message };
        }
        if (!plan) return { pass: false, output: 'no active plan found' };

        const planJson = plan.plan_json;
        const weeksArray = planJson?.weeks ?? [];
        const week1 = weeksArray[0] ?? {};

        const slots = (
          arr: Record<string, unknown> | Record<string, unknown>[] | unknown,
        ): any[] =>
          Array.isArray(arr) ? arr as any[] : [];

        return {
          pass: true,
          output: {
            weeksCount: weeksArray.length,
            week1Keys: Object.keys(week1),
            week1SessionsKey: week1.days
              ? 'days'
              : week1.sessions
              ? 'sessions'
              : week1.workouts
              ? 'workouts'
              : 'NOT FOUND',
            week1DaySlotCount:
              slots(week1.days ?? week1.sessions ?? week1.workouts ?? [])
                .length,
            firstDayKeys: slots(
              week1.days ?? week1.sessions ?? week1.workouts ?? [],
            )[0]
              ? Object.keys(
                slots(
                  week1.days ?? week1.sessions ?? week1.workouts ?? [],
                )[0] as Record<string, unknown>,
              )
              : [],
            firstDaySample: slots(
              week1.days ?? week1.sessions ?? week1.workouts ?? [],
            )[0] ?? null,
            secondDaySample: slots(
              week1.days ?? week1.sessions ?? week1.workouts ?? [],
            )[1] ?? null,
          },
        };
      })();

      const scenarios: Record<string, ScenarioPayload> = {
        bench_w1_to_w2: (() => {
          const mockExercise = {
            exerciseId: 'bench_press',
            exerciseName: 'Bench Press',
            equipment: 'barbell',
            setStructure: 'straight',
            sets: 5,
            reps: 5,
            targetRpe: 7.0,
            targetWeight: 275,
          };
          const mockSets = Array(5).fill(null).map((_, i) => ({
            exerciseName: 'Bench Press',
            weightLbs: 275,
            rpe: 6.0,
            isWarmup: false,
            setNumber: i + 1,
          }));
          const exerciseSets = getExerciseSets(mockSets, mockExercise);
          const priorTopSetWeight = Math.max(
            ...exerciseSets.map((s: any) => Number(s.weightLbs)),
          );
          const avgLoggedRpe = exerciseSets.reduce(
            (sum: number, s: any) => sum + s.rpe,
            0,
          ) / exerciseSets.length;
          const priorTargetRpe = strengthPeriodisation(1).targetRpe;
          const gap = computeRpeGap(avgLoggedRpe, priorTargetRpe);
          const increment = gap >= 2
            ? 10
            : gap >= 0
            ? 5
            : gap >= -1
            ? 5
            : gap >= -2
            ? 0
            : -5;
          const newWeight =
            Math.round((priorTopSetWeight + increment) / 2.5) * 2.5;
          const newPeriodisation = strengthPeriodisation(2);
          return {
            input: { priorTopSetWeight, avgLoggedRpe, gap },
            output: { newWeight, ...newPeriodisation },
            expected: {
              newWeight: 280,
              sets: 4,
              reps: 4,
              targetRpe: 8.0,
            },
            pass:
              newWeight === 280 && newPeriodisation.reps === 4,
          };
        })(),

        volume_day_reps: (() => {
          const mockSession = {
            title: 'Volume Upper',
            type: 'workout',
          };
          const detected = isVolumeDay(mockSession, undefined);
          const volumeReps = 8;
          return {
            input: { session: mockSession },
            output: { detected, volumeReps },
            expected: { detected: true, volumeReps: 8 },
            pass: detected === true && volumeReps === 8,
          };
        })(),

        dedup_most_recent_log: (() => {
          const mockLogs = [
            {
              day_number: 4,
              logged_at: '2026-05-01T10:00:00Z',
              sets_json: [
                { exerciseName: 'Good Morning', weightLbs: 315, rpe: 5 },
                { exerciseName: 'Good Morning', weightLbs: 315, rpe: 5 },
                { exerciseName: 'Good Morning', weightLbs: 315, rpe: 5 },
              ],
            },
            {
              day_number: 4,
              logged_at: '2026-05-10T10:00:00Z',
              sets_json: [
                { exerciseName: 'Good Morning', weightLbs: 95, rpe: 4.3 },
                { exerciseName: 'Good Morning', weightLbs: 95, rpe: 4.3 },
                { exerciseName: 'Good Morning', weightLbs: 95, rpe: 4.3 },
              ],
            },
          ];

          const sorted = [...mockLogs].sort(
            (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime(),
          );

          const seenDays = new Set<number>();
          const deduped = sorted.filter((log: any) => {
            const day = log.day_number;
            if (seenDays.has(day)) return false;
            seenDays.add(day);
            return true;
          });

          const allSets = deduped.flatMap((l: any) => l.sets_json);
          const gmSets = getExerciseSets(allSets, { exerciseName: 'Good Morning' });
          const topSet = gmSets.length > 0
            ? Math.max(...gmSets.map((s: any) => s.weightLbs))
            : 0;

          return {
            input: { logsForDay4: 2, oldWeight: 315, recentWeight: 95 },
            output: { dedupedCount: deduped.length, topSet },
            expected: { dedupedCount: 1, topSet: 95 },
            pass: deduped.length === 1 && topSet === 95,
          };
        })(),

        plan_baseline_w2: (() => {
          const mockPlanJson = {
            weeks: [{
              weekNumber: 1,
              days: [{
                dayNumber: 2,
                title: 'Lower Heavy',
                exercises: [{
                  name: 'Back Squat',
                  targetWeight: 237.5,
                  setStructure: 'straight',
                }],
              }],
            }],
          };

          const priorWeekIndex = 0;
          const priorWeek = mockPlanJson.weeks[priorWeekIndex];
          const priorWeekDays = priorWeek?.days ?? [];
          const map = new Map<string, any>();
          for (const day of priorWeekDays) {
            for (const ex of (day.exercises ?? [])) {
              map.set(String(ex.name ?? '').toLowerCase().trim(), ex);
            }
          }

          const priorEx = map.get('back squat');
          const baseline = getPlanBaselineWeight(priorEx);

          return {
            input: { w1TargetWeight: 237.5 },
            output: { baseline },
            expected: { baseline: 237.5 },
            pass: baseline === 237.5,
          };
        })(),

        plan_baseline_pyramid: (() => {
          const mockEx = {
            name: 'Barbell Row',
            setStructure: 'pyramid',
            targetWeight: 185,
            setTargets: [
              { setNumber: 1, targetWeight: 150 },
              { setNumber: 2, targetWeight: 170 },
              { setNumber: 3, targetWeight: 185 },
              { setNumber: 4, targetWeight: 160 },
            ],
          };
          const baseline = getPlanBaselineWeight(mockEx);
          return {
            input: { setTargets: [150, 170, 185, 160] },
            output: { baseline },
            expected: { baseline: 185 },
            pass: baseline === 185,
          };
        })(),

        heavy_vs_volume_baseline: (() => {
          const mockW1Days = [
            {
              title: 'Lower Heavy',
              exercises: [{
                name: 'Back Squat',
                targetWeight: 237.5,
                setStructure: 'straight',
              }],
            },
            {
              title: 'Lower Volume',
              exercises: [{
                name: 'Back Squat',
                targetWeight: 202.5,
                setStructure: 'straight',
              }],
            },
          ];

          const heavyMap = new Map<string, any>();
          const volumeMap = new Map<string, any>();
          for (const day of mockW1Days) {
            const isVol = day.title.toLowerCase().includes('volume');
            const map = isVol ? volumeMap : heavyMap;
            for (const ex of day.exercises) {
              map.set(ex.name.toLowerCase(), ex);
            }
          }

          const heavyBaseline = getPlanBaselineWeight(
            heavyMap.get('back squat'),
          );
          const volumeBaseline = getPlanBaselineWeight(
            volumeMap.get('back squat'),
          );

          return {
            input: { heavyWeight: 237.5, volumeWeight: 202.5 },
            output: { heavyBaseline, volumeBaseline },
            expected: { heavyBaseline: 237.5, volumeBaseline: 202.5 },
            pass:
              heavyBaseline === 237.5 && volumeBaseline === 202.5,
          };
        })(),

        volume_day_real_structure: (() => {
          const mockSession = {
            dayNumber: 3,
            title: 'Volume Upper',
            type: 'workout',
          };
          const mockPlanJson = {
            weeks: [{
              days: [
                { dayNumber: 1, title: 'Upper Heavy', type: 'workout' },
                { dayNumber: 2, title: 'Lower Heavy', type: 'workout' },
                { dayNumber: 3, title: 'Volume Upper', type: 'workout' },
                { dayNumber: 4, title: 'Lower Volume', type: 'workout' },
              ],
            }],
          };
          const detected = isVolumeDay(mockSession, mockPlanJson);
          return {
            input: { title: 'Volume Upper' },
            output: { detected },
            expected: { detected: true },
            pass: detected === true,
          };
        })(),

        heavy_day_real_structure: (() => {
          const mockSession = {
            dayNumber: 1,
            title: 'Upper Heavy',
            type: 'workout',
          };
          const mockPlanJson = {
            weeks: [{ days: [{ dayNumber: 1, title: 'Upper Heavy' }] }],
          };
          const detected = isVolumeDay(mockSession, mockPlanJson);
          return {
            input: { title: 'Upper Heavy' },
            output: { detected },
            expected: { detected: false },
            pass: detected === false,
          };
        })(),

        volume_lookup_by_day_number: (() => {
          const mockSession = { dayNumber: 3 };
          const mockPlanJson = {
            weeks: [{
              days: [
                { dayNumber: 1, title: 'Upper Heavy' },
                { dayNumber: 3, title: 'Volume Upper' },
              ],
            }],
          };
          const detected = isVolumeDay(mockSession, mockPlanJson);
          return {
            input: {
              sessionHasNoTitle: true,
              planDayTitle: 'Volume Upper',
            },
            output: { detected },
            expected: { detected: true },
            pass: detected === true,
          };
        })(),

        name_normalization: (() => {
          const mockSets = [
            { exerciseName: 'Barbell Curls', weightLbs: 85, rpe: 6.7 },
            { exerciseName: 'Barbell Curls', weightLbs: 85, rpe: 6.5 },
            { exerciseName: 'Barbell Curls', weightLbs: 85, rpe: 7.0 },
            {
              exerciseName: 'Close Grip Bench Press',
              weightLbs: 165,
              rpe: 5,
            },
          ];
          const exercise = { exerciseName: 'Barbell Curl', equipment: 'barbell' };
          const found = getExerciseSets(mockSets, exercise);
          const topSet = found.length > 0
            ? Math.max(...found.map((s: any) => s.weightLbs))
            : 0;
          return {
            input: {
              planName: 'Barbell Curl',
              loggedNames: [
                'Barbell Curls',
                'Close Grip Bench Press',
              ],
            },
            output: { setsFound: found.length, topSet },
            expected: { setsFound: 3, topSet: 85 },
            pass: found.length === 3 && topSet === 85,
          };
        })(),

        session_scoping: (() => {
          const day2Sets = [
            { exerciseName: 'Back Squat', weightLbs: 315, rpe: 7 },
            { exerciseName: 'Leg Press', weightLbs: 360, rpe: 4.5 },
            { exerciseName: 'Good Morning', weightLbs: 135, rpe: 5.3 },
          ];
          const legPress = {
            exerciseName: 'Leg Press',
            equipment: 'machine',
          };
          const found = getExerciseSets(day2Sets, legPress);
          const topSet = found.length > 0
            ? Math.max(...found.map((s: any) => s.weightLbs))
            : 0;
          return {
            input: {
              sessionSets: day2Sets.map((s) => s.exerciseName),
            },
            output: { setsFound: found.length, topSet },
            expected: { setsFound: 1, topSet: 360 },
            pass: found.length === 1 && topSet === 360,
          };
        })(),

        inspect_plan_structure,
        inspect_week_structure,
      };

      let scenarioEntries = Object.entries(scenarios);
      if (
        typeof body.scenario === 'string' &&
        body.scenario.trim().length > 0
      ) {
        const want = body.scenario.trim();
        scenarioEntries = scenarioEntries.filter(([name]) => name === want);
        if (scenarioEntries.length === 0) {
          return new Response(
            JSON.stringify({
              error: `Unknown scenario: "${want}". Available: ${
                Object.keys(scenarios).join(', ')
              }`,
            }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
              },
            },
          );
        }
      }

      const scenarioResults = scenarioEntries.map(([name, result]) => ({
        scenario: name,
        pass: result.pass,
        expected: result.expected,
        output: result.output,
      }));

      const allPassed = scenarioResults.every((r) => r.pass);

      return new Response(
        JSON.stringify({
          testHarness:
            'See Supabase logs for full progression suite output',
          scenarios: scenarioResults,
          allPassed,
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
          status: 200,
        },
      );
    }

    runProgressionTests();

    const { userId, planId, completedWeekNumber: completedWeekNumberRaw } = body;

    if (!userId || !planId || completedWeekNumberRaw == null) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, planId, completedWeekNumber' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const completedWeekNumber = Number(completedWeekNumberRaw);
    if (!Number.isFinite(completedWeekNumber) || completedWeekNumber < 1) {
      return new Response(
        JSON.stringify({ error: 'Invalid completedWeekNumber' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }
    const nextWeekNumber = completedWeekNumber + 1;

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
        // Prior week only: completed week === week index user just finished (= nextWeekNumber - 1)
        .eq('week_number', completedWeekNumber)
        .not('skipped', 'eq', true)
        // Most recent first — duplicated day_number rows (repeated tests) dedupe below
        .order('logged_at', { ascending: false }),
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

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const { data: freeSessions } = await supabase
      .from('free_sessions')
      .select('session_name, sets_json, session_fatigue_rating, logged_at')
      .eq('user_id', userId)
      .gte('logged_at', oneWeekAgo.toISOString())
      .order('logged_at', { ascending: false });

    const plan = planResult.data;
    const planJson = plan.plan_json;
    const priorLogs = logsResult.data ?? [];

    const seenDays = new Set<number>();
    const dedupedLogs = priorLogs.filter((log: any) => {
      const day = Number(log.day_number);
      if (!Number.isFinite(day)) return true;
      if (seenDays.has(day)) return false;
      seenDays.add(day);
      return true;
    });

    if (dedupedLogs[0]) {
      console.log(
        '[LOG ROW FIELDS]',
        JSON.stringify({
          allKeys: Object.keys(dedupedLogs[0]),
          exerciseField:
            dedupedLogs[0].exercise_name ??
            dedupedLogs[0].exerciseName ??
            dedupedLogs[0].exercise_id ??
            dedupedLogs[0].exerciseId ??
            'NOT FOUND',
        }),
      );
    }

    console.log('[GNW START] weekNumber:', nextWeekNumber,
      'planWeeksCount:', planJson?.weeks?.length);
    console.log('[LOGS QUERY]', {
      planId,
      completedWeekNumber,
      nextWeekNumber,
      priorWeekNumber: completedWeekNumber,
      logsFoundRaw: priorLogs.length,
      logsFoundDeduped: dedupedLogs.length,
      sampleWeights: dedupedLogs.slice(0, 3).map((l: any) => {
        const sets = Array.isArray(l.sets_json) ? l.sets_json : [];
        return {
          day: l.day_number,
          setCount: sets.length,
          exerciseNames: [
            ...new Set(
              sets.map(
                (s: any) =>
                  s.exerciseName ??
                  s.name ??
                  (s.exerciseId ? `id:${s.exerciseId}` : undefined),
              ),
            ),
          ],
          firstSet: sets[0]
            ? {
                exerciseName: sets[0].exerciseName,
                exerciseId: sets[0].exerciseId,
                weightLbs: sets[0].weightLbs,
              }
            : null,
        };
      }),
    });
    const profile = profileResult.data;
    const trainingAge: string = profile?.training_age ?? 'intermediate';
    const experienceRaw =
      (planJson as { experience?: string }).experience ?? trainingAge;
    const experienceForProgression = String(experienceRaw ?? 'intermediate')
      .toLowerCase()
      .trim();

    // Fetch goal type + strength target lift (for setStructure stamping)
    let goalType = 'general';
    let strengthTargetLiftFromGoal: string | null = null;
    if (plan.goal_id) {
      const { data: goalRow } = await supabase
        .from('goals')
        .select('goal_type, target_lift')
        .eq('id', plan.goal_id)
        .single();
      if (goalRow?.goal_type) goalType = goalRow.goal_type;
      if (goalRow?.target_lift != null && String(goalRow.target_lift).trim() !== '') {
        strengthTargetLiftFromGoal = String(goalRow.target_lift).trim();
      }
    }

    const totalWeeks: number = plan.total_weeks ?? planJson.totalWeeks ?? 12;
    const enhancedRecovery: boolean = planJson.enhancedRecovery === true;
    const concurrentSport = planJson.concurrentSport ?? null;
    // GAP-8: Sex-aware progression — read from plan_json where it was stored at plan creation
    const biologicalSex: string = planJson.biologicalSex ?? 'male';

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

    // DC-1: if the completed week was a deload (manual override or scheduled),
    // it is not a calibration week even when completedWeekNumber === 1.
    // isCalibrationWeek controls whether the logged-weight fallback in
    // resolveProgressionBaseline is allowed (it is only valid for a true
    // first-ever baseline week, not for a deload that happened to be week 1).
    const completedWeekWasDeload =
      weekData?.weekOverride?.type === 'deload' ||
      weekData?.phase === 'deload';
    const isCalibrationWeek =
      (completedWeekNumber === 1) && !completedWeekWasDeload;

    const completedWeekWasTravel =
      weekData?.weekOverride?.type === 'travel';
    const travelAffectedDayNumbers: number[] = completedWeekWasTravel
      ? (weekData.weekOverride.affectedDayNumbers ?? []).map(Number)
      : [];

    // Travel restore: replace affected days in weekData with their
    // pre-travel snapshots so the map is built from original exercises,
    // not travel substitutes. The travel week logs won't name-match the
    // original exercises so they're naturally invisible to getExerciseSets.
    let weekDataForMap = weekData;
    if (completedWeekWasTravel && travelAffectedDayNumbers.length > 0) {
      const snapshotDays: any[] =
        weekData.weekOverride.snapshot ?? [];
      const restoredDays = (weekData.days ?? []).map((day: any) => {
        if (!travelAffectedDayNumbers.includes(Number(day.dayNumber ?? day.day))) {
          return day;
        }
        const snapDay = snapshotDays.find(
          (s: any) =>
            Number(s.dayNumber ?? s.day) ===
            Number(day.dayNumber ?? day.day),
        );
        return snapDay ?? day;
      });
      weekDataForMap = { ...weekData, days: restoredDays };
    }

    const workoutDays = (weekDataForMap?.days ?? []).filter((d: any) => d.type === 'workout');
    const daysPerWeek: number = planJson.daysPerWeek ?? workoutDays.length;

    const { heavy: priorHeavyExerciseMap, volume: priorVolumeExerciseMap } =
      buildPriorPlanHeavyVolumeMaps(
        { ...planJson, weeks: (planJson.weeks ?? []).map((w: any) =>
          Number(w.weekNumber) === completedWeekNumber ? weekDataForMap : w
        )},
        completedWeekNumber,
      );

    let exerciseIdToName: Record<string, string> = {};
    for (const week of planJson.weeks ?? []) {
      for (const day of week.days ?? []) {
        exerciseIdToName = mergeExerciseIdMapFromPriorPlanDays(
          exerciseIdToName,
          [day],
        );
      }
    }

    // Step 4 — Compute performance metrics
    const distinctDays = new Set(dedupedLogs.map((l: any) => l.day_number)).size;
    const sessionsCompleted = distinctDays;
    const sessionsPlanned = daysPerWeek;
    const completionRate = sessionsPlanned > 0 ? sessionsCompleted / sessionsPlanned : 0;

    let completionTier: 'full' | 'partial' | 'low';
    if (completionRate >= 0.8) completionTier = 'full';
    else if (completionRate >= 0.6) completionTier = 'partial';
    else completionTier = 'low';

    const planGoalStr =
      typeof (planJson as { goal?: string }).goal === 'string' &&
        String((planJson as { goal?: string }).goal).length > 0
        ? String((planJson as { goal: string }).goal)
        : goalType;

    const strengthGoalLiftResolved =
      (planJson as { goalLift?: string | null }).goalLift ??
      (planJson as { targetLift?: string | null }).targetLift ??
      strengthTargetLiftFromGoal ??
      null;

    const week1BaselineFloorStored =
      Number((planJson as { week1BaselineWeight?: number }).week1BaselineWeight) || 0;

    const deloadCycleStored =
      Number((planJson as { deloadCycle?: number }).deloadCycle) || 4;

    // Step 5 — Determine next week phase
    // Female and enhanced recovery both use 5-week deload cadence
    const deloadCadence = (enhancedRecovery || biologicalSex === 'female') ? 5 : 4;
    const weekInCycle = nextWeekNumber % deloadCadence;
    let phase: string;
    if (weekInCycle === 0) {
      phase = 'deload';
    } else if (nextWeekNumber <= totalWeeks / 2) {
      phase = 'accumulation';
    } else {
      phase = 'intensification';
    }

    const exerciseAdaptations: any[] = [];

    // Deload overrides
    if (phase === 'deload') {
      for (const ex of exerciseAdaptations) {
        if (ex.deferWeightToPostProcessing) {
          const base = ex.oldWeight ?? ex.baselineWeight ?? 0;
          ex.newTargetWeight = roundTo2_5(base * 0.8);
        } else {
          ex.newTargetWeight = roundTo2_5(ex.oldWeight * 0.8);
        }
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

Do NOT add, remove, or reorder days. Return exactly ${dayCount} days in the same order: same dayNumber and type (workout/rest) for each slot. For each workout slot, provide exercises, sessionFocus, and fields as specified. Update reps and coaching notes from performance data. For targetWeight on each exercise, copy the value from the exercise adaptations (last week's working weight) — do not derive weights from RPE yourself.

`
        : '';

    const completedWeeks =
      (planJson as { currentWeek?: number }).currentWeek ??
      plan.current_week ??
      completedWeekNumber ??
      1;

    function getJordanToneTier(weeks: number): string {
      if (weeks <= 1) return 'new';
      if (weeks <= 4) return 'building';
      if (weeks <= 8) return 'established';
      return 'veteran';
    }

    const toneTier = getJordanToneTier(completedWeeks);
    const toneInstructionMap: Record<string, string> = {
      new: `JORDAN TONE — NEW (Week ${completedWeeks}):
Welcoming and clear. The athlete is still learning how the system works.
- Briefly explain why key programming decisions were made
- Acknowledge this is early in the process — calibration is still happening
- Forward-looking: "Week ${completedWeeks + 1} is where we start building on what you established"
- Never assume the user knows what RPE drift means or why deloads happen — explain it once, briefly`,

      building: `JORDAN TONE — BUILDING (Week ${completedWeeks}):
Warmer, less explanatory. The athlete understands the basics.
- Reference their actual numbers from last week (weights, RPE, volume)
- Drop explanations of RPE and progressive overload — they know
- Acknowledge progress directly: "Your bench went from X to Y — that's the accumulation working"
- Still forward-framing but more specific to their actual trajectory`,

      established: `JORDAN TONE — ESTABLISHED (Week ${completedWeeks}):
Direct and referential. The athlete has a training history worth referencing.
- Reference patterns across multiple weeks freely ("this is the third consecutive week your squat has climbed")
- No explanation of programming concepts — they're earned
- Acknowledge plateaus or stalls with specificity, not generics
- Treat the athlete as someone who understands their own body
- Shorter sentences. Less hedging. More conviction.`,

      veteran: `JORDAN TONE — VETERAN (Week ${completedWeeks}):
Terse, data-driven, peer-level. This athlete knows what they're doing.
- Lead with data, not framing
- Reference their full training arc freely — they remember it too
- Observations over explanations: "Volume's been climbing 3 weeks — this deload is earned, not precautionary"
- No softening language. Direct assessment of what the numbers say.
- Jordan speaks as a collaborator, not a guide`,
    };
    const toneInstruction = toneInstructionMap[toneTier] ?? toneInstructionMap.new;

    const weightProgressionBaselineSection = `
WEIGHT TARGETS: Set targetWeight to the same value as last week's logged weight for each exercise. Do NOT calculate increases or decreases — weight progression is handled in post-processing. Your job is exercise selection, rep ranges, set structure, and coaching notes only.
`;

    const freeSessionSummary = buildFreeSessionSummary(freeSessions ?? []);

    // DISABLED: exercise generation now uses W1 clone
    /*
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
        max_tokens: 4000,
        system: `${toneInstruction}

STYLE RULE: Never use em-dashes (—) in any response.
Use periods or commas instead. This applies to all
coaching copy, Jordan's voice, and any explanatory text.

You are Jordan, the athlete's personal coach. You have their last week of performance data and you are writing their next week plan. Generate the training plan as structured JSON with varied exercise selection, smart ordering, and coaching notes that reference the user's actual performance.
${weightProgressionBaselineSection}
RAMP-UP WORKING SETS (Week 1 self-select and similar):
${`- If an exercise adaptation has isRampPattern: true, the user ramped up to their working weight across sets within a session (e.g. lighter early sets, heaviest working sets at the end). The baselineWeight and newTargetWeight in the data already use their PEAK working weight, not an average across ramp sets.
- For isRampPattern: true: use that peak as their true baseline for Week 2. Do not argue for a lower working weight because earlier sets in the log were lighter.
`}
UNILATERAL RULE: For exercises flagged isUnilateral, reps in sets_json are per-side.
When assessing whether a user hit their rep target (e.g. target 10 reps, logged 10),
that means 10 each side — this IS hitting the target. Do not penalise or hold weight
based on interpreting per-side reps as bilateral total.

${goalType === 'power_hypertrophy' ? `POWER-HYPERTROPHY PROGRESSION:
This plan has two-phase sessions. Track Phase 1 (strength) and Phase 2 (hypertrophy) separately — they progress independently.

Phase 1 (strength compounds):
- Use strength goal progression multipliers (aggressive)
- A plateau in Phase 1 → rotate compound variation (e.g. Barbell Bench → Incline Barbell Bench)
- Phase 1 plateau does NOT affect Phase 2

Phase 2 (hypertrophy accessories):
- Use hypertrophy goal progression multipliers (moderate)
- A plateau in Phase 2 → rotate accessory variation (prefer same muscleEmphasis)
- Phase 2 plateau does NOT affect Phase 1

UNILATERAL RULE applies to Phase 2 accessories as before.
Each exercise MUST include a "phase" field with value "strength" or "hypertrophy".` : ''}
${enhancedRecovery ? `ENHANCED RECOVERY — applies to this user's progression:
- Deload triggers on week ${deloadCadence} cadence, not week 4
- Volume ceiling is 28-36 sets/muscle/week — do not reduce volume prematurely
- Progression multiplier: 0.9× on training age cap — allow slightly more aggressive increases
- Do not flag volume as excessive for this user — they have indicated high recovery capacity
- IMPORTANT: Never reference medical protocols, TRT, or any pharmacological context. Frame purely as a training characteristic.` : ''}
${concurrentSport ? `
CONCURRENT SPORT CONTEXT:
User trains ${concurrentSport.type.join(', ')} ${concurrentSport.daysPerWeek} days/week outside of lifting.
Progression rules:
- If user shows high fatigue signals (avg RPE > 8.5, low energy) AND daysPerWeek >= 3: reflect recovery demands in coaching tone — do not compute weight changes yourself
- Do not flag lower body fatigue as underperformance — sport training adds cumulative leg load
- Jordan weekly summary may reference sport recovery where relevant` : ''}
${biologicalSex === 'female' ? `
SEX-AWARE PROGRESSION — FEMALE:
- Rep ranges: maintain the +2 rep adjustment from Week 1 programming. Do not revert to standard rep ranges. Example: if Week 1 was 10-14 reps, keep 10-14 as the target range for progression assessment — do not assess against 8-12.
- Volume ceiling: 10-15% above male equivalent — do not reduce volume unless fatigue signals are severe (avg RPE > 9.0 AND energy <= 1)
- Plateau threshold: require 4 consecutive weeks at same weight before rotation (vs 3 weeks for male) — females have higher volume tolerance and may need more time at a given load
- Never reference sex in Jordan coaching notes or weekly summary` : ''}
${(biologicalSex === 'female' || enhancedRecovery) ? `DELOAD CADENCE: Week 5 (not week 4). If this is week 4, do NOT generate a deload week — generate a normal accumulation or intensification week instead.` : `DELOAD CADENCE: Week 4 standard.`}
For each exercise coachingNote:
- Speak as Jordan directly to the athlete in first person
- Reference actual numbers from the exercise adaptations (avgRpe, avgReps, weightAction) to describe last week and the intent for this week — do not invent specific next-week pound targets; those are finalized in post-processing
- If weightAction is 'increase': explain that load should progress because last week ran light vs target — stay qualitative, no invented pound amounts for this week
- If weightAction is 'hold': explain that last week was calibrated — focus on execution
- If weightAction is 'decrease': acknowledge last week ran heavy — quality reps matter
- If weightAction is 'deload': frame deload positively as intentional recovery
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

PLATEAU ROTATION — SUB-MUSCLE RULE: When substituting a plateaued exercise, you will receive the current exercise's muscleEmphasis in the plan_json. Select a substitute that matches that exact muscleEmphasis tag. Example: if the plateaued exercise has muscleEmphasis: 'lats', the substitute must also be a lats-dominant movement. Do not rotate to a different sub-muscle even if the broad muscleGroup matches.
After selecting the substitute, set the new exercise's muscleEmphasis to the same value as the exercise it replaced.

For each workout day, include a sessionFocus field: one sentence (max 12 words) that tells the athlete exactly what today is about.
Reference real numbers from the exercise adaptations where possible.
This appears on the athlete's Dashboard before they start the workout.

sessionFocus rules:
- Always reference at least one specific number (weight, RPE, or sets)
- Reference the most important exercise of the day
- If weights are increasing: mention the increase and why
- If it is a deload: say so directly
- Never use filler like 'Great session ahead' or 'You've got this'
- When sessionFocus references a specific weight, ALWAYS include the "lbs" unit explicitly.
  ✓ Correct: "Bench top set at 255 lbs — hit RPE 7 across 3 sets."
  ✗ Wrong: "Bench top set at 255 — hit RPE 7 across 3 sets."
  The unit must immediately follow the number with a space: "[number] lbs" — never just the bare number.
  This applies to every sessionFocus string in every workout day of the generated week. Rest days with no weight reference are unaffected.
- Examples:
  'Bench goes to 302.5 lbs today — your RPE 4 last week earned this.'
  'Volume day: 4x6 at 225 lbs, focus on bar speed not max effort.'
  'Deload week — move well at 220 lbs, nothing more.'
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

Exercise adaptations for next week (context for coaching — copy targetWeight from newTargetWeight; arithmetic is finalized in post-processing):
${JSON.stringify(exerciseAdaptations, null, 2)}
${freeSessionSummary}${freeSessionSummary ? `

IMPORTANT: If the user completed free sessions this week, account
for that extra volume and fatigue when programming next week.
Specifically:
- If they hit the same muscle group in a free session, consider
  reducing volume on that muscle group by 1-2 sets next week,
  or note the extra stimulus in a coaching note.
- If their fatigue rating from free sessions was 4-5, treat it
  as a high fatigue signal across the week.
- Never remove a planned muscle group entirely — just adjust
  volume intelligently.
- Mention the free session briefly in Jordan's opening note
  if it's relevant to next week's programming decisions.

` : ''}

Rules:
- Set each exercise targetWeight to the newTargetWeight value from the list above (last week's working weight) for exercises without deferWeightToPostProcessing. Do not substitute your own calculated weights
- Maintain the same core exercise selection as last week unless weightAction is 'decrease' for 3+ sets (then suggest a regression)
- If phase is 'deload': sets are already reduced in the data above, keep reps in lower range
- If completionTier is 'low': add a note in the first workout suggesting the user review their schedule
- If hasRpeData is false for an exercise: the coachingNote MUST ask the user to log RPE next session. Weight is held. Example: "I'm holding 225 lbs here — I need your RPE to know where to take this. Rate every set next session."
- If isUnilateral is true for an exercise: reps logged in sets_json are per-side. Do not treat as bilateral total. Volume is already adjusted ×2 externally.
- If selfSelectCoachingNote is present on an adaptation: use it as the core of that exercise's coachingNote (you may tighten wording slightly but keep the numbers).
- If isRampPattern is true for an exercise: the user ramped up to their working weight across sets. The baselineWeight / newTargetWeight already reflect their PEAK working weight, not a session average. Do not reduce prescribed weight for that reason.
- If the completed week was a deload: exerciseAdaptations already progress from pre-deload weights — do not anchor coaching or loads to deload (×0.8) numbers.
- Never decrease weight solely because RPE was not logged.
- Exercises with plateaued: true require special handling per the system prompt. Do not ignore this field.
- Each exercise must have: id (new uuid), name, muscleGroup, sets, reps (string e.g. '8-10'), targetWeight (number), restSeconds, targetRpe, coachingNote${goalType === 'power_hypertrophy' ? ', phase ("strength" or "hypertrophy")' : ''}
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
      "sessionFocus": "Bench goes to 302.5 lbs — RPE 4 last week earned this increase.",
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
    */

    const week1 = planJson.weeks?.[0];
    // W1 clone aligns day indices / shells for merged output; prescriptions are mutated on merged days
    // post-stamp (merge keeps completed-week exercise rows → IDs/order preserved).
    const newWeekDays = JSON.parse(JSON.stringify(week1?.days ?? []));
    let nextWeekData: any = { days: newWeekDays };

    // Ensure weekNumber and phase are set correctly; lock layout to completed week
    nextWeekData.weekNumber = nextWeekNumber;
    nextWeekData.phase = phase;
    nextWeekData = mergeNextWeekWithPreviousStructure(weekDataForMap, nextWeekData, nextWeekNumber, phase);

    const planGoalForSetStructure =
      typeof (planJson as { goal?: string }).goal === 'string' &&
      (planJson as { goal: string }).goal.length > 0
        ? (planJson as { goal: string }).goal
        : goalType;

    const strengthTargetLiftForSetStructure =
      (planJson as { goalLift?: string | null }).goalLift ??
      (planJson as { targetLift?: string | null }).targetLift ??
      strengthTargetLiftFromGoal ??
      null;

    // Stamp equipment + setStructure so downstream sees pyramid / compoundTier (Claude often omits these).
    nextWeekData = {
      ...nextWeekData,
      days: (nextWeekData.days ?? []).map((day: any) => {
        if (day.type !== 'workout') return day;
        return {
          ...day,
          exercises: enforceSetStructure(
            stampEquipment(day.exercises ?? []),
            planGoalForSetStructure,
            planGoalForSetStructure === 'strength' ? strengthTargetLiftForSetStructure : null,
          ),
        };
      }),
    };

    const adaptationDrafts: AdaptationDraft[] = [];

    // Fetch all prior week logs once — used for travel restore AND
    // skipped-exercise lookback (finding most recent log when current
    // week has no data for an exercise).
    const { data: allPriorLogData } = await supabase
      .from('workout_logs')
      .select('week_number, day_number, sets_json')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .lt('week_number', completedWeekNumber)
      .not('skipped', 'eq', true)
      .order('week_number', { ascending: false });
    const allPriorLogs: WorkoutLogRow[] = (allPriorLogData ?? []) as WorkoutLogRow[];

    // ── PER-EXERCISE WEIGHT PROGRESSION ─────────────────────────────────────
    // mergeNextWeekWithPreviousStructure keeps completed-week slots (preserves IDs).
    // Progress targetWeight / reps / pyramid ladders from prior plan baselines + RPE logs.
    for (let dayIndex = 0; dayIndex < (nextWeekData.days ?? []).length; dayIndex++) {
      const day = nextWeekData.days[dayIndex];
      if (day.type !== 'workout') continue;

      const dayIsVolume = isVolumeDay(day, planJson, weekData?.days);

      const dayNum = Number(day.dayNumber ?? day.day);
      const matchingPriorLog = dedupedLogs.find(
        (log: any) => Number(log.day_number) === dayNum,
      );
      const sessionSets: any[] = parseSetsJson(matchingPriorLog?.sets_json);

      const allPlanWeekSets: any[] = dedupedLogs.flatMap((log: any) =>
        parseSetsJson(log.sets_json),
      );

      const dayWasTravelAffected =
        completedWeekWasTravel &&
        travelAffectedDayNumbers.includes(dayNum);

      let allPlanLogsForTravel: WorkoutLogRow[] = [];
      if (dayWasTravelAffected) {
        allPlanLogsForTravel = allPriorLogs;
      }

      const exerciseIdToNameForDay: Record<string, string> = {};
      for (const ex of day.exercises ?? []) {
        if (ex.id) exerciseIdToNameForDay[ex.id] = String(ex.name ?? ex.exerciseName ?? '');
      }

      for (let exerciseIndex = 0; exerciseIndex < (day.exercises ?? []).length; exerciseIndex++) {
        const exercise = day.exercises[exerciseIndex];
        const exName = (exercise.exerciseName ?? exercise.name ?? '')
          .toLowerCase()
          .trim();

        const currentExerciseName = String(
          exercise.name ?? exercise.exerciseName ?? '',
        ).trim();
        const prevWeekExerciseName = getPrevWeekExerciseName(
          planJson,
          completedWeekNumber,
          dayIndex,
          exerciseIndex,
        );
        const exerciseChanged =
          prevWeekExerciseName != null &&
          prevWeekExerciseName.toLowerCase().trim() !==
            currentExerciseName.toLowerCase().trim();

        if (exerciseChanged) {
          console.log('[SWAP DETECT]', {
            slot: `${dayIndex}:${exerciseIndex}`,
            prev: prevWeekExerciseName,
            current: currentExerciseName,
          });
        }

        // Travel week: the user logged a substitute exercise, not the
        // original. Skip current-week log matching entirely and anchor
        // progression to the most recent pre-travel log for this exercise.
        if (dayWasTravelAffected) {
          const preTravelLog = findMostRecentLogForExercise(
            allPlanLogsForTravel,
            currentExerciseName,
            completedWeekNumber,
          );
          if (!preTravelLog) {
            console.log('[SKIP]', exName, '— travel week, no pre-travel log found');
            continue;
          }
          const equip = String(exercise.equipment ?? getEquipmentForExerciseName(exName));
          const tier = normalizeCompoundTier(
            exercise.compoundTier ?? getCompoundTierFromName(currentExerciseName),
          );
          const accessoryTargetRpe =
            Number(exercise.targetRpe) > 0 ? Number(exercise.targetRpe) : 7.0;
          const priorPlanEx = resolvePriorPlanExercise(
            exName,
            dayIsVolume,
            Boolean(
              planGoalForSetStructure === 'strength' &&
              strengthTargetLiftForSetStructure &&
              isTargetLift(exercise, strengthTargetLiftForSetStructure),
            ),
            priorHeavyExerciseMap,
            priorVolumeExerciseMap,
          );
          const planBase = getPlanBaselineWeight(priorPlanEx);
          const baselineForProgression = planBase > 0 ? planBase : preTravelLog.weightLbs;
          const progression = computeAccessoryProgressionTarget({
            baselineWeight: baselineForProgression,
            avgLoggedRpe: preTravelLog.rpe,
            targetRpe: accessoryTargetRpe,
            equipment: equip,
            compoundTier: tier,
            trainingAge: experienceForProgression,
            exerciseName: currentExerciseName,
          });
          let newTargetWeight = applyMaxWeeklyIncrease(
            baselineForProgression,
            progression.newTargetWeight,
            equip,
            tier,
          );
          if (isPyramidExercise(exercise)) {
            if (Array.isArray(exercise.setTargets) && exercise.setTargets.length > 0) {
              applyPyramidSetTargetsAfterProgression(
                exercise,
                [],
                newTargetWeight,
                baselineForProgression,
                equip,
              );
              newTargetWeight = Number(exercise.targetWeight ?? newTargetWeight);
            } else {
              newTargetWeight = stampPyramidFromDesiredTopSet(exercise, newTargetWeight, equip);
            }
          } else {
            exercise.targetWeight = newTargetWeight;
          }
          if (
            priorPlanEx?.preDeloadSetTargets != null &&
            Array.isArray(priorPlanEx.preDeloadSetTargets) &&
            priorPlanEx.preDeloadSetTargets.length > 0
          ) {
            exercise.sets = priorPlanEx.preDeloadSetTargets.length;
          }
          stampExerciseAdaptationCopyAfterProgression({
            exercise,
            planBaseline: baselineForProgression,
            avgLoggedRpe: preTravelLog.rpe,
            accessoryTargetRpeForGap: accessoryTargetRpe,
            isTargetLiftEx: false,
            dayIsVolume: Boolean(dayIsVolume),
            nextWeekNumber: Number(nextWeekNumber),
          });
          console.log('[TRAVEL RESTORE]', {
            name: exName,
            preTravelWeight: preTravelLog.weightLbs,
            preTravelRpe: preTravelLog.rpe,
            preTravelWeek: preTravelLog.weekNumber,
            planBase,
            baselineForProgression,
            newTargetWeight: Number(exercise.targetWeight ?? newTargetWeight),
          });
          upsertAdaptationDraft(adaptationDrafts, {
            key: exName,
            exerciseName: currentExerciseName,
            muscleGroup: String(exercise.muscleGroup ?? ''),
            previousWeight: baselineForProgression,
            progressedWeight: Number(exercise.targetWeight ?? newTargetWeight),
            avgLoggedRpe: preTravelLog.rpe,
            targetRpe: accessoryTargetRpe,
            rpeGap: progression.rpeGap,
            repsExceeded: false,
            hadRpeData: true,
            isCalibration: false,
          });
          continue;
        }

        const isTargetLiftEx =
          planGoalForSetStructure === 'strength' &&
          strengthTargetLiftForSetStructure &&
          isTargetLift(exercise, strengthTargetLiftForSetStructure);

        const priorPlanExercise = resolvePriorPlanExercise(
          exName,
          dayIsVolume,
          Boolean(isTargetLiftEx),
          priorHeavyExerciseMap,
          priorVolumeExerciseMap,
        );

        let exerciseSets = getExerciseSets(
          sessionSets,
          exercise,
          exerciseIdToNameForDay,
        );
        if (exerciseSets.length === 0 && allPlanWeekSets.length > 0) {
          exerciseSets = getExerciseSets(
            allPlanWeekSets,
            exercise,
            exerciseIdToNameForDay,
          );
        }
        const workingSets = exerciseSets.filter(
          (s: any) => s.isWarmup !== true,
        );

        const isPyramid =
          isPyramidExercise(exercise) ||
          isPyramidExercise(priorPlanExercise ?? {});
        const loggedFromSets = getLoggedBaselineFromSets(workingSets, isPyramid);
        const avgLoggedRpe =
          workingSets.length > 0
            ? loggedFromSets.baselineRpe > 0
              ? loggedFromSets.baselineRpe
              : 7.0
            : 7.0;

        let effectiveAvgRpe = avgLoggedRpe;
        if (
          completedWeekWasDeload &&
          priorPlanExercise?.preDeloadSetTargets != null &&
          Array.isArray(priorPlanExercise.preDeloadSetTargets) &&
          priorPlanExercise.preDeloadSetTargets.length > 0
        ) {
          // Use the target RPE from the pre-deload prescription as the
          // progression anchor — the deload RPE is artificially low and
          // would produce an oversized increment.
          const preDeloadTopSet = priorPlanExercise.preDeloadSetTargets[
            priorPlanExercise.preDeloadSetTargets.length - 1
          ];
          const preDeloadTargetRpe = Number(preDeloadTopSet?.targetRpe ?? 0);
          if (preDeloadTargetRpe > 0) {
            effectiveAvgRpe = preDeloadTargetRpe;
          }
        }

        console.log(
          `[EXERCISE MATCH] ${exName}: found ${workingSets.length} sets, avgRpe=${avgLoggedRpe.toFixed(1)}${isPyramid ? ' (pyramid top set)' : ''}`,
        );

        const loggedBaselineWeight = loggedFromSets.baselineWeight;
        const wasSwapped = isExerciseSwappedThisWeek(exercise);

        if (wasSwapped) {
          console.log('[SWAP DETECT]', {
            slot: `${dayIndex}:${exerciseIndex}`,
            originalName: exercise.originalName,
            newName: currentExerciseName,
            prevWeekName: prevWeekExerciseName,
          });
          const derivedEquipment = deriveEquipmentFromName(
            String(exercise.name ?? exercise.exerciseName ?? ''),
          );
          if (derivedEquipment) {
            exercise.equipment = derivedEquipment;
          }
        }

        const equipDefault = String(
          exercise.equipment ?? getEquipmentForExerciseName(exName),
        );
        const tierDefault = normalizeCompoundTier(
          exercise.compoundTier ??
            getCompoundTierFromName(currentExerciseName),
        );
        const accessoryTargetRpeDefault =
          Number(exercise.targetRpe) > 0 ? Number(exercise.targetRpe) : 7.0;

        if (wasSwapped && loggedBaselineWeight > 0) {
          const planBaseline = roundToEquipmentPrecision(
            loggedBaselineWeight,
            equipDefault,
          );
          const progression = computeAccessoryProgressionTarget({
            baselineWeight: planBaseline,
            avgLoggedRpe,
            targetRpe: accessoryTargetRpeDefault,
            equipment: equipDefault,
            compoundTier: tierDefault,
            trainingAge: experienceForProgression,
            exerciseName: currentExerciseName,
          });
          let newTargetWeight = applyMaxWeeklyIncrease(
            planBaseline,
            progression.newTargetWeight,
            equipDefault,
            tierDefault,
          );

          if (isPyramid) {
            if (
              Array.isArray(exercise.setTargets) &&
              exercise.setTargets.length > 0
            ) {
              applyPyramidSetTargetsAfterProgression(
                exercise,
                workingSets,
                newTargetWeight,
                planBaseline,
                equipDefault,
              );
              newTargetWeight = Number(exercise.targetWeight ?? newTargetWeight);
            } else {
              newTargetWeight = stampPyramidFromDesiredTopSet(
                exercise,
                newTargetWeight,
                equipDefault,
              );
            }
          } else {
            exercise.targetWeight = newTargetWeight;
          }

          stampExerciseAdaptationCopyAfterProgression({
            exercise,
            planBaseline,
            avgLoggedRpe,
            accessoryTargetRpeForGap: accessoryTargetRpeDefault,
            isTargetLiftEx: Boolean(isTargetLiftEx),
            dayIsVolume: Boolean(dayIsVolume),
            nextWeekNumber: Number(nextWeekNumber),
            wasSwapped: true,
            loggedBaselineWeight: planBaseline,
          });

          console.log('[SWAP DETECTED]', {
            originalName: exercise.originalName,
            newName: currentExerciseName,
            loggedWeight: planBaseline,
            newTargetWeight,
            changeType: 'swap_baseline',
            adjustedIncrement: progression.increment,
          });

          delete exercise.originalName;

          upsertAdaptationDraft(adaptationDrafts, {
            key: exName,
            exerciseName: currentExerciseName,
            muscleGroup: String(exercise.muscleGroup ?? ''),
            previousWeight: planBaseline,
            progressedWeight: newTargetWeight,
            avgLoggedRpe: workingSets.length > 0 ? avgLoggedRpe : null,
            targetRpe: accessoryTargetRpeDefault,
            rpeGap: progression.rpeGap,
            repsExceeded: false,
            hadRpeData: workingSets.length > 0,
            isCalibration: false,
          });

          console.log(
            `[PROGRESSION W${completedWeekNumber}→W${nextWeekNumber}]`,
            {
              name: exName,
              loggedWeight: planBaseline,
              rpeGap: progression.rpeGap,
              increment: newTargetWeight - planBaseline,
              newTargetWeight,
              changeType: 'swap_baseline',
            },
          );
          continue;
        }

        if (wasSwapped && loggedBaselineWeight === 0) {
          console.log('[SKIP]', exName, '— swapped but no sets logged this week');
          delete exercise.originalName;
          continue;
        }

        const { baseline: anomalyPlanBaseline } = resolveProgressionBaseline(
          planGoalForSetStructure,
          priorPlanExercise,
          workingSets,
        );
        if (
          loggedBaselineWeight > 0 &&
          isLoggingWeightAnomaly(
            loggedBaselineWeight,
            anomalyPlanBaseline,
            wasSwapped,
          )
        ) {
          console.log('[LOGGING ANOMALY]', {
            name: currentExerciseName,
            loggedWeight: loggedBaselineWeight,
            planBaseline: anomalyPlanBaseline,
            ratio: loggedBaselineWeight / anomalyPlanBaseline,
          });
        }

        if (exerciseChanged && !wasSwapped) {
          const historicalLog = findMostRecentLogForExercise(
            dedupedLogs,
            currentExerciseName,
            nextWeekNumber,
          );
          const equip = equipDefault;
          const tier = tierDefault;
          const accessoryTargetRpe = accessoryTargetRpeDefault;

          if (historicalLog) {
            const rpeGap = computeRpeGap(historicalLog.rpe, accessoryTargetRpe);
            const weeksSinceLogged = Math.max(
              1,
              nextWeekNumber - historicalLog.weekNumber,
            );
            const weeksMultiplier = Math.min(weeksSinceLogged, 3);
            const baseIncrement = calculateWeightIncrement(
              historicalLog.rpe,
              accessoryTargetRpe,
              equip,
              tier,
              experienceForProgression,
            );
            const totalIncrement = baseIncrement * weeksMultiplier;
            let swapWeight = roundToEquipmentPrecision(
              historicalLog.weightLbs + totalIncrement,
              equip,
            );
            swapWeight = applyMaxWeeklyIncrease(
              historicalLog.weightLbs,
              swapWeight,
              equip,
              tier,
            );

            if (exercise.setStructure === 'pyramid') {
              stampPyramidFromDesiredTopSet(exercise, swapWeight, equip);
            } else {
              exercise.targetWeight = swapWeight;
            }

            stampExerciseAdaptationCopyAfterProgression({
              exercise,
              planBaseline: historicalLog.weightLbs,
              avgLoggedRpe: historicalLog.rpe,
              accessoryTargetRpeForGap: accessoryTargetRpe,
              isTargetLiftEx: Boolean(isTargetLiftEx),
              dayIsVolume: Boolean(dayIsVolume),
              nextWeekNumber: Number(nextWeekNumber),
              loggedBaselineWeight: historicalLog.weightLbs,
            });

            upsertAdaptationDraft(adaptationDrafts, {
              key: exName,
              exerciseName: currentExerciseName,
              muscleGroup: String(exercise.muscleGroup ?? ''),
              previousWeight: historicalLog.weightLbs,
              progressedWeight: Number(exercise.targetWeight ?? swapWeight),
              avgLoggedRpe: historicalLog.rpe,
              targetRpe: accessoryTargetRpe,
              rpeGap,
              repsExceeded: false,
              hadRpeData: true,
              isCalibration: false,
            });

            console.log('[SWAP PROGRESSION]', {
              name: currentExerciseName,
              historicalWeight: historicalLog.weightLbs,
              historicalWeek: historicalLog.weekNumber,
              weeksMultiplier,
              totalIncrement,
              newWeight: exercise.targetWeight,
            });
            console.log(
              `[PROGRESSION W${completedWeekNumber}→W${nextWeekNumber}]`,
              {
                name: exName,
                loggedWeight: historicalLog.weightLbs,
                rpeGap,
                increment: totalIncrement,
                newTargetWeight: Number(exercise.targetWeight ?? swapWeight),
              },
            );
            continue;
          }

          const loggedTopSetWeight = workingSets.reduce(
            (max: number, s: any) =>
              Math.max(max, Number(s.weightLbs ?? 0)),
            0,
          );
          if (loggedTopSetWeight > 0) {
            const planBaseline = roundToEquipmentPrecision(
              loggedTopSetWeight,
              equip,
            );
            const rpeGap = computeRpeGap(effectiveAvgRpe, accessoryTargetRpe);
            const progression = computeAccessoryProgressionTarget({
              baselineWeight: planBaseline,
              avgLoggedRpe: effectiveAvgRpe,
              targetRpe: accessoryTargetRpe,
              equipment: equip,
              compoundTier: tier,
              trainingAge: experienceForProgression,
              exerciseName: currentExerciseName,
            });
            let progressedWeight = applyMaxWeeklyIncrease(
              planBaseline,
              progression.newTargetWeight,
              equip,
              tier,
            );
            if (exercise.setStructure === 'pyramid') {
              if (
                Array.isArray(exercise.setTargets) &&
                exercise.setTargets.length > 0
              ) {
                applyPyramidSetTargetsAfterProgression(
                  exercise,
                  workingSets,
                  progressedWeight,
                  planBaseline,
                  equip,
                );
                progressedWeight = Number(exercise.targetWeight ?? progressedWeight);
              } else {
                progressedWeight = stampPyramidFromDesiredTopSet(
                  exercise,
                  progressedWeight,
                  equip,
                );
              }
            } else {
              exercise.targetWeight = progressedWeight;
            }

            stampExerciseAdaptationCopyAfterProgression({
              exercise,
              planBaseline,
              avgLoggedRpe: effectiveAvgRpe,
              accessoryTargetRpeForGap: accessoryTargetRpe,
              isTargetLiftEx: Boolean(isTargetLiftEx),
              dayIsVolume: Boolean(dayIsVolume),
              nextWeekNumber: Number(nextWeekNumber),
              loggedBaselineWeight: planBaseline,
            });

            upsertAdaptationDraft(adaptationDrafts, {
              key: exName,
              exerciseName: currentExerciseName,
              muscleGroup: String(exercise.muscleGroup ?? ''),
              previousWeight: planBaseline,
              progressedWeight,
              avgLoggedRpe: workingSets.length > 0 ? effectiveAvgRpe : null,
              targetRpe: accessoryTargetRpe,
              rpeGap:
                workingSets.length > 0
                  ? computeRpeGap(effectiveAvgRpe, accessoryTargetRpe)
                  : null,
              repsExceeded: false,
              hadRpeData: workingSets.length > 0,
              isCalibration: false,
            });

            console.log(
              `[PROGRESSION W${completedWeekNumber}→W${nextWeekNumber}]`,
              {
                name: exName,
                loggedWeight: planBaseline,
                rpeGap,
                increment: progressedWeight - planBaseline,
                newTargetWeight: progressedWeight,
                changeType: progression.changeType,
              },
            );
            continue;
          }
        }

        const { baseline: planBaseline, source: baselineSource } =
          resolveProgressionBaseline(
            planGoalForSetStructure,
            priorPlanExercise,
            workingSets,
            { wasSwapped, loggedBaselineWeight, isCalibrationWeek },
          );

        if (loggedBaselineWeight === 0) {
          // Before giving up, check prior weeks for the most recent log
          // of this exercise. Handles skipped sessions mid-plan where
          // the user logged the exercise in a prior week but not this one.
          // Example: W2 logged, W3 skipped, W4 should progress from W2.
          if (isSelfSelectWeightGoal(planGoalStr) && allPriorLogs.length > 0) {
            const priorLog = findMostRecentLogForExercise(
              allPriorLogs,
              currentExerciseName,
              completedWeekNumber,
            );
            if (priorLog && priorLog.weightLbs > 0) {
              // Found prior data — use it as the baseline and progress normally.
              // Treat RPE as on-target (7.0) since we don't know their effort
              // from a skipped week — conservative but correct.
              const equip = String(
                exercise.equipment ?? getEquipmentForExerciseName(exName),
              );
              const tier = normalizeCompoundTier(
                exercise.compoundTier ?? getCompoundTierFromName(currentExerciseName),
              );
              const accessoryTargetRpe =
                Number(exercise.targetRpe) > 0 ? Number(exercise.targetRpe) : 7.0;
              // Use target RPE as the logged RPE since we have no actual data
              // from the skipped week — this produces a hold (no increment),
              // which is correct: don't progress from a week they didn't train.
              const progression = computeAccessoryProgressionTarget({
                baselineWeight: priorLog.weightLbs,
                avgLoggedRpe: accessoryTargetRpe,
                targetRpe: accessoryTargetRpe,
                equipment: equip,
                compoundTier: tier,
                trainingAge: experienceForProgression,
                exerciseName: currentExerciseName,
              });
              let newTargetWeight = applyMaxWeeklyIncrease(
                priorLog.weightLbs,
                progression.newTargetWeight,
                equip,
                tier,
              );
              if (isPyramidExercise(exercise)) {
                newTargetWeight = stampPyramidFromDesiredTopSet(
                  exercise,
                  newTargetWeight,
                  equip,
                );
              } else {
                exercise.targetWeight = newTargetWeight;
              }
              console.log('[LOOKBACK]', currentExerciseName, {
                priorWeek: priorLog.weekNumber,
                priorWeight: priorLog.weightLbs,
                newTargetWeight: Number(exercise.targetWeight ?? newTargetWeight),
                note: 'skipped this week — holding from prior week log',
              });
              upsertAdaptationDraft(adaptationDrafts, {
                key: exName,
                exerciseName: currentExerciseName,
                muscleGroup: String(exercise.muscleGroup ?? ''),
                previousWeight: priorLog.weightLbs,
                progressedWeight: Number(exercise.targetWeight ?? newTargetWeight),
                avgLoggedRpe: null,
                targetRpe: accessoryTargetRpe,
                rpeGap: 0,
                repsExceeded: false,
                hadRpeData: false,
                isCalibration: false,
              });
              continue;
            }
          }
          // No prior data found anywhere — truly first attempt, default to 0.
          console.log('[SKIP]', exName, '— no sets logged this or any prior week');
          exercise.targetWeight = 0;
          if (Array.isArray(exercise.setTargets)) {
            exercise.setTargets = exercise.setTargets.map((st: any) => ({
              ...st,
              targetWeight: 0,
            }));
          }
          continue;
        }

        if (planBaseline === 0) {
          console.log('[SKIP]', exName, '— no plan or logged baseline');
          continue;
        }

        if (
          priorPlanExercise?.preDeloadSetTargets != null &&
          Array.isArray(priorPlanExercise.preDeloadSetTargets) &&
          priorPlanExercise.preDeloadSetTargets.length > 0
        ) {
          exercise.sets = priorPlanExercise.preDeloadSetTargets.length;
        } else if (priorPlanExercise?.preDeloadSets != null) {
          exercise.sets = Number(priorPlanExercise.preDeloadSets);
        }

        const baselineMapSource =
          priorPlanExercise == null
            ? 'none'
            : dayIsVolume && priorVolumeExerciseMap.get(exName) === priorPlanExercise
            ? 'volume'
            : priorHeavyExerciseMap.get(exName) === priorPlanExercise
            ? 'heavy'
            : 'fallback';

        console.log('[PLAN BASELINE]', {
          name: exName,
          planBaseline,
          avgLoggedRpe,
          dayIsVolume,
          baselineMapSource,
          baselineSource,
          completedWeekNumber,
          nextWeekNumber,
          priorPrescribedWeight: priorPlanExercise?.targetWeight,
        });

        /** Last week's programmed target RPE (heavy primary matches progression gap math). */
        const adaptationMessagingCycle = strengthWeekInCycle(
          completedWeekNumber,
          deloadCycleStored,
        );
        const adaptationMessagingPriorRow = strengthPeriodisation(adaptationMessagingCycle);
        const accessoryTargetRpeForCopy =
          isTargetLiftEx && !dayIsVolume
            ? adaptationMessagingPriorRow.targetRpe
            : Number(exercise.targetRpe) > 0
              ? Number(exercise.targetRpe)
              : Number(priorPlanExercise?.targetRpe) > 0
                ? Number(priorPlanExercise.targetRpe)
                : 7.0;

        if (isTargetLiftEx && !dayIsVolume) {
          const priorWeekInCycle = strengthWeekInCycle(
            completedWeekNumber,
            deloadCycleStored,
          );
          const newWeekInCycle = strengthWeekInCycle(nextWeekNumber, deloadCycleStored);
          const priorPeriodisation = strengthPeriodisation(priorWeekInCycle);
          const newPeriodisation = strengthPeriodisation(newWeekInCycle);

          const gap = computeRpeGap(effectiveAvgRpe, priorPeriodisation.targetRpe);
          let increment = 5;
          if (gap >= 2) increment = 10;
          else if (gap >= 0) increment = 5;
          else if (gap >= -2) increment = 0;
          else increment = -5;
          increment = scalePositiveIncrementByExperience(
            increment,
            experienceForProgression,
          );
          console.log(
            `[PROGRESSION] ${exName}: experience=${experienceForProgression}, multiplier=${experienceProgressionMultiplier(experienceForProgression)}, gap=${gap}, increment=${increment}`,
          );

          const tier = String(
            exercise.compoundTier ??
              getCompoundTierFromName(String(exercise.name ?? '')),
          );
          const equip = String(exercise.equipment ?? 'barbell');
          let newWeight = roundToEquipmentPrecision(
            planBaseline + increment,
            equip,
          );
          newWeight = applyMaxWeeklyIncrease(
            planBaseline,
            newWeight,
            equip,
            tier,
          );
          newWeight = Math.max(newWeight, week1BaselineFloorStored);

          exercise.targetWeight = newWeight;
          exercise.sets = newPeriodisation.sets;
          exercise.reps = String(newPeriodisation.reps);
          exercise.repsMin = newPeriodisation.reps;
          exercise.repsMax = newPeriodisation.reps;
          exercise.targetRpe = newPeriodisation.targetRpe;
          exercise.setStructure = 'straight';
          delete exercise.setTargets;

          console.log('[TARGET LIFT]', {
            name: exName,
            planBaseline,
            increment,
            newWeight,
            newReps: newPeriodisation.reps,
          });
        } else if (isTargetLiftEx && dayIsVolume) {
          const accessoryTargetRpe =
            exercise.targetRpe > 0 ? exercise.targetRpe : 7.0;
          const gap = computeRpeGap(effectiveAvgRpe, accessoryTargetRpe);
          let increment = gap >= 2 ? 10 : gap >= 0 ? 5 : gap >= -1 ? 0 : -5;
          increment = scalePositiveIncrementByExperience(
            increment,
            experienceForProgression,
          );
          console.log(
            `[PROGRESSION] ${exName}: experience=${experienceForProgression}, multiplier=${experienceProgressionMultiplier(experienceForProgression)}, gap=${gap}, increment=${increment}`,
          );
          const tier = String(
            exercise.compoundTier ??
              getCompoundTierFromName(String(exercise.name ?? '')),
          );
          const equip = String(exercise.equipment ?? 'barbell');
          let volWeight = roundToEquipmentPrecision(
            planBaseline + increment,
            equip,
          );
          volWeight = applyMaxWeeklyIncrease(
            planBaseline,
            volWeight,
            equip,
            tier,
          );
          exercise.targetWeight = volWeight;
          exercise.reps = '8';
          exercise.repsMin = 8;
          exercise.repsMax = 8;
        } else {
          const accessoryTargetRpe =
            exercise.targetRpe > 0 ? exercise.targetRpe : 7.0;
          const tier = normalizeCompoundTier(
            exercise.compoundTier ??
              getCompoundTierFromName(String(exercise.name ?? '')),
          );
          const equip = String(exercise.equipment ?? 'barbell');
          const progression = computeAccessoryProgressionTarget({
            baselineWeight: planBaseline,
            avgLoggedRpe: effectiveAvgRpe,
            targetRpe: accessoryTargetRpe,
            equipment: equip,
            compoundTier: tier,
            trainingAge: experienceForProgression,
            exerciseName: String(exercise.name ?? exercise.exerciseName ?? exName),
          });
          const multiplier = experienceProgressionMultiplier(
            experienceForProgression,
          );
          console.log(
            `[PROGRESSION] ${exName}: experience=${experienceForProgression}, multiplier=${multiplier}, gap=${progression.rpeGap}, changeType=${progression.changeType}, increment=${progression.increment}`,
          );

          let newTargetWeight = applyMaxWeeklyIncrease(
            planBaseline,
            progression.newTargetWeight,
            equip,
            tier,
          );

          if (isPyramid) {
            if (
              Array.isArray(exercise.setTargets) &&
              exercise.setTargets.length > 0
            ) {
              applyPyramidSetTargetsAfterProgression(
                exercise,
                workingSets,
                newTargetWeight,
                loggedBaselineWeight,
                equip,
              );
              newTargetWeight = Number(exercise.targetWeight ?? newTargetWeight);
            } else {
              newTargetWeight = stampPyramidFromDesiredTopSet(
                exercise,
                newTargetWeight,
                equip,
              );
            }
          } else {
            exercise.targetWeight = newTargetWeight;
          }
        }

        stampExerciseAdaptationCopyAfterProgression({
          exercise,
          planBaseline,
          avgLoggedRpe: effectiveAvgRpe,
          accessoryTargetRpeForGap: accessoryTargetRpeForCopy,
          isTargetLiftEx: Boolean(isTargetLiftEx),
          dayIsVolume: Boolean(dayIsVolume),
          nextWeekNumber: Number(nextWeekNumber),
          loggedBaselineWeight,
        });

        const progressedWeight = Number(exercise.targetWeight ?? 0);
        const progressionIncrement = progressedWeight - planBaseline;
        const progressionRpeGap = computeRpeGap(
          avgLoggedRpe,
          accessoryTargetRpeForCopy,
        );
        console.log(
          `[PROGRESSION W${completedWeekNumber}→W${nextWeekNumber}]`,
          {
            name: exName,
            loggedWeight: loggedBaselineWeight,
            rpeGap: progressionRpeGap,
            increment: progressionIncrement,
            newTargetWeight: progressedWeight,
          },
        );

        if (progressedWeight > 0) {
          const repTargetHigh = parseRepTargetHigh(
            priorPlanExercise?.reps,
            priorPlanExercise?.repsMax,
          );
          const avgReps = avgLoggedRepsFromSets(workingSets);
          const repsExceeded =
            avgReps != null && avgReps > repTargetHigh + 0.5;
          upsertAdaptationDraft(adaptationDrafts, {
            key: exName,
            exerciseName: String(
              exercise.name ?? exercise.exerciseName ?? exName,
            ),
            muscleGroup: String(exercise.muscleGroup ?? ''),
            previousWeight: planBaseline,
            progressedWeight,
            avgLoggedRpe: workingSets.length > 0 ? effectiveAvgRpe : null,
            targetRpe: accessoryTargetRpeForCopy,
            rpeGap:
              workingSets.length > 0
                ? computeRpeGap(effectiveAvgRpe, accessoryTargetRpeForCopy)
                : null,
            repsExceeded,
            hadRpeData: workingSets.length > 0,
            isCalibration: false,
          });
        }
      }
    }
    // ── END PER-EXERCISE WEIGHT PROGRESSION ─────────────────────────────────

    if (phase === 'deload') {
      nextWeekData = {
        ...nextWeekData,
        days: applyDeloadPassToDays(nextWeekData.days),
      };
    }

    nextWeekData = {
      ...nextWeekData,
      days: rebuildPyramidAccessorySetTargetsAfterWeights(
        nextWeekData.days,
        planGoalForSetStructure,
        planGoalForSetStructure === 'strength'
          ? strengthTargetLiftForSetStructure
          : null,
      ),
    };

    nextWeekData = {
      ...nextWeekData,
      days: finalizeStrengthTargetLiftPeriodisationOnDays(
        nextWeekData.days,
        planGoalForSetStructure,
        planGoalForSetStructure === 'strength' ? strengthTargetLiftForSetStructure : null,
        nextWeekNumber,
        deloadCycleStored,
      ),
    };

    nextWeekData = {
      ...nextWeekData,
      days: applyStrengthVolumeDayTargetLiftReps(
        nextWeekData.days,
        planGoalForSetStructure,
        planGoalForSetStructure === 'strength' ? strengthTargetLiftForSetStructure : null,
        planJson,
      ),
    };

    nextWeekData = {
      ...nextWeekData,
      days: refreshAdaptationThisSessionSummaries(nextWeekData.days),
    };

    nextWeekData.adaptationChanges = buildAdaptationChangesFromDrafts(
      adaptationDrafts,
      nextWeekData.days,
      { phase, nextWeekNumber, completionTier },
    );

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

    const lastMergedWeek = updatedWeeks[updatedWeeks.length - 1];
    const sampleWorkoutDay = lastMergedWeek?.days?.find(
      (d: any) => d.type === 'workout' && (d.exercises?.length ?? 0) > 0,
    );
    const sampleEx = sampleWorkoutDay?.exercises?.[0];

    console.log('[WEEK TARGET]', {
      mutatingWeek: lastMergedWeek?.weekNumber ?? 'unknown',
      expectedWeek: nextWeekNumber,
      weeksLengthAfterMerge: updatedWeeks.length,
    });

    console.log('[DB WRITE] About to write plan_json', {
      planId,
      weekNumber: nextWeekNumber,
      sampleExercise: sampleEx
        ? {
            name: sampleEx.exerciseName ?? sampleEx.name,
            targetWeight: sampleEx.targetWeight,
            setTargets: sampleEx.setTargets,
          }
        : null,
    });

    const { error: writeError } = await supabase
      .from('plans')
      .update({ plan_json: updatedPlanJson })
      .eq('id', planId);

    console.log('[DB WRITE RESULT]', {
      error: writeError?.message ?? null,
      success: !writeError,
    });

    if (writeError) throw new Error(`Failed to update plan: ${writeError.message}`);

    // Write in-app notification — non-blocking, never throws
    try {
      const changeCount = nextWeekData.adaptationChanges?.length ?? 0;
      const phaseLabel =
        phase === 'deload' ? 'Deload week' :
        phase === 'intensification' ? 'Intensification phase' :
        'Accumulation phase';
      const body = changeCount > 0
        ? `${phaseLabel}. ${changeCount} exercise${changeCount === 1 ? '' : 's'} adjusted.`
        : `${phaseLabel}. Your plan is ready.`;

      await supabase.from('notifications').insert({
        user_id: userId,
        type: 'plan_adapted',
        title: `Week ${nextWeekNumber} is ready`,
        body,
        metadata: {
          plan_id: planId,
          week_number: nextWeekNumber,
          phase,
          completion_tier: completionTier,
          adaptation_change_count: changeCount,
        },
      });
    } catch (notifErr) {
      console.error('[notifications] plan_adapted write failed:', notifErr);
    }

    // Step 9 — Return success
    return new Response(
      JSON.stringify({
        status: 'success',
        nextWeekNumber,
        phase,
        completionTier,
        adaptationChangeCount: nextWeekData.adaptationChanges?.length ?? 0,
      }),
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
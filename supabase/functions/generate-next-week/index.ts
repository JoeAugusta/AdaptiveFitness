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

  const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
  const rpeValues = setsJson.map(normalizeLogSetRpe).filter((r) => r > 0);
  const avgRpe =
    rpeValues.length > 0
      ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length
      : 0;
  return { baselineWeight: avgWeight, baselineRpe: avgRpe, isRampPattern: false };
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
      if (resolvedName !== targetName) continue;
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

/**
 * Deterministically assigns setStructure to every exercise.
 * Overwrites whatever Claude returned — same pattern as stampEquipment.
 */
// deno-lint-ignore no-explicit-any
function enforceSetStructure(exercises: any[], goal: string): any[] {
  return exercises.map((ex) => {
    const equipment: string = ex.equipment ?? 'barbell';
    const sets: number = Array.isArray(ex.sets)
      ? ex.sets.length
      : typeof ex.sets === 'number'
        ? ex.sets
        : 3;
    const isBodyweight = equipment === 'bodyweight';

    const compoundTier = getCompoundTierFromName(String(ex.name ?? ''));
    const isIsolation = compoundTier === 'isolation';
    const isPrimaryCompound = compoundTier === 'primary_compound';
    const isSecondaryCompound = compoundTier === 'secondary_compound';
    const isHypertrophyGoal = goal === 'hypertrophy';
    const isPhase2Accessory = ex.phase === 'hypertrophy';

    let setStructure: 'straight' | 'pyramid' = 'straight';

    if (!isBodyweight && !isIsolation && !isPhase2Accessory) {
      if (isPrimaryCompound && sets >= 3) {
        setStructure = 'pyramid';
      } else if (isSecondaryCompound && sets >= 3 && !isHypertrophyGoal) {
        setStructure = 'pyramid';
      }
    }

    return { ...ex, setStructure, compoundTier };
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

/**
 * Calculates the correct weight increase based on RPE gap and exercise type.
 * This is TypeScript post-processing — Claude never computes weight targets.
 *
 * rpeGap = avgLoggedRpe - targetRpe
 * Negative = weights too light | Positive = weights too heavy
 */
function calculateWeightIncrease(
  currentWeight: number,
  rpeGap: number,
  isCompound: boolean,
  experience: string,
): number {
  if (currentWeight <= 0) return 0;

  let basePct: number;
  let fixedIncrease: number | null = null;

  // RPE gap buckets — negative means athlete found it easier than target
  if (rpeGap <= -2.5) {
    basePct = 0.08; // 8% — very easy, big jump needed
  } else if (rpeGap <= -1.5) {
    basePct = 0.05; // 5% — clearly too light
  } else if (rpeGap <= -0.5) {
    basePct = 0.03; // 3% — slightly light, modest increase
  } else {
    // On target (gap within ±0.5) — standard progression
    fixedIncrease = isCompound ? 2.5 : 1.0;
    basePct = 0;
  }

  // Experience multiplier — beginners respond faster, advanced slower
  const expMultiplier =
    experience === 'beginner' ? 1.3 :
    experience === 'advanced' ? 0.7 : 1.0;

  const rawIncrease = fixedIncrease !== null
    ? fixedIncrease
    : currentWeight * basePct * expMultiplier;

  // Round to nearest 2.5 lbs
  const rounded = Math.round(rawIncrease / 2.5) * 2.5;

  // Floor: always at least 2.5 lbs on compound, 1 lb on isolation
  const floor = isCompound ? 2.5 : 1.0;

  // Cap: never more than 12% of current weight in one jump
  const cap = Math.round((currentWeight * 0.12) / 2.5) * 2.5;

  return Math.min(Math.max(rounded, floor), cap);
}

function calculateWeightDecrease(
  currentWeight: number,
  rpeGap: number,
): number {
  if (currentWeight <= 0) return 0;

  // rpeGap positive = harder than target
  if (rpeGap >= 2.0) {
    return Math.round((currentWeight * 0.05) / 2.5) * 2.5; // 5% reduction
  }
  return 2.5; // minimal pullback for slight overshoot
}

function buildPyramidSets(
  topSetWeight: number,
  totalSets: number,
  baseReps: string,
  targetRpe: number,
  goal: string,
  _equipment: string,
  _loggedWeights: number[],
): Array<{
  setNumber: number;
  targetWeight: number;
  targetReps: string;
  targetRpe: number;
}> {
  const isStrengthGoal =
    goal === 'strength' || goal === 'power_hypertrophy';

  const STRENGTH_PCTS: Record<number, number[]> = {
    3: [0.75, 1.0, 0.88],
    4: [0.68, 0.85, 1.0, 0.88],
    5: [0.62, 0.75, 0.88, 1.0, 0.88],
    6: [0.60, 0.70, 0.82, 1.0, 0.90, 0.82],
  };

  const HYPERTROPHY_PCTS: Record<number, number[]> = {
    3: [0.72, 1.0, 0.88],
    4: [0.68, 0.84, 1.0, 0.88],
    5: [0.65, 0.78, 0.90, 1.0, 0.88],
    6: [0.62, 0.74, 0.84, 1.0, 0.90, 0.82],
  };

  const pcts = (isStrengthGoal ? STRENGTH_PCTS : HYPERTROPHY_PCTS)[totalSets] ??
    Array.from({ length: totalSets }, (_, i) =>
      i === totalSets - 1 ? 1.0 : 0.75 + (i * 0.2 / totalSets)
    );

  const STRENGTH_REPS: Record<number, string[]> = {
    3: ['6-8', '3-5', '5-7'],
    4: ['6-8', '4-6', '2-4', '4-6'],
    5: ['6-8', '5-7', '3-5', '1-3', '4-6'],
    6: ['8-10', '6-8', '4-6', '2-4', '2-4', '4-6'],
  };

  function hypertrophyRepsForPosition(
    pos: number,
    base: string,
    pctsLocal: number[],
  ): string {
    const parts = base.split(/[–\-]/).map((n) => parseInt(n.trim(), 10));
    let lo = parts[0] ?? 8;
    let hi = parts[1] ?? 12;
    if (!Number.isFinite(lo)) lo = 8;
    if (!Number.isFinite(hi)) hi = lo + 4;
    if (hi < lo) {
      const t = lo;
      lo = hi;
      hi = t;
    }

    const topSetIdx = pctsLocal.reduce(
      (bestI, p, i, arr) => (p > arr[bestI]! ? i : bestI),
      0,
    );

    if (pos === topSetIdx) {
      const a = lo;
      const b = Math.min(lo + 2, hi);
      return `${a}-${b}`;
    }
    if (pos < topSetIdx) {
      const a = Math.min(lo + 2, hi);
      const b = hi;
      return a <= b ? `${a}-${b}` : `${lo}-${hi}`;
    }
    const a = Math.min(lo + 1, hi);
    const b = Math.max(Math.min(hi - 1, hi), a);
    return `${a}-${b}`;
  }

  const topSetIdx = pcts.reduce(
    (bestI, p, i, arr) => (p > arr[bestI]! ? i : bestI),
    0,
  );

  return pcts.map((pct, i) => {
    const repRange = isStrengthGoal
      ? (STRENGTH_REPS[totalSets]?.[i] ?? baseReps)
      : hypertrophyRepsForPosition(i, baseReps, pcts);

    const targetWeight =
      i === topSetIdx
        ? Math.round(topSetWeight / 2.5) * 2.5
        : Math.round(topSetWeight * pct / 10) * 10;

    return {
      setNumber: i + 1,
      targetWeight,
      targetReps: repRange,
      targetRpe: i === topSetIdx
        ? targetRpe
        : Math.max(5, targetRpe - 1),
    };
  });
}

// deno-lint-ignore no-explicit-any
function applyPyramidPerSetTargets(
  ex: any,
  newTargetWeight: number,
  fallbackTargetRpe: number,
  planGoal: string,
  priorSetsAll: PriorSetRow[],
  completedWeekNumber: number,
  priorPlanExercise: any | null,
): any {
  const isPyramid =
    ex.setStructure === 'pyramid' ||
    ex.compoundTier === 'primary_compound';

  if (!isPyramid || newTargetWeight <= 0) {
    return { ...ex, targetWeight: newTargetWeight };
  }

  const setCount =
    typeof ex.sets === 'number'
      ? ex.sets
      : Array.isArray(ex.sets)
        ? ex.sets.length
        : 3;

  if (setCount <= 0) {
    return { ...ex, targetWeight: newTargetWeight };
  }

  const loggedWeightsSorted = [...priorSetsAll]
    .sort((a, b) => a.setNumber - b.setNumber)
    .map((s) => Number(s.weightLbs ?? 0));

  const positiveWeights = loggedWeightsSorted.filter((w) => w > 0);
  const allIdentical =
    positiveWeights.length >= 2 &&
    positiveWeights.every((w) => w === positiveWeights[0]);
  const hadPyramidTargets =
    Array.isArray(priorPlanExercise?.setTargets) &&
    priorPlanExercise.setTargets.length > 0;
  if (
    allIdentical &&
    hadPyramidTargets &&
    completedWeekNumber >= 2
  ) {
    return { ...ex, targetWeight: newTargetWeight };
  }

  const isStrengthGoal =
    planGoal === 'strength' || planGoal === 'power_hypertrophy';
  const baseReps = ex.reps ?? (isStrengthGoal ? '3-5' : '8-12');

  const pyramidSets = buildPyramidSets(
    newTargetWeight,
    setCount,
    baseReps,
    ex.targetRpe ?? fallbackTargetRpe ?? 8,
    planGoal,
    String(ex.equipment ?? 'barbell'),
    loggedWeightsSorted,
  );

  console.log(
    '[pyramid]',
    ex.name,
    pyramidSets.map((s) => s.targetWeight),
  );

  const out = {
    ...ex,
    targetWeight: newTargetWeight,
    setTargets: pyramidSets,
  };

  const devPyramidLog =
    typeof Deno !== 'undefined' &&
    Deno.env.get('ENVIRONMENT') === 'development';

  if (devPyramidLog) {
    console.log('[pyramid sets]', ex.name, {
      topSet: newTargetWeight,
      perSetWeights: pyramidSets.map((s) => s.targetWeight),
    });
  }
  return out;
}

/**
 * Finds the best matching key in exerciseData for a given exercise name.
 * Handles plural variants, word order differences, and partial matches.
 * Returns the matching key or null if no match found.
 */
function findExerciseDataKey(
  name: string,
  exerciseData: Record<string, any>,
): string | null {
  const key = name.toLowerCase().trim();

  // 1. Exact match
  if (exerciseData[key]) return key;

  // 2. Strip plural 's'
  if (key.endsWith('s') && exerciseData[key.slice(0, -1)]) {
    return key.slice(0, -1);
  }

  // 3. Add plural 's'
  if (exerciseData[key + 's']) return key + 's';

  // 4. Partial match — check if any data key is contained in this name
  //    or this name is contained in any data key
  //    Sort by length descending to prefer longer (more specific) matches
  const dataKeys = Object.keys(exerciseData).sort((a, b) => b.length - a.length);
  for (const dataKey of dataKeys) {
    if (key.includes(dataKey) || dataKey.includes(key)) {
      return dataKey;
    }
  }

  return null;
}

interface PriorSetRow {
  setNumber: number;
  weightLbs: number;
  rpe: number;
}

function getPriorSetsForExerciseFromLogs(
  exerciseName: string,
  priorWeekLogs: any[],
  exerciseIdToName: Record<string, string>,
): PriorSetRow[] {
  const target = exerciseName.toLowerCase().trim();
  const rows: PriorSetRow[] = [];
  for (const log of priorWeekLogs) {
    const sets: any[] = log.sets_json ?? [];
    for (const set of sets) {
      const resolvedName = String(
        (set.exerciseId ? exerciseIdToName[set.exerciseId] : null) ??
          set.exerciseName ??
          set.name ??
          '',
      ).toLowerCase().trim();
      if (resolvedName !== target) continue;
      const weight = Number(set.weightLbs ?? set.weight ?? 0);
      const rpe = Number(set.rpe ?? 0);
      const sn = Number(set.setNumber ?? 0);
      rows.push({
        setNumber: sn > 0 ? sn : rows.length + 1,
        weightLbs: weight,
        rpe,
      });
    }
  }
  return rows;
}

/** Claude prompt: how last week's loads are summarized (matches enforceWeightProgression top-set rule). */
function getLoggedWeightSummaryLine(
  priorSetsForExercise: PriorSetRow[],
): string | null {
  const weights = priorSetsForExercise
    .filter((s) => (s.weightLbs ?? 0) > 0)
    .map((s) => Number(s.weightLbs));
  if (weights.length === 0) return null;

  const avgLoggedWeight = Math.round(
    weights.reduce((a: number, b: number) => a + b, 0) / weights.length,
  );
  const maxLoggedWeight = Math.max(...weights);
  const weightVariance = maxLoggedWeight - avgLoggedWeight;
  const useTopSet = weightVariance > avgLoggedWeight * 0.05;

  return useTopSet
    ? `Top set: ${maxLoggedWeight} lbs (avg: ${avgLoggedWeight} lbs) — progression based on top set`
    : `Avg weight: ${avgLoggedWeight} lbs`;
}

function findPriorExerciseInPlanDays(
  exerciseName: string,
  planDays: any[],
): { setStructure?: string; compoundTier?: string } | null {
  const t = exerciseName.toLowerCase().trim();
  for (const day of planDays ?? []) {
    for (const ex of day.exercises ?? []) {
      if (String(ex.name ?? '').toLowerCase().trim() === t) {
        return ex as { setStructure?: string; compoundTier?: string };
      }
    }
  }
  return null;
}

function computePyramidFlags(
  priorSetsAll: PriorSetRow[],
  priorExercise: { setStructure?: string; compoundTier?: string } | null,
  exerciseNameForFallback: string,
): {
  isPyramidLogging: boolean;
  isPyramidStructure: boolean;
  weights: number[];
  sortedBySet: PriorSetRow[];
} {
  const sortedBySet = [...priorSetsAll]
    .filter((s) => s.weightLbs > 0)
    .sort((a, b) => a.setNumber - b.setNumber);

  const weights = sortedBySet.map((s) => s.weightLbs);

  const isPyramidLogging =
    sortedBySet.length >= 2 &&
    sortedBySet.every((s, i) =>
      i === 0 || s.weightLbs >= sortedBySet[i - 1]!.weightLbs,
    ) &&
    sortedBySet[sortedBySet.length - 1]!.weightLbs > sortedBySet[0]!.weightLbs;

  const isPyramidStructure =
    priorExercise?.setStructure === 'pyramid' ||
    (priorExercise?.compoundTier
      ? priorExercise.compoundTier === 'primary_compound'
      : getCompoundTierFromName(exerciseNameForFallback) === 'primary_compound');

  return { isPyramidLogging, isPyramidStructure, weights, sortedBySet };
}

/**
 * Post-processes Claude's next-week plan and enforces correct weight targets.
 * Claude provides structure, coaching notes, and exercise selection.
 * This function owns all weight arithmetic — Claude's weight values are overwritten.
 */
function enforceWeightProgression(
  nextWeekDays: any[],
  priorWeekLogs: any[], // sets_json from prior week's workout_logs
  priorWeekPlanDays: any[], // the prior week's plan day objects from plan_json
  experience: string,
  isDeloadWeek: boolean,
  exerciseIdToName: Record<string, string>,
  planGoal: string,
  completedWeekNumber: number,
): any[] {
  if (isDeloadWeek) return nextWeekDays; // deload weights handled by ×0.8 logic separately

  // Build lookup: exerciseName → { avgLoggedWeight, avgLoggedRpe, targetRpe, targetWeight }
  type ExerciseLog = {
    totalWeight: number;
    totalRpe: number;
    count: number;
    targetRpe: number;
    targetWeight: number;
    equipment: string;
    isCompound: boolean;
  };
  const exerciseData: Record<string, ExerciseLog> = {};
  const exerciseSetsByKey: Record<string, PriorSetRow[]> = {};

  // Load target data from prior week plan
  for (const day of priorWeekPlanDays) {
    for (const ex of day.exercises ?? []) {
      if (!ex.name) continue;
      const key = ex.name.toLowerCase().trim();
      exerciseData[key] = {
        totalWeight: 0,
        totalRpe: 0,
        count: 0,
        targetRpe: ex.targetRpe ?? 8,
        targetWeight: ex.targetWeight ?? 0,
        equipment: ex.equipment ?? 'barbell',
        // Compound if low reps (≤8 low end) — same proxy as enforceWeek1Rpe
        isCompound: (() => {
          const lowEnd = parseInt(String(ex.reps ?? '').split('-')[0], 10);
          return isNaN(lowEnd) || lowEnd < 9;
        })(),
      };
    }
  }

  console.log('[enforceWeight] exerciseData keys:', Object.keys(exerciseData));

  // Accumulate actual logged data
  for (const log of priorWeekLogs) {
    const sets: any[] = log.sets_json ?? [];
    for (const set of sets) {
      // sets_json stores exerciseId — resolve to name via map
      // Fallback chain: exerciseId lookup → exerciseName field → name field
      const resolvedName =
        (set.exerciseId ? exerciseIdToName[set.exerciseId] : null) ??
        set.exerciseName ??
        set.name ??
        '';

      const key = String(resolvedName).toLowerCase().trim();
      if (!key || !exerciseData[key]) continue;

      const weight = Number(set.weightLbs ?? set.weight ?? 0);
      const rpe = Number(set.rpe ?? 0);

      if (weight > 0) {
        exerciseData[key].totalWeight += weight;
        exerciseData[key].count += 1;
      }
      if (rpe > 0) {
        exerciseData[key].totalRpe += rpe;
      }

      if (!exerciseSetsByKey[key]) exerciseSetsByKey[key] = [];
      const sn = Number(set.setNumber ?? 0);
      exerciseSetsByKey[key].push({
        setNumber: sn > 0 ? sn : exerciseSetsByKey[key].length + 1,
        weightLbs: weight,
        rpe,
      });
    }
  }

  for (const [name, data] of Object.entries(exerciseData)) {
    if (data.count > 0) {
      console.log(`[enforceWeight] accumulated: "${name}" count=${data.count} avgWeight=${data.totalWeight/data.count} avgRpe=${data.totalRpe > 0 ? data.totalRpe/data.count : 0}`);
    }
  }

  // Enforce correct weights on next week's plan — new day + exercise objects (no in-place mutation)
  return nextWeekDays.map((day: any, dayIdx: number) => {
    if (day.type !== 'workout') return day;

    const priorDay = priorWeekPlanDays[dayIdx];
    const priorExercises = priorDay?.exercises ?? [];

    return {
      ...day,
      exercises: (day.exercises ?? []).map((ex: any, exIdx: number) => {
      const priorPlanExercise = priorExercises[exIdx] ?? null;
      const rawKey = String(ex.name ?? '').toLowerCase().trim();
      const matchedKey = findExerciseDataKey(rawKey, exerciseData);
      const data = matchedKey ? exerciseData[matchedKey] : null;
      console.log(`[enforceWeight] looking up: "${rawKey}" → matched: "${matchedKey}" count=${data?.count ?? 'null'}`);

      // No logged sets for this exercise — keep Claude's value
      // NOTE: data.targetWeight === 0 is intentionally NOT checked here.
      // Week 1 self-select exercises have targetWeight: 0 in the plan,
      // but the user logs their actual weight. We must use avgLoggedWeight.
      if (!data || data.count === 0) return ex;

      const priorSetsAll = matchedKey
        ? (exerciseSetsByKey[matchedKey] ?? [])
        : [];

      const weights = priorSetsAll
        .filter((s) => (s.weightLbs ?? 0) > 0)
        .map((s) => Number(s.weightLbs));

      if (weights.length === 0) return ex;

      const maxLoggedWeight =
        weights.length > 0 ? Math.max(...weights) : 0;

      const avgLoggedWeight = weights.length > 0
        ? Math.round(
          weights.reduce((a: number, b: number) => a + b, 0) / weights.length,
        )
        : 0;

      const weightVariance = maxLoggedWeight - avgLoggedWeight;
      const useTopSet = weightVariance > avgLoggedWeight * 0.05;

      const baselineWeight = Math.round(
        useTopSet ? maxLoggedWeight : avgLoggedWeight,
      );

      const eqForBaseline = data.equipment ?? 'barbell';
      const incrementForBaseline = getRoundingIncrement(eqForBaseline);
      const roundedBaseline =
        incrementForBaseline > 0
          ? Math.round(baselineWeight / incrementForBaseline) *
            incrementForBaseline
          : baselineWeight;

      const topSetEntry = useTopSet
        ? [...priorSetsAll]
          .filter((s) => (s.weightLbs ?? 0) > 0)
          .sort((a, b) => Number(b.weightLbs) - Number(a.weightLbs))[0] ?? null
        : null;

      const avgLoggedRpe = (() => {
        const positivePrior = priorSetsAll.filter((s) => (s.weightLbs ?? 0) > 0);
        if (ex.setStructure === 'pyramid' && positivePrior.length >= 2) {
          const maxW = Math.max(...positivePrior.map((s) => Number(s.weightLbs)));
          const topRpes = positivePrior
            .filter((s) => Number(s.weightLbs) === maxW)
            .map((s) => Number(s.rpe))
            .filter((r) => r > 0);
          if (topRpes.length > 0) {
            return topRpes.reduce((a: number, b: number) => a + b, 0) /
              topRpes.length;
          }
          return 0;
        }
        if (topSetEntry?.rpe && topSetEntry.rpe > 0) {
          return topSetEntry.rpe;
        }
        const rpeVals = priorSetsAll
          .filter((s) => s.rpe && s.rpe > 0)
          .map((s) => Number(s.rpe));
        return rpeVals.length > 0
          ? rpeVals.reduce((a: number, b: number) => a + b, 0) / rpeVals.length
          : 0;
      })();

      // No RPE data — hold weight
      if (avgLoggedRpe === 0) {
        const eq = data.equipment ?? 'barbell';
        let w = roundedBaseline;
        const increment = getRoundingIncrement(eq);
        if (increment > 0) {
          w = Math.round(w / increment) * increment;
        }
        const weightFloor = (eq === 'bodyweight')
          ? 0
          : (eq === 'dumbbell' || eq === 'cable' ||
              eq === 'machine')
            ? 5
            : 45;
        w = Math.max(weightFloor, w);
        // Sanity cap: dumbbell exercises can't exceed realistic rack weights
        // Most gyms max out at 120-150 lbs dumbbells
        if (eq === 'dumbbell') {
          w = Math.min(w, 150);
        }
        return applyPyramidPerSetTargets(
          ex,
          w,
          data.targetRpe,
          planGoal,
          priorSetsAll,
          completedWeekNumber,
          priorPlanExercise,
        );
      }

      const rpeGap = avgLoggedRpe - data.targetRpe;

      let newWeight: number;

      if (rpeGap > 1.0) {
        // Harder than target — decrease
        const decrease = calculateWeightDecrease(roundedBaseline, rpeGap);
        newWeight = roundedBaseline - decrease;
      } else if (rpeGap < -0.5 || avgLoggedRpe <= 6) {
        // Easier than target — increase
        const increase = calculateWeightIncrease(
          roundedBaseline,
          rpeGap,
          data.isCompound,
          experience,
        );
        newWeight = roundedBaseline + increase;
      } else {
        // On target — hold
        newWeight = roundedBaseline;
      }

      const eq = data.equipment ?? 'barbell';
      // Round to nearest equipment-appropriate increment
      const increment = getRoundingIncrement(eq);
      if (increment > 0) {
        newWeight = Math.round(newWeight / increment) * increment;
      }
      // Equipment-aware floor
      const weightFloor = (eq === 'bodyweight')
        ? 0
        : (eq === 'dumbbell' || eq === 'cable' ||
            eq === 'machine')
          ? 5
          : 45; // barbell minimum (empty bar)
      newWeight = Math.max(weightFloor, newWeight);
      // Sanity cap: dumbbell exercises can't exceed realistic rack weights
      // Most gyms max out at 120-150 lbs dumbbells
      if (eq === 'dumbbell') {
        newWeight = Math.min(newWeight, 150);
      }

      return applyPyramidPerSetTargets(
        ex,
        newWeight,
        data.targetRpe,
        planGoal,
        priorSetsAll,
        completedWeekNumber,
        priorPlanExercise,
      );
      }),
    };
  });
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
    const workoutDays = (weekData?.days ?? []).filter((d: any) => d.type === 'workout');
    const daysPerWeek: number = planJson.daysPerWeek ?? workoutDays.length;

    const weeksArr = planJson.weeks ?? [];
    const isCompletedWeekDeload =
      String(weekData?.phase ?? '').toLowerCase() === 'deload';
    let baselineWeekForWeights: typeof weekData = weekData;
    if (isCompletedWeekDeload && completedWeekNumber >= 2) {
      baselineWeekForWeights =
        weeksArr.find(
          (w: any) => Number(w.weekNumber) === completedWeekNumber - 1,
        ) ?? weekData;
    }
    const baselineWorkoutDays = (baselineWeekForWeights?.days ?? []).filter(
      (d: any) => d.type === 'workout',
    );
    const preDeloadTargetWeightByName: Record<string, number> = {};
    for (const day of baselineWorkoutDays) {
      for (const ex of day.exercises ?? []) {
        if (ex?.name) {
          preDeloadTargetWeightByName[ex.name] = ex.targetWeight ?? 0;
        }
      }
    }

    const priorWeeksData = (planJson.weeks ?? [])
      .filter(
        (w: any) =>
          w.weekNumber >= completedWeekNumber - 2 &&
          w.weekNumber < completedWeekNumber,
      )
      .sort((a: any, b: any) => a.weekNumber - b.weekNumber);

    // Build exerciseId → exerciseName map from ALL weeks in plan_json
    const exerciseIdToName: Record<string, string> = {};
    for (const week of planJson.weeks ?? []) {
      for (const day of week.days ?? []) {
        for (const ex of day.exercises ?? []) {
          if (ex.id && ex.name) {
            exerciseIdToName[ex.id] = ex.name;
          }
        }
      }
    }

    type PrescribedEx = {
      targetWeight: number;
      /** Raw plan value — use for self-select / zero-target guards (null vs 0). */
      targetWeightFromPlan: number | null | undefined;
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
          targetWeightFromPlan: ex.targetWeight,
          targetRpe: ex.targetRpe ?? 0,
          targetReps: parseMidReps(ex.reps ?? '0'),
          minReps: parseMinReps(ex.reps ?? '1'),
          sets: ex.sets ?? 3,
          reps: ex.reps ?? '8-10',
        };
      }
    }

    const hasAnyZeroPriorTarget = Object.values(prescribedMap).some(
      (p) => p.targetWeightFromPlan === 0 || p.targetWeightFromPlan == null,
    );

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
      const histWeight =
        isCompletedWeekDeload && completedWeekNumber >= 2
          ? (preDeloadTargetWeightByName[name] ?? prescribed.targetWeight)
          : prescribed.targetWeight;
      weightHistoryMap[name].push(histWeight);
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
          (set.exerciseId ? exerciseIdToName[set.exerciseId] : null) ??
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

    const nextWeekNumber = completedWeekNumber + 1;

    // Build exercise adaptations
    const exerciseAdaptations: any[] = [];

    for (const [name, prescribed] of Object.entries(prescribedMap)) {
      const actual = actualMap[name];
      const priorSetsForPyramid = getPriorSetsForExerciseFromLogs(
        name,
        logs,
        exerciseIdToName,
      );
      const priorExForPyramid = findPriorExerciseInPlanDays(
        name,
        weekData?.days ?? [],
      );
      const pyramidFlags = computePyramidFlags(
        priorSetsForPyramid,
        priorExForPyramid,
        name,
      );
      const avgWeightForPyramid =
        actual && actual.count > 0 ? actual.totalWeight / actual.count : 0;
      const priorTargetForPyramid = prescribed.targetWeight ?? 0;
      const pyramidNote =
        pyramidFlags.weights.length > 0 &&
        (pyramidFlags.isPyramidLogging || pyramidFlags.isPyramidStructure) &&
        (priorTargetForPyramid > 0 || avgWeightForPyramid > 0)
          ? `Note: ${name} was logged as ascending weights (pyramid style). Week ${nextWeekNumber} target is based on top set of ${Math.max(...pyramidFlags.weights)} lbs.`
          : '';

      const weightSummaryLine = getLoggedWeightSummaryLine(priorSetsForPyramid);

      const avgReps = actual && actual.count > 0 ? actual.totalReps / actual.count : 0;
      const avgRpe = actual && actual.count > 0 ? actual.totalRpe / actual.count : 0;
      const compound = isCompound(name);
      const hasRpeData = avgRpe > 0;
      const tw = prescribed.targetWeightFromPlan;
      // When priorTargetWeight is 0 (self-select week), enforceWeightProgression
      // handles all weight arithmetic after Claude responds. Skip old adaptation
      // logic entirely to prevent conflict.
      if (tw === 0 || tw == null) {
        const week1Baseline = getWeek1BaselineFromLogs(logs, exerciseIdToName, name);
        const baselineWeight = week1Baseline.baselineWeight;
        const rpeForAdaptation =
          week1Baseline.baselineRpe > 0 ? week1Baseline.baselineRpe : avgRpe;
        const hasRpeForSelfSelect = rpeForAdaptation > 0;
        const baselineWDisplay = Math.round(baselineWeight);

        console.log('[weight adaptation]', {
          exerciseName: name,
          priorTargetWeight: tw ?? 0,
          baselineWeight,
          isRampPattern: week1Baseline.isRampPattern,
          rpeForAdaptation,
          hasRpeData: hasRpeForSelfSelect,
          deferWeightToPostProcessing: true,
        });

        exerciseAdaptations.push({
          name,
          baselineWeight,
          isRampPattern: week1Baseline.isRampPattern,
          avgRpe: Math.round(rpeForAdaptation * 10) / 10,
          hasRpeData: hasRpeForSelfSelect,
          avgReps: Math.round(avgReps * 10) / 10,
          targetRpe: prescribed.targetRpe,
          targetReps: prescribed.targetReps,
          minReps: prescribed.minReps,
          oldReps: prescribed.reps,
          sets: prescribed.sets,
          isUnilateral: isUnilateralExercise(name),
          oldWeight: baselineWDisplay,
          deferWeightToPostProcessing: true,
          ...(pyramidNote ? { pyramidNote } : {}),
          ...(weightSummaryLine ? { weightSummaryLine } : {}),
        });
        continue;
      }

      const priorTargetWeight = prescribed.targetWeight ?? 0;

      let weightAction: 'increase' | 'decrease' | 'hold';
      let weightDelta: number;
      let newTargetWeight: number;
      const progressionBaseWeight =
        isCompletedWeekDeload && completedWeekNumber >= 2
          ? (preDeloadTargetWeightByName[name] ?? prescribed.targetWeight)
          : prescribed.targetWeight;

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
            progressionBaseWeight,
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

      newTargetWeight = Math.max(0, progressionBaseWeight + weightDelta);

      exerciseAdaptations.push({
        name,
        oldWeight: progressionBaseWeight,
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
        isUnilateral: isUnilateralExercise(name),
        ...(pyramidNote ? { pyramidNote } : {}),
        ...(weightSummaryLine ? { weightSummaryLine } : {}),
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

    const weightProgressionBaselineSection = hasAnyZeroPriorTarget
      ? `
WEIGHT TARGETS (self-select / zero prior target): Some adaptations include "deferWeightToPostProcessing": true, meaning final weights are enforced after your response. For those exercises only: do not copy progression weights or hold/increase/decrease from adaptations. Use baselineWeight, avgRpe, avgReps, and ramp flags for qualitative coaching only.
For exercises without deferWeightToPostProcessing: set targetWeight to the same value as last week's logged weight. Do NOT calculate increases or decreases — weight progression is handled in post-processing. Your job is exercise selection, rep ranges, set structure, and coaching notes only.
`
      : `
WEIGHT TARGETS: Set targetWeight to the same value as last week's logged weight for each exercise. Do NOT calculate increases or decreases — weight progression is handled in post-processing. Your job is exercise selection, rep ranges, set structure, and coaching notes only.
`;

    const freeSessionSummary = buildFreeSessionSummary(freeSessions ?? []);

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

You are Jordan, the athlete's personal coach. You have their last week of performance data and you are writing their next week plan. Generate the training plan as structured JSON with varied exercise selection, smart ordering, and coaching notes that reference the user's actual performance.
${weightProgressionBaselineSection}
RAMP-UP WORKING SETS (Week 1 self-select and similar):
${hasAnyZeroPriorTarget ? `- If an exercise has deferWeightToPostProcessing: true and isRampPattern: true, the user ramped up to their working weight across sets within a session. Use baselineWeight for peak context only; do not tie coaching notes to newTargetWeight or progression from adaptations (final weights are post-processed).
- If deferWeightToPostProcessing: true: ignore newTargetWeight in adaptations for that exercise.
` : `- If an exercise adaptation has isRampPattern: true, the user ramped up to their working weight across sets within a session (e.g. lighter early sets, heaviest working sets at the end). The baselineWeight and newTargetWeight in the data already use their PEAK working weight, not an average across ramp sets.
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
${hasAnyZeroPriorTarget ? `- If deferWeightToPostProcessing is true for an exercise: do not reference weightAction or prescribe hold/increase/decrease from adaptations. Use baselineWeight, avgRpe, avgReps, and isRampPattern for qualitative coaching only.
` : ''}- If weightAction is 'increase': explain that load should progress because last week ran light vs target — stay qualitative, no invented pound amounts for this week
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

Exercise adaptations for next week (context for coaching${hasAnyZeroPriorTarget ? ' — for exercises without deferWeightToPostProcessing, copy targetWeight from newTargetWeight; for deferWeightToPostProcessing, use baseline/performance fields only' : ' — copy targetWeight from newTargetWeight'}; arithmetic is finalized in post-processing):
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
${hasAnyZeroPriorTarget ? `- If deferWeightToPostProcessing is true for an exercise: do not set targetWeight from a prescribed progression or use weightAction for coaching notes. Set targetWeight to 0 in JSON. Do not invent hold, increase, or specific next-week pound amounts for that exercise. Final weights are applied in post-processing.
` : ''}- Set each exercise targetWeight to the newTargetWeight value from the list above (last week's working weight) for exercises without deferWeightToPostProcessing. Do not substitute your own calculated weights
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

    // Ensure weekNumber and phase are set correctly; lock layout to completed week
    nextWeekData.weekNumber = nextWeekNumber;
    nextWeekData.phase = phase;
    nextWeekData = mergeNextWeekWithPreviousStructure(weekData, nextWeekData, nextWeekNumber, phase);

    const experienceForProgression =
      (planJson as { experience?: string }).experience ?? trainingAge;

    const priorWeekPlanDaysWithEquipment = (weekData?.days ?? []).map((day: any) => ({
      ...day,
      exercises: stampEquipment(day.exercises ?? []),
    }));

    const planGoalForSetStructure =
      typeof (planJson as { goal?: string }).goal === 'string' &&
      (planJson as { goal: string }).goal.length > 0
        ? (planJson as { goal: string }).goal
        : goalType;

    // Stamp equipment + setStructure BEFORE weight progression so applyPyramidPerSetTargets
    // sees setStructure === 'pyramid' / compoundTier (Claude often omits these).
    nextWeekData = {
      ...nextWeekData,
      days: (nextWeekData.days ?? []).map((day: any) => {
        if (day.type !== 'workout') return day;
        return {
          ...day,
          exercises: enforceSetStructure(
            stampEquipment(day.exercises ?? []),
            planGoalForSetStructure,
          ),
        };
      }),
    };

    const processedDays = enforceWeightProgression(
      nextWeekData.days ?? [],
      logs,
      priorWeekPlanDaysWithEquipment,
      experienceForProgression,
      phase === 'deload',
      exerciseIdToName,
      planGoalForSetStructure,
      completedWeekNumber,
    );

    nextWeekData = { ...nextWeekData, days: processedDays };

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

    const firstWorkoutDay = nextWeekData.days?.find(
      (d: any) => d.type === 'workout' && (d.exercises?.length ?? 0) > 0,
    );
    const firstEx = firstWorkoutDay?.exercises?.[0];
    console.log('[setTargets debug]', {
      exerciseName: firstEx?.name,
      targetWeight: firstEx?.targetWeight,
      hasSetTargets: !!firstEx?.setTargets,
      setTargetsCount: firstEx?.setTargets?.length ?? 0,
      setTargetWeights: firstEx?.setTargets?.map((s: any) => s.targetWeight),
    });

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
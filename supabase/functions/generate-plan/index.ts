import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { fetchAnthropicMessagesWithRetry } from '../_shared/anthropicRetry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** GAP-7: name → muscleEmphasis lookup. Keys are lowercase-trimmed exercise names. */
const MUSCLE_EMPHASIS_MAP: Record<string, string> = {
  // Chest
  'barbell bench press': 'mid_chest',
  'dumbbell bench press': 'mid_chest',
  'machine chest press': 'mid_chest',
  'push-up': 'mid_chest',
  'cable chest fly': 'mid_chest',
  'dumbbell chest fly': 'mid_chest',
  'incline barbell bench press': 'upper_chest',
  'incline dumbbell press': 'upper_chest',
  'decline bench press': 'lower_chest',
  // Back
  'barbell row': 'mid_back',
  'seated cable row': 'mid_back',
  'machine row': 'mid_back',
  't-bar row': 'mid_back',
  'barbell shrug': 'mid_back',
  'dumbbell shrug': 'mid_back',
  'cable shrug': 'mid_back',
  'kettlebell shrug': 'mid_back',
  'farmer carry': 'mid_back',
  'plate pinch hold': 'mid_back',
  deadlift: 'lats',
  'pull-up': 'lats',
  'lat pulldown': 'lats',
  'dumbbell row': 'lats',
  'chin-up': 'lats',
  'face pull': 'upper_back',
  'reverse dumbbell fly': 'rear_delt',
  // Shoulders
  'overhead press': 'front_delt',
  'dumbbell shoulder press': 'front_delt',
  'arnold press': 'front_delt',
  'machine shoulder press': 'front_delt',
  'dumbbell lateral raise': 'lateral_delt',
  'cable lateral raise': 'lateral_delt',
  'upright row': 'lateral_delt',
  // Biceps
  'barbell curl': 'short_head_bicep',
  'preacher curl': 'short_head_bicep',
  'dumbbell curl': 'long_head_bicep',
  'hammer curl': 'long_head_bicep',
  'cable curl': 'long_head_bicep',
  'incline dumbbell curl': 'long_head_bicep',
  // Triceps
  'tricep pushdown': 'lateral_head_tricep',
  'close-grip bench press': 'lateral_head_tricep',
  'dumbbell tricep kickback': 'lateral_head_tricep',
  dips: 'lateral_head_tricep',
  'overhead tricep extension': 'long_head_tricep',
  'skull crushers': 'long_head_tricep',
  // Legs
  'back squat': 'quads',
  'front squat': 'quads',
  'leg press': 'quads',
  'leg extension': 'quads',
  'hack squat': 'quads',
  'goblet squat': 'quads',
  'walking lunge': 'quads',
  'bulgarian split squat': 'glutes',
  'romanian deadlift': 'hamstrings',
  'stiff-leg deadlift': 'hamstrings',
  'dumbbell romanian deadlift': 'hamstrings',
  'leg curl': 'hamstrings',
  'nordic hamstring curl': 'hamstrings',
  'hip thrust': 'glutes',
  'glute bridge': 'glutes',
  'sumo deadlift': 'glutes',
  'cable kickback': 'glutes',
  'banded hip thrust': 'glutes',
  'kettlebell swing': 'glutes',
  'cable pull-through': 'adductors',
  'standing calf raise': 'gastrocnemius',
  'dumbbell calf raise': 'gastrocnemius',
  'leg press calf raise': 'gastrocnemius',
  'bodyweight calf raise': 'gastrocnemius',
  'smith machine calf raise': 'gastrocnemius',
  'seated calf raise': 'soleus',
  // Core
  plank: 'transverse_abs',
  'ab wheel rollout': 'transverse_abs',
  'pallof press': 'transverse_abs',
  'dead bug': 'transverse_abs',
  'hanging leg raise': 'rectus_abdominis',
  'cable crunch': 'rectus_abdominis',
  'russian twist': 'obliques',
};

/** GAP-7: Alias map — catches common Claude name variants that differ from library keys. */
const MUSCLE_EMPHASIS_ALIASES: Record<string, string> = {
  // Chest variants
  'incline barbell press': 'upper_chest',
  'incline press': 'upper_chest',
  'decline press': 'lower_chest',
  'weighted push-up': 'mid_chest',
  'cable fly': 'mid_chest',
  'pec deck': 'mid_chest',
  // Back variants
  'face pulls': 'upper_back',
  'bent-over row': 'mid_back',
  'bent over row': 'mid_back',
  'pendlay row': 'mid_back',
  'chest-supported row': 'mid_back',
  'chest supported row': 'mid_back',
  'single-arm row': 'lats',
  'single arm row': 'lats',
  'straight-arm pulldown': 'lats',
  'straight arm pulldown': 'lats',
  'pull up': 'lats',
  'chin up': 'lats',
  // Shoulder variants
  'lateral raise': 'lateral_delt',
  'lateral raises': 'lateral_delt',
  'side lateral raise': 'lateral_delt',
  'front raise': 'front_delt',
  'military press': 'front_delt',
  'seated overhead press': 'front_delt',
  'seated dumbbell press': 'front_delt',
  'reverse fly': 'rear_delt',
  'reverse pec deck': 'rear_delt',
  // Tricep variants
  'close grip bench press': 'lateral_head_tricep', // without hyphen
  'weighted dips': 'lateral_head_tricep',
  'tricep dips': 'lateral_head_tricep',
  'rope pushdown': 'lateral_head_tricep',
  'tricep rope pushdown': 'lateral_head_tricep',
  'cable overhead extension': 'long_head_tricep',
  'overhead cable extension': 'long_head_tricep',
  'ez bar skull crusher': 'long_head_tricep',
  'ez-bar skull crusher': 'long_head_tricep',
  // Bicep variants
  'ez bar curl': 'short_head_bicep',
  'ez-bar curl': 'short_head_bicep',
  'wide grip curl': 'short_head_bicep',
  'concentration curl': 'short_head_bicep',
  'narrow grip curl': 'long_head_bicep',
  'cross-body curl': 'long_head_bicep',
  // Leg variants
  'goblet squat': 'quads',
  'sumo squat': 'adductors',
  'walking lunges': 'quads',
  'reverse lunge': 'glutes',
  'step up': 'quads',
  'step-up': 'quads',
  'nordic curl': 'hamstrings',
  'glute ham raise': 'hamstrings',
  'good morning': 'spinal_erectors',
  'good mornings': 'spinal_erectors',
  'banded glute bridge': 'glutes',
  'single-leg hip thrust': 'glutes',
  'single leg hip thrust': 'glutes',
  // Calf variants
  'calf raise': 'gastrocnemius',
  'calf raises': 'gastrocnemius',
  // Core variants
  'side plank': 'obliques',
  'woodchop': 'obliques',
  'wood chop': 'obliques',
  'hollow hold': 'transverse_abs',
  'hollow body hold': 'transverse_abs',
  'v-up': 'rectus_abdominis',
  'v up': 'rectus_abdominis',
  'sit-up': 'rectus_abdominis',
  'sit up': 'rectus_abdominis',
  'leg raise': 'rectus_abdominis',
  'leg raises': 'rectus_abdominis',
};

/** Normalise exercise name spelling variants */
const NAME_CORRECTIONS: Record<string, string> = {
  flye: 'Fly',
  flyes: 'Flys',
};

function normaliseExerciseName(name: string): string {
  return name.replace(/\bflye(s)?\b/gi, (_match, s) =>
    s ? NAME_CORRECTIONS.flyes : NAME_CORRECTIONS.flye,
  );
}

// deno-lint-ignore no-explicit-any
function stampMuscleEmphasis(exercises: any[]): any[] {
  return exercises.map((ex) => {
    const key = String(ex.name ?? '').toLowerCase().trim();

    // 1. Exact match against primary map
    if (MUSCLE_EMPHASIS_MAP[key]) {
      return {
        ...ex,
        name: normaliseExerciseName(String(ex.name ?? '')),
        muscleEmphasis: MUSCLE_EMPHASIS_MAP[key],
      };
    }

    // 2. Exact match against alias map
    if (MUSCLE_EMPHASIS_ALIASES[key]) {
      return {
        ...ex,
        name: normaliseExerciseName(String(ex.name ?? '')),
        muscleEmphasis: MUSCLE_EMPHASIS_ALIASES[key],
      };
    }

    // 3. Partial match — check if any map key is contained in the exercise name
    //    Catches "Weighted Dips" matching "dips", "Incline Barbell Press" matching "incline barbell bench press"
    const allEntries = { ...MUSCLE_EMPHASIS_MAP, ...MUSCLE_EMPHASIS_ALIASES };
    for (const [mapKey, emphasis] of Object.entries(allEntries)) {
      if (key.includes(mapKey) || mapKey.includes(key)) {
        return {
          ...ex,
          name: normaliseExerciseName(String(ex.name ?? '')),
          muscleEmphasis: emphasis,
        };
      }
    }

    // 4. Fallback — keep Claude's value if it's in the valid taxonomy, else 'mid_chest'
    const VALID_TAXONOMY = new Set([
      'upper_chest', 'mid_chest', 'lower_chest',
      'upper_back', 'mid_back', 'lats',
      'front_delt', 'lateral_delt', 'rear_delt',
      'long_head_tricep', 'lateral_head_tricep',
      'short_head_bicep', 'long_head_bicep',
      'quads', 'hamstrings', 'glutes', 'adductors',
      'gastrocnemius', 'soleus',
      'rectus_abdominis', 'obliques', 'transverse_abs', 'spinal_erectors',
    ]);
    const claudeValue = ex.muscleEmphasis ?? '';
    return {
      ...ex,
      name: normaliseExerciseName(String(ex.name ?? '')),
      muscleEmphasis: VALID_TAXONOMY.has(claudeValue) ? claudeValue : 'mid_chest',
    };
  });
}

// deno-lint-ignore no-explicit-any
function enforceWeek1Rpe(exercises: any[]): any[] {
  return exercises.map((ex) => {
    // Use rep range low end as compound/isolation proxy.
    // plan_json does not store compoundTier — rep range is the reliable signal.
    // "3-5", "4-6", "6-8" → compound (cap 8)
    // "8-10", "10-12", "12-15" → isolation (cap 7)
    const repsStr = String(ex.reps ?? '');
    const lowEnd = parseInt(repsStr.split('-')[0], 10);

    // If rep range starts at 9 or higher → isolation cap, otherwise compound cap
    const cap = (!isNaN(lowEnd) && lowEnd >= 9) ? 7 : 8;
    const currentRpe = ex.targetRpe ?? 8;

    if (currentRpe <= cap) return ex;
    return { ...ex, targetRpe: cap };
  });
}

// deno-lint-ignore no-explicit-any
function stampMuscleEmphasisOnPlan(planJson: any): any {
  return {
    ...planJson,
    weeks: (planJson.weeks ?? []).map((week: any) => ({
      ...week,
      days: (week.days ?? []).map((day: any) => {
        if (!Array.isArray(day.exercises) || !day.exercises.length) {
          return day;
        }
        let exercises = stampMuscleEmphasis(day.exercises);
        if (week.weekNumber === 1) {
          exercises = enforceWeek1Rpe(exercises);
        }
        return { ...day, exercises };
      }),
    })),
  };
}

interface SessionDay {
  day: number;
  dayLabel?: string;
  type: 'workout' | 'rest';
  focus: string;
  primaryMuscles: string[];
  sessionIntensity: 'heavy' | 'volume' | 'moderate';
  liftDay?: 'heavy' | 'volume';
}

interface GeneratePlanBody {
  goal?: string;
  experience?: string;
  daysPerWeek?: number | string;
  /** User's lifting days (Mon–Sun chips); preferred alias for scheduledDays */
  trainingDays?: string[];
  /** BUG-8: Same as trainingDays — persisted on plan_json root for dashboard */
  scheduledDays?: string[];
  sessionLength?: string;
  equipment?: string;
  injuries?: string[];
  excludedExercises?: string[];
  splitId?: string;
  splitName?: string;
  splitRationale?: string;
  sessionStructure?: SessionDay[];
  targetLift?: string;
  current1RM?: number | string;
  target1RM?: number | string;
  liftFrequency?: number;
  priorityMuscles?: string[];
  /** S02b sub-muscle focus — biases exercise selection for priority muscles */
  subMusclePreferences?: Record<string, string> | null;
  currentSplit?: string | null;
  currentSplitOther?: string | null;
  splitDuration?: string | null;
  trainingBackground?: string | null;
  /** Legacy / extra fields not in the primary contract */
  planDuration?: number | string;
  /** Numeric weeks from client (preferred over parsing planDuration chips) */
  recommendedWeeks?: number | string;
  totalWeeks?: number | string;
  weeks?: number | string;
  plan_duration_weeks?: number | string;
  /** Fat-loss timeline chip id (8w, 12w, …) */
  targetDate?: string | null;
  split?: string;
  targetWeightLbs?: number;
  caloriePace?: string;
  /** GAP-5: Power-hypertrophy optional multi-lift current 1RM estimates */
  currentLifts?: {
    benchPress: number | null;
    backSquat: number | null;
    deadlift: number | null;
    overheadPress: number | null;
  } | null;
  /** GAP-2: Enhanced recovery flag — user indicates exceptional recovery capacity */
  enhancedRecovery?: boolean;
  /** GAP-1: Concurrent sport training context */
  concurrentSport?: { type: string[]; daysPerWeek: number } | null;
  /** GAP-8: Biological sex for sex-aware rep range and volume adjustments */
  biologicalSex?: 'male' | 'female' | 'prefer_not_to_say' | null;
}

interface ProgrammingParams {
  sets: number;
  reps: string;
  restSeconds: number;
  targetRpe: number;
  weeklySetMin: number;
  weeklySetMax: number;
  prioritySetMin: number;
  prioritySetMax: number;
}

/** Weekly set bands derived from training frequency + experience (replaces flat per-experience landmarks in prompts). */
function getVolumeTargets(
  daysPerWeek: number,
  experience: string,
  _sessionLength: string,
): {
  weeklySetMin: number;
  weeklySetMax: number;
  prioritySetMin: number;
  prioritySetMax: number;
} {
  const d = Math.min(7, Math.max(2, Math.round(daysPerWeek)));
  const byDays: Record<number, { min: number; max: number }> = {
    2: { min: 8, max: 14 },
    3: { min: 10, max: 16 },
    4: { min: 12, max: 18 },
    5: { min: 14, max: 20 },
    6: { min: 16, max: 22 },
    7: { min: 16, max: 22 },
  };
  const base = byDays[d] ?? byDays[4];

  const expMultiplier =
    {
      beginner: 0.7,
      intermediate: 0.85,
      advanced: 1.0,
    }[experience] ?? 0.85;

  const targetSets = Math.round(
    base.min + (base.max - base.min) * expMultiplier,
  );

  return {
    weeklySetMin: base.min,
    weeklySetMax: base.max,
    prioritySetMin: Math.round(targetSets),
    prioritySetMax: Math.min(base.max, Math.round(targetSets) + 2),
  };
}

const GOAL_PROGRAMMING: Record<string, Record<string, ProgrammingParams>> = {
  strength: {
    beginner: {
      sets: 3,
      reps: '3-5',
      restSeconds: 240,
      targetRpe: 7,
      weeklySetMin: 8,
      weeklySetMax: 10,
      prioritySetMin: 10,
      prioritySetMax: 12,
    },
    intermediate: {
      sets: 5,
      reps: '3-5',
      restSeconds: 240,
      targetRpe: 8,
      weeklySetMin: 10,
      weeklySetMax: 16,
      prioritySetMin: 14,
      prioritySetMax: 18,
    },
    advanced: {
      sets: 6,
      reps: '1-5',
      restSeconds: 300,
      targetRpe: 9,
      weeklySetMin: 12,
      weeklySetMax: 20,
      prioritySetMin: 16,
      prioritySetMax: 22,
    },
  },
  hypertrophy: {
    beginner: {
      sets: 3,
      reps: '8-12',
      restSeconds: 90,
      targetRpe: 7,
      weeklySetMin: 8,
      weeklySetMax: 10,
      prioritySetMin: 10,
      prioritySetMax: 12,
    },
    intermediate: {
      sets: 4,
      reps: '6-12',
      restSeconds: 90,
      targetRpe: 8,
      weeklySetMin: 10,
      weeklySetMax: 16,
      prioritySetMin: 14,
      prioritySetMax: 18,
    },
    advanced: {
      sets: 5,
      reps: '6-15',
      restSeconds: 75,
      targetRpe: 9,
      weeklySetMin: 14,
      weeklySetMax: 20,
      prioritySetMin: 18,
      prioritySetMax: 22,
    },
  },
  // GAP-5: Power-Hypertrophy uses strength params for Phase 1 and hypertrophy params
  // for Phase 2. The prompt handles the two-phase split; these are the Phase 2 defaults.
  power_hypertrophy: {
    beginner: {
      sets: 3,
      reps: '6-12',
      restSeconds: 90,
      targetRpe: 7,
      weeklySetMin: 10,
      weeklySetMax: 14,
      prioritySetMin: 12,
      prioritySetMax: 16,
    },
    intermediate: {
      sets: 4,
      reps: '6-12',
      restSeconds: 90,
      targetRpe: 8,
      weeklySetMin: 12,
      weeklySetMax: 18,
      prioritySetMin: 14,
      prioritySetMax: 20,
    },
    advanced: {
      sets: 5,
      reps: '6-12',
      restSeconds: 90,
      targetRpe: 8,
      weeklySetMin: 14,
      weeklySetMax: 22,
      prioritySetMin: 18,
      prioritySetMax: 24,
    },
  },
  recomp: {
    beginner: {
      sets: 2,
      reps: '10-15',
      restSeconds: 60,
      targetRpe: 6,
      weeklySetMin: 6,
      weeklySetMax: 10,
      prioritySetMin: 8,
      prioritySetMax: 12,
    },
    intermediate: {
      sets: 3,
      reps: '8-15',
      restSeconds: 75,
      targetRpe: 7,
      weeklySetMin: 10,
      weeklySetMax: 14,
      prioritySetMin: 12,
      prioritySetMax: 16,
    },
    advanced: {
      sets: 4,
      reps: '8-12',
      restSeconds: 75,
      targetRpe: 8,
      weeklySetMin: 12,
      weeklySetMax: 16,
      prioritySetMin: 14,
      prioritySetMax: 18,
    },
  },
  fat_loss: {
    beginner: {
      sets: 2,
      reps: '12-15',
      restSeconds: 45,
      targetRpe: 6,
      weeklySetMin: 6,
      weeklySetMax: 8,
      prioritySetMin: 8,
      prioritySetMax: 10,
    },
    intermediate: {
      sets: 3,
      reps: '10-20',
      restSeconds: 60,
      targetRpe: 7,
      weeklySetMin: 8,
      weeklySetMax: 12,
      prioritySetMin: 10,
      prioritySetMax: 14,
    },
    advanced: {
      sets: 4,
      reps: '10-20',
      restSeconds: 60,
      targetRpe: 8,
      weeklySetMin: 10,
      weeklySetMax: 14,
      prioritySetMin: 12,
      prioritySetMax: 16,
    },
  },
  general: {
    beginner: {
      sets: 2,
      reps: '8-12',
      restSeconds: 90,
      targetRpe: 6,
      weeklySetMin: 6,
      weeklySetMax: 8,
      prioritySetMin: 8,
      prioritySetMax: 10,
    },
    intermediate: {
      sets: 3,
      reps: '8-12',
      restSeconds: 90,
      targetRpe: 7,
      weeklySetMin: 8,
      weeklySetMax: 12,
      prioritySetMin: 10,
      prioritySetMax: 14,
    },
    advanced: {
      sets: 4,
      reps: '8-12',
      restSeconds: 90,
      targetRpe: 8,
      weeklySetMin: 10,
      weeklySetMax: 16,
      prioritySetMin: 12,
      prioritySetMax: 18,
    },
  },
};

const HYPERTROPHY_REP_GUIDANCE = {
  advanced: {
    compounds: '6-10',
    secondaryCompounds: '8-12',
    isolations: '10-15',
  },
};

const FEMALE_REP_MAP: Record<string, string> = {
  '3-5': '5-7',
  '3-6': '5-8',
  '4-6': '6-8',
  '5-8': '7-10',
  '6-8': '8-10',
  '6-10': '8-12',
  '8-10': '10-12',
  '8-12': '10-14',
  '10-12': '12-14',
  '10-14': '12-16',
  '10-15': '12-17',
  '12-15': '14-17',
  '12-16': '14-18',
  '15-20': '17-22',
};

function adjustRepRange(repRange: string, biologicalSex: string): string {
  if (biologicalSex !== 'female') return repRange;

  // Strip suffix for lookup (e.g. " each side")
  const match = repRange.match(/^([\d]+-[\d]+)(.*)/);
  if (!match) return repRange;

  const baseRange = match[1];
  const suffix = match[2] ?? '';

  // Use lookup table first
  if (FEMALE_REP_MAP[baseRange]) {
    return `${FEMALE_REP_MAP[baseRange]}${suffix}`;
  }

  // Fallback: parse and add +2 to both ends
  const parts = baseRange.split('-');
  if (parts.length === 2) {
    const low = parseInt(parts[0], 10);
    const high = parseInt(parts[1], 10);
    if (!isNaN(low) && !isNaN(high)) {
      return `${low + 2}-${high + 2}${suffix}`;
    }
  }

  return repRange;
}

console.log('[adjustRepRange] tests:',
  adjustRepRange('3-6', 'female'),   // 5-8
  adjustRepRange('5-8', 'female'),   // 7-10 (if Claude drifts on Phase 1)
  adjustRepRange('8-12', 'female'),  // 10-14
  adjustRepRange('10-12', 'female'), // 12-14 (if Claude uses 10-12)
  adjustRepRange('6-8', 'female'),   // 8-10
  adjustRepRange('8-12', 'male'),    // 8-12
);

// GAP-8: Post-processing enforcement — Claude is non-compliant for certain exercises
// (e.g. Bench Press, Barbell Row revert to standard ranges). Female: rep buckets + lookup.
// Male power_hypertrophy: Phase 2 minimum rep floor (hypertrophy tag must not use strength ranges).
// deno-lint-ignore no-explicit-any
function enforceRepRanges(planJson: any, bSex: string): any {
  return {
    ...planJson,
    // deno-lint-ignore no-explicit-any
    weeks: (planJson.weeks ?? []).map((week: any) => ({
      ...week,
      // deno-lint-ignore no-explicit-any
      days: (week.days ?? []).map((day: any) => ({
        ...day,
        // deno-lint-ignore no-explicit-any
        exercises: (day.exercises ?? []).map((exercise: any) => {
          let adjustedReps = exercise.reps;

          if (bSex === 'female') {
            if (exercise.phase === 'strength') {
              // Phase 1: always force 5-8 regardless of Claude output
              adjustedReps = '5-8';
            } else if (exercise.phase === 'hypertrophy') {
              // Phase 2: bucket by the LOW end of Claude's range
              const raw = String(exercise.reps ?? '');
              const lowEnd = parseInt(raw.split('-')[0] ?? '', 10);
              const suffix = raw.includes('each') ? ' each side' : '';

              if (Number.isNaN(lowEnd)) {
                adjustedReps = adjustRepRange(raw, bSex);
              } else if (lowEnd <= 9) {
                adjustedReps = `10-14${suffix}`; // ≤9 → 10-14 (was 8-12 for ≤6; pull-ups etc.)
              } else if (lowEnd <= 11) {
                adjustedReps = `12-16${suffix}`; // 10-12, 10-15 → 12-16
              } else if (lowEnd <= 13) {
                adjustedReps = `14-18${suffix}`; // 12-15, 12-16 → 14-18
              } else {
                adjustedReps = `17-22${suffix}`; // 15-20 → 17-22
              }
            } else {
              // Non-phase exercises (non power_hypertrophy plans)
              adjustedReps = adjustRepRange(exercise.reps ?? '', bSex);
            }
          } else if (bSex === 'male' || !bSex) {
            // Male PH: enforce minimum 8 reps on Phase 2 (Claude sometimes outputs 6-8)
            if (planJson.goal === 'power_hypertrophy' && exercise.phase === 'hypertrophy') {
              const raw = String(exercise.reps ?? '');
              const lowEnd = parseInt(raw.split('-')[0] ?? '', 10);
              if (!Number.isNaN(lowEnd) && lowEnd < 8) {
                adjustedReps = '8-12';
                console.log(
                  `[enforce] Male Phase 2 rep correction: ${exercise.name} ${exercise.reps} → 8-12`,
                );
              }
            }
          }

          return { ...exercise, reps: adjustedReps };
        }),
      })),
    })),
  };
}

// Calculate starting weight from 1RM percentage
function calculateStartingWeight(oneRM: number, percentage: number): number {
  return Math.round((oneRM * percentage) / 2.5) * 2.5;
}

function buildSessionBreakdown(sessionStructure: SessionDay[]): string {
  return sessionStructure
    .map((day) => {
      const dow = day.dayLabel ? ` (${day.dayLabel})` : '';
      if (day.type === 'rest') {
        return `Day ${day.day}${dow}: Rest day`;
      }
      const muscles = Array.isArray(day.primaryMuscles) ? day.primaryMuscles.join(', ') : '';
      const intensity = day.sessionIntensity;
      const liftNote = day.liftDay
        ? ` — this is the ${day.liftDay} day for the target lift`
        : '';
      return `Day ${day.day}${dow}: ${day.focus} — primary muscles: ${muscles}, intensity: ${intensity}${liftNote}`;
    })
    .join('\n');
}

const LIFT_ACCESSORIES: Record<
  string,
  { direct: string[]; tricepLockout: string[]; stability: string[]; upperBack: string[] }
> = {
  'bench press': {
    direct: ['Close Grip Bench Press', 'Incline Barbell Press', 'Incline Dumbbell Press'],
    tricepLockout: ['Tricep Pushdown', 'Skull Crushers', 'Weighted Dips', 'Close Grip Bench Press'],
    stability: ['Face Pulls', 'Rear Delt Fly', 'Band Pull-Aparts', 'Cable External Rotation'],
    upperBack: ['Barbell Row', 'Seated Cable Row', 'Chest-Supported Row'],
  },
  'back squat': {
    direct: ['Pause Squat', 'Box Squat', 'Front Squat'],
    tricepLockout: [],
    stability: ['Glute Bridge', 'Clamshells', 'Hip Abduction'],
    upperBack: ['Romanian Deadlift', 'Good Morning', 'Glute Ham Raise'],
  },
  deadlift: {
    direct: ['Romanian Deadlift', 'Rack Pull', 'Deficit Deadlift'],
    tricepLockout: [],
    stability: ['Glute Ham Raise', 'Back Extension', 'Bird Dog'],
    upperBack: ['Barbell Row', 'Weighted Pull-up', 'Farmer Carry'],
  },
  'overhead press': {
    direct: ['Push Press', 'Seated DB Press', 'Arnold Press'],
    tricepLockout: ['Tricep Pushdown', 'Skull Crushers', 'Dips'],
    stability: ['Face Pulls', 'Band Pull-Aparts', 'Y-T-W Raises'],
    upperBack: ['Barbell Row', 'Lat Pulldown', 'Rear Delt Row'],
  },
};

const MOVEMENT_PATTERN_BLOCK = `MOVEMENT PATTERN REQUIREMENTS — every weekly plan must include at least one exercise from each of these patterns:
- Horizontal push: Bench Press, DB Press, Push-up variants
- Horizontal pull: Barbell Row, Cable Row, DB Row, Machine Row
- Squat pattern: Back Squat, Front Squat, Goblet Squat, Hack Squat
- Hinge pattern: Deadlift, Romanian Deadlift, Hip Thrust, Good Morning
- Core: Plank, Ab Wheel, Pallof Press, Cable Crunch, Hanging Leg Raise
- Vertical push (min every other week): Overhead Press, Arnold Press
- Vertical pull (min every other week): Pull-up, Lat Pulldown, Cable Pulldown
- Single leg (min every other week): Lunge, Bulgarian Split Squat, Step-up

For a 3-day PPL: horizontal push + horizontal pull + squat + hinge + core MUST all appear in Week 1. Vertical push/pull can be distributed across days.`;

const SESSION_LENGTH_RULES: Record<string, { note: string }> = {
  '30-45': {
    note:
      'Use shorter rest periods. ' +
      'Prioritise compound movements only — no isolation work ' +
      'unless there is time after the main lifts. ' +
      'Supersets acceptable for antagonist pairs (e.g. bench + row).',
  },
  '45-60': {
    note:
      'Normal rest periods. ' +
      'Include 1–2 isolation exercises after main compounds.',
  },
  '60-90': {
    note:
      'Full exercise selection where time allows. ' +
      'Standard rest periods. Include 2–3 isolation exercises.',
  },
  '90+': {
    note:
      'Full volume programming when time allows. ' +
      'Full rest periods for strength work. ' +
      'Include complete isolation work for all target muscles. ' +
      'Strength goal: include longer pause/technique sets.',
  },
};

const TIMELINE_CHIP_WEEKS: Record<string, number> = {
  '4w': 4,
  '8w': 8,
  '12w': 12,
  '16w': 16,
  '24w': 24,
};

function resolveTotalWeeks(body: GeneratePlanBody): number {
  const tryNum = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) {
      const r = Math.round(v);
      return r >= 1 && r <= 104 ? r : null;
    }
    const s = String(v).trim();
    const lead = s.match(/^\d+/);
    if (lead) {
      const n = parseInt(lead[0], 10);
      return n >= 1 && n <= 104 ? n : null;
    }
    return null;
  };

  const fromFields =
    tryNum(body.recommendedWeeks) ??
    tryNum(body.totalWeeks) ??
    tryNum(body.planDuration) ??
    tryNum(body.weeks) ??
    tryNum(body.plan_duration_weeks);

  if (fromFields != null) return fromFields;

  const td = body.targetDate;
  if (typeof td === 'string' && TIMELINE_CHIP_WEEKS[td] != null) {
    return TIMELINE_CHIP_WEEKS[td];
  }

  return 12;
}

function getMaxExercises(sessionLength: string, experience: string): number {
  const base: Record<string, number> = {
    '30-45': 4,
    '45-60': 5,
    '60-90': 6,
    '90+': 7,
  };
  const expBonus: Record<string, number> = {
    beginner: -1,
    intermediate: 0,
    advanced: 1,
  };
  const baseCount = base[sessionLength] ?? 5;
  const bonus = expBonus[experience] ?? 0;
  return Math.min(Math.max(1, baseCount + bonus), 8);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as GeneratePlanBody;

    const {
      goal: goalIn = 'general',
      experience: experienceIn = 'intermediate',
      daysPerWeek: daysPerWeekIn = 4,
      trainingDays: trainingDaysIn = [],
      scheduledDays: scheduledDaysBody,
      equipment = '',
      injuries: injuriesIn = [],
      excludedExercises: excludedExercisesIn = [],
      splitId: splitIdIn,
      splitName: splitNameIn,
      splitRationale = '',
      sessionStructure,
      targetLift,
      current1RM,
      target1RM,
      liftFrequency,
      priorityMuscles,
      subMusclePreferences: subMusclePreferencesIn,
    } = body;

    const workoutDayCount = (sessionStructure ?? []).filter(
      (d: SessionDay) => d.type === 'workout',
    ).length;

    const sessionLength: string = body.sessionLength ?? '45-60';

    const currentSplit: string | null = body.currentSplit ?? null;
    const currentSplitOther: string | null = body.currentSplitOther ?? null;
    const splitDuration: string | null = body.splitDuration ?? null;
    const trainingBackground: string | null = body.trainingBackground ?? null;
    const currentLifts = body.currentLifts ?? null;
    const enhancedRecovery = body.enhancedRecovery === true;
    const concurrentSport = body.concurrentSport ?? null;
    // GAP-8: Sex-aware programming — read from body (collected at S05 BodyMetrics as 'sex')
    const biologicalSex: string = body.biologicalSex ?? body.sex ?? 'male';
    const subMusclePreferences: Record<string, string> =
      subMusclePreferencesIn &&
      typeof subMusclePreferencesIn === 'object' &&
      !Array.isArray(subMusclePreferencesIn)
        ? (subMusclePreferencesIn as Record<string, string>)
        : {};

    // GAP-8: Prompt always uses base (male-equivalent) rep ranges; enforceRepRanges()
    // post-processes female +2 after Claude — single source of truth, no double application.

    const goal = goalIn ?? 'general';
    const trainingDays: string[] = (() => {
      if (Array.isArray(scheduledDaysBody) && scheduledDaysBody.length > 0) {
        return scheduledDaysBody.filter((d): d is string => typeof d === 'string' && d.length > 0);
      }
      if (Array.isArray(trainingDaysIn) && trainingDaysIn.length > 0) {
        return trainingDaysIn.filter((d): d is string => typeof d === 'string' && d.length > 0);
      }
      return [];
    })();
    const daysPerWeekParsed = parseInt(String(daysPerWeekIn ?? '4'), 10);
    const expRaw = String(experienceIn ?? 'intermediate').toLowerCase();
    const experience =
      expRaw === 'beginner' || expRaw === 'intermediate' || expRaw === 'advanced'
        ? expRaw
        : 'intermediate';
    const params =
      GOAL_PROGRAMMING[goal]?.[experience] ??
      GOAL_PROGRAMMING[goal]?.['intermediate'] ??
      GOAL_PROGRAMMING.general['intermediate'];

    const totalWeeks = resolveTotalWeeks(body);
    console.log('[generate-plan] params received:', {
      goal: body.goal,
      experience: body.experience,
      workoutDayCount: (sessionStructure ?? []).filter(
        (d: SessionDay) => d.type === 'workout',
      ).length,
      totalWeeks,
      splitId: body.splitId,
      caloriePace: body.caloriePace,
      sessionStructureLength: body.sessionStructure?.length,
      bodyKeys: Object.keys(body),
    });

    const sessionRules =
      SESSION_LENGTH_RULES[sessionLength] ?? SESSION_LENGTH_RULES['45-60'];
    const maxExercises = getMaxExercises(sessionLength, experience);

    const injuries = Array.isArray(injuriesIn) ? injuriesIn : [];
    const excludedExercises = Array.isArray(excludedExercisesIn) ? excludedExercisesIn : [];

    const exclusions = [...injuries, ...excludedExercises].join(', ') || 'none';

    const hasStructure = Array.isArray(sessionStructure) && sessionStructure.length > 0;
    const structureArr = hasStructure ? (sessionStructure as SessionDay[]) : [];
    const workoutDaysInStructure = structureArr.filter((d) => d.type === 'workout').length;
    const actualDaysPerWeek =
      workoutDaysInStructure > 0
        ? workoutDaysInStructure
        : trainingDays.length > 0
          ? trainingDays.length
          : daysPerWeekParsed;

    const volumeTargets = getVolumeTargets(
      actualDaysPerWeek,
      experience,
      sessionLength,
    );

    const absoluteRuleDayCount = workoutDayCount > 0 ? workoutDayCount : actualDaysPerWeek;

    const absoluteRuleBlock = `
ABSOLUTE RULE — SESSION COUNT:
The user trains ${absoluteRuleDayCount} days per week.
You must generate EXACTLY ${absoluteRuleDayCount} workout days in every week of the plan.
Generating more or fewer workout days than ${absoluteRuleDayCount} is a critical error.
Do not use the split name to determine how many days to generate.
The split name describes the training philosophy only.
The sessionStructure array below defines the exact sessions — use it.
`;

    const sessionStructureFollowBlock = `Session structure (follow exactly — do not add sessions):
${JSON.stringify(sessionStructure ?? [], null, 2)}

Each object with type === 'workout' maps to exactly one DayObject.
The title, focus, and primaryMuscles from each session object are your starting
point — fill in the exercises using goal, experience, equipment, and volume targets.`;

    let effectiveSplit = body.split ?? 'ppl';
    let splitOverrideNote = '';

    if (!hasStructure) {
      if (goal === 'strength') {
        const d = daysPerWeekParsed;
        const chosenSplit = body.split ?? 'ppl';

        if (chosenSplit === 'ppl' && d <= 3) {
          effectiveSplit = 'upper_lower';
          splitOverrideNote = `Note: The athlete selected PPL with ${d} days, but I've switched to Upper/Lower so ${targetLift?.replace(/_/g, ' ') ?? 'the target lift'} appears twice per week. Mention this in your plan title or first coaching note.`;
        } else if (chosenSplit === 'bro_split') {
          effectiveSplit = 'upper_lower';
          splitOverrideNote = `Note: The athlete selected Bro Split which doesn't suit 1RM progression. I've switched to Upper/Lower for better frequency on the target lift. Mention this briefly.`;
        } else if (chosenSplit === 'full_body' && d >= 4) {
          effectiveSplit = 'upper_lower';
          splitOverrideNote = `Note: Switched from Full Body to Upper/Lower at ${d} days — better recovery between sessions at this frequency.`;
        }
      }
    }

    const splitId = hasStructure ? (splitIdIn ?? body.split ?? 'ppl') : effectiveSplit;
    const splitName = hasStructure ? (splitNameIn ?? splitId) : effectiveSplit;
    const sessionBreakdown = hasStructure ? buildSessionBreakdown(sessionStructure as SessionDay[]) : '';

    const weeklyStructureBlock = hasStructure
      ? `
WEEKLY STRUCTURE (do not deviate from this):
${sessionBreakdown}

Split (philosophy / exercise selection only — not a template for how many days to generate): ${splitName}
Rationale: ${splitRationale || '—'}

For each workout day, generate exercises that match the stated primary muscles and session intensity.

sessionIntensity rules:
- 'heavy': lower rep range (strength end), higher load, longer rest
- 'volume': higher rep range, moderate load, standard rest
- 'moderate': middle of the rep range, standard load and rest

Do NOT add additional workout days or combine rest days with training.
`
      : '';

    const splitForNormalized = hasStructure ? splitId : effectiveSplit;

    // Build goal-specific context for the prompt
    let goalContext = '';
    let weightAnchor = '';
    let exerciseSelectionSection = '';

    if (goal === 'strength' && current1RM != null && String(current1RM) !== '' && targetLift) {
      const current1RMNum = parseFloat(String(current1RM ?? '0'));
      const target1RMNum = parseFloat(String(target1RM ?? current1RM ?? '0'));
      const week1Weight = calculateStartingWeight(current1RMNum, 0.75);
      const liftName = targetLift.replace(/_/g, ' ');
      const liftKey = targetLift.replace(/_/g, ' ').toLowerCase();
      const accessories = LIFT_ACCESSORIES[liftKey] ?? LIFT_ACCESSORIES['bench press'];

      goalContext = `Primary lift: ${liftName}. Current 1RM: ${current1RMNum} lbs. Target 1RM: ${target1RMNum} lbs over ${totalWeeks} weeks.`;
      weightAnchor = `
CRITICAL WEIGHT RULES for strength goal:
- ${liftName} Week 1 working sets MUST start at ${week1Weight} lbs (75% of ${current1RMNum} lb 1RM).
- All other compound lifts: estimate based on the athlete's ${liftName} strength (they are ${experience} level).
- Week 1 is a baseline week. Do NOT start at their max. 75% 1RM is the starting point.
- Use straight sets (same weight across all sets) for the primary lift.
- Secondary lifts should be calibrated proportionally to their strength level.

STRENGTH FREQUENCY RULES:
- The primary lift (${liftName}) should appear on BOTH push/upper days at different intensities:
  - Heavy day: 5 sets × 3-5 reps @ 75-85% 1RM (Week 1 = 75%)
  - Volume day: 4 sets × 4-6 reps @ 70-75% 1RM (Week 1 = 70%)
- This gives the athlete 2 exposures per week to the target movement
- If only 3 days/week (PPL): Day 1 = heavy push, Day 2 = pull, Day 3 = legs
  The following week would rotate: Day 1 = volume push, etc.
- If 4+ days/week: dedicate separate heavy and volume push days
- If sessionStructure defines fewer workout days than above, follow it exactly (e.g. 2-day upper/lower = one upper day + one lower day only). Do not expand to more days because of split name or these frequency examples.

1RM PROGRESSION PATH over ${totalWeeks} weeks:
- Week 1: ${calculateStartingWeight(current1RMNum, 0.75)} lbs (75% of ${current1RMNum} 1RM) — baseline
- Week ${Math.round(totalWeeks * 0.25)}: ~${calculateStartingWeight(current1RMNum, 0.8)} lbs (80%) — accumulation
- Week ${Math.round(totalWeeks * 0.5)}: ~${calculateStartingWeight(current1RMNum, 0.85)} lbs (85%) — intensification
- Week ${Math.round(totalWeeks * 0.75)}: ~${calculateStartingWeight(current1RMNum, 0.9)} lbs (90%) — peak
- Week ${totalWeeks}: ~${calculateStartingWeight(target1RMNum, 1.0)} lbs — target 1RM attempt
Build Week 1 with this arc in mind. The weights should feel manageable now so there is room to add load each week.`;

      exerciseSelectionSection = `STRENGTH SPECIALISATION RULES for ${liftName.toUpperCase()} goal:
Every exercise must have a clear reason tied to the target lift.
Use these categories as your exercise pool:

Direct variations (choose 1-2 per push session):
${accessories.direct.join(', ')}

Lockout/assistance work (choose 1-2):
${accessories.tricepLockout.length > 0 ? accessories.tricepLockout.join(', ') : 'N/A for this lift'}

Shoulder/joint stability — MANDATORY at least 1 per week:
${accessories.stability.join(', ')}

Upper back / antagonist work — MANDATORY at least 1 per session:
${accessories.upperBack.join(', ')}

${
        hasStructure
          ? `Using sessionStructure + WEEKLY STRUCTURE (focus, primary muscles, and liftDay when present) for ${liftName} — output only the workout days in sessionStructure; do not add Push/Pull/Legs template days beyond that count:
- Push / upper sessions that train chest, shoulders, or triceps: primary lift + 1-2 direct variations + lockout work when applicable
- Pull sessions: upper back work + vertical pull + biceps
- Leg sessions: full lower body — do NOT skip legs when a leg day appears in sessionStructure`
          : `For a PPL split targeting ${liftName}:
- Push days: primary lift + 1-2 direct variations + lockout work
- Pull days: upper back work + vertical pull + biceps
- Leg days: full lower body — do NOT skip legs even on a bench specialisation program`
      }

${MOVEMENT_PATTERN_BLOCK}`;
    } else if (goal === 'power_hypertrophy') {
      goalContext = `Goal: power_hypertrophy — build compound strength AND muscle size simultaneously.`;

      // Pre-calculate Week 1 target weights from currentLifts (75% 1RM, rounded to 2.5 lbs)
      const liftTargets: { name: string; provided: boolean; week1Weight: number }[] = [];
      const clMap: Record<string, string> = {
        benchPress: 'Barbell Bench Press',
        backSquat: 'Back Squat',
        deadlift: 'Conventional Deadlift',
        overheadPress: 'Overhead Press',
      };
      for (const [key, name] of Object.entries(clMap)) {
        const rm = currentLifts ? (currentLifts as Record<string, number | null>)[key] : null;
        if (rm != null && Number.isFinite(rm) && rm > 0) {
          liftTargets.push({ name, provided: true, week1Weight: Math.round(rm * 0.75 / 5) * 5 });
        } else {
          liftTargets.push({ name, provided: false, week1Weight: 0 });
        }
      }
      const currentLiftsBlock = liftTargets.map((lt) =>
        lt.provided
          ? `- ${lt.name}: 1RM provided → Phase 1 Week 1 targetWeight = ${lt.week1Weight}`
          : `- ${lt.name}: not provided → targetWeight = 0`
      ).join('\n');

      weightAnchor = `
POWER-HYPERTROPHY REQUIRED OUTPUT FIELDS:
Every day object with workout type MUST include:
  "sessionPhase": "power_hypertrophy"
Every exercise object MUST include a "phase" field:
  Phase 1 exercises (heavy compounds, 3-6 reps): "phase": "strength"
  Phase 2 exercises (accessories, 8-12 reps):    "phase": "hypertrophy"
Every exercise object MUST include "setStructure":
  Phase 1: "setStructure": "pyramid"
  Phase 2: "setStructure": "straight"

EXERCISE COUNT BY SESSION LENGTH (Intermediate):
  30-45 mins: 4 exercises total (1-2 Phase 1 + 2-3 Phase 2)
  45-60 mins: 5 exercises total (1-2 Phase 1 + 3-4 Phase 2)
  60-90 mins: 6 exercises total (2 Phase 1 + 4 Phase 2)
  90+ mins:   7-8 exercises total (2 Phase 1 + 5-6 Phase 2)
User selected session length: ${sessionLength}
Generate the appropriate exercise count for this session length.
Do NOT generate fewer exercises than the minimum for the selected session length.

PHASE 1 RULES (tag these first in each session):
- Count: exactly 1-2 exercises per session (see EXERCISE COUNT above)
- Exercises: barbell/compound only (Bench Press, Squat, Deadlift, Row, OHP, Pull-up)
- Reps: 3-6
- Sets: 4-5
- targetRpe: 8-9 (NOT 7 — this is heavy work)
- restSeconds: 240 (4 minutes)
- setStructure: "pyramid"
- phase: "strength"
- coachingNote: selection reasoning per system message (why this heavy compound for Phase 1 — tie to their 1RM data where applicable)

PHASE 2 RULES (list after Phase 1 in each session):
- Count: 3-5 exercises per session
- Exercises: machines, cables, dumbbells (accessory movements)
- Reps: 8-12 (isolation), 6-10 (secondary compounds)
- Sets: 3-4
- targetRpe: 7-8
- restSeconds: 90-120
- setStructure: "straight"
- phase: "hypertrophy"
- coachingNote: selection reasoning per system message (why this accessory slot builds the hypertrophy phase for this session)

FAILURE MODES TO AVOID:
- Do NOT output exercises without a "phase" field
- Do NOT output day objects without "sessionPhase"
- Do NOT set targetRpe: 7 on Phase 1 — minimum is 8
- Do NOT mix phase tags (a 3-6 rep compound must be "strength", an 8-12 rep accessory must be "hypertrophy")
- Do NOT output more than 2 Phase 1 exercises per session

CURRENT 1RM DATA (use for Phase 1 Week 1 targetWeight):
${currentLiftsBlock}
INSTRUCTION: Use these exact targetWeight values for the corresponding Phase 1 exercises in Week 1. Do not use 0 for lifts where a value is provided. Round to nearest 5 lbs. For Phase 2 exercises: targetWeight = 0 — the athlete self-selects loads in the app.

SESSION COUNT CONTRACT: workoutDayCount must equal exactly sessionStructure.filter(d => d.type === 'workout').length. This is non-negotiable.

Each ExerciseObject must include: "phase": "strength" | "hypertrophy"
Each DayObject with type "workout" must include: "sessionPhase": "power_hypertrophy"`;

    } else if (goal === 'hypertrophy' && priorityMuscles && priorityMuscles.length > 0) {
      goalContext = `Priority muscle groups: ${priorityMuscles.join(', ')}. Give these groups extra volume (1 additional exercise).`;
      weightAnchor = `Rep and RPE targets follow PROGRAMMING PARAMETERS and exercise-type rules below. Week 1 prescribed load policy is in WEEK 1 STARTING WEIGHTS — targetWeight must be 0 for every exercise.`;
    } else if (goal === 'hypertrophy') {
      weightAnchor = `Week 1 load policy: WEEK 1 STARTING WEIGHTS — targetWeight 0 for every exercise; coachingNote per system message (selection reasoning).`;
    } else if (goal === 'fat_loss') {
      goalContext = body.targetWeightLbs
        ? `Target weight: ${body.targetWeightLbs} lbs. Plan duration: ${totalWeeks} weeks.`
        : '';
      weightAnchor = `Week 1 load policy: WEEK 1 STARTING WEIGHTS — targetWeight 0; rep schemes, rest, and density as programmed below.`;
    } else {
      weightAnchor = `Week 1 load policy: WEEK 1 STARTING WEIGHTS — targetWeight 0 for all exercises.`;
    }

    const isNonStrengthGoal =
      goal === 'hypertrophy' ||
      goal === 'recomp' ||
      goal === 'fat_loss' ||
      goal === 'general';

    if (isNonStrengthGoal) {
      weightAnchor += `

WEEK 1 STARTING WEIGHTS — NON-STRENGTH GOALS:

Do NOT prescribe specific weights for Week 1 exercises.
Set targetWeight to 0 for ALL exercises in Week 1.

Every exercise coachingNote in Week 1 must follow the coachingNote specification in the system message: selection reasoning (why this exercise, in this slot, for this user). Do not use generic load-calibration copy that restates reps or RPE targets — the UI already shows them.

Week 2+ onwards: program weights normally based on what the user logged in the previous week.

EXCEPTION — STRENGTH GOAL: unchanged — use current1RM × 0.75 and prescribed targetWeights as in the strength section above.`;
    }

    const beginnerRpeBlock =
      experience === 'beginner'
        ? `
BEGINNER RPE (movement quality):
Target RPE is ${params.targetRpe}. For beginners, this ceiling exists to protect movement quality under fatigue — do not write coachingNotes that push for failure or max effort.
`
        : '';

    const hypertrophyAdvancedBlock =
      goal === 'hypertrophy' && experience === 'advanced'
        ? `
Rep ranges vary by exercise type within this session:
- Primary and secondary compounds: ${HYPERTROPHY_REP_GUIDANCE.advanced.compounds} reps
- Isolation exercises: ${HYPERTROPHY_REP_GUIDANCE.advanced.isolations} reps
Do NOT apply a single rep range to every exercise.

ADVANCED HYPERTROPHY SETS:
Total sets per exercise: ${params.sets}. For advanced users, the final set of isolation exercises may include a technique note (e.g. rest-pause or slow eccentric) but only on isolation exercises — never on compounds.
`
        : '';

    const advancedLongSessionNote =
      experience === 'advanced' && sessionLength === '90+'
        ? `
For advanced lifters with 90+ minute sessions: prioritise hitting the weekly volume landmarks for each muscle group (${volumeTargets.weeklySetMin}–${volumeTargets.weeklySetMax} sets/muscle/week).
Do not sacrifice volume for brevity at this experience level.`
        : '';

    const advancedVolumePriorityBlock =
      experience === 'advanced'
        ? `
ADVANCED VOLUME PRIORITY:
Weekly sets per muscle group must reach the development range (${volumeTargets.prioritySetMin}–${volumeTargets.prioritySetMax} sets for priority muscles).
Do not leave muscles at 5 sets/week for an advanced lifter — this is maintenance volume, not growth stimulus.
Distribute exercises to ensure all target muscle groups reach minimum development volume.`
        : '';

    const splitDescriptor = hasStructure ? splitName : effectiveSplit;

    if (!exerciseSelectionSection) {
      exerciseSelectionSection = `EXERCISE SELECTION RULES:
- Max ${maxExercises} exercises per session (${sessionLength} min band — see SESSION LENGTH CONSTRAINTS)
- For ${hasStructure ? `the sessionStructure-defined week (follow WEEKLY STRUCTURE day-by-day; never use split name to add or remove workout days)` : `the ${splitDescriptor} split`}, ensure logical muscle group distribution across days
- Use exercises appropriate for ${equipment}
- Week 1: focus on foundational movements. Save advanced variations for later weeks.
- Vary exercise selection — do not repeat the same exercises on back-to-back days for the same muscle group

${MOVEMENT_PATTERN_BLOCK}`;
    }

    const athleteSplitLine = hasStructure
      ? `- Split: ${splitName} (${splitId})`
      : `- Split: ${effectiveSplit}${splitOverrideNote ? ` (overridden from ${body.split ?? 'unknown'})` : ''}`;

    const priorityMusclesProfileLine =
      Array.isArray(priorityMuscles) && priorityMuscles.length > 0
        ? `\n- Priority muscles (from onboarding): ${priorityMuscles.join(', ')}`
        : '';

    const subMuscleBlock =
      subMusclePreferences && Object.keys(subMusclePreferences).length > 0
        ? (() => {
            const focusDescriptions: Record<string, string> = {
              short_head: 'short head bicep — barbell curls, wide-grip curls, preacher curls',
              long_head: 'long head bicep — incline dumbbell curls, narrow-grip curls',
              brachialis: 'brachialis — hammer curls, cross-body curls, reverse curls',
              long_head_tricep: 'long head tricep — overhead extensions, skull crushers',
              lateral_head_tricep:
                'lateral head tricep — pushdowns, close-grip bench, dips',
              upper: 'upper chest — incline press and incline fly variations',
              lower: 'lower chest — decline press, dips, low-to-high cable fly',
              front: 'front delt — overhead press variations, front raises',
              lateral: 'lateral delt — lateral raises, upright rows, cable laterals',
              rear: 'rear delt — face pulls, reverse fly, bent-over lateral raises',
              lats: 'lats — vertical pulls (pull-ups, lat pulldowns, straight-arm pulldowns)',
              upper_back:
                'upper back — horizontal pulls (rows, face pulls, chest-supported rows)',
              outer_sweep:
                'vastus lateralis — hack squats, wide-stance leg press, leg extensions',
              vmo:
                'VMO/teardrop — close-stance squats, sissy squats, terminal knee extensions, leg press with feet low and close',
            };
            const resolveDesc = (muscle: string, focus: string): string => {
              if (muscle === 'Triceps' && focus === 'long_head') {
                return focusDescriptions.long_head_tricep;
              }
              if (muscle === 'Triceps' && focus === 'lateral_head') {
                return focusDescriptions.lateral_head_tricep;
              }
              return focusDescriptions[focus] ?? focus;
            };
            const specific = Object.entries(subMusclePreferences)
              .filter(([, v]) => v && v !== 'balanced')
              .map(([muscle, focus]) => {
                const desc = resolveDesc(muscle, focus);
                return `- ${muscle}: bias toward ${desc}. At least 60% of this muscle's exercises must target this sub-muscle. The remaining 40% may be balanced.`;
              });

            if (specific.length === 0) {
              return '\nSUB-MUSCLE FOCUS: All priority muscles set to balanced — distribute exercises evenly across sub-muscles.';
            }
            return `\nSUB-MUSCLE FOCUS (user-selected, treat as authoritative):\n${specific.join('\n')}\nFor muscles not listed above, program balanced sub-muscle distribution.`;
          })()
        : '\nSUB-MUSCLE FOCUS: No preferences set — program balanced development for all priority muscles.';

    const liftFrequencyLine =
      goal === 'strength' && liftFrequency != null && (liftFrequency === 2 || liftFrequency === 3)
        ? `\n- Target lift frequency: ${liftFrequency}x per week`
        : '';

    const structureTailInstructions = hasStructure
      ? `Follow the WEEKLY STRUCTURE exactly: ${(sessionStructure as SessionDay[]).length} calendar day entries with the day numbers shown. Each workout day must match its focus, primary muscles, and session intensity.`
      : `Generate exactly ${actualDaysPerWeek} workout days plus rest days to fill all 7 days.`;

    const splitHistoryOtherLine =
      currentSplit === 'Other' && currentSplitOther
        ? `
TRAINING HISTORY: The user describes their current training structure as: "${currentSplitOther}".
`
        : '';

    const structuralNoveltyBlock =
      goal === 'hypertrophy' &&
      splitDuration === '6+ months' &&
      currentSplit != null &&
      currentSplit !== '' &&
      currentSplit !== 'Other'
        ? `
TRAINING HISTORY (hypertrophy):
The user has been following ${currentSplit} for 6+ months. Jordan's sessionStructure already accounts for structural novelty. Reinforce this in the jordanWelcome message — mention that a structural change is intentional and will drive new adaptation.
`
        : '';

    const current1RMLabel =
      current1RM != null && String(current1RM).trim() !== ''
        ? `${String(current1RM).trim()} lbs`
        : null;

    const strengthExperienceBlock =
      goal === 'strength' &&
      trainingBackground != null &&
      (trainingBackground === 'Already doing a strength-specific program' ||
        trainingBackground === 'Running a powerlifting program')
        ? `
TRAINING BACKGROUND (strength):
This user is already strength-training. Week 1 baseline weights should reflect their current 1RM${current1RMLabel ? ` (${current1RMLabel})` : ''} × 0.75 as normal, but the jordanWelcome should acknowledge their existing base and frame this plan as a focused specialisation block (still within the 4-sentence jordanWelcome structure — fold this into Sentence 2).
`
        : '';

    const liftNameForWelcome =
      targetLift != null && String(targetLift).trim() !== ''
        ? String(targetLift).replace(/_/g, ' ')
        : null;
    const target1RMNumWelcome = parseFloat(String(target1RM ?? current1RM ?? '0'));
    const priorityMusclesList =
      Array.isArray(priorityMuscles) && priorityMuscles.length > 0
        ? priorityMuscles.join(', ')
        : '';
    const targetWeightLbsWelcome =
      body.targetWeightLbs != null && String(body.targetWeightLbs).trim() !== ''
        ? String(body.targetWeightLbs).trim()
        : null;

    let jordanWelcomeSentence2Instruction = '';
    if (goal === 'power_hypertrophy') {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (power_hypertrophy). Use this line (keep meaning; fix grammar only if needed):\n` +
        `"You want strength and size — every session starts heavy on the big compounds, then we shift into accessory work to build muscle on top."`;
    } else if (goal === 'strength' && liftNameForWelcome && target1RMNumWelcome > 0) {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (strength). Use this line (keep meaning; fix grammar only if needed):\n` +
        `"You came in with a ${target1RMNumWelcome}lb ${liftNameForWelcome} target — I've built the entire program around getting you there."`;
    } else if (goal === 'strength') {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (strength): Use their target 1RM and lift from the athlete profile. Pattern:\n` +
        `"You came in with a [N]lb [lift name] target — I've built the entire program around getting you there."`;
    } else if (goal === 'hypertrophy' && priorityMusclesList !== '') {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (hypertrophy + priority muscles). Use this line:\n` +
        `"You want to bring up your ${priorityMusclesList} — I've structured your week so those muscles get trained fresh and with full focus, not as an afterthought."`;
    } else if (goal === 'hypertrophy') {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (hypertrophy, no priority muscles). Use this line:\n` +
        `"Your goal is building size — I've programmed ${actualDaysPerWeek} days with the volume and frequency that actually drives hypertrophy."`;
    } else if (goal === 'fat_loss' && targetWeightLbsWelcome != null) {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (fat loss). Use this line:\n` +
        `"You want to drop to ${targetWeightLbsWelcome}lbs — I've set your training and macros to get you there at a rate that preserves your muscle."`;
    } else if (goal === 'fat_loss') {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (fat loss): Use their target weight in lbs from the profile. Pattern:\n` +
        `"You want to drop to [N]lbs — I've set your training and macros to get you there at a rate that preserves your muscle."`;
    } else if (goal === 'recomp') {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (recomp). Use this line:\n` +
        `"Body recomp is the hardest goal to program — you're asking your body to lose fat and build muscle at the same time. I've built this specifically to make that happen."`;
    } else {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (general / other). Use this line:\n` +
        `"You want to build a consistent fitness base — I've kept the program structured but manageable so you can build the habit first."`;
    }

    const jordanWelcomeSentence3Block = isNonStrengthGoal
      ? `Sentence 3 — Week 1 baseline (non-strength — user-selected loads):
  "Week 1 is your calibration week — pick loads that match your effort targets and record them after each set; that data is how I tune what comes next."`
      : `Sentence 3 — Explain Week 1 baseline (prescribed loads):
  "Week 1 is your calibration week — the weights are set conservatively so you can focus on form and give me honest effort ratings after each set."`;

    const jordanWelcomeNonStrengthSentence2Addon = isNonStrengthGoal
      ? `
Non-strength — Sentence 2 (required addition): After or woven into the goal acknowledgement above, you MUST convey that Week 1 working weights are user-selected in the app (targetWeight 0 — Jordan does not prescribe lbs for Week 1).
Example (adapt RPE band to match programming template, default target RPE ${params.targetRpe}): "Week 1 you set your own starting weights — aim for something that feels like RPE 7-8 on each exercise. Honest effort ratings after your sets are how I tune what comes next."
This replaces any implication that Jordan has already set conservative working loads for you.`
      : '';

    const jordanWelcomeRpeRuleLine = isNonStrengthGoal
      ? `- In Sentence 2 only, you may reference target RPE as a range (e.g. "RPE 7-8") when explaining self-selected loads. In Sentences 3–4 prefer "effort ratings" except the fixed Sentence 4 template may say "RPE data".`
      : `- Never mention RPE as a number in the welcome (e.g. do not say "RPE 7") — the user just learned about RPE in onboarding; prefer "effort ratings" where it fits (Sentences 3–4 may use the phrase "RPE data" as in the template above, without numeric RPE)`;

    const jordanWelcomeFieldSpec = `JORDAN WELCOME FIELD (top-level JSON key "jordanWelcome"):
jordanWelcome is the user's FIRST introduction to Jordan, their coach. It must follow this exact structure:

Sentence 1 — Self introduction:
  Always start with "I'm Jordan, your coach for the next ${totalWeeks} weeks."
  Never skip this. This is the user's first time meeting Jordan.

Sentence 2 — Goal acknowledgement (specific to their inputs):
${jordanWelcomeSentence2Instruction}
${jordanWelcomeNonStrengthSentence2Addon}
  If other TRAINING HISTORY instructions in this prompt ask you to mention structural change or an existing strength base, fold that into Sentence 2 without adding sentences or breaking the templates above.

${jordanWelcomeSentence3Block}

Sentence 4 — Forward looking (what Jordan will do with data):
  "I'll use your RPE data from this week to tune what comes next specifically to you — the more honest you are, the better your plan gets."

CONTEXT FOR jordanWelcome (silent — apply when writing the welcome; do not mention in jordanWelcome text):
Session length: ${sessionLength} minutes — program accordingly and do not reference this constraint explicitly in the jordanWelcome message.

RULES:
- Maximum 4 sentences total
- Always starts with "I'm Jordan"
- Always references at least one specific number or detail from the user's inputs (use the athlete profile and goal details in this prompt)
- Always explains Week 1 as calibration (Sentence 3)
- Never uses: "Great!", "Excited to", "Let's crush", "Let's go", "Amazing"
- Tone: direct, knowledgeable, like a real coach talking to a new client for the first time — not a chatbot greeting
${jordanWelcomeRpeRuleLine}
- Do not end with a separate "call to action" sentence beyond Sentence 4; Sentence 4 is the close
- CRITICAL: Never use the word "AI" anywhere in jordanWelcome or any coaching copy. Jordan is a coach. Write in first person as Jordan — use "I" or "your coach" only. Never "AI coach", "AI system", "artificial intelligence", or any variation.
- Good opening (pattern): "I'm Jordan, your coach for the next ${totalWeeks} weeks..."
- Bad opening (never): "I'm Jordan, your AI coach for the next ${totalWeeks} weeks..."
- Apply the same CRITICAL rule (no "AI"; first person as Jordan; "I" or "your coach" only) to every sessionFocus line, every exercise coachingNote, and any motivationalNote field in this response.`;

    const prompt = `${absoluteRuleBlock}
${sessionStructureFollowBlock}

Create Week 1 of a ${totalWeeks}-week ${goal} training plan.

ATHLETE PROFILE:
- Experience: ${experience}
${athleteSplitLine}
- Equipment: ${equipment}
- Session length: ${sessionLength} (minutes per session, from onboarding)
- Total plan duration: ${totalWeeks} weeks
- Days per week: ${actualDaysPerWeek}
- Exercises to avoid: ${exclusions}${priorityMusclesProfileLine}${subMuscleBlock}${liftFrequencyLine}
${goalContext ? `- Goal details: ${goalContext}` : ''}
${weeklyStructureBlock}
${splitHistoryOtherLine}${structuralNoveltyBlock}${strengthExperienceBlock}
PROGRAMMING PARAMETERS for ${goal.toUpperCase()} (${experience}):
- Rep range (default template): ${params.reps}
- Sets per exercise: ${params.sets}
- Rest between sets: ${params.restSeconds} seconds
- Target RPE: ${params.targetRpe}

SESSION LENGTH CONSTRAINTS:
The user has ${sessionLength} minutes per session (onboarding band).
Experience: ${experience}.
Maximum exercises per workout day: ${maxExercises} (experience-adjusted cap for this session length).
${sessionRules.note}
${advancedLongSessionNote}

Do NOT exceed ${maxExercises} exercises per day regardless of split type or goal. If a day would normally have more exercises, prioritise compound movements and drop the lowest-priority isolations.

WARMUP / WORKING WEIGHT (app behavior):
Do NOT include warmup sets in the sets count or targetWeight. targetWeight is the WORKING weight only — the app generates warmup progressions automatically when a working weight is known.
Example: 5 sets × 3-5 reps @ 265 lbs means 5 working sets at 265 lbs. The app will show warmup sets at 40/60/80% automatically before those working sets.
${isNonStrengthGoal ? `Non-strength Week 1: targetWeight is 0 — the athlete enters their chosen load in the app; warmups appear once they have a working weight for that session.` : ''}
Avoid coachingNote lines that tell the athlete to "start light and build up" — the UI handles warmup display.

${beginnerRpeBlock}${hypertrophyAdvancedBlock}
${weightAnchor}

${exerciseSelectionSection}
${!hasStructure && splitOverrideNote ? `\nSPLIT OVERRIDE:\n${splitOverrideNote}\n` : ''}

VOLUME TARGETS (derived from ${actualDaysPerWeek} training days):
Weekly sets per muscle: ${volumeTargets.weeklySetMin}–${volumeTargets.weeklySetMax}
Priority muscles: ${volumeTargets.prioritySetMin}–${volumeTargets.prioritySetMax} sets/week

⚠️ Do NOT attempt to hit 6-day volume targets on a ${actualDaysPerWeek}-day program. Physical constraint: max ~6–10 quality sets per muscle per session.

For ${actualDaysPerWeek} days: distribute volume realistically across available sessions. Isolation exercises for smaller muscles (biceps, triceps) will naturally be lower — this is correct, not a flaw.

- Experience level: ${experience}
- Do NOT exceed the weekly max above — overdosing a muscle group causes excessive fatigue
- Do NOT go below the weekly min for major muscle groups — underdosing produces no adaptation
- Count total sets across ALL workout days when distributing volume
${advancedVolumePriorityBlock}
${enhancedRecovery ? `
ENHANCED RECOVERY — USER HAS INDICATED EXCEPTIONAL RECOVERY:
- Apply volume at the upper end of range + 30-40% above standard advanced ceiling
- MRV ceiling: 28-36 sets per muscle group per week (standard advanced: 16-22 sets)
- Deload frequency: every 5th week instead of every 4th week
- Progression: apply 0.9× multiplier to training age cap — allows slightly faster progression
- coachingNotes may reference recovery capacity where relevant: example: "Given your recovery rate, I've pushed your volume higher than I normally would here — keep an eye on joint fatigue."
- IMPORTANT: Never reference medical protocols, TRT, or any pharmacological context. Frame purely as a training characteristic.
` : ''}
${concurrentSport ? `
CONCURRENT SPORT TRAINING:
User also trains ${concurrentSport.type.join(', ')} ${concurrentSport.daysPerWeek} days per week alongside lifting.
Scheduling rules:
- Do NOT schedule heavy leg days adjacent to high-intensity sport training days (martial arts, running, team sports)
- Reduce leg volume on weeks with 3+ sport sessions per week
- Swimming and cycling have lower leg impact — standard leg scheduling applies unless daysPerWeek >= 4
- Jordan notes in sessionFocus or coachingNotes may reference sport training where relevant to recovery context
- TDEE note: Calories already adjusted for sport load — no additional calorie modification needed in prompt.
` : ''}
${biologicalSex === 'female' ? `
SEX-AWARE PROGRAMMING — FEMALE:
Volume ceiling: 10-15% above the male equivalent for this experience level. Do not reference biological sex in any coachingNote or Jordan copy — adjustments are invisible to the user.
` : ''}
${structureTailInstructions}
Training days: ${trainingDays.length > 0 ? trainingDays.join(', ') : 'not specified'}
Each workout day must include sessionFocus (one sentence, max 12 words — see system prompt). Rest days must have sessionFocus: "".

Week 1 phase MUST be "baseline". Weeks 2 onward (when generated later) follow accumulation → intensification → deload periodisation. For this response, the week object's phase field MUST be exactly "baseline".

${jordanWelcomeFieldSpec}

Respond with ONLY this JSON, no other text:
{
  "title": "descriptive plan name",
  "jordanWelcome": "Exactly 4 sentences per JORDAN WELCOME FIELD spec above.",
  "totalWeeks": ${totalWeeks},
  "daysPerWeek": ${actualDaysPerWeek},
  "scheduledDays": ${JSON.stringify(trainingDays)},
  "week": {
    "weekNumber": 1,
    "phase": "baseline",
    "days": [
      {
        "dayNumber": 1,
        "type": "workout",
        "title": "workout name e.g. Push A",${goal === 'power_hypertrophy' ? '\n        "sessionPhase": "power_hypertrophy",' : ''}
        "sessionFocus": "Baseline push — feel the weights out.",
        "muscleGroups": ["Chest", "Shoulders", "Triceps"],
        "exercises": [
          {
            "id": "e1",
            "name": "Exercise Name",
            "muscleGroup": "Chest",
            "sets": ${params.sets},
            "reps": "${params.reps}",
            "targetWeight": ${isNonStrengthGoal ? 0 : 135},
            "restSeconds": ${params.restSeconds},
            "targetRpe": ${params.targetRpe},
            "coachingNote": "${isNonStrengthGoal ? `Your upper chest priority anchors this session — incline angle shifts the stimulus to the clavicular head where you need growth.` : `Week 1 calibration at 75% of your 1RM — log your honest RPE so I can dial in Week 2 specifically to you.`}"${goal === 'power_hypertrophy' ? ',\n            "phase": "strength",\n            "setStructure": "pyramid"' : ''}
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
  }
}
Include all 7 days. Workout days have exercises. Rest days have empty exercises array and type "rest".${goal === 'power_hypertrophy' ? ' Each exercise MUST include "phase": "strength" or "hypertrophy" AND "setStructure": "pyramid" or "straight". Each workout day MUST include "sessionPhase": "power_hypertrophy". Missing any of these fields is a critical error.' : ''}`;

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
        max_tokens: 16000,
        system: `You are Jordan, an expert personal coach building Week 1 of a training plan. 

Your job: create a properly structured, goal-appropriate training week.${
  isNonStrengthGoal
    ? ' For non-strength goals (hypertrophy, recomp, fat_loss, general), Week 1 targetWeight MUST be 0 on every exercise — the athlete self-selects loads in the app; follow WEEK 1 STARTING WEIGHTS in the user message.'
    : ' Use realistic prescribed starting weights (especially strength: 1RM-based).'
}

For coachingNote fields:
coachingNote: A 1–2 sentence explanation of WHY this exercise is in this plan for this specific user. This is selection reasoning — not form cues, not generic motivation. Answer the implicit question: "Why this exercise, in this position, for my goal?"

Rules for coachingNote:
- Reference the user's specific goal, split, or priority muscles where relevant. Example: "Your short head bicep focus means width comes from the peak — barbell curls at this rep range maximize that stimulus."
- For accessory exercises, explain the transfer to the primary goal. Example: "Face pulls keep your posterior chain balanced against all the pressing volume — non-negotiable for bench longevity."
- For the primary compound of the day, explain why it anchors this session. Example: "Bench press is the cornerstone of this program — everything else this week is built to support this lift."
- For antagonist/balance work, explain the structural reason. Example: "Barbell rows balance the horizontal pressing load — strong lats create a stable bench platform."
- Week 1 calibration notes should acknowledge it is calibration without being generic. Example: "Week 1 is your baseline — I'm learning how you respond in this slot before we layer intensity."
- Never restate reps/RPE load instructions in coachingNote — the UI already displays them.
- Never write generic motivation ("give it your all", "push hard").
- Never write form cues — those are handled elsewhere.
- Maximum 2 sentences. Be specific. Be direct. Sound like a coach, not an app.
- Never use the word "AI". Never say "I've calculated" or "the algorithm".
- Always use first person as Jordan: "I've built", "your goal", "this session".
- CRITICAL: Never use the word "AI" anywhere in coachingNote or any coaching copy. Jordan is a coach. Write in first person as Jordan — use "I" or "your coach" only. Never "AI coach", "AI system", "artificial intelligence", or any variation.

${
  isNonStrengthGoal
    ? `Operational — Week 1 non-strength JSON: targetWeight MUST be 0 on every exercise — never prescribe pounds in JSON.`
    : `Operational — Week 1 strength JSON: follow prescribed targetWeights in the user message; coachingNote is still selection reasoning (why this lift), not form cues.`
}

For each workout day, include sessionFocus: one sentence (max 12 words) that tells the athlete exactly what today is about.
This appears on the athlete's Dashboard before they start the workout. Week 1 has no prior performance data — anchor on goals and session intent${
  isNonStrengthGoal ? ' (reference sets, reps, or RPE targets when weights are self-selected)' : ' (and starting loads where prescribed)'
}.

sessionFocus rules (Week 1):
- Week 1 sessionFocus lines should reference calibration (e.g. "Baseline push — feel the weights out" or "Calibration lower — log your effort honestly").
- Reference at least one specific number (sets, reps, RPE, or prescribed weight when applicable) when it fits within 12 words
- Reference the most important exercise of the day when possible
- Never use filler like 'Great session ahead' or 'You've got this'
- CRITICAL: Never use the word "AI" in sessionFocus. Jordan is a coach. First person as Jordan — "I" or "your coach" only; never "AI coach", "AI system", "artificial intelligence", or any variation.

Rest days: sessionFocus must be an empty string "".

motivationalNote (if present in any coaching copy you write):
- CRITICAL: Same rule as above — never "AI" or AI-framing; Jordan is a human coach voice; "I" or "your coach" only.

jordanWelcome (top-level JSON):
Follow the JORDAN WELCOME FIELD specification in the user message exactly — 4 sentences, fixed intro, goal-specific Sentence 2 as given there, then calibration + how you'll use their data.${
  isNonStrengthGoal
    ? ' Non-strength: Sentence 2 may include numeric RPE bands per that spec.'
    : ' In the welcome text, say "effort ratings" not numeric RPE except where the user-message spec allows.'
} Never use chatbot openers or banned hype phrases from that spec.
- CRITICAL for jordanWelcome: Never use the word "AI" in the welcome or any coaching copy. Jordan is a coach. First person as Jordan — "I" or "your coach" only. Good: "I'm Jordan, your coach for the next ${totalWeeks} weeks..." Bad: "I'm Jordan, your AI coach for the next ${totalWeeks} weeks..."

${
  isNonStrengthGoal
    ? 'For non-strength Week 1, targetWeight 0 everywhere — trust the user message.'
    : 'Weight selection is CRITICAL. Under-programming (weights too light) destroys trust. Follow the weight rules in the prompt exactly.'
}`,
        messages: [{ role: 'user', content: prompt }],
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
      console.error('Claude API error:', JSON.stringify(data));
      throw new Error(`Claude API error: ${data.error?.message ?? 'unknown'}`);
    }

    const text = data.content?.[0]?.text ?? '';
    console.log('[generate-plan] Claude response length:', text.length);

    const trimmed = text.trimEnd();
    if (!trimmed.endsWith('}') && !trimmed.endsWith('}```')) {
      console.error('[generate-plan] WARNING: Response may be truncated. Last 50 chars:', trimmed.slice(-50));
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response:', text);
      throw new Error('No JSON found in Claude response');
    }

    let plan;
    try {
      plan = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Parse error. Raw text:', text);
      throw new Error('JSON parse failed: ' + String(e));
    }

    const week1Data = plan.week ?? plan.weeks?.[0] ?? { weekNumber: 1, days: [] };
    // Week 1 is always baseline (legacy plans used accumulation)
    week1Data.phase = 'baseline';

    const scheduledFromClaude = Array.isArray((plan as { scheduledDays?: unknown }).scheduledDays)
      ? (plan as { scheduledDays: unknown[] }).scheduledDays.filter(
        (d): d is string => typeof d === 'string' && d.length > 0,
      )
      : [];
    const scheduledDaysResolved =
      scheduledFromClaude.length > 0 ? scheduledFromClaude : trainingDays;

    const normalized = {
      title: plan.title ?? 'Training Plan',
      jordanWelcome: plan.jordanWelcome ?? null,
      totalWeeks: plan.totalWeeks ?? totalWeeks,
      daysPerWeek: plan.daysPerWeek ?? actualDaysPerWeek,
      scheduledDays: scheduledDaysResolved,
      goal: goal,
      split: splitForNormalized,
      enhancedRecovery,
      concurrentSport,
      biologicalSex,
      subMusclePreferences,
      currentWeek: 1,
      weeks: [week1Data],
    };

    if (normalized.weeks[0] && !normalized.weeks[0].weekNumber) {
      normalized.weeks[0].weekNumber = 1;
    }

    // deno-lint-ignore no-explicit-any
    if (goal === 'power_hypertrophy' && normalized.weeks[0]?.days) {
      // deno-lint-ignore no-explicit-any
      const workoutDays = (normalized.weeks[0].days as any[]).filter((d: any) => d.type === 'workout');
      for (const day of workoutDays) {
        if (!day.sessionPhase) {
          console.error('[generate-plan] Missing sessionPhase on day:', day.title);
        }
        // deno-lint-ignore no-explicit-any
        const missingPhase = (day.exercises ?? []).filter((e: any) => !e.phase);
        if (missingPhase.length > 0) {
          // deno-lint-ignore no-explicit-any
          console.error('[generate-plan] Exercises missing phase tag:', missingPhase.map((e: any) => e.name));
        }
        // deno-lint-ignore no-explicit-any
        const phase1 = (day.exercises ?? []).filter((e: any) => e.phase === 'strength');
        // deno-lint-ignore no-explicit-any
        const phase2 = (day.exercises ?? []).filter((e: any) => e.phase === 'hypertrophy');
        console.log(`[generate-plan] ${day.title}: Phase1=${phase1.length}, Phase2=${phase2.length}`);
      }
    }

    // GAP-8: Enforce female rep range adjustments post-Claude — Claude reverts some exercises
    // GAP-7: Stamp muscleEmphasis from embedded lookup (same pattern as enforceRepRanges)
    const processedPlanJson = stampMuscleEmphasisOnPlan(
      enforceRepRanges(normalized, biologicalSex),
    );

    if (biologicalSex === 'female') {
      // deno-lint-ignore no-explicit-any
      const sampleExercises = processedPlanJson.weeks[0]?.days
        // deno-lint-ignore no-explicit-any
        ?.filter((d: any) => d.type === 'workout')
        ?.slice(0, 2)
        // deno-lint-ignore no-explicit-any
        ?.flatMap((d: any) => d.exercises?.slice(0, 3))
        // deno-lint-ignore no-explicit-any
        ?.map((e: any) => `${e.name}: ${e.reps}`);
      console.log('[generate-plan] Female rep range check:', JSON.stringify(sampleExercises));
    }

    return new Response(JSON.stringify({ plan: processedPlanJson }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[generate-plan] FATAL ERROR:', error);
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[generate-plan] Error message:', msg);
    console.error('[generate-plan] Stack:', stack);
    return new Response(
      JSON.stringify({
        error: msg || 'Unknown error',
        detail: error instanceof Error ? error.stack : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
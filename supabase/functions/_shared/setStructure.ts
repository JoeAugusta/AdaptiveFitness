/** plan_json exercise.name vs app targetLift id — library-aligned primary names. */
export const STRENGTH_TARGET_LIFT_EXERCISE_NAMES: Record<string, string> = {
  bench_press: 'Barbell Bench Press',
  squat: 'Back Squat',
  deadlift: 'Deadlift',
  sumo_deadlift: 'Sumo Deadlift',
  ohp: 'Overhead Press',
  weighted_pullup: 'Pull-Up',
  barbell_row: 'Barbell Row',
};

export function resolveStrengthTargetLiftExerciseName(
  strengthTargetLift: string | null | undefined,
): string | null {
  if (!strengthTargetLift || !String(strengthTargetLift).trim()) return null;
  const id = String(strengthTargetLift).trim().toLowerCase().replace(/\s+/g, '_');
  return (
    STRENGTH_TARGET_LIFT_EXERCISE_NAMES[id] ??
    String(strengthTargetLift).trim().replace(/_/g, ' ')
  );
}

/** Normalizes snake_case / spaces for lookups (goalLift from body.targetLift || body.goalLift). */
export function normalizeGoalLiftId(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === '') return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Stable substring used to fuzzy-match Claude exercise.name to the athlete's programme target lift.
 * Aligns GoalDetails IDs (bench_press) with catalogue-style ids (barbell_bench_press).
 */
export function goalLiftDisplaySubstring(goalLift: string): string {
  const k = normalizeGoalLiftId(goalLift);
  const map: Record<string, string> = {
    barbell_bench_press: 'bench press',
    bench_press: 'bench press',
    barbell_squat: 'squat',
    squat: 'squat',
    back_squat: 'squat',
    deadlift: 'deadlift',
    sumo_deadlift: 'sumo deadlift',
    overhead_press: 'overhead press',
    ohp: 'overhead press',
    weighted_pull_up: 'pull-up',
    weighted_pullup: 'pull-up',
    barbell_row: 'barbell row',
  };
  if (map[k]) return map[k];
  return k.replace(/_/g, ' ').toLowerCase();
}

/**
 * Step 1: exact exerciseId match (case-insensitive) against goalLift.
 * Step 2: exact display name match ONLY — EXACT_MAP list, never substring / includes().
 */
// deno-lint-ignore no-explicit-any
export function isTargetLift(exercise: any, goalLiftRaw: string | null | undefined): boolean {
  if (!goalLiftRaw || String(goalLiftRaw).trim() === '') return false;

  const goalLift = String(goalLiftRaw).trim();

  // Rule 1: exact exerciseId match
  const exId = String(exercise.exerciseId ?? '').toLowerCase().trim();
  const normGoal = goalLift.toLowerCase().trim();
  if (exId && exId === normGoal) return true;

  // Rule 2: exact display name match ONLY — aliases on canonical goal_lift id
  const EXACT_MAP: Record<string, string[]> = {
    barbell_bench_press: ['bench press'],
    bench_press: ['bench press'],
    barbell_squat: ['back squat', 'barbell squat'],
    squat: ['back squat', 'barbell squat'],
    deadlift: ['deadlift'],
    sumo_deadlift: ['sumo deadlift'],
    overhead_press: ['overhead press', 'barbell overhead press'],
    ohp: ['overhead press', 'barbell overhead press'],
    weighted_pull_up: ['weighted pull-up', 'weighted pullup'],
    weighted_pullup: ['weighted pull-up', 'weighted pullup'],
  };

  const gKey = normalizeGoalLiftId(goalLift);
  const validNames = EXACT_MAP[gKey] ?? [];

  const exName = (
    exercise.exerciseName ?? exercise.name ?? ''
  ).toLowerCase().trim();

  return validNames.includes(exName);
}

/** Alias — same as {@link isTargetLift}. */
// deno-lint-ignore no-explicit-any
export function isStrengthGoalTargetLift(exercise: any, goalLiftRaw: string | null | undefined): boolean {
  return isTargetLift(exercise, goalLiftRaw);
}



/**
 * Sequential rules for setStructure (+ strip pyramid setTargets when forcing straight).
 * RULE 1: strength programme target lift → straight, strip setTargets.
 */
// deno-lint-ignore no-explicit-any
export function enforceSetStructureExercise(
  ex: any,
  goal: string,
  strengthGoalLift: string | null | undefined,
): any {
  const compoundTier = ex.compoundTier;
  const equipmentLower = String(ex.equipment ?? 'barbell').toLowerCase();

  // RULE 1 (highest): strength goal target lift
  if (
    goal === 'strength' &&
    strengthGoalLift &&
    isStrengthGoalTargetLift(ex, strengthGoalLift)
  ) {
    const out = { ...ex, compoundTier, setStructure: 'straight' as const };
    delete out.setTargets;
    return out;
  }

  // RULE 2: isolation / fixed equipment → straight, strip pyramid rows
  if (
    compoundTier === 'isolation' ||
    equipmentLower === 'machine' ||
    equipmentLower === 'cable' ||
    equipmentLower === 'bodyweight'
  ) {
    const out = {
      ...ex,
      compoundTier,
      equipment: ex.equipment ?? 'barbell',
      setStructure: 'straight' as const,
    };
    delete out.setTargets;
    return out;
  }

  // RULE 3: barbell/dumbbell compounds → pyramid (setTargets filled later for W1)
  if (
    (equipmentLower === 'barbell' || equipmentLower === 'dumbbell') &&
    (compoundTier === 'primary_compound' || compoundTier === 'secondary_compound')
  ) {
    return {
      ...ex,
      compoundTier,
      equipment: ex.equipment ?? 'barbell',
      setStructure: 'pyramid' as const,
    };
  }

  // RULE 4: fallback straight
  const out = {
    ...ex,
    compoundTier,
    equipment: ex.equipment ?? 'barbell',
    setStructure: 'straight' as const,
  };
  delete out.setTargets;
  return out;
}

/**
 * Belt-and-suspenders pass (after pyramid setTargets stamping): strip pyramid residue from
 * the strength-programme target lift.
 */
// deno-lint-ignore no-explicit-any
export function finalizeStrengthGoalTargetLift(
  planJson: any,
  goal: string,
  strengthGoalLift: string | null | undefined,
): any {
  if (goal !== 'strength' || !strengthGoalLift || String(strengthGoalLift).trim() === '') {
    return planJson;
  }

  return {
    ...planJson,
    weeks: (planJson.weeks ?? []).map((week: any) => ({
      ...week,
      days: (week.days ?? []).map((day: any) => {
        if (day.type === 'cardio') return day;
        if (!Array.isArray(day.exercises) || !day.exercises.length) return day;

        const exercises = (day.exercises as any[]).map((ex) => {
          if (!isStrengthGoalTargetLift(ex, strengthGoalLift)) return ex;
          const next = {
            ...ex,
            setStructure: 'straight' as const,
          };
          delete next.setTargets;
          return next;
        });

        return { ...day, exercises };
      }),
    })),
  };
}

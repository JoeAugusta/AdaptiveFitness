/** Client-side duplicate of `_shared/setStructure` — avoids bundling Supabase Edge paths. */

/** Lowercase, strip parentheses, collapse whitespace — for loose name matching. */
export function normalizeExerciseNameForMatch(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeGoalLiftId(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === '') return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_');
}

function goalLiftDisplaySubstring(goalLift: string): string {
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
 * Exact match to server `isTargetLift` — exerciseId or canonical display name only.
 */
export function isTargetLift(
  exercise: {
    id?: string;
    exerciseId?: string;
    name?: string;
    exerciseName?: string;
  },
  goalLiftRaw: string | null | undefined,
): boolean {
  if (!goalLiftRaw || String(goalLiftRaw).trim() === '') return false;

  const goalLift = String(goalLiftRaw).trim();

  const exId = String(exercise.exerciseId ?? exercise.id ?? '')
    .toLowerCase()
    .trim();
  const normGoal = goalLift.toLowerCase().trim();
  if (exId && exId === normGoal) return true;

  const EXACT_MAP: Record<string, string[]> = {
    barbell_bench_press: ['bench press', 'barbell bench press'],
    bench_press: ['bench press', 'barbell bench press'],
    barbell_squat: ['back squat', 'barbell squat'],
    squat: ['back squat', 'barbell squat'],
    deadlift: ['deadlift', 'conventional deadlift'],
    sumo_deadlift: ['sumo deadlift'],
    overhead_press: ['overhead press', 'barbell overhead press'],
    ohp: ['overhead press', 'barbell overhead press'],
    weighted_pull_up: ['weighted pull-up', 'weighted pullup', 'pull-up'],
    weighted_pullup: ['weighted pull-up', 'weighted pullup', 'pull-up'],
    barbell_row: ['barbell row'],
  };

  const gKey = normalizeGoalLiftId(goalLift);
  const validNames = EXACT_MAP[gKey] ?? [];

  const exName = String(exercise.exerciseName ?? exercise.name ?? '')
    .toLowerCase()
    .trim();

  return validNames.includes(exName);
}

function targetLiftNormalizedTerms(targetLift: string): string[] {
  const terms = new Set<string>();
  const display = normalizeExerciseNameForMatch(
    goalLiftDisplaySubstring(targetLift),
  );
  if (display) terms.add(display);
  const slug = normalizeExerciseNameForMatch(
    normalizeGoalLiftId(targetLift).replace(/_/g, ' '),
  );
  if (slug) terms.add(slug);

  const gKey = normalizeGoalLiftId(targetLift);
  const EXACT_MAP: Record<string, string[]> = {
    barbell_bench_press: ['bench press', 'barbell bench press'],
    bench_press: ['bench press', 'barbell bench press'],
    barbell_squat: ['back squat', 'barbell squat'],
    squat: ['back squat', 'barbell squat'],
    deadlift: ['deadlift', 'conventional deadlift'],
    sumo_deadlift: ['sumo deadlift'],
    overhead_press: ['overhead press', 'barbell overhead press'],
    ohp: ['overhead press', 'barbell overhead press'],
    weighted_pull_up: ['weighted pull-up', 'weighted pullup', 'pull-up'],
    weighted_pullup: ['weighted pull-up', 'weighted pullup', 'pull-up'],
    barbell_row: ['barbell row'],
  };
  for (const n of EXACT_MAP[gKey] ?? []) {
    const norm = normalizeExerciseNameForMatch(n);
    if (norm) terms.add(norm);
  }
  return [...terms];
}

/**
 * Loose match for logged set names vs plan target lift id
 * (e.g. bench_press ↔ "Barbell Bench Press", "Flat Bench Press").
 */
export function looseMatchesTargetLift(
  loggedExerciseName: string,
  targetLiftRaw: string | null | undefined,
): boolean {
  if (!targetLiftRaw || String(targetLiftRaw).trim() === '') return false;

  const exercise = {
    name: loggedExerciseName,
    exerciseName: loggedExerciseName,
  };
  if (isTargetLift(exercise, targetLiftRaw)) return true;
  if (isStrengthProgramTargetLiftExercise(exercise, targetLiftRaw)) return true;

  const logNorm = normalizeExerciseNameForMatch(loggedExerciseName);
  if (!logNorm) return false;

  for (const term of targetLiftNormalizedTerms(String(targetLiftRaw))) {
    if (!term) continue;
    if (logNorm.includes(term) || term.includes(logNorm)) return true;
  }
  return false;
}

/** Matches server `isStrengthGoalTargetLift` for adaptation copy routing. */
export function isStrengthProgramTargetLiftExercise(
  exercise: { id?: string; name?: string; exerciseName?: string },
  goalLiftRaw: string | null | undefined,
): boolean {
  const goalLift = normalizeGoalLiftId(goalLiftRaw);
  if (!goalLift) return false;

  const exId =
    normalizeGoalLiftId(exercise?.id ?? '') ||
    normalizeGoalLiftId((exercise as { exercise_id?: string }).exercise_id ?? '');
  if (exId && (exId === goalLift || exId.endsWith(goalLift) || goalLift.endsWith(exId))) {
    return true;
  }

  const n = String(exercise?.name ?? exercise?.exerciseName ?? '').toLowerCase();
  const key = goalLift;

  if (key.includes('bench') || goalLiftDisplaySubstring(goalLiftRaw ?? '') === 'bench press') {
    return (
      n.includes('bench') &&
      n.includes('press') &&
      !n.includes('incline') &&
      !n.includes('decline')
    );
  }
  if (key === 'ohp' || key.includes('overhead') || key === 'overhead_press') {
    return n.includes('overhead') || n.includes('ohp') || n.includes('military');
  }
  if (
    key === 'weighted_pullup' ||
    key === 'weighted_pull_up' ||
    (key.includes('pull') && key.includes('up'))
  ) {
    return (
      n.includes('pull-up') ||
      n.includes('pullup') ||
      n.includes('chin-up') ||
      n.includes('chinup')
    );
  }
  if (key.includes('squat')) {
    if (key.includes('front')) return n.includes('front') && n.includes('squat');
    return (
      (n.includes('squat') || n.includes('back squat')) &&
      !n.includes('front squat') &&
      !n.includes('goblet') &&
      !n.includes('bulgarian') &&
      !n.includes('split') &&
      !n.includes('hack')
    );
  }
  if (key.includes('sumo') && key.includes('deadlift')) {
    return n.includes('sumo') && (n.includes('deadlift') || n.includes('dead lift'));
  }
  if (key === 'deadlift' || key.includes('deadlift')) {
    if (key.includes('sumo')) {
      return n.includes('sumo') && (n.includes('deadlift') || n.includes('dead lift'));
    }
    return (
      (n.includes('deadlift') || n.includes('dead lift')) &&
      !n.includes('sumo') &&
      !n.includes('romanian') &&
      !n.includes('rdl')
    );
  }

  const needle = goalLiftDisplaySubstring(goalLiftRaw ?? '');
  return needle.length >= 3 && n.includes(needle);
}

/** Strict match for logged set names vs plan target lift id (6 valid lifts). */
export function matchesTargetLift(
  exerciseName: string,
  targetLift: string,
): boolean {
  if (!exerciseName || !targetLift) return false;

  const name = exerciseName.toLowerCase().trim();
  const lift = targetLift.toLowerCase().replace(/_/g, ' ').trim();

  // 1. Exact match after normalisation
  if (name === lift) return true;

  // 2. Lift-specific keyword maps — prevents false positives
  //    e.g. "Close Grip Bench Press" should NOT match bench_press
  //    e.g. "Romanian Deadlift" should NOT match deadlift
  const LIFT_PATTERNS: Record<string, RegExp> = {
    'bench press': /^(barbell\s+)?bench press$/,
    'back squat': /^(barbell\s+)?(back\s+)?squat$/,
    deadlift: /^(conventional\s+)?deadlift$/,
    'sumo deadlift': /^sumo\s+deadlift$/,
    'overhead press': /^(barbell\s+)?(overhead\s+press|ohp|military\s+press)$/,
    'weighted pullup': /^weighted\s+pull.?up$|^pull.?up$/,
  };

  const pattern = LIFT_PATTERNS[lift];
  if (pattern) return pattern.test(name);

  // 3. Fallback partial match for any unrecognised lift
  return name.includes(lift) || lift.includes(name);
}

/** Epley estimate rounded to nearest 2.5 lbs plate increment. */
export function epleyEstimated1RMLbs(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  const raw = reps === 1 ? weight : weight * (1 + reps / 30);
  return Math.round(raw / 2.5) * 2.5;
}

if (__DEV__) {
  const MATCHES_TARGET_LIFT_TESTS: [string, string, boolean][] = [
    ['Bench Press', 'bench_press', true],
    ['Barbell Bench Press', 'bench_press', true],
    ['Close Grip Bench Press', 'bench_press', false],
    ['Incline Bench Press', 'bench_press', false],
    ['Back Squat', 'back_squat', true],
    ['Squat', 'back_squat', true],
    ['Hack Squat', 'back_squat', false],
    ['Deadlift', 'deadlift', true],
    ['Romanian Deadlift', 'deadlift', false],
    ['Sumo Deadlift', 'sumo_deadlift', true],
    ['Overhead Press', 'overhead_press', true],
    ['OHP', 'overhead_press', true],
    ['Weighted Pull-up', 'weighted_pullup', true],
    ['Pull-up', 'weighted_pullup', true],
  ];

  console.log('[matchesTargetLift] __DEV__ test suite');
  for (const [exerciseName, targetLift, expected] of MATCHES_TARGET_LIFT_TESTS) {
    const result = matchesTargetLift(exerciseName, targetLift);
    const ok = result === expected;
    console.log(
      `[matchesTargetLift] ${JSON.stringify(exerciseName)} + ${targetLift} → ${result} (expected ${expected})${ok ? '' : ' FAIL'}`,
    );
  }
}

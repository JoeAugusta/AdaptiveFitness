import { EXERCISES } from '../constants/exerciseLibrary';

export const MACHINE_EQUIVALENTS: Record<string, string[]> = {
  // Chest
  'Barbell Bench Press': ['Machine Chest Press', 'Smith Machine Bench Press'],
  'Incline Barbell Press': ['Incline Machine Press', 'Smith Machine Incline Press'],
  'Incline Dumbbell Press': ['Incline Machine Press', 'Incline Smith Machine Press'],
  'Dumbbell Bench Press': ['Machine Chest Press', 'Smith Machine Bench Press'],
  'Cable Fly (High to Low)': ['Pec Deck', 'Machine Fly'],
  'Dip': ['Machine Dip', 'Assisted Dip Machine'],
  // Back
  'Barbell Row (Overhand Wide)': ['Machine Row', 'Seated Cable Row'],
  'Barbell Row (Underhand)': ['Machine Row', 'Seated Cable Row'],
  'T-Bar Row': ['Machine Row', 'Chest Supported Row'],
  'Dumbbell Row': ['Machine Row', 'Chest Supported Row'],
  'Pull-up': ['Lat Pulldown Machine', 'Assisted Pull-up Machine'],
  // Shoulders
  'Overhead Press': ['Machine Shoulder Press', 'Smith Machine Press'],
  'Dumbbell Shoulder Press': ['Machine Shoulder Press', 'Smith Machine Press'],
  'Lateral Raise': ['Machine Lateral Raise', 'Cable Lateral Raise'],
  // Legs
  'Back Squat': ['Leg Press', 'Smith Machine Squat', 'Hack Squat'],
  'Front Squat': ['Hack Squat', 'Leg Press', 'Smith Machine Front Squat'],
  'Romanian Deadlift': ['Machine RDL', 'Lying Leg Curl', 'Seated Leg Curl'],
  'Bulgarian Split Squat': ['Leg Press (Single Leg)', 'Split Squat Machine'],
  'Hip Thrust': ['Hip Thrust Machine', 'Glute Drive Machine'],
  // Arms
  'Barbell Curl': ['Machine Bicep Curl', 'Preacher Curl Machine'],
  'Skull Crusher': ['Tricep Pushdown Machine', 'Machine Tricep Extension'],
  'Close Grip Bench Press': ['Tricep Press Machine', 'Smith Machine Close Grip'],
};

/** Plan / library display names → MACHINE_EQUIVALENTS keys */
const MACHINE_EQUIVALENT_KEY_ALIASES: Record<string, string> = {
  'incline barbell bench press': 'Incline Barbell Press',
  'pull-up': 'Pull-up',
  dips: 'Dip',
  'dumbbell lateral raise': 'Lateral Raise',
  'skull crushers': 'Skull Crusher',
  'close-grip bench press': 'Close Grip Bench Press',
  'barbell row': 'Barbell Row (Overhand Wide)',
};

const LIBRARY_NAME_SET = new Set(
  EXERCISES.map((e) => e.name.toLowerCase().trim()),
);

function normalizeExerciseName(name: string): string {
  return name.toLowerCase().trim();
}

function resolveMachineEquivalentKey(exerciseName: string): string | null {
  const normalized = normalizeExerciseName(exerciseName);
  const alias = MACHINE_EQUIVALENT_KEY_ALIASES[normalized];
  if (alias) return alias;
  for (const key of Object.keys(MACHINE_EQUIVALENTS)) {
    if (normalizeExerciseName(key) === normalized) return key;
  }
  return null;
}

function isInExerciseLibrary(name: string): boolean {
  return LIBRARY_NAME_SET.has(normalizeExerciseName(name));
}

export type ExerciseSwapCandidate = {
  name: string;
  isMachineEquivalent: boolean;
};

export function buildExerciseSwapCandidates(
  exerciseName: string,
  currentWorkoutExerciseNames: string[] | undefined,
  alternatives?: string[],
): ExerciseSwapCandidate[] {
  const selfNorm = normalizeExerciseName(exerciseName);
  const currentNames = new Set(
    (currentWorkoutExerciseNames ?? []).map((n) => normalizeExerciseName(n)),
  );
  const results: ExerciseSwapCandidate[] = [];

  const addCandidate = (name: string, isMachineEquivalent: boolean) => {
    const norm = normalizeExerciseName(name);
    if (norm === selfNorm || currentNames.has(norm)) return;
    if (!isInExerciseLibrary(name)) return;
    if (results.some((c) => normalizeExerciseName(c.name) === norm)) return;
    results.push({ name, isMachineEquivalent });
  };

  const machineKey = resolveMachineEquivalentKey(exerciseName);
  if (machineKey) {
    for (const alt of MACHINE_EQUIVALENTS[machineKey] ?? []) {
      addCandidate(alt, true);
    }
  }

  const currentEx = EXERCISES.find(
    (e) => normalizeExerciseName(e.name) === selfNorm,
  );

  if (!currentEx) {
    for (const alt of alternatives ?? []) {
      addCandidate(alt, false);
      if (results.length >= 5) break;
    }
    return results.slice(0, 5);
  }

  const patternMatches = EXERCISES.filter(
    (e) =>
      e.movementPattern === currentEx.movementPattern &&
      e.id !== currentEx.id &&
      normalizeExerciseName(e.name) !== selfNorm &&
      !currentNames.has(normalizeExerciseName(e.name)),
  ).sort((a, b) => a.rotationPriority - b.rotationPriority);

  if (patternMatches.length >= 3) {
    for (const e of patternMatches) {
      addCandidate(e.name, false);
      if (results.length >= 5) break;
    }
    return results.slice(0, 5);
  }

  const muscleMatches = EXERCISES.filter(
    (e) =>
      e.primaryMuscle === currentEx.primaryMuscle &&
      e.compoundTier === currentEx.compoundTier &&
      e.id !== currentEx.id &&
      normalizeExerciseName(e.name) !== selfNorm &&
      !currentNames.has(normalizeExerciseName(e.name)),
  ).sort((a, b) => a.rotationPriority - b.rotationPriority);

  for (const e of muscleMatches) {
    addCandidate(e.name, false);
    if (results.length >= 5) break;
  }

  return results.slice(0, 5);
}

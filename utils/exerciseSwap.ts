import { EXERCISES, type MovementPattern } from '../constants/exerciseLibrary';

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

function normalizePatternLookupKey(name: string): string {
  return normalizeExerciseName(name).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

const NAME_TO_PATTERN: Record<string, MovementPattern> = Object.fromEntries(
  EXERCISES.map((e) => [normalizeExerciseName(e.name), e.movementPattern]),
);

const PATTERN_ALIASES: Record<string, MovementPattern> = {
  'chest-supported row': 'horizontal_pull',
  'chest supported row': 'horizontal_pull',
  'chest supported dumbbell row': 'horizontal_pull',
  'machine row': 'horizontal_pull',
  'seated machine row': 'horizontal_pull',
  'pendlay row': 'horizontal_pull',
  'yates row': 'horizontal_pull',
};

export type SwapEquipmentType =
  | 'barbell'
  | 'dumbbell'
  | 'cable'
  | 'bodyweight'
  | 'machine'
  | 'other';

type MuscleGroupFallbackEntry = {
  name: string;
  equipment: SwapEquipmentType;
  sameWeightOk: boolean;
  isMachine: boolean;
  isBodyweight: boolean;
};

const MUSCLE_GROUP_ALTERNATIVES: Record<string, string[]> = {
  Chest: ['Incline Dumbbell Press', 'Cable Fly', 'Machine Chest Press', 'Push-Up'],
  Legs: ['Leg Press', 'Hack Squat', 'Dumbbell Lunges', 'Bulgarian Split Squat'],
  Shoulders: ['Dumbbell Shoulder Press', 'Arnold Press', 'Cable Lateral Raise'],
  Arms: ['Preacher Curl', 'Hammer Curl', 'Cable Curl'],
  Triceps: ['Overhead Tricep Extension', 'Cable Pushdown', 'Close-Grip Bench Press'],
  Biceps: ['Preacher Curl', 'Hammer Curl', 'Incline Dumbbell Curl'],
  Glutes: ['Hip Thrust', 'Cable Kickback', 'Bulgarian Split Squat'],
  Hamstrings: ['Leg Curl', 'Romanian Deadlift', 'Nordic Curl'],
  Calves: ['Seated Calf Raise', 'Leg Press Calf Raise', 'Single-Leg Calf Raise'],
  Core: ['Plank', 'Cable Crunch', 'Ab Wheel Rollout'],
  'Rear Delts': ['Reverse Dumbbell Fly', 'Face Pull', 'Band Pull-Apart'],
  Traps: ['Dumbbell Shrug', 'Cable Shrug', 'Face Pull'],
  Forearms: ['Wrist Curl', 'Hammer Curl', 'Farmers Carry'],
};

function getMuscleGroupFallback(muscleGroup: string): MuscleGroupFallbackEntry[] {
  const structured: Record<string, MuscleGroupFallbackEntry[]> = {
    Back: [
      {
        name: 'Cable Row',
        equipment: 'cable',
        sameWeightOk: false,
        isMachine: false,
        isBodyweight: false,
      },
      {
        name: 'Dumbbell Row',
        equipment: 'dumbbell',
        sameWeightOk: false,
        isMachine: false,
        isBodyweight: false,
      },
      {
        name: 'Machine Row',
        equipment: 'machine',
        sameWeightOk: false,
        isMachine: true,
        isBodyweight: false,
      },
    ],
  };

  if (structured[muscleGroup]) {
    return structured[muscleGroup];
  }

  return (MUSCLE_GROUP_ALTERNATIVES[muscleGroup] ?? [
    'Dumbbell Row',
    'Cable Row',
    'Resistance Band Row',
  ]).map((name) => {
    const meta = deriveCandidateMeta(name);
    return {
      name,
      equipment: meta.equipmentType,
      sameWeightOk: false,
      isMachine: meta.isMachine,
      isBodyweight: meta.isBodyweight,
    };
  });
}

type SwapPoolEntry = {
  name: string;
  sameWeightOk?: boolean;
  isMachineEquivalent?: boolean;
};

const PATTERN_SWAP_POOL: Partial<Record<MovementPattern, MuscleGroupFallbackEntry[]>> = {
  isolation_pull: [
    {
      name: 'Dumbbell Curl',
      equipment: 'dumbbell',
      sameWeightOk: false,
      isMachine: false,
      isBodyweight: false,
    },
    {
      name: 'Hammer Curl',
      equipment: 'dumbbell',
      sameWeightOk: false,
      isMachine: false,
      isBodyweight: false,
    },
    {
      name: 'Preacher Curl',
      equipment: 'barbell',
      sameWeightOk: false,
      isMachine: false,
      isBodyweight: false,
    },
    {
      name: 'Cable Curl',
      equipment: 'cable',
      sameWeightOk: false,
      isMachine: false,
      isBodyweight: false,
    },
    {
      name: 'Incline Dumbbell Curl',
      equipment: 'dumbbell',
      sameWeightOk: false,
      isMachine: false,
      isBodyweight: false,
    },
    {
      name: 'Concentration Curl',
      equipment: 'dumbbell',
      sameWeightOk: false,
      isMachine: false,
      isBodyweight: false,
    },
    {
      name: 'Spider Curl',
      equipment: 'barbell',
      sameWeightOk: false,
      isMachine: false,
      isBodyweight: false,
    },
  ],
};

/** Per-exercise swap suggestions with explicit sameWeightOk overrides. */
export const SWAP_POOL: Record<string, SwapPoolEntry[]> = {
  'barbell row': [
    { name: 'Barbell Row (Overhand Wide)', sameWeightOk: true },
    { name: 'Barbell Row (Underhand)', sameWeightOk: true },
    { name: 'Barbell Row (Overhand Narrow)', sameWeightOk: true },
    { name: 'T-Bar Row', sameWeightOk: true },
    { name: 'Machine Row', isMachineEquivalent: true },
  ],
  'seated cable row': [
    { name: 'Cable Row (Close Grip)', sameWeightOk: true },
    { name: 'Cable Row (Wide Grip)', sameWeightOk: true },
    { name: 'Cable Row (Reverse Grip)', sameWeightOk: true },
    { name: 'Machine Row', isMachineEquivalent: true },
  ],
  'lat pulldown': [
    { name: 'Lat Pulldown (Wide Grip)', sameWeightOk: true },
    { name: 'Lat Pulldown (Close Grip)', sameWeightOk: true },
    { name: 'Lat Pulldown (Reverse Grip)', sameWeightOk: true },
    { name: 'Assisted Pull-up Machine', isMachineEquivalent: true },
  ],
};

function resolveMovementPattern(exerciseName: string): MovementPattern | undefined {
  const nameLower = normalizeExerciseName(exerciseName);
  const nameSpaced = normalizePatternLookupKey(exerciseName);
  return (
    NAME_TO_PATTERN[nameLower] ??
    NAME_TO_PATTERN[nameSpaced] ??
    PATTERN_ALIASES[nameLower] ??
    PATTERN_ALIASES[nameSpaced] ??
    undefined
  );
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
  isMachine: boolean;
  isBodyweight: boolean;
  equipmentType: SwapEquipmentType;
  sameWeightOk?: boolean;
};

function deriveCandidateMeta(name: string): Pick<
  ExerciseSwapCandidate,
  'equipmentType' | 'isBodyweight' | 'isMachine'
> {
  const libraryMatch = EXERCISES.find(
    (e) => normalizeExerciseName(e.name) === normalizeExerciseName(name),
  );
  const raw = libraryMatch?.equipment;
  const equipmentType: SwapEquipmentType =
    raw === 'barbell' ||
    raw === 'dumbbell' ||
    raw === 'cable' ||
    raw === 'bodyweight' ||
    raw === 'machine'
      ? raw
      : 'other';
  const isBodyweight = libraryMatch ? !libraryMatch.usesWeight : equipmentType === 'bodyweight';
  const isMachine = equipmentType === 'machine';
  return { equipmentType, isBodyweight, isMachine };
}

function defaultSameWeightOk(
  sourceName: string,
  targetName: string,
  isMachineEquivalent: boolean,
): boolean {
  if (isMachineEquivalent) return false;
  const source = deriveCandidateMeta(sourceName);
  const target = deriveCandidateMeta(targetName);
  if (target.isBodyweight || target.isMachine) return false;
  if (source.equipmentType === 'other' || target.equipmentType === 'other') {
    return false;
  }
  return source.equipmentType === target.equipmentType;
}

export function buildSwapCandidateFromName(
  name: string,
  isMachineEquivalent = false,
  sameWeightOk?: boolean,
): ExerciseSwapCandidate {
  const meta = deriveCandidateMeta(name);
  return {
    name,
    isMachineEquivalent,
    isMachine: meta.isMachine || isMachineEquivalent,
    isBodyweight: meta.isBodyweight,
    equipmentType: meta.equipmentType,
    ...(sameWeightOk !== undefined ? { sameWeightOk } : {}),
  };
}

function buildCandidateFromPoolEntry(
  sourceName: string,
  entry: SwapPoolEntry,
): ExerciseSwapCandidate {
  const isMachineEquivalent = entry.isMachineEquivalent === true;
  const sameWeightOk =
    entry.sameWeightOk ??
    defaultSameWeightOk(sourceName, entry.name, isMachineEquivalent);
  return buildSwapCandidateFromName(entry.name, isMachineEquivalent, sameWeightOk);
}

function buildCandidateFromFallbackEntry(
  entry: MuscleGroupFallbackEntry,
): ExerciseSwapCandidate {
  return {
    name: entry.name,
    isMachineEquivalent: entry.isMachine,
    isMachine: entry.isMachine,
    isBodyweight: entry.isBodyweight,
    equipmentType: entry.equipment,
    sameWeightOk: entry.sameWeightOk,
  };
}

export function buildExerciseSwapCandidates(
  exerciseName: string,
  muscleGroup: string,
): ExerciseSwapCandidate[] {
  const selfNorm = normalizeExerciseName(exerciseName);
  const poolEntries = SWAP_POOL[selfNorm];
  if (poolEntries?.length) {
    return poolEntries
      .filter((entry) => normalizeExerciseName(entry.name) !== selfNorm)
      .slice(0, 5)
      .map((entry) => buildCandidateFromPoolEntry(exerciseName, entry));
  }

  const results: ExerciseSwapCandidate[] = [];

  const addCandidate = (
    name: string,
    isMachineEquivalent: boolean,
    sameWeightOk?: boolean,
  ) => {
    const norm = normalizeExerciseName(name);
    if (norm === selfNorm) return;
    if (!isInExerciseLibrary(name)) return;
    if (results.some((c) => normalizeExerciseName(c.name) === norm)) return;
    const resolvedSameWeightOk =
      sameWeightOk ?? defaultSameWeightOk(exerciseName, name, isMachineEquivalent);
    results.push(
      buildSwapCandidateFromName(name, isMachineEquivalent, resolvedSameWeightOk),
    );
  };

  const machineKey = resolveMachineEquivalentKey(exerciseName);
  if (machineKey) {
    for (const alt of MACHINE_EQUIVALENTS[machineKey] ?? []) {
      addCandidate(alt, true, false);
    }
  }

  const currentEx = EXERCISES.find(
    (e) => normalizeExerciseName(e.name) === selfNorm,
  );

  if (currentEx) {
    const patternPool = PATTERN_SWAP_POOL[currentEx.movementPattern];
    if (patternPool?.length) {
      const curated = patternPool
        .filter((entry) => normalizeExerciseName(entry.name) !== selfNorm)
        .slice(0, 5)
        .map((entry) => buildCandidateFromFallbackEntry(entry));
      if (curated.length > 0) {
        return curated;
      }
    }
  }

  if (!currentEx) {
    const pattern = resolveMovementPattern(exerciseName);
    if (pattern) {
      const patternMatches = EXERCISES.filter(
        (e) =>
          e.movementPattern === pattern &&
          normalizeExerciseName(e.name) !== selfNorm,
      ).sort((a, b) => a.rotationPriority - b.rotationPriority);

      for (const e of patternMatches) {
        addCandidate(e.name, false);
        if (results.length >= 5) break;
      }
      if (results.length > 0) {
        return results.slice(0, 5);
      }
    }

    for (const entry of getMuscleGroupFallback(muscleGroup)) {
      const norm = normalizeExerciseName(entry.name);
      if (norm === selfNorm) continue;
      if (results.some((c) => normalizeExerciseName(c.name) === norm)) continue;
      results.push(buildCandidateFromFallbackEntry(entry));
      if (results.length >= 5) break;
    }
    return results.slice(0, 5);
  }

  const patternMatches = EXERCISES.filter(
    (e) =>
      e.movementPattern === currentEx.movementPattern &&
      e.id !== currentEx.id &&
      normalizeExerciseName(e.name) !== selfNorm,
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
      normalizeExerciseName(e.name) !== selfNorm,
  ).sort((a, b) => a.rotationPriority - b.rotationPriority);

  for (const e of muscleMatches) {
    addCandidate(e.name, false);
    if (results.length >= 5) break;
  }

  return results.slice(0, 5);
}

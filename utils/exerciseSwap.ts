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
  'Back Squat': ['Smith Machine Squat', 'Hack Squat'],
  'Front Squat': ['Hack Squat', 'Leg Press', 'Smith Machine Front Squat'],
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
  'db row': 'horizontal_pull',
  'one arm dumbbell row': 'horizontal_pull',
  'incline barbell bench press': 'horizontal_push',
  'incline barbell press': 'horizontal_push',
  'flat barbell bench press': 'horizontal_push',
  'flat dumbbell press': 'horizontal_push',
  pushup: 'horizontal_push',
  'push up': 'horizontal_push',
  ohp: 'vertical_push',
  'military press': 'vertical_push',
  pullup: 'vertical_pull',
  'pull up': 'vertical_pull',
  chinup: 'vertical_pull',
  'chin up': 'vertical_pull',
  rdl: 'hinge',
  'stiff-leg deadlift': 'hinge',
  'conventional deadlift': 'hinge',
  'leg curl': 'isolation_legs',
  'hamstring curl': 'isolation_legs',
  'quad extension': 'isolation_legs',
  'calf raise (standing)': 'isolation_legs',
  'standing calf raise': 'isolation_legs',
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
  Quads: ['Leg Press', 'Hack Squat', 'Goblet Squat', 'Leg Extension'],
  Shoulders: ['Dumbbell Shoulder Press', 'Arnold Press', 'Cable Lateral Raise'],
  Arms: ['Preacher Curl', 'Hammer Curl', 'Cable Curl'],
  Triceps: ['Overhead Tricep Extension', 'Tricep Pushdown', 'Close-Grip Bench Press'],
  Biceps: ['Preacher Curl', 'Hammer Curl', 'Incline Dumbbell Curl'],
  Glutes: ['Hip Thrust', 'Bulgarian Split Squat', 'Cable Kickback', 'Glute Bridge'],
  Hamstrings: ['Lying Leg Curl', 'Seated Leg Curl', 'Romanian Deadlift', 'Nordic Curl'],
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
  // ── CHEST — horizontal push ──
  'barbell bench press': [
    { name: 'Dumbbell Bench Press', sameWeightOk: false },
    { name: 'Machine Chest Press', isMachineEquivalent: true },
    { name: 'Smith Machine Bench Press', sameWeightOk: false },
    { name: 'Push-Up', sameWeightOk: false },
  ],
  'dumbbell bench press': [
    { name: 'Barbell Bench Press', sameWeightOk: false },
    { name: 'Machine Chest Press', isMachineEquivalent: true },
    { name: 'Smith Machine Bench Press', sameWeightOk: false },
    { name: 'Push-Up', sameWeightOk: false },
  ],
  'machine chest press': [
    { name: 'Barbell Bench Press', sameWeightOk: false },
    { name: 'Dumbbell Bench Press', sameWeightOk: false },
    { name: 'Smith Machine Bench Press', sameWeightOk: false },
    { name: 'Push-Up', sameWeightOk: false },
  ],
  'smith machine bench press': [
    { name: 'Barbell Bench Press', sameWeightOk: false },
    { name: 'Dumbbell Bench Press', sameWeightOk: false },
    { name: 'Machine Chest Press', isMachineEquivalent: true },
  ],
  // ── CHEST — incline push ──
  'incline barbell press': [
    { name: 'Incline Dumbbell Press', sameWeightOk: false },
    { name: 'Incline Machine Press', isMachineEquivalent: true },
    { name: 'Smith Machine Incline Press', sameWeightOk: false },
    { name: 'Low Cable Fly', sameWeightOk: false },
  ],
  'incline barbell bench press': [
    { name: 'Incline Dumbbell Press', sameWeightOk: false },
    { name: 'Incline Machine Press', isMachineEquivalent: true },
    { name: 'Smith Machine Incline Press', sameWeightOk: false },
    { name: 'Low Cable Fly', sameWeightOk: false },
  ],
  'incline dumbbell press': [
    { name: 'Incline Barbell Press', sameWeightOk: false },
    { name: 'Incline Machine Press', isMachineEquivalent: true },
    { name: 'Smith Machine Incline Press', sameWeightOk: false },
    { name: 'Low Cable Fly', sameWeightOk: false },
  ],
  'incline machine press': [
    { name: 'Incline Barbell Press', sameWeightOk: false },
    { name: 'Incline Dumbbell Press', sameWeightOk: false },
    { name: 'Smith Machine Incline Press', sameWeightOk: false },
  ],
  // ── CHEST — fly / isolation ──
  'cable fly (high to low)': [
    { name: 'Pec Deck', isMachineEquivalent: true },
    { name: 'Dumbbell Fly', sameWeightOk: false },
    { name: 'Cable Fly (Low to High)', sameWeightOk: true },
  ],
  'cable fly (low to high)': [
    { name: 'Pec Deck', isMachineEquivalent: true },
    { name: 'Dumbbell Fly', sameWeightOk: false },
    { name: 'Cable Fly (High to Low)', sameWeightOk: true },
  ],
  'dumbbell fly': [
    { name: 'Pec Deck', isMachineEquivalent: true },
    { name: 'Cable Fly (High to Low)', sameWeightOk: false },
    { name: 'Low Cable Fly', sameWeightOk: false },
  ],
  'dumbbell chest fly': [
    { name: 'Pec Deck', isMachineEquivalent: true },
    { name: 'Cable Fly (High to Low)', sameWeightOk: false },
    { name: 'Low Cable Fly', sameWeightOk: false },
  ],
  'pec deck': [
    { name: 'Dumbbell Fly', sameWeightOk: false },
    { name: 'Cable Fly (High to Low)', sameWeightOk: false },
    { name: 'Low Cable Fly', sameWeightOk: false },
  ],
  // ── CHEST — dip ──
  dip: [
    { name: 'Machine Dip', isMachineEquivalent: true },
    { name: 'Assisted Dip Machine', isMachineEquivalent: true },
    { name: 'Barbell Bench Press', sameWeightOk: false },
    { name: 'Dumbbell Bench Press', sameWeightOk: false },
  ],
  dips: [
    { name: 'Machine Dip', isMachineEquivalent: true },
    { name: 'Assisted Dip Machine', isMachineEquivalent: true },
    { name: 'Barbell Bench Press', sameWeightOk: false },
    { name: 'Dumbbell Bench Press', sameWeightOk: false },
  ],
  // ── BACK — horizontal pull ──
  'barbell row': [
    { name: 'Barbell Row (Overhand Wide)', sameWeightOk: true },
    { name: 'Barbell Row (Underhand)', sameWeightOk: true },
    { name: 'Barbell Row (Overhand Narrow)', sameWeightOk: true },
    { name: 'T-Bar Row', sameWeightOk: false },
    { name: 'Machine Row', isMachineEquivalent: true },
  ],
  'barbell row (overhand wide)': [
    { name: 'Barbell Row (Underhand)', sameWeightOk: true },
    { name: 'Barbell Row (Overhand Narrow)', sameWeightOk: true },
    { name: 'T-Bar Row', sameWeightOk: false },
    { name: 'Dumbbell Row', sameWeightOk: false },
    { name: 'Machine Row', isMachineEquivalent: true },
  ],
  'barbell row (underhand)': [
    { name: 'Barbell Row (Overhand Wide)', sameWeightOk: true },
    { name: 'Barbell Row (Overhand Narrow)', sameWeightOk: true },
    { name: 'T-Bar Row', sameWeightOk: false },
    { name: 'Dumbbell Row', sameWeightOk: false },
    { name: 'Machine Row', isMachineEquivalent: true },
  ],
  'barbell row (overhand narrow)': [
    { name: 'Barbell Row (Overhand Wide)', sameWeightOk: true },
    { name: 'Barbell Row (Underhand)', sameWeightOk: true },
    { name: 'Dumbbell Row', sameWeightOk: false },
    { name: 'Machine Row', isMachineEquivalent: true },
  ],
  't-bar row': [
    { name: 'Barbell Row (Overhand Wide)', sameWeightOk: false },
    { name: 'Chest Supported Row', sameWeightOk: false },
    { name: 'Dumbbell Row', sameWeightOk: false },
    { name: 'Machine Row', isMachineEquivalent: true },
  ],
  'dumbbell row': [
    { name: 'Barbell Row (Overhand Wide)', sameWeightOk: false },
    { name: 'Chest Supported Row', sameWeightOk: false },
    { name: 'T-Bar Row', sameWeightOk: false },
    { name: 'Machine Row', isMachineEquivalent: true },
    { name: 'Cable Row (Close Grip)', sameWeightOk: false },
  ],
  'chest supported row': [
    { name: 'Dumbbell Row', sameWeightOk: false },
    { name: 'T-Bar Row', sameWeightOk: false },
    { name: 'Machine Row', isMachineEquivalent: true },
    { name: 'Barbell Row (Overhand Wide)', sameWeightOk: false },
  ],
  'chest-supported row': [
    { name: 'Dumbbell Row', sameWeightOk: false },
    { name: 'T-Bar Row', sameWeightOk: false },
    { name: 'Machine Row', isMachineEquivalent: true },
    { name: 'Barbell Row (Overhand Wide)', sameWeightOk: false },
  ],
  'machine row': [
    { name: 'Barbell Row (Overhand Wide)', sameWeightOk: false },
    { name: 'Dumbbell Row', sameWeightOk: false },
    { name: 'Chest Supported Row', sameWeightOk: false },
    { name: 'Cable Row (Close Grip)', sameWeightOk: false },
  ],
  'seated cable row': [
    { name: 'Cable Row (Close Grip)', sameWeightOk: true },
    { name: 'Cable Row (Wide Grip)', sameWeightOk: true },
    { name: 'Cable Row (Reverse Grip)', sameWeightOk: true },
    { name: 'Machine Row', isMachineEquivalent: true },
  ],
  'cable row (close grip)': [
    { name: 'Cable Row (Wide Grip)', sameWeightOk: true },
    { name: 'Cable Row (Reverse Grip)', sameWeightOk: true },
    { name: 'Machine Row', isMachineEquivalent: true },
    { name: 'Dumbbell Row', sameWeightOk: false },
  ],
  'cable row (wide grip)': [
    { name: 'Cable Row (Close Grip)', sameWeightOk: true },
    { name: 'Cable Row (Reverse Grip)', sameWeightOk: true },
    { name: 'Machine Row', isMachineEquivalent: true },
    { name: 'Barbell Row (Overhand Wide)', sameWeightOk: false },
  ],
  // ── BACK — vertical pull ──
  'pull-up': [
    { name: 'Lat Pulldown (Wide Grip)', sameWeightOk: false },
    { name: 'Assisted Pull-up Machine', isMachineEquivalent: true },
    { name: 'Lat Pulldown (Close Grip)', sameWeightOk: false },
    { name: 'Lat Pulldown (Reverse Grip)', sameWeightOk: false },
  ],
  'pull up': [
    { name: 'Lat Pulldown (Wide Grip)', sameWeightOk: false },
    { name: 'Assisted Pull-up Machine', isMachineEquivalent: true },
    { name: 'Lat Pulldown (Close Grip)', sameWeightOk: false },
    { name: 'Lat Pulldown (Reverse Grip)', sameWeightOk: false },
  ],
  'chin-up': [
    { name: 'Lat Pulldown (Reverse Grip)', sameWeightOk: false },
    { name: 'Assisted Pull-up Machine', isMachineEquivalent: true },
    { name: 'Pull-Up', sameWeightOk: false },
    { name: 'Lat Pulldown (Close Grip)', sameWeightOk: false },
  ],
  'chin up': [
    { name: 'Lat Pulldown (Reverse Grip)', sameWeightOk: false },
    { name: 'Assisted Pull-up Machine', isMachineEquivalent: true },
    { name: 'Pull-Up', sameWeightOk: false },
    { name: 'Lat Pulldown (Close Grip)', sameWeightOk: false },
  ],
  'lat pulldown': [
    { name: 'Lat Pulldown (Wide Grip)', sameWeightOk: true },
    { name: 'Lat Pulldown (Close Grip)', sameWeightOk: true },
    { name: 'Lat Pulldown (Reverse Grip)', sameWeightOk: true },
    { name: 'Assisted Pull-up Machine', isMachineEquivalent: true },
  ],
  'lat pulldown (wide grip)': [
    { name: 'Lat Pulldown (Close Grip)', sameWeightOk: true },
    { name: 'Lat Pulldown (Reverse Grip)', sameWeightOk: true },
    { name: 'Pull-Up', sameWeightOk: false },
    { name: 'Assisted Pull-up Machine', isMachineEquivalent: true },
  ],
  'lat pulldown (close grip)': [
    { name: 'Lat Pulldown (Wide Grip)', sameWeightOk: true },
    { name: 'Lat Pulldown (Reverse Grip)', sameWeightOk: true },
    { name: 'Pull-Up', sameWeightOk: false },
    { name: 'Chin-Up', sameWeightOk: false },
  ],
  'lat pulldown (reverse grip)': [
    { name: 'Lat Pulldown (Wide Grip)', sameWeightOk: true },
    { name: 'Lat Pulldown (Close Grip)', sameWeightOk: true },
    { name: 'Chin-Up', sameWeightOk: false },
    { name: 'Pull-Up', sameWeightOk: false },
  ],
  // ── SHOULDERS — vertical push ──
  'overhead press': [
    { name: 'Dumbbell Shoulder Press', sameWeightOk: false },
    { name: 'Machine Shoulder Press', isMachineEquivalent: true },
    { name: 'Arnold Press', sameWeightOk: false },
    { name: 'Smith Machine Press', sameWeightOk: false },
  ],
  'dumbbell shoulder press': [
    { name: 'Overhead Press', sameWeightOk: false },
    { name: 'Machine Shoulder Press', isMachineEquivalent: true },
    { name: 'Arnold Press', sameWeightOk: true },
    { name: 'Smith Machine Press', sameWeightOk: false },
  ],
  'arnold press': [
    { name: 'Dumbbell Shoulder Press', sameWeightOk: true },
    { name: 'Overhead Press', sameWeightOk: false },
    { name: 'Machine Shoulder Press', isMachineEquivalent: true },
  ],
  'machine shoulder press': [
    { name: 'Overhead Press', sameWeightOk: false },
    { name: 'Dumbbell Shoulder Press', sameWeightOk: false },
    { name: 'Arnold Press', sameWeightOk: false },
    { name: 'Smith Machine Press', sameWeightOk: false },
  ],
  // ── SHOULDERS — lateral isolation ──
  'lateral raise': [
    { name: 'Cable Lateral Raise', sameWeightOk: false },
    { name: 'Machine Lateral Raise', isMachineEquivalent: true },
    { name: 'Leaning Cable Lateral Raise', sameWeightOk: false },
  ],
  'dumbbell lateral raise': [
    { name: 'Cable Lateral Raise', sameWeightOk: false },
    { name: 'Machine Lateral Raise', isMachineEquivalent: true },
    { name: 'Leaning Cable Lateral Raise', sameWeightOk: false },
  ],
  'cable lateral raise': [
    { name: 'Lateral Raise', sameWeightOk: false },
    { name: 'Machine Lateral Raise', isMachineEquivalent: true },
    { name: 'Leaning Cable Lateral Raise', sameWeightOk: true },
  ],
  'machine lateral raise': [
    { name: 'Lateral Raise', sameWeightOk: false },
    { name: 'Cable Lateral Raise', sameWeightOk: false },
  ],
  // ── SHOULDERS — rear delt isolation ──
  'face pull': [
    { name: 'Reverse Dumbbell Fly', sameWeightOk: false },
    { name: 'Cable Rear Delt Fly', sameWeightOk: true },
    { name: 'Band Pull-Apart', sameWeightOk: false },
    { name: 'Reverse Pec Deck', isMachineEquivalent: true },
  ],
  'reverse dumbbell fly': [
    { name: 'Face Pull', sameWeightOk: false },
    { name: 'Cable Rear Delt Fly', sameWeightOk: false },
    { name: 'Reverse Pec Deck', isMachineEquivalent: true },
    { name: 'Band Pull-Apart', sameWeightOk: false },
  ],
  'cable rear delt fly': [
    { name: 'Reverse Dumbbell Fly', sameWeightOk: false },
    { name: 'Face Pull', sameWeightOk: false },
    { name: 'Reverse Pec Deck', isMachineEquivalent: true },
  ],
  // ── BICEPS — elbow flexion ──
  'barbell curl': [
    { name: 'Dumbbell Curl', sameWeightOk: false },
    { name: 'Hammer Curl', sameWeightOk: false },
    { name: 'Preacher Curl', sameWeightOk: false },
    { name: 'Cable Curl', sameWeightOk: false },
    { name: 'Machine Bicep Curl', isMachineEquivalent: true },
  ],
  'dumbbell curl': [
    { name: 'Barbell Curl', sameWeightOk: false },
    { name: 'Hammer Curl', sameWeightOk: true },
    { name: 'Incline Dumbbell Curl', sameWeightOk: true },
    { name: 'Concentration Curl', sameWeightOk: true },
    { name: 'Cable Curl', sameWeightOk: false },
  ],
  'hammer curl': [
    { name: 'Dumbbell Curl', sameWeightOk: true },
    { name: 'Cross Body Hammer Curl', sameWeightOk: true },
    { name: 'Cable Curl', sameWeightOk: false },
    { name: 'Rope Hammer Curl', sameWeightOk: false },
  ],
  'preacher curl': [
    { name: 'Barbell Curl', sameWeightOk: false },
    { name: 'Dumbbell Curl', sameWeightOk: false },
    { name: 'Machine Bicep Curl', isMachineEquivalent: true },
    { name: 'Cable Curl', sameWeightOk: false },
  ],
  'cable curl': [
    { name: 'Barbell Curl', sameWeightOk: false },
    { name: 'Dumbbell Curl', sameWeightOk: false },
    { name: 'Rope Hammer Curl', sameWeightOk: true },
    { name: 'Machine Bicep Curl', isMachineEquivalent: true },
  ],
  'concentration curl': [
    { name: 'Dumbbell Curl', sameWeightOk: true },
    { name: 'Incline Dumbbell Curl', sameWeightOk: true },
    { name: 'Cable Curl', sameWeightOk: false },
  ],
  'incline dumbbell curl': [
    { name: 'Dumbbell Curl', sameWeightOk: true },
    { name: 'Concentration Curl', sameWeightOk: true },
    { name: 'Preacher Curl', sameWeightOk: false },
    { name: 'Cable Curl', sameWeightOk: false },
  ],
  'machine bicep curl': [
    { name: 'Barbell Curl', sameWeightOk: false },
    { name: 'Dumbbell Curl', sameWeightOk: false },
    { name: 'Preacher Curl', sameWeightOk: false },
    { name: 'Cable Curl', sameWeightOk: false },
  ],
  // ── TRICEPS — elbow extension ──
  'tricep pushdown': [
    { name: 'Tricep Pushdown (Rope)', sameWeightOk: true },
    { name: 'Overhead Tricep Extension', sameWeightOk: false },
    { name: 'Skull Crusher', sameWeightOk: false },
    { name: 'Machine Tricep Extension', isMachineEquivalent: true },
  ],
  'tricep pushdown (rope)': [
    { name: 'Tricep Pushdown', sameWeightOk: true },
    { name: 'Overhead Tricep Extension', sameWeightOk: false },
    { name: 'Skull Crusher', sameWeightOk: false },
    { name: 'Machine Tricep Extension', isMachineEquivalent: true },
  ],
  'skull crusher': [
    { name: 'Overhead Tricep Extension', sameWeightOk: false },
    { name: 'Tricep Pushdown', sameWeightOk: false },
    { name: 'Close Grip Bench Press', sameWeightOk: false },
    { name: 'Machine Tricep Extension', isMachineEquivalent: true },
  ],
  'skull crushers': [
    { name: 'Overhead Tricep Extension', sameWeightOk: false },
    { name: 'Tricep Pushdown', sameWeightOk: false },
    { name: 'Close Grip Bench Press', sameWeightOk: false },
    { name: 'Machine Tricep Extension', isMachineEquivalent: true },
  ],
  'overhead tricep extension': [
    { name: 'Skull Crusher', sameWeightOk: false },
    { name: 'Tricep Pushdown', sameWeightOk: false },
    { name: 'Cable Overhead Tricep Extension', sameWeightOk: false },
    { name: 'Machine Tricep Extension', isMachineEquivalent: true },
  ],
  'close grip bench press': [
    { name: 'Skull Crusher', sameWeightOk: false },
    { name: 'Tricep Pushdown', sameWeightOk: false },
    { name: 'Machine Tricep Extension', isMachineEquivalent: true },
    { name: 'Overhead Tricep Extension', sameWeightOk: false },
  ],
  'close-grip bench press': [
    { name: 'Skull Crusher', sameWeightOk: false },
    { name: 'Tricep Pushdown', sameWeightOk: false },
    { name: 'Machine Tricep Extension', isMachineEquivalent: true },
    { name: 'Overhead Tricep Extension', sameWeightOk: false },
  ],
  'machine tricep extension': [
    { name: 'Tricep Pushdown', sameWeightOk: false },
    { name: 'Skull Crusher', sameWeightOk: false },
    { name: 'Overhead Tricep Extension', sameWeightOk: false },
    { name: 'Close Grip Bench Press', sameWeightOk: false },
  ],
  'cable overhead tricep extension': [
    { name: 'Overhead Tricep Extension', sameWeightOk: true },
    { name: 'Skull Crusher', sameWeightOk: false },
    { name: 'Tricep Pushdown', sameWeightOk: false },
  ],
  'push-up': [
    { name: 'Dumbbell Bench Press', sameWeightOk: false },
    { name: 'Machine Chest Press', isMachineEquivalent: true },
    { name: 'Barbell Bench Press', sameWeightOk: false },
  ],
  // ── DEADLIFT patterns (hip hinge) ──
  deadlift: [
    { name: 'Sumo Deadlift', sameWeightOk: true },
    { name: 'Trap Bar Deadlift', sameWeightOk: false },
    { name: 'Romanian Deadlift', sameWeightOk: false },
    { name: 'Rack Pull', sameWeightOk: false },
  ],
  'sumo deadlift': [
    { name: 'Deadlift', sameWeightOk: true },
    { name: 'Trap Bar Deadlift', sameWeightOk: false },
    { name: 'Romanian Deadlift', sameWeightOk: false },
  ],
  'trap bar deadlift': [
    { name: 'Deadlift', sameWeightOk: false },
    { name: 'Sumo Deadlift', sameWeightOk: false },
    { name: 'Romanian Deadlift', sameWeightOk: false },
  ],
  'rack pull': [
    { name: 'Deadlift', sameWeightOk: false },
    { name: 'Romanian Deadlift', sameWeightOk: false },
    { name: 'Sumo Deadlift', sameWeightOk: false },
  ],
  // ── LEGS — quad compound ──
  'back squat': [
    { name: 'Hack Squat', sameWeightOk: false },
    { name: 'Smith Machine Squat', sameWeightOk: false },
    { name: 'Front Squat', sameWeightOk: false },
    { name: 'Leg Press', sameWeightOk: false },
    { name: 'Goblet Squat', sameWeightOk: false },
  ],
  'front squat': [
    { name: 'Back Squat', sameWeightOk: false },
    { name: 'Hack Squat', sameWeightOk: false },
    { name: 'Smith Machine Squat', sameWeightOk: false },
    { name: 'Goblet Squat', sameWeightOk: false },
    { name: 'Leg Press', sameWeightOk: false },
  ],
  'hack squat': [
    { name: 'Back Squat', sameWeightOk: false },
    { name: 'Leg Press', sameWeightOk: false },
    { name: 'Smith Machine Squat', sameWeightOk: false },
    { name: 'Front Squat', sameWeightOk: false },
    { name: 'Goblet Squat', sameWeightOk: false },
  ],
  'smith machine squat': [
    { name: 'Back Squat', sameWeightOk: false },
    { name: 'Hack Squat', sameWeightOk: false },
    { name: 'Front Squat', sameWeightOk: false },
    { name: 'Leg Press', sameWeightOk: false },
    { name: 'Goblet Squat', sameWeightOk: false },
  ],
  // Quad machine / push
  'leg press': [
    { name: 'Hack Squat', sameWeightOk: false },
    { name: 'Back Squat', sameWeightOk: false },
    { name: 'Leg Press (Single Leg)', sameWeightOk: false },
    { name: 'Smith Machine Squat', sameWeightOk: false },
    { name: 'Goblet Squat', sameWeightOk: false },
  ],
  'leg press (single leg)': [
    { name: 'Leg Press', sameWeightOk: false },
    { name: 'Bulgarian Split Squat', sameWeightOk: false },
    { name: 'Hack Squat', sameWeightOk: false },
    { name: 'Walking Lunge', sameWeightOk: false },
    { name: 'Goblet Squat', sameWeightOk: false },
  ],
  'leg extension': [
    { name: 'Leg Extension (Single Leg)', sameWeightOk: false },
    { name: 'Cable Leg Extension', sameWeightOk: false },
  ],
  // Hamstring — knee flexion isolation
  'lying leg curl': [
    { name: 'Seated Leg Curl', sameWeightOk: false },
    { name: 'Standing Leg Curl', sameWeightOk: false },
    { name: 'Nordic Curl', sameWeightOk: false },
    { name: 'Swiss Ball Leg Curl', sameWeightOk: false },
  ],
  'seated leg curl': [
    { name: 'Lying Leg Curl', sameWeightOk: false },
    { name: 'Standing Leg Curl', sameWeightOk: false },
    { name: 'Nordic Curl', sameWeightOk: false },
    { name: 'Swiss Ball Leg Curl', sameWeightOk: false },
  ],
  'standing leg curl': [
    { name: 'Lying Leg Curl', sameWeightOk: false },
    { name: 'Seated Leg Curl', sameWeightOk: false },
    { name: 'Nordic Curl', sameWeightOk: false },
  ],
  'nordic curl': [
    { name: 'Lying Leg Curl', sameWeightOk: false },
    { name: 'Seated Leg Curl', sameWeightOk: false },
    { name: 'Swiss Ball Leg Curl', sameWeightOk: false },
  ],
  'nordic hamstring curl': [
    { name: 'Lying Leg Curl', sameWeightOk: false },
    { name: 'Seated Leg Curl', sameWeightOk: false },
    { name: 'Swiss Ball Leg Curl', sameWeightOk: false },
  ],
  // Hamstring — hip hinge
  'romanian deadlift': [
    { name: 'Stiff Leg Deadlift', sameWeightOk: true },
    { name: 'Single Leg RDL', sameWeightOk: false },
    { name: 'Good Morning', sameWeightOk: false },
    { name: 'Lying Leg Curl', sameWeightOk: false },
    { name: 'Seated Leg Curl', sameWeightOk: false },
  ],
  'stiff leg deadlift': [
    { name: 'Romanian Deadlift', sameWeightOk: true },
    { name: 'Single Leg RDL', sameWeightOk: false },
    { name: 'Good Morning', sameWeightOk: false },
    { name: 'Lying Leg Curl', sameWeightOk: false },
  ],
  'stiff-leg deadlift': [
    { name: 'Romanian Deadlift', sameWeightOk: true },
    { name: 'Single Leg RDL', sameWeightOk: false },
    { name: 'Good Morning', sameWeightOk: false },
    { name: 'Lying Leg Curl', sameWeightOk: false },
  ],
  // Glute-dominant / glute+quad
  'walking lunge': [
    { name: 'Bulgarian Split Squat', sameWeightOk: false },
    { name: 'Reverse Lunge', sameWeightOk: false },
    { name: 'Step Up', sameWeightOk: false },
    { name: 'Hip Thrust', sameWeightOk: false },
    { name: 'Goblet Squat', sameWeightOk: false },
  ],
  'reverse lunge': [
    { name: 'Walking Lunge', sameWeightOk: false },
    { name: 'Bulgarian Split Squat', sameWeightOk: false },
    { name: 'Step Up', sameWeightOk: false },
    { name: 'Hip Thrust', sameWeightOk: false },
  ],
  'bulgarian split squat': [
    { name: 'Walking Lunge', sameWeightOk: false },
    { name: 'Reverse Lunge', sameWeightOk: false },
    { name: 'Leg Press (Single Leg)', sameWeightOk: false },
    { name: 'Step Up', sameWeightOk: false },
    { name: 'Hip Thrust', sameWeightOk: false },
  ],
  'hip thrust': [
    { name: 'Glute Bridge', sameWeightOk: false },
    { name: 'Cable Kickback', sameWeightOk: false },
    { name: 'Bulgarian Split Squat', sameWeightOk: false },
    { name: 'Romanian Deadlift', sameWeightOk: false },
    { name: 'Step Up', sameWeightOk: false },
  ],
  'glute bridge': [
    { name: 'Hip Thrust', sameWeightOk: false },
    { name: 'Cable Kickback', sameWeightOk: false },
    { name: 'Bulgarian Split Squat', sameWeightOk: false },
  ],
  // Calves
  'calf raise': [
    { name: 'Seated Calf Raise', sameWeightOk: false },
    { name: 'Leg Press Calf Raise', sameWeightOk: false },
    { name: 'Single-Leg Calf Raise', sameWeightOk: false },
  ],
  'standing calf raise': [
    { name: 'Seated Calf Raise', sameWeightOk: false },
    { name: 'Leg Press Calf Raise', sameWeightOk: false },
    { name: 'Single-Leg Calf Raise', sameWeightOk: false },
  ],
  'seated calf raise': [
    { name: 'Calf Raise', sameWeightOk: false },
    { name: 'Leg Press Calf Raise', sameWeightOk: false },
    { name: 'Single-Leg Calf Raise', sameWeightOk: false },
  ],
  // Goblet / unilateral quad
  'goblet squat': [
    { name: 'Back Squat', sameWeightOk: false },
    { name: 'Hack Squat', sameWeightOk: false },
    { name: 'Leg Press', sameWeightOk: false },
    { name: 'Bulgarian Split Squat', sameWeightOk: false },
    { name: 'Leg Extension', sameWeightOk: false },
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

/** Spec exercises not yet in the library — logged once at module load for review. */
const SWAP_SPEC_PENDING_LIBRARY: string[] = [];

function warnMissingSwapPoolTargets(): void {
  const missingFromPool = new Set<string>();
  for (const entries of Object.values(SWAP_POOL)) {
    for (const entry of entries) {
      if (!isInExerciseLibrary(entry.name)) {
        missingFromPool.add(entry.name);
      }
    }
  }
  for (const name of missingFromPool) {
    console.warn(
      `[exerciseSwap] SWAP_POOL target "${name}" is not in exercise library — candidates will be skipped`,
    );
  }
  for (const name of SWAP_SPEC_PENDING_LIBRARY) {
    if (!isInExerciseLibrary(name)) {
      console.warn(
        `[exerciseSwap] "${name}" is in the swap spec but not in exercise library — add to exerciseLibrary.ts to enable`,
      );
    }
  }
}

function filterPoolEntries(
  sourceName: string,
  entries: SwapPoolEntry[],
): SwapPoolEntry[] {
  const selfNorm = normalizeExerciseName(sourceName);
  return entries.filter((entry) => {
    const norm = normalizeExerciseName(entry.name);
    if (norm === selfNorm) return false;
    if (!isInExerciseLibrary(entry.name)) return false;
    return true;
  });
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
    return filterPoolEntries(exerciseName, poolEntries)
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

warnMissingSwapPoolTargets();

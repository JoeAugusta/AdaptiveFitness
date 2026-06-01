/** Display-name → category for Strength Progression chart filters (S13). */
export const MUSCLE_GROUP_MAP: Record<string, string> = {
  'Barbell Bench Press': 'Chest',
  'Incline Barbell Press': 'Chest',
  'Incline Barbell Bench Press': 'Chest',
  'Dumbbell Bench Press': 'Chest',
  'Incline Dumbbell Press': 'Chest',
  'Close Grip Bench Press': 'Chest',
  'Close-Grip Bench Press': 'Arms',
  'Cable Fly (High to Low)': 'Chest',
  'Cable Fly (Low to High)': 'Chest',
  'Cable Fly (Mid Cable)': 'Chest',
  Dip: 'Chest',

  'Barbell Row (Overhand Wide)': 'Back',
  'Barbell Row (Underhand)': 'Back',
  'T-Bar Row': 'Back',
  'Dumbbell Row': 'Back',
  'Lat Pulldown (Wide Grip)': 'Back',
  'Lat Pulldown (Close Grip)': 'Back',
  'Cable Row (Close Grip)': 'Back',
  'Cable Row (Wide Grip)': 'Back',
  'Pull-up': 'Back',
  'Pull-Up': 'Back',
  Deadlift: 'Back',
  'Conventional Deadlift': 'Back',
  'Sumo Deadlift': 'Back',
  'Hex Bar Deadlift': 'Back',

  'Overhead Press': 'Shoulders',
  'Dumbbell Shoulder Press': 'Shoulders',
  'Arnold Press': 'Shoulders',
  'Lateral Raise': 'Shoulders',
  'Dumbbell Lateral Raise': 'Shoulders',
  'Cable Lateral Raise': 'Shoulders',
  'Face Pulls': 'Shoulders',
  'Rear Delt Fly': 'Shoulders',

  'Barbell Curl': 'Arms',
  'Dumbbell Bicep Curl': 'Arms',
  'Hammer Curl': 'Arms',
  'Preacher Curl': 'Arms',
  'Cable Curl': 'Arms',
  'Tricep Pushdown (Rope)': 'Arms',
  'Tricep Pushdown (V-Bar)': 'Arms',
  'Skull Crusher': 'Arms',
  'Overhead Tricep Extension': 'Arms',

  'Back Squat': 'Legs',
  'Front Squat': 'Legs',
  'Romanian Deadlift': 'Legs',
  'Stiff Leg Deadlift': 'Legs',
  'Leg Press': 'Legs',
  'Bulgarian Split Squat': 'Legs',
  'Walking Lunge': 'Legs',
  'Lying Leg Curl': 'Legs',
  'Seated Leg Curl': 'Legs',
  'Leg Curl': 'Legs',
  'Leg Extension': 'Legs',
  'Hip Thrust': 'Legs',
  'Glute Bridge': 'Legs',
  'Good Morning': 'Legs',
  'Calf Raise': 'Legs',

  Plank: 'Core',
  'Cable Crunch': 'Core',
  'Russian Twist': 'Core',
  'Hanging Leg Raise': 'Core',
};

export const STRENGTH_CATEGORY_CHIPS = [
  'All',
  'Chest',
  'Back',
  'Shoulders',
  'Arms',
  'Legs',
  'Core',
] as const;

export type StrengthCategoryChip = (typeof STRENGTH_CATEGORY_CHIPS)[number];

export function getMuscleCategoryForExercise(exerciseName: string): string {
  const trimmed = String(exerciseName ?? '').trim();
  if (!trimmed) return 'Other';
  return MUSCLE_GROUP_MAP[trimmed] ?? 'Other';
}

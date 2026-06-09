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
  'Incline Cable Fly': 'Chest',
  'Dumbbell Fly': 'Chest',
  'Chest Dip': 'Chest',
  Dip: 'Chest',

  'Barbell Row (Overhand Wide)': 'Back',
  'Barbell Row (Underhand)': 'Back',
  'T-Bar Row': 'Back',
  'Dumbbell Row': 'Back',
  'Lat Pulldown (Wide Grip)': 'Back',
  'Lat Pulldown (Close Grip)': 'Back',
  'Cable Row (Close Grip)': 'Back',
  'Cable Row (Wide Grip)': 'Back',
  'Seated Cable Row': 'Back',
  'Cable Pullover': 'Back',
  'Pull-up': 'Back',
  'Pull-Up': 'Back',
  'Weighted Pull-up': 'Back',
  Deadlift: 'Back',
  'Conventional Deadlift': 'Back',
  'Sumo Deadlift': 'Back',
  'Hex Bar Deadlift': 'Back',
  'Trap Bar Deadlift': 'Back',
  'Back Extension': 'Back',
  'Rack Pull': 'Back',

  'Overhead Press': 'Shoulders',
  'Dumbbell Shoulder Press': 'Shoulders',
  'Arnold Press': 'Shoulders',
  'Lateral Raise': 'Shoulders',
  'Dumbbell Lateral Raise': 'Shoulders',
  'Cable Lateral Raise': 'Shoulders',
  'Face Pulls': 'Shoulders',
  'Face Pull': 'Shoulders',
  'Rear Delt Fly': 'Shoulders',
  'Reverse Fly': 'Shoulders',
  Shrug: 'Shoulders',
  Shrugs: 'Shoulders',
  'Upright Row': 'Shoulders',

  'Barbell Curl': 'Arms',
  'Dumbbell Bicep Curl': 'Arms',
  'Hammer Curl': 'Arms',
  'Preacher Curl': 'Arms',
  'Cable Curl': 'Arms',
  'Cable Hammer Curl': 'Arms',
  'Incline Dumbbell Curl': 'Arms',
  'Tricep Pushdown (Rope)': 'Arms',
  'Tricep Pushdown (V-Bar)': 'Arms',
  'Skull Crusher': 'Arms',
  'Skull Crushers': 'Arms',
  'Overhead Tricep Extension': 'Arms',

  'Back Squat': 'Legs',
  'Front Squat': 'Legs',
  'Safety Bar Squat': 'Legs',
  'Hack Squat': 'Legs',
  'Leg Press': 'Legs',
  'Romanian Deadlift': 'Legs',
  'Stiff Leg Deadlift': 'Legs',
  'Bulgarian Split Squat': 'Legs',
  'Walking Lunge': 'Legs',
  'Walking Lunges': 'Legs',
  'Lying Leg Curl': 'Legs',
  'Seated Leg Curl': 'Legs',
  'Leg Curl': 'Legs',
  'Leg Extension': 'Legs',
  'Hip Thrust': 'Legs',
  'Glute Bridge': 'Legs',
  'Good Morning': 'Legs',
  'Cable Pull-Through': 'Legs',
  'Calf Raise': 'Legs',
  'Seated Calf Raise': 'Legs',
  'Standing Calf Raise': 'Legs',
  'Abduction Machine': 'Legs',
  'Hip Abduction': 'Legs',

  Plank: 'Core',
  'Cable Crunch': 'Core',
  'Ab Wheel': 'Core',
  'Russian Twist': 'Core',
  'Hanging Leg Raise': 'Core',

  'Cable Front Raise': 'Shoulders',
};

const LIBRARY_MUSCLE_TO_VOLUME: Record<string, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  biceps: 'Arms',
  triceps: 'Arms',
  legs: 'Legs',
  quads: 'Legs',
  quadriceps: 'Legs',
  hamstrings: 'Legs',
  glutes: 'Legs',
  calves: 'Legs',
  core: 'Core',
  traps: 'Back',
  forearms: 'Arms',
};

function titleCaseCategory(raw: string): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  if (t.toLowerCase() === 'other') return '';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** Collapse a plan's granular muscleGroup (e.g. "Triceps", "Quads") to a display bucket. */
export function collapseToVolumeBucket(muscle: string): string {
  const key = String(muscle ?? '').trim().toLowerCase();
  if (LIBRARY_MUSCLE_TO_VOLUME[key]) return LIBRARY_MUSCLE_TO_VOLUME[key];
  const title = titleCaseCategory(muscle);
  return title || 'Shoulders';
}

/** Keyword fallback when exercise name is not in MUSCLE_GROUP_MAP. */
export function keywordFallbackMuscleGroup(name: string): string {
  const n = name.toLowerCase();
  if (
    n.includes('squat') ||
    n.includes('lunge') ||
    n.includes('leg') ||
    n.includes('hip') ||
    n.includes('glute') ||
    n.includes('calf') ||
    n.includes('deadlift') ||
    n.includes('rdl')
  ) {
    return 'Legs';
  }
  if (
    n.includes('shoulder') || n.includes('delt') || n.includes('lateral raise') ||
    n.includes('front raise') || n.includes('rear delt') || n.includes('shrug') ||
    n.includes('overhead') || n.includes('face pull')
  ) {
    return 'Shoulders';
  }
  if (
    n.includes('press') ||
    n.includes('fly') ||
    n.includes('chest') ||
    n.includes('pec') ||
    n.includes('dip')
  ) {
    return 'Chest';
  }
  if (
    n.includes('row') ||
    n.includes('pulldown') ||
    n.includes('pull-up') ||
    n.includes('pullup') ||
    n.includes('lat ') ||
    n.includes('back')
  ) {
    return 'Back';
  }
  if (
    n.includes('curl') ||
    n.includes('tricep') ||
    n.includes('bicep') ||
    n.includes('extension') ||
    n.includes('pushdown')
  ) {
    return 'Arms';
  }
  if (
    n.includes('plank') ||
    n.includes('crunch') ||
    n.includes(' ab') ||
    n.includes('core') ||
    n.includes('twist') ||
    (n.includes('raise') && n.includes('leg'))
  ) {
    return 'Core';
  }
  return 'Full Body';
}

/**
 * Resolve muscle group for Weekly Volume — map → library → keywords → Full Body.
 * Never returns "Other".
 */
export function resolveWeeklyVolumeMuscleGroup(
  exerciseName: string,
  libraryMuscle?: string | null,
): string {
  const trimmed = String(exerciseName ?? '').trim();
  if (trimmed && MUSCLE_GROUP_MAP[trimmed]) {
    return MUSCLE_GROUP_MAP[trimmed];
  }

  const libKey = String(libraryMuscle ?? '').trim().toLowerCase();
  if (libKey && LIBRARY_MUSCLE_TO_VOLUME[libKey]) {
    return LIBRARY_MUSCLE_TO_VOLUME[libKey];
  }
  const libTitle = titleCaseCategory(libraryMuscle ?? '');
  if (libTitle && libTitle !== 'Other') {
    return libTitle;
  }

  if (trimmed) {
    return keywordFallbackMuscleGroup(trimmed);
  }
  return 'Full Body';
}

/** Returns null when the exercise is not mapped — for strength chart category chips only. */
export function getMuscleCategoryForExercise(
  exerciseName: string,
): string | null {
  const trimmed = String(exerciseName ?? '').trim();
  if (!trimmed) return null;
  return MUSCLE_GROUP_MAP[trimmed] ?? null;
}

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

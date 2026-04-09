/**
 * Hardcoded exercise library — movement patterns, rotation groups, and swap metadata.
 * Display fields (primaryMuscle, secondaryMuscles, category compound/isolation) are unchanged for UI.
 */

import { DEFAULT_EXERCISE_CUES, EXERCISE_CUES } from './exerciseLibraryCues';

export type MovementPattern =
  | 'horizontal_push'
  | 'horizontal_pull'
  | 'vertical_push'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'carry'
  | 'core_anti_extension'
  | 'core_anti_rotation'
  | 'isolation_push'
  | 'isolation_pull'
  | 'isolation_legs'
  | 'isolation_shoulders';

/** Programming category (distinct from legacy `category` compound/isolation). */
export type CompoundTier = 'primary_compound' | 'secondary_compound' | 'isolation';

export interface Exercise {
  id: string;
  name: string;
  primaryMuscle: string;
  /** Human-readable; shown in UI */
  secondaryMuscles: string[];
  equipment: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band';
  category: 'compound' | 'isolation';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  /** Snake_case muscle tags for logic / rotation */
  secondaryMuscleTags: string[];
  movementPattern: MovementPattern;
  compoundTier: CompoundTier;
  rotationGroup: string;
  rotationPriority: number;
  usesWeight: boolean;
  /** Three setup / execution bullets for in-workout coaching */
  cues: string[];
}

const E = (
  base: Omit<
    Exercise,
    | 'secondaryMuscleTags'
    | 'movementPattern'
    | 'compoundTier'
    | 'rotationGroup'
    | 'rotationPriority'
    | 'usesWeight'
    | 'cues'
  >,
  arg2: { usesWeight?: boolean } | Pick<
    Exercise,
    'secondaryMuscleTags' | 'movementPattern' | 'compoundTier' | 'rotationGroup' | 'rotationPriority'
  >,
  arg3?: Pick<
    Exercise,
    'secondaryMuscleTags' | 'movementPattern' | 'compoundTier' | 'rotationGroup' | 'rotationPriority'
  >,
): Exercise => {
  const hasOpts = arg3 !== undefined;
  const opts = (hasOpts ? arg2 : undefined) as { usesWeight?: boolean } | undefined;
  const meta = (hasOpts ? arg3 : arg2) as Pick<
    Exercise,
    'secondaryMuscleTags' | 'movementPattern' | 'compoundTier' | 'rotationGroup' | 'rotationPriority'
  >;
  const cueTuple = EXERCISE_CUES[base.id] ?? DEFAULT_EXERCISE_CUES;
  return {
    ...base,
    ...meta,
    usesWeight: opts?.usesWeight ?? base.equipment !== 'bodyweight',
    cues: [...cueTuple],
  };
};

export const EXERCISES: Exercise[] = [
  E(
    { id: 'c01', name: 'Barbell Bench Press', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'primary_compound', movementPattern: 'horizontal_push', rotationGroup: 'bench_press', rotationPriority: 1, secondaryMuscleTags: ['triceps', 'front_delts'] },
  ),
  E(
    { id: 'c02', name: 'Incline Barbell Bench Press', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders', 'Triceps'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'incline_press', rotationPriority: 1, secondaryMuscleTags: ['front_delts', 'triceps'] },
  ),
  E(
    { id: 'c03', name: 'Dumbbell Bench Press', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'bench_press', rotationPriority: 2, secondaryMuscleTags: ['triceps', 'front_delts'] },
  ),
  E(
    { id: 'c04', name: 'Incline Dumbbell Press', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders', 'Triceps'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'incline_press', rotationPriority: 2, secondaryMuscleTags: ['front_delts', 'triceps'] },
  ),
  E(
    { id: 'c05', name: 'Cable Chest Fly', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders'], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_push', rotationGroup: 'chest_isolation', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'c06', name: 'Dumbbell Chest Fly', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_push', rotationGroup: 'chest_isolation', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'c07', name: 'Machine Chest Press', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps'], equipment: 'machine', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'bench_press', rotationPriority: 4, secondaryMuscleTags: ['triceps', 'front_delts'] },
  ),
  E(
    { id: 'c08', name: 'Push-Up', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps', 'Core'], equipment: 'bodyweight', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'pushup', rotationPriority: 1, secondaryMuscleTags: ['triceps', 'front_delts', 'core'] },
  ),
  E(
    { id: 'c09', name: 'Decline Bench Press', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'bench_press', rotationPriority: 5, secondaryMuscleTags: ['triceps', 'front_delts'] },
  ),

  E(
    { id: 'b01', name: 'Barbell Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'primary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'barbell_row', rotationPriority: 1, secondaryMuscleTags: ['biceps', 'rear_delts', 'core'] },
  ),
  E(
    { id: 'b02', name: 'Deadlift', primaryMuscle: 'Back', secondaryMuscles: ['Hamstrings', 'Glutes', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'advanced' },
    { compoundTier: 'primary_compound', movementPattern: 'hinge', rotationGroup: 'deadlift', rotationPriority: 1, secondaryMuscleTags: ['glutes', 'hamstrings', 'upper_back', 'core'] },
  ),
  E(
    { id: 'b03', name: 'Pull-Up', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Core'], equipment: 'bodyweight', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'primary_compound', movementPattern: 'vertical_pull', rotationGroup: 'pullup', rotationPriority: 1, secondaryMuscleTags: ['biceps', 'core'] },
  ),
  E(
    { id: 'b04', name: 'Lat Pulldown', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'cable', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'vertical_pull', rotationGroup: 'pulldown', rotationPriority: 1, secondaryMuscleTags: ['biceps'] },
  ),
  E(
    { id: 'b05', name: 'Seated Cable Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Traps'], equipment: 'cable', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'cable_row', rotationPriority: 1, secondaryMuscleTags: ['biceps', 'rear_delts'] },
  ),
  E(
    { id: 'b06', name: 'Dumbbell Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'dumbbell_row', rotationPriority: 1, secondaryMuscleTags: ['biceps', 'rear_delts'] },
  ),
  E(
    { id: 'b07', name: 'T-Bar Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'primary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'barbell_row', rotationPriority: 3, secondaryMuscleTags: ['biceps', 'rear_delts', 'core'] },
  ),
  E(
    { id: 'b08', name: 'Chin-Up', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'bodyweight', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'primary_compound', movementPattern: 'vertical_pull', rotationGroup: 'pullup', rotationPriority: 2, secondaryMuscleTags: ['biceps'] },
  ),
  E(
    { id: 'b09', name: 'Machine Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'machine', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'cable_row', rotationPriority: 2, secondaryMuscleTags: ['biceps', 'rear_delts'] },
  ),

  E(
    { id: 's01', name: 'Overhead Press', primaryMuscle: 'Shoulders', secondaryMuscles: ['Triceps', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'primary_compound', movementPattern: 'vertical_push', rotationGroup: 'overhead_press', rotationPriority: 1, secondaryMuscleTags: ['triceps', 'upper_traps', 'core'] },
  ),
  E(
    { id: 's02', name: 'Dumbbell Shoulder Press', primaryMuscle: 'Shoulders', secondaryMuscles: ['Triceps'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'vertical_push', rotationGroup: 'overhead_press', rotationPriority: 2, secondaryMuscleTags: ['triceps'] },
  ),
  E(
    { id: 's03', name: 'Dumbbell Lateral Raise', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'lateral_delt', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's04', name: 'Cable Lateral Raise', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps'], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'lateral_delt', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's05', name: 'Face Pull', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps', 'Back'], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_pull', rotationGroup: 'rear_delt_isolation', rotationPriority: 1, secondaryMuscleTags: ['rear_delts'] },
  ),
  E(
    { id: 's06', name: 'Reverse Dumbbell Fly', primaryMuscle: 'Shoulders', secondaryMuscles: ['Back', 'Traps'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_pull', rotationGroup: 'rear_delt_isolation', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's07', name: 'Arnold Press', primaryMuscle: 'Shoulders', secondaryMuscles: ['Triceps'], equipment: 'dumbbell', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'secondary_compound', movementPattern: 'vertical_push', rotationGroup: 'overhead_press', rotationPriority: 3, secondaryMuscleTags: ['triceps', 'front_delts'] },
  ),
  E(
    { id: 's08', name: 'Machine Shoulder Press', primaryMuscle: 'Shoulders', secondaryMuscles: ['Triceps'], equipment: 'machine', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'vertical_push', rotationGroup: 'overhead_press', rotationPriority: 4, secondaryMuscleTags: ['triceps'] },
  ),

  E(
    { id: 'bi01', name: 'Barbell Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'barbell', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'bi02', name: 'Dumbbell Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'bi03', name: 'Hammer Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 3, secondaryMuscleTags: ['brachialis'] },
  ),
  E(
    { id: 'bi04', name: 'Preacher Curl', primaryMuscle: 'Biceps', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 5, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'bi05', name: 'Cable Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 6, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'bi06', name: 'Incline Dumbbell Curl', primaryMuscle: 'Biceps', secondaryMuscles: [], equipment: 'dumbbell', category: 'isolation', difficulty: 'intermediate' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 4, secondaryMuscleTags: [] },
  ),

  E(
    { id: 'tr01', name: 'Tricep Pushdown', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_pushdown', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr02', name: 'Overhead Tricep Extension', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_extension', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr03', name: 'Skull Crushers', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'intermediate' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_extension', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr04', name: 'Close-Grip Bench Press', primaryMuscle: 'Triceps', secondaryMuscles: ['Chest', 'Shoulders'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'bench_press', rotationPriority: 3, secondaryMuscleTags: ['triceps'] },
  ),
  E(
    { id: 'tr05', name: 'Dumbbell Tricep Kickback', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_extension', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr06', name: 'Dips', primaryMuscle: 'Triceps', secondaryMuscles: ['Chest', 'Shoulders'], equipment: 'bodyweight', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'dip', rotationPriority: 1, secondaryMuscleTags: ['chest', 'front_delts'] },
  ),

  E(
    { id: 'q01', name: 'Back Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'primary_compound', movementPattern: 'squat', rotationGroup: 'squat', rotationPriority: 1, secondaryMuscleTags: ['glutes', 'hamstrings', 'core'] },
  ),
  E(
    { id: 'q02', name: 'Front Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Core', 'Glutes'], equipment: 'barbell', category: 'compound', difficulty: 'advanced' },
    { compoundTier: 'primary_compound', movementPattern: 'squat', rotationGroup: 'squat', rotationPriority: 2, secondaryMuscleTags: ['core', 'glutes'] },
  ),
  E(
    { id: 'q03', name: 'Leg Press', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes'], equipment: 'machine', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'squat', rotationGroup: 'leg_press', rotationPriority: 1, secondaryMuscleTags: ['glutes'] },
  ),
  E(
    { id: 'q04', name: 'Leg Extension', primaryMuscle: 'Quads', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'quad_isolation', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'q05', name: 'Hack Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes'], equipment: 'machine', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'secondary_compound', movementPattern: 'squat', rotationGroup: 'squat', rotationPriority: 4, secondaryMuscleTags: ['glutes'] },
  ),
  E(
    { id: 'q06', name: 'Bulgarian Split Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes', 'Core'], equipment: 'dumbbell', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'secondary_compound', movementPattern: 'lunge', rotationGroup: 'split_squat', rotationPriority: 1, secondaryMuscleTags: ['glutes', 'hamstrings', 'core'] },
  ),
  E(
    { id: 'q07', name: 'Goblet Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Core', 'Glutes'], equipment: 'kettlebell', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'squat', rotationGroup: 'squat', rotationPriority: 3, secondaryMuscleTags: ['core', 'glutes'] },
  ),
  E(
    { id: 'q08', name: 'Walking Lunge', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes', 'Hamstrings'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'lunge', rotationGroup: 'lunge', rotationPriority: 3, secondaryMuscleTags: ['glutes', 'hamstrings'] },
  ),

  E(
    { id: 'h01', name: 'Romanian Deadlift', primaryMuscle: 'Hamstrings', secondaryMuscles: ['Glutes', 'Back'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'rdl', rotationPriority: 1, secondaryMuscleTags: ['glutes', 'lower_back'] },
  ),
  E(
    { id: 'h02', name: 'Leg Curl', primaryMuscle: 'Hamstrings', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'hamstring_isolation', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'h03', name: 'Stiff-Leg Deadlift', primaryMuscle: 'Hamstrings', secondaryMuscles: ['Glutes', 'Back'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'rdl', rotationPriority: 2, secondaryMuscleTags: ['lower_back', 'glutes'] },
  ),
  E(
    { id: 'h04', name: 'Dumbbell Romanian Deadlift', primaryMuscle: 'Hamstrings', secondaryMuscles: ['Glutes'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'rdl', rotationPriority: 4, secondaryMuscleTags: ['glutes'] },
  ),
  E(
    { id: 'h05', name: 'Nordic Hamstring Curl', primaryMuscle: 'Hamstrings', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'advanced' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'hamstring_isolation', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'h06', name: 'Kettlebell Swing', primaryMuscle: 'Hamstrings', secondaryMuscles: ['Glutes', 'Core', 'Back'], equipment: 'kettlebell', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'kettlebell_swing', rotationPriority: 1, secondaryMuscleTags: ['glutes', 'core', 'back'] },
  ),

  E(
    { id: 'g01', name: 'Hip Thrust', primaryMuscle: 'Glutes', secondaryMuscles: ['Hamstrings'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'hip_thrust', rotationPriority: 1, secondaryMuscleTags: ['hamstrings', 'core'] },
  ),
  E(
    { id: 'g02', name: 'Glute Bridge', primaryMuscle: 'Glutes', secondaryMuscles: ['Hamstrings'], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'hinge', rotationGroup: 'glute_bridge', rotationPriority: 1, secondaryMuscleTags: ['hamstrings'] },
  ),
  E(
    { id: 'g03', name: 'Cable Pull-Through', primaryMuscle: 'Glutes', secondaryMuscles: ['Hamstrings'], equipment: 'cable', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'hip_thrust', rotationPriority: 2, secondaryMuscleTags: ['hamstrings'] },
  ),
  E(
    { id: 'g04', name: 'Sumo Deadlift', primaryMuscle: 'Glutes', secondaryMuscles: ['Quads', 'Hamstrings', 'Back'], equipment: 'barbell', category: 'compound', difficulty: 'advanced' },
    { compoundTier: 'primary_compound', movementPattern: 'hinge', rotationGroup: 'deadlift', rotationPriority: 2, secondaryMuscleTags: ['glutes', 'adductors', 'quads', 'back'] },
  ),
  E(
    { id: 'g05', name: 'Cable Kickback', primaryMuscle: 'Glutes', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'glute_isolation', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'g06', name: 'Banded Hip Thrust', primaryMuscle: 'Glutes', secondaryMuscles: ['Hamstrings'], equipment: 'band', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'hip_thrust', rotationPriority: 3, secondaryMuscleTags: ['hamstrings'] },
  ),

  E(
    { id: 'cv01', name: 'Standing Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'calf_isolation', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'cv02', name: 'Seated Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'calf_isolation', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'cv03', name: 'Dumbbell Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'calf_isolation', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'cv04', name: 'Leg Press Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'calf_isolation', rotationPriority: 4, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'cv05', name: 'Bodyweight Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'calf_isolation', rotationPriority: 5, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'cv06', name: 'Smith Machine Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'calf_isolation', rotationPriority: 6, secondaryMuscleTags: [] },
  ),

  E(
    { id: 'co01', name: 'Plank', primaryMuscle: 'Core', secondaryMuscles: ['Shoulders'], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'core_anti_extension', rotationGroup: 'plank', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'co02', name: 'Hanging Leg Raise', primaryMuscle: 'Core', secondaryMuscles: ['Forearms'], equipment: 'bodyweight', category: 'isolation', difficulty: 'intermediate' },
    { compoundTier: 'isolation', movementPattern: 'core_anti_extension', rotationGroup: 'leg_raise', rotationPriority: 1, secondaryMuscleTags: ['forearms'] },
  ),
  E(
    { id: 'co03', name: 'Cable Crunch', primaryMuscle: 'Core', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'core_anti_extension', rotationGroup: 'crunch', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'co04', name: 'Ab Wheel Rollout', primaryMuscle: 'Core', secondaryMuscles: ['Shoulders'], equipment: 'bodyweight', category: 'isolation', difficulty: 'advanced' },
    { compoundTier: 'secondary_compound', movementPattern: 'core_anti_extension', rotationGroup: 'plank', rotationPriority: 2, secondaryMuscleTags: ['lats', 'shoulders'] },
  ),
  E(
    { id: 'co05', name: 'Russian Twist', primaryMuscle: 'Core', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'core_anti_rotation', rotationGroup: 'russian_twist', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'co06', name: 'Pallof Press', primaryMuscle: 'Core', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'intermediate' },
    { usesWeight: false },
    { compoundTier: 'secondary_compound', movementPattern: 'core_anti_rotation', rotationGroup: 'pallof', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'co07', name: 'Dead Bug', primaryMuscle: 'Core', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'core_anti_extension', rotationGroup: 'dead_bug', rotationPriority: 1, secondaryMuscleTags: [] },
  ),

  E(
    { id: 'tp01', name: 'Barbell Shrug', primaryMuscle: 'Traps', secondaryMuscles: ['Shoulders'], equipment: 'barbell', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'shrug', rotationPriority: 1, secondaryMuscleTags: ['shoulders'] },
  ),
  E(
    { id: 'tp02', name: 'Dumbbell Shrug', primaryMuscle: 'Traps', secondaryMuscles: ['Shoulders'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'shrug', rotationPriority: 2, secondaryMuscleTags: ['shoulders'] },
  ),
  E(
    { id: 'tp03', name: 'Upright Row', primaryMuscle: 'Traps', secondaryMuscles: ['Shoulders'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
    { compoundTier: 'secondary_compound', movementPattern: 'vertical_pull', rotationGroup: 'upright_row', rotationPriority: 1, secondaryMuscleTags: ['shoulders', 'biceps'] },
  ),
  E(
    { id: 'tp04', name: 'Cable Shrug', primaryMuscle: 'Traps', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'shrug', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tp05', name: 'Farmer Carry', primaryMuscle: 'Traps', secondaryMuscles: ['Core', 'Forearms'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner' },
    { compoundTier: 'secondary_compound', movementPattern: 'carry', rotationGroup: 'farmer_carry', rotationPriority: 1, secondaryMuscleTags: ['core', 'forearms'] },
  ),
  E(
    { id: 'tp06', name: 'Kettlebell Shrug', primaryMuscle: 'Traps', secondaryMuscles: [], equipment: 'kettlebell', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'shrug', rotationPriority: 4, secondaryMuscleTags: [] },
  ),

  E(
    { id: 'f01', name: 'Wrist Curl', primaryMuscle: 'Forearms', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'forearm_wrist', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'f02', name: 'Reverse Wrist Curl', primaryMuscle: 'Forearms', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'forearm_wrist', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'f03', name: 'Reverse Curl', primaryMuscle: 'Forearms', secondaryMuscles: ['Biceps'], equipment: 'barbell', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'forearm_curl', rotationPriority: 1, secondaryMuscleTags: ['biceps'] },
  ),
  E(
    { id: 'f04', name: 'Plate Pinch Hold', primaryMuscle: 'Forearms', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'intermediate' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'grip_hold', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'f05', name: 'Dumbbell Wrist Curl', primaryMuscle: 'Forearms', secondaryMuscles: [], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'forearm_wrist', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'f06', name: 'Band Wrist Extension', primaryMuscle: 'Forearms', secondaryMuscles: [], equipment: 'band', category: 'isolation', difficulty: 'beginner' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'forearm_wrist', rotationPriority: 4, secondaryMuscleTags: [] },
  ),
];

export function getCuesForExerciseName(name: string): string[] {
  const e = EXERCISES.find(
    (x) => x.name.toLowerCase().trim() === String(name).toLowerCase().trim(),
  );
  return e ? [...e.cues] : [...DEFAULT_EXERCISE_CUES];
}

export function getRotationCandidates(
  exerciseId: string,
  exercises: Exercise[],
  excludedIds: string[],
  maxDifficulty: 'beginner' | 'intermediate' | 'advanced',
): Exercise[] {
  const current = exercises.find((e) => e.id === exerciseId);
  if (!current) return [];

  const difficultyOrder = ['beginner', 'intermediate', 'advanced'] as const;
  const maxLevel = difficultyOrder.indexOf(maxDifficulty);

  return exercises
    .filter(
      (e) =>
        e.rotationGroup === current.rotationGroup &&
        e.id !== exerciseId &&
        !excludedIds.includes(e.id) &&
        difficultyOrder.indexOf(e.difficulty) <= maxLevel,
    )
    .sort((a, b) => a.rotationPriority - b.rotationPriority);
}

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
  /** GAP-7: Sub-muscle tag for plateau rotation — must match taxonomy strings */
  muscleEmphasis: string;
  usesWeight: boolean;
  /** True when exercise is performed one side at a time (reps are per-side). */
  isUnilateral: boolean;
  /** Three setup / execution bullets for in-workout coaching */
  cues: string[];
  /** Grip or attachment variant e.g. 'Rope', 'Wide Grip', 'Reverse Grip' */
  gripVariant?: string;
}

// BUG-5: Unilateral exercise handling — IDs of exercises performed one side at a time.
const UNILATERAL_IDS = new Set([
  'q06', // Bulgarian Split Squat
  'q08', // Walking Lunge
  'q10', // Leg Press (Single Leg)
  'q11', // Reverse Lunge
  'q12', // Step Up
  'q13', // Leg Extension (Single Leg)
  'cv07', // Single-Leg Calf Raise
  'h11', // Single Leg RDL
  'b06', // Dumbbell Row (ambiguous → unilateral per safety rule)
  'g05', // Cable Kickback
  'g09', // Donkey Kick
  's04', // Cable Lateral Raise (single-arm cable)
  'bi02', // Dumbbell Curl
  'bi03', // Hammer Curl
  'bi06', // Incline Dumbbell Curl
  'tr05', // Dumbbell Tricep Kickback
  'co06', // Pallof Press
  'b05d', // Cable Row (Single Arm)
  'tr02b', // Overhead Tricep Extension (Single Arm)
]);

const E = (
  base: Omit<
    Exercise,
    | 'secondaryMuscleTags'
    | 'movementPattern'
    | 'compoundTier'
    | 'rotationGroup'
    | 'rotationPriority'
    | 'usesWeight'
    | 'isUnilateral'
    | 'cues'
    | 'muscleEmphasis'
  > &
    Pick<Exercise, 'muscleEmphasis'> & { gripVariant?: string },
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
    isUnilateral: UNILATERAL_IDS.has(base.id),
    cues: [...cueTuple],
  };
};

export const EXERCISES: Exercise[] = [
  E(
    { id: 'c01', name: 'Barbell Bench Press', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'mid_chest' },
    { compoundTier: 'primary_compound', movementPattern: 'horizontal_push', rotationGroup: 'bench_press', rotationPriority: 1, secondaryMuscleTags: ['triceps', 'front_delts'] },
  ),
  E(
    { id: 'c01a', name: 'Bench Press (Wide Grip)', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'mid_chest', gripVariant: 'Wide Grip' },
    { compoundTier: 'primary_compound', movementPattern: 'horizontal_push', rotationGroup: 'bench_press', rotationPriority: 2, secondaryMuscleTags: ['front_delts', 'triceps'] },
  ),
  E(
    { id: 'c01b', name: 'Bench Press (Reverse Grip)', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders'], equipment: 'barbell', category: 'compound', difficulty: 'advanced', muscleEmphasis: 'upper_chest', gripVariant: 'Reverse Grip' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'bench_press', rotationPriority: 6, secondaryMuscleTags: ['front_delts', 'triceps'] },
  ),
  E(
    { id: 'c02', name: 'Incline Barbell Bench Press', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders', 'Triceps'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'upper_chest' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'incline_press', rotationPriority: 1, secondaryMuscleTags: ['front_delts', 'triceps'] },
  ),
  E(
    { id: 'c02b', name: 'Incline Barbell Press', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders', 'Triceps'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'upper_chest' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'incline_press', rotationPriority: 1, secondaryMuscleTags: ['front_delts', 'triceps'] },
  ),
  E(
    { id: 'c03', name: 'Dumbbell Bench Press', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'mid_chest' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'bench_press', rotationPriority: 2, secondaryMuscleTags: ['triceps', 'front_delts'] },
  ),
  E(
    { id: 'c04', name: 'Incline Dumbbell Press', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders', 'Triceps'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'upper_chest' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'incline_press', rotationPriority: 2, secondaryMuscleTags: ['front_delts', 'triceps'] },
  ),
  E(
    { id: 'c05', name: 'Cable Chest Fly', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders'], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'mid_chest' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_push', rotationGroup: 'chest_isolation', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'c05a', name: 'Cable Fly (High to Low)', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders'], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'lower_chest', gripVariant: 'High to Low' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_push', rotationGroup: 'chest_isolation', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'c05b', name: 'Cable Fly (Low to High)', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders'], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'upper_chest', gripVariant: 'Low to High' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_push', rotationGroup: 'chest_isolation', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'c05d', name: 'Low Cable Fly', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders'], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'upper_chest' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_push', rotationGroup: 'chest_isolation', rotationPriority: 5, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'c05c', name: 'Cable Fly (Mid Cable)', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders'], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'mid_chest', gripVariant: 'Mid Cable' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_push', rotationGroup: 'chest_isolation', rotationPriority: 4, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'c06', name: 'Dumbbell Chest Fly', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'mid_chest' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_push', rotationGroup: 'chest_isolation', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'c06a', name: 'Dumbbell Fly', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'mid_chest' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_push', rotationGroup: 'chest_isolation', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'c07', name: 'Machine Chest Press', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps'], equipment: 'machine', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'mid_chest' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'bench_press', rotationPriority: 4, secondaryMuscleTags: ['triceps', 'front_delts'] },
  ),
  E(
    { id: 'c08', name: 'Push-Up', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps', 'Core'], equipment: 'bodyweight', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'mid_chest' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'pushup', rotationPriority: 1, secondaryMuscleTags: ['triceps', 'front_delts', 'core'] },
  ),
  E(
    { id: 'c09', name: 'Decline Bench Press', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'lower_chest' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'bench_press', rotationPriority: 5, secondaryMuscleTags: ['triceps', 'front_delts'] },
  ),
  E(
    { id: 'c10', name: 'Smith Machine Bench Press', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders'], equipment: 'machine', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'mid_chest' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'bench_press', rotationPriority: 5, secondaryMuscleTags: ['triceps', 'front_delts'] },
  ),
  E(
    { id: 'c11', name: 'Incline Machine Press', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders', 'Triceps'], equipment: 'machine', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'upper_chest' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'incline_press', rotationPriority: 3, secondaryMuscleTags: ['front_delts', 'triceps'] },
  ),
  E(
    { id: 'c12', name: 'Smith Machine Incline Press', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders', 'Triceps'], equipment: 'machine', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'upper_chest' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'incline_press', rotationPriority: 4, secondaryMuscleTags: ['front_delts', 'triceps'] },
  ),
  E(
    { id: 'c13', name: 'Pec Deck', primaryMuscle: 'Chest', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'mid_chest' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_push', rotationGroup: 'chest_isolation', rotationPriority: 5, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'c14', name: 'Machine Fly', primaryMuscle: 'Chest', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'mid_chest' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_push', rotationGroup: 'chest_isolation', rotationPriority: 6, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'c15', name: 'Incline Cable Fly', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders'], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'upper_chest' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_push', rotationGroup: 'chest_isolation', rotationPriority: 7, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'c16', name: 'Decline Dumbbell Press', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps'], equipment: 'dumbbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'lower_chest' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'bench_press', rotationPriority: 7, secondaryMuscleTags: ['triceps', 'front_delts'] },
  ),
  E(
    { id: 'c17', name: 'Dumbbell Pullover', primaryMuscle: 'Chest', secondaryMuscles: ['Back', 'Triceps'], equipment: 'dumbbell', category: 'isolation', difficulty: 'intermediate', muscleEmphasis: 'mid_chest' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_push', rotationGroup: 'chest_isolation', rotationPriority: 8, secondaryMuscleTags: ['lats'] },
  ),

  E(
    { id: 'b01', name: 'Barbell Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'mid_back' },
    { compoundTier: 'primary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'barbell_row', rotationPriority: 1, secondaryMuscleTags: ['biceps', 'rear_delts', 'core'] },
  ),
  E(
    { id: 'b01a', name: 'Barbell Row (Overhand Wide)', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'upper_back', gripVariant: 'Overhand Wide' },
    { compoundTier: 'primary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'barbell_row', rotationPriority: 2, secondaryMuscleTags: ['rear_delts', 'upper_back', 'core'] },
  ),
  E(
    { id: 'b01b', name: 'Barbell Row (Overhand Narrow)', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'mid_back', gripVariant: 'Overhand Narrow' },
    { compoundTier: 'primary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'barbell_row', rotationPriority: 3, secondaryMuscleTags: ['rhomboids', 'core'] },
  ),
  E(
    { id: 'b01c', name: 'Barbell Row (Underhand)', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'lats', gripVariant: 'Underhand' },
    { compoundTier: 'primary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'barbell_row', rotationPriority: 4, secondaryMuscleTags: ['biceps', 'lower_lats', 'core'] },
  ),
  E(
    { id: 'b02', name: 'Deadlift', primaryMuscle: 'Back', secondaryMuscles: ['Hamstrings', 'Glutes', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'advanced', muscleEmphasis: 'lats' },
    { compoundTier: 'primary_compound', movementPattern: 'hinge', rotationGroup: 'deadlift', rotationPriority: 1, secondaryMuscleTags: ['glutes', 'hamstrings', 'upper_back', 'core'] },
  ),
  E(
    { id: 'b12', name: 'Trap Bar Deadlift', primaryMuscle: 'Back', secondaryMuscles: ['Hamstrings', 'Glutes', 'Quads'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'lats' },
    { compoundTier: 'primary_compound', movementPattern: 'hinge', rotationGroup: 'deadlift', rotationPriority: 2, secondaryMuscleTags: ['hamstrings', 'glutes', 'quads'] },
  ),
  E(
    { id: 'b13', name: 'Rack Pull', primaryMuscle: 'Back', secondaryMuscles: ['Hamstrings', 'Glutes', 'Traps'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'mid_back' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'deadlift', rotationPriority: 3, secondaryMuscleTags: ['hamstrings', 'glutes', 'traps'] },
  ),
  E(
    { id: 'b03', name: 'Pull-Up', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Core'], equipment: 'bodyweight', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'lats' },
    { compoundTier: 'primary_compound', movementPattern: 'vertical_pull', rotationGroup: 'pullup', rotationPriority: 1, secondaryMuscleTags: ['biceps', 'core'] },
  ),
  E(
    { id: 'b04', name: 'Lat Pulldown', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'cable', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'lats' },
    { compoundTier: 'secondary_compound', movementPattern: 'vertical_pull', rotationGroup: 'pulldown', rotationPriority: 1, secondaryMuscleTags: ['biceps'] },
  ),
  E(
    { id: 'b04a', name: 'Lat Pulldown (Wide Grip)', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'cable', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'lats', gripVariant: 'Wide Grip' },
    { compoundTier: 'secondary_compound', movementPattern: 'vertical_pull', rotationGroup: 'pulldown', rotationPriority: 2, secondaryMuscleTags: ['biceps', 'teres_major'] },
  ),
  E(
    { id: 'b04b', name: 'Lat Pulldown (Close Grip)', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'cable', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'lats', gripVariant: 'Close Grip' },
    { compoundTier: 'secondary_compound', movementPattern: 'vertical_pull', rotationGroup: 'pulldown', rotationPriority: 3, secondaryMuscleTags: ['biceps', 'lower_lats'] },
  ),
  E(
    { id: 'b04c', name: 'Lat Pulldown (Reverse Grip)', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'cable', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'lats', gripVariant: 'Reverse Grip' },
    { compoundTier: 'secondary_compound', movementPattern: 'vertical_pull', rotationGroup: 'pulldown', rotationPriority: 4, secondaryMuscleTags: ['biceps', 'lower_lats'] },
  ),
  E(
    { id: 'b05', name: 'Seated Cable Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Traps'], equipment: 'cable', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'mid_back' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'cable_row', rotationPriority: 1, secondaryMuscleTags: ['biceps', 'rear_delts'] },
  ),
  E(
    { id: 'b05a', name: 'Cable Row (Close Grip)', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Traps'], equipment: 'cable', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'mid_back', gripVariant: 'Close Grip' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'cable_row', rotationPriority: 2, secondaryMuscleTags: ['biceps', 'rhomboids'] },
  ),
  E(
    { id: 'b05b', name: 'Cable Row (Wide Grip)', primaryMuscle: 'Back', secondaryMuscles: ['Shoulders', 'Traps'], equipment: 'cable', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'upper_back', gripVariant: 'Wide Grip' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'cable_row', rotationPriority: 3, secondaryMuscleTags: ['rear_delts', 'upper_back'] },
  ),
  E(
    { id: 'b05c', name: 'Cable Row (Reverse Grip)', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'cable', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'lats', gripVariant: 'Reverse Grip' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'cable_row', rotationPriority: 4, secondaryMuscleTags: ['biceps', 'lower_lats'] },
  ),
  E(
    { id: 'b05d', name: 'Cable Row (Single Arm)', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Core'], equipment: 'cable', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'lats', gripVariant: 'Single Arm' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'cable_row', rotationPriority: 5, secondaryMuscleTags: ['biceps', 'core'] },
  ),
  E(
    { id: 'b06', name: 'Dumbbell Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'lats' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'dumbbell_row', rotationPriority: 1, secondaryMuscleTags: ['biceps', 'rear_delts'] },
  ),
  E(
    { id: 'b06a', name: 'Dumbbell Row (Pronated Grip)', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'mid_back', gripVariant: 'Pronated Grip' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'dumbbell_row', rotationPriority: 2, secondaryMuscleTags: ['rhomboids', 'rear_delts'] },
  ),
  E(
    { id: 'b07', name: 'T-Bar Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'mid_back' },
    { compoundTier: 'primary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'barbell_row', rotationPriority: 3, secondaryMuscleTags: ['biceps', 'rear_delts', 'core'] },
  ),
  E(
    { id: 'b08', name: 'Chin-Up', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'bodyweight', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'lats' },
    { compoundTier: 'primary_compound', movementPattern: 'vertical_pull', rotationGroup: 'pullup', rotationPriority: 2, secondaryMuscleTags: ['biceps'] },
  ),
  E(
    { id: 'b09', name: 'Machine Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'machine', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'mid_back' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'cable_row', rotationPriority: 2, secondaryMuscleTags: ['biceps', 'rear_delts'] },
  ),
  E(
    { id: 'b10', name: 'Chest Supported Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'machine', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'mid_back' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'dumbbell_row', rotationPriority: 3, secondaryMuscleTags: ['biceps', 'rear_delts'] },
  ),
  E(
    { id: 'b11', name: 'Assisted Pull-up Machine', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'machine', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'lats' },
    { compoundTier: 'secondary_compound', movementPattern: 'vertical_pull', rotationGroup: 'pullup', rotationPriority: 3, secondaryMuscleTags: ['biceps'] },
  ),
  E(
    { id: 'b14', name: 'Straight Arm Pulldown', primaryMuscle: 'Back', secondaryMuscles: ['Triceps'], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'lats' },
    { compoundTier: 'isolation', movementPattern: 'vertical_pull', rotationGroup: 'pulldown', rotationPriority: 5, secondaryMuscleTags: ['triceps'] },
  ),
  E(
    { id: 'b15', name: 'Meadows Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'mid_back' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'dumbbell_row', rotationPriority: 4, secondaryMuscleTags: ['biceps', 'rear_delts'] },
  ),
  E(
    { id: 'b16', name: 'Seal Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'mid_back' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_pull', rotationGroup: 'dumbbell_row', rotationPriority: 5, secondaryMuscleTags: ['biceps', 'rear_delts'] },
  ),

  E(
    { id: 's01', name: 'Overhead Press', primaryMuscle: 'Shoulders', secondaryMuscles: ['Triceps', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'front_delt' },
    { compoundTier: 'primary_compound', movementPattern: 'vertical_push', rotationGroup: 'overhead_press', rotationPriority: 1, secondaryMuscleTags: ['triceps', 'upper_traps', 'core'] },
  ),
  E(
    { id: 's02', name: 'Dumbbell Shoulder Press', primaryMuscle: 'Shoulders', secondaryMuscles: ['Triceps'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'front_delt' },
    { compoundTier: 'secondary_compound', movementPattern: 'vertical_push', rotationGroup: 'overhead_press', rotationPriority: 2, secondaryMuscleTags: ['triceps'] },
  ),
  E(
    { id: 's03', name: 'Dumbbell Lateral Raise', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'lateral_delt' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'lateral_delt', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's03b', name: 'Lateral Raise', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'lateral_delt' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'lateral_delt', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's04', name: 'Cable Lateral Raise', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps'], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'lateral_delt' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'lateral_delt', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's05', name: 'Face Pull', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps', 'Back'], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'rear_delt' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_pull', rotationGroup: 'rear_delt_isolation', rotationPriority: 1, secondaryMuscleTags: ['rear_delts'] },
  ),
  E(
    { id: 's06', name: 'Reverse Dumbbell Fly', primaryMuscle: 'Shoulders', secondaryMuscles: ['Back', 'Traps'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'rear_delt' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_pull', rotationGroup: 'rear_delt_isolation', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's07', name: 'Arnold Press', primaryMuscle: 'Shoulders', secondaryMuscles: ['Triceps'], equipment: 'dumbbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'front_delt' },
    { compoundTier: 'secondary_compound', movementPattern: 'vertical_push', rotationGroup: 'overhead_press', rotationPriority: 3, secondaryMuscleTags: ['triceps', 'front_delts'] },
  ),
  E(
    { id: 's08', name: 'Machine Shoulder Press', primaryMuscle: 'Shoulders', secondaryMuscles: ['Triceps'], equipment: 'machine', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'front_delt' },
    { compoundTier: 'secondary_compound', movementPattern: 'vertical_push', rotationGroup: 'overhead_press', rotationPriority: 4, secondaryMuscleTags: ['triceps'] },
  ),
  E(
    { id: 's09', name: 'Machine Lateral Raise', primaryMuscle: 'Shoulders', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'lateral_delt' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'lateral_delt', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's10', name: 'Leaning Cable Lateral Raise', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps'], equipment: 'cable', category: 'isolation', difficulty: 'intermediate', muscleEmphasis: 'lateral_delt' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'lateral_delt', rotationPriority: 4, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's10a', name: 'Cable Rear Delt Fly', primaryMuscle: 'Shoulders', secondaryMuscles: ['Back', 'Traps'], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'rear_delt' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_pull', rotationGroup: 'rear_delt_isolation', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's11', name: 'Band Pull-Apart', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps', 'Back'], equipment: 'band', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'rear_delt' },
    { usesWeight: false },
    { compoundTier: 'isolation', movementPattern: 'horizontal_pull', rotationGroup: 'rear_delt_isolation', rotationPriority: 4, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's12', name: 'Reverse Pec Deck', primaryMuscle: 'Shoulders', secondaryMuscles: ['Back'], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'rear_delt' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_pull', rotationGroup: 'rear_delt_isolation', rotationPriority: 5, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's13', name: 'Smith Machine Press', primaryMuscle: 'Shoulders', secondaryMuscles: ['Triceps'], equipment: 'machine', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'front_delt' },
    { compoundTier: 'secondary_compound', movementPattern: 'vertical_push', rotationGroup: 'overhead_press', rotationPriority: 5, secondaryMuscleTags: ['triceps'] },
  ),
  E(
    { id: 's14', name: 'Cable Front Raise', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps'], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'front_delt' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'front_delt_isolation', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's15', name: 'Dumbbell Front Raise', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'front_delt' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'front_delt_isolation', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's16', name: 'Barbell Front Raise', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps'], equipment: 'barbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'front_delt' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'front_delt_isolation', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's17', name: 'Plate Front Raise', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps'], equipment: 'barbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'front_delt' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'front_delt_isolation', rotationPriority: 4, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's18', name: 'Rear Delt Fly', primaryMuscle: 'Shoulders', secondaryMuscles: ['Back', 'Traps'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'rear_delt' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_pull', rotationGroup: 'rear_delt_isolation', rotationPriority: 6, secondaryMuscleTags: [] },
  ),
  E(
    { id: 's19', name: 'Face Pulls', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps', 'Back'], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'rear_delt' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_pull', rotationGroup: 'rear_delt_isolation', rotationPriority: 7, secondaryMuscleTags: ['rear_delts'] },
  ),
  E(
    { id: 's20', name: 'Seated Rear Delt Fly', primaryMuscle: 'Shoulders', secondaryMuscles: ['Back', 'Traps'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'rear_delt' },
    { compoundTier: 'isolation', movementPattern: 'horizontal_pull', rotationGroup: 'rear_delt_isolation', rotationPriority: 8, secondaryMuscleTags: [] },
  ),

  E(
    { id: 'bi01', name: 'Barbell Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'barbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'short_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'bi02', name: 'Dumbbell Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'bi02a', name: 'Dumbbell Curl (Supinated)', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'short_head_bicep', gripVariant: 'Supinated' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 7, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'bi02b', name: 'Dumbbell Curl (Pronated)', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_bicep', gripVariant: 'Pronated' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 8, secondaryMuscleTags: ['brachioradialis'] },
  ),
  E(
    { id: 'bi03', name: 'Hammer Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 3, secondaryMuscleTags: ['brachialis'] },
  ),
  E(
    { id: 'bi04', name: 'Preacher Curl', primaryMuscle: 'Biceps', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'short_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 5, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'bi05', name: 'Cable Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 6, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'bi06', name: 'Incline Dumbbell Curl', primaryMuscle: 'Biceps', secondaryMuscles: [], equipment: 'dumbbell', category: 'isolation', difficulty: 'intermediate', muscleEmphasis: 'long_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 4, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'bi07', name: 'Machine Bicep Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'short_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 9, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'bi08', name: 'Preacher Curl Machine', primaryMuscle: 'Biceps', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'short_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 10, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'bi09', name: 'Cross Body Hammer Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 11, secondaryMuscleTags: ['brachialis'] },
  ),
  E(
    { id: 'bi10', name: 'Rope Hammer Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 12, secondaryMuscleTags: ['brachialis'] },
  ),
  E(
    { id: 'bi11', name: 'Concentration Curl', primaryMuscle: 'Biceps', secondaryMuscles: [], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'short_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 13, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'bi12', name: 'Bayesian Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'cable', category: 'isolation', difficulty: 'intermediate', muscleEmphasis: 'long_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 14, secondaryMuscleTags: ['brachialis'] },
  ),
  E(
    { id: 'bi13', name: 'EZ Bar Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'barbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'short_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 15, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'bi14', name: 'EZ Bar Curl (Wide Grip)', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'barbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_bicep', gripVariant: 'Wide Grip' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 16, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'bi15', name: 'Cable Curl (Rope)', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_bicep', gripVariant: 'Rope' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 17, secondaryMuscleTags: ['brachialis'] },
  ),
  E(
    { id: 'bi16', name: 'Spider Curl', primaryMuscle: 'Biceps', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'intermediate', muscleEmphasis: 'short_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'bicep_curl', rotationPriority: 18, secondaryMuscleTags: [] },
  ),

  E(
    { id: 'tr01', name: 'Tricep Pushdown', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'lateral_head_tricep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_pushdown', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr01a', name: 'Tricep Pushdown (Rope)', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'lateral_head_tricep', gripVariant: 'Rope' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_pushdown', rotationPriority: 2, secondaryMuscleTags: ['long_head_tricep'] },
  ),
  E(
    { id: 'tr01b', name: 'Tricep Pushdown (Straight Bar)', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'lateral_head_tricep', gripVariant: 'Straight Bar' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_pushdown', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr01c', name: 'Tricep Pushdown (V-Bar)', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'lateral_head_tricep', gripVariant: 'V-Bar' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_pushdown', rotationPriority: 4, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr01d', name: 'Tricep Pushdown (Reverse Grip)', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_tricep', gripVariant: 'Reverse Grip' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_pushdown', rotationPriority: 5, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr02', name: 'Overhead Tricep Extension', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_tricep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_extension', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr02a', name: 'Overhead Tricep Extension (Rope)', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_tricep', gripVariant: 'Rope' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_extension', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr02b', name: 'Overhead Tricep Extension (Single Arm)', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_tricep', gripVariant: 'Single Arm' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_extension', rotationPriority: 4, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr03', name: 'Skull Crushers', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'intermediate', muscleEmphasis: 'long_head_tricep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_extension', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr03b', name: 'Skull Crusher', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'intermediate', muscleEmphasis: 'long_head_tricep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_extension', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr04', name: 'Close-Grip Bench Press', primaryMuscle: 'Triceps', secondaryMuscles: ['Chest', 'Shoulders'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'lateral_head_tricep' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'bench_press', rotationPriority: 3, secondaryMuscleTags: ['triceps'] },
  ),
  E(
    { id: 'tr04b', name: 'Close Grip Bench Press', primaryMuscle: 'Triceps', secondaryMuscles: ['Chest', 'Shoulders'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'lateral_head_tricep' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'bench_press', rotationPriority: 3, secondaryMuscleTags: ['triceps'] },
  ),
  E(
    { id: 'tr05', name: 'Dumbbell Tricep Kickback', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'lateral_head_tricep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_extension', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr06', name: 'Dips', primaryMuscle: 'Triceps', secondaryMuscles: ['Chest', 'Shoulders'], equipment: 'bodyweight', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'lateral_head_tricep' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'dip', rotationPriority: 1, secondaryMuscleTags: ['chest', 'front_delts'] },
  ),
  E(
    { id: 'tr06b', name: 'Dip', primaryMuscle: 'Triceps', secondaryMuscles: ['Chest', 'Shoulders'], equipment: 'bodyweight', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'lateral_head_tricep' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'dip', rotationPriority: 1, secondaryMuscleTags: ['chest', 'front_delts'] },
  ),
  E(
    { id: 'tr07', name: 'Machine Dip', primaryMuscle: 'Triceps', secondaryMuscles: ['Chest', 'Shoulders'], equipment: 'machine', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'lateral_head_tricep' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'dip', rotationPriority: 2, secondaryMuscleTags: ['chest', 'front_delts'] },
  ),
  E(
    { id: 'tr08', name: 'Assisted Dip Machine', primaryMuscle: 'Triceps', secondaryMuscles: ['Chest', 'Shoulders'], equipment: 'machine', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'lateral_head_tricep' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'dip', rotationPriority: 3, secondaryMuscleTags: ['chest', 'front_delts'] },
  ),
  E(
    { id: 'tr09', name: 'Tricep Press Machine', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'lateral_head_tricep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_pushdown', rotationPriority: 6, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr10', name: 'Machine Tricep Extension', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_tricep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_extension', rotationPriority: 5, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr11', name: 'Smith Machine Close Grip', primaryMuscle: 'Triceps', secondaryMuscles: ['Chest', 'Shoulders'], equipment: 'machine', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'lateral_head_tricep' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'bench_press', rotationPriority: 7, secondaryMuscleTags: ['triceps'] },
  ),
  E(
    { id: 'tr12', name: 'Cable Overhead Tricep Extension', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_tricep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_extension', rotationPriority: 6, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr13', name: 'EZ Bar Skull Crusher', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'intermediate', muscleEmphasis: 'long_head_tricep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_extension', rotationPriority: 7, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr14', name: 'Dumbbell Skull Crusher', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'dumbbell', category: 'isolation', difficulty: 'intermediate', muscleEmphasis: 'long_head_tricep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_push', rotationGroup: 'tricep_extension', rotationPriority: 8, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tr15', name: 'Diamond Push-Up', primaryMuscle: 'Triceps', secondaryMuscles: ['Chest', 'Shoulders'], equipment: 'bodyweight', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'lateral_head_tricep' },
    { compoundTier: 'secondary_compound', movementPattern: 'horizontal_push', rotationGroup: 'dip', rotationPriority: 4, secondaryMuscleTags: ['chest', 'front_delts'] },
  ),

  E(
    { id: 'q01', name: 'Back Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'quads' },
    { compoundTier: 'primary_compound', movementPattern: 'squat', rotationGroup: 'squat', rotationPriority: 1, secondaryMuscleTags: ['glutes', 'hamstrings', 'core'] },
  ),
  E(
    { id: 'q02', name: 'Front Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Core', 'Glutes'], equipment: 'barbell', category: 'compound', difficulty: 'advanced', muscleEmphasis: 'quads' },
    { compoundTier: 'primary_compound', movementPattern: 'squat', rotationGroup: 'squat', rotationPriority: 2, secondaryMuscleTags: ['core', 'glutes'] },
  ),
  E(
    { id: 'q03', name: 'Leg Press', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes'], equipment: 'machine', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'quads' },
    { compoundTier: 'secondary_compound', movementPattern: 'squat', rotationGroup: 'leg_press', rotationPriority: 1, secondaryMuscleTags: ['glutes'] },
  ),
  E(
    { id: 'q04', name: 'Leg Extension', primaryMuscle: 'Quads', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'quads' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'quad_isolation', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'q05', name: 'Hack Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes'], equipment: 'machine', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'quads' },
    { compoundTier: 'secondary_compound', movementPattern: 'squat', rotationGroup: 'squat', rotationPriority: 4, secondaryMuscleTags: ['glutes'] },
  ),
  E(
    { id: 'q06', name: 'Bulgarian Split Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes', 'Core'], equipment: 'dumbbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'glutes' },
    { compoundTier: 'secondary_compound', movementPattern: 'lunge', rotationGroup: 'split_squat', rotationPriority: 1, secondaryMuscleTags: ['glutes', 'hamstrings', 'core'] },
  ),
  E(
    { id: 'q07', name: 'Goblet Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Core', 'Glutes'], equipment: 'kettlebell', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'quads' },
    { compoundTier: 'secondary_compound', movementPattern: 'squat', rotationGroup: 'squat', rotationPriority: 3, secondaryMuscleTags: ['core', 'glutes'] },
  ),
  E(
    { id: 'q08', name: 'Walking Lunge', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes', 'Hamstrings'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'quads' },
    { compoundTier: 'secondary_compound', movementPattern: 'lunge', rotationGroup: 'lunge', rotationPriority: 3, secondaryMuscleTags: ['glutes', 'hamstrings'] },
  ),
  E(
    { id: 'q09', name: 'Smith Machine Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes', 'Core'], equipment: 'machine', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'quads' },
    { compoundTier: 'secondary_compound', movementPattern: 'squat', rotationGroup: 'squat', rotationPriority: 5, secondaryMuscleTags: ['glutes', 'core'] },
  ),
  E(
    { id: 'q10', name: 'Leg Press (Single Leg)', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes'], equipment: 'machine', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'quads' },
    { compoundTier: 'secondary_compound', movementPattern: 'squat', rotationGroup: 'leg_press', rotationPriority: 2, secondaryMuscleTags: ['glutes'] },
  ),
  E(
    { id: 'q11', name: 'Reverse Lunge', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes', 'Hamstrings'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'glutes' },
    { compoundTier: 'secondary_compound', movementPattern: 'lunge', rotationGroup: 'lunge', rotationPriority: 4, secondaryMuscleTags: ['glutes', 'hamstrings'] },
  ),
  E(
    { id: 'q12', name: 'Step Up', primaryMuscle: 'Glutes', secondaryMuscles: ['Quads', 'Hamstrings'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'glutes' },
    { compoundTier: 'secondary_compound', movementPattern: 'lunge', rotationGroup: 'lunge', rotationPriority: 5, secondaryMuscleTags: ['quads', 'hamstrings'] },
  ),
  E(
    { id: 'q13', name: 'Leg Extension (Single Leg)', primaryMuscle: 'Quads', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'quads' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'quad_isolation', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'q14', name: 'Cable Leg Extension', primaryMuscle: 'Quads', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'quads' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'quad_isolation', rotationPriority: 3, secondaryMuscleTags: [] },
  ),

  E(
    { id: 'h01', name: 'Romanian Deadlift', primaryMuscle: 'Hamstrings', secondaryMuscles: ['Glutes', 'Back'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'hamstrings' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'rdl', rotationPriority: 1, secondaryMuscleTags: ['glutes', 'lower_back'] },
  ),
  E(
    { id: 'h02', name: 'Leg Curl', primaryMuscle: 'Hamstrings', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'hamstrings' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'hamstring_isolation', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'h03', name: 'Stiff-Leg Deadlift', primaryMuscle: 'Hamstrings', secondaryMuscles: ['Glutes', 'Back'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'hamstrings' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'rdl', rotationPriority: 2, secondaryMuscleTags: ['lower_back', 'glutes'] },
  ),
  E(
    { id: 'h03b', name: 'Stiff Leg Deadlift', primaryMuscle: 'Hamstrings', secondaryMuscles: ['Glutes', 'Back'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'hamstrings' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'rdl', rotationPriority: 2, secondaryMuscleTags: ['lower_back', 'glutes'] },
  ),
  E(
    { id: 'h04', name: 'Dumbbell Romanian Deadlift', primaryMuscle: 'Hamstrings', secondaryMuscles: ['Glutes'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'hamstrings' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'rdl', rotationPriority: 4, secondaryMuscleTags: ['glutes'] },
  ),
  E(
    { id: 'h05', name: 'Nordic Hamstring Curl', primaryMuscle: 'Hamstrings', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'advanced', muscleEmphasis: 'hamstrings' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'hamstring_isolation', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'h05b', name: 'Nordic Curl', primaryMuscle: 'Hamstrings', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'advanced', muscleEmphasis: 'hamstrings' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'hamstring_isolation', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'h06', name: 'Kettlebell Swing', primaryMuscle: 'Hamstrings', secondaryMuscles: ['Glutes', 'Core', 'Back'], equipment: 'kettlebell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'glutes' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'kettlebell_swing', rotationPriority: 1, secondaryMuscleTags: ['glutes', 'core', 'back'] },
  ),
  E(
    { id: 'h07', name: 'Lying Leg Curl', primaryMuscle: 'Hamstrings', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'hamstrings' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'hamstring_isolation', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'h08', name: 'Seated Leg Curl', primaryMuscle: 'Hamstrings', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'hamstrings' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'hamstring_isolation', rotationPriority: 4, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'h09', name: 'Swiss Ball Leg Curl', primaryMuscle: 'Hamstrings', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'intermediate', muscleEmphasis: 'hamstrings' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'hamstring_isolation', rotationPriority: 5, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'h10', name: 'Standing Leg Curl', primaryMuscle: 'Hamstrings', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'hamstrings' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'hamstring_isolation', rotationPriority: 6, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'h11', name: 'Single Leg RDL', primaryMuscle: 'Hamstrings', secondaryMuscles: ['Glutes'], equipment: 'dumbbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'hamstrings' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'rdl', rotationPriority: 5, secondaryMuscleTags: ['glutes'] },
  ),
  E(
    { id: 'h12', name: 'Good Morning', primaryMuscle: 'Hamstrings', secondaryMuscles: ['Glutes', 'Back'], equipment: 'barbell', category: 'compound', difficulty: 'advanced', muscleEmphasis: 'hamstrings' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'rdl', rotationPriority: 6, secondaryMuscleTags: ['glutes', 'lower_back'] },
  ),

  E(
    { id: 'g01', name: 'Hip Thrust', primaryMuscle: 'Glutes', secondaryMuscles: ['Hamstrings'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'glutes' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'hip_thrust', rotationPriority: 1, secondaryMuscleTags: ['hamstrings', 'core'] },
  ),
  E(
    { id: 'g02', name: 'Glute Bridge', primaryMuscle: 'Glutes', secondaryMuscles: ['Hamstrings'], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'glutes' },
    { compoundTier: 'isolation', movementPattern: 'hinge', rotationGroup: 'glute_bridge', rotationPriority: 1, secondaryMuscleTags: ['hamstrings'] },
  ),
  E(
    { id: 'g03', name: 'Cable Pull-Through', primaryMuscle: 'Glutes', secondaryMuscles: ['Hamstrings'], equipment: 'cable', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'glutes' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'hip_thrust', rotationPriority: 2, secondaryMuscleTags: ['hamstrings'] },
  ),
  E(
    { id: 'g04', name: 'Sumo Deadlift', primaryMuscle: 'Glutes', secondaryMuscles: ['Quads', 'Hamstrings', 'Back'], equipment: 'barbell', category: 'compound', difficulty: 'advanced', muscleEmphasis: 'glutes' },
    { compoundTier: 'primary_compound', movementPattern: 'hinge', rotationGroup: 'deadlift', rotationPriority: 2, secondaryMuscleTags: ['glutes', 'adductors', 'quads', 'back'] },
  ),
  E(
    { id: 'g05', name: 'Cable Kickback', primaryMuscle: 'Glutes', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'glutes' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'glute_isolation', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'g06', name: 'Banded Hip Thrust', primaryMuscle: 'Glutes', secondaryMuscles: ['Hamstrings'], equipment: 'band', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'glutes' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'hip_thrust', rotationPriority: 3, secondaryMuscleTags: ['hamstrings'] },
  ),
  E(
    { id: 'g07', name: 'Hip Thrust Machine', primaryMuscle: 'Glutes', secondaryMuscles: ['Hamstrings'], equipment: 'machine', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'glutes' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'hip_thrust', rotationPriority: 4, secondaryMuscleTags: ['hamstrings'] },
  ),
  E(
    { id: 'g08', name: 'Glute Drive Machine', primaryMuscle: 'Glutes', secondaryMuscles: ['Hamstrings'], equipment: 'machine', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'glutes' },
    { compoundTier: 'secondary_compound', movementPattern: 'hinge', rotationGroup: 'hip_thrust', rotationPriority: 5, secondaryMuscleTags: ['hamstrings'] },
  ),
  E(
    { id: 'g09', name: 'Donkey Kick', primaryMuscle: 'Glutes', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'glutes' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'glute_isolation', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'g10', name: 'Abduction Machine', primaryMuscle: 'Glutes', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'glutes' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'glute_isolation', rotationPriority: 3, secondaryMuscleTags: [] },
  ),

  E(
    { id: 'cv01', name: 'Standing Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'gastrocnemius' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'calf_isolation', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'cv02', name: 'Seated Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'soleus' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'calf_isolation', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'cv03', name: 'Dumbbell Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'gastrocnemius' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'calf_isolation', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'cv04', name: 'Leg Press Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'gastrocnemius' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'calf_isolation', rotationPriority: 4, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'cv05', name: 'Bodyweight Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'gastrocnemius' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'calf_isolation', rotationPriority: 5, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'cv06', name: 'Smith Machine Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'gastrocnemius' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'calf_isolation', rotationPriority: 6, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'cv07', name: 'Single-Leg Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'gastrocnemius' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'calf_isolation', rotationPriority: 7, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'cv08', name: 'Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'gastrocnemius' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'calf_isolation', rotationPriority: 8, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'cv09', name: 'Barbell Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'gastrocnemius' },
    { compoundTier: 'isolation', movementPattern: 'isolation_legs', rotationGroup: 'calf_isolation', rotationPriority: 9, secondaryMuscleTags: [] },
  ),

  E(
    { id: 'co01', name: 'Plank', primaryMuscle: 'Core', secondaryMuscles: ['Shoulders'], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'transverse_abs' },
    { compoundTier: 'secondary_compound', movementPattern: 'core_anti_extension', rotationGroup: 'plank', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'co02', name: 'Hanging Leg Raise', primaryMuscle: 'Core', secondaryMuscles: ['Forearms'], equipment: 'bodyweight', category: 'isolation', difficulty: 'intermediate', muscleEmphasis: 'rectus_abdominis' },
    { compoundTier: 'isolation', movementPattern: 'core_anti_extension', rotationGroup: 'leg_raise', rotationPriority: 1, secondaryMuscleTags: ['forearms'] },
  ),
  E(
    { id: 'co03', name: 'Cable Crunch', primaryMuscle: 'Core', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'rectus_abdominis' },
    { compoundTier: 'isolation', movementPattern: 'core_anti_extension', rotationGroup: 'crunch', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'co04', name: 'Ab Wheel Rollout', primaryMuscle: 'Core', secondaryMuscles: ['Shoulders'], equipment: 'bodyweight', category: 'isolation', difficulty: 'advanced', muscleEmphasis: 'transverse_abs' },
    { compoundTier: 'secondary_compound', movementPattern: 'core_anti_extension', rotationGroup: 'plank', rotationPriority: 2, secondaryMuscleTags: ['lats', 'shoulders'] },
  ),
  E(
    { id: 'co05', name: 'Russian Twist', primaryMuscle: 'Core', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'obliques' },
    { compoundTier: 'isolation', movementPattern: 'core_anti_rotation', rotationGroup: 'russian_twist', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'co06', name: 'Pallof Press', primaryMuscle: 'Core', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'intermediate', muscleEmphasis: 'transverse_abs' },
    { usesWeight: false },
    { compoundTier: 'secondary_compound', movementPattern: 'core_anti_rotation', rotationGroup: 'pallof', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'co07', name: 'Dead Bug', primaryMuscle: 'Core', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'transverse_abs' },
    { compoundTier: 'isolation', movementPattern: 'core_anti_extension', rotationGroup: 'dead_bug', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'co08', name: 'Weighted Crunch', primaryMuscle: 'Core', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'rectus_abdominis' },
    { compoundTier: 'isolation', movementPattern: 'core_anti_extension', rotationGroup: 'crunch', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'co09', name: 'Sit-Up', primaryMuscle: 'Core', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'rectus_abdominis' },
    { compoundTier: 'isolation', movementPattern: 'core_anti_extension', rotationGroup: 'crunch', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'co10', name: 'Leg Raise', primaryMuscle: 'Core', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'rectus_abdominis' },
    { compoundTier: 'isolation', movementPattern: 'core_anti_extension', rotationGroup: 'leg_raise', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'co11', name: 'Bicycle Crunch', primaryMuscle: 'Core', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'obliques' },
    { compoundTier: 'isolation', movementPattern: 'core_anti_rotation', rotationGroup: 'russian_twist', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'co12', name: 'Side Plank', primaryMuscle: 'Core', secondaryMuscles: ['Shoulders'], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'obliques' },
    { compoundTier: 'isolation', movementPattern: 'core_anti_rotation', rotationGroup: 'russian_twist', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'co13', name: 'Cable Woodchop', primaryMuscle: 'Core', secondaryMuscles: ['Shoulders'], equipment: 'cable', category: 'isolation', difficulty: 'intermediate', muscleEmphasis: 'obliques' },
    { compoundTier: 'isolation', movementPattern: 'core_anti_rotation', rotationGroup: 'pallof', rotationPriority: 2, secondaryMuscleTags: [] },
  ),

  E(
    { id: 'tp01', name: 'Barbell Shrug', primaryMuscle: 'Traps', secondaryMuscles: ['Shoulders'], equipment: 'barbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'mid_back' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'shrug', rotationPriority: 1, secondaryMuscleTags: ['shoulders'] },
  ),
  E(
    { id: 'tp02', name: 'Dumbbell Shrug', primaryMuscle: 'Traps', secondaryMuscles: ['Shoulders'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'mid_back' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'shrug', rotationPriority: 2, secondaryMuscleTags: ['shoulders'] },
  ),
  E(
    { id: 'tp03', name: 'Upright Row', primaryMuscle: 'Traps', secondaryMuscles: ['Shoulders'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate', muscleEmphasis: 'lateral_delt' },
    { compoundTier: 'secondary_compound', movementPattern: 'vertical_pull', rotationGroup: 'upright_row', rotationPriority: 1, secondaryMuscleTags: ['shoulders', 'biceps'] },
  ),
  E(
    { id: 'tp04', name: 'Cable Shrug', primaryMuscle: 'Traps', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'mid_back' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'shrug', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tp05', name: 'Farmer Carry', primaryMuscle: 'Traps', secondaryMuscles: ['Core', 'Forearms'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner', muscleEmphasis: 'mid_back' },
    { compoundTier: 'secondary_compound', movementPattern: 'carry', rotationGroup: 'farmer_carry', rotationPriority: 1, secondaryMuscleTags: ['core', 'forearms'] },
  ),
  E(
    { id: 'tp06', name: 'Kettlebell Shrug', primaryMuscle: 'Traps', secondaryMuscles: [], equipment: 'kettlebell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'mid_back' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'shrug', rotationPriority: 4, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'tp07', name: 'Shrugs', primaryMuscle: 'Traps', secondaryMuscles: ['Shoulders'], equipment: 'barbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'mid_back' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'shrug', rotationPriority: 5, secondaryMuscleTags: ['shoulders'] },
  ),
  E(
    { id: 'tp08', name: 'Smith Machine Shrug', primaryMuscle: 'Traps', secondaryMuscles: ['Shoulders'], equipment: 'machine', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'mid_back' },
    { compoundTier: 'isolation', movementPattern: 'isolation_shoulders', rotationGroup: 'shrug', rotationPriority: 6, secondaryMuscleTags: ['shoulders'] },
  ),

  E(
    { id: 'f01', name: 'Wrist Curl', primaryMuscle: 'Forearms', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'forearm_wrist', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'f02', name: 'Reverse Wrist Curl', primaryMuscle: 'Forearms', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'forearm_wrist', rotationPriority: 2, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'f03', name: 'Reverse Curl', primaryMuscle: 'Forearms', secondaryMuscles: ['Biceps'], equipment: 'barbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'forearm_curl', rotationPriority: 1, secondaryMuscleTags: ['biceps'] },
  ),
  E(
    { id: 'f04', name: 'Plate Pinch Hold', primaryMuscle: 'Forearms', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'intermediate', muscleEmphasis: 'mid_back' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'grip_hold', rotationPriority: 1, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'f05', name: 'Dumbbell Wrist Curl', primaryMuscle: 'Forearms', secondaryMuscles: [], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'forearm_wrist', rotationPriority: 3, secondaryMuscleTags: [] },
  ),
  E(
    { id: 'f06', name: 'Band Wrist Extension', primaryMuscle: 'Forearms', secondaryMuscles: [], equipment: 'band', category: 'isolation', difficulty: 'beginner', muscleEmphasis: 'long_head_bicep' },
    { compoundTier: 'isolation', movementPattern: 'isolation_pull', rotationGroup: 'forearm_wrist', rotationPriority: 4, secondaryMuscleTags: [] },
  ),
];

export function getCuesForExerciseName(name: string): string[] {
  const e = EXERCISES.find(
    (x) => x.name.toLowerCase().trim() === String(name).toLowerCase().trim(),
  );
  return e ? [...e.cues] : [...DEFAULT_EXERCISE_CUES];
}

/** Lookup by name — handles AI-generated names not in library via keyword heuristics. */
export function isExerciseUnilateral(name: string): boolean {
  const match = EXERCISES.find(
    (x) => x.name.toLowerCase().trim() === String(name).toLowerCase().trim(),
  );
  if (match) return match.isUnilateral;
  const n = name.toLowerCase();
  if (/single[- ]?(arm|leg)/i.test(n)) return true;
  if (/\b(lunge|split squat|step[- ]?up|pistol|cossack|meadows)\b/i.test(n)) return true;
  return false;
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

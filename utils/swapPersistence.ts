import { EXERCISES } from '../constants/exerciseLibrary';
import { supabase } from '../Lib/supabase';

type PlanExercise = {
  id: string;
  name: string;
  originalName?: string;
  muscleGroup?: string;
  equipment?: string;
  compoundTier?: string;
  muscleEmphasis?: string;
  secondaryMuscleTags?: string[];
  targetWeight?: number;
  targetRpe?: number;
  setTargets?: unknown[];
};

type PlanDay = {
  dayNumber: number;
  exercises?: PlanExercise[];
};

type PlanWeek = {
  weekNumber: number;
  days?: PlanDay[];
};

export async function persistExerciseSwapsToPlan(
  planId: string,
  currentWeekNumber: number,
  currentDayNumber: number,
  swaps: Record<string, string>,
): Promise<void> {
  const { data: planRow } = await supabase
    .from('plans')
    .select('plan_json')
    .eq('id', planId)
    .maybeSingle();

  if (!planRow?.plan_json) return;

  const planJson = planRow.plan_json as {
    weeks?: PlanWeek[];
  };

  if (!planJson.weeks) return;
  let modified = false;

  for (const week of planJson.weeks) {
    if (week.weekNumber < currentWeekNumber) continue;

    for (const day of week.days ?? []) {
      if (
        week.weekNumber === currentWeekNumber &&
        day.dayNumber !== currentDayNumber
      ) {
        continue;
      }

      const isCurrentSessionSlot =
        week.weekNumber === currentWeekNumber &&
        day.dayNumber === currentDayNumber;

      for (const exercise of day.exercises ?? []) {
        const newName = swaps[exercise.id];
        if (newName && newName !== exercise.name) {
          exercise.originalName = exercise.originalName ?? exercise.name;
          exercise.name = newName;

          const libraryMatch = EXERCISES.find(
            (e) => e.name.toLowerCase() === newName.toLowerCase(),
          );
          if (libraryMatch) {
            exercise.muscleGroup = libraryMatch.primaryMuscle;
            exercise.equipment = libraryMatch.equipment;
            exercise.compoundTier = libraryMatch.compoundTier;
            exercise.muscleEmphasis = libraryMatch.muscleEmphasis;
            exercise.secondaryMuscleTags = libraryMatch.secondaryMuscleTags;
          }

          if (!isCurrentSessionSlot) {
            exercise.targetWeight = 0;
            if (Array.isArray(exercise.setTargets)) {
              delete exercise.setTargets;
            }
            if (typeof exercise.targetRpe === 'number') {
              delete exercise.targetRpe;
            }
          }

          modified = true;
        }
      }
    }
  }

  if (!modified) return;

  await supabase
    .from('plans')
    .update({ plan_json: planJson })
    .eq('id', planId);

  console.log('[SwapPersist] Swaps written to plan_json');
}

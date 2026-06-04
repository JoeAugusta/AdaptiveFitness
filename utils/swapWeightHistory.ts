import { supabase } from '../Lib/supabase';

export async function fetchLastLoggedWeightForExercise(
  userId: string,
  planId: string,
  exerciseName: string,
): Promise<number | null> {
  const { data: logs } = await supabase
    .from('workout_logs')
    .select('sets_json')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('skipped', false)
    .order('logged_at', { ascending: false });

  if (!logs?.length) return null;

  const allMatchingWeights: number[] = [];

  for (const log of logs) {
    const sets = (log.sets_json ?? []) as Array<{
      exerciseName?: string;
      weightLbs?: number;
    }>;

    const matching = sets
      .filter(
        (s) =>
          s.exerciseName?.toLowerCase().trim() ===
            exerciseName.toLowerCase().trim() &&
          (s.weightLbs ?? 0) > 0,
      )
      .map((s) => s.weightLbs ?? 0);

    allMatchingWeights.push(...matching);
  }

  if (allMatchingWeights.length === 0) return null;
  return Math.max(...allMatchingWeights);
}

export async function fetchLastLoggedSetsForExercise(
  userId: string,
  planId: string,
  exerciseName: string,
): Promise<{ setNumber: number; weightLbs: number }[] | null> {
  const { data: logs } = await supabase
    .from('workout_logs')
    .select('sets_json')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('skipped', false)
    .order('logged_at', { ascending: false });

  if (!logs?.length) return null;

  const nameLower = exerciseName.toLowerCase().trim();

  for (const log of logs) {
    const sets = (log.sets_json ?? []) as Array<{
      exerciseName?: string;
      setNumber?: number;
      weightLbs?: number;
    }>;

    const matching = sets
      .filter(
        (s) =>
          s.exerciseName?.toLowerCase().trim() === nameLower &&
          (s.weightLbs ?? 0) > 0,
      )
      .map((s) => ({
        setNumber: s.setNumber ?? 0,
        weightLbs: s.weightLbs ?? 0,
      }))
      .sort((a, b) => a.setNumber - b.setNumber);

    if (matching.length > 0) return matching;
  }

  return null;
}

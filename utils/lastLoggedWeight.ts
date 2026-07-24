import { supabase } from '../Lib/supabase';

export type LastLoggedWeight = {
  weightLbs: number;
  reps: number | null;
  loggedAt: string;
} | null;

export async function getLastLoggedWeight(
  userId: string,
  exerciseName: string,
): Promise<LastLoggedWeight> {
  const target = exerciseName.toLowerCase().trim();
  if (!userId || !target) return null;
  try {
    const { data, error } = await supabase
      .from('workout_logs')
      .select('logged_at, sets_json')
      .eq('user_id', userId)
      .not('skipped', 'is', true)
      .order('logged_at', { ascending: false })
      .limit(50);
    if (error || !data) return null;

    for (const log of data) {
      const raw = log.sets_json;
      const sets: Array<Record<string, unknown>> = Array.isArray(raw)
        ? raw
        : typeof raw === 'string'
          ? (() => {
              try {
                const p = JSON.parse(raw);
                return Array.isArray(p) ? p : [];
              } catch {
                return [];
              }
            })()
          : [];
      const matching = sets.filter((s) => {
        const name = String(s.exerciseName ?? s.name ?? '').toLowerCase().trim();
        return name === target && Number(s.weightLbs ?? 0) > 0;
      });
      if (matching.length === 0) continue;
      const top = Math.max(...matching.map((s) => Number(s.weightLbs)));
      const topSet = matching.find((s) => Number(s.weightLbs) === top);
      return {
        weightLbs: top,
        reps: topSet?.reps != null ? Number(topSet.reps) : null,
        loggedAt: String(log.logged_at),
      };
    }
    return null;
  } catch {
    return null;
  }
}

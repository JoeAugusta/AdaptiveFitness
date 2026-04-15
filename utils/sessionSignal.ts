import { supabase } from '../Lib/supabase';

export type SessionSignal = 'high_fatigue' | 'low_fatigue' | 'on_target' | null;

export interface SessionSignalResult {
  signal: SessionSignal;
  avgRpe: number;
  fatigueRating: number; // session_fatigue_rating 1–5
  lastSessionTitle: string;
}

/** Reads the most recent workout_log for this plan+week and returns a fatigue signal. */
export async function getSessionSignal(
  planId: string,
  weekNumber: number,
): Promise<SessionSignalResult | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('workout_logs')
    .select('sets_json, session_fatigue_rating, day_number, logged_at')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('week_number', weekNumber)
    .order('logged_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const raw = data.sets_json;
  const sets: { rpe?: number }[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw) as { rpe?: number }[];
          } catch {
            return [];
          }
        })()
      : [];

  const loggedRpes = sets.map((s) => Number(s.rpe ?? 0)).filter((r) => r > 0);
  if (loggedRpes.length === 0) return null;

  const avgRpe = loggedRpes.reduce((a, b) => a + b, 0) / loggedRpes.length;
  const fatigueRating: number = data.session_fatigue_rating ?? 3;

  let signal: SessionSignal = null;
  if (avgRpe > 8.5 && fatigueRating <= 2) signal = 'high_fatigue';
  else if (avgRpe < 6.0 && fatigueRating >= 4) signal = 'low_fatigue';
  else if (avgRpe >= 7.0 && avgRpe <= 8.5) signal = 'on_target';

  const dayNum = data.day_number;
  const lastSessionTitle =
    typeof dayNum === 'number' ? `Day ${dayNum}` : 'Last session';

  return {
    signal,
    avgRpe: Math.round(avgRpe * 10) / 10,
    fatigueRating,
    lastSessionTitle,
  };
}

/** Jordan card copy keyed by signal. */
export const PRE_SESSION_COPY: Record<Exclude<SessionSignal, null>, string> = {
  high_fatigue:
    'Your last session ran hot — execute clean today. Hit your rep targets without chasing extra load.',
  low_fatigue:
    'You had plenty left in the tank last session — today we use it. Push the top of your rep ranges.',
  on_target: 'Last session dialled in well. Same approach today — trust the targets.',
};

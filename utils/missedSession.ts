import { supabase } from '../Lib/supabase';

export interface MissedSessionResult {
  isMissed: boolean;
  missedSession: {
    dayNumber: number;
    title: string;
    muscleGroups: string[];
  } | null;
  canReschedule: boolean; // true = tomorrow is a rest day
  tomorrowDayLabel: string;
}

/** `plan_json.weeks` entries may use weekNumber, week_number, or number */
function getPlanWeekNumber(w: unknown): number | undefined {
  if (!w || typeof w !== 'object') return undefined;
  const o = w as { weekNumber?: unknown; week_number?: unknown; number?: unknown };
  const n = o.weekNumber ?? o.week_number ?? o.number;
  return typeof n === 'number' && !Number.isNaN(n) ? n : undefined;
}

export async function checkMissedSession(
  _planId: string,
  _weekNumber: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _planJson: any,
): Promise<MissedSessionResult> {
  // TODO: Missed-session detection is temporarily disabled.
  // The previous implementation mapped today's weekday label to a workout session
  // via scheduledDays.indexOf(todayLabel), which produced false positives for
  // users who started their plan mid-week (e.g. starting on Wednesday meant
  // the detector expected session 2 instead of session 1).
  // This needs to be rewritten to use completion-count anchoring (same as
  // resolveTodayWorkout in HomeScreen) before it can be re-enabled.
  // A false "missed workout" message is worse UX than no missed-workout detection.
  return {
    isMissed: false,
    missedSession: null,
    canReschedule: false,
    tomorrowDayLabel: '',
  };
}

/** Marks a session as skipped by inserting a placeholder workout_log. */
export async function markSessionSkipped(
  planId: string,
  weekNumber: number,
  dayNumber: number,
  userId: string,
): Promise<void> {
  await supabase.from('workout_logs').insert({
    plan_id: planId,
    user_id: userId,
    week_number: weekNumber,
    day_number: dayNumber,
    sets_json: [],
    session_fatigue_rating: null,
    skipped: true,
    logged_at: new Date().toISOString(),
  });
}

/** Rescheduled: updates plan_json to move the missed session's dayNumber
 *  so it aligns with tomorrow. Does not change exercises — only the dayNumber
 *  and title date context. */
export async function rescheduleSession(
  planId: string,
  weekNumber: number,
  dayNumber: number,
  tomorrowLabel: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  planJson: any,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatedWeeks = (planJson.weeks ?? []).map((w: any) => {
    const wn = getPlanWeekNumber(w);
    if (wn !== weekNumber) return w;
    return {
      ...w,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      days: (w.days ?? []).map((d: any) => {
        if (d.dayNumber !== dayNumber) return d;
        return { ...d, rescheduledTo: tomorrowLabel };
      }),
    };
  });

  await supabase
    .from('plans')
    .update({ plan_json: { ...planJson, weeks: updatedWeeks } })
    .eq('id', planId);
}

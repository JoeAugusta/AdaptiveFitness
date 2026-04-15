import { supabase } from '../Lib/supabase';
import { getTodayDayLabel } from './dateUtils';

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

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getTomorrowDayLabel(todayLabel: string): string {
  const idx = DAY_ORDER.indexOf(todayLabel);
  return DAY_ORDER[(idx + 1) % 7];
}

/** `plan_json.weeks` entries may use weekNumber, week_number, or number */
function getPlanWeekNumber(w: unknown): number | undefined {
  if (!w || typeof w !== 'object') return undefined;
  const o = w as { weekNumber?: unknown; week_number?: unknown; number?: unknown };
  const n = o.weekNumber ?? o.week_number ?? o.number;
  return typeof n === 'number' && !Number.isNaN(n) ? n : undefined;
}

/** Returns true if current local time is past 8pm — training window has closed. */
function isTrainingWindowClosed(): boolean {
  return new Date().getHours() >= 20;
}

export async function checkMissedSession(
  planId: string,
  weekNumber: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  planJson: any,
): Promise<MissedSessionResult> {
  const empty: MissedSessionResult = {
    isMissed: false,
    missedSession: null,
    canReschedule: false,
    tomorrowDayLabel: '',
  };

  // Only check after 8pm
  if (!isTrainingWindowClosed()) return empty;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return empty;

  const todayLabel = getTodayDayLabel();
  const scheduledDays: string[] = planJson.scheduledDays ?? [];

  // Only relevant if today was a scheduled training day
  if (!scheduledDays.includes(todayLabel)) return empty;

  // Find today's workout session in the current week
  const currentWeekObj = planJson.weeks?.find(
    (w: unknown) => getPlanWeekNumber(w) === weekNumber,
  );
  if (!currentWeekObj) return empty;

  // Map scheduled training days to day objects by position
  const workoutDays = (currentWeekObj as { days?: unknown[] }).days?.filter(
    (d: unknown) => (d as { type?: string }).type === 'workout',
  ) ?? [];
  const todayIndex = scheduledDays.indexOf(todayLabel);
  const todaySession = (workoutDays[todayIndex] ?? null) as {
    dayNumber?: number;
    title?: string;
    muscleGroups?: string[];
  } | null;
  if (!todaySession || typeof todaySession.dayNumber !== 'number') return empty;

  // Check if today's session was already logged
  const { data: log } = await supabase
    .from('workout_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('week_number', weekNumber)
    .eq('day_number', todaySession.dayNumber)
    .maybeSingle();

  if (log) return empty; // Already logged — not missed

  // Confirmed missed. Check if tomorrow is a rest day (window available)
  const tomorrowLabel = getTomorrowDayLabel(todayLabel);
  const canReschedule = !scheduledDays.includes(tomorrowLabel);

  return {
    isMissed: true,
    missedSession: {
      dayNumber: todaySession.dayNumber,
      title: String(todaySession.title ?? ''),
      muscleGroups: todaySession.muscleGroups ?? [],
    },
    canReschedule,
    tomorrowDayLabel: tomorrowLabel,
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

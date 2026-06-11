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
  missedDayLabel: string;
}

const ALL_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const EMPTY_MISSED_RESULT: MissedSessionResult = {
  isMissed: false,
  missedSession: null,
  canReschedule: false,
  tomorrowDayLabel: '',
  missedDayLabel: '',
};

/** Map a Mon–Sun label to a Date in the current calendar week (local noon). */
export function missedDayLabelToDate(missedDayLabel: string): Date | undefined {
  const label = missedDayLabel.trim().slice(0, 3);
  const labelIdx = ALL_LABELS.indexOf(label as (typeof ALL_LABELS)[number]);
  if (labelIdx < 0) return undefined;
  const todayLabel = DAY_NAMES[new Date().getDay()];
  const todayIdx = ALL_LABELS.indexOf(todayLabel as (typeof ALL_LABELS)[number]);
  if (todayIdx < 0 || labelIdx >= todayIdx) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - (todayIdx - labelIdx));
  d.setHours(12, 0, 0, 0);
  return d;
}

/** `plan_json.weeks` entries may use weekNumber, week_number, or number */
function getPlanWeekNumber(w: unknown): number | undefined {
  if (!w || typeof w !== 'object') return undefined;
  const o = w as { weekNumber?: unknown; week_number?: unknown; number?: unknown };
  const n = o.weekNumber ?? o.week_number ?? o.number;
  return typeof n === 'number' && !Number.isNaN(n) ? n : undefined;
}

export async function checkMissedSession(
  planId: string,
  weekNumber: number,
  planJson: Record<string, unknown>,
): Promise<MissedSessionResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return EMPTY_MISSED_RESULT;

    // Get completed/skipped day numbers for this week
    const { data: logs } = await supabase
      .from('workout_logs')
      .select('day_number, skipped')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .eq('week_number', weekNumber);

    const loggedDayNumbers = new Set(
      (logs ?? []).map((l: { day_number: number }) => l.day_number),
    );

    // Get current week's days from plan_json
    const weeks = (planJson.weeks ?? []) as Array<{
      weekNumber?: number;
      week_number?: number;
      days?: Array<{
        dayNumber: number;
        type: string;
        title?: string;
        muscleGroups?: string[];
        dayLabel?: string;
      }>;
    }>;

    const weekData = weeks.find((w) => getPlanWeekNumber(w) === weekNumber) ?? weeks[0];
    if (!weekData?.days) return EMPTY_MISSED_RESULT;

    const allDays = weekData.days;
    const workoutDays = allDays.filter((d) => d.type === 'workout');

    // Map plan days to calendar labels using scheduledDays
    const scheduledDays = (planJson.scheduledDays ?? []) as string[];
    if (scheduledDays.length === 0) return EMPTY_MISSED_RESULT;

    const firstScheduledIdx = ALL_LABELS.indexOf(scheduledDays[0].trim().slice(0, 3) as (typeof ALL_LABELS)[number]);
    if (firstScheduledIdx < 0) return EMPTY_MISSED_RESULT;

    // Map each plan day to a calendar label
    const orderedDays = [...allDays].sort((a, b) => a.dayNumber - b.dayNumber);
    const dayNumberToLabel: Record<number, string> = {};
    orderedDays.forEach((day, idx) => {
      dayNumberToLabel[day.dayNumber] = ALL_LABELS[(firstScheduledIdx + idx) % 7];
    });

    // Today's label
    const todayLabel = DAY_NAMES[new Date().getDay()];
    const todayIdx = ALL_LABELS.indexOf(todayLabel as (typeof ALL_LABELS)[number]);

    // Find workout days that have passed (calendar day < today) and aren't logged
    const missedWorkoutDays = workoutDays.filter((d) => {
      if (loggedDayNumbers.has(d.dayNumber)) return false;
      const label = dayNumberToLabel[d.dayNumber];
      if (!label) return false;
      const labelIdx = ALL_LABELS.indexOf(label as (typeof ALL_LABELS)[number]);
      return labelIdx >= 0 && labelIdx < todayIdx;
    });

    if (missedWorkoutDays.length === 0) {
      return EMPTY_MISSED_RESULT;
    }

    // Most recent missed session
    const mostRecent = missedWorkoutDays[missedWorkoutDays.length - 1];

    // Check if there's a non-training day remaining this week (after today, before week end)
    const trainingLabelSet = new Set(
      workoutDays.map((d) => dayNumberToLabel[d.dayNumber]).filter(Boolean),
    );

    // Find rest days between today (exclusive) and end of week (Sun inclusive)
    const restDaysRemaining = ALL_LABELS.filter((label) => {
      const labelIdx = ALL_LABELS.indexOf(label);
      return labelIdx > todayIdx && !trainingLabelSet.has(label);
    });

    const canReschedule = restDaysRemaining.length > 0;
    const tomorrowDayLabel = canReschedule ? restDaysRemaining[0] : '';
    const missedDayLabel = dayNumberToLabel[mostRecent.dayNumber] ?? '';

    return {
      isMissed: true,
      missedSession: {
        dayNumber: mostRecent.dayNumber,
        title: mostRecent.title ?? 'Missed Session',
        muscleGroups: mostRecent.muscleGroups ?? [],
      },
      canReschedule,
      tomorrowDayLabel,
      missedDayLabel,
    };
  } catch (e) {
    console.error('[checkMissedSession]', e);
    return EMPTY_MISSED_RESULT;
  }
}

/** Marks a session as skipped by inserting a placeholder workout_log. */
export async function markSessionSkipped(
  planId: string,
  weekNumber: number,
  dayNumber: number,
  userId: string,
  missedDate?: Date,
): Promise<void> {
  // Use the missed session's date so the skip row doesn't
  // appear as today's workout on HomeScreen
  const loggedAt = missedDate ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  })();
  await supabase.from('workout_logs').insert({
    plan_id: planId,
    user_id: userId,
    week_number: weekNumber,
    day_number: dayNumber,
    sets_json: [],
    session_fatigue_rating: null,
    skipped: true,
    logged_at: loggedAt.toISOString(),
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

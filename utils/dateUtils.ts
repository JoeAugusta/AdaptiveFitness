// BUG-8: Day-of-week helpers for dashboard training vs rest (local calendar, matches onboarding day labels).

/**
 * Get today's day of week as a string matching plan scheduled days.
 * Uses local date (timezone-safe) — same pattern as BUG-2 streak fix.
 * Returns: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
 */
export function getTodayDayLabel(): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();
  return days[today.getDay()];
}

/**
 * Given the plan's scheduled training days array and today's label,
 * returns whether today is a training day.
 *
 * @param scheduledDays - array of day labels from plan e.g. ['Mon','Wed','Fri']
 * @param todayLabel - today's day label from getTodayDayLabel()
 */
export function isTodayTrainingDay(
  scheduledDays: string[],
  todayLabel: string,
): boolean {
  return scheduledDays.includes(todayLabel);
}

/**
 * Given the plan's scheduled training days and today's label,
 * returns the next upcoming training day label and how many
 * days away it is.
 *
 * @returns { dayLabel: string; daysAway: number; displayName: string }
 * displayName examples: 'Tomorrow', 'Wednesday', 'Monday'
 */
export function getNextTrainingDay(
  scheduledDays: string[],
  todayLabel: string,
): { dayLabel: string; daysAway: number; displayName: string } {
  const dayOrder = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fullNames: Record<string, string> = {
    Sun: 'Sunday',
    Mon: 'Monday',
    Tue: 'Tuesday',
    Wed: 'Wednesday',
    Thu: 'Thursday',
    Fri: 'Friday',
    Sat: 'Saturday',
  };

  const todayIndex = dayOrder.indexOf(todayLabel);

  for (let i = 1; i <= 7; i++) {
    const checkIndex = (todayIndex + i) % 7;
    const checkDay = dayOrder[checkIndex];
    if (scheduledDays.includes(checkDay)) {
      return {
        dayLabel: checkDay,
        daysAway: i,
        displayName: i === 1 ? 'Tomorrow' : fullNames[checkDay],
      };
    }
  }

  // Fallback — should never hit if scheduledDays is non-empty
  return { dayLabel: scheduledDays[0], daysAway: 1, displayName: 'Tomorrow' };
}

const CALENDAR_DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * True if today is on or after the last training day of the weekly split (Sun–Sat order).
 * Note: used where "through end of week" semantics apply; week-complete dashboard CTAs
 * use {@link isLastScheduledTrainingDayToday} instead so early finishers still see
 * calendar rest cards Wed–Sun (BUG-8 / week-complete timing).
 */
export function isPastLastTrainingDay(
  scheduledDays: string[],
  todayLabel: string,
): boolean {
  const todayIndex = CALENDAR_DAY_ORDER.indexOf(
    todayLabel as (typeof CALENDAR_DAY_ORDER)[number],
  );
  const trainingIndices = scheduledDays
    .map((d) => CALENDAR_DAY_ORDER.indexOf(d as (typeof CALENDAR_DAY_ORDER)[number]))
    .filter((i) => i !== -1);
  if (trainingIndices.length === 0) return true;
  const lastTrainingIndex = Math.max(...trainingIndices);
  if (todayIndex === -1) return true;
  return todayIndex >= lastTrainingIndex;
}

/**
 * True only on the chronologically last scheduled lifting day (e.g. Tue for Mon–Tue).
 * Gates "generate next week" / week-complete hero so Tue night shows the CTA, Wed–Sun
 * show normal calendar rest cards when sessions were finished early.
 */
export function isLastScheduledTrainingDayToday(
  scheduledDays: string[],
  todayLabel: string,
): boolean {
  const todayIndex = CALENDAR_DAY_ORDER.indexOf(
    todayLabel as (typeof CALENDAR_DAY_ORDER)[number],
  );
  const trainingIndices = scheduledDays
    .map((d) => CALENDAR_DAY_ORDER.indexOf(d as (typeof CALENDAR_DAY_ORDER)[number]))
    .filter((i) => i !== -1);
  if (trainingIndices.length === 0) return true;
  const lastTrainingIndex = Math.max(...trainingIndices);
  if (todayIndex === -1) return true;
  return todayIndex === lastTrainingIndex;
}

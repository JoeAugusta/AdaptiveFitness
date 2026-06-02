// BUG-8: Day-of-week helpers for dashboard training vs rest (local calendar, matches onboarding day labels).

const CALENDAR_DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const DAY_LABEL_ALIASES: Record<string, (typeof CALENDAR_DAY_ORDER)[number]> = {
  sun: 'Sun',
  sunday: 'Sun',
  mon: 'Mon',
  monday: 'Mon',
  tue: 'Tue',
  tues: 'Tue',
  tuesday: 'Tue',
  wed: 'Wed',
  wednesday: 'Wed',
  thu: 'Thu',
  thur: 'Thu',
  thurs: 'Thu',
  thursday: 'Thu',
  fri: 'Fri',
  friday: 'Fri',
  sat: 'Sat',
  saturday: 'Sat',
};

/** Local calendar date as YYYY-MM-DD (no UTC conversion). */
export function localDateISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function normalizeScheduledDayLabel(raw: string): string | null {
  const key = String(raw ?? '').trim().toLowerCase();
  if (!key) return null;
  return DAY_LABEL_ALIASES[key] ?? null;
}

/** Map plan scheduledDays (Mon or Monday) to short labels used across the app. */
export function normalizeScheduledDays(scheduledDays: string[]): string[] {
  const out: string[] = [];
  for (const d of scheduledDays) {
    const norm = normalizeScheduledDayLabel(d);
    if (norm && !out.includes(norm)) out.push(norm);
  }
  return out;
}

/**
 * Get today's day of week as a string matching plan scheduled days.
 * Uses local date (timezone-safe) — same pattern as BUG-2 streak fix.
 * Returns: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
 */
export function getTodayDayLabel(): string {
  return CALENDAR_DAY_ORDER[new Date().getDay()];
}

export type FirstSessionDateResult = {
  firstSessionDate: Date;
  dateStr: string;
  isToday: boolean;
  displayLine: string;
};

/**
 * First lifting session: today if today is a training day, otherwise the next
 * calendar day that matches scheduledDays.
 */
export function computeFirstSessionDate(
  scheduledDays: string[],
): FirstSessionDateResult | null {
  const normalized = normalizeScheduledDays(scheduledDays);
  if (normalized.length === 0) return null;

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const todayLabel = getTodayDayLabel();

  let firstSessionDate: Date;
  let isToday: boolean;

  if (normalized.includes(todayLabel)) {
    firstSessionDate = new Date(today);
    isToday = true;
  } else {
    const next = getNextTrainingDay(normalized, todayLabel);
    firstSessionDate = new Date(today);
    firstSessionDate.setDate(today.getDate() + next.daysAway);
    isToday = false;
  }

  const weekday = firstSessionDate.toLocaleDateString('en-US', {
    weekday: 'long',
  });
  const monthDay = firstSessionDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
  const displayLine = isToday
    ? `Your first session is today, ${weekday} ${monthDay}`
    : `Your first session is ${weekday}, ${monthDay}`;

  return {
    firstSessionDate,
    dateStr: localDateISO(firstSessionDate),
    isToday,
    displayLine,
  };
}

/** True when plan.start_date (YYYY-MM-DD) is today or in the past. */
export function isPlanStartDateReached(startDate: string | null | undefined): boolean {
  if (!startDate || String(startDate).trim() === '') return true;
  const dateOnly = String(startDate).split('T')[0];
  const todayStr = localDateISO(new Date());
  return dateOnly <= todayStr;
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
  const dayOrder = [...CALENDAR_DAY_ORDER];
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

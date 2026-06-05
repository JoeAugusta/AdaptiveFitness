// BUG-8: Day-of-week helpers for dashboard training vs rest (local calendar, matches onboarding day labels).

// DEV-only date override — persisted in AsyncStorage across
// Metro reloads. Never active in production builds.
let _devDateOverride: Date | null = null;

export function setDevDateOverride(date: Date | null): void {
  if (__DEV__) _devDateOverride = date;
}

export function getDevDateOverride(): Date | null {
  return __DEV__ ? _devDateOverride : null;
}

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
export function getLocalDateString(date?: Date): string {
  const d = date ?? (__DEV__ && _devDateOverride
    ? new Date(_devDateOverride)
    : new Date());
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** @deprecated Prefer getLocalDateString — same behavior */
export function localDateISO(d: Date = new Date()): string {
  return getLocalDateString(d);
}

export function getLocalDate(): Date {
  if (__DEV__ && _devDateOverride) return new Date(_devDateOverride);
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function getNextScheduledDay(
  scheduledDays: string[],
  fromDate: Date = getLocalDate(),
): string {
  const normalized = normalizeScheduledDays(scheduledDays);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 0; i < 7; i++) {
    const candidate = new Date(fromDate);
    candidate.setDate(fromDate.getDate() + i);
    const dayName = dayNames[candidate.getDay()];
    if (normalized.includes(dayName)) {
      return getLocalDateString(candidate);
    }
  }

  const tomorrow = new Date(fromDate);
  tomorrow.setDate(fromDate.getDate() + 1);
  return getLocalDateString(tomorrow);
}

/**
 * Returns the date string (YYYY-MM-DD) of the first scheduled training
 * day in the current calendar week (Mon–Sun). Used as start_date anchor
 * so the plan's day sequence maps correctly to calendar days even when
 * the user starts mid-week.
 *
 * If the first scheduled day already passed this week, returns that
 * past date. If no scheduled days, returns today.
 */
export function getWeekAnchorDate(scheduledDays: string[]): string {
  const normalized = normalizeScheduledDays(scheduledDays);
  if (normalized.length === 0) return getLocalDateString();

  const today = new Date();
  const todayDow = today.getDay(); // 0=Sun, 1=Mon ... 6=Sat

  const DOW_MAP: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  // Find the earliest scheduled day in the current Mon–Sun week
  // We define "this week" as the Mon that contains today.
  const mondayOffset = todayDow === 0 ? -6 : 1 - todayDow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  monday.setHours(12, 0, 0, 0);

  let earliestDate: Date | null = null;
  for (const day of normalized) {
    const dow = DOW_MAP[day];
    if (dow === undefined) continue;
    // Days offset from Monday (Mon=0 ... Sun=6 in ISO week)
    const isoDow = dow === 0 ? 6 : dow - 1;
    const candidate = new Date(monday);
    candidate.setDate(monday.getDate() + isoDow);
    if (!earliestDate || candidate < earliestDate) {
      earliestDate = candidate;
    }
  }

  return earliestDate ? getLocalDateString(earliestDate) : getLocalDateString();
}

export function isTodayScheduled(scheduledDays: string[]): boolean {
  const normalized = normalizeScheduledDays(scheduledDays);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayName = dayNames[new Date().getDay()];
  return normalized.includes(todayName);
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
  const d = __DEV__ && _devDateOverride
    ? new Date(_devDateOverride)
    : new Date();
  return CALENDAR_DAY_ORDER[d.getDay()];
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
    dateStr: getLocalDateString(firstSessionDate),
    isToday,
    displayLine,
  };
}

/** True when plan.start_date (YYYY-MM-DD) is today or in the past. */
export function isPlanStartDateReached(startDate: string | null | undefined): boolean {
  if (!startDate || String(startDate).trim() === '') return true;
  const dateOnly = String(startDate).split('T')[0];
  const todayStr = getLocalDateString(new Date());
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

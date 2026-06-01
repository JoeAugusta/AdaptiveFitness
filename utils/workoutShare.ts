import { stripEmDash } from './jordanText';

type LogSet = {
  weightLbs?: number;
  weight?: number;
  reps?: number;
  rpe?: number;
};

export function computeSessionShareStats(sets: LogSet[]): {
  totalSets: number;
  avgRpe: number;
  volumeLbs: number;
} {
  const totalSets = sets.length;
  const rpeValues = sets
    .map((s) => Number(s.rpe ?? 0))
    .filter((r) => r > 0);
  const avgRpe =
    rpeValues.length > 0
      ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length
      : 0;

  let volumeLbs = 0;
  for (const s of sets) {
    const w = Number(s.weightLbs ?? s.weight ?? 0);
    const r = Number(s.reps ?? 0);
    if (w > 0 && r > 0) volumeLbs += w * r;
  }

  return { totalSets, avgRpe, volumeLbs: Math.round(volumeLbs) };
}

export function fallbackJordanNoteFromRpe(avgRpe: number): string {
  if (avgRpe <= 0 || avgRpe < 7) {
    return 'Solid session. Loads will increase next week.';
  }
  if (avgRpe <= 8) {
    return 'Right on target. Keep this up.';
  }
  return 'Tough session. Recovery is part of the process.';
}

/** At most two sentences for share card copy. */
export function truncateJordanNoteForShare(text: string): string {
  const cleaned = stripEmDash(text).trim();
  if (!cleaned) return '';
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length <= 2) return cleaned;
  return sentences.slice(0, 2).join(' ');
}

export function resolveSessionTitleFromPlan(
  planJson: unknown,
  weekNumber: number,
  dayNumber: number,
): string {
  type PlanDay = { dayNumber?: number; title?: string; label?: string };
  type PlanWeek = { weekNumber?: number; days?: PlanDay[] };
  const weeks =
    planJson &&
    typeof planJson === 'object' &&
    planJson !== null &&
    'weeks' in planJson &&
    Array.isArray((planJson as { weeks: unknown }).weeks)
      ? ((planJson as { weeks: PlanWeek[] }).weeks ?? [])
      : [];
  const weekData = weeks.find((w) => Number(w.weekNumber) === weekNumber);
  const dayData = (weekData?.days ?? []).find(
    (d) => Number(d.dayNumber) === dayNumber,
  );
  const title = String(dayData?.title ?? dayData?.label ?? '').trim();
  return title || `Day ${dayNumber}`;
}

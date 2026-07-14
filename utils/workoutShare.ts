import { stripEmDash } from './jordanText';

type LogSet = {
  exerciseName?: string;
  weightLbs?: number;
  weight?: number;
  reps?: number;
  rpe?: number;
};

export type ShareTopLift = {
  exerciseName: string;
  weightLbs: number;
  reps: number;
  /** When no weighted sets — show sets completed instead */
  setsCompleted?: number;
  isPr?: boolean;
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

/** Top 2–3 exercises by max weight; bodyweight fallback by set count. */
export function computeTopLiftsFromSets(sets: LogSet[]): ShareTopLift[] {
  const byExercise = new Map<
    string,
    { maxWeight: number; repsAtMax: number; setCount: number }
  >();

  for (const s of sets) {
    const name = String(s.exerciseName ?? '').trim();
    if (!name || name === 'session_summary') continue;

    const w = Number(s.weightLbs ?? s.weight ?? 0);
    const r = Number(s.reps ?? 0);
    const prev = byExercise.get(name) ?? {
      maxWeight: 0,
      repsAtMax: 0,
      setCount: 0,
    };
    prev.setCount += 1;
    if (w > prev.maxWeight) {
      prev.maxWeight = w;
      prev.repsAtMax = r;
    } else if (w === prev.maxWeight && r > prev.repsAtMax) {
      prev.repsAtMax = r;
    }
    byExercise.set(name, prev);
  }

  const weighted = [...byExercise.entries()]
    .filter(([, v]) => v.maxWeight > 0)
    .map(([exerciseName, v]) => ({
      exerciseName,
      weightLbs: Math.round(v.maxWeight),
      reps: v.repsAtMax,
    }))
    .sort((a, b) => b.weightLbs - a.weightLbs)
    .slice(0, 3);

  if (weighted.length > 0) return weighted;

  return [...byExercise.entries()]
    .map(([exerciseName, v]) => ({
      exerciseName,
      weightLbs: 0,
      reps: 0,
      setsCompleted: v.setCount,
    }))
    .sort((a, b) => (b.setsCompleted ?? 0) - (a.setsCompleted ?? 0))
    .slice(0, 3);
}

export function formatShareLiftLine(lift: ShareTopLift): string {
  if (lift.weightLbs > 0) {
    const repsLabel = lift.reps > 0 ? `${lift.reps} reps` : 'reps';
    return `${lift.weightLbs.toLocaleString('en-US')} lbs × ${repsLabel}`;
  }
  const n = lift.setsCompleted ?? 0;
  return `${n} ${n === 1 ? 'set' : 'sets'} completed`;
}

/** Compact lift line for share cards — matches mockup ("305 lbs x 3"). */
export function formatShareLiftLineCompact(lift: ShareTopLift): string {
  if (lift.weightLbs > 0) {
    const repsPart = lift.reps > 0 ? `${lift.reps}` : '—';
    return `${lift.weightLbs.toLocaleString('en-US')} lbs x ${repsPart}`;
  }
  const n = lift.setsCompleted ?? 0;
  return `${n} ${n === 1 ? 'set' : 'sets'}`;
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

/** One sentence for share card copy. */
export function truncateJordanNoteForShare(text: string): string {
  const cleaned = stripEmDash(text).trim();
  if (!cleaned) return '';
  const first = cleaned.split('. ')[0]?.trim() ?? cleaned;
  if (/[.!?]$/.test(first)) return first;
  return `${first}.`;
}

type PlanSetTarget = { setNumber?: number; targetWeight?: number };
type PlanExerciseForPr = {
  id?: string;
  name?: string;
  targetWeight?: number;
  sets?: number;
  setTargets?: PlanSetTarget[];
};

type PlanDay = {
  dayNumber?: number;
  title?: string;
  label?: string;
  exercises?: PlanExerciseForPr[];
};
type PlanWeek = { weekNumber?: number; days?: PlanDay[] };

function getPlanWeekDay(
  planJson: unknown,
  weekNumber: number,
  dayNumber: number,
): PlanDay | undefined {
  const weeks =
    planJson &&
    typeof planJson === 'object' &&
    planJson !== null &&
    'weeks' in planJson &&
    Array.isArray((planJson as { weeks: unknown }).weeks)
      ? ((planJson as { weeks: PlanWeek[] }).weeks ?? [])
      : [];
  const weekData = weeks.find((w) => Number(w.weekNumber) === weekNumber);
  return (weekData?.days ?? []).find((d) => Number(d.dayNumber) === dayNumber);
}

export function getPlanDayExercises(
  planJson: unknown,
  weekNumber: number,
  dayNumber: number,
): PlanExerciseForPr[] {
  const dayData = getPlanWeekDay(planJson, weekNumber, dayNumber);
  return Array.isArray(dayData?.exercises) ? dayData.exercises : [];
}

export function resolveSessionTitleFromPlan(
  planJson: unknown,
  weekNumber: number,
  dayNumber: number,
): string {
  const dayData = getPlanWeekDay(planJson, weekNumber, dayNumber);
  const title = String(dayData?.title ?? dayData?.label ?? '').trim();
  return title || `Day ${dayNumber}`;
}

/** Strength-programme primary lift — fixed intra-cycle periodisation (reps/RPE), not AI-driven. */
// deno-lint-ignore no-explicit-any
import { isStrengthGoalTargetLift } from './setStructure.ts';

export type StrengthPeriodisationRow = {
  sets: number;
  reps: number;
  targetRpe: number;
};

export function strengthPeriodisationWeek(weekInCycle: number): StrengthPeriodisationRow {
  switch (weekInCycle) {
    case 1:
      return { sets: 5, reps: 5, targetRpe: 7.0 };
    case 2:
      return { sets: 4, reps: 4, targetRpe: 8.0 };
    case 3:
      return { sets: 3, reps: 3, targetRpe: 8.5 };
    case 4:
      return { sets: 3, reps: 5, targetRpe: 6.0 };
    default:
      return { sets: 5, reps: 5, targetRpe: 7.0 };
  }
}

export function strengthWeekInCycle(weekNumber: number, deloadCycle: number): number {
  const c = deloadCycle > 0 ? deloadCycle : 4;
  return ((weekNumber - 1) % c) + 1;
}

/** Alias naming used in prompts / docs (same lookup as strengthPeriodisationWeek). */
export const strengthPeriodisation = strengthPeriodisationWeek;

/**
 * After weight math: force straight sets, drop setTargets, stamp sets/reps/targetRpe from periodisation.
 */
// deno-lint-ignore no-explicit-any
export function finalizeStrengthTargetLiftPeriodisationOnDays(
  days: any[] | undefined,
  goal: string,
  goalLift: string | null | undefined,
  weekNumber: number,
  deloadCycle: number,
): any[] {
  if (goal !== 'strength' || !goalLift || String(goalLift).trim() === '') {
    return days ?? [];
  }

  const wic = strengthWeekInCycle(weekNumber, deloadCycle);
  const p = strengthPeriodisationWeek(wic);
  const repsStr = String(p.reps);

  return (days ?? []).map((day: any) => {
    if (day.type !== 'workout') return day;
    return {
      ...day,
      exercises: (day.exercises ?? []).map((ex: any) => {
        if (!isStrengthGoalTargetLift(ex, goalLift)) return ex;
        const next = { ...ex };
        delete next.setTargets;
        next.setStructure = 'straight';
        next.sets = p.sets;
        next.reps = repsStr;
        next.targetRpe = p.targetRpe;
        return next;
      }),
    };
  });
}

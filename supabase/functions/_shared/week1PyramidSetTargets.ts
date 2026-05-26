/** Week 1 pyramid per-set anchors after setStructure/targetWeight stamping (generate-plan only). */

export type Week1PyramidTargetSet = {
  setNumber: number;
  targetWeight: number;
  targetRpe: number;
  targetReps: string;
};

const roundTen = (w: number) => Math.round(w / 10) * 10;
const roundPlate = (w: number) => Math.round(w / 2.5) * 2.5;

/**
 * Builds per-set targets for a pyramid at anchor weight T when setCount is 3, 4, or 5 (exact W1 formulas).
 */
export function buildWeek1PyramidSetTargets(
  targetWeightAnchor: number,
  setCount: number,
  targetReps: string,
  targetRpeHint: number,
): Week1PyramidTargetSet[] | null {
  const T = Number(targetWeightAnchor);
  if (!Number.isFinite(T) || T <= 0) return null;
  const n = Math.floor(setCount);
  if (!(n === 3 || n === 4 || n === 5)) return null;

  const rawRpe = Number(targetRpeHint);
  const topRpe = Number.isFinite(rawRpe) ? rawRpe : 8;
  const secondaryRpe = topRpe - 1;

  let weights: number[];
  let topIndex: number;

  if (n === 3) {
    weights = [roundTen(T * 0.8), roundTen(T * 0.9), roundPlate(T)];
    topIndex = 2;
  } else if (n === 4) {
    weights = [
      roundTen(T * 0.75),
      roundTen(T * 0.85),
      roundTen(T * 0.92),
      roundPlate(T),
    ];
    topIndex = 3;
  } else {
    weights = [
      roundTen(T * 0.7),
      roundTen(T * 0.8),
      roundTen(T * 0.85),
      roundTen(T * 0.9),
      roundPlate(T),
    ];
    topIndex = 4;
  }

  const reps = typeof targetReps === 'string' ? targetReps : String(targetReps ?? '');

  return weights.map((targetWeight, i) => ({
    setNumber: i + 1,
    targetWeight,
    targetRpe: i === topIndex ? topRpe : secondaryRpe,
    targetReps: reps,
  }));
}

/** After setStructure is stamped — fills setTargets[] for pyramid W1 lifts with prescribed weight only. */
// deno-lint-ignore no-explicit-any
export function stampWeek1PyramidSetTargets(planJson: any): any {
  return {
    ...planJson,
    weeks: (planJson.weeks ?? []).map((week: any, weekIndex: number) => {
      const wNum = Number(week.weekNumber);
      const isWeek1 = wNum === 1 || (week.weekNumber == null && weekIndex === 0);
      if (!isWeek1) return week;

      return {
        ...week,
        days: (week.days ?? []).map((day: any) => {
          if (day.type === 'cardio') return day;
          if (!Array.isArray(day.exercises) || day.exercises.length === 0) return day;

          const exercises = (day.exercises as any[]).map((ex) => {
            if (ex?.setStructure !== 'pyramid') return ex;

            const weightNum = Number(ex.targetWeight ?? 0);
            if (!Number.isFinite(weightNum) || weightNum <= 0) return ex;

            const hasTargets =
              Array.isArray(ex.setTargets) &&
              ex.setTargets.length > 0;
            if (hasTargets) return ex;

            const setCount =
              typeof ex.sets === 'number' && Number.isFinite(ex.sets)
                ? ex.sets
                : NaN;
            if (!Number.isFinite(setCount) || setCount <= 0) return ex;

            const targets = buildWeek1PyramidSetTargets(
              weightNum,
              setCount,
              String(ex.reps ?? ''),
              Number(ex.targetRpe ?? 8),
            );
            if (targets == null) return ex;

            return { ...ex, setTargets: targets };
          });

          return { ...day, exercises };
        }),
      };
    }),
  };
}

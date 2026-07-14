/** Week 1 pyramid per-set anchors after setStructure/targetWeight stamping (generate-plan only). */

export type Week1PyramidTargetSet = {
  setNumber: number;
  targetWeight: number;
  targetRpe: number;
  targetReps: string;
};

const roundTen = (w: number) => Math.round(w / 10) * 10;
const roundPlate = (w: number) => Math.round(w / 5) * 5;

/**
 * Standard pyramid rep buckets keyed by top-set rep range.
 * Each array is ordered set 1 → top set.
 * The last entry is always the top set (repeated for sets near top).
 * 3-set pyramids use indices [2, 3, 4].
 * 4-set pyramids use indices [1, 2, 3, 4].
 * 5-set pyramids use indices [0, 1, 2, 3, 4].
 */
const PYRAMID_REP_BUCKETS: Record<string, string[]> = {
  // Strength
  '1-3': ['8-10', '6-8', '4-6', '2-4', '1-3'],
  '2-4': ['8-10', '6-8', '4-6', '2-4', '2-4'],
  '3-5': ['8-10', '6-8', '4-6', '3-5', '3-5'],
  '4-6': ['10-12', '8-10', '6-8', '4-6', '4-6'],
  '5-7': ['12-15', '10-12', '8-10', '5-7', '5-7'],
  // Moderate
  '6-8': ['12-15', '10-12', '8-10', '6-8', '6-8'],
  '6-10': ['12-15', '10-12', '8-10', '6-10', '6-10'],
  '8-10': ['15-20', '12-15', '10-12', '8-10', '8-10'],
  // Hypertrophy
  '8-12': ['15-20', '12-15', '10-12', '8-12', '8-12'],
  '10-12': ['15-20', '12-15', '10-12', '10-12', '10-12'],
  '10-15': ['15-20', '12-15', '10-15', '10-15', '10-15'],
};

/**
 * Returns the bucket array for the given top-set rep range.
 * Falls back to arithmetic +2 per step if no bucket found.
 */
function getPyramidRepLadder(topSetReps: string, setCount: number): string[] {
  const bucket = PYRAMID_REP_BUCKETS[topSetReps.trim()];
  if (bucket) {
    // bucket has 5 entries — slice the last setCount entries
    // so a 3-set pyramid gets the 3 entries closest to the top
    return bucket.slice(5 - setCount);
  }
  // Fallback: parse and step +2 per set from top
  const match = topSetReps.match(/^(\d+)(?:-(\d+))?/);
  const low = match ? parseInt(match[1], 10) : 8;
  const high = match ? parseInt(match[2] ?? match[1], 10) : 12;
  return Array.from({ length: setCount }, (_, i) => {
    const stepsFromTop = (setCount - 1) - i;
    if (stepsFromTop === 0) return topSetReps;
    return `${low + stepsFromTop * 2}-${high + stepsFromTop * 2}`;
  });
}

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

  // Determine if this is a strength rep range (top set ≤ 6 reps)
  // Strength pyramids use a tighter spread — all sets are working
  // sets. Hypertrophy pyramids use a wider spread where Set 1
  // serves as an extended warmup.
  const topSetLow = parseInt(targetReps.split(/[-–]/)[0] ?? '8', 10);
  const isStrengthPyramid = Number.isFinite(topSetLow) && topSetLow <= 6;

  if (n === 3) {
    weights = isStrengthPyramid
      ? [roundTen(T * 0.88), roundTen(T * 0.94), roundPlate(T)]
      : [roundTen(T * 0.80), roundTen(T * 0.90), roundPlate(T)];
    topIndex = 2;
  } else if (n === 4) {
    weights = isStrengthPyramid
      ? [
          roundTen(T * 0.85),
          roundTen(T * 0.90),
          roundTen(T * 0.95),
          roundPlate(T),
        ]
      : [
          roundTen(T * 0.75),
          roundTen(T * 0.85),
          roundTen(T * 0.92),
          roundPlate(T),
        ];
    topIndex = 3;
  } else {
    weights = isStrengthPyramid
      ? [
          roundTen(T * 0.82),
          roundTen(T * 0.87),
          roundTen(T * 0.91),
          roundTen(T * 0.95),
          roundPlate(T),
        ]
      : [
          roundTen(T * 0.70),
          roundTen(T * 0.80),
          roundTen(T * 0.85),
          roundTen(T * 0.90),
          roundPlate(T),
        ];
    topIndex = 4;
  }

  const reps = typeof targetReps === 'string' ? targetReps : String(targetReps ?? '');
  const repLadder = getPyramidRepLadder(reps, n);

  return weights.map((targetWeight, i) => ({
    setNumber: i + 1,
    targetWeight,
    targetRpe: i === topIndex ? topRpe : secondaryRpe,
    targetReps: repLadder[i],
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

            const hasTargets =
              Array.isArray(ex.setTargets) &&
              ex.setTargets.length > 0;

            const setCount =
              hasTargets
                ? ex.setTargets.length
                : typeof ex.sets === 'number' && Number.isFinite(ex.sets)
                  ? ex.sets
                  : NaN;
            if (!Number.isFinite(setCount) || setCount <= 0) return ex;

            // If setTargets already exist, apply rep ladder overlay only.
            if (hasTargets) {
              const repLadder = getPyramidRepLadder(String(ex.reps ?? ''), setCount);
              return {
                ...ex,
                setTargets: ex.setTargets.map((st: any, i: number) => ({
                  ...st,
                  targetReps: repLadder[i] ?? st.targetReps,
                })),
              };
            }

            // Self-select (targetWeight === 0): still build setTargets with
            // the rep ladder — weights stay 0, user enters them per set.
            // This ensures pyramid rep targets are visible even before
            // the user has entered any weight.
            const repLadder = getPyramidRepLadder(String(ex.reps ?? ''), setCount);
            const rpe = Number(ex.targetRpe ?? 8);
            const topIndex = setCount - 1;
            const secondaryRpe = rpe - 1;

            if (weightNum <= 0) {
              return {
                ...ex,
                setTargets: Array.from({ length: setCount }, (_, i) => ({
                  setNumber: i + 1,
                  targetWeight: 0,
                  targetRpe: i === topIndex ? rpe : secondaryRpe,
                  targetReps: repLadder[i],
                })),
              };
            }

            const targets = buildWeek1PyramidSetTargets(
              weightNum,
              setCount,
              String(ex.reps ?? ''),
              rpe,
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

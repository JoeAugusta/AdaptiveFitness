export type CaloriePace = 'conservative' | 'balanced' | 'aggressive';

export function getFatLossProjection(
  startWeight: number,
  pace: CaloriePace,
  weeks: number,
): number[] {
  const rateMap = { conservative: 0.5, balanced: 0.75, aggressive: 1.1 };
  const rate = rateMap[pace];
  return Array.from({ length: weeks + 1 }, (_, i) =>
    Math.round((startWeight - rate * i) * 10) / 10,
  );
}

export function getHypertrophyProjection(
  experience: string,
  pace: CaloriePace,
  weeks: number,
): number[] {
  const monthlyGainMap: Record<string, Record<string, number>> = {
    conservative: { beginner: 1.0, intermediate: 0.5, advanced: 0.25 },
    balanced: { beginner: 1.5, intermediate: 0.75, advanced: 0.4 },
    aggressive: { beginner: 2.5, intermediate: 1.25, advanced: 0.6 },
  };
  const exp = experience.toLowerCase();
  const expKey =
    exp === 'beginner' || exp === 'intermediate' || exp === 'advanced'
      ? exp
      : 'intermediate';
  const weeklyGain =
    (monthlyGainMap[pace]?.[expKey] ?? 0.5) / 4;
  return Array.from({ length: weeks + 1 }, (_, i) =>
    Math.round(weeklyGain * i * 10) / 10,
  );
}

export function getStrengthProjection(
  current1RM: number,
  experience: string,
  weeks: number,
): number[] {
  const w = Math.max(weeks, 1);
  const exp = experience.toLowerCase();
  const weeklyRates: Record<string, number> = {
    beginner: 3,
    intermediate: 1.5,
    advanced: 0.75,
  };
  const rate = weeklyRates[exp] ?? 1.5;
  return Array.from({ length: weeks + 1 }, (_, i) => {
    const t = i / w;
    const gain = rate * w * (1 - Math.pow(1 - t, 1.4));
    return Math.round(current1RM + gain);
  });
}

/** Flat weight line for recomp preview */
export function getRecompWeightProjection(startWeight: number, weeks: number): number[] {
  const w = Math.round(startWeight * 10) / 10;
  return Array.from({ length: weeks + 1 }, () => w);
}

/** Simple downward BF% curve for recomp callout */
export function getRecompBfProjection(weeks: number, startBfPct: number): number[] {
  const drop = Math.min(4, startBfPct * 0.15);
  return Array.from({ length: weeks + 1 }, (_, i) =>
    Math.round((startBfPct - (drop * i) / Math.max(weeks, 1)) * 10) / 10,
  );
}

/** GoalDetails (pre-experience): honest gain range + timeline midpoint for chip selection. */
export function getStrengthProjectionRange(
  current1RM: number,
  target1RM: number,
  weeks: number,
): { low: number; high: number; weeksToTarget: number } {
  const low = Math.round(0.75 * weeks);
  const high = Math.round(2.0 * weeks);
  const gap = target1RM - current1RM;
  const weeksToTarget = Math.ceil(gap / 1.5);
  return { low, high, weeksToTarget };
}

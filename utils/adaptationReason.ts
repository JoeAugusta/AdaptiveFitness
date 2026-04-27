/**
 * P3-F7: Derives Jordan's reasoning for a prescribed weight target.
 * Pure function — no API calls. All data comes from plan_json + workout_logs.
 */

import { formatWorkoutWeight, LBS_TO_KG } from './units';

function formatLoadDeltaForCopy(deltaLbs: number, isMetric: boolean): string {
  if (!isMetric) return `${Math.abs(Math.round(deltaLbs))} lbs`;
  const kg = Math.abs(deltaLbs) * LBS_TO_KG;
  const rounded = Math.round(kg * 2) / 2;
  return `${rounded} kg`;
}

export interface AdaptationReason {
  headline: string; // One punchy line — shown large
  detail: string; // 1–2 sentences — Jordan's explanation
  signal: 'up' | 'down' | 'hold' | 'baseline' | 'fatigue_adjusted';
}

export interface LastWeekData {
  /** Baseline load for reasoning: session average, or top set when variance > 5% (matches server progression). */
  avgWeightLbs: number;
  avgRpe: number;
  targetRpe: number;
  targetWeightLbs: number;
}

/** Optional rows for pyramid-aware weight/RPE baseline (full session sets, not top-set filtered). */
export type AdaptationPreviousSetRow = {
  loggedWeight?: number;
  weight?: number;
  weightLbs?: number;
  rpe?: number | null;
};

function baselineFromPreviousSets(
  previousSets: AdaptationPreviousSetRow[],
  setStructure: 'straight' | 'pyramid' | 'wave' | undefined,
): { avgWeightLbs: number; avgRpe: number } | null {
  const weights = previousSets
    .map((s) => Number(s.loggedWeight ?? s.weight ?? s.weightLbs ?? 0))
    .filter((w) => w > 0);

  if (weights.length === 0) {
    return null;
  }

  const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
  const maxWeight = Math.max(...weights);
  const useTopSet = (maxWeight - avgWeight) > avgWeight * 0.05;
  const avgWeightLbs = useTopSet ? maxWeight : avgWeight;

  let avgRpe = 0;
  if (setStructure === 'pyramid' && previousSets.length >= 2) {
    const pos = previousSets
      .map((s) => ({
        wt: Number(s.loggedWeight ?? s.weight ?? s.weightLbs ?? 0),
        rpe: Number(s.rpe ?? 0),
      }))
      .filter((x) => x.wt > 0);
    if (pos.length >= 2) {
      const maxWt = Math.max(...pos.map((x) => x.wt));
      const topRpes = pos
        .filter((x) => x.wt === maxWt)
        .map((x) => x.rpe)
        .filter((r) => r > 0);
      if (topRpes.length > 0) {
        avgRpe = topRpes.reduce((a, b) => a + b, 0) / topRpes.length;
      }
    }
  } else {
    const rpes = previousSets
      .map((s) => Number(s.rpe ?? 0))
      .filter((r) => r > 0);
    if (rpes.length > 0) {
      avgRpe = rpes.reduce((a, b) => a + b, 0) / rpes.length;
    }
  }

  return { avgWeightLbs, avgRpe };
}

export function deriveAdaptationReason(
  _exerciseName: string,
  currentTargetWeight: number,
  currentTargetRpe: number,
  weekNumber: number,
  lastWeekData: LastWeekData | null,
  adjustedBySignal?: string,
  previousSets?: AdaptationPreviousSetRow[],
  setStructure?: 'straight' | 'pyramid' | 'wave',
  isMetric = false,
): AdaptationReason {

  // Week 1 — no prior data
  if (weekNumber === 1 || !lastWeekData) {
    return {
      headline: 'Week 1 baseline',
      detail: `This is your starting point — pick a weight that lands at RPE ${currentTargetRpe}. I'll use what you log here to set Week 2 precisely.`,
      signal: 'baseline',
    };
  }

  // Fatigue signal adjustment (from P3-C1)
  if (adjustedBySignal === 'high_fatigue') {
    return {
      headline: 'Load adjusted — recovery priority',
      detail: `Your last session ran hard. I've pulled the target intensity back slightly — hit clean reps today, not heavy ones. Load returns to normal next session.`,
      signal: 'fatigue_adjusted',
    };
  }
  if (adjustedBySignal === 'low_fatigue') {
    return {
      headline: 'Load adjusted — extra capacity',
      detail: `Your last session had plenty left in the tank. I've nudged the intensity up slightly — use what you've got today.`,
      signal: 'fatigue_adjusted',
    };
  }

  const fromSets = previousSets?.length
    ? baselineFromPreviousSets(previousSets, setStructure)
    : null;

  /** W1 top-set (or straight) baseline — matches progression summary, not average of build sets. */
  const topSetWeight =
    fromSets?.avgWeightLbs ?? lastWeekData.avgWeightLbs;
  /** Top-set RPE for pyramid; session mean for straight — copy only, not used for signal. */
  const topSetRpe =
    fromSets != null ? fromSets.avgRpe : lastWeekData.avgRpe;
  const rpeStr = topSetRpe.toFixed(1);

  const targetWeight = currentTargetWeight;
  const weightDelta = targetWeight - topSetWeight;
  let signal: 'up' | 'down' | 'hold';
  if (topSetWeight > 0) {
    const pctChange = weightDelta / topSetWeight;
    if (pctChange > 0.01) signal = 'up';
    else if (pctChange < -0.01) signal = 'down';
    else signal = 'hold';
  } else {
    signal = targetWeight > 0 ? 'up' : 'hold';
  }

  const topStr = formatWorkoutWeight(topSetWeight, isMetric);
  const deltaStr = formatLoadDeltaForCopy(weightDelta, isMetric);

  if (signal === 'up') {
    return {
      headline: `Up ${deltaStr} — progressive overload`,
      detail:
        `Last week's ${topStr} at RPE ${rpeStr} had room to grow — load increases to keep the stimulus ahead of your adaptation.`,
      signal: 'up',
    };
  }
  if (signal === 'down') {
    return {
      headline: `Down ${deltaStr} — load managed`,
      detail:
        `Last week's ${topStr} at RPE ${rpeStr} ran high — pulling it back slightly so you can execute clean reps.`,
      signal: 'down',
    };
  }
  return {
    headline: 'Same load — intentional hold',
    detail:
      `Last week's ${topStr} at RPE ${rpeStr} was well-calibrated. Same load this week — the goal is more volume at the same intensity before we push weight again.`,
    signal: 'hold',
  };
}

/** Signal → icon character */
export const SIGNAL_ICON: Record<AdaptationReason['signal'], string> = {
  up: '↑',
  down: '↓',
  hold: '→',
  baseline: '◎',
  fatigue_adjusted: '⚡',
};

/** Signal → color key (use Colors.* in component) */
export const SIGNAL_COLOR_KEY: Record<
  AdaptationReason['signal'],
  'success' | 'danger' | 'textSecondary' | 'warning' | 'accent'
> = {
  up: 'success',
  down: 'warning',
  hold: 'textSecondary',
  baseline: 'accent',
  fatigue_adjusted: 'warning',
};

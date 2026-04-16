/**
 * P3-F7: Derives Jordan's reasoning for a prescribed weight target.
 * Pure function — no API calls. All data comes from plan_json + workout_logs.
 */

export interface AdaptationReason {
  headline: string; // One punchy line — shown large
  detail: string; // 1–2 sentences — Jordan's explanation
  signal: 'up' | 'down' | 'hold' | 'baseline' | 'fatigue_adjusted';
}

export interface LastWeekData {
  avgWeightLbs: number;
  avgRpe: number;
  targetRpe: number;
  targetWeightLbs: number;
}

export function deriveAdaptationReason(
  _exerciseName: string,
  currentTargetWeight: number,
  currentTargetRpe: number,
  weekNumber: number,
  lastWeekData: LastWeekData | null,
  adjustedBySignal?: string,
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

  const { avgWeightLbs, avgRpe } = lastWeekData;
  const weightDelta = currentTargetWeight - avgWeightLbs;
  const effectiveTargetRpe = lastWeekData?.targetRpe > 0
    ? lastWeekData.targetRpe
    : currentTargetRpe;

  const rpeGap = (lastWeekData?.avgRpe ?? 0) - effectiveTargetRpe;

  // Trigger increase if gap is -0.5 or more below target
  if (rpeGap < -0.5) {
    if (weightDelta > 0) {
      if (rpeGap < -1) {
        return {
          headline: `Up ${weightDelta.toFixed(1)} lbs — weights were too light`,
          detail: `Last week you averaged RPE ${avgRpe.toFixed(1)} against a target of ${effectiveTargetRpe} — that ${Math.abs(rpeGap).toFixed(1)}-point gap told me the load wasn't creating enough stimulus. Load goes up until your RPE lands where it needs to be.`,
          signal: 'up',
        };
      }
      return {
        headline: `Up ${weightDelta.toFixed(1)} lbs — progressive overload`,
        detail: `Last week's ${avgWeightLbs} lbs at RPE ${avgRpe.toFixed(1)} was right on target. Standard progression — load increases to keep the stimulus ahead of your adaptation.`,
        signal: 'up',
      };
    }
  } else if (rpeGap > 1.0) {
    return {
      headline: weightDelta < 0
        ? `Down ${Math.abs(weightDelta).toFixed(1)} lbs — load managed`
        : 'Down — load managed',
      detail: `Last week's RPE ran ${rpeGap.toFixed(1)} points above target at ${avgWeightLbs} lbs. I've pulled it back slightly — quality reps at the right intensity beats grinding through sets that are too heavy.`,
      signal: 'down',
    };
  }
  // hold — truly on target (within ±0.5 to +1.0)
  return {
    headline: 'Same load — intentional hold',
    detail: `Last week's ${avgWeightLbs} lbs at RPE ${avgRpe.toFixed(1)} was well-calibrated. Same load this week — the goal is more volume at the same intensity before we push weight again.`,
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

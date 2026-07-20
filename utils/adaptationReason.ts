/**
 * P3-F7: Derives Jordan's reasoning for a prescribed weight target.
 * Pure function — no API calls. All data comes from plan_json + workout_logs.
 */

import { formatWorkoutWeight, LBS_TO_KG } from './units';
import { computeRpeGap } from './rpeGap';

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
  /** When set, replaces the "THIS SESSION" value row (strength W2 target lift). */
  sessionContextValue?: string;
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

/** Low end of rep range for "× N reps" session line (e.g. "4-6" → 4). */
function repsHintFromPrescription(reps: string | undefined): string {
  if (!reps || !String(reps).trim()) return '4';
  const m = String(reps).match(/(\d+)/);
  return m ? m[1]! : '4';
}

export type AdaptationExtras = {
  /** Strength-programme primary lift — special intensity-block copy when true */
  isStrengthProgramTargetLift?: boolean;
  /** exercise.reps from current week plan */
  currentRepsPrescription?: string;
  /** e.g. `4×4` for "Moving into …" sentence on strength lifts */
  strengthBlockLabel?: string;
};

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
  /** plan_json.goal — strength W1 baseline copy differs from hypertrophy/recomp/etc. */
  planGoal?: string,
  setCountHint?: number,
  extras?: AdaptationExtras,
  completedWeekWasDeload = false,
): AdaptationReason {

  // Week 1 — no prior data (or missing history envelope)
  if (weekNumber === 1 || !lastWeekData) {
    if (planGoal === 'strength' && weekNumber === 1) {
      const n =
        typeof setCountHint === 'number' &&
        Number.isFinite(setCountHint) &&
        setCountHint > 0
          ? Math.floor(setCountHint)
          : 3;
      return {
        headline: 'Week 1 baseline',
        detail:
          `Your working weight is set from your current 1RM — hit all ${n} sets at this load and log your RPE honestly. That tells me whether we progress, hold, or adjust for Week 2.`,
        signal: 'baseline',
      };
    }
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

  const sessionCtxDefault = (() => {
    const formattedCurrent = formatWorkoutWeight(targetWeight, isMetric);
    const prescribeRpeThisWeek =
      typeof currentTargetRpe === 'number' && Number.isFinite(currentTargetRpe)
        ? currentTargetRpe.toFixed(1)
        : '—';
    const repN = repsHintFromPrescription(extras?.currentRepsPrescription);
    return `${formattedCurrent} × ${repN} reps @ RPE ${prescribeRpeThisWeek}`;
  })();

  if (completedWeekWasDeload) {
    const deltaStrLocal = formatLoadDeltaForCopy(weightDelta, isMetric);
    if (signal === 'up') {
      return {
        headline: `Up ${deltaStrLocal} — back to full intensity`,
        detail: `Coming off your deload — back up to pick up where you left off.`,
        sessionContextValue: sessionCtxDefault,
        signal: 'up',
      };
    }
    if (signal === 'down') {
      return {
        headline: `Down ${deltaStrLocal} — back to full intensity`,
        detail: `Coming off your deload — easing back into your working range.`,
        sessionContextValue: sessionCtxDefault,
        signal: 'down',
      };
    }
    return {
      headline: 'Back to full intensity',
      detail: 'Holding at your pre-deload weight to rebuild momentum.',
      sessionContextValue: sessionCtxDefault,
      signal: 'hold',
    };
  }

  const topStr = formatWorkoutWeight(topSetWeight, isMetric);
  const deltaStr = formatLoadDeltaForCopy(weightDelta, isMetric);
  const prescribeRpe =
    typeof lastWeekData.targetRpe === 'number' && lastWeekData.targetRpe > 0
      ? lastWeekData.targetRpe.toFixed(1)
      : null;

  const formattedCurrent = formatWorkoutWeight(targetWeight, isMetric);

  if (
    planGoal === 'strength' &&
    extras?.isStrengthProgramTargetLift &&
    weekNumber >= 2 &&
    lastWeekData
  ) {
    const scheme = extras.strengthBlockLabel?.trim() ?? '4×4';
    if (signal === 'up') {
      return {
        headline: `Up ${deltaStr} — Week ${weekNumber} intensity block`,
        detail:
          `Baseline week confirmed. Moving into ${scheme} — fewer reps where the block ramps load. This is where the strength build begins.`,
        sessionContextValue: sessionCtxDefault,
        signal: 'up',
      };
    }
    if (signal === 'hold') {
      return {
        headline: 'Same load — higher intensity',
        detail:
          'Last week ran at the upper edge of the target. Keeping the weight and letting the rep scheme do the work this week.',
        sessionContextValue: sessionCtxDefault,
        signal: 'hold',
      };
    }
    if (signal === 'down') {
      return {
        headline: 'Pulling back the load',
        detail:
          "Last week's effort was above sustainable intensity. Reducing weight to restore quality reps and protect the pattern.",
        sessionContextValue: sessionCtxDefault,
        signal: 'down',
      };
    }
  }

  /** Accessories & non-programme-primary-lift — canonical gap only (matches generate-next-week) */
  const useAccessoryGapCopy = !(
    planGoal === 'strength' && extras?.isStrengthProgramTargetLift
  );

  if (
    useAccessoryGapCopy &&
    lastWeekData &&
    typeof lastWeekData.targetRpe === 'number' &&
    lastWeekData.targetRpe > 0
  ) {
    const gap = computeRpeGap(topSetRpe, lastWeekData.targetRpe);

    if (gap >= 3) {
      return {
        headline: 'Resetting the load — finding your real working weight',
        detail:
          `${topStr} at RPE ${rpeStr} is well below working intensity — jumping the weight to ${formattedCurrent} to find a load that actually challenges you.`,
        sessionContextValue: sessionCtxDefault,
        signal: 'up',
      };
    }
    if (gap >= 2) {
      return {
        headline: `Up ${deltaStr} — closing the gap`,
        detail:
          `${topStr} at RPE ${rpeStr} left too much in the tank. Adding load to bring the stimulus in line with your target.`,
        sessionContextValue: sessionCtxDefault,
        signal: 'up',
      };
    }
    if (gap >= 1) {
      return {
        headline: `Up ${deltaStr} — building on last week`,
        detail:
          `${topStr} at RPE ${rpeStr} was within your range — adding load to keep the stimulus honest.`,
        sessionContextValue: sessionCtxDefault,
        signal: 'up',
      };
    }
    if (gap >= 0) {
      return {
        headline: `Up ${deltaStr} — progressing as planned`,
        detail:
          'On target last week — adding load to keep the progression moving.',
        sessionContextValue: sessionCtxDefault,
        signal: 'up',
      };
    }
    if (gap >= -1 && gap < 0) {
      return {
        headline: 'Same load — recovery priority',
        detail:
          'Last week ran harder than the target — holding weight this session to let the adaptation land before pushing again.',
        sessionContextValue: sessionCtxDefault,
        signal: 'hold',
      };
    }
    return {
      headline: 'Pulling back the load',
      detail:
        "Last week's effort was above sustainable intensity. Reducing weight to restore quality reps and protect the pattern.",
      sessionContextValue: sessionCtxDefault,
      signal: 'down',
    };
  }

  if (signal === 'up') {
    const detailEase =
      prescribeRpe != null &&
      topSetRpe > 0 &&
      topSetRpe < Number(prescribeRpe) - 0.09
        ? `${topStr} at RPE ${rpeStr} sat below your ~RPE ${prescribeRpe} target intensity — we're adding load to keep the stimulus honest.`
        : `${topStr} at RPE ${rpeStr} left room available — adjusting load upward builds cleanly on last week.`;
    return {
      headline: `Up ${deltaStr} — building on last week`,
      detail:
        prescribeRpe != null
          ? detailEase
          : `${topStr} at RPE ${rpeStr} — we're adding weight to match your progression.`,
      sessionContextValue: sessionCtxDefault,
      signal: 'up',
    };
  }
  if (signal === 'down') {
    const vsHint = prescribeRpe != null ? ` vs ~${prescribeRpe}` : '';
    return {
      headline: `Pulling back ${deltaStr} — load managed`,
      detail:
        `Last week's ${topStr} at RPE ${rpeStr}${vsHint} was demanding — easing the target prioritizes crisp reps while you recover.`,
      sessionContextValue: sessionCtxDefault,
      signal: 'down',
    };
  }
  return {
    headline: 'On track — progressing as planned',
    detail:
      prescribeRpe != null
        ? `Last week's ${topStr} at RPE ${rpeStr} vs ~${prescribeRpe} target intensity landed where we wanted — holding steady reinforces patterning before we push again.`
        : `Last week's ${topStr} at RPE ${rpeStr} was well-calibrated. Same load reinforces patterning — we'll push volume or load when margins open up.`,
    sessionContextValue: sessionCtxDefault,
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

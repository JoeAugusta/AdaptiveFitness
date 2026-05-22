import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LBS_TO_KG = 0.453592;
export const KG_TO_LBS = 2.20462;

/** AsyncStorage key for metric/imperial toggle; string kept as `afc_units_metric` for upgrade compatibility (Hone rebrand May 2026). */
export const HONE_UNITS_METRIC_KEY = 'afc_units_metric';

type MetricListener = () => void;
const metricListeners = new Set<MetricListener>();

function emitMetricPreferenceChanged() {
  metricListeners.forEach((l) => l());
}

/** Subscribe to unit preference changes (any `setIsMetric` in the app). */
export function subscribeMetricPreferenceChanged(listener: MetricListener): () => void {
  metricListeners.add(listener);
  return () => metricListeners.delete(listener);
}

/** Convert lbs stored in DB to display value */
export function lbsToDisplay(lbs: number, isMetric: boolean): number {
  if (!isMetric) return lbs;
  return Math.round(lbs * LBS_TO_KG * 10) / 10;
}

/** Convert user input back to lbs for storage */
export function displayToLbs(value: number, isMetric: boolean): number {
  if (!isMetric) return value;
  return Math.round(value * KG_TO_LBS * 10) / 10;
}

/** Workout weights — round to nearest 0.5 kg when metric, show lbs when imperial */
export function formatWorkoutWeight(lbs: number, isMetric: boolean): string {
  if (!isMetric) return `${lbs} lbs`;
  const kg = lbs * LBS_TO_KG;
  const rounded = Math.round(kg * 2) / 2;
  return `${rounded} kg`;
}

/** Bodyweight display (weigh-in, profile, trend chart) */
export function formatBodyWeight(lbs: number, isMetric: boolean): string {
  if (!isMetric) return `${lbs} lbs`;
  const kg = Math.round(lbs * LBS_TO_KG * 10) / 10;
  return `${kg} kg`;
}

/** Unit label only */
export function unitLabel(isMetric: boolean): string {
  return isMetric ? 'kg' : 'lbs';
}

/**
 * Convert explicit "NNN lb(s)" mentions in coach/session copy to kg when metric.
 * Only matches numbers immediately followed by lb/lbs (case-insensitive).
 */
export function convertSessionFocus(text: string, isMetric: boolean): string {
  if (!isMetric) return text;
  return text.replace(/(\d+(?:\.\d+)?)\s*lbs?/gi, (_match, num: string) => {
    const lbs = parseFloat(num);
    if (Number.isNaN(lbs)) return _match;
    const kg = Math.round(lbs * LBS_TO_KG * 2) / 2;
    return `${kg} kg`;
  });
}

/** Trend line delta vs last week (absolute value + unit). */
export function formatTrendDeltaLbs(deltaLbs: number, isMetric: boolean): string {
  if (!isMetric) {
    return `${Math.abs(Math.round(deltaLbs))} lbs`;
  }
  const kg = Math.abs(deltaLbs) * LBS_TO_KG;
  const rounded = Math.round(kg * 10) / 10;
  return `${rounded} kg`;
}

export function useMetric(): {
  isMetric: boolean;
  setIsMetric: (value: boolean) => Promise<void>;
  lbsToDisplay: (lbs: number) => number;
  displayToLbs: (value: number) => number;
  formatWorkoutWeight: (lbs: number) => string;
  formatBodyWeight: (lbs: number) => string;
  unitLabel: string;
} {
  const [isMetric, setIsMetricState] = useState(false);

  const readMetricFromStorage = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(HONE_UNITS_METRIC_KEY);
      setIsMetricState(raw === 'true');
    } catch {
      setIsMetricState(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(HONE_UNITS_METRIC_KEY);
        if (cancelled) return;
        setIsMetricState(raw === 'true');
      } catch {
        if (!cancelled) setIsMetricState(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsub = subscribeMetricPreferenceChanged(() => {
      void readMetricFromStorage();
    });
    return unsub;
  }, [readMetricFromStorage]);

  const setIsMetric = useCallback(async (value: boolean) => {
    setIsMetricState(value);
    try {
      await AsyncStorage.setItem(HONE_UNITS_METRIC_KEY, value ? 'true' : 'false');
    } catch {
      /* non-fatal */
    }
    emitMetricPreferenceChanged();
  }, []);

  const lbsToDisplayBound = useCallback(
    (lbs: number) => lbsToDisplay(lbs, isMetric),
    [isMetric],
  );

  const displayToLbsBound = useCallback(
    (value: number) => displayToLbs(value, isMetric),
    [isMetric],
  );

  const formatWorkoutWeightBound = useCallback(
    (lbs: number) => formatWorkoutWeight(lbs, isMetric),
    [isMetric],
  );

  const formatBodyWeightBound = useCallback(
    (lbs: number) => formatBodyWeight(lbs, isMetric),
    [isMetric],
  );

  const unitLabelStr = unitLabel(isMetric);

  return {
    isMetric,
    setIsMetric,
    lbsToDisplay: lbsToDisplayBound,
    displayToLbs: displayToLbsBound,
    formatWorkoutWeight: formatWorkoutWeightBound,
    formatBodyWeight: formatBodyWeightBound,
    unitLabel: unitLabelStr,
  };
}

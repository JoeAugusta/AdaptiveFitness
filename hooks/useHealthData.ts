/**
 * useHealthData — Apple HealthKit integration hook
 *
 * Uses @kingstinct/react-native-healthkit v2+ API:
 * - Core.requestAuthorization({ toRead, toShare })
 * - QuantityTypes.queryQuantitySamples(identifier, options)
 * - CategoryTypes.queryCategorySamples(identifier, options)
 *
 * Gracefully degrades when:
 *   - Not iOS / HealthKit unavailable
 *   - Permission not granted
 *   - No data today (didn't wear device)
 */

import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  Core,
  QuantityTypes,
  CategoryTypes,
} from '@kingstinct/react-native-healthkit/modules';

export type HealthPermissionStatus =
  | 'unavailable'
  | 'not_determined'
  | 'granted'
  | 'denied';

export type HealthData = {
  sleepHours: number | null;
  hrvMs: number | null;
  restingHeartRate: number | null;
  fetchedAt: string | null;
  hasDataToday: boolean;
};

export type LiveWorkoutHR = {
  avgBpm: number | null;
  peakBpm: number | null;
  sampleCount: number;
};

const EMPTY_HEALTH_DATA: HealthData = {
  sleepHours: null,
  hrvMs: null,
  restingHeartRate: null,
  fetchedAt: null,
  hasDataToday: false,
};

const EMPTY_HR: LiveWorkoutHR = { avgBpm: null, peakBpm: null, sampleCount: 0 };

function getStartOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function getLastNightStart(): Date {
  // Sleep window: 2 nights ago 8pm → today noon
  // Covers users checking in early morning before sleeping again
  const d = new Date();
  d.setDate(d.getDate() - 2);
  d.setHours(20, 0, 0, 0);
  return d;
}

function getNoonToday(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

export function useHealthData() {
  const [permissionStatus, setPermissionStatus] = useState<HealthPermissionStatus>(
    Platform.OS !== 'ios' ? 'unavailable' : 'not_determined',
  );
  const [healthData, setHealthData] = useState<HealthData>(EMPTY_HEALTH_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);

  const isAvailable = Platform.OS === 'ios' && Core?.isHealthDataAvailable() === true;

  const requestPermission = useCallback(async (): Promise<boolean> => {
    console.log('[HealthKit] requestPermission START, isAvailable:', isAvailable, 'Core:', Core != null);
    if (!isAvailable) {
      setPermissionStatus('unavailable');
      return false;
    }
    try {
      const status = await Core.getRequestStatusForAuthorization({
        toRead: [
          'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
          'HKQuantityTypeIdentifierRestingHeartRate',
          'HKQuantityTypeIdentifierHeartRate',
          'HKCategoryTypeIdentifierSleepAnalysis',
        ],
        toShare: [],
      });
      console.log('[HealthKit] status:', status);

      await Core.requestAuthorization({
        toRead: [
          'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
          'HKQuantityTypeIdentifierRestingHeartRate',
          'HKQuantityTypeIdentifierHeartRate',
          'HKCategoryTypeIdentifierSleepAnalysis',
        ],
        toShare: [],
      });
      console.log('[HealthKit] requestAuthorization done');
      if (isMountedRef.current) setPermissionStatus('granted');
      return true;
    } catch (err) {
      console.log('[HealthKit] CAUGHT ERROR:', JSON.stringify(err), String(err));
      if (isMountedRef.current) setPermissionStatus('denied');
      return false;
    }
  }, [isAvailable]);

  const fetchHealthData = useCallback(async (): Promise<HealthData> => {
    console.log('[HealthKit] fetchHealthData called, isAvailable:', isAvailable);
    if (!isAvailable) {
      return EMPTY_HEALTH_DATA;
    }
    setIsLoading(true);
    try {
      const now = new Date();
      const startOfToday = getStartOfToday();
      const sleepStart = getLastNightStart();
      const sleepEnd = getNoonToday();

      // 1. HRV
      let hrvMs: number | null = null;
      try {
        const samples = await QuantityTypes.queryQuantitySamples(
          'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
          {
            filter: { date: { startDate: startOfToday, endDate: now } },
            limit: 1,
            ascending: false,
          },
        );
        const s = samples?.[0];
        if (s) {
          const val = Math.round((s as any).quantity ?? (s as any).value ?? 0);
          if (val > 0) hrvMs = val;
        }
      } catch (err) {
        console.warn('[useHealthData] HRV query failed:', err);
      }

      // 2. Resting HR
      let restingHeartRate: number | null = null;
      try {
        const samples = await QuantityTypes.queryQuantitySamples(
          'HKQuantityTypeIdentifierRestingHeartRate',
          {
            filter: { date: { startDate: startOfToday, endDate: now } },
            limit: 1,
            ascending: false,
          },
        );
        const s = samples?.[0];
        if (s) {
          const val = Math.round((s as any).quantity ?? (s as any).value ?? 0);
          if (val > 0) restingHeartRate = val;
        }
      } catch (err) {
        console.warn('[useHealthData] RestingHR query failed:', err);
      }

      // 3. Sleep
      let sleepHours: number | null = null;
      try {
        const samples = await CategoryTypes.queryCategorySamples(
          'HKCategoryTypeIdentifierSleepAnalysis',
          {
            filter: { date: { startDate: sleepStart, endDate: sleepEnd } },
            limit: 0,
          },
        );
        if (samples && samples.length > 0) {
          // asleepUnspecified=1, asleepCore=3, asleepDeep=4, asleepREM=5
          const asleep = samples.filter((s: any) => {
            const v = s.value ?? s.categoryValue;
            return v === 1 || v === 3 || v === 4 || v === 5;
          });
          // Group segments by sleep session — a new session starts when
          // there is a gap of more than 2 hours between segments.
          // Only use the most recent session that ended after midnight today.
          const midnightToday = getStartOfToday();

          // Sort ascending by start time
          const sorted = [...asleep].sort((a: any, b: any) => {
            const aStart = new Date((a as any).startDate ?? (a as any).startTime ?? 0).getTime();
            const bStart = new Date((b as any).startDate ?? (b as any).startTime ?? 0).getTime();
            return aStart - bStart;
          });

          // Group into sessions by 2-hour gap
          const sessions: Array<{ start: number; end: number }[]> = [];
          let currentSession: { start: number; end: number }[] = [];
          const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

          for (const s of sorted) {
            const start = new Date((s as any).startDate ?? (s as any).startTime ?? 0).getTime();
            const end = new Date((s as any).endDate ?? (s as any).endTime ?? 0).getTime();
            if (end <= start) continue;

            if (currentSession.length === 0) {
              currentSession.push({ start, end });
            } else {
              const lastEnd = currentSession[currentSession.length - 1]!.end;
              if (start - lastEnd > TWO_HOURS_MS) {
                sessions.push(currentSession);
                currentSession = [{ start, end }];
              } else {
                currentSession.push({ start, end });
              }
            }
          }
          if (currentSession.length > 0) sessions.push(currentSession);

          // Find most recent session that ended after midnight today
          const recentSession = [...sessions]
            .reverse()
            .find((session) => {
              const sessionEnd = Math.max(...session.map((s) => s.end));
              return sessionEnd >= midnightToday.getTime();
            });

          if (recentSession) {
            let totalMs = 0;
            for (const seg of recentSession) {
              totalMs += seg.end - seg.start;
            }
            const hours = totalMs / (1000 * 60 * 60);
            if (hours > 0.5) sleepHours = Math.round(hours * 2) / 2;
          }
        }
      } catch (err) {
        console.warn('[useHealthData] Sleep query failed:', err);
      }

      const result: HealthData = {
        sleepHours,
        hrvMs,
        restingHeartRate,
        fetchedAt: now.toISOString(),
        hasDataToday: sleepHours !== null || hrvMs !== null || restingHeartRate !== null,
      };
      console.log('[HealthKit] data fetched:', JSON.stringify(result));
      if (isMountedRef.current) setHealthData(result);
      return result;
    } catch (err) {
      console.warn('[useHealthData] fetchHealthData failed:', err);
      return EMPTY_HEALTH_DATA;
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [isAvailable]);

  const queryPostSetHeartRate = useCallback(
    async (lookbackSeconds = 90): Promise<LiveWorkoutHR> => {
      if (!isAvailable || permissionStatus !== 'granted') {
        return EMPTY_HR;
      }
      try {
        const now = new Date();
        const from = new Date(now.getTime() - lookbackSeconds * 1000);
        const samples = await QuantityTypes.queryQuantitySamples(
          'HKQuantityTypeIdentifierHeartRate',
          {
            filter: { date: { startDate: from, endDate: now } },
            limit: 0,
            ascending: true,
          },
        );
        if (!samples || samples.length === 0) return EMPTY_HR;

        const bpms = samples
          .map((s: any) => {
            // HeartRate is in count/s — multiply by 60 for bpm
            const raw = (s as any).quantity ?? (s as any).value ?? 0;
            // If value looks like count/s (< 5), convert to bpm
            return raw < 5 ? Math.round(raw * 60) : Math.round(raw);
          })
          .filter((v: number) => v > 30 && v < 250);

        if (bpms.length === 0) return EMPTY_HR;

        const avg = Math.round(bpms.reduce((a: number, b: number) => a + b, 0) / bpms.length);
        const peak = Math.round(Math.max(...bpms));

        return { avgBpm: avg, peakBpm: peak, sampleCount: bpms.length };
      } catch (err) {
        console.warn('[useHealthData] queryPostSetHeartRate failed:', err);
        return EMPTY_HR;
      }
    },
    [isAvailable, permissionStatus],
  );

  return {
    permissionStatus,
    healthData,
    isLoading,
    isAvailable,
    requestPermission,
    fetchHealthData,
    queryPostSetHeartRate,
  };
}

export function interpretHrv(hrvMs: number | null): 'low' | 'normal' | 'high' | null {
  if (hrvMs === null) return null;
  if (hrvMs < 30) return 'low';
  if (hrvMs > 70) return 'high';
  return 'normal';
}

export function interpretRestingHr(
  bpm: number | null,
  baselineBpm: number | null,
): 'elevated' | 'normal' | 'low' | null {
  if (bpm === null) return null;
  if (baselineBpm !== null) {
    const delta = bpm - baselineBpm;
    if (delta > 7) return 'elevated';
    if (delta < -5) return 'low';
    return 'normal';
  }
  if (bpm > 75) return 'elevated';
  if (bpm < 50) return 'low';
  return 'normal';
}

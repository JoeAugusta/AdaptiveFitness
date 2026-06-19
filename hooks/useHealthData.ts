/**
 * useHealthData — Cross-platform Health integration hook
 *
 * iOS: @kingstinct/react-native-healthkit (HealthKit)
 * Android: react-native-health-connect (Google Health Connect)
 *
 * Same return type on both platforms.
 * Full graceful degradation when unavailable or no data.
 */

import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

// ── iOS imports ──────────────────────────────────────────────────────────────
let Core: typeof import('@kingstinct/react-native-healthkit')['Core'] | null = null;
let QuantityTypes: typeof import('@kingstinct/react-native-healthkit')['QuantityTypes'] | null = null;
let CategoryTypes: typeof import('@kingstinct/react-native-healthkit')['CategoryTypes'] | null = null;
let healthModuleError: string | null = null;

if (Platform.OS === 'ios') {
  try {
    const mods = require('@kingstinct/react-native-healthkit/modules');
    Core = mods.Core;
    QuantityTypes = mods.QuantityTypes;
    CategoryTypes = mods.CategoryTypes;
  } catch (e) {
    healthModuleError = e instanceof Error ? e.message : String(e);
  }
}

// ── Android imports ──────────────────────────────────────────────────────────
let HC: {
  initialize: () => Promise<boolean>;
  requestPermission: (permissions: Array<{ accessType: string; recordType: string }>) => Promise<unknown>;
  readRecords: (recordType: string, options: unknown) => Promise<{ records: unknown[] }>;
  getSdkStatus: () => Promise<number>;
} | null = null;

let HCSleepStageType: { SLEEPING: number } | null = null;

if (Platform.OS === 'android') {
  try {
    const hc = require('react-native-health-connect');
    HC = hc;
    HCSleepStageType = hc.SleepStageType ?? { SLEEPING: 2 };
  } catch {
    // Not available in Expo Go or if not linked
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

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

export type NutritionData = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fats_g: number | null;
  fetchedAt: string | null;
  hasDataToday: boolean;
  source: 'apple_health' | 'health_connect' | null;
};

const EMPTY_NUTRITION: NutritionData = {
  calories: null,
  protein_g: null,
  carbs_g: null,
  fats_g: null,
  fetchedAt: null,
  hasDataToday: false,
  source: null,
};

const EMPTY_HEALTH_DATA: HealthData = {
  sleepHours: null,
  hrvMs: null,
  restingHeartRate: null,
  fetchedAt: null,
  hasDataToday: false,
};

const EMPTY_HR: LiveWorkoutHR = { avgBpm: null, peakBpm: null, sampleCount: 0 };

// ── Date helpers ─────────────────────────────────────────────────────────────

function getStartOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function getLastNightStart(): Date {
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

// ── iOS implementation ───────────────────────────────────────────────────────

async function requestPermissionIOS(): Promise<boolean> {
  if (!Core) return false;
  try {
    await Core.requestAuthorization({
      toRead: [
        'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        'HKQuantityTypeIdentifierRestingHeartRate',
        'HKQuantityTypeIdentifierHeartRate',
        'HKCategoryTypeIdentifierSleepAnalysis',
        'HKQuantityTypeIdentifierDietaryEnergyConsumed',
        'HKQuantityTypeIdentifierDietaryProtein',
        'HKQuantityTypeIdentifierDietaryCarbohydrates',
        'HKQuantityTypeIdentifierDietaryFatTotal',
      ],
      toShare: [],
    });
    return true;
  } catch (err) {
    console.warn('[useHealthData] iOS requestAuthorization failed:', err);
    return false;
  }
}

async function fetchHealthDataIOS(): Promise<HealthData> {
  if (!Core || !QuantityTypes || !CategoryTypes) return EMPTY_HEALTH_DATA;
  const now = new Date();
  const startOfToday = getStartOfToday();
  const sleepStart = getLastNightStart();
  const sleepEnd = getNoonToday();

  // HRV
  let hrvMs: number | null = null;
  try {
    const samples = await QuantityTypes.queryQuantitySamples(
      'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
      { filter: { date: { startDate: startOfToday, endDate: now } }, limit: 1, ascending: false },
    );
    const s = samples?.[0];
    if (s) {
      const val = Math.round((s as any).quantity ?? (s as any).value ?? 0);
      if (val > 0) hrvMs = val;
    }
  } catch (err) {
    console.warn('[useHealthData] iOS HRV query failed:', err);
  }

  // Resting HR
  let restingHeartRate: number | null = null;
  try {
    const samples = await QuantityTypes.queryQuantitySamples(
      'HKQuantityTypeIdentifierRestingHeartRate',
      { filter: { date: { startDate: startOfToday, endDate: now } }, limit: 1, ascending: false },
    );
    const s = samples?.[0];
    if (s) {
      const val = Math.round((s as any).quantity ?? (s as any).value ?? 0);
      if (val > 0) restingHeartRate = val;
    }
  } catch (err) {
    console.warn('[useHealthData] iOS RHR query failed:', err);
  }

  // Sleep
  let sleepHours: number | null = null;
  try {
    const samples = await CategoryTypes.queryCategorySamples(
      'HKCategoryTypeIdentifierSleepAnalysis',
      { filter: { date: { startDate: sleepStart, endDate: sleepEnd } }, limit: 0 },
    );
    if (samples && samples.length > 0) {
      const asleep = samples.filter((s: any) => {
        const v = s.value ?? s.categoryValue;
        return v === 1 || v === 3 || v === 4 || v === 5;
      });
      const midnightToday = getStartOfToday();
      const sorted = [...asleep].sort((a: any, b: any) =>
        new Date((a as any).startDate ?? 0).getTime() -
        new Date((b as any).startDate ?? 0).getTime()
      );
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
      const recentSession = [...sessions].reverse().find((session) => {
        const sessionEnd = Math.max(...session.map((s) => s.end));
        return sessionEnd >= midnightToday.getTime();
      });
      if (recentSession) {
        let totalMs = 0;
        for (const seg of recentSession) totalMs += seg.end - seg.start;
        const hours = totalMs / (1000 * 60 * 60);
        if (hours > 0.5) sleepHours = Math.round(hours * 2) / 2;
      }
    }
  } catch (err) {
    console.warn('[useHealthData] iOS sleep query failed:', err);
  }

  return {
    sleepHours,
    hrvMs,
    restingHeartRate,
    fetchedAt: now.toISOString(),
    hasDataToday: sleepHours !== null || hrvMs !== null || restingHeartRate !== null,
  };
}

async function fetchNutritionDataIOS(): Promise<NutritionData> {
  if (!QuantityTypes) return EMPTY_NUTRITION;
  const now = new Date();
  const startOfToday = getStartOfToday();

  const queryOne = async (typeId: string): Promise<number | null> => {
    try {
      const samples = await QuantityTypes!.queryQuantitySamples(typeId, {
        filter: { date: { startDate: startOfToday, endDate: now } },
        limit: 0,
        ascending: true,
      });
      if (!samples || samples.length === 0) return null;
      const total = (samples as any[]).reduce((sum: number, s: any) => {
        const val = (s as any).quantity ?? (s as any).value ?? 0;
        return sum + val;
      }, 0);
      return total > 0 ? Math.round(total) : null;
    } catch (err) {
      console.warn(`[useHealthData] iOS nutrition query failed (${typeId}):`, err);
      return null;
    }
  };

  const [calories, protein_g, carbs_g, fats_g] = await Promise.all([
    queryOne('HKQuantityTypeIdentifierDietaryEnergyConsumed'),
    queryOne('HKQuantityTypeIdentifierDietaryProtein'),
    queryOne('HKQuantityTypeIdentifierDietaryCarbohydrates'),
    queryOne('HKQuantityTypeIdentifierDietaryFatTotal'),
  ]);

  return {
    calories,
    protein_g,
    carbs_g,
    fats_g,
    fetchedAt: now.toISOString(),
    hasDataToday: calories !== null || protein_g !== null,
    source: 'apple_health',
  };
}

async function queryPostSetHeartRateIOS(lookbackSeconds: number): Promise<LiveWorkoutHR> {
  if (!QuantityTypes) return EMPTY_HR;
  try {
    const now = new Date();
    const from = new Date(now.getTime() - lookbackSeconds * 1000);
    const samples = await QuantityTypes.queryQuantitySamples(
      'HKQuantityTypeIdentifierHeartRate',
      { filter: { date: { startDate: from, endDate: now } }, limit: 0, ascending: true },
    );
    if (!samples || samples.length === 0) return EMPTY_HR;
    const bpms = samples
      .map((s: any) => {
        const raw = (s as any).quantity ?? (s as any).value ?? 0;
        return raw < 5 ? Math.round(raw * 60) : Math.round(raw);
      })
      .filter((v: number) => v > 30 && v < 250);
    if (bpms.length === 0) return EMPTY_HR;
    const avg = Math.round(bpms.reduce((a: number, b: number) => a + b, 0) / bpms.length);
    const peak = Math.round(Math.max(...bpms));
    return { avgBpm: avg, peakBpm: peak, sampleCount: bpms.length };
  } catch (err) {
    console.warn('[useHealthData] iOS post-set HR query failed:', err);
    return EMPTY_HR;
  }
}

// ── Android implementation ───────────────────────────────────────────────────

async function requestPermissionAndroid(): Promise<boolean> {
  if (!HC) return false;
  try {
    const initialized = await HC.initialize();
    if (!initialized) return false;
    await HC.requestPermission([
      { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
      { accessType: 'read', recordType: 'RestingHeartRate' },
      { accessType: 'read', recordType: 'HeartRate' },
      { accessType: 'read', recordType: 'SleepSession' },
      { accessType: 'read', recordType: 'Nutrition' },
    ]);
    return true;
  } catch (err) {
    console.warn('[useHealthData] Android requestPermission failed:', err);
    return false;
  }
}

async function fetchHealthDataAndroid(): Promise<HealthData> {
  if (!HC) return EMPTY_HEALTH_DATA;
  try {
    const initialized = await HC.initialize();
    if (!initialized) return EMPTY_HEALTH_DATA;
  } catch {
    return EMPTY_HEALTH_DATA;
  }

  const now = new Date();
  const startOfToday = getStartOfToday();
  const sleepStart = getLastNightStart();
  const sleepEnd = getNoonToday();
  const midnightToday = getStartOfToday();

  // HRV
  let hrvMs: number | null = null;
  try {
    const result = await HC.readRecords('HeartRateVariabilityRmssd', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startOfToday.toISOString(),
        endTime: now.toISOString(),
      },
    });
    const records = result.records as Array<{ heartRateVariabilityMillis: number }>;
    if (records.length > 0) {
      const latest = records[records.length - 1];
      const val = Math.round(latest?.heartRateVariabilityMillis ?? 0);
      if (val > 0) hrvMs = val;
    }
  } catch (err) {
    console.warn('[useHealthData] Android HRV query failed:', err);
  }

  // Resting HR
  let restingHeartRate: number | null = null;
  try {
    const result = await HC.readRecords('RestingHeartRate', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startOfToday.toISOString(),
        endTime: now.toISOString(),
      },
    });
    const records = result.records as Array<{ beatsPerMinute: number }>;
    if (records.length > 0) {
      const latest = records[records.length - 1];
      const val = Math.round(latest?.beatsPerMinute ?? 0);
      if (val > 0) restingHeartRate = val;
    }
  } catch (err) {
    console.warn('[useHealthData] Android RHR query failed:', err);
  }

  // Sleep
  let sleepHours: number | null = null;
  try {
    const result = await HC.readRecords('SleepSession', {
      timeRangeFilter: {
        operator: 'between',
        startTime: sleepStart.toISOString(),
        endTime: sleepEnd.toISOString(),
      },
    });
    const sessions = result.records as Array<{
      startTime: string;
      endTime: string;
      stages?: Array<{ startTime: string; endTime: string; stage: number }>;
    }>;

    if (sessions.length > 0) {
      // Find most recent session that ended after midnight today
      const recentSession = [...sessions]
        .reverse()
        .find((s) => new Date(s.endTime).getTime() >= midnightToday.getTime());

      if (recentSession) {
        const SLEEPING = HCSleepStageType?.SLEEPING ?? 2;
        if (recentSession.stages && recentSession.stages.length > 0) {
          // Sum only asleep stages
          let totalMs = 0;
          for (const stage of recentSession.stages) {
            if (stage.stage === SLEEPING) {
              const start = new Date(stage.startTime).getTime();
              const end = new Date(stage.endTime).getTime();
              if (end > start) totalMs += end - start;
            }
          }
          const hours = totalMs / (1000 * 60 * 60);
          if (hours > 0.5) sleepHours = Math.round(hours * 2) / 2;
        } else {
          // No stages — use total session duration
          const start = new Date(recentSession.startTime).getTime();
          const end = new Date(recentSession.endTime).getTime();
          const hours = (end - start) / (1000 * 60 * 60);
          if (hours > 0.5 && hours < 16) sleepHours = Math.round(hours * 2) / 2;
        }
      }
    }
  } catch (err) {
    console.warn('[useHealthData] Android sleep query failed:', err);
  }

  return {
    sleepHours,
    hrvMs,
    restingHeartRate,
    fetchedAt: now.toISOString(),
    hasDataToday: sleepHours !== null || hrvMs !== null || restingHeartRate !== null,
  };
}

async function fetchNutritionDataAndroid(): Promise<NutritionData> {
  if (!HC) return EMPTY_NUTRITION;
  try {
    const initialized = await HC.initialize();
    if (!initialized) return EMPTY_NUTRITION;
  } catch {
    return EMPTY_NUTRITION;
  }

  const now = new Date();
  const startOfToday = getStartOfToday();

  let calories: number | null = null;
  let protein_g: number | null = null;
  let carbs_g: number | null = null;
  let fats_g: number | null = null;

  try {
    const result = await HC.readRecords('Nutrition', {
      timeRangeFilter: {
        operator: 'between',
        startTime: startOfToday.toISOString(),
        endTime: now.toISOString(),
      },
    });

    const records = result.records as Array<{
      energy?: { inKilocalories?: number };
      totalProtein?: { inGrams?: number };
      totalCarbohydrate?: { inGrams?: number };
      totalFat?: { inGrams?: number };
    }>;

    if (records.length > 0) {
      let calSum = 0;
      let protSum = 0;
      let carbSum = 0;
      let fatSum = 0;

      for (const r of records) {
        calSum += r.energy?.inKilocalories ?? 0;
        protSum += r.totalProtein?.inGrams ?? 0;
        carbSum += r.totalCarbohydrate?.inGrams ?? 0;
        fatSum += r.totalFat?.inGrams ?? 0;
      }

      if (calSum > 0) calories = Math.round(calSum);
      if (protSum > 0) protein_g = Math.round(protSum);
      if (carbSum > 0) carbs_g = Math.round(carbSum);
      if (fatSum > 0) fats_g = Math.round(fatSum);
    }
  } catch (err) {
    console.warn('[useHealthData] Android nutrition query failed:', err);
  }

  return {
    calories,
    protein_g,
    carbs_g,
    fats_g,
    fetchedAt: now.toISOString(),
    hasDataToday: calories !== null || protein_g !== null,
    source: 'health_connect',
  };
}

async function queryPostSetHeartRateAndroid(lookbackSeconds: number): Promise<LiveWorkoutHR> {
  if (!HC) return EMPTY_HR;
  try {
    const initialized = await HC.initialize();
    if (!initialized) return EMPTY_HR;
    const now = new Date();
    const from = new Date(now.getTime() - lookbackSeconds * 1000);
    const result = await HC.readRecords('HeartRate', {
      timeRangeFilter: {
        operator: 'between',
        startTime: from.toISOString(),
        endTime: now.toISOString(),
      },
    });
    const records = result.records as Array<{ samples: Array<{ beatsPerMinute: number }> }>;
    const bpms: number[] = [];
    for (const record of records) {
      for (const sample of record.samples ?? []) {
        const bpm = sample.beatsPerMinute;
        if (bpm > 30 && bpm < 250) bpms.push(bpm);
      }
    }
    if (bpms.length === 0) return EMPTY_HR;
    const avg = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
    const peak = Math.round(Math.max(...bpms));
    return { avgBpm: avg, peakBpm: peak, sampleCount: bpms.length };
  } catch (err) {
    console.warn('[useHealthData] Android post-set HR query failed:', err);
    return EMPTY_HR;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useHealthData() {
  const [permissionStatus, setPermissionStatus] = useState<HealthPermissionStatus>(
    Platform.OS !== 'ios' && Platform.OS !== 'android' ? 'unavailable' : 'not_determined',
  );
  const [healthData, setHealthData] = useState<HealthData>(EMPTY_HEALTH_DATA);
  const [nutritionData, setNutritionData] = useState<NutritionData>(EMPTY_NUTRITION);
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);

  const isAvailable =
    (Platform.OS === 'ios' &&
      Core != null &&
      (typeof Core.isHealthDataAvailable !== 'function' ||
        Core.isHealthDataAvailable() === true)) ||
    (Platform.OS === 'android' && HC !== null);

  const coreLoaded = Platform.OS === 'ios' ? Core != null : HC != null;
  let hkAvailableRaw: string;
  try {
    hkAvailableRaw =
      Platform.OS === 'ios'
        ? String(Core?.isHealthDataAvailable?.() ?? 'no-fn')
        : String(HC != null);
  } catch (e) {
    hkAvailableRaw = `threw:${String(e).slice(0, 40)}`;
  }

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isAvailable) {
      setPermissionStatus('unavailable');
      return false;
    }
    try {
      const granted =
        Platform.OS === 'ios'
          ? await requestPermissionIOS()
          : await requestPermissionAndroid();
      if (isMountedRef.current) {
        setPermissionStatus(granted ? 'granted' : 'denied');
      }
      return granted;
    } catch (err) {
      console.warn('[useHealthData] requestPermission failed:', err);
      if (isMountedRef.current) setPermissionStatus('denied');
      return false;
    }
  }, [isAvailable]);

  const fetchHealthData = useCallback(async (): Promise<HealthData> => {
    if (!isAvailable) return EMPTY_HEALTH_DATA;
    setIsLoading(true);
    try {
      const result =
        Platform.OS === 'ios'
          ? await fetchHealthDataIOS()
          : await fetchHealthDataAndroid();
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
      if (!isAvailable || permissionStatus !== 'granted') return EMPTY_HR;
      return Platform.OS === 'ios'
        ? queryPostSetHeartRateIOS(lookbackSeconds)
        : queryPostSetHeartRateAndroid(lookbackSeconds);
    },
    [isAvailable, permissionStatus],
  );

  const fetchNutritionData = useCallback(async (): Promise<NutritionData> => {
    if (!isAvailable) return EMPTY_NUTRITION;
    try {
      const result =
        Platform.OS === 'ios'
          ? await fetchNutritionDataIOS()
          : await fetchNutritionDataAndroid();
      if (isMountedRef.current) setNutritionData(result);
      return result;
    } catch (err) {
      console.warn('[useHealthData] fetchNutritionData failed:', err);
      return EMPTY_NUTRITION;
    }
  }, [isAvailable]);

  return {
    permissionStatus,
    healthData,
    nutritionData,
    isLoading,
    isAvailable,
    healthModuleError,
    coreLoaded,
    hkAvailableRaw,
    requestPermission,
    fetchHealthData,
    fetchNutritionData,
    queryPostSetHeartRate,
  };
}

// ── Interpretation helpers ────────────────────────────────────────────────────

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

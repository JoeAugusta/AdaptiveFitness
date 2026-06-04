import { supabase } from '../Lib/supabase';

export type PersonalRecord = {
  exerciseName: string;
  bestWeightLbs: number;
  bestReps: number;
  estimated1RM: number;
  loggedAt: string;
  weekNumber: number;
  isRecent: boolean;
};

export type ExerciseBest = {
  bestWeightLbs: number;
  bestReps: number;
};

type LogRow = {
  sets_json?: unknown;
  logged_at?: string | null;
  week_number?: number | null;
  day_number?: number | null;
};

type RawSet = {
  weightLbs?: number;
  weight?: number;
  reps?: number;
  exerciseName?: string;
  name?: string;
  exerciseId?: string;
};

export function resolveExerciseName(raw: RawSet): string {
  if (typeof raw.exerciseName === 'string' && raw.exerciseName.trim()) {
    return raw.exerciseName.trim();
  }
  if (typeof raw.name === 'string' && raw.name.trim()) {
    return raw.name.trim();
  }
  return '';
}

export function estimate1RMLbs(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  return reps === 1 ? weight : Math.round(weight * (1 + reps / 30));
}

/** True when this set beats the prior best by weight, or same weight with more reps. */
export function isNewWeightPR(
  weight: number,
  reps: number,
  existing: ExerciseBest | undefined,
): boolean {
  if (weight <= 0 || reps <= 0) return false;
  if (!existing) return true;
  const isNewWeightPRFlag = weight > existing.bestWeightLbs;
  const isNewRepPR =
    weight === existing.bestWeightLbs && reps > existing.bestReps;
  return isNewWeightPRFlag || isNewRepPR;
}

function parseSetsFromLog(rawSets: unknown): unknown[] {
  if (Array.isArray(rawSets)) return rawSets;
  if (typeof rawSets === 'string') {
    try {
      const parsed = JSON.parse(rawSets) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Build per-exercise bests from workout log rows (weight-first, not e1RM-first). */
export function buildExerciseBestsFromLogs(
  logs: LogRow[],
): Record<string, ExerciseBest> {
  const bests: Record<string, ExerciseBest> = {};

  for (const log of logs) {
    for (const raw of parseSetsFromLog(log.sets_json)) {
      const s = raw as RawSet;
      const weight = Number(s.weightLbs ?? s.weight ?? 0);
      const reps = Number(s.reps ?? 0);
      if (weight <= 0 || reps <= 0) continue;

      const resolvedName = resolveExerciseName(s);
      if (!resolvedName) continue;

      const existing = bests[resolvedName];
      if (!isNewWeightPR(weight, reps, existing)) continue;

      bests[resolvedName] = { bestWeightLbs: weight, bestReps: reps };
    }
  }

  return bests;
}

/**
 * Fetch personal records for a user, optionally scoped to a single plan.
 * Returns top N exercises by estimated 1RM, sorted descending.
 */
export async function fetchPersonalRecords(
  userId: string,
  planId?: string,
  limit = 8,
): Promise<PersonalRecord[]> {
  let query = supabase
    .from('workout_logs')
    .select('sets_json, logged_at, week_number')
    .eq('user_id', userId)
    .eq('skipped', false)
    .order('logged_at', { ascending: true });

  if (planId) {
    query = query.eq('plan_id', planId);
  }

  const { data: logs, error } = await query;

  if (error || !logs) return [];

  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  const bests: Record<string, PersonalRecord> = {};

  for (const log of logs as LogRow[]) {
    const loggedAtIso =
      typeof log.logged_at === 'string' && log.logged_at.length > 0
        ? log.logged_at
        : new Date().toISOString();
    const weekNum =
      typeof log.week_number === 'number' && !Number.isNaN(log.week_number)
        ? log.week_number
        : 0;

    for (const raw of parseSetsFromLog(log.sets_json)) {
      const s = raw as RawSet;
      const weight = Number(s.weightLbs ?? s.weight ?? 0);
      const reps = Number(s.reps ?? 0);
      if (weight <= 0 || reps <= 0) continue;

      const resolvedName = resolveExerciseName(s);
      if (!resolvedName) continue;

      const e1rm = estimate1RMLbs(weight, reps);
      const existing = bests[resolvedName];
      const loggedMs = new Date(loggedAtIso).getTime();

      if (!isNewWeightPR(weight, reps, existing)) continue;

      bests[resolvedName] = {
        exerciseName: resolvedName,
        bestWeightLbs: weight,
        bestReps: reps,
        estimated1RM: e1rm,
        loggedAt: loggedAtIso,
        weekNumber: weekNum,
        isRecent: !Number.isNaN(loggedMs) && loggedMs > fourteenDaysAgo,
      };
    }
  }

  return Object.values(bests)
    .sort((a, b) => b.estimated1RM - a.estimated1RM)
    .slice(0, limit);
}

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

type PlanJsonWeek = {
  days?: Array<{
    exercises?: Array<{ id?: string; name?: string }>;
  }>;
};

type PlanJsonShape = {
  weeks?: PlanJsonWeek[];
};

/**
 * Build a map of exerciseId → exerciseName from a plan_json object.
 * Scans all weeks → days → exercises.
 */
function buildExerciseIdMap(planJson: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  const pj = planJson as PlanJsonShape | null | undefined;
  if (!pj?.weeks) return map;
  for (const week of pj.weeks) {
    for (const day of week.days ?? []) {
      for (const ex of day.exercises ?? []) {
        if (ex.id && ex.name) {
          map[ex.id] = ex.name;
        }
      }
    }
  }
  return map;
}

type LogRow = {
  sets_json?: unknown;
  logged_at?: string | null;
  week_number?: number | null;
  plans?: { plan_json?: unknown } | { plan_json?: unknown }[] | null;
};

function planJsonFromLog(log: LogRow): unknown {
  const p = log.plans;
  if (p == null) return undefined;
  const row = Array.isArray(p) ? p[0] : p;
  return row?.plan_json;
}

type RawSet = {
  weightLbs?: number;
  weight?: number;
  reps?: number;
  exerciseName?: string;
  name?: string;
  exerciseId?: string;
};

/**
 * Fetch all-time personal records for a user across all plans.
 * Returns top N exercises by estimated 1RM, sorted descending.
 */
export async function fetchPersonalRecords(
  userId: string,
  limit = 8,
): Promise<PersonalRecord[]> {
  const { data: logs, error } = await supabase
    .from('workout_logs')
    .select(
      `
      sets_json,
      logged_at,
      week_number,
      plans ( plan_json )
    `,
    )
    .eq('user_id', userId)
    .eq('skipped', false)
    .order('logged_at', { ascending: true });

  if (error || !logs) return [];

  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  const planMapCache = new WeakMap<object, Record<string, string>>();

  const bests: Record<string, PersonalRecord> = {};

  for (const log of logs as LogRow[]) {
    const planJson = planJsonFromLog(log);
    let idMap: Record<string, string> = {};
    if (planJson != null && typeof planJson === 'object') {
      if (planMapCache.has(planJson)) {
        idMap = planMapCache.get(planJson)!;
      } else {
        idMap = buildExerciseIdMap(planJson);
        planMapCache.set(planJson, idMap);
      }
    }

    const rawSets = (log as { sets_json?: unknown }).sets_json;
    const sets: unknown[] = Array.isArray(rawSets)
      ? rawSets
      : typeof rawSets === 'string'
        ? (() => {
            try {
              const p = JSON.parse(rawSets) as unknown;
              return Array.isArray(p) ? p : [];
            } catch {
              return [];
            }
          })()
        : [];

    const loggedAtIso =
      typeof log.logged_at === 'string' && log.logged_at.length > 0
        ? log.logged_at
        : new Date().toISOString();
    const weekNum =
      typeof log.week_number === 'number' && !Number.isNaN(log.week_number)
        ? log.week_number
        : 0;

    for (const raw of sets) {
      const s = raw as RawSet;
      const weight = Number(s.weightLbs ?? s.weight ?? 0);
      const reps = Number(s.reps ?? 0);
      if (weight <= 0 || reps <= 0) continue;

      const rawId = s.exerciseId ?? '';
      const resolvedName: string =
        rawId && idMap[rawId]
          ? idMap[rawId]
          : (typeof s.exerciseName === 'string' && s.exerciseName.trim()
              ? s.exerciseName.trim()
              : typeof s.name === 'string' && s.name.trim()
                ? s.name.trim()
                : '');

      if (!resolvedName) continue;

      const e1rm =
        reps === 1 ? weight : Math.round(weight * (1 + reps / 30));

      const existing = bests[resolvedName];
      const loggedMs = new Date(loggedAtIso).getTime();
      if (!existing || e1rm > existing.estimated1RM) {
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
  }

  return Object.values(bests)
    .sort((a, b) => b.estimated1RM - a.estimated1RM)
    .slice(0, limit);
}

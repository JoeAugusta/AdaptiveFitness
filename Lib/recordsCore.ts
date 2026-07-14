import type { SupabaseClient } from '@supabase/supabase-js';
import { EXERCISES } from '../constants/exerciseLibrary';
import {
  canonicalExerciseId,
  maxPlausibleLoadLbs,
  PR_EXCLUSION_REASON,
} from './exerciseMaxLoads';

const EFFECTIVE_REPS_CAP = 12;

export type EstimateE1RMInput = {
  load: number;
  reps: number;
  rpe?: number | null;
};

export type RawLoggedSetInput = {
  exerciseId: string;
  exerciseName?: string;
  setNumber: number;
  weightLbs?: number;
  weight?: number;
  reps?: number;
  rpe?: number | null;
  plausibility_status?: string;
  plausibilityStatus?: string;
  isTimed?: boolean;
  is_timed?: boolean;
};

export type SessionSource = 'workout' | 'free_session';

export type QualifyingLoggedSetRow = {
  workout_log_id: string;
  source: SessionSource;
  logged_at: string;
  set_number: number;
  exercise_name: string;
  weight_lbs: number;
  reps: number;
  rpe: number | null;
  plausibility_status: string;
  is_timed: boolean;
};

export type ExerciseRecordComputed = {
  user_id: string;
  exercise_key: string;
  display_name: string;
  best_e1rm: number;
  best_load: number;
  best_reps: number;
  best_rpe: number | null;
  best_workout_log_id: string;
  best_set_number: number;
  best_source: SessionSource;
  best_date: string;
  baseline_e1rm: number;
  baseline_date: string;
};

export type ResolvedExerciseKey = {
  key: string;
  libraryId: string | null;
};

const EXERCISE_NAME_LOOKUP = new Map<string, string>(
  EXERCISES.map((exercise) => [exercise.name.trim().toLowerCase(), exercise.id]),
);

export function slugExerciseName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export function resolveExerciseKey(name: string): ResolvedExerciseKey {
  const normalized = name.trim().toLowerCase();
  const matchedId = EXERCISE_NAME_LOOKUP.get(normalized);
  if (matchedId) {
    const libraryId = canonicalExerciseId(matchedId);
    return { key: libraryId, libraryId };
  }
  return { key: `name:${slugExerciseName(name)}`, libraryId: null };
}

export function isExerciseKeyExcludedFromRecords(exerciseKey: string): boolean {
  if (exerciseKey.startsWith('name:')) return false;
  const canonical = canonicalExerciseId(exerciseKey);
  return canonical in PR_EXCLUSION_REASON || exerciseKey in PR_EXCLUSION_REASON;
}

export function plausibilityStatusForLoad(
  exerciseName: string | undefined,
  weightLbs: number,
): 'ok' | 'flagged' {
  if (!exerciseName?.trim()) return 'ok';
  const { libraryId } = resolveExerciseKey(exerciseName);
  if (libraryId == null) return 'ok';
  const ceiling = maxPlausibleLoadLbs(libraryId);
  if (ceiling == null) return 'ok';
  return weightLbs > ceiling ? 'flagged' : 'ok';
}

export function estimateE1RM({ load, reps, rpe }: EstimateE1RMInput): number | null {
  if (load <= 0 || reps < 1) return null;
  if (reps === 1) return load;

  const reserve = rpe == null || Number.isNaN(Number(rpe)) ? 0 : 10 - Number(rpe);
  const effectiveReps = Math.min(reps + reserve, EFFECTIVE_REPS_CAP);
  return load * (1 + effectiveReps / 30);
}

export function isTimedRawSet(raw: RawLoggedSetInput): boolean {
  return raw.isTimed === true || raw.is_timed === true;
}

export function plausibilityStatusForRawSet(
  raw: RawLoggedSetInput,
): 'ok' | 'flagged' | 'confirmed' {
  const status = raw.plausibility_status ?? raw.plausibilityStatus ?? 'ok';
  if (status === 'flagged' || status === 'confirmed') return status;
  return 'ok';
}

export function shouldExcludeSetFromRecords(row: {
  is_timed: boolean;
  plausibility_status: string;
  exercise_name: string;
  weight_lbs: number;
  reps: number;
  rpe: number | null;
}): boolean {
  if (row.is_timed) return true;
  if (row.plausibility_status === 'flagged') return true;

  const { libraryId } = resolveExerciseKey(row.exercise_name);
  if (libraryId != null && row.plausibility_status !== 'confirmed') {
    const ceiling = maxPlausibleLoadLbs(libraryId);
    if (ceiling != null && row.weight_lbs > ceiling) return true;
  }

  return (
    estimateE1RM({
      load: row.weight_lbs,
      reps: row.reps,
      rpe: row.rpe,
    }) == null
  );
}

export function computeExerciseRecordFromQualifyingSets(
  userId: string,
  exerciseKey: string,
  sets: QualifyingLoggedSetRow[],
): ExerciseRecordComputed | null {
  const qualifying = sets
    .filter((row) => !shouldExcludeSetFromRecords(row))
    .map((row) => ({
      row,
      e1rm: estimateE1RM({
        load: row.weight_lbs,
        reps: row.reps,
        rpe: row.rpe,
      })!,
    }));

  if (qualifying.length === 0) return null;

  qualifying.sort((a, b) => {
    const timeDiff =
      new Date(a.row.logged_at).getTime() - new Date(b.row.logged_at).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.row.set_number - b.row.set_number;
  });

  const baseline = qualifying[0];
  const best = qualifying.reduce((current, candidate) =>
    candidate.e1rm > current.e1rm ? candidate : current,
  );

  const displaySource = qualifying.reduce((current, candidate) => {
    const candidateTime = new Date(candidate.row.logged_at).getTime();
    const currentTime = new Date(current.row.logged_at).getTime();
    if (candidateTime !== currentTime) {
      return candidateTime > currentTime ? candidate : current;
    }
    return candidate.row.set_number >= current.row.set_number ? candidate : current;
  });

  return {
    user_id: userId,
    exercise_key: exerciseKey,
    display_name: displaySource.row.exercise_name.trim(),
    best_e1rm: best.e1rm,
    best_load: best.row.weight_lbs,
    best_reps: best.row.reps,
    best_rpe: best.row.rpe,
    best_workout_log_id: best.row.workout_log_id,
    best_set_number: best.row.set_number,
    best_source: best.row.source,
    best_date: best.row.logged_at.slice(0, 10),
    baseline_e1rm: baseline.e1rm,
    baseline_date: baseline.row.logged_at.slice(0, 10),
  };
}

export function parseSetsJson(rawSets: unknown): RawLoggedSetInput[] {
  if (Array.isArray(rawSets)) return rawSets as RawLoggedSetInput[];
  if (typeof rawSets === 'string') {
    try {
      const parsed = JSON.parse(rawSets) as unknown;
      return Array.isArray(parsed) ? (parsed as RawLoggedSetInput[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function exerciseKeysFromSets(sets: RawLoggedSetInput[]): string[] {
  const keys = new Set<string>();
  for (const set of sets) {
    const name = typeof set.exerciseName === 'string' ? set.exerciseName.trim() : '';
    if (!name) continue;
    keys.add(resolveExerciseKey(name).key);
  }
  return [...keys];
}

export function flattenSetsFromSessions(
  sessions: Array<{ id: string; logged_at: string | null; sets_json: unknown }>,
  source: SessionSource,
): QualifyingLoggedSetRow[] {
  const rows: QualifyingLoggedSetRow[] = [];

  for (const session of sessions) {
    const loggedAt =
      typeof session.logged_at === 'string' && session.logged_at.length > 0
        ? session.logged_at
        : new Date(0).toISOString();
    const sets = parseSetsJson(session.sets_json);

    for (const raw of sets) {
      const exerciseName = typeof raw.exerciseName === 'string' ? raw.exerciseName.trim() : '';
      if (!exerciseName) continue;

      const weight = Number(raw.weightLbs ?? raw.weight ?? 0);
      const reps = Number(raw.reps ?? 0);
      if (reps <= 0) continue;

      rows.push({
        workout_log_id: session.id,
        source,
        logged_at: loggedAt,
        set_number: Number(raw.setNumber ?? 0),
        exercise_name: exerciseName,
        weight_lbs: weight,
        reps,
        rpe: raw.rpe == null || raw.rpe === 0 ? null : Number(raw.rpe),
        plausibility_status: plausibilityStatusForRawSet(raw),
        is_timed: isTimedRawSet(raw),
      });
    }
  }

  return rows;
}

/** @deprecated Use flattenSetsFromSessions */
export function flattenWorkoutLogSets(
  logs: Array<{ id: string; logged_at: string | null; sets_json: unknown }>,
): QualifyingLoggedSetRow[] {
  return flattenSetsFromSessions(logs, 'workout');
}

let recordsClient: SupabaseClient | null = null;

export function setRecordsSupabaseClient(client: SupabaseClient): void {
  recordsClient = client;
}

function getRecordsClient(): SupabaseClient {
  if (!recordsClient) {
    throw new Error(
      'Records Supabase client not configured. Call setRecordsSupabaseClient first.',
    );
  }
  return recordsClient;
}

async function fetchWorkoutLogsForUser(userId: string) {
  const { data, error } = await getRecordsClient()
    .from('workout_logs')
    .select('id, logged_at, sets_json')
    .eq('user_id', userId)
    .eq('skipped', false);
  if (error) throw error;
  return data ?? [];
}

async function fetchFreeSessionsForUser(userId: string) {
  const { data, error } = await getRecordsClient()
    .from('free_sessions')
    .select('id, logged_at, sets_json')
    .eq('user_id', userId);
  if (error) throw error;
  return data ?? [];
}

async function fetchAllSessionSetsForUser(userId: string) {
  const [workoutLogs, freeSessions] = await Promise.all([
    fetchWorkoutLogsForUser(userId),
    fetchFreeSessionsForUser(userId),
  ]);
  return [
    ...flattenSetsFromSessions(workoutLogs, 'workout'),
    ...flattenSetsFromSessions(freeSessions, 'free_session'),
  ];
}

export async function recomputeExerciseRecords(
  userId: string,
  exerciseKey: string,
): Promise<void> {
  const client = getRecordsClient();

  if (isExerciseKeyExcludedFromRecords(exerciseKey)) {
    const { error: deleteError } = await client
      .from('exercise_records')
      .delete()
      .eq('user_id', userId)
      .eq('exercise_key', exerciseKey);
    if (deleteError) throw deleteError;
    return;
  }

  const allRows = await fetchAllSessionSetsForUser(userId);
  const matchingRows = allRows.filter(
    (row) => resolveExerciseKey(row.exercise_name).key === exerciseKey,
  );

  const computed: ExerciseRecordComputed | null = computeExerciseRecordFromQualifyingSets(
    userId,
    exerciseKey,
    matchingRows,
  );

  if (!computed) {
    const { error: deleteError } = await client
      .from('exercise_records')
      .delete()
      .eq('user_id', userId)
      .eq('exercise_key', exerciseKey);
    if (deleteError) throw deleteError;
    return;
  }

  const { error: upsertError } = await client.from('exercise_records').upsert(
    {
      ...computed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,exercise_key' },
  );
  if (upsertError) throw upsertError;
}

export async function recomputeExerciseRecordsForKeys(
  userId: string,
  exerciseKeys: string[],
): Promise<void> {
  const unique = [...new Set(exerciseKeys.filter(Boolean))];
  for (const exerciseKey of unique) {
    await recomputeExerciseRecords(userId, exerciseKey);
  }
}

export async function afterWorkoutLogSaved(params: {
  userId: string;
  sets: RawLoggedSetInput[];
  priorSets?: RawLoggedSetInput[];
}): Promise<void> {
  const affectedKeys = new Set<string>([
    ...exerciseKeysFromSets(params.sets),
    ...exerciseKeysFromSets(params.priorSets ?? []),
  ]);
  await recomputeExerciseRecordsForKeys(params.userId, [...affectedKeys]);
}

export async function afterFreeSessionSaved(params: {
  userId: string;
  sets: RawLoggedSetInput[];
  priorSets?: RawLoggedSetInput[];
}): Promise<void> {
  await afterWorkoutLogSaved(params);
}

export async function backfillRecordsForUser(userId: string): Promise<void> {
  const allRows = await fetchAllSessionSetsForUser(userId);
  const affectedKeys = new Set<string>();

  for (const row of allRows) {
    affectedKeys.add(resolveExerciseKey(row.exercise_name).key);
  }

  await recomputeExerciseRecordsForKeys(userId, [...affectedKeys]);
}

export type ExerciseRecordDisplay = {
  exercise_key: string;
  display_name: string;
  best_e1rm: number;
  best_load: number;
  best_reps: number;
  best_rpe: number | null;
  best_workout_log_id: string;
  best_set_number: number;
  best_source: SessionSource;
  best_date: string;
  baseline_e1rm: number;
  baseline_date: string;
  updated_at: string;
  isRecent: boolean;
};

export type SessionOutcome = {
  prs: ExerciseRecordDisplay[];
  baselines: ExerciseRecordDisplay[];
};

type ExerciseRecordRowDb = {
  exercise_key: string;
  display_name: string;
  best_e1rm: number | string;
  best_load: number | string;
  best_reps: number;
  best_rpe: number | string | null;
  best_workout_log_id: string;
  best_set_number: number;
  best_source: SessionSource;
  best_date: string;
  baseline_e1rm: number | string;
  baseline_date: string;
  updated_at: string;
};

function mapExerciseRecordRow(row: ExerciseRecordRowDb): ExerciseRecordDisplay {
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const bestDateMs = new Date(String(row.best_date)).getTime();
  return {
    exercise_key: row.exercise_key,
    display_name: row.display_name,
    best_e1rm: Math.round(Number(row.best_e1rm)),
    best_load: Math.round(Number(row.best_load)),
    best_reps: row.best_reps,
    best_rpe: row.best_rpe == null ? null : Number(row.best_rpe),
    best_workout_log_id: row.best_workout_log_id,
    best_set_number: row.best_set_number,
    best_source: row.best_source,
    best_date: String(row.best_date),
    baseline_e1rm: Math.round(Number(row.baseline_e1rm)),
    baseline_date: String(row.baseline_date),
    updated_at: row.updated_at,
    isRecent: !Number.isNaN(bestDateMs) && bestDateMs >= fourteenDaysAgo,
  };
}

export async function getExerciseRecords(userId: string): Promise<ExerciseRecordDisplay[]> {
  const { data, error } = await getRecordsClient()
    .from('exercise_records')
    .select(
      'exercise_key, display_name, best_e1rm, best_load, best_reps, best_rpe, best_workout_log_id, best_set_number, best_source, best_date, baseline_e1rm, baseline_date, updated_at',
    )
    .eq('user_id', userId)
    .order('best_e1rm', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => mapExerciseRecordRow(row as ExerciseRecordRowDb));
}

export async function getSessionOutcome(
  userId: string,
  workoutLogId: string,
  sessionDate: string,
): Promise<SessionOutcome> {
  const { data, error } = await getRecordsClient()
    .from('exercise_records')
    .select(
      'exercise_key, display_name, best_e1rm, best_load, best_reps, best_rpe, best_workout_log_id, best_set_number, best_source, best_date, baseline_e1rm, baseline_date, updated_at',
    )
    .eq('user_id', userId);

  if (error) throw error;

  const rows = (data ?? []).map((row) => mapExerciseRecordRow(row as ExerciseRecordRowDb));
  const sessionDay = sessionDate.slice(0, 10);

  return {
    prs: rows.filter(
      (row) =>
        row.best_workout_log_id === workoutLogId && row.baseline_date < row.best_date,
    ),
    baselines: rows.filter((row) => row.baseline_date === sessionDay),
  };
}

export function countFlaggedSetsInJson(rawSets: unknown): number {
  return parseSetsJson(rawSets).filter(
    (raw) => plausibilityStatusForRawSet(raw) === 'flagged',
  ).length;
}

export function confirmSetInParsedSets(
  sets: RawLoggedSetInput[],
  exerciseId: string,
  setNumber: number,
): { sets: RawLoggedSetInput[]; updated: RawLoggedSetInput } {
  const idx = sets.findIndex(
    (set) => set.exerciseId === exerciseId && Number(set.setNumber) === setNumber,
  );
  if (idx < 0) {
    throw new Error('Set not found');
  }
  const updated: RawLoggedSetInput = {
    ...sets[idx],
    plausibility_status: 'confirmed',
  };
  const nextSets = [...sets];
  nextSets[idx] = updated;
  return { sets: nextSets, updated };
}

export type ConfirmFlaggedSetParams = {
  userId: string;
  source: SessionSource;
  logId: string;
  exerciseId: string;
  setNumber: number;
};

export async function confirmFlaggedSet(
  params: ConfirmFlaggedSetParams,
): Promise<RawLoggedSetInput> {
  const client = getRecordsClient();
  const table = params.source === 'workout' ? 'workout_logs' : 'free_sessions';

  const { data: row, error: fetchError } = await client
    .from(table)
    .select('sets_json')
    .eq('id', params.logId)
    .eq('user_id', params.userId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!row) throw new Error('Session log not found');

  const sets = parseSetsJson(row.sets_json);
  const { sets: nextSets, updated } = confirmSetInParsedSets(
    sets,
    params.exerciseId,
    params.setNumber,
  );

  const { error: updateError } = await client
    .from(table)
    .update({ sets_json: nextSets })
    .eq('id', params.logId)
    .eq('user_id', params.userId);
  if (updateError) throw updateError;

  const exerciseName =
    typeof updated.exerciseName === 'string' ? updated.exerciseName.trim() : '';
  if (exerciseName) {
    await recomputeExerciseRecords(params.userId, resolveExerciseKey(exerciseName).key);
  }

  return updated;
}

export function updateSetInParsedSets(
  sets: RawLoggedSetInput[],
  exerciseId: string,
  setNumber: number,
  updates: { weightLbs: number; reps: number; rpe?: number | null },
): { sets: RawLoggedSetInput[]; updated: RawLoggedSetInput } {
  const idx = sets.findIndex(
    (set) => set.exerciseId === exerciseId && Number(set.setNumber) === setNumber,
  );
  if (idx < 0) {
    throw new Error('Set not found');
  }
  const existing = sets[idx];
  const exerciseName =
    typeof existing.exerciseName === 'string' ? existing.exerciseName.trim() : '';
  const updated: RawLoggedSetInput = {
    ...existing,
    weightLbs: updates.weightLbs,
    weight: updates.weightLbs,
    reps: updates.reps,
    rpe: updates.rpe !== undefined ? updates.rpe : existing.rpe ?? null,
    plausibility_status: plausibilityStatusForLoad(exerciseName, updates.weightLbs),
  };
  const nextSets = [...sets];
  nextSets[idx] = updated;
  return { sets: nextSets, updated };
}

export type UpdateSessionLoggedSetParams = {
  userId: string;
  source: SessionSource;
  logId: string;
  exerciseId: string;
  setNumber: number;
  weightLbs: number;
  reps: number;
  rpe?: number | null;
};

export async function updateSessionLoggedSet(
  params: UpdateSessionLoggedSetParams,
): Promise<RawLoggedSetInput> {
  const client = getRecordsClient();
  const table = params.source === 'workout' ? 'workout_logs' : 'free_sessions';

  const { data: row, error: fetchError } = await client
    .from(table)
    .select('sets_json')
    .eq('id', params.logId)
    .eq('user_id', params.userId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!row) throw new Error('Session log not found');

  const sets = parseSetsJson(row.sets_json);
  const { sets: nextSets, updated } = updateSetInParsedSets(
    sets,
    params.exerciseId,
    params.setNumber,
    {
      weightLbs: params.weightLbs,
      reps: params.reps,
      rpe: params.rpe,
    },
  );

  const { error: updateError } = await client
    .from(table)
    .update({ sets_json: nextSets })
    .eq('id', params.logId)
    .eq('user_id', params.userId);
  if (updateError) throw updateError;

  const exerciseName =
    typeof updated.exerciseName === 'string' ? updated.exerciseName.trim() : '';
  if (exerciseName) {
    await recomputeExerciseRecords(params.userId, resolveExerciseKey(exerciseName).key);
  }

  return updated;
}

export async function getPrCountForWorkoutLogIds(
  userId: string,
  workoutLogIds: string[],
): Promise<number> {
  if (workoutLogIds.length === 0) return 0;
  const records = await getExerciseRecords(userId);
  const idSet = new Set(workoutLogIds);
  return records.filter(
    (row) =>
      row.best_source === 'workout' &&
      idSet.has(row.best_workout_log_id) &&
      row.baseline_date < row.best_date,
  ).length;
}

export type WorkoutLogSet = {
  exerciseId?: string;
  exerciseName?: string;
  name?: string;
  setNumber?: number;
  weightLbs?: number;
  weight?: number;
  reps?: number;
  rpe?: number | null;
  swapped?: boolean;
};

export type WorkoutLogEntry = {
  id: string;
  week_number: number;
  day_number: number;
  logged_at: string;
  session_fatigue_rating: number | null;
  sets_json: WorkoutLogSet[] | null;
};

export type ExerciseSummary = {
  exerciseName: string;
  personalBestWeight: number;
  personalBestReps: number;
  personalBestDate: string;
  estimatedOneRM: number;
  totalSets: number;
  totalSessions: number;
  lastLoggedAt: string;
  lastWeightLbs: number;
  trend: 'up' | 'down' | 'flat';
};

export type SessionSummary = {
  id: string;
  title: string;
  weekNumber: number;
  dayNumber: number;
  loggedAt: string;
  totalSets: number;
  topLifts: Array<{ name: string; weightLbs: number }>;
  avgRpe: number | null;
  fatigueRating: number | null;
  fatigueLabel: string;
};

export type ExerciseSessionHistory = {
  logId: string;
  weekNumber: number;
  dayNumber: number;
  loggedAt: string;
  sets: Array<{
    setNumber: number;
    weightLbs: number;
    reps: number;
    rpe: number | null;
    isPersonalBest: boolean;
    isTopSet: boolean;
  }>;
};

export type WorkoutHistoryCache = {
  logs: WorkoutLogEntry[];
  planJson: unknown;
  planId: string;
};

let workoutHistoryCache: WorkoutHistoryCache | null = null;

export function setWorkoutHistoryCache(cache: WorkoutHistoryCache): void {
  workoutHistoryCache = cache;
}

export function getWorkoutHistoryCache(): WorkoutHistoryCache | null {
  return workoutHistoryCache;
}

export function estimatedOneRM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return Math.round(weight);
  return Math.round(weight * (1 + reps / 30));
}

export function parseSetsJson(raw: unknown): WorkoutLogSet[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as WorkoutLogSet[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeSetName(set: WorkoutLogSet): string {
  return (set.exerciseName ?? set.name ?? 'Exercise').trim() || 'Exercise';
}

function setWeight(set: WorkoutLogSet): number {
  return Number(set.weightLbs ?? set.weight ?? 0);
}

function setReps(set: WorkoutLogSet): number {
  return Number(set.reps ?? 0);
}

function exerciseKey(name: string): string {
  return name.toLowerCase().trim();
}

export function readSessionTitle(
  planJson: unknown,
  weekNumber: number,
  dayNumber: number,
): string {
  const pj = planJson as {
    weeks?: Array<{
      weekNumber?: number;
      week_number?: number;
      days?: Array<{
        dayNumber?: number;
        day_number?: number;
        title?: string;
      }>;
    }>;
  } | null;

  const weeks = pj?.weeks ?? [];
  const week =
    weeks.find((w) => (w.weekNumber ?? w.week_number) === weekNumber) ??
    weeks[weekNumber - 1];
  const days = week?.days ?? [];
  const day =
    days.find((d) => Number(d.dayNumber ?? d.day_number) === dayNumber) ??
    days[dayNumber - 1];
  const rawTitle = day?.title?.trim();
  if (rawTitle && rawTitle.length > 0) return rawTitle;
  return `Week ${weekNumber} · Day ${dayNumber}`;
}

const FATIGUE_LABEL: Record<number, string> = {
  1: 'Wiped',
  2: 'Tired',
  3: 'Good',
  4: 'Strong',
  5: 'Beast',
};

export function fatigueLabelFromRating(rating: number | null | undefined): string {
  if (rating == null || Number.isNaN(rating)) return '—';
  return FATIGUE_LABEL[Math.round(Number(rating))] ?? '—';
}

export function buildExerciseSummaries(logs: WorkoutLogEntry[]): ExerciseSummary[] {
  type Acc = {
    exerciseName: string;
    totalSets: number;
    sessionIds: Set<string>;
    pbWeight: number;
    pbReps: number;
    pbDate: string;
    sessionTops: Array<{ loggedAt: string; topWeight: number }>;
  };

  const map = new Map<string, Acc>();

  for (const log of logs) {
    const sets = parseSetsJson(log.sets_json);
    const perSessionExerciseTop = new Map<string, number>();

    for (const set of sets) {
      const weight = setWeight(set);
      const reps = setReps(set);
      if (weight <= 0) continue;

      const name = normalizeSetName(set);
      const key = exerciseKey(name);
      let acc = map.get(key);
      if (!acc) {
        acc = {
          exerciseName: name,
          totalSets: 0,
          sessionIds: new Set<string>(),
          pbWeight: 0,
          pbReps: 0,
          pbDate: log.logged_at,
          sessionTops: [],
        };
        map.set(key, acc);
      }

      acc.totalSets += 1;
      acc.sessionIds.add(log.id);

      const sessionTop = perSessionExerciseTop.get(key) ?? 0;
      if (weight > sessionTop) perSessionExerciseTop.set(key, weight);

      if (
        weight > acc.pbWeight ||
        (weight === acc.pbWeight && reps > acc.pbReps)
      ) {
        acc.pbWeight = weight;
        acc.pbReps = reps;
        acc.pbDate = log.logged_at;
      }
    }

    for (const [key, top] of perSessionExerciseTop) {
      const acc = map.get(key);
      if (!acc) continue;
      acc.sessionTops.push({ loggedAt: log.logged_at, topWeight: top });
    }
  }

  const summaries: ExerciseSummary[] = [];

  for (const acc of map.values()) {
    acc.sessionTops.sort(
      (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime(),
    );
    const lastTop = acc.sessionTops[0]?.topWeight ?? acc.pbWeight;
    const prevTop = acc.sessionTops[1]?.topWeight ?? lastTop;
    let trend: ExerciseSummary['trend'] = 'flat';
    if (lastTop > prevTop + 0.25) trend = 'up';
    else if (lastTop < prevTop - 0.25) trend = 'down';

    const lastLoggedAt =
      acc.sessionTops[0]?.loggedAt ?? acc.pbDate;

    summaries.push({
      exerciseName: acc.exerciseName,
      personalBestWeight: acc.pbWeight,
      personalBestReps: acc.pbReps,
      personalBestDate: acc.pbDate,
      estimatedOneRM: estimatedOneRM(acc.pbWeight, acc.pbReps),
      totalSets: acc.totalSets,
      totalSessions: acc.sessionIds.size,
      lastLoggedAt,
      lastWeightLbs: lastTop,
      trend,
    });
  }

  summaries.sort(
    (a, b) =>
      new Date(b.lastLoggedAt).getTime() - new Date(a.lastLoggedAt).getTime(),
  );

  return summaries;
}

export function buildSessionSummaries(
  logs: WorkoutLogEntry[],
  planJson: unknown,
): SessionSummary[] {
  return logs.map((log) => {
    const sets = parseSetsJson(log.sets_json);
    const exerciseBest = new Map<string, { name: string; weightLbs: number }>();
    const rpes: number[] = [];

    for (const set of sets) {
      const weight = setWeight(set);
      const reps = setReps(set);
      const rpe = set.rpe != null ? Number(set.rpe) : null;
      if (rpe != null && rpe > 0) rpes.push(rpe);

      if (weight <= 0) continue;
      const name = normalizeSetName(set);
      const key = exerciseKey(name);
      const existing = exerciseBest.get(key);
      if (!existing || weight > existing.weightLbs) {
        exerciseBest.set(key, { name, weightLbs: weight });
      }
    }

    const topLifts = [...exerciseBest.values()]
      .sort((a, b) => b.weightLbs - a.weightLbs)
      .slice(0, 2);

    const avgRpe =
      rpes.length > 0
        ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10
        : null;

    return {
      id: log.id,
      title: readSessionTitle(planJson, log.week_number, log.day_number),
      weekNumber: log.week_number,
      dayNumber: log.day_number,
      loggedAt: log.logged_at,
      totalSets: sets.length,
      topLifts,
      avgRpe,
      fatigueRating: log.session_fatigue_rating,
      fatigueLabel: fatigueLabelFromRating(log.session_fatigue_rating),
    };
  });
}

export function buildExerciseSessionHistory(
  logs: WorkoutLogEntry[],
  exerciseName: string,
): {
  personalBestWeight: number;
  personalBestReps: number;
  estimatedOneRM: number;
  personalBestDate: string;
  sessions: ExerciseSessionHistory[];
} {
  const targetKey = exerciseKey(exerciseName);
  let pbWeight = 0;
  let pbReps = 0;
  let pbDate = '';

  const sessions: ExerciseSessionHistory[] = [];

  for (const log of logs) {
    const matching = parseSetsJson(log.sets_json)
      .filter((set) => {
        const weight = setWeight(set);
        return weight > 0 && exerciseKey(normalizeSetName(set)) === targetKey;
      })
      .map((set) => {
        const weight = setWeight(set);
        const reps = setReps(set);
        const rpe = set.rpe != null && Number(set.rpe) > 0 ? Number(set.rpe) : null;
        return {
          setNumber: Number(set.setNumber ?? 0),
          weightLbs: weight,
          reps,
          rpe,
          isPersonalBest: false,
          isTopSet: false,
        };
      })
      .sort((a, b) => a.setNumber - b.setNumber);

    if (matching.length === 0) continue;

    const topWeight = Math.max(...matching.map((s) => s.weightLbs));
    for (const row of matching) {
      row.isTopSet = row.weightLbs === topWeight;
    }

    sessions.push({
      logId: log.id,
      weekNumber: log.week_number,
      dayNumber: log.day_number,
      loggedAt: log.logged_at,
      sets: matching,
    });
  }

  sessions.sort(
    (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime(),
  );

  let pbLogId: string | null = null;
  let pbSetIndex: number | null = null;
  let maxWeight = 0;
  let maxReps = 0;

  const chronological = [...sessions].sort(
    (a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime(),
  );

  for (const session of chronological) {
    session.sets.forEach((set, setIndex) => {
      if (
        set.weightLbs > maxWeight ||
        (set.weightLbs === maxWeight && set.reps > maxReps)
      ) {
        maxWeight = set.weightLbs;
        maxReps = set.reps;
        pbLogId = session.logId;
        pbSetIndex = setIndex;
      }
    });
  }

  for (const session of sessions) {
    session.sets.forEach((set, setIndex) => {
      set.isPersonalBest =
        pbLogId != null &&
        pbSetIndex != null &&
        session.logId === pbLogId &&
        setIndex === pbSetIndex;
    });
  }

  pbWeight = maxWeight;
  pbReps = maxReps;
  if (pbLogId != null) {
    const pbSession = sessions.find((s) => s.logId === pbLogId);
    if (pbSession) pbDate = pbSession.loggedAt;
  }

  return {
    personalBestWeight: pbWeight,
    personalBestReps: pbReps,
    estimatedOneRM: estimatedOneRM(pbWeight, pbReps),
    personalBestDate: pbDate,
    sessions,
  };
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatWeightLb(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : String(rounded);
}

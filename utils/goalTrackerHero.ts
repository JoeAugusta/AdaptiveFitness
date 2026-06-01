import { isTargetLift } from './strengthGoalLift';
import { getHypertrophyProjection, type CaloriePace } from './projections';

export type GoalHeroModel = {
  label: string;
  primaryTitle: string;
  primaryValue?: string;
  primarySub?: string;
  progressPct: number;
  goalReached: boolean;
  startLabel: string;
  targetLabel: string;
  jordanNote: string;
  /** Raw lbs estimate for strength / power_hypertrophy progress elsewhere on screen */
  strengthEstimateLbs?: number;
};

type PlanJsonLike = {
  goal?: string;
  experience?: string;
  targetLift?: string;
  goalLift?: string;
  target1RM?: number | string;
  current1RM?: number | string;
  totalWeeks?: number;
  daysPerWeek?: number;
  week1BaselineWeight?: number;
  currentLifts?: Record<string, number | null>;
};

type LogRow = {
  logged_at?: string;
  week_number?: number;
  sets_json?: Array<{
    exerciseId?: string;
    exerciseName?: string;
    name?: string;
    weightLbs?: number;
    weight?: number;
    reps?: number;
  }>;
};

const formatLiftName = (lift: string) =>
  lift.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

function buildExerciseNameMap(planJson: PlanJsonLike): Record<string, string> {
  const exerciseMap: Record<string, string> = {};
  const weeks = (planJson as { weeks?: Array<{ days?: Array<{ exercises?: Array<{ id?: string; name?: string; exerciseName?: string }> }> }> }).weeks ?? [];
  for (const week of weeks) {
    for (const day of week.days ?? []) {
      for (const ex of day.exercises ?? []) {
        if (ex.id && (ex.name || ex.exerciseName)) {
          exerciseMap[ex.id] = String(ex.exerciseName ?? ex.name);
        }
      }
    }
  }
  return exerciseMap;
}

/** Max Epley 1RM across all logged sets matching target lift. */
export function estimate1RMFromAllLogs(
  logs: LogRow[],
  targetLift: string,
  exerciseMap: Record<string, string>,
): number | null {
  let best = 0;
  for (const log of logs) {
    for (const s of log.sets_json ?? []) {
      const displayName =
        s.exerciseName ?? s.name ?? exerciseMap[s.exerciseId ?? ''] ?? '';
      if (
        !isTargetLift(
          { name: displayName, exerciseName: displayName, exerciseId: s.exerciseId },
          targetLift,
        )
      ) {
        continue;
      }
      const w = Number(s.weightLbs ?? s.weight ?? 0);
      const r = Number(s.reps ?? 0);
      if (w > 0 && r > 0) {
        const est = w * (1 + r / 30);
        if (est > best) best = est;
      }
    }
  }
  return best > 0 ? Math.round(best) : null;
}

export function resolvePrimaryLiftId(planJson: PlanJsonLike): string | null {
  const raw = planJson.targetLift ?? planJson.goalLift;
  if (raw != null && String(raw).trim() !== '') {
    return String(raw).trim();
  }
  const cl = planJson.currentLifts;
  if (!cl || typeof cl !== 'object') return null;

  const order: { keys: string[]; id: string }[] = [
    { keys: ['deadlift'], id: 'deadlift' },
    { keys: ['backSquat', 'back_squat'], id: 'barbell_squat' },
    { keys: ['benchPress', 'bench_press'], id: 'bench_press' },
    { keys: ['overheadPress', 'ohp'], id: 'ohp' },
  ];
  for (const entry of order) {
    if (
      entry.keys.some((k) => {
        const v = cl[k];
        return v != null && Number(v) > 0;
      })
    ) {
      return entry.id;
    }
  }
  return null;
}

function buildStrengthJordanNote(
  pct: number,
  liftLabel: string,
  gained: number,
  remaining: number,
  target1RM: number,
): string {
  if (pct >= 90) {
    return `${remaining} lbs from your ${target1RM} lb goal. Final push.`;
  }
  if (pct >= 50) {
    return `${pct}% there. ${liftLabel} is moving on schedule.`;
  }
  if (pct >= 10) {
    return `${gained} lbs gained since you started. Keep the consistency.`;
  }
  return `Week 1 baseline set. Jordan tracks your ${liftLabel} from here.`;
}

function buildStrengthLikeHero(
  planJson: PlanJsonLike,
  logs: LogRow[],
  formatMass: (lbs: number) => string,
  goalFallback1RM?: number,
  label = 'STRENGTH GOAL',
  jordanOverride?: string,
): GoalHeroModel | null {
  const targetLift = resolvePrimaryLiftId(planJson);
  if (!targetLift) return null;

  const starting1RM = Number(
    planJson.current1RM ?? goalFallback1RM ?? 0,
  );
  const target1RM = Number(planJson.target1RM ?? 0);
  if (
    !Number.isFinite(starting1RM) ||
    !Number.isFinite(target1RM) ||
    target1RM <= starting1RM
  ) {
    return null;
  }

  const exMap = buildExerciseNameMap(planJson);
  const fromLogs = estimate1RMFromAllLogs(logs, targetLift, exMap);
  const currentEstimate = fromLogs ?? starting1RM;
  const gap = target1RM - starting1RM;
  const gained = currentEstimate - starting1RM;
  const rawPct = gap > 0 ? (gained / gap) * 100 : 0;
  const goalReached = rawPct >= 100;
  const progressPct = clampPct(rawPct);
  const liftLabel = formatLiftName(targetLift);
  const remaining = Math.max(0, Math.round(target1RM - currentEstimate));

  return {
    label,
    primaryTitle: liftLabel,
    primaryValue: formatMass(Math.round(currentEstimate)),
    progressPct,
    goalReached,
    strengthEstimateLbs: Math.round(currentEstimate),
    startLabel: `Started: ${formatMass(Math.round(starting1RM))}`,
    targetLabel: `Goal: ${formatMass(Math.round(target1RM))}`,
    jordanNote:
      jordanOverride ??
      buildStrengthJordanNote(
        progressPct,
        liftLabel,
        Math.round(gained),
        remaining,
        Math.round(target1RM),
      ),
  };
}

function countPlannedWorkoutSessions(
  planJson: PlanJsonLike,
  throughWeek: number,
): number {
  const weeks =
    (planJson as { weeks?: Array<{ weekNumber?: number; days?: Array<{ type?: string }> }> }).weeks ?? [];
  let n = 0;
  for (const week of weeks) {
    const wn = Number(week.weekNumber ?? 0);
    if (wn < 1 || wn > throughWeek) continue;
    for (const day of week.days ?? []) {
      if ((day?.type ?? 'workout') === 'workout') n++;
    }
  }
  if (n > 0) return n;
  const daysPerWeek = Number(planJson.daysPerWeek ?? 0);
  return daysPerWeek > 0 ? daysPerWeek * Math.max(1, throughWeek) : 0;
}

function normalizePace(p?: string | null): CaloriePace {
  if (p === 'conservative' || p === 'balanced' || p === 'aggressive') return p;
  return 'balanced';
}

export function buildGoalHeroModel(input: {
  planJson: PlanJsonLike | null | undefined;
  currentWeek: number;
  totalWeeks: number;
  logs: LogRow[];
  sessionCount: number;
  weightLogs: { log_date: string; weight_lbs: number }[];
  goalRow?: {
    current_1rm?: number;
    starting_weight_lbs?: number;
    target_weight_lbs?: number;
  } | null;
  caloriePace?: string | null;
  formatMass: (lbs: number) => string;
}): GoalHeroModel | null {
  const pj = input.planJson;
  if (!pj?.goal) return null;

  const goal = String(pj.goal).toLowerCase().trim();
  const cw = Math.max(1, input.currentWeek);
  const tw = Math.max(1, input.totalWeeks ?? pj.totalWeeks ?? 12);

  if (goal === 'strength') {
    return buildStrengthLikeHero(
      pj,
      input.logs,
      input.formatMass,
      input.goalRow?.current_1rm,
    );
  }

  if (goal === 'power_hypertrophy') {
    const liftId = resolvePrimaryLiftId(pj);
    const liftLabel = liftId ? formatLiftName(liftId) : 'Primary lift';
    const base = buildStrengthLikeHero(
      pj,
      input.logs,
      input.formatMass,
      input.goalRow?.current_1rm,
      'POWER & SIZE GOAL',
      `Building strength and size simultaneously. ${liftLabel} is your primary strength marker. Accessories drive the hypertrophy.`,
    );
    if (base) return base;
    const planPct = clampPct((cw / tw) * 100);
    return {
      label: 'POWER & SIZE GOAL',
      primaryTitle: `Week ${cw} of ${tw}`,
      primarySub: 'Strength and hypertrophy block',
      progressPct: planPct,
      goalReached: cw >= tw,
      startLabel: 'Week 1',
      targetLabel: `Week ${tw}`,
      jordanNote:
        'Building strength and size simultaneously. Log sessions so Jordan can track both strength and volume progress.',
    };
  }

  if (goal === 'hypertrophy') {
    const pace = normalizePace(input.caloriePace);
    const exp = String(pj.experience ?? 'intermediate').toLowerCase();
    const proj = getHypertrophyProjection(exp, pace, tw);
    const projectedGain = proj[proj.length - 1] ?? 0;
    const progressPct = clampPct((cw / tw) * 100);
    const sessionsExpected = countPlannedWorkoutSessions(pj, cw);
    const sessionsCompleted = input.sessionCount;
    const ratio =
      sessionsExpected > 0 ? sessionsCompleted / sessionsExpected : 0;
    const daysPerWeek = Number(pj.daysPerWeek ?? 4);

    let jordanNote: string;
    if (ratio >= 0.9) {
      jordanNote =
        'Consistency is exactly where it needs to be. Volume is accumulating.';
    } else if (ratio >= 0.7) {
      jordanNote = `Good attendance. Hitting ${sessionsCompleted} of ${sessionsExpected} planned sessions.`;
    } else {
      jordanNote = `Consistency drives hypertrophy. Aim for all ${daysPerWeek} sessions this week.`;
    }

    return {
      label: 'HYPERTROPHY GOAL',
      primaryTitle: `Week ${cw} of ${tw}`,
      primarySub: `Lean mass goal: +${input.formatMass(projectedGain)}`,
      progressPct,
      goalReached: cw >= tw,
      startLabel: 'Week 1',
      targetLabel: `Week ${tw}`,
      jordanNote,
    };
  }

  if (goal === 'fat_loss') {
    const sortedWeights = [...input.weightLogs].sort((a, b) =>
      a.log_date.localeCompare(b.log_date),
    );
    const startWeight =
      Number(pj.week1BaselineWeight) > 0
        ? Number(pj.week1BaselineWeight)
        : sortedWeights.length > 0
          ? Number(sortedWeights[0].weight_lbs)
          : Number(input.goalRow?.starting_weight_lbs ?? 0);

    const targetWeight = Number(
      input.goalRow?.target_weight_lbs ?? startWeight - 10,
    );
    const latest = sortedWeights[sortedWeights.length - 1];
    const currentWeight = latest ? Number(latest.weight_lbs) : null;

    const gap = startWeight - targetWeight;
    const lostSoFar =
      currentWeight != null && startWeight > 0
        ? Math.max(0, Math.round((startWeight - currentWeight) * 10) / 10)
        : 0;
    const lost =
      currentWeight != null && gap > 0
        ? startWeight - currentWeight
        : 0;
    const rawPct = gap > 0 ? (lost / gap) * 100 : 0;
    const goalReached = rawPct >= 100;
    const progressPct = clampPct(rawPct);
    const weeksIn = cw;

    let jordanNote: string;
    if (lostSoFar > 0) {
      jordanNote = `${lostSoFar} lbs down. Pace is on track.`;
    } else if (weeksIn > 1) {
      jordanNote =
        'Weight unchanged. Log daily for accurate tracking. Single-day variance is normal.';
    } else {
      jordanNote =
        'Week 1 baseline set. Log your weight each morning for Jordan to track your progress.';
    }

    return {
      label: 'FAT LOSS GOAL',
      primaryTitle:
        currentWeight != null
          ? input.formatMass(currentWeight)
          : 'Log your weight to track progress',
      primarySub:
        currentWeight != null
          ? `${lostSoFar} lbs lost`
          : undefined,
      progressPct,
      goalReached,
      startLabel: `Started: ${input.formatMass(Math.round(startWeight))}`,
      targetLabel: `Goal: ${input.formatMass(Math.round(targetWeight))}`,
      jordanNote,
    };
  }

  if (goal === 'recomp') {
    const progressPct = clampPct((cw / tw) * 100);
    return {
      label: 'BODY RECOMPOSITION',
      primaryTitle: `Week ${cw} of ${tw}`,
      primarySub: 'Strength + fat loss simultaneously',
      progressPct,
      goalReached: cw >= tw,
      startLabel: 'Week 1',
      targetLabel: `Week ${tw}`,
      jordanNote:
        "Recomp progress isn't always visible on the scale. Strength increasing while weight stays flat is the signal that's working.",
    };
  }

  return null;
}

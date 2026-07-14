import {
  estimateE1RM,
  isTimedRawSet,
  plausibilityStatusForRawSet,
  shouldExcludeSetFromRecords,
} from '../Lib/records';
import { matchesTargetLift } from './strengthGoalLift';
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
  current1RM?: number | string | null;
  totalWeeks?: number;
  daysPerWeek?: number;
  week1BaselineWeight?: number | string;
  currentLifts?: Record<string, number | null>;
};

type LogRow = {
  logged_at?: string;
  week_number?: number;
  sets_json?: unknown;
};

function parseSetsJson(raw: unknown): Array<{
  exerciseId?: string;
  exerciseName?: string;
  name?: string;
  weightLbs?: number;
  weight?: number;
  weight_lbs?: number;
  reps?: number;
}> {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

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

/** Max est. 1RM across qualifying logged sets matching target lift. */
export function estimate1RMFromAllLogs(
  logs: LogRow[],
  targetLift: string,
  exerciseMap: Record<string, string>,
  debugContext?: { planId?: string; startingWeight?: number; targetWeight?: number },
): number | null {
  const testMatch = matchesTargetLift('Bench Press', 'bench_press');
  console.log('[matchesTargetLift test]', testMatch);
  console.log('[goalTrackerHero] planId:', debugContext?.planId ?? 'unknown');
  console.log('[goalTrackerHero] targetLift:', targetLift);

  const allSets: Array<{
    exerciseName: string;
    weightLbs: number;
    reps: number;
  }> = [];
  const matchedSets: typeof allSets = [];
  let bestWeight = 0;
  let bestReps = 0;
  let best = 0;

  for (const log of logs) {
    for (const s of parseSetsJson(log.sets_json)) {
      const displayName =
        s.exerciseName ?? s.name ?? exerciseMap[s.exerciseId ?? ''] ?? '';
      const w = Number(s.weightLbs ?? s.weight ?? s.weight_lbs ?? 0);
      const r = Number(s.reps ?? 0);
      allSets.push({ exerciseName: displayName, weightLbs: w, reps: r });

      if (!matchesTargetLift(displayName, targetLift)) {
        continue;
      }
      if (
        shouldExcludeSetFromRecords({
          is_timed: isTimedRawSet(s),
          plausibility_status: plausibilityStatusForRawSet(s),
          exercise_name: displayName,
          weight_lbs: w,
          reps: r,
          rpe: s.rpe == null || s.rpe === 0 ? null : Number(s.rpe),
        })
      ) {
        continue;
      }

      matchedSets.push({ exerciseName: displayName, weightLbs: w, reps: r });
      if (w > bestWeight || (w === bestWeight && r > bestReps)) {
        bestWeight = w;
        bestReps = r;
      }
      const est = estimateE1RM({
        load: w,
        reps: r,
        rpe: s.rpe == null || s.rpe === 0 ? null : Number(s.rpe),
      });
      if (est != null && est > best) best = est;
    }
  }

  const estimatedOneRM = best > 0 ? best : 0;
  const startingWeight = debugContext?.startingWeight ?? 0;
  const targetWeight = debugContext?.targetWeight ?? 0;
  const pct =
    startingWeight &&
    targetWeight &&
    estimatedOneRM > startingWeight &&
    targetWeight > startingWeight
      ? Math.min(
          100,
          Math.round(
            ((estimatedOneRM - startingWeight) / (targetWeight - startingWeight)) *
              100,
          ),
        )
      : 0;

  console.log('[goalTrackerHero] total sets examined:', allSets.length);
  console.log('[goalTrackerHero] matched sets:', matchedSets.length);
  console.log('[goalTrackerHero] bestWeight:', bestWeight, 'bestReps:', bestReps);
  console.log('[goalTrackerHero] estimatedOneRM:', estimatedOneRM);
  console.log('[goalTrackerHero] startingWeight:', startingWeight);
  console.log('[goalTrackerHero] pct:', pct);

  return best > 0 ? best : null;
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

function resolveStartingWeight(
  goalCurrent1rm: number | null | undefined,
  planJson: PlanJsonLike,
): number {
  for (const raw of [
    goalCurrent1rm,
    planJson.current1RM,
    planJson.week1BaselineWeight,
  ]) {
    if (raw == null || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function resolveTargetWeight(
  planJson: PlanJsonLike,
  goalRow?: { target_1rm?: number | null } | null,
): number {
  const fromPlan = Number(planJson.target1RM ?? 0);
  if (Number.isFinite(fromPlan) && fromPlan > 0) return fromPlan;

  const fromGoal = Number(goalRow?.target_1rm ?? 0);
  if (Number.isFinite(fromGoal) && fromGoal > 0) return fromGoal;

  return 0;
}

function buildStrengthLikeHero(
  planJson: PlanJsonLike,
  logs: LogRow[],
  formatMass: (lbs: number) => string,
  goalFallback1RM?: number | null,
  label = 'STRENGTH GOAL',
  jordanOverride?: string,
  planId?: string,
  goalRow?: { target_1rm?: number | null; current_1rm?: number | null } | null,
): GoalHeroModel | null {
  const targetLift = resolvePrimaryLiftId(planJson);
  if (!targetLift) return null;

  const startingWeight = resolveStartingWeight(
    goalFallback1RM,
    planJson,
  );
  const targetWeight = resolveTargetWeight(planJson, goalRow);
  if (
    !Number.isFinite(startingWeight) ||
    startingWeight <= 0 ||
    !Number.isFinite(targetWeight) ||
    targetWeight <= startingWeight
  ) {
    console.log('[goalTrackerHero] buildStrengthLikeHero bail — invalid weights', {
      planId,
      startingWeight,
      targetWeight,
      week1BaselineWeight: planJson.week1BaselineWeight,
      current1RM: planJson.current1RM,
      goalFallback1RM,
      goalTarget1rm: goalRow?.target_1rm,
    });
    return null;
  }

  const exMap = buildExerciseNameMap(planJson);
  const fromLogs = estimate1RMFromAllLogs(logs, targetLift, exMap, {
    planId,
    startingWeight,
    targetWeight,
  });
  // Option A: stated 1RM is the floor.
  // Only update estimate when logs produce a value ABOVE
  // the stated starting weight.
  const estimatedOneRM =
    fromLogs != null && fromLogs > startingWeight
      ? fromLogs // new PR confirmed by training data
      : startingWeight; // hold at stated 1RM until exceeded

  // Progress % only advances when logged data exceeds
  // the starting weight
  const gap = targetWeight - startingWeight;
  const rawPct =
    fromLogs != null &&
    fromLogs > startingWeight &&
    gap > 0
      ? Math.min(
          100,
          Math.round(((fromLogs - startingWeight) / gap) * 100),
        )
      : 0;
  const goalReached = rawPct >= 100;
  const progressPct = clampPct(rawPct);
  const liftLabel = formatLiftName(targetLift);
  const remaining = Math.max(0, Math.round(targetWeight - estimatedOneRM));
  const gained = estimatedOneRM - startingWeight;

  return {
    label,
    primaryTitle: liftLabel,
    primaryValue: formatMass(Math.round(estimatedOneRM)),
    primarySub:
      fromLogs != null && fromLogs > startingWeight
        ? undefined
        : 'Updates when you exceed your starting 1RM',
    progressPct,
    goalReached,
    strengthEstimateLbs: Math.round(estimatedOneRM),
    startLabel: `Started: ${formatMass(Math.round(startingWeight))}`,
    targetLabel: `Goal: ${formatMass(Math.round(targetWeight))}`,
    jordanNote:
      jordanOverride ??
      buildStrengthJordanNote(
        progressPct,
        liftLabel,
        Math.round(gained),
        remaining,
        Math.round(targetWeight),
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
  planId?: string;
  currentWeek: number;
  totalWeeks: number;
  logs: LogRow[];
  sessionCount: number;
  weightLogs: { log_date: string; weight_lbs: number }[];
  goalRow?: {
    current_1rm?: number | null;
    target_1rm?: number | null;
    starting_weight_lbs?: number | null;
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
      'STRENGTH GOAL',
      undefined,
      input.planId,
      input.goalRow,
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
      input.planId,
      input.goalRow,
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

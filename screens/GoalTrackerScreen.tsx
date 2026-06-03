import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, LineHeights, Spacing, Radius } from '../constants/design';
import { Ionicons } from '@expo/vector-icons';
import { stripEmDash } from '../utils/jordanText';
import { isExerciseUnilateral } from '../constants/exerciseLibrary';
import type { CaloriePace } from '../utils/projections';
import {
  getFatLossProjection,
  getHypertrophyProjection,
  getStrengthProjection,
  getRecompBfProjection,
} from '../utils/projections';
import ProjectionChart, {
  type ProjectionChartGoal,
} from '../components/ProjectionChart';
import { useMetric } from '../utils/units';
import { buildGoalHeroModel, type GoalHeroModel } from '../utils/goalTrackerHero';
import { matchesTargetLift, epleyEstimated1RMLbs } from '../utils/strengthGoalLift';
import { getLocalDate, getLocalDateString } from '../utils/dateUtils';
import { parseSetsJson } from '../utils/workoutHistoryData';

const TRACKER_CHART_STROKE: Record<string, string> = {
  fat_loss:          '#F97316',
  hypertrophy:       '#22C55E',
  strength:          '#F59E0B',
  power_hypertrophy: '#F59E0B',
  recomp:            '#F97316',
  general:           '#F97316',
};

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// ── Types ──

interface GoalRow {
  id: string;
  user_id: string;
  goal_type: string;
  target_lift?: string;
  current_1rm?: number;
  target_1rm?: number;
  starting_weight_lbs?: number;
  target_weight_lbs?: number;
  target_body_fat_pct?: number;
  plan_duration_weeks?: number;
  status: string;
  created_at: string;
  projection_text?: string | null;
  projection_metrics?: Record<string, any> | null;
}

interface PlanRow {
  id: string;
  current_week: number;
  total_weeks: number;
  plan_json: any;
  created_at?: string;
}

interface ProgressResult {
  progressPct: number;
  progressLabel: string;
  details: string;
}

interface Milestone {
  pct: number;
  label: string;
  icon: string;
  reached: boolean;
}

const GOAL_BADGE: Record<string, { color: string; label: string }> = {
  strength:         { color: Colors.warning,  label: 'Strength' },
  hypertrophy:      { color: '#8B5CF6',        label: 'Hypertrophy' },
  power_hypertrophy:{ color: Colors.warning,   label: 'Strength & Size' },
  recomp:           { color: '#06B6D4',         label: 'Recomposition' },
  fat_loss:         { color: Colors.success,   label: 'Fat Loss' },
  general:          { color: Colors.accent,    label: 'General Fitness' },
};

const MILESTONE_DEFS = [
  { pct: 10,  label: 'Getting Started', icon: 'leaf-outline' },
  { pct: 50,  label: 'Halfway There',   icon: 'fitness-outline' },
  { pct: 75,  label: 'Almost There',    icon: 'flame-outline' },
  { pct: 90,  label: 'Final Push',      icon: 'flash-outline' },
  { pct: 100, label: 'Goal Complete',   icon: 'trophy-outline' },
];

function calculateProgress(
  goal: GoalRow,
  plan: PlanRow | null,
  completedSessions: number,
): ProgressResult {
  const gt = goal.goal_type;

  if (gt === 'fat_loss') {
    const start = goal.starting_weight_lbs ?? 0;
    const target = goal.target_weight_lbs ?? (start - 10);
    const range = start - target;
    return {
      progressPct: 0,
      progressLabel: 'Weight lost',
      details: `Started ${start}lbs, target ${target}lbs`,
    };
  }

  // hypertrophy, recomp, general — plan completion (sessions logged, not weeks elapsed)
  const totalWeeks = plan?.total_weeks ?? goal.plan_duration_weeks ?? 12;
  const daysPerWeek = Number(
    plan?.plan_json?.daysPerWeek ?? plan?.plan_json?.days_per_week ?? 0,
  );
  const totalSessions =
    daysPerWeek > 0 ? totalWeeks * daysPerWeek : totalWeeks;
  const pct =
    totalSessions > 0
      ? Math.min(100, Math.round((completedSessions / totalSessions) * 100))
      : 0;
  const currentWeek = plan?.current_week ?? 1;
  return {
    progressPct: pct,
    progressLabel: 'Plan completion',
    details: `Week ${currentWeek} of ${totalWeeks}`,
  };
}

function buildMilestones(progressPct: number): Milestone[] {
  return MILESTONE_DEFS.map((m) => ({
    pct: m.pct,
    label: m.label,
    icon: m.icon,
    reached: progressPct >= m.pct,
  }));
}

/** Match logged exercise names to goal target lift ids (e.g. bench_press → "Barbell Bench Press"). */
function liftIdMatchesExerciseName(
  exerciseNameLower: string,
  targetLiftLower: string,
): boolean {
  const raw = targetLiftLower.trim().toLowerCase();
  if (!raw) return false;
  if (raw === 'ohp' || raw.includes('overhead') || raw.includes('ohp')) {
    return (
      exerciseNameLower.includes('overhead') ||
      exerciseNameLower.includes('military') ||
      /\bohp\b/.test(exerciseNameLower)
    );
  }
  if (raw === 'weighted_pullup' || raw.includes('pullup') || raw.includes('pull-up')) {
    return (
      exerciseNameLower.includes('pull-up') ||
      exerciseNameLower.includes('pullup') ||
      exerciseNameLower.includes('chin-up') ||
      exerciseNameLower.includes('chinup')
    );
  }
  if (raw === 'barbell_row' || (raw.includes('row') && !raw.includes('deadlift'))) {
    return exerciseNameLower.includes('row');
  }
  const slug = raw.replace(/^barbell_/, '').replace(/_/g, ' ');
  const parts = slug.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return false;
  return parts.every((p) => exerciseNameLower.includes(p));
}

const formatLiftName = (lift: string) =>
  lift.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function formatProjectionText(text: string): string {
  return text.replace(/[a-z]+(?:_[a-z]+)+/gi, (match) => formatLiftName(match));
}

function getGoalTitle(goal: GoalRow): string {
  const gt = goal.goal_type;
  if (gt === 'strength') {
    const lift = goal.target_lift ? formatLiftName(goal.target_lift) : '';
    return lift ? `Hit ${goal.target_1rm ?? '?'}lbs ${lift}` : `Hit ${goal.target_1rm ?? '?'}lbs`;
  }
  if (gt === 'hypertrophy') return `Build Muscle: ${goal.plan_duration_weeks ?? '?'} Week Plan`;
  if (gt === 'power_hypertrophy') return `Strength & Size: ${goal.plan_duration_weeks ?? '?'} Week Plan`;
  if (gt === 'fat_loss') return `Lose Weight: Target ${goal.target_weight_lbs ?? '?'}lbs`;
  if (gt === 'recomp') return `Body Recomposition: ${goal.plan_duration_weeks ?? '?'} Weeks`;
  return `General Fitness: ${goal.plan_duration_weeks ?? '?'} Week Plan`;
}

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `Started ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function normalizeTrackerPace(p?: string | null): CaloriePace {
  if (p === 'conservative' || p === 'balanced' || p === 'aggressive') return p;
  return 'balanced';
}

function buildExerciseNameMap(planJson: any): Record<string, string> {
  const exerciseMap: Record<string, string> = {};
  for (const week of planJson?.weeks ?? []) {
    for (const day of week.days ?? []) {
      for (const ex of day.exercises ?? []) {
        if (ex.id && ex.name) exerciseMap[ex.id] = ex.name;
        if (ex.id && ex.exerciseName) exerciseMap[ex.id] = ex.exerciseName;
      }
    }
  }
  return exerciseMap;
}

function countPlannedWorkoutSessions(planJson: any, throughWeek: number): number {
  let n = 0;
  for (const week of planJson?.weeks ?? []) {
    const wn = Number(week.weekNumber ?? 0);
    if (wn < 1 || wn > throughWeek) continue;
    for (const day of week.days ?? []) {
      if ((day?.type ?? 'workout') === 'workout') n++;
    }
  }
  if (n > 0) return n;
  const daysPerWeek = Number(planJson?.daysPerWeek ?? 0);
  return daysPerWeek > 0 ? daysPerWeek * Math.max(1, throughWeek) : 0;
}

function GoalHeroSkeleton({ pulse }: { pulse: Animated.Value }) {
  return (
    <View style={styles.heroCard}>
      <Animated.View style={[styles.heroSkeletonLine, styles.heroSkeletonLabel, { opacity: pulse }]} />
      <Animated.View style={[styles.heroSkeletonLine, styles.heroSkeletonTitle, { opacity: pulse }]} />
      <Animated.View style={[styles.heroSkeletonLine, styles.heroSkeletonMetric, { opacity: pulse }]} />
      <Animated.View style={[styles.heroSkeletonBar, { opacity: pulse }]} />
      <View style={styles.heroBoundsRow}>
        <Animated.View style={[styles.heroSkeletonLine, styles.heroSkeletonSmall, { opacity: pulse }]} />
        <Animated.View style={[styles.heroSkeletonLine, styles.heroSkeletonSmall, { opacity: pulse }]} />
      </View>
      <Animated.View style={[styles.heroSkeletonLine, styles.heroSkeletonNote, { opacity: pulse }]} />
    </View>
  );
}

function GoalProgressHeroCard({
  model,
  progressAnim,
}: {
  model: GoalHeroModel;
  progressAnim: Animated.Value;
}) {
  return (
    <View style={styles.heroCard}>
      <Text style={styles.heroGoalTypeLabel}>{model.label}</Text>
      <Text style={styles.heroPrimaryTitle}>{model.primaryTitle}</Text>
      {model.primaryValue ? (
        <Text style={styles.heroPrimaryValue}>{model.primaryValue}</Text>
      ) : null}
      {model.primarySub ? (
        <Text style={styles.heroPrimarySub}>{model.primarySub}</Text>
      ) : null}
      <View style={styles.heroBarRow}>
        <View style={styles.heroBarTrack}>
          <Animated.View
            style={[
              styles.heroBarFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
        {model.goalReached ? (
          <Text style={styles.heroGoalReachedLabel}>Goal reached</Text>
        ) : (
          <Text style={styles.heroBarPct}>{model.progressPct}%</Text>
        )}
      </View>
      <View style={styles.heroBoundsRow}>
        <Text style={styles.heroBoundsText}>{model.startLabel}</Text>
        <Text style={styles.heroBoundsText}>{model.targetLabel}</Text>
      </View>
      <View style={styles.heroJordanNote}>
        <Text style={styles.heroJordanNoteText}>
          {stripEmDash(model.jordanNote)}
        </Text>
      </View>
    </View>
  );
}

function buildWeightActualsByWeek(
  logs: { log_date: string; weight_lbs: number }[],
  planStartIso: string,
  totalWeeks: number,
): (number | null)[] {
  const start = new Date(planStartIso);
  if (Number.isNaN(start.getTime())) return Array(totalWeeks + 1).fill(null);
  start.setHours(0, 0, 0, 0);
  const out: (number | null)[] = Array(totalWeeks + 1).fill(null);
  for (let i = 0; i <= totalWeeks; i++) {
    const wStart = new Date(start);
    wStart.setDate(wStart.getDate() + i * 7);
    const wEnd = new Date(wStart);
    wEnd.setDate(wEnd.getDate() + 7);
    const inBucket = logs.filter((l) => {
      const d = new Date(`${l.log_date}T12:00:00`);
      return d >= wStart && d < wEnd;
    });
    if (inBucket.length === 0) continue;
    const last = inBucket[inBucket.length - 1];
    const lbs = Number(last.weight_lbs);
    if (Number.isFinite(lbs)) out[i] = lbs;
  }
  return out;
}

function getBestEpleyForWeek(
  logsForWeek: { sets_json?: unknown }[],
  targetLift: string,
  exerciseMap: Record<string, string>,
): number | null {
  let best = 0;
  for (const log of logsForWeek) {
    for (const s of parseSetsJson(log.sets_json)) {
      const name =
        s.exerciseName ??
        s.name ??
        exerciseMap[s.exerciseId ?? ''] ??
        '';
      if (!matchesTargetLift(name, targetLift)) continue;
      const w = Number(s.weightLbs ?? s.weight ?? 0);
      const r = Number(s.reps ?? 0);
      if (w <= 0 || r <= 0) continue;
      const est = epleyEstimated1RMLbs(w, r);
      if (est > best) best = est;
    }
  }
  return best > 0 ? best : null;
}

function buildStrengthActualsSeries(
  totalWeeks: number,
  logs: { week_number: number; sets_json?: unknown }[],
  targetLift: string,
  exerciseMap: Record<string, string>,
  startingWeight: number,
): (number | null)[] {
  const out: (number | null)[] = Array(totalWeeks + 1).fill(null);
  const floor = startingWeight > 0 ? startingWeight : 0;

  for (let wk = 1; wk <= totalWeeks; wk++) {
    const logsForWeek = logs.filter((l) => l.week_number === wk);
    if (logsForWeek.length === 0) continue;

    const epley = getBestEpleyForWeek(logsForWeek, targetLift, exerciseMap);
    if (epley == null && floor <= 0) continue;

    const value =
      epley != null && epley > floor ? epley : floor > 0 ? floor : epley;
    if (value != null && value > 0) {
      out[wk] = Math.round(value);
    }
  }

  return out;
}

type TrackerCallout = {
  col1: { label: string; value: string; sub?: string };
  col2: { label: string; value: string; sub?: string };
  col3: { label: string; value: string; sub?: string };
};

type TrackerChartModel = {
  projection: number[];
  actuals: (number | null)[];
  yMin: number;
  yMax: number;
  yLabel: string;
  targetValue?: number;
  goalColor: string;
  weeks: number;
  callout: TrackerCallout;
  compareIndex: number;
};

function buildTrackerChartModel(
  goal: GoalRow,
  plan: PlanRow,
  weightLogs: { log_date: string; weight_lbs: number }[],
  workoutLogs: { week_number: number; sets_json: any[] }[],
  caloriePace: string | null,
): TrackerChartModel | null {
  const totalWeeks = plan.total_weeks;
  if (totalWeeks < 1) return null;
  const pace = normalizeTrackerPace(caloriePace);
  const planStart =
    plan.created_at ?? goal.created_at ?? new Date().toISOString();
  const gt = goal.goal_type;
  const badgeColor = GOAL_BADGE[gt]?.color ?? Colors.accent;

  if (gt === 'fat_loss') {
    const startW =
      Number(goal.starting_weight_lbs) ||
      weightLogs[0]?.weight_lbs ||
      180;
    const projection = getFatLossProjection(startW, pace, totalWeeks);
    const actuals = buildWeightActualsByWeek(
      weightLogs,
      planStart,
      totalWeeks,
    );
    const endP = projection[projection.length - 1];
    const actNums = actuals.filter((v): v is number => v != null);
    const yMin =
      Math.min(
        ...projection,
        ...(actNums.length > 0 ? actNums : [projection[projection.length - 1]]),
      ) - 2;
    const yMax =
      Math.max(
        startW,
        ...(actNums.length > 0 ? actNums : [startW]),
      ) + 2;
    return {
      projection,
      actuals,
      yMin,
      yMax,
      yLabel: 'lbs',
      goalColor: badgeColor,
      weeks: totalWeeks,
      compareIndex: Math.min(plan.current_week, totalWeeks),
      callout: {
        col1: {
          label: 'End target',
          value: `${endP} lbs`,
          sub: `from ${startW} lbs`,
        },
        col2: {
          label: 'Rate',
          value:
            pace === 'conservative'
              ? '−0.5 lb/wk'
              : pace === 'balanced'
                ? '−0.75 lb/wk'
                : '−1.1 lb/wk',
        },
        col3: { label: 'Plan', value: `${totalWeeks} wks` },
      },
    };
  }

  if (gt === 'hypertrophy') {
    const projection = getHypertrophyProjection('intermediate', pace, totalWeeks);
    const startW =
      Number(goal.starting_weight_lbs) ||
      weightLogs[0]?.weight_lbs ||
      175;
    const weights = buildWeightActualsByWeek(
      weightLogs,
      planStart,
      totalWeeks,
    );
    const actuals = weights.map((w) =>
      w == null ? null : Math.round((w - startW) * 10) / 10,
    );
    const maxP = Math.max(...projection);
    const maxA = Math.max(
      0,
      ...actuals.filter((v): v is number => v != null),
    );
    const yMax = Math.max(maxP, maxA) * 1.15 || 1;
    return {
      projection,
      actuals,
      yMin: 0,
      yMax,
      yLabel: 'lbs Δ',
      goalColor: badgeColor,
      weeks: totalWeeks,
      compareIndex: Math.min(plan.current_week, totalWeeks),
      callout: {
        col1: {
          label: 'Projected gain',
          value: `+${projection[projection.length - 1].toFixed(1)} lbs`,
          sub: 'lean (est.)',
        },
        col2: { label: 'Pace', value: pace, sub: 'macro tier' },
        col3: { label: 'Plan', value: `${totalWeeks} wks` },
      },
    };
  }

  if (gt === 'strength') {
    const current = Number(goal.current_1rm) || 185;
    const target = Number(goal.target_1rm) || current * 1.1;
    const startingWeight = Number(
      goal.current_1rm ??
        plan.plan_json?.current1RM ??
        plan.plan_json?.week1BaselineWeight ??
        0,
    );
    const projection = getStrengthProjection(current, 'intermediate', totalWeeks);
    const exMap = buildExerciseNameMap(plan.plan_json);
    const targetLift = String(
      plan.plan_json?.targetLift ??
        plan.plan_json?.goalLift ??
        goal.target_lift ??
        '',
    );
    const actuals = buildStrengthActualsSeries(
      totalWeeks,
      workoutLogs,
      targetLift,
      exMap,
      startingWeight,
    );
    const nums = [...projection, ...actuals.filter((v): v is number => v != null)];
    const yMin = Math.min(...nums) * 0.97;
    const yMax = Math.max(target, ...nums) * 1.03;
    return {
      projection,
      actuals,
      yMin,
      yMax,
      yLabel: 'lbs',
      targetValue: target,
      goalColor: badgeColor,
      weeks: totalWeeks,
      compareIndex: Math.min(plan.current_week, totalWeeks),
      callout: {
        col1: {
          label: 'Target',
          value: `${Math.round(projection[projection.length - 1])} lbs`,
          sub: 'projected 1RM',
        },
        col2: {
          label: 'Goal',
          value: `${Math.round(target)} lbs`,
          sub: 'your target',
        },
        col3: { label: 'Plan', value: `${totalWeeks} wks` },
      },
    };
  }

  if (gt === 'recomp') {
    const bfStart = 18;
    const projection = getRecompBfProjection(totalWeeks, bfStart);
    const actuals: (number | null)[] = Array(totalWeeks + 1).fill(null);
    const endBf = projection[projection.length - 1];
    return {
      projection,
      actuals,
      yMin: Math.min(endBf, bfStart) - 0.5,
      yMax: bfStart + 1,
      yLabel: '% BF',
      goalColor: badgeColor,
      weeks: totalWeeks,
      compareIndex: Math.min(plan.current_week, totalWeeks),
      callout: {
        col1: { label: 'Focus', value: '~flat weight', sub: 'recomp' },
        col2: {
          label: 'BF trend',
          value: `−${(bfStart - endBf).toFixed(1)}%`,
          sub: 'projected',
        },
        col3: { label: 'Plan', value: `${totalWeeks} wks` },
      },
    };
  }

  // general
  const projection = Array.from({ length: totalWeeks + 1 }, (_, i) =>
    Math.round(i * 1.2 * 10) / 10,
  );
  return {
    projection,
    actuals: Array(totalWeeks + 1).fill(null),
    yMin: 0,
    yMax: Math.max(...projection) * 1.2 || 5,
    yLabel: '',
    goalColor: badgeColor,
    weeks: totalWeeks,
    compareIndex: Math.min(plan.current_week, totalWeeks),
    callout: {
      col1: { label: 'Track', value: 'Consistency', sub: 'training' },
      col2: { label: 'Phase', value: 'Build', sub: 'habit + load' },
      col3: { label: 'Plan', value: `${totalWeeks} wks` },
    },
  };
}

// ── Main Screen ──

export default function GoalTrackerScreen() {
  const navigation = useNavigation<NavProp>();
  const { width: screenWidth } = useWindowDimensions();
  const { formatBodyWeight } = useMetric();

  const [loading, setLoading] = useState(true);
  const [heroLoadFailed, setHeroLoadFailed] = useState(false);
  const [goal, setGoal] = useState<GoalRow | null>(null);
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [logs, setLogs] = useState<
    { logged_at?: string; week_number: number; day_number: number; sets_json: any[] }[]
  >([]);
  const [weightLogsTracker, setWeightLogsTracker] = useState<
    { log_date: string; weight_lbs: number }[]
  >([]);
  const [caloriePaceTracker, setCaloriePaceTracker] = useState<string | null>(
    null,
  );
  const [weeklyCoachSnippet, setWeeklyCoachSnippet] = useState<string | null>(
    null,
  );
  const [history, setHistory] = useState<GoalRow[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState('');
  const [modalInputFocused, setModalInputFocused] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const heroProgressAnim = useRef(new Animated.Value(0)).current;
  const skeletonPulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonPulse, {
          toValue: 0.85,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(skeletonPulse, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [skeletonPulse]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setHeroLoadFailed(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) { setLoading(false); return; }

      const [goalRes, planRes, historyRes] = await Promise.all([
        supabase
          .from('goals')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('plans')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('goals')
          .select('*')
          .eq('user_id', userId)
          .in('status', ['completed', 'abandoned'])
          .order('created_at', { ascending: false }),
      ]);

      const activeGoal = goalRes.data as GoalRow | null;
      const activePlan = planRes.data as PlanRow | null;

      setGoal(activeGoal);
      setPlan(activePlan);
      setHistory((historyRes.data ?? []) as GoalRow[]);

      // Session count + raw logs for trend analysis
      if (activePlan) {
        console.log('[GoalTracker] loading workout_logs for planId:', activePlan.id);
        const { data: logsData, count } = await supabase
          .from('workout_logs')
          .select('week_number, day_number, sets_json, logged_at', { count: 'exact' })
          .eq('user_id', userId)
          .eq('plan_id', activePlan.id)
          .order('logged_at', { ascending: true });
        console.log('[GoalTracker] workout_logs count:', count ?? logsData?.length ?? 0);
        setSessionCount(count ?? 0);
        setLogs(logsData ?? []);
      } else {
        setLogs([]);
      }

      if (activePlan && activeGoal) {
        const planStartDate =
          (activePlan.created_at ?? '').split('T')[0] ||
          getLocalDateString();
        const thirtyDaysAgo = getLocalDate();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const weightSince = getLocalDateString(thirtyDaysAgo);
        const summaryQuery =
          activePlan.current_week > 1
            ? supabase
                .from('weekly_summaries')
                .select('summary_json')
                .eq('plan_id', activePlan.id)
                .eq('week_number', activePlan.current_week - 1)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null });

        const [wlRes, macroRes, wsRes] = await Promise.all([
          supabase
            .from('weight_logs')
            .select('log_date, weight_lbs')
            .eq('user_id', userId)
            .gte('log_date', weightSince)
            .order('log_date', { ascending: true }),
          supabase
            .from('macro_plans')
            .select('calorie_pace')
            .eq('goal_id', activeGoal.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          summaryQuery,
        ]);

        setWeightLogsTracker((wlRes.data ?? []) as { log_date: string; weight_lbs: number }[]);
        setCaloriePaceTracker(
          (macroRes.data as { calorie_pace?: string } | null)?.calorie_pace ??
            null,
        );
        const sj = (wsRes.data as { summary_json?: { performanceSummary?: string; headline?: string } } | null)?.summary_json;
        setWeeklyCoachSnippet(sj?.performanceSummary ?? sj?.headline ?? null);
      } else {
        setWeightLogsTracker([]);
        setCaloriePaceTracker(null);
        setWeeklyCoachSnippet(null);
      }

    } catch (err) {
      if (__DEV__) console.warn('[GoalTracker] load failed:', err);
      setHeroLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const isStrengthGoalPlan = useMemo(() => {
    const g = plan?.plan_json?.goal ?? goal?.goal_type;
    return String(g ?? '').toLowerCase() === 'strength';
  }, [plan, goal]);

  const strengthGoalHero = useMemo((): GoalHeroModel | null => {
    if (!plan || heroLoadFailed || !isStrengthGoalPlan) return null;
    const pj = plan.plan_json;
    const targetLift = pj?.targetLift ?? pj?.goalLift;
    const hasTarget1RM =
      (pj?.target1RM != null && String(pj.target1RM).trim() !== '') ||
      (goal?.target_1rm != null && Number(goal.target_1rm) > 0);
    if (!targetLift || !hasTarget1RM) {
      return null;
    }
    try {
      const allLogs = logs;
      const planJson = pj;

      console.log('[1RM debug] allLogs:', allLogs?.length ?? 0);
      console.log('[1RM debug] targetLift:', targetLift);

      const firstLog = allLogs?.[0];
      const firstSets = Array.isArray(firstLog?.sets_json)
        ? firstLog.sets_json
        : [];
      console.log('[1RM debug] first log sets count:', firstSets.length);
      console.log(
        '[1RM debug] first set exerciseName:',
        firstSets[0]?.exerciseName ?? 'MISSING',
      );
      console.log(
        '[1RM debug] first set weightLbs:',
        firstSets[0]?.weightLbs ?? 'MISSING',
      );

      const matchedSets =
        allLogs?.flatMap((log) =>
          (Array.isArray(log.sets_json) ? log.sets_json : []).filter((s) =>
            matchesTargetLift(s.exerciseName ?? '', targetLift ?? ''),
          ),
        ) ?? [];
      console.log('[1RM debug] matched sets count:', matchedSets.length);
      console.log('[1RM debug] matched set names:', [
        ...new Set(matchedSets.map((s) => s.exerciseName)),
      ]);

      console.log(
        '[1RM debug] week1BaselineWeight raw:',
        planJson?.week1BaselineWeight,
      );
      console.log(
        '[1RM debug] startingWeight (Number coerced):',
        Number(planJson?.week1BaselineWeight ?? 0),
      );

      return buildGoalHeroModel({
        planJson: pj,
        planId: plan.id,
        currentWeek: plan.current_week,
        totalWeeks: plan.total_weeks,
        logs,
        sessionCount,
        weightLogs: weightLogsTracker,
        goalRow: goal,
        caloriePace: caloriePaceTracker,
        formatMass: (lbs) => formatBodyWeight(lbs),
      });
    } catch (err) {
      if (__DEV__) console.warn('[GoalTracker] strength hero build failed:', err);
      return null;
    }
  }, [
    plan,
    goal,
    logs,
    sessionCount,
    weightLogsTracker,
    caloriePaceTracker,
    heroLoadFailed,
    formatBodyWeight,
    isStrengthGoalPlan,
  ]);

  const progress =
    goal && plan && goal.goal_type !== 'strength'
      ? calculateProgress(goal, plan, sessionCount)
      : null;

  useEffect(() => {
    if (progress) {
      progressAnim.setValue(0);
      Animated.timing(progressAnim, {
        toValue: progress.progressPct,
        duration: 800,
        useNativeDriver: false,
      }).start();
    }
  }, [progress?.progressPct]);

  useEffect(() => {
    if (!strengthGoalHero) return;
    heroProgressAnim.setValue(0);
    Animated.timing(heroProgressAnim, {
      toValue: strengthGoalHero.progressPct,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [strengthGoalHero?.progressPct, strengthGoalHero?.label]);

  const milestoneProgressPct =
    goal?.goal_type === 'strength'
      ? strengthGoalHero?.progressPct
      : progress?.progressPct;
  const milestones =
    milestoneProgressPct != null
      ? buildMilestones(milestoneProgressPct)
      : [];

  const chartWidth = screenWidth - Spacing.xl * 2 - 40;

  const trackerModel = useMemo(() => {
    if (!goal || !plan) return null;
    return buildTrackerChartModel(
      goal,
      plan,
      weightLogsTracker,
      logs,
      caloriePaceTracker,
    );
  }, [goal, plan, weightLogsTracker, logs, caloriePaceTracker]);

  const isAhead = useMemo(() => {
    if (!trackerModel || !goal || !plan) return null;
    if ((plan.current_week ?? 1) < 2) return null;
    const gt = goal.goal_type;
    if (gt !== 'fat_loss' && gt !== 'hypertrophy' && gt !== 'strength') {
      return null;
    }
    const i = trackerModel.compareIndex;
    const a = trackerModel.actuals[i];
    const p = trackerModel.projection[i];
    if (a == null || p == null) return null;
    if (gt === 'fat_loss') return a < p;
    return a > p;
  }, [trackerModel, goal, plan]);

  const hasTrackerActuals = useMemo(
    () => trackerModel?.actuals.some((v) => v != null) ?? false,
    [trackerModel],
  );

  const handleSaveEdit = async () => {
    if (!goal) return;
    const updates: any = {};
    if (goal.goal_type === 'strength') updates.target_1rm = Number(editTarget) || goal.target_1rm;
    if (goal.goal_type === 'fat_loss') updates.target_weight_lbs = Number(editTarget) || goal.target_weight_lbs;

    if (Object.keys(updates).length > 0) {
      await supabase.from('goals').update(updates).eq('id', goal.id);
    }
    setShowEditModal(false);
    loadData();
  };

  // ── Render ──


  const badge = goal ? GOAL_BADGE[goal.goal_type] ?? GOAL_BADGE.general : null;
  const weeksCompleted = plan ? Math.max(0, plan.current_week - 1) : 0;
  const daysRemaining = plan ? (plan.total_weeks - plan.current_week) * 7 : 0;

  // ── Expectations vs Reality metrics ──
  const currentWeek = plan?.current_week ?? 1;
  const daysPerWeek: number = plan?.plan_json?.daysPerWeek ?? 4;

  const isBehindPace = isAhead === false;
  const showBehindPaceBadge = isBehindPace && currentWeek >= 4;

  const weeklyVolumes: Record<number, number> = {};
  const sessionsPerWeek = new Map<number, Set<number>>();
  for (const log of logs) {
    const wk: number = log.week_number;
    if (!sessionsPerWeek.has(wk)) sessionsPerWeek.set(wk, new Set());
    sessionsPerWeek.get(wk)!.add(log.day_number);
    for (const s of (log.sets_json ?? [])) {
      const w = Number(s.weightLbs ?? s.weight ?? 0);
      const r = Number(s.reps ?? s.loggedReps ?? 0);
      if (w <= 0 || r <= 0) continue;
      // Unilateral exercises: reps are per-side, multiply ×2 for bilateral-equivalent volume
      const repMultiplier = isExerciseUnilateral(String(s.exerciseName ?? '')) ? 2 : 1;
      weeklyVolumes[wk] = (weeklyVolumes[wk] ?? 0) + w * r * repMultiplier;
    }
  }

  const isWeekComplete = (weekNum: number): boolean =>
    (sessionsPerWeek.get(weekNum)?.size ?? 0) >= daysPerWeek;

  const volumeWeeks = Object.keys(weeklyVolumes).map(Number).sort((a, b) => a - b);
  const hasWorkoutVolumeLogged = volumeWeeks.some((wk) => (weeklyVolumes[wk] ?? 0) > 0);
  const hasVolumeData = volumeWeeks.length >= 1 && hasWorkoutVolumeLogged;

  let volumeChangePct: number | null = null;
  let volumeTrendLabel: string | null = null;
  let volumeTrendInProgress = false;

  if (hasVolumeData) {
    if (isWeekComplete(currentWeek)) {
      const currVol = weeklyVolumes[currentWeek] ?? 0;
      const prevVol = weeklyVolumes[currentWeek - 1] ?? 0;
      if (currentWeek > 1 && prevVol > 0 && currVol > 0) {
        volumeChangePct = ((currVol - prevVol) / prevVol) * 100;
        volumeTrendLabel = `${volumeChangePct > 0 ? '+' : ''}${Math.round(volumeChangePct)}% vs last week`;
      } else if (currentWeek === 1) {
        volumeTrendLabel = 'Baseline week — trend starts Week 2';
      }
    } else if (currentWeek > 2 && isWeekComplete(currentWeek - 1)) {
      const prevVol = weeklyVolumes[currentWeek - 1] ?? 0;
      const prev2Vol = weeklyVolumes[currentWeek - 2] ?? 0;
      if (prev2Vol > 0 && prevVol > 0) {
        volumeChangePct = ((prevVol - prev2Vol) / prev2Vol) * 100;
        volumeTrendLabel = `${volumeChangePct > 0 ? '+' : ''}${Math.round(volumeChangePct)}% vs prior week`;
      }
    } else if (currentWeek > 1) {
      volumeTrendInProgress = true;
      volumeTrendLabel = 'Week in progress — check back when complete';
    }
  }

  const weeksElapsed = currentWeek - 1;
  const weeksWithAtLeastOneSession = new Set(
    logs
      .filter((l) => l.week_number >= 1 && l.week_number <= weeksElapsed)
      .map((l) => l.week_number),
  ).size;
  const consistencyPct =
    weeksElapsed > 0
      ? Math.min(
          100,
          Math.round((weeksWithAtLeastOneSession / weeksElapsed) * 100),
        )
      : 100;

  const avgSessionsPerWeek = currentWeek > 1
    ? Math.min(logs.length / (currentWeek - 1), daysPerWeek)
    : 0;

  const trackerChartStrokeColor = goal
    ? TRACKER_CHART_STROKE[goal.goal_type] ?? '#F97316'
    : '#F97316';
  const trackerChartGoal: ProjectionChartGoal | null =
    goal &&
    (goal.goal_type === 'fat_loss' ||
      goal.goal_type === 'hypertrophy' ||
      goal.goal_type === 'strength' ||
      goal.goal_type === 'recomp' ||
      goal.goal_type === 'general')
      ? (goal.goal_type as ProjectionChartGoal)
      : null;

  const chartCurrentValue =
    goal?.goal_type === 'strength'
      ? (strengthGoalHero?.strengthEstimateLbs ??
          (Number(plan?.plan_json?.week1BaselineWeight ?? 0) || 0))
      : undefined;

  if (__DEV__ && goal && plan && trackerModel) {
    console.log(
      '[GoalTracker] goalColor:',
      trackerChartStrokeColor,
      'goal:',
      goal.goal_type,
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Goal</Text>
        </View>

        {loading && isStrengthGoalPlan && !heroLoadFailed ? (
          <GoalHeroSkeleton pulse={skeletonPulse} />
        ) : null}

        {!loading && strengthGoalHero ? (
          <GoalProgressHeroCard
            model={strengthGoalHero}
            progressAnim={heroProgressAnim}
          />
        ) : null}

        {loading && !isStrengthGoalPlan ? (
          <View style={styles.loadingBelowHero}>
            <ActivityIndicator size="large" color={Colors.accent} />
          </View>
        ) : null}

        {/* ── Active Goal Card ── */}
        {!loading && !goal ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Active Goal</Text>
            <Text style={styles.emptySubtitle}>
              Start a new plan to set your next goal.
            </Text>
            <TouchableOpacity
              style={styles.emptyCTA}
              onPress={() =>
                navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] })
              }
            >
              <Text style={styles.emptyCTAText}>Start New Plan →</Text>
            </TouchableOpacity>
          </View>
        ) : !loading && goal ? (
          <>
          {plan && trackerModel ? (
            <View style={styles.trackerProjectionBlock}>
              <Text style={styles.projectionSectionLabel}>YOUR PROJECTION</Text>
              {isAhead === true ? (
                <View style={[styles.paceBadge, styles.paceBadgeSuccess]}>
                  <Text style={styles.paceBadgeTextSuccess}>Ahead of pace</Text>
                </View>
              ) : isAhead === false && showBehindPaceBadge ? (
                <View style={[styles.paceBadge, styles.paceBadgeWarning]}>
                  <Text style={styles.paceBadgeTextWarning}>Behind pace</Text>
                </View>
              ) : null}
              <ProjectionChart
                width={chartWidth}
                height={200}
                weeks={trackerModel.weeks}
                data={trackerModel.projection}
                yMin={trackerModel.yMin}
                yMax={trackerModel.yMax}
                yLabel={trackerModel.yLabel}
                color={trackerChartStrokeColor}
                projectionColor={trackerChartStrokeColor}
                chartGoal={trackerChartGoal}
                recompBfStart={goal.goal_type === 'recomp' ? 18 : 22}
                trackerWeekMarkerStyle
                actualsData={trackerModel.actuals}
                currentWeek={Math.min(plan.current_week, trackerModel.weeks)}
                currentValue={chartCurrentValue}
                targetValue={trackerModel.targetValue}
                animateEntry={false}
              />
              {showBehindPaceBadge && weeklyCoachSnippet ? (
                <Text style={styles.coachBehindNote}>{stripEmDash(weeklyCoachSnippet ?? '')}</Text>
              ) : null}
              {(plan.current_week ?? 1) < 2 ? (
                <Text style={styles.trackerPreDataNote}>
                  Complete Week 1 to see your pace
                </Text>
              ) : null}
              <View style={styles.trackerCalloutStrip}>
                {(
                  [
                    trackerModel.callout.col1,
                    trackerModel.callout.col2,
                    trackerModel.callout.col3,
                  ] as const
                ).map((col, idx) => (
                  <View key={idx} style={styles.trackerCalloutCol}>
                    <Text style={styles.trackerCalloutColLabel}>{col.label}</Text>
                    <Text style={styles.trackerCalloutColValue}>{col.value}</Text>
                    {col.sub ? (
                      <Text style={styles.trackerCalloutColSub}>{col.sub}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
              {!hasTrackerActuals ? (
                <Text style={styles.trackerPreDataNote}>
                  Complete Week 1 to track your actual results here.
                </Text>
              ) : null}
            </View>
          ) : null}

          <View
            style={[
              styles.goalCard,
              goal && plan && trackerModel ? styles.goalCardAfterChart : null,
            ]}
          >
            <View style={styles.goalTopRow}>
              {badge ? (
                <View style={styles.goalBadge}>
                  <Text style={styles.goalBadgeText}>{badge.label}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.editBtnTouch}
                onPress={() => {
                  if (goal.goal_type === 'strength') setEditTarget(String(goal.target_1rm ?? ''));
                  else if (goal.goal_type === 'fat_loss') setEditTarget(String(goal.target_weight_lbs ?? ''));
                  setShowEditModal(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.editBtn}>Edit →</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.goalTitle}>{stripEmDash(getGoalTitle(goal))}</Text>

            {progress && (
              <View style={styles.progressSection}>
                <Text style={styles.progressLabel}>{progress.progressLabel}</Text>
                <Text style={styles.progressPct}>{progress.progressPct}%</Text>
                <Text style={styles.progressDetails}>{progress.details}</Text>

                {goal.goal_type === 'fat_loss' && progress.progressPct === 0 && (
                  <Text style={styles.progressHint}>Log your weight to track fat loss progress</Text>
                )}

                <View style={styles.progressTrack}>
                  <Animated.View
                    style={[
                      styles.progressFill,
                      {
                        width: progressAnim.interpolate({
                          inputRange: [0, 100],
                          outputRange: ['0%', '100%'],
                        }),
                      },
                    ]}
                  />
                </View>
              </View>
            )}

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{weeksCompleted}</Text>
                <Text style={styles.statLabel}>Weeks done</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{sessionCount}</Text>
                <Text style={styles.statLabel}>Sessions</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, daysRemaining > 0 && styles.statValueAccent]}>{daysRemaining}</Text>
                <Text style={styles.statLabel}>Days left</Text>
              </View>
            </View>
          </View>

        {/* ── Expectations vs Reality ── */}
            <View style={styles.evrHeadingRow}>
              <Text style={styles.evrHeadingLabel}>EXPECTATIONS VS REALITY</Text>
              <TouchableOpacity
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => setShowTooltip(true)}
              >
                <Text style={styles.evrInfoIcon}>ⓘ</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.evrCard}>
              <Text style={styles.evrSubLabelProjected}>YOUR PLAN PROJECTED</Text>
              {goal.projection_text ? (
                <View style={styles.evrQuote}>
                  <Text style={styles.evrQuoteText}>
                    {formatProjectionText(goal.projection_text)}
                  </Text>
                </View>
              ) : (
                <Text style={styles.evrNoData}>
                  Projection data not available for this goal.
                </Text>
              )}

              <Text style={styles.evrSubLabelReality}>WHAT&apos;S ACTUALLY HAPPENING</Text>

              <View style={styles.evrMetricRow}>
                <View style={styles.evrMetricLabelGroup}>
                  {!hasVolumeData || volumeTrendInProgress || volumeTrendLabel == null
                    ? <Ionicons name="arrow-forward" size={20} color={Colors.textSecondary} />
                    : volumeChangePct != null && volumeChangePct > 0
                      ? <Ionicons name="trending-up-outline" size={20} color={Colors.success} />
                      : volumeChangePct != null && volumeChangePct < 0
                        ? <Ionicons name="trending-down-outline" size={20} color={Colors.danger} />
                        : <Ionicons name="arrow-forward" size={20} color={Colors.textSecondary} />}
                  <Text style={styles.evrMetricLabel} numberOfLines={1}>
                    Weekly Volume Trend
                  </Text>
                </View>
                {!hasVolumeData ? (
                  <Text style={styles.evrMetricValue}>
                    {logs.length === 0 ? 'Not enough data yet' : '—'}
                  </Text>
                ) : volumeTrendLabel != null ? (
                  <Text style={styles.evrMetricValue}>{volumeTrendLabel}</Text>
                ) : (
                  <Text style={styles.evrMetricValue}>—</Text>
                )}
              </View>

              <View style={styles.evrMetricRow}>
                <View style={styles.evrMetricLabelGroup}>
                  <Ionicons name="radio-button-on-outline" size={20} color={Colors.textSecondary} />
                  <Text style={styles.evrMetricLabel} numberOfLines={1}>
                    Training Consistency
                  </Text>
                </View>
                {currentWeek <= 1 ? (
                  <Text style={styles.evrMetricValue}>Just getting started</Text>
                ) : (
                  <Text style={styles.evrMetricValue}>
                    {consistencyPct}% of weeks trained
                  </Text>
                )}
              </View>

              <View style={[styles.evrMetricRow, styles.evrMetricRowLast]}>
                <View style={styles.evrMetricLabelGroup}>
                  <Ionicons name="flash-outline" size={20} color={Colors.textSecondary} />
                  <Text style={styles.evrMetricLabel} numberOfLines={1}>
                    Sessions per Week
                  </Text>
                </View>
                <View style={styles.evrPaceValue}>
                  <Text
                    style={[
                      styles.evrMetricValue,
                      currentWeek <= 1 && styles.evrMetricValueWarning,
                    ]}
                  >
                    {currentWeek <= 1 ? '—' : `${avgSessionsPerWeek.toFixed(1)} avg`}
                  </Text>
                  <Text style={styles.evrPaceTarget}> (target: {daysPerWeek})</Text>
                </View>
              </View>

              {volumeWeeks.length >= 2 && currentWeek <= 2 && (
                <Text style={styles.evrBottomNote}>
                  Check back after a few more weeks for meaningful trends.
                </Text>
              )}
            </View>

        {/* ── Milestones ── */}
        {milestoneProgressPct != null && (
          <>
            <Text style={styles.milestonesSectionLabel}>MILESTONES</Text>
            <View style={styles.milestonesCard}>
              {milestones.map((m, i) => {
                const isLast = i === milestones.length - 1;
                return (
                  <View
                    key={m.pct}
                    style={[styles.milestoneRow, isLast && styles.milestoneRowLast]}
                  >
                    <View style={styles.milestonePctPill}>
                      <Text
                        style={[
                          styles.milestonePctText,
                          m.reached ? styles.milestonePctTextReached : styles.milestonePctTextLocked,
                        ]}
                      >
                        {m.pct}%
                      </Text>
                    </View>
                    <Text style={styles.milestoneName}>
                      <Ionicons name={m.icon as React.ComponentProps<typeof Ionicons>['name']} size={16} color={Colors.textSecondary} />{' '}{m.label}
                    </Text>
                    {m.reached
                      ? (m.pct >= 100
                        ? <Ionicons name="trophy-outline" size={20} color={Colors.accent} />
                        : <Ionicons name="checkmark-circle-outline" size={20} color={Colors.success} />)
                      : <Ionicons name="lock-closed-outline" size={20} color={Colors.textTertiary} />}
                  </View>
                );
              })}
            </View>
          </>
        )}
          </>
        ) : null}

        {/* ── Goal History ── */}
        <Text style={styles.pastGoalsSectionLabel}>PAST GOALS</Text>

        {history.length === 0 ? (
          <View style={styles.historyEmpty}>
            <Text style={styles.historyEmptyText}>
              Your completed goals will appear here.
            </Text>
          </View>
        ) : (
          history.map((h) => {
            const hBadge = GOAL_BADGE[h.goal_type] ?? GOAL_BADGE.general;
            const isCompleted = h.status === 'completed';
            return (
              <View key={h.id} style={styles.historyCard}>
                <View style={styles.historyTopRow}>
                  <View style={[styles.historyBadge, historyBadgeStyle(h.goal_type)]}>
                    <Text style={styles.historyBadgeText}>{hBadge.label}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      isCompleted ? styles.statusBadgeCompleted : styles.statusBadgeAbandoned,
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>
                      {isCompleted ? 'Completed ✓' : 'Abandoned'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.historyDesc}>{stripEmDash(getGoalTitle(h))}</Text>
                <Text style={styles.historyDate}>{formatMonth(h.created_at)}</Text>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── Edit Goal Modal ── */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onShow={() => setModalInputFocused(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Goal Target</Text>
            <Text style={styles.modalSubtitle}>
              Update your target — your plan will adapt accordingly
            </Text>

            {goal?.goal_type === 'strength' && (
              <View style={styles.modalField}>
                <Text style={styles.modalFieldLabel}>TARGET 1RM (LBS)</Text>
                <TextInput
                  style={[styles.modalInput, modalInputFocused && styles.modalInputFocused]}
                  value={editTarget}
                  onChangeText={setEditTarget}
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textTertiary}
                  onFocus={() => setModalInputFocused(true)}
                  onBlur={() => setModalInputFocused(false)}
                />
                <Text style={styles.modalFieldHint}>
                  Target lift: {goal.target_lift ? formatLiftName(goal.target_lift) : '—'}
                </Text>
              </View>
            )}

            {goal?.goal_type === 'fat_loss' && (
              <View style={styles.modalField}>
                <Text style={styles.modalFieldLabel}>TARGET WEIGHT (LBS)</Text>
                <TextInput
                  style={[styles.modalInput, modalInputFocused && styles.modalInputFocused]}
                  value={editTarget}
                  onChangeText={setEditTarget}
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textTertiary}
                  onFocus={() => setModalInputFocused(true)}
                  onBlur={() => setModalInputFocused(false)}
                />
              </View>
            )}

            {goal && !['strength', 'fat_loss'].includes(goal.goal_type) && (
              <Text style={styles.modalAutoText}>
                Your plan adapts automatically each week based on your performance.
                No manual target needed.
              </Text>
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setModalInputFocused(false);
                  setShowEditModal(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSave}
                onPress={handleSaveEdit}
                activeOpacity={0.8}
              >
                <Text style={styles.modalSaveText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showTooltip} transparent animationType="fade">
        <View style={styles.tooltipBackdrop}>
          <View style={styles.tooltipCard}>
            <Text style={styles.tooltipTitle}>How this works</Text>
            <Text style={styles.tooltipBody}>
              Your Plan Projected is Jordan&apos;s estimate based on your goal and program at the start.
              What&apos;s Actually Happening is calculated from your real workout logs and updates each week as
              you train.
            </Text>
            <TouchableOpacity
              style={styles.tooltipButton}
              onPress={() => setShowTooltip(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.tooltipButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 56,
    paddingBottom: 40,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  backChevron: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    paddingRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },

  loadingBelowHero: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  heroCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    padding: 16,
    marginTop: Spacing.lg,
    marginBottom: 16,
  },
  heroGoalTypeLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  heroPrimaryTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  heroPrimaryValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.display,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  heroPrimarySub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  heroBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  heroBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgCard,
    overflow: 'hidden',
  },
  heroBarFill: {
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
  },
  heroBarPct: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    minWidth: 36,
    textAlign: 'right',
  },
  heroGoalReachedLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.success,
    minWidth: 88,
    textAlign: 'right',
  },
  heroBoundsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  heroBoundsText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
  },
  heroJordanNote: {
    marginTop: Spacing.md,
    paddingLeft: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accentBorder,
  },
  heroJordanNoteText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: LineHeights.body,
  },
  heroSkeletonLine: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.sm,
  },
  heroSkeletonLabel: {
    width: '40%',
    height: 12,
    marginBottom: Spacing.md,
  },
  heroSkeletonTitle: {
    width: '70%',
    height: 20,
    marginBottom: Spacing.sm,
  },
  heroSkeletonMetric: {
    width: '50%',
    height: 32,
    marginBottom: Spacing.md,
  },
  heroSkeletonBar: {
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgCard,
    marginBottom: Spacing.md,
  },
  heroSkeletonSmall: {
    width: '38%',
    height: 10,
  },
  heroSkeletonNote: {
    width: '95%',
    height: 40,
    marginTop: Spacing.md,
  },

  trackerProjectionBlock: {
    marginTop: Spacing.xl,
    marginBottom: 0,
  },
  projectionSectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  paceBadge: {
    alignSelf: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    marginBottom: Spacing.sm,
  },
  paceBadgeSuccess: {
    backgroundColor: Colors.successMuted,
  },
  paceBadgeWarning: {
    backgroundColor: Colors.warningMuted,
  },
  paceBadgeTextSuccess: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.success,
  },
  paceBadgeTextWarning: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.warning,
  },
  coachBehindNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: LineHeights.caption,
  },
  trackerCalloutStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  trackerCalloutCol: {
    flex: 1,
    alignItems: 'center',
  },
  trackerCalloutColLabel: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 4,
  },
  trackerCalloutColValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  trackerCalloutColSub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 14,
  },
  trackerPreDataNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  emptyCTA: {
    backgroundColor: Colors.accent,
    height: 56,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCTAText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },

  goalCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 20,
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  goalCardAfterChart: {
    marginTop: Spacing.lg,
  },
  goalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalBadge: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  goalBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.textPrimary,
  },
  editBtnTouch: { marginLeft: 'auto' },
  editBtn: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  goalTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
    marginTop: 12,
  },

  progressSection: { marginTop: 0 },
  progressLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 4,
  },
  progressPct: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.display,
    color: Colors.textPrimary,
  },
  progressDetails: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  progressHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 6,
  },
  progressTrack: {
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.divider,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
  },

  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 20,
  },
  statItem: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },
  statValueAccent: { color: Colors.accent },
  statLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  evrHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 12,
  },
  evrHeadingLabel: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  evrInfoIcon: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textTertiary,
  },
  evrCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 20,
    marginBottom: Spacing.lg,
  },
  evrSubLabelProjected: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  evrQuote: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    paddingLeft: 12,
    marginBottom: 20,
  },
  evrQuoteText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  evrNoData: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  evrSubLabelReality: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  evrMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  evrMetricRowLast: { borderBottomWidth: 0 },
  evrMetricLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    minWidth: 140,
    gap: 10,
    marginRight: Spacing.sm,
  },
  evrMetricIcon: {
    fontFamily: Fonts.regular,
    fontSize: 18,
    marginRight: 10,
  },
  evrMetricLabel: {
    flexShrink: 0,
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  evrMetricValue: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  evrMetricValueWarning: { color: Colors.warning },
  evrPaceValue: { flexDirection: 'row', alignItems: 'baseline', flexShrink: 0 },
  evrPaceTarget: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  evrBottomNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 16,
  },

  milestonesSectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 32,
    marginBottom: 12,
  },
  milestonesCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 20,
    marginBottom: Spacing.lg,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  milestoneRowLast: { borderBottomWidth: 0 },
  milestonePctPill: {
    width: 44,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestonePctText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    textAlign: 'center',
  },
  milestonePctTextReached: { color: Colors.accent },
  milestonePctTextLocked: { color: Colors.textTertiary },
  milestoneName: {
    flex: 1,
    marginLeft: 12,
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  milestoneStatusIcon: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
  },
  milestoneStatusReached: { color: Colors.accent },
  milestoneStatusLocked: { color: Colors.textTertiary },

  pastGoalsSectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 32,
    marginBottom: 12,
  },
  historyEmpty: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 24,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  historyEmptyText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  historyCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 14,
    marginBottom: Spacing.sm,
  },
  historyTopRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  historyBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  historyBadgeStrength: { backgroundColor: Colors.warning },
  historyBadgeHypertrophy: { backgroundColor: '#8B5CF6' },
  historyBadgeRecomp: { backgroundColor: '#06B6D4' },
  historyBadgeFatLoss: { backgroundColor: Colors.success },
  historyBadgeGeneral: { backgroundColor: Colors.accent },
  historyBadgeText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.micro,
    fontFamily: Fonts.semiBold,
  },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadgeCompleted: { backgroundColor: Colors.success },
  statusBadgeAbandoned: { backgroundColor: Colors.divider },
  statusBadgeText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.micro,
    fontFamily: Fonts.semiBold,
  },
  historyDesc: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.caption,
    marginTop: 6,
  },
  historyDate: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.label,
    marginTop: 4,
    opacity: 0.7,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.xl,
    padding: 24,
    marginHorizontal: 32,
    alignSelf: 'stretch',
  },
  modalTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 4,
    marginBottom: 20,
  },
  modalField: { marginBottom: 16 },
  modalFieldLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  modalInput: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.bgPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 14,
  },
  modalInputFocused: { borderColor: Colors.accent },
  modalFieldHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  modalAutoText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  modalCancel: {
    flex: 1,
    height: 48,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  modalSave: {
    flex: 1,
    height: 48,
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },

  tooltipBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    padding: 32,
  },
  tooltipCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.xl,
    padding: 24,
  },
  tooltipTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  tooltipBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  tooltipButton: {
    marginTop: 20,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltipButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    textAlign: 'center',
  },

});

function historyBadgeStyle(goalType: string) {
  switch (goalType) {
    case 'strength':
      return styles.historyBadgeStrength;
    case 'hypertrophy':
      return styles.historyBadgeHypertrophy;
    case 'recomp':
      return styles.historyBadgeRecomp;
    case 'fat_loss':
      return styles.historyBadgeFatLoss;
    default:
      return styles.historyBadgeGeneral;
  }
}

import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  type DimensionValue,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import {
  Colors,
  Fonts,
  FontSizes,
  Spacing,
  Radius,
  CommonStyles,
} from '../constants/design';
import { getSessionIntent } from '../utils/getSessionIntent';
import { isExerciseUnilateral } from '../constants/exerciseLibrary';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getNextTrainingDay,
  getTodayDayLabel,
  isLastScheduledTrainingDayToday,
  isTodayTrainingDay,
} from '../utils/dateUtils';
import {
  type SessionSignal,
  PRE_SESSION_COPY,
} from '../utils/sessionSignal';

/** Mirrors `getSessionSignal` in utils/sessionSignal — uses already-loaded week logs. */
function sessionSignalFromLastLog(
  lastSession: {
    sets_json?: unknown;
    session_fatigue_rating?: number;
  } | null | undefined,
): SessionSignal {
  if (!lastSession) return null;
  const raw = lastSession.sets_json;
  const sets: { rpe?: number }[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw) as { rpe?: number }[];
          } catch {
            return [];
          }
        })()
      : [];
  const loggedRpes = sets.map((s) => Number(s.rpe ?? 0)).filter((r) => r > 0);
  if (loggedRpes.length === 0) return null;
  const avgRpe = loggedRpes.reduce((a, b) => a + b, 0) / loggedRpes.length;
  const fatigueRating = lastSession.session_fatigue_rating ?? 3;
  let signal: SessionSignal = null;
  if (avgRpe > 8.5 && fatigueRating <= 2) signal = 'high_fatigue';
  else if (avgRpe < 6.0 && fatigueRating >= 4) signal = 'low_fatigue';
  else if (avgRpe >= 7.0 && avgRpe <= 8.5) signal = 'on_target';
  return signal;
}

type NavProp = NativeStackNavigationProp<RootStackParamList>;

type JordanCardState = 'day1' | 'in_week' | 'summary_available';

type Exercise = {
  id: string;
  name: string;
  muscleGroup: string;
  sets: number;
  reps: string;
  targetWeight: number;
  restSeconds: number;
  targetRpe: number;
};

type WorkoutDay = {
  dayNumber: number;
  type: 'workout' | 'rest';
  title: string;
  muscleGroups: string[];
  exercises: Exercise[];
  isNextWeek?: boolean;
  sessionFocus?: string;
  /** When present, matches onboarding day chips (Mon–Sun) */
  dayLabel?: string;
};

type PlanData = {
  planId: string;
  planTitle: string;
  currentWeek: number;
  totalWeeks: number;
  daysPerWeek: number;
  todayWorkout: WorkoutDay | null;
  weekDays: WorkoutDay[];
  completedSessions: number;
  nextWeekReady: boolean;
  nextWeekFirstWorkout: WorkoutDay | null;
  showGenerateNextWeekCTA: boolean;
  /** BUG-8: DEV / no-label fallback / last scheduled day — gates week-complete UI vs calendar rest */
  postWeekHeroAllowed: boolean;
  planSplit?: string;
  nextWeekPhase?: string;
};

type SetItem = {
  setNumber: number;
  weightLbs: number;
  reps: number;
  rpe: number | null;
  swapped: boolean;
};

/** `plan_json.weeks` entries may use weekNumber, week_number, or number */
function getPlanWeekNumber(w: unknown): number | undefined {
  if (!w || typeof w !== 'object') return undefined;
  const o = w as { weekNumber?: unknown; week_number?: unknown; number?: unknown };
  const n = o.weekNumber ?? o.week_number ?? o.number;
  return typeof n === 'number' && !Number.isNaN(n) ? n : undefined;
}

function getPhaseDisplay(
  phase: string | undefined,
  weekNumber: number,
  totalWeeks: number,
): { label: string; color: string; bg: string; borderColor?: string } {
  const effectivePhase =
    weekNumber === 1 && (!phase || phase === 'accumulation')
      ? 'baseline'
      : phase;

  if (effectivePhase === 'baseline') {
    return {
      label: 'BASELINE',
      color: Colors.accent,
      bg: Colors.accentMuted,
      borderColor: Colors.accentBorder,
    };
  }

  if (weekNumber % 4 === 0) {
    return {
      label: 'DELOAD',
      color: Colors.success,
      bg: Colors.successMuted,
    };
  }
  if (effectivePhase === 'intensification') {
    return {
      label: 'INTENSIFICATION',
      color: Colors.warning,
      bg: Colors.warningMuted,
    };
  }
  if (effectivePhase === 'deload') {
    return {
      label: 'DELOAD',
      color: Colors.success,
      bg: Colors.successMuted,
    };
  }
  if (weekNumber > totalWeeks / 2) {
    return {
      label: 'INTENSIFICATION',
      color: Colors.warning,
      bg: Colors.warningMuted,
    };
  }
  return {
    label: 'ACCUMULATION',
    color: Colors.accent,
    bg: Colors.accentMuted,
  };
}

/** BUG-8: Primary = plan_json.scheduledDays; then week dayLabels; then profile.training_days */
function resolveScheduledDaysInfo(
  planJson: Record<string, unknown>,
  profileTrainingDays: string[],
): { scheduledDays: string[]; hasDayLabels: boolean } {
  const pj = planJson as {
    scheduledDays?: unknown;
    weeks?: Array<{ days?: Array<{ type?: string; dayLabel?: string }> }>;
  };

  let scheduledDays: string[] = [];
  let hasDayLabels = false;

  if (Array.isArray(pj.scheduledDays) && pj.scheduledDays.length > 0) {
    scheduledDays = pj.scheduledDays.filter(
      (d): d is string => typeof d === 'string' && d.length > 0,
    );
    hasDayLabels = scheduledDays.length > 0;
  }

  if (!hasDayLabels) {
    const rawDays = pj.weeks?.[0]?.days;
    const derived = Array.isArray(rawDays)
      ? rawDays
          .filter((d) => d?.type === 'workout')
          .map((d) => d.dayLabel)
          .filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [];
    if (derived.length > 0) {
      scheduledDays = derived;
      hasDayLabels = true;
    }
  }

  if (!hasDayLabels && profileTrainingDays.length > 0) {
    scheduledDays = [...profileTrainingDays];
    hasDayLabels = true;
  }

  if (!hasDayLabels) {
    scheduledDays = [];
  }

  return { scheduledDays, hasDayLabels };
}

/**
 * Hero session: today's calendar slot only — not the next unlogged session in plan order.
 */
function resolveTodayWorkout(args: {
  weekDays: WorkoutDay[];
  completedDayNumbers: Set<number>;
  devBypassDayGate: boolean;
  hasDayLabels: boolean;
  scheduledDays: string[];
  todayLabel: string;
  isTrainingToday: boolean;
  nextWeekReady: boolean;
  nextWeekFirstWorkout: WorkoutDay | null;
}): WorkoutDay | null {
  const {
    weekDays,
    completedDayNumbers,
    devBypassDayGate,
    hasDayLabels,
    scheduledDays,
    todayLabel,
    isTrainingToday,
    nextWeekReady,
    nextWeekFirstWorkout,
  } = args;

  const workoutDaysOrdered = weekDays.filter((d) => d.type === 'workout');

  const allWorkoutsInWeekLogged =
    workoutDaysOrdered.length > 0 &&
    workoutDaysOrdered.every((d) => completedDayNumbers.has(d.dayNumber));

  const firstUnloggedInSequence = (): WorkoutDay | null =>
    workoutDaysOrdered.find((d) => !completedDayNumbers.has(d.dayNumber)) ?? null;

  if (devBypassDayGate) {
    let w = firstUnloggedInSequence();
    if (!w && nextWeekReady && nextWeekFirstWorkout) {
      w = { ...nextWeekFirstWorkout, isNextWeek: true };
    }
    return w;
  }

  if (!hasDayLabels || scheduledDays.length === 0) {
    let w = firstUnloggedInSequence();
    if (
      !w &&
      nextWeekReady &&
      nextWeekFirstWorkout &&
      isTrainingToday &&
      allWorkoutsInWeekLogged
    ) {
      w = { ...nextWeekFirstWorkout, isNextWeek: true };
    }
    return w;
  }

  if (!isTrainingToday) {
    return null;
  }

  const byScheduleIndex = scheduledDays.indexOf(todayLabel);
  if (byScheduleIndex >= 0 && byScheduleIndex < workoutDaysOrdered.length) {
    const d = workoutDaysOrdered[byScheduleIndex];
    if (!completedDayNumbers.has(d.dayNumber)) {
      return d;
    }
    return null;
  }

  const byDayLabel = workoutDaysOrdered.find(
    (d) =>
      d.dayLabel === todayLabel && !completedDayNumbers.has(d.dayNumber),
  );
  if (byDayLabel) {
    return byDayLabel;
  }

  if (nextWeekReady && nextWeekFirstWorkout && allWorkoutsInWeekLogged) {
    return { ...nextWeekFirstWorkout, isNextWeek: true };
  }

  return null;
}

function getRestDayMessage(
  nextTraining: { displayName: string; daysAway: number } | null,
): string {
  if (!nextTraining) {
    return "Today's a rest day — use it well. A walk, some mobility work, or just good sleep goes a long way.";
  }
  if (nextTraining.daysAway === 1) {
    return "Rest up today — you're back at it tomorrow. A 20-minute walk or some mobility work will help you recover faster.";
  }
  return `Rest day today. Your next session is ${nextTraining.displayName} — a walk or some mobility work now will have you ready to go.`;
}

function RestDayCard({
  nextTraining,
}: {
  nextTraining: {
    dayLabel: string;
    daysAway: number;
    displayName: string;
  } | null;
}) {
  return (
    <View style={styles.restDayCard}>
      <View style={styles.restDayHeader}>
        <Text style={styles.restDayLabel}>REST DAY</Text>
        {nextTraining ? (
          <Text style={styles.restDayNextUp}>
            Next up: {nextTraining.displayName}
          </Text>
        ) : null}
      </View>

      <View style={styles.restDayJordan}>
        <View style={styles.jordanAvatar}>
          <Text style={styles.jordanAvatarText}>J</Text>
        </View>
        <Text style={styles.restDayMessage}>
          {getRestDayMessage(nextTraining)}
        </Text>
      </View>
    </View>
  );
}

function calculateSessionDuration(exercises: Exercise[]): number {
  const SET_DURATION_SECONDS = 45;
  let totalSeconds = 0;
  for (const exercise of exercises) {
    const restSeconds = exercise.restSeconds ?? 90;
    totalSeconds += exercise.sets * SET_DURATION_SECONDS;
    totalSeconds += (exercise.sets - 1) * restSeconds;
    totalSeconds += 60; // transition between exercises
  }
  if (exercises.length > 0) totalSeconds -= 60; // remove last transition
  return Math.round(totalSeconds / 60);
}

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();

  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [totalSessions, setTotalSessions] = useState<number>(0);
  const [weeklyVolume, setWeeklyVolume] = useState<number>(0);
  const [currentStreak, setCurrentStreak] = useState<number>(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [coachSummary, setCoachSummary] = useState<{
    headline: string;
    week_number: number;
  } | null>(null);
  const [jordanWelcome, setJordanWelcome] = useState<string | null>(null);
  /** Prior week (currentWeek - 1) has a DB summary but user has not opened WeeklyCoachSummary for that week. */
  const [unviewedSummaryWeekNumber, setUnviewedSummaryWeekNumber] = useState<
    number | null
  >(null);
  const [workoutLogs, setWorkoutLogs] = useState<
    Array<{
      id?: string;
      plan_id?: string;
      week_number?: number;
      day_number?: number;
      sets_json?: unknown;
      logged_at?: string;
      session_fatigue_rating?: number;
    }>
  >([]);

  const [todayWeight, setTodayWeight] = useState<number | null>(null);
  const [weightLoggedToday, setWeightLoggedToday] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [weightSaving, setWeightSaving] = useState(false);
  const uidRef = useRef<string | null>(null);

  /** BUG-8: false only when we have real scheduled day labels and today is off-cycle */
  const [isTrainingDay, setIsTrainingDay] = useState(true);
  const [nextTrainingDay, setNextTrainingDay] = useState<{
    dayLabel: string;
    daysAway: number;
    displayName: string;
  } | null>(null);
  /** BUG-8: DEV — persisted; skip day-of-week gating and use next-unlogged session */
  const [devBypassDayGate, setDevBypassDayGate] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, []),
  );

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        setUnviewedSummaryWeekNumber(null);
        setStatsLoading(false);
        setDevBypassDayGate(false);
        return;
      }
      uidRef.current = userId;
      setUserEmail(session.user.email ?? '');

      // Load today's weight log
      const todayDate = new Date().toISOString().split('T')[0];
      const { data: todayLog } = await supabase
        .from('weight_logs')
        .select('weight_lbs')
        .eq('user_id', userId)
        .eq('log_date', todayDate)
        .maybeSingle();

      if (todayLog) {
        setTodayWeight(todayLog.weight_lbs as number);
        setWeightLoggedToday(true);
      } else {
        setWeightLoggedToday(false);
      }

      const { data: activePlan, error: planError } = await supabase
        .from('plans')
        .select('id, plan_json, current_week, total_weeks, status, title')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (planError || !activePlan) {
        setUnviewedSummaryWeekNumber(null);
        setStatsLoading(false);
        setIsTrainingDay(true);
        setNextTrainingDay(null);
        setDevBypassDayGate(false);
        return;
      }

      const plan = activePlan;
      const planJson = plan.plan_json;
      const jordanWelcome: string | null =
        (planJson as { jordanWelcome?: string }).jordanWelcome ?? null;

      const currentWeekData =
        planJson.weeks?.find(
          (w) => getPlanWeekNumber(w) === plan.current_week,
        ) ?? planJson.weeks?.[0];

      const currentWeekPhase: string | undefined = currentWeekData?.phase;

      if (!currentWeekData) {
        setUnviewedSummaryWeekNumber(null);
        setStatsLoading(false);
        setIsTrainingDay(true);
        setNextTrainingDay(null);
        setDevBypassDayGate(false);
        return;
      }

      const devBypassRead =
        __DEV__ &&
        (await AsyncStorage.getItem('dev_bypass_day_gate')) === 'true';
      setDevBypassDayGate(devBypassRead);

      const { data: profileForDays } = await supabase
        .from('user_profiles')
        .select('training_days')
        .eq('user_id', userId)
        .maybeSingle();

      const profileTrainingDays = Array.isArray(profileForDays?.training_days)
        ? (profileForDays.training_days as string[])
        : [];

      const todayLabel = getTodayDayLabel();
      const { scheduledDays, hasDayLabels } = resolveScheduledDaysInfo(
        planJson as Record<string, unknown>,
        profileTrainingDays,
      );
      const isTrainingToday =
        devBypassRead ||
        !hasDayLabels ||
        isTodayTrainingDay(scheduledDays, todayLabel);
      const nextTraining =
        hasDayLabels && !isTrainingToday
          ? getNextTrainingDay(scheduledDays, todayLabel)
          : null;

      const postWeekHeroAllowed =
        devBypassRead ||
        !hasDayLabels ||
        isLastScheduledTrainingDayToday(scheduledDays, todayLabel);

      console.log(
        '[BUG-8] scheduledDays:',
        scheduledDays,
        'hasDayLabels:',
        hasDayLabels,
        'todayLabel:',
        todayLabel,
        'isTrainingDay:',
        isTrainingToday,
      );

      setIsTrainingDay(isTrainingToday);
      setNextTrainingDay(nextTraining);

      const weekDays: WorkoutDay[] = currentWeekData.days ?? [];

      const { data: logs } = await supabase
        .from('workout_logs')
        .select('day_number')
        .eq('plan_id', plan.id)
        .eq('week_number', plan.current_week);

      const completedDayNumbers = new Set(
        logs?.map((l: { day_number: number }) => l.day_number) ?? [],
      );
      const completedSessions = completedDayNumbers.size;

      const nextWeekData =
        planJson.weeks?.find(
          (w) => getPlanWeekNumber(w) === plan.current_week + 1,
        ) ?? null;

      const nextWeekWorkoutDays: WorkoutDay[] =
        nextWeekData?.days?.filter((d: WorkoutDay) => d.type === 'workout') ?? [];

      const nextWeekFirstWorkout: WorkoutDay | null = nextWeekWorkoutDays[0] ?? null;
      const nextWeekReady = !!nextWeekFirstWorkout;

      const todayWorkout = resolveTodayWorkout({
        weekDays,
        completedDayNumbers: completedDayNumbers,
        devBypassDayGate: devBypassRead,
        hasDayLabels,
        scheduledDays,
        todayLabel,
        isTrainingToday,
        nextWeekReady,
        nextWeekFirstWorkout,
      });

      const currentWeek = plan.current_week ?? 1;
      const daysPerWeek = plan.plan_json.daysPerWeek ?? 4;
      const distinctDays = completedSessions;
      const isWeekComplete = distinctDays >= daysPerWeek && daysPerWeek > 0;

      const pj = planJson as {
        totalWeeks?: number;
        weeks?: unknown[];
      };
      const dbCurrentWeek = plan.current_week ?? 1;
      const totalWeeks = pj.totalWeeks ?? plan.total_weeks ?? 12;
      const weeks = pj.weeks ?? [];
      const uniqueWeeks = weeks.filter((w: any, index: number, self: any[]) =>
        index === self.findIndex((t: any) => t.weekNumber === w.weekNumber),
      );
      const nextWeekNumber = dbCurrentWeek + 1;
      const nextWeekExists = uniqueWeeks.some(
        (w: any) => w.weekNumber === nextWeekNumber,
      );
      const showGenerateNextWeekCTA =
        isWeekComplete &&
        !nextWeekExists &&
        dbCurrentWeek < totalWeeks &&
        postWeekHeroAllowed;

      if (__DEV__) {
        console.log('[CTA check]', {
          dbCurrentWeek,
          weeksInPlan: weeks.map((w: any) => ({
            weekNumber: w.weekNumber,
            week_number: w.week_number,
            allKeys: Object.keys(w),
          })),
          nextWeekExists,
          showGenerateNextWeekCTA,
        });
      }

      setPlanData({
        planId: plan.id,
        planTitle: planJson.title ?? plan.title,
        currentWeek,
        totalWeeks,
        daysPerWeek,
        todayWorkout,
        weekDays,
        completedSessions,
        nextWeekReady,
        nextWeekFirstWorkout,
        showGenerateNextWeekCTA,
        postWeekHeroAllowed,
        planSplit: (planJson as { split?: string }).split,
        nextWeekPhase: nextWeekData?.phase,
      });
      setJordanWelcome(jordanWelcome);
      setCurrentPhase(currentWeekPhase);

      // Fetch latest weekly summary for coach card
      const { data: latestSummary } = await supabase
        .from('weekly_summaries')
        .select('summary_json, week_number')
        .eq('user_id', userId)
        .eq('plan_id', plan.id)
        .order('week_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (
        latestSummary &&
        latestSummary.week_number >= plan.current_week - 1
      ) {
        const summaryJson = latestSummary.summary_json as { headline?: string } | null;
        setCoachSummary({
          headline: summaryJson?.headline ?? '',
          week_number: latestSummary.week_number,
        });
      } else {
        setCoachSummary(null);
      }

      const planId = plan.id;
      const { data: summaries } = await supabase
        .from('weekly_summaries')
        .select('week_number')
        .eq('user_id', userId)
        .eq('plan_id', planId)
        .order('week_number', { ascending: false })
        .limit(10);

      let unviewedWeek: number | null = null;
      for (const summary of summaries ?? []) {
        const viewedKey = `summary_viewed_${planId}_week${summary.week_number}`;
        const viewed = await AsyncStorage.getItem(viewedKey);
        if (viewed !== 'true') {
          unviewedWeek = summary.week_number;
          break;
        }
      }
      setUnviewedSummaryWeekNumber(unviewedWeek);

      // Fire stats in background — dashboard renders immediately
      loadStats(userId, plan.id, plan.current_week);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async (uid: string, planId: string, currentWeek: number) => {
    if (!planId) {
      setStatsLoading(false);
      return;
    }
    try {
      setStatsLoading(true);

      const [countRes, weeklyRes, allLogsRes] = await Promise.all([
        supabase
          .from('workout_logs')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid)
          .eq('plan_id', planId),
        supabase
          .from('workout_logs')
          .select(
            'id, plan_id, week_number, day_number, logged_at, sets_json, session_fatigue_rating',
          )
          .eq('user_id', uid)
          .eq('plan_id', planId)
          .eq('week_number', currentWeek)
          .order('logged_at', { ascending: false }),
        supabase
          .from('workout_logs')
          .select('logged_at')
          .eq('user_id', uid)
          .eq('plan_id', planId)
          .order('logged_at', { ascending: false }),
      ]);

      // 1. Total sessions
      setTotalSessions(countRes.count ?? 0);

      if (weeklyRes.error) {
        console.error('workout_logs error:', weeklyRes.error.message);
        setWorkoutLogs([]);
        setWeeklyVolume(0);
      } else {
        const planWeekRows =
          (weeklyRes.data ?? []) as Array<{
            plan_id?: string;
            week_number?: number;
            day_number?: number;
            sets_json?: SetItem[];
            logged_at?: string;
            session_fatigue_rating?: number;
            id?: string;
          }>;
        let volumeLbs = 0;
        for (const row of planWeekRows) {
          if (!Array.isArray(row.sets_json)) continue;
          for (const raw of row.sets_json) {
            const s = raw as {
              weightLbs?: number;
              weight?: number;
              reps?: number;
              exerciseName?: string;
            };
            const w = Number(s.weightLbs ?? s.weight ?? 0);
            const r = Number(s.reps ?? 0);
            if (w > 0 && r > 0) {
              // Unilateral exercises: reps are per-side, multiply ×2 for bilateral-equivalent volume
              const repMultiplier = isExerciseUnilateral(s.exerciseName ?? '') ? 2 : 1;
              volumeLbs += w * r * repMultiplier;
            }
          }
        }
        setWeeklyVolume(volumeLbs);
        setWorkoutLogs(planWeekRows);
      }

      // Current streak — consecutive local calendar days with ≥1 log (active plan)
      const sessionDates = new Set<string>();
      for (const row of (allLogsRes.data ?? []) as { logged_at: string }[]) {
        if (!row.logged_at) continue;
        sessionDates.add(new Date(row.logged_at).toLocaleDateString());
      }

      const check = new Date();
      if (!sessionDates.has(check.toLocaleDateString())) {
        check.setDate(check.getDate() - 1);
      }

      let streak = 0;
      while (sessionDates.has(check.toLocaleDateString())) {
        streak++;
        check.setDate(check.getDate() - 1);
      }
      setCurrentStreak(streak);
    } catch (err) {
      console.error('loadStats error:', err);
      setWorkoutLogs([]);
      // Silent — stats are non-critical, leave values at 0
    } finally {
      setStatsLoading(false);
    }
  };

  const handleGenerateNextWeek = async () => {
    if (!planData) return;
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('No session');
      const { error } = await supabase.functions.invoke('generate-next-week', {
        body: { userId, planId: planData.planId, completedWeekNumber: planData.currentWeek },
      });
      if (error) throw error;
      setPlanData((prev) => (prev ? { ...prev, showGenerateNextWeekCTA: false } : prev));
      await loadDashboardData();
    } catch {
      Alert.alert('Generation failed', "Couldn't generate next week. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveWeight = async () => {
    const val = parseFloat(weightInput);
    if (isNaN(val) || val < 50 || val > 500) {
      Alert.alert('Invalid weight', 'Please enter a weight between 50 and 500 lbs.');
      return;
    }
    setWeightSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id;
      if (!uid) throw new Error('No authenticated user');
      const todayDate = new Date().toISOString().split('T')[0];
      const { error } = await supabase
        .from('weight_logs')
        .upsert(
          { user_id: uid, log_date: todayDate, weight_lbs: val },
          { onConflict: 'user_id,log_date' },
        );
      if (error) {
        Alert.alert('Error', 'Could not save weight. Please try again.');
      } else {
        setTodayWeight(val);
        setWeightLoggedToday(true);
        setShowWeightModal(false);
      }
    } catch {
      Alert.alert('Error', 'Could not save weight. Please try again.');
    } finally {
      setWeightSaving(false);
    }
  };

  const handleStartWorkout = useCallback(() => {
    const todayWorkout = planData?.todayWorkout ?? null;
    if (!todayWorkout) return;
    const daysPerWeekLocal = planData?.daysPerWeek ?? 4;
    const weeklyLogsLocal = workoutLogs ?? [];
    const sessionsThisWeekLocal = weeklyLogsLocal.length;
    const isWeekCompleteLocal =
      sessionsThisWeekLocal >= (daysPerWeekLocal ?? 2);
    const lastSessionLocal = weeklyLogsLocal[0] ?? null;
    const lastSignalLocal = sessionSignalFromLastLog(lastSessionLocal);
    const preSessionCopyLocal =
      lastSignalLocal != null &&
      sessionsThisWeekLocal >= 1 &&
      !isWeekCompleteLocal
        ? PRE_SESSION_COPY[lastSignalLocal]
        : null;
    navigation.navigate('ActiveWorkout', {
      planId: planData?.planId ?? 'mock',
      weekNumber: todayWorkout.isNextWeek
        ? (planData?.currentWeek ?? 1) + 1
        : planData?.currentWeek ?? 1,
      dayNumber: todayWorkout.dayNumber,
      workoutTitle: todayWorkout.title,
      preSessionMessage: preSessionCopyLocal ?? null,
    });
  }, [navigation, planData, workoutLogs]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const hour = new Date().getHours();
  const timeGreeting =
    hour < 12 ? 'Good morning' :
    hour < 17 ? 'Good afternoon' :
    'Good evening';

  const today = planData?.todayWorkout ?? null;
  const todaySessionFocus = getSessionIntent(
    currentPhase,
    today?.sessionFocus,
    planData?.planSplit,
  );
  const daysPerWeek = planData?.daysPerWeek ?? 4;
  const completedSessions = planData?.completedSessions ?? 0;
  const allSessionsComplete =
    daysPerWeek > 0 && completedSessions >= daysPerWeek;
  const postWeekHeroAllowed = planData?.postWeekHeroAllowed ?? true;
  const showGenerateNextWeekCTA = planData?.showGenerateNextWeekCTA ?? false;
  const exerciseCount = today?.exercises?.length ?? 0;
  const totalSets = today?.exercises?.reduce((sum, ex) => sum + ex.sets, 0) ?? 0;
  const estMins = today?.exercises && today.exercises.length > 0
    ? calculateSessionDuration(today.exercises)
    : 45;
  const displayName = userEmail
    ? userEmail.split('@')[0].charAt(0).toUpperCase() +
      userEmail.split('@')[0].slice(1)
    : '';
  const profileInitial = displayName
    ? displayName.charAt(0).toUpperCase()
    : 'U';
  const completionRatio =
    daysPerWeek > 0 ? Math.min(1, completedSessions / daysPerWeek) : 0;
  const progressFillWidth: DimensionValue =
    `${Math.round(completionRatio * 100)}%`;

  const streakDisplay = statsLoading ? '—' : String(currentStreak);
  const sessionsDisplay = statsLoading ? '—' : String(totalSessions);
  const weeklySessionCount = workoutLogs?.length ?? 0;
  let volumeDisplay: string;
  if (statsLoading) {
    volumeDisplay = '—';
  } else if (weeklySessionCount === 0) {
    volumeDisplay = '—';
  } else if (weeklyVolume >= 1000) {
    volumeDisplay = `${Math.round((weeklyVolume / 1000) * 10) / 10}k`;
  } else {
    volumeDisplay = String(weeklyVolume);
  }

  const sessionCount = totalSessions;
  const dashboardCurrentWeek = planData?.currentWeek ?? 1;
  const isDay1ColdStart =
    planData != null && sessionCount === 0 && dashboardCurrentWeek === 1;

  const jordanCardState: JordanCardState =
    sessionCount === 0 && dashboardCurrentWeek === 1
      ? 'day1'
      : coachSummary?.headline
        ? 'summary_available'
        : 'in_week';

  const displayedJordanText: string = {
    day1:
      "Day 1 starts now. Choose weights that feel like RPE 7–8 — challenging but controlled. Log every set honestly and I'll take it from here.",
    in_week:
      "First session logged. Keep the same approach next session — your numbers are already telling me what Week 2 needs to look like.",
    summary_available: coachSummary?.headline ?? jordanWelcome ?? '',
  }[jordanCardState];

  const weeklyLogs = workoutLogs ?? [];

  const sessionsThisWeek = weeklyLogs.length;
  const isWeekComplete = sessionsThisWeek >= (daysPerWeek ?? 2);
  const lastSession = weeklyLogs[0] ?? null;
  const lastSessionSignal = sessionSignalFromLastLog(lastSession);
  const preSessionCopy =
    lastSessionSignal != null &&
    sessionsThisWeek >= 1 &&
    !isWeekComplete
      ? PRE_SESSION_COPY[lastSessionSignal]
      : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingTime}>{timeGreeting}</Text>
            {displayName ? (
              <Text style={styles.greetingName}>{displayName}</Text>
            ) : null}
          </View>
          <View style={styles.profileButton}>
            <Text style={styles.profileInitial}>{profileInitial}</Text>
          </View>
        </View>

        {/* ── 2. Today's Workout Card (or Generate CTA or Rest Day) ──
            Priority: calendar rest / generate on rest → generate when training path → today’s session → fallback */}
        {!isTrainingDay && !devBypassDayGate ? (
          allSessionsComplete && postWeekHeroAllowed ? (
            <View style={styles.generateCTACard}>
              <View style={styles.generateCTATitleRow}>
                <Text style={styles.generateCTACheckmark}>✅</Text>
                <Text style={styles.generateCTATitle}>
                  Week {planData?.currentWeek} Complete!
                </Text>
              </View>
              <Text style={styles.generateCTASubtitle}>
                All sessions done. Jordan is preparing your Week{' '}
                {(planData?.currentWeek ?? 0) + 1} plan.
              </Text>
              <TouchableOpacity
                style={styles.generateCTAButton}
                activeOpacity={0.8}
                onPress={handleGenerateNextWeek}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <ActivityIndicator color={Colors.textPrimary} />
                ) : (
                  <Text style={styles.generateCTAButtonText}>
                    Generate Week {(planData?.currentWeek ?? 0) + 1}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <RestDayCard nextTraining={nextTrainingDay} />
          )
        ) : showGenerateNextWeekCTA ? (
          <View style={styles.generateCTACard}>
            <View style={styles.generateCTATitleRow}>
              <Text style={styles.generateCTACheckmark}>✅</Text>
              <Text style={styles.generateCTATitle}>
                Week {planData?.currentWeek} Complete!
              </Text>
            </View>
            <Text style={styles.generateCTASubtitle}>
              All sessions done. Jordan is preparing your Week{' '}
              {(planData?.currentWeek ?? 0) + 1} plan.
            </Text>
            <TouchableOpacity
              style={styles.generateCTAButton}
              activeOpacity={0.8}
              onPress={handleGenerateNextWeek}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator color={Colors.textPrimary} />
              ) : (
                <Text style={styles.generateCTAButtonText}>
                  Generate Week {(planData?.currentWeek ?? 0) + 1}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : today ? (
          <View style={styles.workoutCard}>
            <View style={styles.workoutTopRow}>
              <View style={styles.workoutLabelRow}>
                <Text style={styles.workoutLabel}>TODAY'S WORKOUT</Text>
                {planData ? (() => {
                    const ph = getPhaseDisplay(
                      currentPhase,
                      planData.currentWeek,
                      planData.totalWeeks,
                    );
                    return (
                      <View
                        style={[
                          styles.workoutPhaseBadge,
                          { backgroundColor: ph.bg },
                          ph.borderColor != null
                            ? { borderWidth: 1, borderColor: ph.borderColor }
                            : null,
                        ]}
                      >
                        <Text style={[styles.workoutPhaseText, { color: ph.color }]}>
                          {ph.label}
                        </Text>
                      </View>
                    );
                  })() : null}
              </View>
              <View style={styles.dayBadge}>
                <Text style={styles.dayBadgeText}>
                  {today.isNextWeek
                    ? `Week ${(planData?.currentWeek ?? 1) + 1} · Day ${today.dayNumber}`
                    : `Day ${today.dayNumber}`}
                </Text>
              </View>
            </View>

            <Text style={styles.workoutName}>{today.title}</Text>

            <View style={styles.chipRow}>
              {(today.muscleGroups ?? []).map((muscle) => (
                <View key={muscle} style={styles.muscleChip}>
                  <Text style={styles.muscleChipText}>{muscle}</Text>
                </View>
              ))}
            </View>

            {todaySessionFocus ? (
              <View style={styles.sessionFocusCard}>
                <Text style={styles.sessionFocusText}>{todaySessionFocus}</Text>
              </View>
            ) : null}

            <View style={styles.workoutDivider} />

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{exerciseCount}</Text>
                <Text style={styles.statLabel}>exercises</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{totalSets}</Text>
                <Text style={styles.statLabel}>sets</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{estMins}</Text>
                <Text style={styles.statLabel}>min</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.ctaButton}
              activeOpacity={0.8}
              onPress={handleStartWorkout}
            >
              <Text style={styles.ctaText}>Start Workout →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                navigation.navigate('WorkoutTab' as any, {
                  screen: 'PlanView',
                  params: { planId: planData?.planId ?? 'mock', weekNumber: planData?.currentWeek ?? 1 },
                })
              }
              style={styles.viewPlanLink}
            >
              <Text style={styles.viewPlanText}>View Full Plan →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.restCard}>
            <Text style={styles.restEmoji}>💤</Text>
            <Text style={styles.restTitle}>Rest Day</Text>
            <Text style={styles.restSubtitle}>
              Recovery day — no training scheduled
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                navigation.navigate('WorkoutTab' as any, {
                  screen: 'PlanView',
                  params: { planId: planData?.planId ?? 'mock', weekNumber: planData?.currentWeek ?? 1 },
                })
              }
              style={styles.restPlanLink}
            >
              <Text style={styles.restPlanLinkText}>View Full Plan →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 5. Week Progress ── */}
        <View style={styles.weekCard}>
          <View style={styles.weekTopRow}>
            <Text style={styles.weekLabel}>
              WEEK {planData?.currentWeek ?? 1} OF {planData?.totalWeeks ?? 8}
            </Text>
            <Text style={styles.weekSessions}>
              {completedSessions} of {daysPerWeek} sessions
            </Text>
          </View>

          <View style={styles.dotsRow}>
            {Array.from({ length: daysPerWeek }, (_, i) => i + 1).map((dot) => {
              const isComplete = dot <= completedSessions;
              const isCurrent = dot === completedSessions + 1;
              return (
                <View
                  key={dot}
                  style={[
                    styles.dayDot,
                    isComplete && styles.dayDotComplete,
                    isCurrent && styles.dayDotCurrent,
                    !isComplete && !isCurrent && styles.dayDotFuture,
                  ]}
                >
                  {isComplete ? (
                    <Text style={styles.dotCheckmark}>✓</Text>
                  ) : null}
                  {isCurrent ? <View style={styles.dayDotCurrentInner} /> : null}
                </View>
              );
            })}
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: progressFillWidth }]} />
          </View>
        </View>

        {/* ── 3b. Next Week Ready Banner ── */}
        {planData?.nextWeekReady &&
          planData.completedSessions >= planData.daysPerWeek &&
          postWeekHeroAllowed && (
          <View style={styles.nextWeekBanner}>
            <Text style={styles.nextWeekBannerTitle}>
              Week {planData.currentWeek + 1} is Ready 🚀
            </Text>
            <Text style={styles.nextWeekBannerSubtitle}>
              Your adapted plan is waiting. Keep the momentum going.
            </Text>
            <TouchableOpacity
              style={styles.nextWeekBannerButton}
              activeOpacity={0.8}
              onPress={() =>
                navigation.navigate('ActiveWorkout', {
                  planId: planData.planId,
                  weekNumber: planData.currentWeek + 1,
                  dayNumber: planData.nextWeekFirstWorkout?.dayNumber ?? 1,
                  workoutTitle: planData.nextWeekFirstWorkout?.title ?? 'Workout',
                  preSessionMessage: preSessionCopy ?? null,
                })
              }
            >
              <Text style={styles.nextWeekBannerButtonText}>
                Start Week {planData.currentWeek + 1}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 6. Daily Weight Log Card ── */}
        <View style={styles.weightLogCard}>
          {weightLoggedToday ? (
            <>
              <View style={styles.weightLogLeft}>
                <View style={styles.weightLoggedRow}>
                  <Text style={styles.weightLogCheck}>✓</Text>
                  <Text style={styles.weightLogTitleLogged}>Weighed In</Text>
                </View>
                <Text style={styles.weightLogSub}>{todayWeight} lbs today</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setWeightInput(String(todayWeight ?? ''));
                  setShowWeightModal(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.weightEditBtn}>Edit</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.weightLogLeft}>
                <View style={styles.weightLogTitleRow}>
                  <Text style={styles.weightScaleEmoji}>⚖️</Text>
                  <Text style={styles.weightLogTitlePrompt}>Daily Weigh-In</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.weightLogBtn}
                onPress={() => {
                  setWeightInput('');
                  setShowWeightModal(true);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.weightLogBtnText}>Log Weight</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── 7. Quick Stats Row ── */}
        {isDay1ColdStart ? (
          <View style={styles.coldStartPlaceholder}>
            <Text style={styles.coldStartText}>
              Your stats will build here as you train. Start your first session to
              begin.
            </Text>
          </View>
        ) : (
          <View style={styles.quickStatsRow}>
            <View style={styles.quickStatCard}>
              <Text style={styles.quickStatEmoji}>🔥</Text>
              <Text
                style={[
                  styles.quickStatValue,
                  currentStreak > 0 ? styles.quickStatValueAccent : null,
                ]}
              >
                {streakDisplay}
              </Text>
              <Text style={styles.quickStatLabel}>Day streak</Text>
            </View>
            <View style={styles.quickStatCard}>
              <Text style={styles.quickStatEmoji}>⚡</Text>
              <Text
                style={[
                  styles.quickStatValue,
                  totalSessions > 0 ? styles.quickStatValueAccent : null,
                ]}
              >
                {sessionsDisplay}
              </Text>
              <Text style={styles.quickStatLabel}>Sessions</Text>
            </View>
            <View style={styles.quickStatCard}>
              <Text style={styles.quickStatEmoji}>📈</Text>
              <Text
                style={[
                  styles.quickStatValue,
                  weeklySessionCount > 0 &&
                    weeklyVolume > 0 &&
                    !statsLoading
                    ? styles.quickStatValueAccent
                    : null,
                ]}
              >
                {volumeDisplay}
              </Text>
              <Text style={styles.quickStatLabel}>lbs</Text>
            </View>
          </View>
        )}

        {unviewedSummaryWeekNumber != null && planData ? (
          <TouchableOpacity
            style={styles.summaryUnreadBanner}
            activeOpacity={0.85}
            onPress={() =>
              navigation.navigate('WeeklyCoachSummary', {
                planId: planData.planId,
                weekNumber: unviewedSummaryWeekNumber,
              })
            }
          >
            <View style={styles.summaryUnreadAvatar}>
              <Text style={styles.summaryUnreadAvatarText}>J</Text>
            </View>
            <Text style={styles.summaryUnreadText}>
              {`Jordan reviewed your Week ${unviewedSummaryWeekNumber} — tap to read`}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* ── 8. Coach Card ── */}
        <View style={styles.coachCard}>
          <View style={styles.coachHeaderRow}>
            <Text style={styles.coachBrand}>JORDAN</Text>
            {coachSummary ? (
              <View style={styles.weekPill}>
                <Text style={styles.weekPillText}>
                  Week {coachSummary.week_number}
                </Text>
              </View>
            ) : null}
          </View>

          <Text
            style={
              displayedJordanText
                ? styles.coachHeadline
                : styles.coachFallback
            }
          >
            {displayedJordanText ||
              'Your weekly summary will appear here after your first week.'}
          </Text>

          <View style={styles.coachFooterRow}>
            {jordanCardState === 'summary_available' ? (
              <Pressable
                onPress={() =>
                  navigation.navigate('WeeklyCoachSummary', {
                    planId: planData?.planId ?? '',
                    weekNumber: planData?.currentWeek ?? 1,
                  })
                }
              >
                <Text style={styles.coachLink}>Weekly Summary →</Text>
              </Pressable>
            ) : (
              <View style={styles.coachFooterSpacer} />
            )}
            <Text style={styles.coachUpdated}>Updated today</Text>
          </View>
        </View>
      </ScrollView>

      {/* ── Weight Log Modal ── */}
      <Modal
        visible={showWeightModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWeightModal(false)}
      >
        <View style={styles.weightModalOverlay}>
          <View style={styles.weightModalSheet}>
            <Text style={styles.weightModalTitle}>Log Today's Weight</Text>
            <Text style={styles.weightModalSubtitle}>
              🌅 For best accuracy, weigh yourself first thing in the morning
            </Text>
            <TextInput
              style={styles.weightModalInput}
              keyboardType="numeric"
              value={weightInput}
              onChangeText={setWeightInput}
              placeholderTextColor={Colors.textSecondary}
            />
            <Text style={styles.weightModalUnit}>lbs</Text>
            <View style={styles.weightModalBtns}>
              <TouchableOpacity
                style={styles.weightModalCancelBtn}
                onPress={() => setShowWeightModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.weightModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.weightModalSaveBtn}
                onPress={handleSaveWeight}
                disabled={weightSaving}
                activeOpacity={0.8}
              >
                {weightSaving ? (
                  <ActivityIndicator color={Colors.textPrimary} />
                ) : (
                  <Text style={styles.weightModalSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  scroll: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  scrollContent: {
    paddingTop: 0,
    paddingBottom: 120,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: 56,
    paddingBottom: Spacing.lg,
  },
  greetingTime: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  greetingName: {
    marginTop: 2,
    fontSize: FontSizes.heading1,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },

  workoutCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  // BUG-8: Calendar rest day card (scheduled training day check)
  restDayCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  restDayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  restDayLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
  },
  restDayNextUp: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  restDayJordan: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  jordanAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  jordanAvatarText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  restDayMessage: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 22,
  },
  workoutTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  workoutLabel: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  dayBadge: {
    backgroundColor: Colors.accentMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  dayBadgeText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
  workoutName: {
    fontSize: FontSizes.heading1,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.lg,
  },
  muscleChip: {
    backgroundColor: Colors.bgElevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  muscleChipText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  sessionFocusCard: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sessionFocusText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.accent,
    lineHeight: 18,
  },
  workoutDivider: {
    ...CommonStyles.divider,
    marginBottom: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: FontSizes.display,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  statLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  ctaButton: {
    marginTop: Spacing.xl,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
  },
  viewPlanLink: {
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  viewPlanText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.accent,
    textAlign: 'center',
  },

  generateCTACard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1.5,
    borderColor: Colors.accentBorder,
  },
  generateCTATitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  generateCTACheckmark: {
    fontFamily: Fonts.regular,
    fontSize: 20,
  },
  generateCTATitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    marginLeft: Spacing.sm,
  },
  generateCTASubtitle: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.body,
    marginTop: 6,
  },
  generateCTAButton: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    height: 50,
    marginTop: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateCTAButtonText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.body,
    fontFamily: Fonts.semiBold,
  },

  restCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.divider,
    alignItems: 'center',
    paddingVertical: 32,
  },
  restEmoji: {
    fontFamily: Fonts.regular,
    fontSize: 48,
    textAlign: 'center',
  },
  restTitle: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  restSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },
  restPlanLink: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  restPlanLinkText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.accent,
    textAlign: 'center',
  },

  weekCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  weekTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  weekLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    letterSpacing: 1.5,
  },
  weekSessions: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  dayDot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotComplete: {
    backgroundColor: Colors.accent,
  },
  dayDotCurrent: {
    backgroundColor: Colors.bgPrimary,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  dayDotFuture: {
    backgroundColor: Colors.bgElevated,
  },
  dayDotCurrentInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
  },
  dotCheckmark: {
    fontFamily: Fonts.bold,
    fontSize: 20,
    color: Colors.textPrimary,
  },
  progressTrack: {
    marginTop: 12,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.divider,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.accent,
  },

  coldStartPlaceholder: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  coldStartText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  quickStatsRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    gap: 10,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  quickStatEmoji: {
    fontFamily: Fonts.regular,
    fontSize: 24,
    marginBottom: 6,
  },
  quickStatValue: {
    fontSize: FontSizes.display,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  quickStatValueAccent: {
    color: Colors.accent,
  },
  quickStatLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },

  summaryUnreadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.accentMuted,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    borderRadius: Radius.md,
  },
  summaryUnreadAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryUnreadAvatarText: {
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
    fontSize: 14,
  },
  summaryUnreadText: {
    flex: 1,
    fontSize: FontSizes.body,
    fontFamily: Fonts.medium,
    color: Colors.textPrimary,
  },

  coachCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    overflow: 'hidden',
  },
  coachHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  coachBrand: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    letterSpacing: 1.5,
  },
  weekPill: {
    backgroundColor: Colors.accentMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  weekPillText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  coachHeadline: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    lineHeight: 24,
  },
  coachFallback: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  coachFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  coachFooterSpacer: {
    flex: 1,
  },
  coachLink: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.accent,
  },
  coachUpdated: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },

  nextWeekBanner: {
    backgroundColor: Colors.bgCard,
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },
  nextWeekBannerTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
  },
  nextWeekBannerSubtitle: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.caption,
    marginTop: 4,
  },
  nextWeekBannerButton: {
    backgroundColor: Colors.success,
    borderRadius: Radius.sm,
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    alignSelf: 'flex-start',
  },
  nextWeekBannerButtonText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold,
  },

  weightLogCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weightLogLeft: {
    flex: 1,
  },
  weightLogTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weightScaleEmoji: {
    fontFamily: Fonts.regular,
    fontSize: 20,
  },
  weightLogTitlePrompt: {
    marginLeft: 10,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  weightLoggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  weightLogCheck: {
    color: Colors.accent,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
  },
  weightLogTitleLogged: {
    color: Colors.textPrimary,
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold,
  },
  weightLogSub: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.caption,
    marginTop: 2,
  },
  weightLogBtn: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: Spacing.sm,
  },
  weightLogBtnText: {
    color: Colors.accent,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold,
  },
  weightEditBtn: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.caption,
  },

  weightModalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  weightModalSheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.xxl,
  },
  weightModalTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold,
    marginBottom: Spacing.sm,
  },
  weightModalSubtitle: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.caption,
    marginBottom: Spacing.xl,
  },
  weightModalInput: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 14,
    fontSize: FontSizes.display,
    fontFamily: Fonts.bold,
    textAlign: 'center',
    color: Colors.textPrimary,
  },
  weightModalUnit: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.title,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  weightModalBtns: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  weightModalCancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightModalCancelText: {
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
    fontSize: FontSizes.body,
  },
  weightModalSaveBtn: {
    flex: 1,
    height: 50,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightModalSaveText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.body,
    fontFamily: Fonts.semiBold,
  },
  workoutLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  workoutPhaseBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  workoutPhaseText: {
    fontSize: FontSizes.micro,
    fontFamily: Fonts.bold,
    letterSpacing: 0.8,
  },
});

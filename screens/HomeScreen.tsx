import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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

type NavProp = NativeStackNavigationProp<RootStackParamList>;

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

  const [todayWeight, setTodayWeight] = useState<number | null>(null);
  const [weightLoggedToday, setWeightLoggedToday] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [weightSaving, setWeightSaving] = useState(false);
  const uidRef = useRef<string | null>(null);

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
        setStatsLoading(false);
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
        setStatsLoading(false);
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
        setStatsLoading(false);
        return;
      }

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

      let todayWorkout: WorkoutDay | null =
        weekDays.find(
          (d) => d.type === 'workout' && !completedDayNumbers.has(d.dayNumber),
        ) ?? null;

      const nextWeekData =
        planJson.weeks?.find(
          (w) => getPlanWeekNumber(w) === plan.current_week + 1,
        ) ?? null;

      const nextWeekWorkoutDays: WorkoutDay[] =
        nextWeekData?.days?.filter((d: WorkoutDay) => d.type === 'workout') ?? [];

      const nextWeekFirstWorkout: WorkoutDay | null = nextWeekWorkoutDays[0] ?? null;
      const nextWeekReady = !!nextWeekFirstWorkout;

      if (!todayWorkout && nextWeekReady && nextWeekFirstWorkout) {
        todayWorkout = { ...nextWeekFirstWorkout, isNextWeek: true };
      }

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
        isWeekComplete && !nextWeekExists && dbCurrentWeek < totalWeeks;

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

      // Fire stats in background — dashboard renders immediately
      loadStats(userId, plan.id, plan.current_week);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async (uid: string, planId: string, currentWeek: number) => {
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
          .select('sets_json')
          .eq('user_id', uid)
          .eq('week_number', currentWeek)
          .eq('plan_id', planId),
        supabase
          .from('workout_logs')
          .select('logged_at')
          .eq('user_id', uid)
          .eq('plan_id', planId)
          .order('logged_at', { ascending: false }),
      ]);

      // 1. Total sessions
      setTotalSessions(countRes.count ?? 0);

      // 2. Weekly volume — sum the length of each sets_json array
      let volume = 0;
      for (const row of (weeklyRes.data ?? []) as { sets_json: SetItem[] }[]) {
        if (Array.isArray(row.sets_json)) {
          volume += row.sets_json.length;
        }
      }
      setWeeklyVolume(volume);

      // 3. Current streak — consecutive training days up to today
      const sessionDates = new Set<string>();
      const toDateStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      for (const row of (allLogsRes.data ?? []) as { logged_at: string }[]) {
        sessionDates.add(toDateStr(new Date(row.logged_at)));
      }

      const now = new Date();
      const todayStr = toDateStr(now);

      // If today has no session yet, start counting from yesterday
      const cursor = new Date(now);
      if (!sessionDates.has(todayStr)) {
        cursor.setDate(cursor.getDate() - 1);
      }

      let streak = 0;
      while (sessionDates.has(toDateStr(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }
      setCurrentStreak(streak);
    } catch (err) {
      console.error('loadStats error:', err);
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
  const daysPerWeek = planData?.daysPerWeek ?? 4;
  const completedSessions = planData?.completedSessions ?? 0;
  const showGenerateNextWeekCTA = planData?.showGenerateNextWeekCTA ?? false;
  const exerciseCount = today?.exercises?.length ?? 0;
  const totalSets = today?.exercises?.reduce((sum, ex) => sum + ex.sets, 0) ?? 0;
  const estMins = totalSets > 0 ? Math.round(totalSets * 2.5) : 45;
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
  let volumeDisplay: string;
  if (statsLoading) {
    volumeDisplay = '—';
  } else if (weeklyVolume === 0) {
    volumeDisplay = '—';
  } else if (weeklyVolume >= 1000) {
    volumeDisplay = `${Math.round((weeklyVolume / 1000) * 10) / 10}k`;
  } else {
    volumeDisplay = String(weeklyVolume);
  }
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

        {/* ── 2. Today's Workout Card (or Generate CTA or Rest Day) ── */}
        {today ? (
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

            {today.sessionFocus ? (
              <View style={styles.focusRow}>
                <Text style={styles.focusText}>{today.sessionFocus}</Text>
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
              onPress={() =>
                navigation.navigate('ActiveWorkout', {
                  planId: planData?.planId ?? 'mock',
                  weekNumber: today.isNextWeek
                    ? (planData?.currentWeek ?? 1) + 1
                    : planData?.currentWeek ?? 1,
                  dayNumber: today.dayNumber,
                  workoutTitle: today.title,
                })
              }
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
        {planData?.nextWeekReady && planData.completedSessions >= planData.daysPerWeek && (
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
            <View style={styles.volRow}>
              <Text
                style={[
                  styles.quickStatValue,
                  weeklyVolume > 0 && !statsLoading
                    ? styles.quickStatValueAccent
                    : null,
                ]}
              >
                {volumeDisplay}
              </Text>
              <Text style={styles.volUnit}>sets</Text>
            </View>
            <Text style={styles.quickStatLabel}>Vol. this week</Text>
          </View>
        </View>

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
              coachSummary?.headline
                ? styles.coachHeadline
                : jordanWelcome
                  ? styles.coachHeadline
                  : styles.coachFallback
            }
          >
            {coachSummary?.headline ??
              jordanWelcome ??
              'Your weekly summary will appear here after your first week.'}
          </Text>

          <View style={styles.coachFooterRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() =>
                navigation.navigate('WeeklyCoachSummary', {
                  planId: planData?.planId ?? '',
                  weekNumber: planData?.currentWeek ?? 1,
                })
              }
            >
              <Text style={styles.coachLink}>Weekly Summary →</Text>
            </TouchableOpacity>
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
  focusRow: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: Spacing.lg,
  },
  focusText: {
    fontFamily: Fonts.regular,
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
  volRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  volUnit: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
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

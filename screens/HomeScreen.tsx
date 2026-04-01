import { useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const CARD_SELECTED_BG = 'rgba(59,130,246,0.12)';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const DISABLED_BG = '#334155';

const DIVIDER_COLOR = '#2D3F55';

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

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();

  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [totalSessions, setTotalSessions] = useState<number>(0);
  const [weeklyVolume, setWeeklyVolume] = useState<number>(0);
  const [currentStreak, setCurrentStreak] = useState<number>(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [coachSummary, setCoachSummary] = useState<{
    headline: string;
    week_number: number;
  } | null>(null);

  const [todayWeight, setTodayWeight] = useState<number | null>(null);
  const [weightLoggedToday, setWeightLoggedToday] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [weightSaving, setWeightSaving] = useState(false);
  const uidRef = useRef<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

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

      const rawName = session.user.email?.split('@')[0] ?? '';
      setUserName(rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : '');

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

      const { data: plan, error: planError } = await supabase
        .from('plans')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (planError || !plan) {
        setStatsLoading(false);
        return;
      }

      const planJson = plan.plan_json;
      const currentWeekData =
        planJson.weeks?.find(
          (w: { weekNumber: number }) => w.weekNumber === plan.current_week,
        ) ?? planJson.weeks?.[0];

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
          (w: { weekNumber: number }) => w.weekNumber === plan.current_week + 1,
        ) ?? null;

      const nextWeekWorkoutDays: WorkoutDay[] =
        nextWeekData?.days?.filter((d: WorkoutDay) => d.type === 'workout') ?? [];

      const nextWeekFirstWorkout: WorkoutDay | null = nextWeekWorkoutDays[0] ?? null;
      const nextWeekReady = !!nextWeekFirstWorkout;

      if (!todayWorkout && nextWeekReady && nextWeekFirstWorkout) {
        todayWorkout = { ...nextWeekFirstWorkout, isNextWeek: true };
      }

      const totalSessionsThisWeek = weekDays.filter((d) => d.type === 'workout').length;
      const allSessionsComplete = completedSessions >= totalSessionsThisWeek && totalSessionsThisWeek > 0;
      const nextWeekAlreadyGenerated: boolean =
        (planJson.weeks as Array<{ weekNumber: number }>)
          ?.some((w) => w.weekNumber === plan.current_week + 1) ?? false;
      const showGenerateNextWeekCTA = allSessionsComplete && !nextWeekAlreadyGenerated;

      setPlanData({
        planId: plan.id,
        planTitle: planJson.title ?? plan.title,
        currentWeek: plan.current_week,
        totalWeeks: plan.total_weeks,
        daysPerWeek: plan.plan_json.daysPerWeek ?? 4,
        todayWorkout,
        weekDays,
        completedSessions,
        nextWeekReady,
        nextWeekFirstWorkout,
        showGenerateNextWeekCTA,
      });

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
          .eq('user_id', uid),
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
          <ActivityIndicator size="large" color={ACCENT_BLUE} />
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
  const profileInitial = userName.charAt(0).toUpperCase() || 'U';
  const progressPct = daysPerWeek > 0
    ? `${Math.round((completedSessions / daysPerWeek) * 100)}%`
    : '0%';

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
            <Text style={styles.greetingTop}>{timeGreeting}</Text>
            {userName ? <Text style={styles.greetingName}>{userName}</Text> : null}
          </View>
          <View style={styles.profileButton}>
            <Text style={styles.profileInitial}>{profileInitial}</Text>
          </View>
        </View>

        {/* ── 2. Today's Workout Card (or Rest Day) ── */}
        {today ? (
          <View style={styles.workoutCard}>
            {/* Left accent bar */}
            <View style={styles.accentBar} />

            {/* Top label row */}
            <View style={styles.workoutTopRow}>
              <Text style={styles.workoutLabel}>TODAY'S WORKOUT</Text>
              <View style={styles.dayBadge}>
                <Text style={styles.dayBadgeText}>
                  {today.isNextWeek
                    ? `Week ${(planData?.currentWeek ?? 1) + 1} · Day ${today.dayNumber}`
                    : `Day ${today.dayNumber}`}
                </Text>
              </View>
            </View>

            {/* Workout name */}
            <Text style={styles.workoutName}>{today.title}</Text>

            {/* Muscle group chips */}
            <View style={styles.chipRow}>
              {(today.muscleGroups ?? []).map((muscle) => (
                <View key={muscle} style={styles.muscleChip}>
                  <Text style={styles.muscleChipText}>{muscle}</Text>
                </View>
              ))}
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Stats row */}
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

            {/* CTA */}
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
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.generateCTAButtonText}>
                  Generate Week {(planData?.currentWeek ?? 0) + 1}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.restCard}>
            <Text style={styles.restTitle}>Rest Day 💤</Text>
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
              style={styles.viewPlanLink}
            >
              <Text style={styles.viewPlanText}>View Full Plan →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 3. Week Progress Bar ── */}
        <View style={styles.weekCard}>
          <View style={styles.weekTopRow}>
            <Text style={styles.weekLabel}>
              WEEK {planData?.currentWeek ?? 1} OF {planData?.totalWeeks ?? 8}
            </Text>
            <Text style={styles.weekSessions}>
              {completedSessions} of {daysPerWeek} sessions
            </Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: progressPct as `${number}%` }]} />
          </View>

          {/* Day dots */}
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
                  ]}
                >
                  {isComplete && (
                    <Text style={styles.dotCheckmark}>✓</Text>
                  )}
                </View>
              );
            })}
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

        {/* ── 3c. Daily Weight Log Card ── */}
        <View style={styles.weightLogCard}>
          {weightLoggedToday ? (
            <>
              <View style={styles.weightLogLeft}>
                <View style={styles.weightLoggedRow}>
                  <Text style={styles.weightLogCheck}>✓</Text>
                  <Text style={styles.weightLogTitle}>Weighed In</Text>
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
                <Text style={styles.weightLogTitle}>Daily Weigh-In</Text>
                <Text style={styles.weightLogSub}>Tap to log today's weight</Text>
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

        {/* ── 4. Quick Stats Row ── */}
        <View style={styles.quickStatsRow}>
          <View style={styles.quickStatCard}>
            <Text style={styles.quickStatEmoji}>🔥</Text>
            <Text style={styles.quickStatValue}>
              {statsLoading ? '—' : currentStreak}
            </Text>
            <Text style={styles.quickStatLabel}>Day streak</Text>
          </View>
          <View style={styles.quickStatCard}>
            <Text style={styles.quickStatEmoji}>⚡</Text>
            <Text style={styles.quickStatValue}>
              {statsLoading ? '—' : totalSessions}
            </Text>
            <Text style={styles.quickStatLabel}>Sessions</Text>
          </View>
          <View style={styles.quickStatCard}>
            <Text style={styles.quickStatEmoji}>📈</Text>
            <View style={styles.volRow}>
              <Text style={styles.quickStatValue}>
                {statsLoading
                  ? '—'
                  : weeklyVolume === 0
                    ? '—'
                    : weeklyVolume >= 1000
                      ? `${Math.round((weeklyVolume / 1000) * 10) / 10}k`
                      : String(weeklyVolume)}
              </Text>
              <Text style={styles.volUnit}>sets</Text>
            </View>
            <Text style={styles.quickStatLabel}>Vol. this week</Text>
          </View>
        </View>

        {/* ── 5. Coach Message Card (mock — Phase 2) ── */}
        <View style={styles.coachCard}>
          {/* Header row */}
          <View style={styles.coachHeaderRow}>
            <View style={styles.coachTitleGroup}>
              <Text style={styles.coachEmoji}>🤖</Text>
              <Text style={styles.coachTitle}>Your Coach</Text>
            </View>
            {coachSummary && (
              <View style={styles.weekPill}>
                <Text style={styles.weekPillText}>
                  Week {coachSummary.week_number}
                </Text>
              </View>
            )}
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Message */}
          <Text style={styles.coachMessage}>
            {coachSummary?.headline ?? 'Your weekly summary will appear here after your first week.'}
          </Text>

          {/* Bottom row */}
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
            <Text style={styles.weightModalTip}>
              🌅 For best accuracy, weigh yourself first thing in the morning
            </Text>
            <TextInput
              style={styles.weightModalInput}
              keyboardType="numeric"
              value={weightInput}
              onChangeText={setWeightInput}
              placeholderTextColor={TEXT_SECONDARY}
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
                  <ActivityIndicator color="#FFFFFF" />
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
    backgroundColor: BG_DARK,
  },
  scroll: {
    flex: 1,
    backgroundColor: BG_DARK,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 60,
    marginBottom: 24,
  },
  greetingTop: {
    fontSize: 14,
    color: TEXT_SECONDARY,
  },
  greetingName: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },

  /* ── Today's Workout Card ── */
  workoutCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    paddingLeft: 24,
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: ACCENT_BLUE,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  workoutTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  workoutLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: ACCENT_BLUE,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  dayBadge: {
    backgroundColor: CARD_SELECTED_BG,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  dayBadgeText: {
    fontSize: 12,
    color: ACCENT_BLUE,
  },
  workoutName: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginTop: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  muscleChip: {
    backgroundColor: DISABLED_BG,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 6,
  },
  muscleChipText: {
    fontSize: 11,
    color: TEXT_SECONDARY,
  },
  divider: {
    height: 1,
    backgroundColor: DIVIDER_COLOR,
    marginTop: 16,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  statLabel: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },
  ctaButton: {
    marginTop: 16,
    backgroundColor: ACCENT_BLUE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  viewPlanLink: {
    alignItems: 'center',
    marginTop: 10,
  },
  viewPlanText: {
    fontSize: 13,
    color: ACCENT_BLUE,
  },

  /* ── Rest Day Card ── */
  generateCTACard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 16,
  },
  generateCTATitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  generateCTACheckmark: {
    fontSize: 20,
  },
  generateCTATitle: {
    color: TEXT_PRIMARY,
    fontSize: 17,
    fontWeight: '700',
  },
  generateCTASubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    marginTop: 6,
  },
  generateCTAButton: {
    backgroundColor: ACCENT_BLUE,
    borderRadius: 14,
    height: 50,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateCTAButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  restCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  restTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 8,
  },
  restSubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginBottom: 16,
    textAlign: 'center',
  },

  /* ── Week Progress Card ── */
  weekCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  weekTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weekLabel: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    textTransform: 'uppercase',
  },
  weekSessions: {
    fontSize: 12,
    color: TEXT_SECONDARY,
  },
  progressTrack: {
    marginTop: 10,
    height: 6,
    borderRadius: 3,
    backgroundColor: DISABLED_BG,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT_BLUE,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  dayDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: DISABLED_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotComplete: {
    backgroundColor: ACCENT_BLUE,
  },
  dayDotCurrent: {
    backgroundColor: CARD_SELECTED_BG,
    borderWidth: 1.5,
    borderColor: ACCENT_BLUE,
  },
  dotCheckmark: {
    fontSize: 14,
    color: '#FFFFFF',
  },

  /* ── Quick Stats Row ── */
  quickStatsRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 10,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
  },
  quickStatEmoji: {
    fontSize: 20,
  },
  quickStatValue: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginTop: 4,
  },
  quickStatLabel: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    marginTop: 2,
    textAlign: 'center',
  },
  volRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    marginTop: 4,
  },
  volUnit: {
    fontSize: 10,
    color: TEXT_SECONDARY,
  },

  /* ── Coach Message Card ── */
  coachCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  coachHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coachTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  coachEmoji: {
    fontSize: 18,
  },
  coachTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginLeft: 8,
  },
  weekPill: {
    backgroundColor: CARD_SELECTED_BG,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  weekPillText: {
    fontSize: 11,
    color: ACCENT_BLUE,
  },
  coachMessage: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    lineHeight: 22,
  },
  coachFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  coachLink: {
    fontSize: 13,
    color: ACCENT_BLUE,
  },
  coachUpdated: {
    fontSize: 11,
    color: TEXT_SECONDARY,
  },

  /* ── Next Week Ready Banner ── */
  nextWeekBanner: {
    backgroundColor: CARD_BG,
    borderLeftWidth: 4,
    borderLeftColor: '#22C55E',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  nextWeekBannerTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
  },
  nextWeekBannerSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    marginTop: 4,
  },
  nextWeekBannerButton: {
    backgroundColor: '#22C55E',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  nextWeekBannerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  /* ── Weight Log Card ── */
  weightLogCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weightLogLeft: {
    flex: 1,
  },
  weightLoggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weightLogCheck: {
    color: ACCENT_BLUE,
    fontSize: 15,
    fontWeight: '700',
  },
  weightLogTitle: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '600',
  },
  weightLogSub: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    marginTop: 2,
  },
  weightLogBtn: {
    backgroundColor: ACCENT_BLUE,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  weightLogBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  weightEditBtn: {
    color: TEXT_SECONDARY,
    fontSize: 13,
  },

  /* ── Weight Log Modal ── */
  weightModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  weightModalSheet: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  weightModalTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  weightModalTip: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    marginBottom: 20,
  },
  weightModalInput: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: DIVIDER_COLOR,
    borderRadius: 12,
    padding: 14,
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    color: TEXT_PRIMARY,
  },
  weightModalUnit: {
    color: TEXT_SECONDARY,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  weightModalBtns: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  weightModalCancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DIVIDER_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightModalCancelText: {
    color: TEXT_PRIMARY,
    fontSize: 15,
  },
  weightModalSaveBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    backgroundColor: ACCENT_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightModalSaveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

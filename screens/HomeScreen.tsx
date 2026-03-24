import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
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
};

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();

  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      setUserName(session.user.email?.split('@')[0] ?? 'there');

      const { data: plan, error: planError } = await supabase
        .from('plans')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (planError || !plan) return;

      const planJson = plan.plan_json;
      const currentWeekData =
        planJson.weeks?.find(
          (w: { weekNumber: number }) => w.weekNumber === plan.current_week,
        ) ?? planJson.weeks?.[0];

      if (!currentWeekData) return;

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

      const todayWorkout =
        weekDays.find(
          (d) => d.type === 'workout' && !completedDayNumbers.has(d.dayNumber),
        ) ?? null;

      setPlanData({
        planId: plan.id,
        planTitle: planJson.title ?? plan.title,
        currentWeek: plan.current_week,
        totalWeeks: plan.total_weeks,
        daysPerWeek: plan.plan_json.daysPerWeek ?? 4,
        todayWorkout,
        weekDays,
        completedSessions,
      });
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setIsLoading(false);
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

  const today = planData?.todayWorkout ?? null;
  const daysPerWeek = planData?.daysPerWeek ?? 4;
  const completedSessions = planData?.completedSessions ?? 0;
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
            <Text style={styles.greetingTop}>Good morning,</Text>
            <Text style={styles.greetingName}>{userName || 'there'}</Text>
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
                <Text style={styles.dayBadgeText}>Day {today.dayNumber}</Text>
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
                  weekNumber: planData?.currentWeek ?? 1,
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
                navigation.navigate('PlanView', {
                  planId: planData?.planId ?? 'mock',
                  weekNumber: planData?.currentWeek ?? 1,
                })
              }
              style={styles.viewPlanLink}
            >
              <Text style={styles.viewPlanText}>View Full Plan →</Text>
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
                navigation.navigate('PlanView', {
                  planId: planData?.planId ?? 'mock',
                  weekNumber: planData?.currentWeek ?? 1,
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
            <View style={[styles.progressFill, { width: progressPct }]} />
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

        {/* ── 4. Quick Stats Row (mock — Phase 2) ── */}
        <View style={styles.quickStatsRow}>
          <View style={styles.quickStatCard}>
            <Text style={styles.quickStatEmoji}>🔥</Text>
            <Text style={styles.quickStatValue}>7</Text>
            <Text style={styles.quickStatLabel}>Day streak</Text>
          </View>
          <View style={styles.quickStatCard}>
            <Text style={styles.quickStatEmoji}>⚡</Text>
            <Text style={styles.quickStatValue}>24</Text>
            <Text style={styles.quickStatLabel}>Sessions</Text>
          </View>
          <View style={styles.quickStatCard}>
            <Text style={styles.quickStatEmoji}>📈</Text>
            <View style={styles.volRow}>
              <Text style={styles.quickStatValue}>12,400</Text>
              <Text style={styles.volUnit}>kg</Text>
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
            <View style={styles.weekPill}>
              <Text style={styles.weekPillText}>
                Week {planData?.currentWeek ?? 1}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Message */}
          <Text style={styles.coachMessage}>
            Great start to the week. Focus on progressive overload and
            hit your target RPE on each set. Let's keep the momentum going.
          </Text>

          {/* Bottom row */}
          <View style={styles.coachFooterRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => console.log('Weekly Summary pressed')}
            >
              <Text style={styles.coachLink}>Weekly Summary →</Text>
            </TouchableOpacity>
            <Text style={styles.coachUpdated}>Updated today</Text>
          </View>
        </View>
      </ScrollView>
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
});

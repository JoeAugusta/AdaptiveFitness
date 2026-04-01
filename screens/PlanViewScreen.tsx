import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const CARD_SELECTED_BG = 'rgba(59,130,246,0.12)';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const DISABLED_BG = '#334155';
const GREEN = '#22C55E';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'PlanView'>;
type RouteType = RouteProp<RootStackParamList, 'PlanView'>;

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExerciseSummary {
  name: string;
  sets: number;
  reps: string;
  weight: number;
}

interface PlanDay {
  dayNumber: number;
  type: 'workout' | 'rest';
  title: string;
  muscleGroups: string[];
  exercises: ExerciseSummary[];
  completed: boolean;
}

interface PlanWeek {
  weekNumber: number;
  days: PlanDay[];
}

// ─── Supabase data shape ──────────────────────────────────────────────────────

interface RawExercise {
  id?: string;
  name: string;
  muscleGroup?: string;
  sets: number;
  reps: string;
  targetWeight?: number;
  restSeconds?: number;
  targetRpe?: number;
  coachingNote?: string;
}

interface RawDay {
  dayNumber: number;
  type: 'workout' | 'rest';
  title: string;
  muscleGroups?: string[];
  exercises?: RawExercise[];
}

interface RawWeek {
  weekNumber: number;
  days: RawDay[];
}

interface LoadedPlan {
  title: string;
  currentWeek: number;
  totalWeeks: number;
  daysPerWeek: number;
  weeks: PlanWeek[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WorkoutDayCard({
  day,
  onStartWorkout,
}: {
  day: PlanDay;
  onStartWorkout: (day: PlanDay) => void;
}) {
  const PREVIEW_COUNT = 3;
  const visibleExercises = day.exercises.slice(0, PREVIEW_COUNT);
  const extraCount = day.exercises.length - PREVIEW_COUNT;

  return (
    <View
      style={[
        styles.dayCard,
        { borderLeftColor: day.completed ? GREEN : ACCENT_BLUE },
      ]}
    >
      {/* Top row */}
      <View style={styles.dayCardTopRow}>
        <View style={styles.dayPill}>
          <Text style={styles.dayPillText}>Day {day.dayNumber}</Text>
        </View>
        <Text style={styles.dayTitle} numberOfLines={1}>
          {day.title}
        </Text>
        {day.completed && <Text style={styles.completedCheck}>✓</Text>}
      </View>

      {/* Muscle group tags */}
      {day.muscleGroups.length > 0 && (
        <View style={styles.muscleRow}>
          {day.muscleGroups.map((mg) => (
            <View key={mg} style={styles.musclePill}>
              <Text style={styles.musclePillText}>{mg}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Exercise preview */}
      <View style={styles.exerciseList}>
        {visibleExercises.map((ex) => (
          <Text key={ex.name} style={styles.exerciseRow} numberOfLines={1}>
            {ex.sets}×{ex.reps}{'  '}{ex.name}
          </Text>
        ))}
        {extraCount > 0 && (
          <Text style={styles.moreExercises}>+{extraCount} more</Text>
        )}
      </View>

      {/* CTA */}
      {day.completed ? (
        <View style={styles.doneTag}>
          <Text style={styles.doneTagText}>Done ✓</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.startButton}
          activeOpacity={0.8}
          onPress={() => onStartWorkout(day)}
        >
          <Text style={styles.startButtonText}>Start Workout →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function RestDayCard({ day }: { day: PlanDay }) {
  return (
    <View style={styles.restCard}>
      <View style={styles.dayCardTopRow}>
        <View style={styles.dayPill}>
          <Text style={styles.dayPillText}>Day {day.dayNumber}</Text>
        </View>
        <Text style={styles.restTitle}>Rest Day</Text>
      </View>
      <Text style={styles.restSubtitle}>
        Recovery day — no training scheduled
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PlanViewScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const planId = route.params?.planId ?? '';

  const [planData, setPlanData] = useState<LoadedPlan | null>(null);
  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set());
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadPlanData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId || !planId) throw new Error('No session or planId');

      // Fetch plan row and workout logs in parallel
      const [planResult, logsResult] = await Promise.all([
        supabase
          .from('plans')
          .select('id, plan_json, current_week, total_weeks, title')
          .eq('id', planId)
          .single(),
        supabase
          .from('workout_logs')
          .select('week_number, day_number')
          .eq('plan_id', planId)
          .eq('user_id', userId),
      ]);

      if (planResult.error) throw planResult.error;
      const plan = planResult.data;
      const planJson = plan.plan_json ?? {};

      // Build completed lookup: "weekNumber-dayNumber"
      const logSet = new Set<string>(
        (logsResult.data ?? []).map(
          (l: { week_number: number; day_number: number }) =>
            `${l.week_number}-${l.day_number}`,
        ),
      );

      // Map raw weeks into typed PlanWeek[]
      const rawWeeks: RawWeek[] = planJson.weeks ?? [];
      const mappedWeeks: PlanWeek[] = rawWeeks.map((rw) => ({
        weekNumber: rw.weekNumber,
        days: rw.days.map((rd) => ({
          dayNumber: rd.dayNumber,
          type: rd.type,
          title: rd.title ?? (rd.type === 'rest' ? 'Rest Day' : 'Workout'),
          muscleGroups: rd.muscleGroups ?? [],
          exercises: (rd.exercises ?? []).map((ex) => ({
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            weight: ex.targetWeight ?? 0,
          })),
          completed: logSet.has(`${rw.weekNumber}-${rd.dayNumber}`),
        })),
      }));

      const currentWeek: number = plan.current_week ?? 1;

      setPlanData({
        title: plan.title ?? planJson.title ?? 'My Plan',
        currentWeek,
        totalWeeks: plan.total_weeks ?? planJson.totalWeeks ?? 12,
        daysPerWeek: planJson.daysPerWeek ?? 4,
        weeks: mappedWeeks,
      });
      setCompletedSet(logSet);
      setSelectedWeek(currentWeek);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => { loadPlanData(); }, [loadPlanData]);

  const handleStartWorkout = (day: PlanDay) => {
    navigation.navigate('ActiveWorkout', {
      planId,
      weekNumber: selectedWeek,
      dayNumber: day.dayNumber,
      workoutTitle: day.title,
    });
  };

  // ── Loading ──
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
            <Text style={styles.backArrow}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Plan</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ACCENT_BLUE} />
        </View>
      </View>
    );
  }

  // ── Error ──
  if (error || !planData) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
            <Text style={styles.backArrow}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Plan</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn't load plan</Text>
          <TouchableOpacity onPress={loadPlanData} style={styles.retryButton} activeOpacity={0.7}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const allWeekNumbers = Array.from({ length: planData.totalWeeks }, (_, i) => i + 1);
  const weekData = planData.weeks.find((w) => w.weekNumber === selectedWeek);

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Text style={styles.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Plan</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Plan summary card ── */}
        <View style={styles.summaryCard}>
          <Text style={styles.planTitle} numberOfLines={2}>
            {planData.title}
          </Text>
          <View style={styles.pillRow}>
            <View style={styles.weekPill}>
              <Text style={styles.weekPillText}>
                Week {planData.currentWeek} of {planData.totalWeeks}
              </Text>
            </View>
            <View style={styles.daysPill}>
              <Text style={styles.daysPillText}>
                {planData.daysPerWeek} days/week
              </Text>
            </View>
          </View>
        </View>

        {/* ── Week tab strip ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabStrip}
          contentContainerStyle={styles.tabStripContent}
        >
          {allWeekNumbers.map((wn) => {
            const isSelected = wn === selectedWeek;
            const isCurrent = wn === planData.currentWeek;
            const hasLogs = [...completedSet].some((k) => k.startsWith(`${wn}-`));
            return (
              <TouchableOpacity
                key={wn}
                activeOpacity={0.7}
                style={[styles.weekTab, isSelected && styles.weekTabSelected]}
                onPress={() => setSelectedWeek(wn)}
              >
                <Text
                  style={[
                    styles.weekTabText,
                    isSelected && styles.weekTabTextSelected,
                  ]}
                >
                  W{wn}
                </Text>
                {/* Dot for current week (when not selected) or past weeks with logs */}
                {!isSelected && (isCurrent || hasLogs) && (
                  <View style={[styles.currentDot, hasLogs && !isCurrent && styles.completedDot]} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Day cards / locked state ── */}
        {weekData ? (
          weekData.days.map((day) =>
            day.type === 'workout' ? (
              <WorkoutDayCard
                key={day.dayNumber}
                day={day}
                onStartWorkout={handleStartWorkout}
              />
            ) : (
              <RestDayCard key={day.dayNumber} day={day} />
            ),
          )
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔒</Text>
            <Text style={styles.emptyTitle}>Week {selectedWeek} Locked</Text>
            <Text style={styles.emptySubtitle}>
              Complete Week {planData.currentWeek} to unlock
            </Text>
          </View>
        )}

        {/* Exercise Library link */}
        <TouchableOpacity
          style={styles.libraryLink}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('ExerciseLibrary')}
        >
          <Text style={styles.libraryLinkText}>Browse Exercise Library →</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_DARK },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText: { color: TEXT_SECONDARY, fontSize: 15 },
  retryButton: { backgroundColor: ACCENT_BLUE, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: BG_DARK,
    borderBottomWidth: 1,
    borderBottomColor: CARD_BG,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: { fontSize: 22, color: TEXT_PRIMARY, marginTop: -2 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  headerSpacer: { width: 32 },

  /* Scroll */
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  /* Summary card */
  summaryCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 10,
  },
  pillRow: { flexDirection: 'row', gap: 8 },
  weekPill: {
    backgroundColor: ACCENT_BLUE,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  weekPillText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },
  daysPill: {
    backgroundColor: DISABLED_BG,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  daysPillText: { fontSize: 12, color: TEXT_SECONDARY },

  /* Week tabs */
  tabStrip: { marginBottom: 16 },
  tabStripContent: { gap: 8, paddingRight: 4 },
  weekTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    alignItems: 'center',
  },
  weekTabSelected: { backgroundColor: ACCENT_BLUE },
  weekTabText: { fontSize: 13, fontWeight: '600', color: TEXT_SECONDARY },
  weekTabTextSelected: { color: '#FFFFFF' },
  currentDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ACCENT_BLUE,
    marginTop: 3,
  },
  completedDot: { backgroundColor: GREEN },

  /* Workout day card */
  dayCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
  },
  dayCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  dayPill: {
    backgroundColor: DISABLED_BG,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dayPillText: { fontSize: 11, color: TEXT_SECONDARY, fontWeight: '600' },
  dayTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  completedCheck: { fontSize: 16, color: GREEN, fontWeight: '700' },

  /* Muscle tags */
  muscleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  musclePill: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  musclePillText: { fontSize: 11, color: ACCENT_BLUE },

  /* Exercise list */
  exerciseList: { gap: 4, marginBottom: 14 },
  exerciseRow: { fontSize: 13, color: TEXT_SECONDARY, lineHeight: 18 },
  moreExercises: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    fontStyle: 'italic',
    marginTop: 2,
  },

  /* Start button */
  startButton: {
    alignSelf: 'flex-start',
    backgroundColor: ACCENT_BLUE,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  startButtonText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },

  /* Done tag */
  doneTag: {
    alignSelf: 'flex-start',
    backgroundColor: CARD_SELECTED_BG,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  doneTagText: { fontSize: 13, fontWeight: '600', color: GREEN },

  /* Rest day card */
  restCard: {
    backgroundColor: 'rgba(30,41,59,0.6)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  restTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: TEXT_SECONDARY,
  },
  restSubtitle: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    opacity: 0.7,
    marginTop: 4,
  },

  /* Empty state */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyIcon: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY },
  emptySubtitle: { fontSize: 14, color: TEXT_SECONDARY },

  libraryLink: { alignItems: 'center', paddingVertical: 16 },
  libraryLinkText: { color: ACCENT_BLUE, fontSize: 14 },
});

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';

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

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_PLAN = {
  title: 'Upper/Lower Hypertrophy — 12 Weeks',
  currentWeek: 1,
  totalWeeks: 12,
  daysPerWeek: 4,
  weeks: [
    {
      weekNumber: 1,
      days: [
        {
          dayNumber: 1,
          type: 'workout' as const,
          title: 'Upper Body A',
          muscleGroups: ['Chest', 'Back', 'Shoulders'],
          exercises: [
            { name: 'Barbell Bench Press', sets: 3, reps: '8–10', weight: 135 },
            { name: 'Barbell Row', sets: 3, reps: '8–10', weight: 115 },
            { name: 'Overhead Press', sets: 3, reps: '8–10', weight: 75 },
            { name: 'Face Pulls', sets: 3, reps: '12–15', weight: 40 },
            { name: 'Tricep Pushdown', sets: 3, reps: '10–12', weight: 50 },
            { name: 'Barbell Curl', sets: 3, reps: '10–12', weight: 60 },
          ],
          completed: true,
        },
        {
          dayNumber: 2,
          type: 'workout' as const,
          title: 'Lower Body A',
          muscleGroups: ['Quads', 'Hamstrings', 'Glutes'],
          exercises: [
            { name: 'Back Squat', sets: 4, reps: '6–8', weight: 185 },
            { name: 'Romanian Deadlift', sets: 3, reps: '8–10', weight: 155 },
            { name: 'Leg Press', sets: 3, reps: '10–12', weight: 270 },
            { name: 'Leg Curl', sets: 3, reps: '10–12', weight: 80 },
            { name: 'Calf Raise', sets: 4, reps: '12–15', weight: 90 },
          ],
          completed: true,
        },
        {
          dayNumber: 3,
          type: 'rest' as const,
          title: 'Rest Day',
          muscleGroups: [],
          exercises: [],
          completed: false,
        },
        {
          dayNumber: 4,
          type: 'workout' as const,
          title: 'Upper Body B',
          muscleGroups: ['Chest', 'Back', 'Arms'],
          exercises: [
            { name: 'Incline DB Press', sets: 3, reps: '8–10', weight: 65 },
            { name: 'Cable Row', sets: 3, reps: '10–12', weight: 120 },
            { name: 'DB Lateral Raise', sets: 4, reps: '12–15', weight: 20 },
            { name: 'Chest Fly', sets: 3, reps: '12–15', weight: 35 },
            { name: 'Hammer Curl', sets: 3, reps: '10–12', weight: 35 },
            { name: 'Skull Crushers', sets: 3, reps: '10–12', weight: 65 },
          ],
          completed: false,
        },
        {
          dayNumber: 5,
          type: 'workout' as const,
          title: 'Lower Body B',
          muscleGroups: ['Quads', 'Glutes', 'Calves'],
          exercises: [
            { name: 'Deadlift', sets: 4, reps: '5–6', weight: 225 },
            { name: 'Bulgarian Split Squat', sets: 3, reps: '8–10', weight: 50 },
            { name: 'Hack Squat', sets: 3, reps: '10–12', weight: 180 },
            { name: 'Hip Thrust', sets: 3, reps: '10–12', weight: 135 },
            { name: 'Seated Calf Raise', sets: 4, reps: '12–15', weight: 70 },
          ],
          completed: false,
        },
        {
          dayNumber: 6,
          type: 'rest' as const,
          title: 'Rest Day',
          muscleGroups: [],
          exercises: [],
          completed: false,
        },
        {
          dayNumber: 7,
          type: 'rest' as const,
          title: 'Rest Day',
          muscleGroups: [],
          exercises: [],
          completed: false,
        },
      ],
    },
  ] as PlanWeek[],
};

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
  const params = route.params;
  const planId = params?.planId ?? 'mock';

  const [selectedWeek, setSelectedWeek] = useState(MOCK_PLAN.currentWeek);

  const weekData = MOCK_PLAN.weeks.find((w) => w.weekNumber === selectedWeek);

  const handleStartWorkout = (day: PlanDay) => {
    navigation.navigate('ActiveWorkout', {
      planId,
      weekNumber: selectedWeek,
      dayNumber: day.dayNumber,
      workoutTitle: day.title,
    });
  };

  const allWeekNumbers = Array.from(
    { length: MOCK_PLAN.totalWeeks },
    (_, i) => i + 1,
  );

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
            {MOCK_PLAN.title}
          </Text>
          <View style={styles.pillRow}>
            <View style={styles.weekPill}>
              <Text style={styles.weekPillText}>
                Week {MOCK_PLAN.currentWeek} of {MOCK_PLAN.totalWeeks}
              </Text>
            </View>
            <View style={styles.daysPill}>
              <Text style={styles.daysPillText}>
                {MOCK_PLAN.daysPerWeek} days/week
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
            const isCurrent = wn === MOCK_PLAN.currentWeek;
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
                {isCurrent && !isSelected && (
                  <View style={styles.currentDot} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Day cards / empty state ── */}
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
              Complete Week {MOCK_PLAN.currentWeek} to unlock
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_DARK },

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
});

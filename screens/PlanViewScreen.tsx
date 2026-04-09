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
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import WorkoutResultsModal, {
  type WorkoutLog,
  type ExerciseObject,
} from '../components/WorkoutResultsModal';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'PlanView'>;
type RouteType = RouteProp<RootStackParamList, 'PlanView'>;

interface ExerciseSummary {
  id?: string;
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
  phase?: string;
  days: PlanDay[];
}

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

interface RawPlanJson {
  weeks?: RawWeek[];
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
  phase?: string;
  days: RawDay[];
}

function findRawWeek(
  weeks: RawWeek[] | undefined,
  weekNumber: number,
): RawWeek | undefined {
  if (!weeks?.length) return undefined;
  const wn = Number(weekNumber);
  const match = weeks.find((w) => Number(w.weekNumber) === wn);
  if (match) return match;
  const idx = wn - 1;
  if (idx >= 0 && idx < weeks.length) return weeks[idx];
  return weeks[0];
}

function findRawDay(
  days: RawDay[] | undefined,
  dayNumber: number,
): RawDay | undefined {
  if (!days?.length) return undefined;
  const dn = Number(dayNumber);
  const match = days.find((d) => Number(d.dayNumber) === dn);
  if (match) return match;
  const idx = dn - 1;
  if (idx >= 0 && idx < days.length) return days[idx];
  return days[0];
}

interface LoadedPlan {
  title: string;
  currentWeek: number;
  totalWeeks: number;
  daysPerWeek: number;
  weeks: PlanWeek[];
}

function parseSetsJson(rawSets: unknown): { exerciseId?: string }[] {
  if (typeof rawSets === 'string') {
    try {
      const parsed = JSON.parse(rawSets) as unknown;
      return Array.isArray(parsed) ? (parsed as { exerciseId?: string }[]) : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(rawSets) ? (rawSets as { exerciseId?: string }[]) : [];
}

function formatCompletedDate(dateString?: string | null): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getPhaseDisplay(
  phase: string | undefined,
  weekNumber: number,
  totalWeeks: number,
): { label: string; color: string; bg: string } {
  const effectivePhase =
    weekNumber === 1 && (!phase || phase === 'accumulation')
      ? 'baseline'
      : phase;

  if (effectivePhase === 'baseline') {
    return {
      label: 'BASELINE',
      color: Colors.accent,
      bg: Colors.accentMuted,
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

function WorkoutDayCard({
  day,
  onStartWorkout,
  isNextWorkout,
  onViewResults,
  loadingResults,
}: {
  day: PlanDay;
  onStartWorkout: (day: PlanDay) => void;
  isNextWorkout: boolean;
  onViewResults: (day: PlanDay) => void;
  loadingResults: boolean;
}) {
  const PREVIEW_COUNT = 3;
  const visibleExercises = day.exercises.slice(0, PREVIEW_COUNT);
  const extraCount = day.exercises.length - PREVIEW_COUNT;

  return (
    <TouchableOpacity
      style={[
        styles.workoutDayCard,
        isNextWorkout && !day.completed && styles.workoutDayCardNext,
      ]}
      activeOpacity={day.completed ? 0.75 : 1}
      onPress={() => {
        if (day.completed) onViewResults(day);
      }}
      disabled={!day.completed || loadingResults}
    >
      <View style={styles.workoutHeaderRow}>
        <View style={styles.workoutHeaderLeft}>
          <View style={styles.dayBadge}>
            <Text style={styles.dayBadgeText}>Day {day.dayNumber}</Text>
          </View>
          <Text style={styles.workoutTitle} numberOfLines={1}>
            {day.title}
          </Text>
        </View>
        {day.completed ? (
          <Text style={styles.completedCheck}>✓</Text>
        ) : null}
      </View>

      {day.muscleGroups.length > 0 ? (
        <View style={styles.muscleRow}>
          {day.muscleGroups.map((mg) => (
            <View key={mg} style={styles.muscleChip}>
              <Text style={styles.muscleChipText}>{mg}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.exerciseList}>
        {visibleExercises.map((ex) => (
          <Text key={ex.name} style={styles.exerciseRow} numberOfLines={1}>
            {ex.sets}×{ex.reps} {ex.name}
          </Text>
        ))}
        {extraCount > 0 ? (
          <Text style={styles.moreExercises}>+{extraCount} more</Text>
        ) : null}
      </View>

      {day.completed ? (
        <View style={styles.donePill}>
          <Text style={styles.donePillText}>
            {loadingResults ? 'Loading…' : 'Done ✓'}
          </Text>
          {loadingResults ? (
            <ActivityIndicator
              size="small"
              color={Colors.success}
              style={styles.donePillSpinner}
            />
          ) : null}
        </View>
      ) : isNextWorkout ? (
        <TouchableOpacity
          style={styles.startButton}
          activeOpacity={0.8}
          onPress={() => onStartWorkout(day)}
        >
          <Text style={styles.startButtonText}>Start Workout →</Text>
        </TouchableOpacity>
      ) : null}
      {day.completed ? (
        <Text style={styles.viewResultsHint}>View results →</Text>
      ) : null}
    </TouchableOpacity>
  );
}

function RestDayCard({ day }: { day: PlanDay }) {
  return (
    <View style={styles.restCard}>
      <View style={styles.restHeaderRow}>
        <View style={styles.dayBadgeRest}>
          <Text style={styles.dayBadgeRestText}>Day {day.dayNumber}</Text>
        </View>
        <Text style={styles.restTitle}>Rest Day</Text>
      </View>
      <Text style={styles.restSubtitle}>
        Recovery day — no training scheduled
      </Text>
    </View>
  );
}

export default function PlanViewScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const planId = route.params?.planId ?? '';
  /** Canonical plan row UUID from Supabase (use for workout_logs / ActiveWorkout) */
  const [resolvedPlanId, setResolvedPlanId] = useState('');

  const [planData, setPlanData] = useState<LoadedPlan | null>(null);
  const [, setCompletedSet] = useState<Set<string>>(new Set());
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [rawPlanJson, setRawPlanJson] = useState<RawPlanJson | null>(null);
  const [resultsLoadingDayKey, setResultsLoadingDayKey] = useState<string | null>(null);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [selectedWorkoutLog, setSelectedWorkoutLog] = useState<WorkoutLog | null>(null);
  const [selectedExerciseMap, setSelectedExerciseMap] = useState<Record<string, string>>({});
  const [selectedPlanExercises, setSelectedPlanExercises] = useState<ExerciseObject[]>([]);
  const [selectedDayTitle, setSelectedDayTitle] = useState('');
  const [selectedCompletedDate, setSelectedCompletedDate] = useState('—');

  const loadPlanData = useCallback(async () => {
    setLoading(true);
    setError(false);
    setResolvedPlanId('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId || !planId) throw new Error('No session or planId');

      const trimmedPlanId = planId.trim();
      if (
        typeof trimmedPlanId !== 'string' ||
        trimmedPlanId.length < 10
      ) {
        throw new Error('Invalid planId');
      }

      const [planResult, activePlanResult] = await Promise.all([
        supabase
          .from('plans')
          .select('id, plan_json, current_week, total_weeks, title')
          .eq('id', trimmedPlanId)
          .single(),
        supabase
          .from('plans')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (planResult.error) throw planResult.error;
      const plan = planResult.data;
      const idForLogs =
        plan.id && String(plan.id).trim().length >= 10
          ? String(plan.id).trim()
          : trimmedPlanId;
      setResolvedPlanId(idForLogs);

      if (__DEV__) {
        const activeId = activePlanResult.data?.id
          ? String(activePlanResult.data.id).trim()
          : '';
        if (activeId && activeId !== idForLogs) {
          console.warn('[PlanView] Opened plan is not the active plan row', {
            openedPlanId: idForLogs,
            activePlanId: activeId,
          });
        }
      }

      const { data: logRows } = await supabase
        .from('workout_logs')
        .select('week_number, day_number')
        .eq('plan_id', idForLogs)
        .eq('user_id', userId);

      const planJson = (plan.plan_json ?? {}) as RawPlanJson;

      const logSet = new Set<string>(
        (logRows ?? []).map(
          (l: { week_number: number; day_number: number }) =>
            `${l.week_number}-${l.day_number}`,
        ),
      );

      const rawWeeks: RawWeek[] = planJson.weeks ?? [];
      const mappedWeeks: PlanWeek[] = rawWeeks.map((rw) => ({
        weekNumber: rw.weekNumber,
        phase: rw.phase,
        days: rw.days.map((rd) => ({
          dayNumber: rd.dayNumber,
          type: rd.type,
          title: rd.title ?? (rd.type === 'rest' ? 'Rest Day' : 'Workout'),
          muscleGroups: rd.muscleGroups ?? [],
          exercises: (rd.exercises ?? []).map((ex) => ({
            id: ex.id,
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
      setRawPlanJson(planJson);
      setCompletedSet(logSet);
      setSelectedWeek(currentWeek);
    } catch {
      setResolvedPlanId('');
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    loadPlanData();
  }, [loadPlanData]);

  const handleStartWorkout = (day: PlanDay) => {
    const pid =
      resolvedPlanId.length >= 10 ? resolvedPlanId : planId.trim();
    navigation.navigate('ActiveWorkout', {
      planId: pid,
      weekNumber: selectedWeek,
      dayNumber: day.dayNumber,
      workoutTitle: day.title,
    });
  };

  const handleViewResults = useCallback(
    async (day: PlanDay) => {
      const dayKey = `${selectedWeek}-${day.dayNumber}`;
      setResultsLoadingDayKey(dayKey);
      try {
        const tappedDayNumber = day.dayNumber;
        const modalPlanId =
          resolvedPlanId.length >= 10 ? resolvedPlanId : planId.trim();

        console.log('[PlanView modal fetch]', {
          planId: modalPlanId,
          weekNumber: selectedWeek,
          dayNumber: tappedDayNumber,
        });

        if (
          !modalPlanId ||
          typeof modalPlanId !== 'string' ||
          modalPlanId.length < 10
        ) {
          console.warn(
            '[PlanView] Invalid planId — cannot fetch results:',
            modalPlanId,
          );
          return;
        }

        if (__DEV__) {
          console.log('[QUERY workout_log]', {
            plan_id: modalPlanId,
            week_number: selectedWeek,
            day_number: tappedDayNumber,
          });
        }

        const { data: workoutLog } = await supabase
          .from('workout_logs')
          .select('*')
          .eq('plan_id', modalPlanId)
          .eq('week_number', selectedWeek)
          .eq('day_number', tappedDayNumber)
          .order('logged_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const wl = workoutLog as
          | { sets_json?: unknown; day_number?: number }
          | null;
        const setsParsed =
          typeof wl?.sets_json === 'string'
            ? (() => {
                try {
                  const p = JSON.parse(wl.sets_json as string) as unknown;
                  return Array.isArray(p) ? p.length : 0;
                } catch {
                  return 0;
                }
              })()
            : Array.isArray(wl?.sets_json)
              ? wl.sets_json.length
              : 0;

        console.log('[PlanView workout_log result]', {
          found: !!workoutLog,
          setsCount: setsParsed,
          dayNumberStored: wl?.day_number,
        });

        console.log('[workout_log fetch]', {
          planId: modalPlanId,
          weekNumber: selectedWeek,
          dayNumber: tappedDayNumber,
          logFound: !!workoutLog,
          rawSetsJson: wl?.sets_json,
          setsType: typeof wl?.sets_json,
        });

        const weekData = findRawWeek(rawPlanJson?.weeks, selectedWeek);
        const dayData = findRawDay(weekData?.days, day.dayNumber);
        let planExercises: ExerciseObject[] = (dayData?.exercises ?? []) as ExerciseObject[];

        console.log('[modal open]', {
          selectedWeek,
          tappedDayNumber,
          weekFound: !!weekData,
          dayFound: !!dayData,
          exerciseCount: planExercises.length,
        });

        if (planExercises.length === 0 && planData) {
          const pw = planData.weeks.find((w) => w.weekNumber === selectedWeek);
          const pd = pw?.days.find((d) => d.dayNumber === day.dayNumber);
          if (pd?.exercises?.length) {
            planExercises = pd.exercises.map((ex) => ({
              id: ex.id,
              name: ex.name,
              sets: ex.sets,
              reps: ex.reps,
            }));
          }
        }

        const exerciseMap: Record<string, string> = {};
        planExercises.forEach((ex) => {
          if (ex.id) exerciseMap[ex.id] = ex.name;
        });
        const setsJson = parseSetsJson((workoutLog as { sets_json?: unknown } | null)?.sets_json);
        console.log('[sets_json debug]', {
          totalSets: setsJson.length,
          uniqueExerciseIds: [...new Set(setsJson.map((s) => s.exerciseId))],
          planExerciseIds: planExercises.map((e) => e.id),
          firstSet: setsJson[0] ?? null,
        });

        setSelectedWorkoutLog((workoutLog as WorkoutLog | null) ?? null);
        setSelectedExerciseMap(exerciseMap);
        setSelectedPlanExercises(planExercises);
        setSelectedDayTitle(day.title);
        setSelectedCompletedDate(
          formatCompletedDate((workoutLog as { created_at?: string } | null)?.created_at),
        );
        setResultsVisible(true);
      } finally {
        setResultsLoadingDayKey(null);
      }
    },
    [planId, planData, rawPlanJson, resolvedPlanId, selectedWeek],
  );

  const headerRow = (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backHit}
        activeOpacity={0.7}
      >
        <Text style={styles.backChevron}>‹</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>My Plan</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {headerRow}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </View>
    );
  }

  if (error || !planData) {
    return (
      <View style={styles.container}>
        {headerRow}
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn&apos;t load plan</Text>
          <TouchableOpacity
            onPress={loadPlanData}
            style={styles.retryButton}
            activeOpacity={0.7}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const allWeekNumbers = Array.from(
    { length: planData.totalWeeks },
    (_, i) => i + 1,
  );
  const selectedWeekData = planData.weeks.find((w) => w.weekNumber === selectedWeek);
  const phaseDisplay = getPhaseDisplay(
    selectedWeekData?.phase,
    selectedWeek,
    planData.totalWeeks,
  );
  const weekData = selectedWeekData;
  const nextWorkoutDayNumber =
    weekData?.days.find((d) => d.type === 'workout' && !d.completed)
      ?.dayNumber ?? null;

  return (
    <View style={styles.container}>
      {headerRow}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.planInfoCard}>
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
            <View
              style={[styles.phasePill, { backgroundColor: phaseDisplay.bg }]}
            >
              <Text
                style={[styles.phasePillText, { color: phaseDisplay.color }]}
              >
                {phaseDisplay.label}
              </Text>
            </View>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.weekSelector}
          contentContainerStyle={styles.weekSelectorContent}
        >
          {allWeekNumbers.map((wn) => {
            const isSelected = wn === selectedWeek;
            const isLocked = wn > planData.currentWeek;
            const isCompletedWeek = wn < planData.currentWeek;
            const weekEntry = planData.weeks.find((w) => w.weekNumber === wn);
            const wPhase = getPhaseDisplay(weekEntry?.phase, wn, planData.totalWeeks);

            const tabStyles = [
              styles.weekTabCircle,
              isSelected && styles.weekTabSelected,
              !isSelected && isCompletedWeek && styles.weekTabCompleted,
              !isSelected && isLocked && styles.weekTabLocked,
            ];

            const textStyles = [
              styles.weekTabLabel,
              isSelected && styles.weekTabLabelSelected,
              !isSelected && isCompletedWeek && styles.weekTabLabelCompleted,
              !isSelected && isLocked && styles.weekTabLabelLocked,
            ];

            const dotStyle =
              isLocked
                ? styles.weekDotLocked
                : isCompletedWeek
                  ? styles.weekDotCompleted
                  : styles.weekDotActive;

            return (
              <TouchableOpacity
                key={wn}
                activeOpacity={0.7}
                style={styles.weekTabColumn}
                onPress={() => setSelectedWeek(wn)}
              >
                <View style={tabStyles}>
                  <Text style={textStyles}>W{wn}</Text>
                  <View style={[styles.weekStatusDot, dotStyle]} />
                </View>
                {!isLocked ? (
                  <Text
                    style={[
                      styles.weekPhaseLabel,
                      {
                        color: isSelected ? wPhase.color : Colors.textTertiary,
                      },
                    ]}
                  >
                    {wn % 4 === 0
                      ? 'DL'
                      : wPhase.label === 'BASELINE'
                        ? 'BL'
                        : wPhase.label === 'INTENSIFICATION'
                          ? 'INT'
                          : 'ACC'}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {weekData ? (
          weekData.days.map((day) =>
            day.type === 'workout' ? (
              <WorkoutDayCard
                key={day.dayNumber}
                day={day}
                isNextWorkout={day.dayNumber === nextWorkoutDayNumber}
                onStartWorkout={handleStartWorkout}
                onViewResults={handleViewResults}
                loadingResults={resultsLoadingDayKey === `${selectedWeek}-${day.dayNumber}`}
              />
            ) : (
              <RestDayCard key={day.dayNumber} day={day} />
            ),
          )
        ) : (
          <View style={styles.lockedWeekState}>
            <Text style={styles.lockedEmoji}>🔒</Text>
            <Text style={styles.lockedTitle}>Week {selectedWeek} Locked</Text>
            <Text style={styles.lockedSubtitle}>
              Complete Week {planData.currentWeek} to unlock
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.libraryLink}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('ExerciseLibrary')}
        >
          <Text style={styles.libraryLinkText}>
            Browse Exercise Library →
          </Text>
        </TouchableOpacity>
      </ScrollView>
      <WorkoutResultsModal
        visible={resultsVisible}
        onClose={() => setResultsVisible(false)}
        dayTitle={selectedDayTitle}
        completedDate={selectedCompletedDate}
        workoutLog={selectedWorkoutLog}
        exerciseMap={selectedExerciseMap}
        planExercises={selectedPlanExercises}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  retryButton: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: 10,
  },
  retryText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.semiBold,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 56,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.bgPrimary,
  },
  backHit: {
    marginRight: 12,
  },
  backChevron: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
  headerTitle: {
    fontSize: FontSizes.heading1,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },

  scrollView: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  scrollContent: {
    paddingBottom: 48,
  },

  planInfoCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  planTitle: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  pillRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  weekPill: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  weekPillText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  daysPill: {
    backgroundColor: Colors.bgElevated,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  daysPillText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
  },
  phasePill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  phasePillText: {
    fontSize: FontSizes.micro,
    fontFamily: Fonts.bold,
    letterSpacing: 0.8,
  },
  weekPhaseLabel: {
    fontSize: 8,
    fontFamily: Fonts.bold,
    marginTop: 3,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  weekSelector: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  weekSelectorContent: {
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  weekTabColumn: {
    alignItems: 'center',
  },
  weekTabCircle: {
    position: 'relative',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekTabSelected: {
    backgroundColor: Colors.accent,
  },
  weekTabCompleted: {
    borderWidth: 1,
    borderColor: Colors.success,
  },
  weekTabLocked: {
    opacity: 0.4,
  },
  weekTabLabel: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  weekTabLabelSelected: {
    color: Colors.textPrimary,
  },
  weekTabLabelCompleted: {
    color: Colors.success,
  },
  weekTabLabelLocked: {
    color: Colors.textTertiary,
  },
  weekStatusDot: {
    position: 'absolute',
    bottom: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  weekDotActive: {
    backgroundColor: Colors.accent,
  },
  weekDotCompleted: {
    backgroundColor: Colors.success,
  },
  weekDotLocked: {
    backgroundColor: Colors.divider,
  },

  workoutDayCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  workoutDayCardNext: {
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
  },
  workoutHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  workoutHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
    marginRight: Spacing.sm,
  },
  dayBadge: {
    backgroundColor: Colors.bgElevated,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  dayBadgeText: {
    fontSize: FontSizes.micro,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  workoutTitle: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    flex: 1,
  },
  completedCheck: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.success,
  },
  muscleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.md,
  },
  muscleChip: {
    backgroundColor: Colors.accentMuted,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  muscleChipText: {
    fontSize: FontSizes.micro,
    fontFamily: Fonts.medium,
    color: Colors.accent,
  },
  exerciseList: {
    marginBottom: Spacing.md,
  },
  exerciseRow: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 2,
  },
  moreExercises: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
    fontStyle: 'italic',
  },
  donePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.successMuted,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  donePillText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold,
    color: Colors.success,
  },
  donePillSpinner: {
    marginLeft: Spacing.xs,
  },
  viewResultsHint: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
  },
  startButton: {
    height: 46,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },

  restCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    backgroundColor: Colors.bgPrimary,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    opacity: 0.6,
  },
  restHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dayBadgeRest: {
    backgroundColor: Colors.bgElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  dayBadgeRestText: {
    fontSize: FontSizes.micro,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  restTitle: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
  },
  restSubtitle: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
  },

  lockedWeekState: {
    alignItems: 'center',
    paddingVertical: 80,
    marginHorizontal: Spacing.xl,
  },
  lockedEmoji: {
    fontSize: 48,
    marginBottom: Spacing.lg,
  },
  lockedTitle: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  lockedSubtitle: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  libraryLink: {
    marginTop: Spacing.xxl,
    marginBottom: Spacing.sm,
    alignItems: 'center',
  },
  libraryLinkText: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.medium,
    color: Colors.accent,
    textAlign: 'center',
  },
});

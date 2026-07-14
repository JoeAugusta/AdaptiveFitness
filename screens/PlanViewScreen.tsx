import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { Ionicons } from '@expo/vector-icons';
import { getSessionIntent } from '../utils/getSessionIntent';
import { useMetric } from '../utils/units';
import { getTodayDayLabel } from '../utils/dateUtils';
import WorkoutResultsModal, {
  type WorkoutLog,
  type ExerciseObject,
} from '../components/WorkoutResultsModal';
import WeekOverrideSheet from '../components/WeekOverrideSheet';
import {
  applyWeekOverride,
  clearWeekOverride,
} from '../utils/weekOverride';
import { getPhaseDisplay, normalizePhaseOverride } from '../utils/phaseDisplay';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'PlanView'>;
type RouteType = RouteProp<RootStackParamList, 'PlanView'>;

interface ExerciseSummary {
  id?: string;
  name: string;
  sets: number;
  reps: string;
  weight: number;
  targetRpe?: number;
}

interface PlanDay {
  dayNumber: number;
  type: 'workout' | 'rest' | 'cardio';
  title: string;
  muscleGroups: string[];
  exercises: ExerciseSummary[];
  completed: boolean;
  skipped?: boolean;
  sessionFocus?: string;
  rescheduledTo?: string;
  cardioType?: 'light' | 'medium';
  suggestedDurationMinutes?: number;
}

interface PlanWeek {
  weekNumber: number;
  phase?: string;
  days: PlanDay[];
  weekOverride?: any;
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
  goal?: string;
  split?: string;
  daysPerWeek?: number;
  title?: string;
  totalWeeks?: number;
  scheduledDays?: string[];
  enhancedRecovery?: boolean;
  biologicalSex?: string;
}

interface RawDay {
  dayNumber: number;
  type: 'workout' | 'rest' | 'cardio';
  title: string;
  muscleGroups?: string[];
  exercises?: RawExercise[];
  sessionFocus?: string;
  rescheduledTo?: string;
  cardioType?: 'light' | 'medium';
  suggestedDurationMinutes?: number;
}

interface RawWeek {
  weekNumber: number;
  phase?: string;
  days: RawDay[];
  weekOverride?: any;
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
  enhancedRecovery: boolean;
  biologicalSex: string;
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

function WorkoutDayCard({
  day,
  weekPhase,
  planSplit,
  onStartWorkout,
  isNextWorkout,
  isRecommended,
  isTodayCalendarDay,
  onViewResults,
  loadingResults,
  onPreviewDay,
  onRedoWorkout,
}: {
  day: PlanDay;
  weekPhase: string | undefined;
  planSplit: string | undefined;
  onStartWorkout: (day: PlanDay) => void;
  isNextWorkout: boolean;
  isRecommended: boolean;
  isTodayCalendarDay?: boolean;
  onViewResults: (day: PlanDay) => void;
  loadingResults: boolean;
  onPreviewDay?: (day: PlanDay) => void;
  onRedoWorkout?: (day: PlanDay) => void;
}) {
  const PREVIEW_COUNT = 3;
  const visibleExercises = day.exercises.slice(0, PREVIEW_COUNT);
  const extraCount = day.exercises.length - PREVIEW_COUNT;

  return (
    <TouchableOpacity
      style={[
        styles.workoutDayCard,
        isRecommended && !day.completed && styles.workoutDayCardNext,
        isTodayCalendarDay && styles.workoutDayCardToday,
      ]}
      activeOpacity={
        day.completed || (!isNextWorkout && onPreviewDay)
          ? 0.75
          : 1
      }
      onPress={() => {
        if (day.completed) {
          onViewResults(day);
        } else if (!isNextWorkout && onPreviewDay) {
          onPreviewDay(day);
        }
      }}
      disabled={
        loadingResults ||
        (isNextWorkout && !day.completed)
      }
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
          <Text style={[
            styles.completedCheck,
            day.skipped && styles.skippedCheck,
          ]}>
            {day.skipped ? '✗' : '✓'}
          </Text>
        ) : isRecommended ? (
          <View style={styles.nextUpBadge}>
            <Text style={styles.nextUpBadgeText}>NEXT UP</Text>
          </View>
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

      <Text style={styles.sessionIntent}>
        {(() => {
          const firstEx = day.exercises[0];
          if (firstEx && firstEx.weight > 0) {
            return `${firstEx.name} ${firstEx.sets}×${firstEx.reps} @ ${firstEx.weight} lbs`;
          }
          if (firstEx && firstEx.sets && firstEx.reps) {
            return `${firstEx.name} ${firstEx.sets}×${firstEx.reps}`;
          }
          return getSessionIntent(weekPhase, day.sessionFocus, planSplit);
        })()}
      </Text>

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
        <View style={[styles.donePill, day.skipped && styles.skippedPill]}>
          {loadingResults ? (
            <Text style={styles.donePillText}>Loading…</Text>
          ) : day.skipped ? (
            <View style={styles.donePillInner}>
              <Text style={styles.skippedPillText}>Skipped</Text>
              <Ionicons name="close" size={14} color={Colors.textTertiary} />
            </View>
          ) : (
            <View style={styles.donePillInner}>
              <Text style={styles.donePillText}>Done</Text>
              <Ionicons name="checkmark" size={14} color={Colors.success} />
            </View>
          )}
          {loadingResults ? (
            <ActivityIndicator
              size="small"
              color={Colors.success}
              style={styles.donePillSpinner}
            />
          ) : null}
        </View>
      ) : isNextWorkout ? (
        <View style={styles.startButtonRow}>
          <TouchableOpacity
            style={[
              styles.startButton,
              !isRecommended && styles.startButtonSecondary,
            ]}
            activeOpacity={0.8}
            onPress={() => {
              console.log('[StartWorkout button tapped]', {
                dayNumber: day.dayNumber,
                isNextWorkout,
                isRecommended,
              });
              onStartWorkout(day);
            }}
          >
            <Text
              style={[
                styles.startButtonText,
                !isRecommended && styles.startButtonSecondaryText,
              ]}
            >
              Start Workout →
            </Text>
          </TouchableOpacity>
          {onPreviewDay ? (
            <TouchableOpacity
              onPress={() => onPreviewDay(day)}
              activeOpacity={0.7}
              style={styles.previewInlineBtn}
            >
              <Text style={styles.previewInlineBtnText}>Preview</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {day.completed && !day.skipped ? (
        <View style={styles.completedActionsRow}>
          <Text style={styles.viewResultsHint}>View results →</Text>
          {onRedoWorkout ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onRedoWorkout(day);
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.redoWorkoutHint}>Redo →</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {!day.completed && !isNextWorkout ? (
        <Text style={styles.viewResultsHint}>Preview →</Text>
      ) : null}
    </TouchableOpacity>
  );
}

function RestDayCard({ day, isTodayCalendarDay }: { day: PlanDay; isTodayCalendarDay?: boolean }) {
  return (
    <View style={[styles.restCard, isTodayCalendarDay && styles.restCardToday]}>
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
  const { formatWorkoutWeight } = useMetric();
  const planId = route.params?.planId ?? '';
  const [resolvedPlanId, setResolvedPlanId] = useState('');

  const [planData, setPlanData] = useState<LoadedPlan | null>(null);
  const [, setCompletedSet] = useState<Set<string>>(new Set());
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [completedCardioDays, setCompletedCardioDays] = useState<Set<number>>(
    () => new Set(),
  );
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
  const [resultsSummaryGoal, setResultsSummaryGoal] = useState<string | undefined>(undefined);
  const [resultsSummaryWeek, setResultsSummaryWeek] = useState<number | undefined>(undefined);
  const [resultsSummaryPhase, setResultsSummaryPhase] = useState<string | undefined>(undefined);
  const [showOverrideSheet, setShowOverrideSheet] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewDay, setPreviewDay] = useState<PlanDay | null>(null);

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
          .maybeSingle(),
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
      if (!plan) {
        throw new Error('Plan not found');
      }
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
        .select('week_number, day_number, skipped')
        .eq('plan_id', idForLogs)
        .eq('user_id', userId);

      const planJson = (plan.plan_json ?? {}) as RawPlanJson;

      const logSet = new Set<string>(
        (logRows ?? []).map(
          (l: { week_number: number; day_number: number }) =>
            `${l.week_number}-${l.day_number}`,
        ),
      );
      const skippedSet = new Set<string>(
        (logRows ?? [])
          .filter((l: { skipped?: boolean }) => l.skipped === true)
          .map(
            (l: { week_number: number; day_number: number }) =>
              `${l.week_number}-${l.day_number}`,
          ),
      );

      const rawWeeks: RawWeek[] = planJson.weeks ?? [];
      const mappedWeeks: PlanWeek[] = rawWeeks.map((rw) => ({
        weekNumber: rw.weekNumber,
        phase: rw.phase,
        weekOverride: rw.weekOverride,
        days: rw.days.map((rd) => ({
          dayNumber: rd.dayNumber,
          type: rd.type,
          title:
            rd.title ??
            (rd.type === 'rest'
              ? 'Rest Day'
              : rd.type === 'cardio'
                ? 'Cardio'
                : 'Workout'),
          muscleGroups: rd.muscleGroups ?? [],
          exercises: (rd.exercises ?? []).map((ex) => ({
            id: ex.id,
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            weight: ex.targetWeight ?? 0,
          })),
          completed: logSet.has(`${rw.weekNumber}-${rd.dayNumber}`),
          skipped: skippedSet.has(`${rw.weekNumber}-${rd.dayNumber}`),
          sessionFocus: rd.sessionFocus,
          rescheduledTo: rd.rescheduledTo ?? undefined,
          cardioType: rd.cardioType,
          suggestedDurationMinutes: rd.suggestedDurationMinutes,
        })),
      }));

      const currentWeek: number = plan.current_week ?? 1;

      setPlanData({
        title: plan.title ?? planJson.title ?? 'My Plan',
        currentWeek,
        totalWeeks: plan.total_weeks ?? planJson.totalWeeks ?? 12,
        daysPerWeek: planJson.daysPerWeek ?? 4,
        weeks: mappedWeeks,
        enhancedRecovery: planJson.enhancedRecovery === true,
        biologicalSex: planJson.biologicalSex ?? 'male',
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

  useFocusEffect(
    useCallback(() => {
      void loadPlanData();
    }, [loadPlanData]),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!resolvedPlanId || resolvedPlanId.length < 10) {
        setCompletedCardioDays(new Set());
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        setCompletedCardioDays(new Set());
        return;
      }
      const { data: cardioLogs, error } = await supabase
        .from('cardio_logs')
        .select('day_number, week_number')
        .eq('plan_id', resolvedPlanId)
        .eq('user_id', userId)
        .eq('week_number', selectedWeek);
      if (cancelled) return;
      if (error) {
        if (__DEV__) console.warn('[PlanView] cardio_logs', error);
        setCompletedCardioDays(new Set());
        return;
      }
      const rows = (cardioLogs ?? []) as { day_number: number }[];
      setCompletedCardioDays(
        new Set(rows.map((l) => Number(l.day_number))),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedPlanId, selectedWeek]);

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
        setResultsSummaryGoal(
          rawPlanJson && typeof rawPlanJson.goal === 'string'
            ? rawPlanJson.goal
            : undefined,
        );
        setResultsSummaryWeek(selectedWeek);
        setResultsSummaryPhase(
          typeof weekData?.phase === 'string' ? weekData.phase : undefined,
        );
        setResultsVisible(true);
      } finally {
        setResultsLoadingDayKey(null);
      }
    },
    [planId, planData, rawPlanJson, resolvedPlanId, selectedWeek],
  );

  const handlePreviewDay = useCallback((day: PlanDay) => {
    setPreviewDay(day);
    setPreviewVisible(true);
  }, []);

  const handleRedoWorkout = useCallback((day: PlanDay) => {
    const pid = resolvedPlanId.length >= 10 ? resolvedPlanId : planId.trim();
    Alert.alert(
      'Redo this session?',
      'Your logged sets, weights, and RPE for this session will be replaced. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Redo',
          onPress: () => {
            navigation.navigate('ActiveWorkout', {
              planId: pid,
              weekNumber: selectedWeek,
              dayNumber: day.dayNumber,
              workoutTitle: day.title,
              lockToRouteWeek: true,
            });
          },
        },
      ],
    );
  }, [resolvedPlanId, planId, navigation, selectedWeek]);

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
    normalizePhaseOverride(selectedWeekData?.weekOverride),
  );
  const weekData = selectedWeekData;

  const todayCalendarDayNumber = (() => {
    if (!weekData || !rawPlanJson?.scheduledDays || !Array.isArray(rawPlanJson.scheduledDays)) {
      return null;
    }
    const allDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayLabel = allDays[new Date().getDay()];
    const scheduledDays = rawPlanJson.scheduledDays as string[];
    if (scheduledDays.length === 0) return null;
    const firstScheduledIdx = allDays.indexOf(scheduledDays[0].trim().slice(0, 3));
    if (firstScheduledIdx < 0) return null;
    const ordered = [...weekData.days].sort((a, b) => a.dayNumber - b.dayNumber);
    const dayNumberToLabel: Record<number, string> = {};
    ordered.forEach((day, idx) => {
      const calendarIdx = (firstScheduledIdx + idx) % 7;
      dayNumberToLabel[day.dayNumber] = allDays[calendarIdx];
    });
    const match = ordered.find((d) => dayNumberToLabel[d.dayNumber] === todayLabel);
    return match?.dayNumber ?? null;
  })();

  // Under the open model: any unlogged session in the current week
  // can be started any day. nextWorkoutDayNumber is now used only
  // to identify which card to visually highlight as "next up."
  // All unlogged cards get a Start button regardless.
  const nextWorkoutDayNumber = (() => {
    if (!weekData) return null;
    if (selectedWeek > planData.currentWeek) return null;

    const workoutDays = weekData.days.filter((d) => d.type === 'workout');
    const completedWorkoutDays = workoutDays.filter((d) => d.completed);
    const daysPerWeek = planData.daysPerWeek;

    if (completedWorkoutDays.length >= daysPerWeek) return null;

    const unloggedDays = workoutDays
      .filter((d) => !d.completed)
      .sort((a, b) => a.dayNumber - b.dayNumber);

    if (unloggedDays.length === 0) return null;

    // Option C: prefer today's calendar day if it is an unlogged workout,
    // fall back to first unlogged in sequence (rest days, no schedule, etc.)
    if (todayCalendarDayNumber != null) {
      const todayIsUnloggedWorkout = unloggedDays.find(
        (d) => d.dayNumber === todayCalendarDayNumber,
      );
      if (todayIsUnloggedWorkout) return todayCalendarDayNumber;
    }

    // Fall back to first unlogged in sequence
    return unloggedDays[0]?.dayNumber ?? null;
  })();

  const recommendedDay = weekData?.days.find(
    (d) => d.dayNumber === nextWorkoutDayNumber && d.type === 'workout',
  ) ?? null;

  const handleStartWorkout = (day: PlanDay) => {
    console.log('[handleStartWorkout]', {
      dayNumber: day.dayNumber,
      dayTitle: day.title,
      recommendedDayNumber: recommendedDay?.dayNumber ?? null,
      isOutOfOrder:
        recommendedDay != null &&
        day.dayNumber !== recommendedDay.dayNumber,
      nextWorkoutDayNumber,
    });
    const pid = resolvedPlanId.length >= 10 ? resolvedPlanId : planId.trim();

    const isOutOfOrder =
      recommendedDay != null &&
      day.dayNumber !== recommendedDay.dayNumber;

    const startNow = () => {
      navigation.navigate('ActiveWorkout', {
        planId: pid,
        weekNumber: planData!.currentWeek,
        dayNumber: day.dayNumber,
        workoutTitle: day.title,
        lockToRouteWeek: true,
      });
    };

    if (isOutOfOrder) {
      if (Platform.OS === 'web') {
        // Alert.alert is a no-op on web — use native confirm instead
        const proceed = window.confirm(
          `Day ${recommendedDay.dayNumber} (${recommendedDay.title}) is your next scheduled session. Start Day ${day.dayNumber} out of order anyway?`
        );
        if (proceed) startNow();
        return;
      }
      Alert.alert(
        'Out of order',
        `Day ${recommendedDay.dayNumber} (${recommendedDay.title}) is your next scheduled session. Sessions are programmed in sequence — doing them out of order can affect your progression.\n\nYou can still start Day ${day.dayNumber} now if needed.`,
        [
          {
            text: `Start Day ${day.dayNumber} anyway`,
            onPress: startNow,
          },
          {
            text: `Go to Day ${recommendedDay.dayNumber}`,
            style: 'cancel',
            onPress: () => {
              navigation.navigate('ActiveWorkout', {
                planId: pid,
                weekNumber: planData!.currentWeek,
                dayNumber: recommendedDay.dayNumber,
                workoutTitle: recommendedDay.title,
                lockToRouteWeek: true,
              });
            },
          },
        ],
      );
      return;
    }

    startNow();
  };

  const handleApplyDeload = async () => {
    setShowOverrideSheet(false);
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    const pid = resolvedPlanId.length >= 10 ? resolvedPlanId : planId.trim();
    const res = await applyWeekOverride({
      userId: uid,
      planId: pid,
      currentWeekNumber: selectedWeek,
      type: 'deload',
    });
    if (!res.ok) {
      Alert.alert('Could not apply deload', res.reason ?? 'Unknown error');
      return;
    }
    void loadPlanData();
  };

  const handleApplyTravel = async (equipment: string[]) => {
    setShowOverrideSheet(false);
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    const pid = resolvedPlanId.length >= 10 ? resolvedPlanId : planId.trim();
    const res = await applyWeekOverride({
      userId: uid,
      planId: pid,
      currentWeekNumber: selectedWeek,
      type: 'travel',
      equipment,
    });
    if (!res.ok) {
      Alert.alert('Could not apply travel mode', res.reason ?? 'Unknown error');
      return;
    }
    void loadPlanData();
  };

  const handleUndoOverride = async () => {
    const pid = resolvedPlanId.length >= 10 ? resolvedPlanId : planId.trim();
    const res = await clearWeekOverride({
      planId: pid,
      currentWeekNumber: selectedWeek,
    });
    if (!res.ok) {
      Alert.alert('Could not undo override');
      return;
    }
    void loadPlanData();
  };

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
                Week {selectedWeek} of {planData.totalWeeks}
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

          {selectedWeek === planData.currentWeek && (
            selectedWeekData?.weekOverride ? (
              <View style={styles.overrideStatusRow}>
                <Ionicons
                  name={
                    selectedWeekData.weekOverride.type === 'travel'
                      ? 'airplane-outline'
                      : 'battery-half-outline'
                  }
                  size={16}
                  color={Colors.textSecondary}
                />
                <Text style={styles.overrideStatusText}>
                  {selectedWeekData.weekOverride.type === 'travel'
                    ? `Traveling · ${(selectedWeekData.weekOverride.equipment ?? []).join(', ')}`
                    : 'Deload active'}
                </Text>
                <TouchableOpacity onPress={handleUndoOverride}>
                  <Text style={styles.overrideUndoText}>Undo</Text>
                </TouchableOpacity>
              </View>
            ) : nextWorkoutDayNumber !== null ? (
              <TouchableOpacity
                style={styles.overrideBtn}
                activeOpacity={0.75}
                onPress={() => setShowOverrideSheet(true)}
              >
                <Text style={styles.overrideBtnText}>
                  Change this week
                </Text>
              </TouchableOpacity>
            ) : null
          )}
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
            const wPhase = getPhaseDisplay(
              weekEntry?.phase,
              wn,
              planData.totalWeeks,
              normalizePhaseOverride(weekEntry?.weekOverride),
            );

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
                    {wPhase.label === 'DELOAD'
                      ? 'DL'
                      : wPhase.label === 'TRAVEL'
                        ? 'TRV'
                        : wPhase.label === 'BASELINE'
                          ? 'BL'
                          : wPhase.label === 'INTENSITY'
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
                weekPhase={weekData.phase}
                planSplit={rawPlanJson?.split}
                isNextWorkout={
                  selectedWeek === planData.currentWeek && !day.completed
                }
                isRecommended={
                  day.dayNumber === nextWorkoutDayNumber
                }
                isTodayCalendarDay={day.dayNumber === todayCalendarDayNumber && day.dayNumber !== nextWorkoutDayNumber}
                onStartWorkout={handleStartWorkout}
                onViewResults={handleViewResults}
                loadingResults={resultsLoadingDayKey === `${selectedWeek}-${day.dayNumber}`}
                onPreviewDay={handlePreviewDay}
                onRedoWorkout={handleRedoWorkout}
              />
            ) : day.type === 'cardio' ? (
              (() => {
                const isCardioDone = completedCardioDays.has(day.dayNumber);
                return (
                  <View
                    key={day.dayNumber}
                    style={[
                      styles.cardioDayRow,
                      isCardioDone && styles.cardioDayRowDone,
                    ]}
                  >
                    <View style={styles.cardioDayLeft}>
                      <Text style={styles.cardioDayNum}>Day {day.dayNumber}</Text>
                      <Text style={styles.cardioDayTitle}>
                        <Ionicons name="walk-outline" size={24} color={Colors.textSecondary} />{' '}
                        {day.title ?? 'Cardio'}
                      </Text>
                      <Text style={styles.cardioDaySub}>
                        {day.suggestedDurationMinutes ?? 30} min ·{' '}
                        {day.cardioType === 'light'
                          ? 'Zone 2 — comfortable pace'
                          : 'Moderate steady-state'}
                      </Text>
                    </View>
                    <View style={styles.cardioDayRight}>
                      {isCardioDone ? (
                        <View style={styles.cardioDoneBadge}>
                          <Text style={styles.cardioDoneBadgeText}>Done ✓</Text>
                        </View>
                      ) : (
                        <View style={styles.cardioTypePill}>
                          <Text style={styles.cardioTypePillText}>
                            {day.cardioType === 'medium'
                              ? 'STEADY-STATE'
                              : 'LIGHT CARDIO'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })()
            ) : (
              <RestDayCard key={day.dayNumber} day={day} isTodayCalendarDay={day.dayNumber === todayCalendarDayNumber} />
            ),
          )
        ) : (
          <View style={styles.lockedWeekState}>
            <Ionicons name="lock-closed-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.lockedTitle}>Week {selectedWeek} Locked</Text>
            <Text style={styles.lockedSubtitle}>
              Complete Week {planData.currentWeek} to unlock
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.historyLink}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('WorkoutHistory')}
        >
          <Ionicons name="time-outline" size={16} color={Colors.accent} />
          <Text style={styles.historyLinkText}>History</Text>
          <Ionicons
            name="chevron-forward-outline"
            size={14}
            color={Colors.accent}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.extraWorkCard}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('FreeSession' as never)}
        >
          <Text style={styles.extraWorkCardLabel}>EXTRA WORK</Text>
          <Text style={styles.extraWorkCardText}>
            Train outside your plan. Jordan tracks it →
          </Text>
        </TouchableOpacity>

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
        summaryPlanGoal={resultsSummaryGoal}
        summaryWeek={resultsSummaryWeek}
        summaryPlanPhase={resultsSummaryPhase}
      />
      <WeekOverrideSheet
        visible={showOverrideSheet}
        onClose={() => setShowOverrideSheet(false)}
        onApplyDeload={handleApplyDeload}
        onApplyTravel={handleApplyTravel}
      />

      <Modal
        visible={previewVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPreviewVisible(false)}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: Colors.bgPrimary }}
          edges={['top']}
        >
          <View style={styles.previewHeader}>
            <TouchableOpacity
              onPress={() => setPreviewVisible(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name="close"
                size={24}
                color={Colors.textSecondary}
              />
            </TouchableOpacity>
            <Text style={styles.previewTitle}>
              {previewDay?.title ?? 'Workout Preview'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.previewScroll}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.previewSubtitle}>
              {previewDay?.sessionFocus ?? ''}
            </Text>

            {(previewDay?.exercises ?? []).map((ex, i) => (
              <View key={ex.id ?? i} style={styles.previewExerciseRow}>
                <View style={styles.previewExerciseLeft}>
                  <Text style={styles.previewExerciseName}>
                    {ex.name}
                  </Text>
                  <Text style={styles.previewExerciseMeta}>
                    {ex.sets}×{ex.reps}
                    {ex.weight > 0
                      ? ` @ ${formatWorkoutWeight(ex.weight)}`
                      : ' — self-select weight'}
                    {(ex.targetRpe ?? 0) > 0 ? ` · RPE ${ex.targetRpe}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    flexShrink: 1,
  },
  phasePillText: {
    fontSize: FontSizes.micro,
    fontFamily: Fonts.bold,
    letterSpacing: 0.3,
    flexShrink: 1,
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
  workoutDayCardToday: {
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
  skippedCheck: {
    color: Colors.textTertiary,
  },
  nextUpBadge: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  nextUpBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.accent,
    letterSpacing: 1,
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
  sessionIntent: {
    fontFamily: Fonts.italic,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 6,
    marginBottom: 2,
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
  donePillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  donePillSpinner: {
    marginLeft: Spacing.xs,
  },
  skippedPill: {
    backgroundColor: Colors.bgElevated,
  },
  skippedPillText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold,
    color: Colors.textTertiary,
  },
  viewResultsHint: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
  },
  completedActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  redoWorkoutHint: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.medium,
    color: Colors.accent,
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
  startButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  startButtonSecondaryText: {
    color: Colors.textSecondary,
  },
  startButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  previewInlineBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  previewInlineBtnText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
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
  restCardToday: {
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
    opacity: 1,
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
  cardioDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  cardioDayLeft: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  cardioDayNum: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginBottom: 2,
  },
  cardioDayTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  cardioDaySub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  cardioDayRight: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  cardioDayRowDone: {
    opacity: 0.7,
  },
  cardioDoneBadge: {
    backgroundColor: Colors.successMuted,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  cardioDoneBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.success,
  },
  cardioTypePill: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  cardioTypePillText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.accent,
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
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  historyLinkText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  extraWorkCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  extraWorkCardLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  extraWorkCardText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
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
  overrideStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  overrideStatusText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  overrideUndoText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  overrideBtn: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  overrideBtnText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  previewTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  previewScroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: 48,
  },
  previewSubtitle: {
    fontFamily: Fonts.italic,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  previewExerciseRow: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  previewExerciseLeft: {
    flex: 1,
  },
  previewExerciseName: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  previewExerciseMeta: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
});
// Requires: npx expo install expo-haptics
import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  TouchableWithoutFeedback,
  TextInput,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  AppState,
  type DimensionValue,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import ExerciseCard, {
  WARMUP_COLLAPSED_STORAGE_KEY,
} from '../components/ExerciseCard';
import type { LoggedSet, CompoundTier } from '../components/ExerciseCard';
import {
  EXERCISES,
  getCuesForExerciseName,
  isExerciseUnilateral,
  type Exercise,
} from '../constants/exerciseLibrary';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import {
  cancelRestTimerNotification,
  playRestCompleteSound,
  scheduleRestCompleteNotification,
} from '../utils/restTimerAlerts';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'ActiveWorkout'>;
type RouteType = RouteProp<RootStackParamList, 'ActiveWorkout'>;

const FATIGUE_OPTIONS = [
  { rating: 1, emoji: '😴', label: 'Wiped' },
  { rating: 2, emoji: '😓', label: 'Tired' },
  { rating: 3, emoji: '😊', label: 'Good' },
  { rating: 4, emoji: '💪', label: 'Strong' },
  { rating: 5, emoji: '🔥', label: 'Beast Mode' },
];

type ExerciseSet = {
  setNumber: number;
  targetReps: string;
  targetWeight: number;
  targetRpe: number;
};

type WorkoutExercise = {
  id: string;
  name: string;
  muscleGroup: string;
  usesWeight: boolean;
  isUnilateral: boolean;
  planCategory: 'compound' | 'isolation';
  compoundTier: CompoundTier;
  /** Passed to ExerciseCard warmup logic (library / plan tier) */
  category: CompoundTier;
  movementPattern?: string;
  targetWeight: number;
  reps: string;
  sets: ExerciseSet[];
  alternatives: string[];
  cues: string[];
  /** From plan_json exercise; rest timer uses this when set */
  restSeconds?: number;
  /** GAP-5: Power-hypertrophy session phase tagging */
  phase?: 'strength' | 'hypertrophy';
  /** Selection reasoning from plan_json (GAP-6) */
  coachingNote?: string;
};

type WorkoutData = {
  title: string;
  goal: string;
  exercises: WorkoutExercise[];
};

const MOCK_WORKOUT_EXERCISES_BASE: Omit<WorkoutExercise, 'cues'>[] = [
  {
    id: 'ex_bench',
    name: 'Barbell Bench Press',
    muscleGroup: 'Chest',
    usesWeight: true,
    isUnilateral: false,
    planCategory: 'compound',
    compoundTier: 'primary_compound',
    category: 'primary_compound',
    movementPattern: 'horizontal_push',
    targetWeight: 265,
    reps: '8–10',
    sets: [
      { setNumber: 1, targetReps: '8–10', targetWeight: 265, targetRpe: 7 },
      { setNumber: 2, targetReps: '8–10', targetWeight: 265, targetRpe: 7 },
      { setNumber: 3, targetReps: '8–10', targetWeight: 265, targetRpe: 8 },
    ],
    alternatives: ['Incline DB Press', 'Cable Fly', 'Machine Chest Press'],
  },
  {
    id: 'ex_ohp',
    name: 'Overhead Press',
    muscleGroup: 'Shoulders',
    usesWeight: true,
    isUnilateral: false,
    planCategory: 'compound',
    compoundTier: 'primary_compound',
    category: 'primary_compound',
    movementPattern: 'vertical_push',
    targetWeight: 75,
    reps: '8–10',
    sets: [
      { setNumber: 1, targetReps: '8–10', targetWeight: 75, targetRpe: 7 },
      { setNumber: 2, targetReps: '8–10', targetWeight: 75, targetRpe: 7 },
      { setNumber: 3, targetReps: '8–10', targetWeight: 75, targetRpe: 8 },
    ],
    alternatives: ['DB Shoulder Press', 'Arnold Press', 'Landmine Press'],
  },
  {
    id: 'ex_tricep',
    name: 'Tricep Pushdown',
    muscleGroup: 'Triceps',
    usesWeight: true,
    isUnilateral: false,
    planCategory: 'isolation',
    compoundTier: 'isolation',
    category: 'isolation',
    movementPattern: 'isolation_push',
    targetWeight: 50,
    reps: '10–12',
    sets: [
      { setNumber: 1, targetReps: '10–12', targetWeight: 50, targetRpe: 7 },
      { setNumber: 2, targetReps: '10–12', targetWeight: 50, targetRpe: 7 },
      { setNumber: 3, targetReps: '10–12', targetWeight: 50, targetRpe: 8 },
    ],
    alternatives: [
      'Skull Crushers',
      'Overhead Tricep Extension',
      'Close-grip Bench',
    ],
  },
];

const MOCK_WORKOUT: WorkoutData = {
  title: 'Push Day A',
  goal: 'strength',
  exercises: MOCK_WORKOUT_EXERCISES_BASE.map((e) => ({
    ...e,
    cues: getCuesForExerciseName(e.name),
  })),
};

type PlanJsonExercise = {
  id: string;
  name: string;
  muscleGroup: string;
  sets: number;
  reps: string;
  targetWeight: number;
  targetRpe: number;
  category?: 'compound' | 'isolation';
  compoundTier?: CompoundTier;
  restSeconds?: number;
  coachingNote?: string;
  phase?: 'strength' | 'hypertrophy';
  equipment?: Exercise['equipment'];
};

type EnrichedPlanExercise = {
  plan: PlanJsonExercise;
  compoundTierResolved: CompoundTier;
  movementPatternResolved: string | undefined;
  planCategoryResolved: 'compound' | 'isolation';
  usesWeightFromLibrary: boolean;
  isUnilateral: boolean;
  cuesResolved: string[];
};

function enrichExerciseWithLibraryData(
  planExercise: PlanJsonExercise,
): EnrichedPlanExercise {
  const name = String(planExercise.name ?? '').toLowerCase().trim();

  // 1. Exact match
  let libraryExercise = EXERCISES.find(
    (e) => e.name.toLowerCase().trim() === name,
  );

  // 2. Plural strip — "Barbell Rows" → "Barbell Row"
  if (!libraryExercise && name.endsWith('s')) {
    const singular = name.slice(0, -1);
    libraryExercise = EXERCISES.find(
      (e) => e.name.toLowerCase().trim() === singular,
    );
  }

  // 3. Partial match — exercise name contains library name or vice versa
  if (!libraryExercise) {
    libraryExercise = EXERCISES.find((e) => {
      const libName = e.name.toLowerCase().trim();
      return name.includes(libName) || libName.includes(name);
    });
  }

  if (!libraryExercise) {
    if (__DEV__) {
      console.warn(`[enrichExercise] No library match for: ${planExercise.name}`);
    }
    return {
      plan: planExercise,
      compoundTierResolved: 'secondary_compound',
      movementPatternResolved: 'horizontal_push',
      planCategoryResolved: 'compound',
      // Default weighted when unknown; targetWeight === 0 is self-select, not BW
      usesWeightFromLibrary: true,
      isUnilateral: isExerciseUnilateral(planExercise.name),
      cuesResolved: getCuesForExerciseName(planExercise.name),
    };
  }

  return {
    plan: {
      ...planExercise,
      equipment: planExercise.equipment ?? libraryExercise.equipment,
    },
    compoundTierResolved:
      planExercise.compoundTier ?? libraryExercise.compoundTier,
    movementPatternResolved: libraryExercise.movementPattern,
    planCategoryResolved:
      planExercise.category ?? libraryExercise.category,
    usesWeightFromLibrary: libraryExercise.usesWeight,
    isUnilateral: libraryExercise.isUnilateral,
    cuesResolved: [...libraryExercise.cues],
  };
}

function parseSetsJson(rawSets: LoggedSet[] | string | null | undefined): LoggedSet[] {
  if (typeof rawSets === 'string') {
    try {
      const parsed = JSON.parse(rawSets) as unknown;
      return Array.isArray(parsed) ? (parsed as LoggedSet[]) : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(rawSets) ? rawSets : [];
}

/** Match plan exercise.id to last week sets_json (ids can drift across plan generations). */
function getPreviousSetsForExercise(
  previousSetsMap: Record<string, LoggedSet[]>,
  exerciseId: string,
  exerciseName: string,
): LoggedSet[] {
  const direct = previousSetsMap[exerciseId];
  if (direct && direct.length > 0) return direct;
  const nameLower = exerciseName.toLowerCase().trim();
  for (const sets of Object.values(previousSetsMap)) {
    const s0 = sets[0];
    if (!s0) continue;
    const en =
      s0.exerciseName ??
      (s0 as LoggedSet & { name?: string }).name;
    if (typeof en === 'string' && en.toLowerCase().trim() === nameLower) {
      return sets;
    }
  }
  return [];
}

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/** MM:SS for rest countdown display */
function formatRestCountdown(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function resolveRestDurationSeconds(exercise: WorkoutExercise): number {
  // GAP-5: Phase 1 strength compounds always get 240s (within 180-300s range)
  if (exercise.phase === 'strength') return 240;
  const n = exercise.restSeconds;
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
    return Math.round(n);
  }
  if (exercise.planCategory === 'compound') return 180;
  if (exercise.planCategory === 'isolation') return 90;
  return 120;
}

export default function ActiveWorkoutScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const params = route.params;
  const preSessionMessage = params.preSessionMessage ?? null;
  const sessionStartedAt = useRef(new Date()).current;

  // Workout data
  const [workout, setWorkout] = useState<WorkoutData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [workoutExperience, setWorkoutExperience] = useState<
    'beginner' | 'intermediate' | 'advanced'
  >('intermediate');

  // Session state
  const [sets, setSets] = useState<LoggedSet[]>([]);
  const [previousSetsMap, setPreviousSetsMap] = useState<Record<string, LoggedSet[]>>({});
  const [exerciseSwaps, setExerciseSwaps] = useState<Record<string, string>>(
    {},
  );
  const [coachingNotes, setCoachingNotes] = useState<
    Record<string, string | null>
  >({});
  const [coachingLoading, setCoachingLoading] = useState<
    Record<string, boolean>
  >({});

  // Timers
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [restSeconds, setRestSeconds] = useState(0);
  const [restDurationTotal, setRestDurationTotal] = useState(90);
  const [isRestActive, setIsRestActive] = useState(false);
  const restSubtextOpacity = useRef(new Animated.Value(0)).current;

  // Fatigue check-in
  const [showFatigueSheet, setShowFatigueSheet] = useState(false);
  const [fatigueRating, setFatigueRating] = useState<number | null>(null);
  const fatigueEmojiScales = useRef(
    FATIGUE_OPTIONS.map(() => new Animated.Value(1)),
  ).current;

  useEffect(() => {
    const anims = FATIGUE_OPTIONS.map((opt, i) =>
      Animated.timing(fatigueEmojiScales[i], {
        toValue: fatigueRating === opt.rating ? 1.15 : 1,
        duration: 150,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    Animated.parallel(anims).start();
  }, [fatigueRating]);
  const [sessionNotes, setSessionNotes] = useState('');
  const [showPreSessionModal, setShowPreSessionModal] = useState(
    () => !!preSessionMessage,
  );

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [warmupCollapsedCompound, setWarmupCollapsedCompound] = useState(false);
  /** DB row id — use for workout_logs so it always matches the loaded plan row */
  const [resolvedPlanId, setResolvedPlanId] = useState<string | null>(null);
  /** Same plan_id / day_number as INSERT — must match plan_json DayObject.dayNumber */
  const [sessionPlanIdForLogs, setSessionPlanIdForLogs] = useState<string | null>(
    null,
  );
  const [sessionDayNumber, setSessionDayNumber] = useState<number | null>(null);

  // Load workout data
  useEffect(() => {
    loadWorkoutData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setWarmupCollapsedCompound(false);
    setResolvedPlanId(null);
    setSessionPlanIdForLogs(null);
    setSessionDayNumber(null);
    void AsyncStorage.removeItem(WARMUP_COLLAPSED_STORAGE_KEY);
  }, [params.planId, params.weekNumber, params.dayNumber]);

  const getAlternatives = (muscleGroup: string): string[] => {
    const map: Record<string, string[]> = {
      Chest: ['Incline DB Press', 'Cable Fly', 'Machine Chest Press'],
      Back: ['Cable Row', 'DB Row', 'Chest-Supported Row'],
      Legs: ['Leg Press', 'Hack Squat', 'DB Lunges'],
      Shoulders: ['DB Shoulder Press', 'Arnold Press', 'Landmine Press'],
      Arms: ['Preacher Curl', 'Hammer Curl', 'Cable Curl'],
      Triceps: ['Overhead Tricep Extension', 'Cable Pushdown', 'Close-grip Bench'],
      Biceps: ['Preacher Curl', 'Hammer Curl', 'Incline DB Curl'],
      Glutes: ['Hip Thrust', 'Cable Kickback', 'Bulgarian Split Squat'],
      Hamstrings: ['Leg Curl', 'Nordic Curl', 'Stiff-leg Deadlift'],
      Calves: ['Seated Calf Raise', 'Leg Press Calf Raise', 'Single-leg Calf Raise'],
      Core: ['Plank', 'Cable Crunch', 'Ab Wheel'],
    };
    return map[muscleGroup] ?? ['Alternative Exercise 1', 'Alternative Exercise 2', 'Alternative Exercise 3'];
  };

  const buildWorkoutFromMock = (): WorkoutData => {
    setIsLoading(false);
    return MOCK_WORKOUT;
  };

  const loadWorkoutData = async () => {
    try {
      console.log('[ActiveWorkout] planId from params:', params.planId);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      let workoutTrainingAge: 'beginner' | 'intermediate' | 'advanced' =
        'intermediate';
      if (userId) {
        const { data: profileRow } = await supabase
          .from('user_profiles')
          .select('training_age')
          .eq('user_id', userId)
          .maybeSingle();
        const ta = profileRow?.training_age;
        if (ta === 'beginner' || ta === 'intermediate' || ta === 'advanced') {
          workoutTrainingAge = ta;
        }
      }
      setWorkoutExperience(workoutTrainingAge);

      if (params.planId === 'mock') {
        setResolvedPlanId(null);
        setSessionPlanIdForLogs(null);
        setSessionDayNumber(null);
        setWorkout(buildWorkoutFromMock());
        setPreviousSetsMap({});
        return;
      }

      const rawPlanId =
        typeof params.planId === 'string' ? params.planId.trim() : '';
      const planIdValid =
        typeof rawPlanId === 'string' &&
        rawPlanId.length >= 10 &&
        rawPlanId !== 'mock';

      if (!planIdValid) {
        console.warn(
          '[ActiveWorkout] Invalid planId — skipping previous log & using mock:',
          params.planId,
        );
        setResolvedPlanId(null);
        setSessionPlanIdForLogs(null);
        setSessionDayNumber(null);
        setPreviousSetsMap({});
        setWorkout(buildWorkoutFromMock());
        return;
      }

      const planResult = await supabase
        .from('plans')
        .select('id, plan_json, current_week')
        .eq('id', rawPlanId)
        .single();

      const { data: plan, error } = planResult;

      console.log('[ActiveWorkout] plan id from row:', plan?.id);

      const idForQueries =
        plan?.id &&
        typeof plan.id === 'string' &&
        plan.id.trim().length >= 10
          ? plan.id.trim()
          : rawPlanId;

      const previousLogPlanId =
        idForQueries &&
        typeof idForQueries === 'string' &&
        idForQueries.length >= 10
          ? idForQueries
          : null;

      setResolvedPlanId(plan?.id ? String(plan.id).trim() : rawPlanId);

      const planJson = plan?.plan_json;
      const weekData =
        planJson?.weeks?.find(
          (w: { weekNumber: number }) => w.weekNumber === params.weekNumber,
        ) ?? planJson?.weeks?.[0];

      const dayData = weekData?.days?.find(
        (d: { dayNumber: number }) => d.dayNumber === params.dayNumber,
      );

      const canonicalDayNumber =
        typeof dayData?.dayNumber === 'number'
          ? dayData.dayNumber
          : params.dayNumber;

      const previousWeekNumber = params.weekNumber - 1;
      const previousSetsMap: Record<string, LoggedSet[]> = {};
      let previousLogForDev:
        | { sets_json?: LoggedSet[] | string | null; day_number?: number }
        | null = null;
      let previousSetsForDev: LoggedSet[] = [];

      if (previousWeekNumber >= 1) {
        if (__DEV__) {
          console.log('[previousLog query params]', {
            planId: previousLogPlanId,
            previousWeekNumber,
            dayNumber: canonicalDayNumber,
            dayNumberSource:
              typeof dayData?.dayNumber === 'number'
                ? 'plan_json.dayNumber'
                : 'route.params (no matching day in plan_json)',
          });
        }

        if (
          !previousLogPlanId ||
          typeof previousLogPlanId !== 'string' ||
          previousLogPlanId.length < 10
        ) {
          console.warn(
            '[previousLog] Invalid planId — skipping fetch:',
            previousLogPlanId,
          );
        } else {
          const { data: previousLog } = await supabase
            .from('workout_logs')
            .select('sets_json, day_number')
            .eq('plan_id', previousLogPlanId)
            .eq('week_number', previousWeekNumber)
            .eq('day_number', canonicalDayNumber)
            .order('logged_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const previousLogTyped = previousLog as
            | { sets_json?: LoggedSet[] | string | null; day_number?: number }
            | null;
          previousLogForDev = previousLogTyped;
          const previousSets = parseSetsJson(previousLogTyped?.sets_json);
          previousSetsForDev = previousSets;

          const setsJsonRaw = previousLogTyped?.sets_json;
          const setsCountForLog = Array.isArray(setsJsonRaw)
            ? setsJsonRaw.length
            : typeof setsJsonRaw === 'string'
              ? (() => {
                  try {
                    const p = JSON.parse(setsJsonRaw) as unknown;
                    return Array.isArray(p) ? p.length : 0;
                  } catch {
                    return 0;
                  }
                })()
              : 0;

          if (__DEV__) {
            console.log('[previousLog]', {
              planId: previousLogPlanId,
              weekQueried: previousWeekNumber,
              dayQueried: canonicalDayNumber,
              found: !!previousLogTyped,
              setsCount: setsCountForLog,
            });
          }

          if (__DEV__) {
            console.log('[previousLog debug]', {
              weekNumber: previousWeekNumber,
              dayNumber: canonicalDayNumber,
              loggedDayNumber: previousLogTyped?.day_number ?? null,
              found: !!previousLogTyped,
              setsCount: previousSets.length,
            });
            console.log('[sets_json debug]', {
              totalSets: previousSets.length,
              uniqueExerciseIds: [
                ...new Set(previousSets.map((s) => s.exerciseId)),
              ],
              firstSet: previousSets[0] ?? null,
            });
          }
          previousSets.forEach((set) => {
            if (!previousSetsMap[set.exerciseId]) {
              previousSetsMap[set.exerciseId] = [];
            }
            previousSetsMap[set.exerciseId].push(set);
          });
        }
      }

      setPreviousSetsMap(previousSetsMap);

      if (__DEV__ && userId) {
        console.log('[workout consistency]', {
          planId: idForQueries,
          dayNumber: canonicalDayNumber,
          weekNumber: params.weekNumber,
          previousWeekQueried:
            previousWeekNumber >= 1 ? previousWeekNumber : null,
          previousLogFound: !!previousLogForDev,
          previousSetsCount: previousSetsForDev.length,
          previousLogPlanId,
        });
      }

      if (error || !plan) {
        setSessionPlanIdForLogs(null);
        setSessionDayNumber(null);
        setWorkout(buildWorkoutFromMock());
        return;
      }

      if (!weekData) {
        setSessionPlanIdForLogs(null);
        setSessionDayNumber(null);
        setWorkout(buildWorkoutFromMock());
        return;
      }

      if (!dayData || dayData.type === 'rest') {
        setSessionPlanIdForLogs(null);
        setSessionDayNumber(null);
        setWorkout(buildWorkoutFromMock());
        return;
      }

      setSessionPlanIdForLogs(idForQueries);
      setSessionDayNumber(dayData.dayNumber);

      const rawExercises: PlanJsonExercise[] = (dayData.exercises ??
        []) as PlanJsonExercise[];
      const enrichedList = rawExercises.map(enrichExerciseWithLibraryData);

      const exercises: WorkoutExercise[] = enrichedList.map(
        ({
          plan: ex,
          compoundTierResolved,
          movementPatternResolved,
          planCategoryResolved,
          usesWeightFromLibrary,
          isUnilateral: unilateral,
          cuesResolved,
        }) => {
          const usesWeight = usesWeightFromLibrary;
          return {
            id: ex.id,
            name: ex.name,
            muscleGroup: ex.muscleGroup,
            usesWeight,
            isUnilateral: unilateral,
            planCategory: planCategoryResolved,
            compoundTier: compoundTierResolved,
            category: compoundTierResolved,
            movementPattern: movementPatternResolved,
            targetWeight: ex.targetWeight ?? 0,
            reps: ex.reps,
            sets: Array.from({ length: ex.sets }, (_, i) => ({
              setNumber: i + 1,
              targetReps: ex.reps,
              targetWeight: ex.targetWeight,
              targetRpe: ex.targetRpe,
            })),
            alternatives: getAlternatives(ex.muscleGroup),
            cues: cuesResolved,
            restSeconds: ex.restSeconds,
            phase: ex.phase,
            coachingNote: ex.coachingNote,
          };
        },
      );

      const planGoal =
        typeof (planJson as { goal?: string }).goal === 'string'
          ? (planJson as { goal: string }).goal
          : 'general';

      if (__DEV__ && exercises.length > 0 && Object.keys(previousSetsMap).length > 0) {
        for (const ex of exercises) {
          const found = getPreviousSetsForExercise(
            previousSetsMap,
            ex.id,
            ex.name,
          );
          console.log('[previousSets lookup]', {
            exerciseId: ex.id,
            exerciseName: ex.name,
            previousSetsMapKeys: Object.keys(previousSetsMap),
            found: found.length > 0,
          });
        }
      }

      setWorkout({ title: dayData.title, goal: planGoal, exercises });
    } catch (e) {
      console.error('Failed to load workout:', e);
      setSessionPlanIdForLogs(null);
      setSessionDayNumber(null);
      setWorkout(buildWorkoutFromMock());
    } finally {
      setIsLoading(false);
    }
  };

  const totalSetsCount = (workout?.exercises ?? []).reduce(
    (sum, ex) => sum + ex.sets.length,
    0,
  );
  const allSetsLogged = sets.length >= totalSetsCount;

  // BUG-7: Active highlight now derived from first exercise with remaining
  // unlogged sets. Cannot bleed onto next exercise until previous is complete.
  const activeExerciseIndex = (workout?.exercises ?? []).findIndex(
    (ex) => sets.filter((s) => s.exerciseId === ex.id).length < ex.sets.length,
  );

  // Elapsed session timer
  useEffect(() => {
    const interval = setInterval(
      () => setElapsedSeconds((s) => s + 1),
      1000,
    );
    return () => clearInterval(interval);
  }, []);

  // Rest countdown timer
  useEffect(() => {
    if (!isRestActive) return;
    if (restSeconds <= 0) {
      void cancelRestTimerNotification();
      setIsRestActive(false);
      if (AppState.currentState === 'active') {
        void playRestCompleteSound();
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    const timeout = setTimeout(
      () => setRestSeconds((s) => s - 1),
      1000,
    );
    return () => clearTimeout(timeout);
  }, [isRestActive, restSeconds]);

  useEffect(() => {
    return () => {
      void cancelRestTimerNotification();
    };
  }, []);

  useEffect(() => {
    if (!isRestActive) return;
    restSubtextOpacity.setValue(1);
    Animated.timing(restSubtextOpacity, {
      toValue: 0,
      duration: 1200,
      useNativeDriver: true,
    }).start();
  }, [isRestActive, restSubtextOpacity]);

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToastMessage(null), 2500);
  };

  const fetchCoachingNote = async (
    exerciseId: string,
    exerciseName: string,
    targetReps: string,
    targetWeight: number,
    targetRpe: number,
    loggedReps: number,
    loggedWeight: number,
    loggedRpe: number | null,
    isUnilateral = false,
  ) => {
    setCoachingLoading((prev) => ({ ...prev, [exerciseId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('coaching-feedback', {
        body: {
          exerciseName,
          targetReps,
          targetWeight,
          targetRpe,
          loggedReps,
          loggedWeight,
          loggedRpe: loggedRpe ?? 'not rated',
          isUnilateral,
          weekNumber: params.weekNumber,
        },
      });
      if (error) {
        setCoachingNotes((prev) => {
          const next = { ...prev };
          delete next[exerciseId];
          return next;
        });
      } else {
        const text = data?.feedback ?? 'Good work — keep it up.';
        setCoachingNotes((prev) => ({ ...prev, [exerciseId]: text }));
      }
    } catch {
      setCoachingNotes((prev) => {
        const next = { ...prev };
        delete next[exerciseId];
        return next;
      });
    } finally {
      setCoachingLoading((prev) => ({ ...prev, [exerciseId]: false }));
    }
  };

  const handleLogSet = (
    exerciseId: string,
    setNumber: number,
    weight: number,
    reps: number,
    rpe: number | null,
  ) => {
    const exercise = (workout?.exercises ?? []).find(
      (ex) => ex.id === exerciseId,
    );
    const isSwapped = exerciseSwaps[exerciseId] !== undefined;
    const newSet: LoggedSet = {
      exerciseId,
      exerciseName:
        exercise != null ? exerciseSwaps[exerciseId] || exercise.name : undefined,
      setNumber,
      weightLbs: weight,
      reps,
      rpe,
      swapped: isSwapped,
    };

    const newSets = [...sets, newSet];
    setSets(newSets);

    if (newSets.length < totalSetsCount) {
      const duration = exercise
        ? resolveRestDurationSeconds(exercise)
        : 120;
      setRestDurationTotal(duration);
      setRestSeconds(duration);
      setIsRestActive(true);
      void scheduleRestCompleteNotification(duration);
    }
    if (exercise) {
      const target = exercise.sets.find((s) => s.setNumber === setNumber);
      if (target) {
        const displayName = exerciseSwaps[exerciseId] || exercise.name;
        fetchCoachingNote(
          exerciseId,
          displayName,
          target.targetReps,
          target.targetWeight,
          target.targetRpe,
          reps,
          weight,
          rpe,
          exercise.isUnilateral,
        );
      }
    }
  };

  const handleSwapExercise = (exerciseId: string, newName: string) => {
    setExerciseSwaps((prev) => ({ ...prev, [exerciseId]: newName }));
    showToast('Exercise swapped. Your coach will note this.');
  };

  const skipRest = () => {
    void cancelRestTimerNotification();
    setIsRestActive(false);
    setRestSeconds(0);
  };

  const handleBack = () => {
    Alert.alert(
      'End workout early?',
      'Your progress will be saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Workout',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        },
      ],
    );
  };

  const handleSaveAndFinish = async () => {
    if (fatigueRating === null) return;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      const planIdForLog =
        sessionPlanIdForLogs &&
        typeof sessionPlanIdForLogs === 'string' &&
        sessionPlanIdForLogs.length >= 10
          ? sessionPlanIdForLogs
          : resolvedPlanId &&
              typeof resolvedPlanId === 'string' &&
              resolvedPlanId.length >= 10
            ? resolvedPlanId
            : typeof params.planId === 'string'
              ? params.planId.trim()
              : params.planId;

      const dayNumberForLog =
        typeof sessionDayNumber === 'number'
          ? sessionDayNumber
          : params.dayNumber;

      let planIdSource: string;
      if (
        sessionPlanIdForLogs &&
        typeof sessionPlanIdForLogs === 'string' &&
        sessionPlanIdForLogs.length >= 10
      ) {
        planIdSource = 'plan row id (plan_json session)';
      } else if (
        resolvedPlanId &&
        typeof resolvedPlanId === 'string' &&
        resolvedPlanId.length >= 10
      ) {
        planIdSource = 'resolvedPlanId fallback';
      } else {
        planIdSource = 'route.params.planId';
      }

      if (__DEV__) {
        console.log('[SAVE workout_log]', {
          plan_id: planIdForLog,
          week_number: params.weekNumber,
          day_number: dayNumberForLog,
          setsCount: sets.length,
          planIdSource,
          dayNumberSource:
            typeof sessionDayNumber === 'number'
              ? 'plan_json.dayNumber'
              : 'route.params',
        });
      }

      // isUnilateral exercises: reps logged here are per-side. Volume calc multiplies ×2.
      // Do NOT double the value before storing — store exactly what the user entered.
      await supabase.from('workout_logs').insert({
        user_id: userId,
        plan_id: planIdForLog,
        week_number: params.weekNumber,
        day_number: dayNumberForLog,
        logged_at: new Date().toISOString(),
        session_fatigue_rating: fatigueRating,
        notes: sessionNotes || null,
        sets_json: sets,
      });
    } catch {
      Alert.alert('Error', 'Failed to save workout. Please try again.');
      return;
    }

    setShowFatigueSheet(false);

    const prsHit = sets.filter((s) => {
      const exercise = (workout?.exercises ?? []).find(
        (ex) => ex.id === s.exerciseId,
      );
      const target = exercise?.sets.find(
        (t) => t.setNumber === s.setNumber,
      );
      return target && s.weightLbs > target.targetWeight;
    }).length;

    const planIdForComplete =
      sessionPlanIdForLogs &&
      typeof sessionPlanIdForLogs === 'string' &&
      sessionPlanIdForLogs.length >= 10
        ? sessionPlanIdForLogs
        : resolvedPlanId &&
            typeof resolvedPlanId === 'string' &&
            resolvedPlanId.length >= 10
          ? resolvedPlanId
          : typeof params.planId === 'string'
            ? params.planId.trim()
            : params.planId;

    const dayNumberForComplete =
      typeof sessionDayNumber === 'number'
        ? sessionDayNumber
        : params.dayNumber;

    navigation.navigate('WorkoutComplete', {
      planId: planIdForComplete,
      weekNumber: params.weekNumber,
      dayNumber: dayNumberForComplete,
      totalSets: sets.length,
      totalExercises: (workout?.exercises ?? []).length,
      durationMinutes: Math.floor(elapsedSeconds / 60),
      fatigueRating,
      prsHit,
    });
  };

  const displayWorkoutTitle =
    workout?.title ?? params.workoutTitle ?? 'Workout';

  const workoutExercises = workout?.exercises ?? [];
  const phase1Exercise = workoutExercises.find((e) => e.phase === 'strength');
  const phase1Reps = phase1Exercise?.reps ?? '3–6';
  const phase2Exercise = workoutExercises.find((e) => e.phase === 'hypertrophy');
  const phase2Reps = phase2Exercise?.reps ?? '8–12';

  const restProgressWidth: DimensionValue =
    restDurationTotal > 0
      ? `${Math.max(0, Math.min(100, (restSeconds / restDurationTotal) * 100))}%`
      : '0%';

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.loadingInner}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <Text style={styles.backArrow}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.workoutTitleCenter} numberOfLines={1}>
            {displayWorkoutTitle}
          </Text>
          <Text style={styles.timerText}>{formatTime(elapsedSeconds)}</Text>
        </View>

        <View style={styles.bodyWrap}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {(workout?.exercises ?? []).map((exercise, exerciseIdx) => {
              const exercises = workout?.exercises ?? [];
              const prevExercise = exerciseIdx > 0 ? exercises[exerciseIdx - 1] : null;
              return (
                <View key={exercise.id}>
                  {exercise.phase === 'strength' && exerciseIdx === 0 && (
                    <View style={styles.phaseHeader}>
                      <Text style={styles.phaseHeaderText}>PHASE 1 — STRENGTH</Text>
                      <Text style={styles.phaseHeaderSub}>
                        Heavy compounds · {phase1Reps} reps · RPE 8–9
                      </Text>
                    </View>
                  )}
                  {exercise.phase === 'hypertrophy' && prevExercise?.phase === 'strength' && (
                    <View style={styles.phaseHeader}>
                      <Text style={styles.phaseHeaderText}>PHASE 2 — HYPERTROPHY</Text>
                      <Text style={styles.phaseHeaderSub}>
                        Accessories · {phase2Reps} reps · RPE 7–8
                      </Text>
                    </View>
                  )}
                  <ExerciseCard
                    exercise={exercise}
                    loggedSets={sets.filter((s) => s.exerciseId === exercise.id)}
                    previousSets={getPreviousSetsForExercise(
                      previousSetsMap,
                      exercise.id,
                      exercise.name,
                    )}
                    isActiveCard={exerciseIdx === activeExerciseIndex}
                    swappedName={exerciseSwaps[exercise.id] ?? null}
                    coachingNote={coachingNotes[exercise.id] ?? null}
                    coachingLoading={coachingLoading[exercise.id] ?? false}
                    weekNumber={params.weekNumber}
                    goal={workout?.goal ?? 'strength'}
                    warmupCollapsedCompound={warmupCollapsedCompound}
                    onWarmupCollapsedCompoundChange={setWarmupCollapsedCompound}
                    onLogSet={handleLogSet}
                    onSwapExercise={handleSwapExercise}
                    experience={workoutExperience}
                  />
                </View>
              );
            })}
          </ScrollView>

          {isRestActive && !allSetsLogged ? (
            <View style={styles.restTimerFixed} pointerEvents="box-none">
            <View style={styles.restBannerRow}>
              <View>
                <Animated.Text
                  style={[
                    styles.restBannerSubtext,
                    { opacity: restSubtextOpacity },
                  ]}
                >
                  Rest · {formatRestCountdown(restDurationTotal)}
                </Animated.Text>
                <Text style={styles.restBannerCountdown}>
                  {formatRestCountdown(restSeconds)}
                </Text>
                <Text style={styles.restBannerLabel}>REST</Text>
              </View>
              <TouchableOpacity onPress={skipRest} activeOpacity={0.7}>
                <Text style={styles.restBannerSkip}>Skip →</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.restBannerTrack}>
              <View
                style={[
                  styles.restBannerFill,
                  { width: restProgressWidth },
                ]}
              />
            </View>
            </View>
          ) : null}
        </View>

        {allSetsLogged ? (
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={styles.finishButton}
              activeOpacity={0.8}
              onPress={() => setShowFatigueSheet(true)}
            >
              <Text style={styles.finishButtonText}>Finish Workout</Text>
            </TouchableOpacity>
          </View>
        ) : null}

      {/* Toast */}
      {toastMessage && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      {/* Fatigue check-in */}
      <Modal
        visible={showFatigueSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFatigueSheet(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => setShowFatigueSheet(false)}
        >
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <View style={styles.fatigueSheet}>
          <View style={styles.dragHandle} />
          <Text style={styles.fatigueTitle}>How do you feel?</Text>
          <Text style={styles.fatigueSubtitle}>
            Overall session fatigue
          </Text>

          <View style={styles.emojiRow}>
            {FATIGUE_OPTIONS.map((opt, i) => {
              const isSelected = fatigueRating === opt.rating;
              return (
                <TouchableOpacity
                  key={opt.rating}
                  activeOpacity={0.92}
                  style={styles.emojiCardWrap}
                  onPress={() => setFatigueRating(opt.rating)}
                >
                  <Animated.View
                    style={[
                      styles.emojiCard,
                      isSelected && styles.emojiCardSelected,
                      { transform: [{ scale: fatigueEmojiScales[i] }] },
                    ]}
                  >
                    <Text style={styles.emoji}>{opt.emoji}</Text>
                    <Text style={styles.emojiLabel}>{opt.label}</Text>
                  </Animated.View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            style={styles.notesInput}
            placeholder="Any notes for your coach? (optional)"
            placeholderTextColor={Colors.textTertiary}
            value={sessionNotes}
            onChangeText={setSessionNotes}
            multiline
            numberOfLines={3}
            maxLength={500}
          />

          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.saveButton,
              fatigueRating === null && styles.saveButtonDisabled,
            ]}
            onPress={handleSaveAndFinish}
            disabled={fatigueRating === null}
          >
            <Text
              style={[
                styles.saveButtonText,
                fatigueRating === null && styles.saveButtonTextDisabled,
              ]}
            >
              Save & Finish
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal
        visible={showPreSessionModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPreSessionModal(false)}
      >
        <View style={styles.preSessionModalRoot}>
          <Pressable
            style={styles.preSessionOverlay}
            onPress={() => setShowPreSessionModal(false)}
          />
          <View style={styles.preSessionSheet}>
            <View style={styles.preSessionHandle} />
            <Text style={styles.preSessionLabel}>JORDAN</Text>
            <Text style={styles.preSessionMessage}>{preSessionMessage}</Text>
            <Pressable
              style={styles.preSessionCTA}
              onPress={() => setShowPreSessionModal(false)}
            >
              <Text style={styles.preSessionCTAText}>Let's go →</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  loadingInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgPrimary,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  bodyWrap: {
    flex: 1,
  },

  header: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: 12,
    backgroundColor: Colors.bgPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  backButton: {
    zIndex: 2,
    paddingVertical: Spacing.xs,
    paddingRight: Spacing.md,
    justifyContent: 'center',
  },
  backArrow: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    color: Colors.accent,
  },
  workoutTitleCenter: {
    position: 'absolute',
    left: 48,
    right: 72,
    top: Spacing.sm,
    bottom: 12,
    textAlign: 'center',
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    pointerEvents: 'none',
  },
  timerText: {
    zIndex: 2,
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    fontVariant: ['tabular-nums'],
    minWidth: 56,
    textAlign: 'right',
  },

  phaseHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  phaseHeaderText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
  },
  phaseHeaderSub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  scrollView: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: 160,
  },

  restTimerFixed: {
    position: 'absolute',
    bottom: 16,
    left: 20,
    right: 20,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.accent,
    zIndex: 100,
  },
  restBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  restBannerSubtext: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  restBannerLabel: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginTop: 4,
  },
  restBannerCountdown: {
    fontSize: FontSizes.display,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    fontVariant: ['tabular-nums'],
  },
  restBannerSkip: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
  },
  restBannerTrack: {
    marginTop: Spacing.md,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.divider,
    overflow: 'hidden',
  },
  restBannerFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.accent,
  },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.bgCard,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  finishButton: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishButtonText: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
  },

  toast: {
    position: 'absolute',
    bottom: 100,
    left: Spacing.xxl,
    right: Spacing.xxl,
    backgroundColor: Colors.divider,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  toastText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
  },

  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
  },
  fatigueSheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xxl,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.divider,
    alignSelf: 'center',
    marginBottom: Spacing.xl,
  },
  fatigueTitle: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  fatigueSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  emojiRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    overflow: 'visible',
    paddingVertical: 4,
  },
  emojiCardWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiCard: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgElevated,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emojiCardSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
  },
  emoji: {
    fontFamily: Fonts.regular,
    fontSize: 28,
  },
  emojiLabel: {
    fontSize: 9,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  notesInput: {
    fontFamily: Fonts.regular,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
    marginTop: Spacing.lg,
  },
  saveButton: {
    marginTop: Spacing.lg,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: Colors.bgElevated,
  },
  saveButtonText: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
  },
  saveButtonTextDisabled: {
    color: Colors.textTertiary,
  },

  preSessionModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  preSessionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  preSessionSheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: Spacing.xl,
    paddingBottom: 48,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  preSessionHandle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  preSessionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  preSessionMessage: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    lineHeight: 26,
    marginBottom: Spacing.xl,
  },
  preSessionCTA: {
    backgroundColor: Colors.accent,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preSessionCTAText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
});

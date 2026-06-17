// Requires: npx expo install expo-haptics
import { useState, useEffect, useRef, useCallback } from 'react';
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
  Keyboard,
  type AppStateStatus,
  type DimensionValue,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { hapticHeavy, hapticLight, hapticMedium } from '../utils/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHealthData, type HealthData } from '../hooks/useHealthData';
import { useBLEHeartRate } from '../hooks/useBLEHeartRate';
import BLEDeviceSheet from '../components/BLEDeviceSheet';
import { getBLEHeartRateManager } from '../utils/bleHeartRate';
import { HEALTH_PERMISSION_GRANTED_KEY } from '../components/HealthConnectCard';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import { getLocalDateString } from '../utils/dateUtils';
import ExerciseCard from '../components/ExerciseCard';
import type { LoggedSet, CompoundTier } from '../components/ExerciseCard';
import {
  EXERCISES,
  getCuesForExerciseName,
  isExerciseUnilateral,
  type Exercise,
} from '../constants/exerciseLibrary';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { cancelReEngagementPush } from '../utils/notifications';
import {
  cancelRestTimerNotification,
  playRestCompleteSound,
  scheduleRestCompleteNotification,
} from '../utils/restTimerAlerts';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { JordanAvatar } from '../components/JordanAvatar';
import { RPEReferenceSheet } from '../components/RPEReferenceSheet';
import { stripEmDash } from '../utils/jordanText';
import { buildExerciseBestsFromLogs, isNewWeightPR } from '../utils/personalRecords';
import { persistExerciseSwapsToPlan } from '../utils/swapPersistence';

const WORKOUT_DRAFT_KEY = 'hone_workout_draft';

type WorkoutDraft = {
  planId: string;
  dayNumber: number;
  weekNumber: number;
  sets: LoggedSet[];
  savedAt: number;
};

type NavProp = NativeStackNavigationProp<RootStackParamList, 'ActiveWorkout'>;
type RouteType = RouteProp<RootStackParamList, 'ActiveWorkout'>;

const FATIGUE_OPTIONS = [
  { rating: 1, label: 'Wiped',  color: '#EF4444' },
  { rating: 2, label: 'Tired',  color: '#F97316' },
  { rating: 3, label: 'Good',   color: '#F59E0B' },
  { rating: 4, label: 'Strong', color: '#84CC16' },
  { rating: 5, label: 'Beast',  color: '#22C55E' },
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
  /** Compound tier from library / plan — warmup eligibility */
  category: CompoundTier;
  movementPattern?: string;
  targetWeight: number;
  /** plan_json prescription — overrides per-set defaults for adaptation copy */
  targetRpe?: number;
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
  setStructure?: 'straight' | 'pyramid' | 'wave';
  setTargets?: Array<{
    setNumber: number;
    targetWeight: number;
    targetReps: string;
    targetRpe: number;
  }>;
};

type WorkoutData = {
  title: string;
  goal: string;
  /** Strength programme lift id — from plan_json.goalLift / targetLift */
  goalLift?: string | null;
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
  goalLift: 'bench_press',
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
  setStructure?: 'straight' | 'pyramid' | 'wave';
  setTargets?: Array<{
    setNumber: number;
    targetWeight: number;
    targetReps: string;
    targetRpe: number;
  }>;
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
  const nameLower = exerciseName.toLowerCase().trim();

  for (const sets of Object.values(previousSetsMap)) {
    const s0 = sets[0];
    if (!s0) continue;
    const loggedName = (
      s0.exerciseName ??
      (s0 as LoggedSet & { name?: string }).name ??
      ''
    ).toLowerCase().trim();
    if (loggedName === nameLower) return sets;
  }

  const direct = previousSetsMap[exerciseId];
  if (direct && direct.length > 0) {
    const s0 = direct[0];
    const loggedName = (
      s0?.exerciseName ??
      (s0 as LoggedSet & { name?: string })?.name ??
      ''
    ).toLowerCase().trim();
    if (loggedName === nameLower) return direct;
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

// ── Warmup card data ──────────────────────────────

const WARMUP_DURATION_SECONDS = 300; // 5 minutes

type WarmupCategory =
  | 'pushPull'
  | 'push'
  | 'shouldersArms'
  | 'pull'
  | 'legs'
  | 'cardio'
  | 'fullBody'
  | 'fallback';

type WarmupMove = { name: string; detail: string };

const WARMUP_MOVES: Record<WarmupCategory, WarmupMove[]> = {
  pushPull: [
    { name: 'Arm circles', detail: '10 forward, 10 backward' },
    { name: 'Band pull-aparts', detail: '15 reps' },
    { name: 'Cat-cow', detail: '10 reps' },
    { name: 'Scapular push-up', detail: '8 reps' },
  ],
  push: [
    { name: 'Arm circles', detail: '10 forward, 10 backward' },
    { name: 'Band pull-aparts', detail: '15 reps — shoulder health' },
    { name: 'Light push-up', detail: '10 reps, focus on scapular control' },
    { name: 'Wrist circles', detail: '10 each direction' },
  ],
  shouldersArms: [
    { name: 'Arm circles', detail: '10 forward, 10 backward' },
    { name: 'Wrist circles', detail: '10 each direction' },
    { name: 'Band pull-aparts', detail: '15 reps' },
    { name: 'Overhead tricep stretch', detail: '20 seconds each side' },
  ],
  pull: [
    { name: 'Cat-cow', detail: '10 reps' },
    { name: 'Band pull-aparts', detail: '15 reps' },
    { name: 'Dead hang', detail: '20–30 seconds' },
    { name: 'Scapular pull-ups', detail: '8 reps' },
  ],
  legs: [
    { name: 'Leg swings', detail: '10 forward/back each leg' },
    { name: 'Hip circles', detail: '10 each direction' },
    { name: 'Bodyweight squat', detail: '10 reps, controlled descent' },
    { name: 'Walking lunge', detail: '5 each leg' },
  ],
  cardio: [
    { name: 'March in place', detail: '60 seconds' },
    { name: 'Leg swings', detail: '10 each leg' },
    { name: 'Arm circles', detail: '10 each direction' },
    { name: 'Hip circles', detail: '10 each direction' },
  ],
  fullBody: [
    { name: 'Jumping jacks', detail: '30 seconds' },
    { name: 'Leg swings', detail: '10 each leg' },
    { name: 'Arm circles', detail: '10 each direction' },
    { name: 'Bodyweight squat', detail: '10 reps' },
  ],
  fallback: [
    { name: 'Jumping jacks', detail: '30 seconds' },
    { name: 'Arm circles', detail: '10 each direction' },
    { name: 'Hip circles', detail: '10 each direction' },
    { name: 'Bodyweight squat', detail: '10 reps' },
  ],
};

const WARMUP_JORDAN_LINES: Record<WarmupCategory, string> = {
  pushPull: 'Prime both push and pull patterns — this session taxes the whole upper body.',
  push: 'Take 5 minutes to prime your shoulders and chest before loading them.',
  shouldersArms: 'Warm up the shoulder joint thoroughly before any overhead or curl work.',
  pull: 'Loosen the posterior chain before you pull — your lats will thank you.',
  legs: 'Hip and ankle mobility first — heavy squat and hinge patterns need it.',
  cardio: 'Light movement to raise your heart rate before you push the pace.',
  fullBody: 'Full body sessions demand full body prep — do not skip this one.',
  fallback: 'Five minutes of movement before you lift protects the session.',
};

function classifyWarmupCategory(muscleGroups: string[]): WarmupCategory {
  const mg = muscleGroups.map((m) => m.toLowerCase());
  const has = (term: string) => mg.some((m) => m.includes(term));

  if (has('chest') && has('back')) return 'pushPull';
  if (has('chest')) return 'push';
  if (has('shoulder') && (has('bicep') || has('tricep'))) return 'shouldersArms';
  if (has('back') || has('lat')) return 'pull';
  if (has('quad') || has('hamstring') || has('glute') || has('calf') || has('leg')) return 'legs';
  return 'fallback';
}

const WARMUP_SKIP_KEY_PREFIX = 'hone_warmup_skip_plan_';

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
  // Exercise order — array of exercise IDs in display order
  const [exerciseOrder, setExerciseOrder] = useState<string[]>([]);
  const [skippedExercises, setSkippedExercises] = useState<Set<string>>(
    new Set(),
  );
  // Collapsed exercise cards — Set of exercise IDs
  const [collapsedExercises, setCollapsedExercises] = useState<Set<string>>(
    new Set(),
  );
  const [exerciseSwaps, setExerciseSwaps] = useState<Record<string, string>>(
    {},
  );
  const [exerciseTargetWeightOverrides, setExerciseTargetWeightOverrides] =
    useState<Record<string, number>>({});
  const [exercisePyramidSetsOverrides, setExercisePyramidSetsOverrides] =
    useState<Record<string, { setNumber: number; weightLbs: number }[]>>({});
  const [coachingNotes, setCoachingNotes] = useState<
    Record<string, string | null>
  >({});
  const [coachingLoading, setCoachingLoading] = useState<
    Record<string, boolean>
  >({});
  const [overlayNote, setOverlayNote] = useState<string | null>(null);
  const [overlayNoteVisible, setOverlayNoteVisible] = useState(false);
  const [overlayWeightSuggestion, setOverlayWeightSuggestion] = useState<{
    exerciseId: string;
    weightLbs: number;
  } | null>(null);
  const overlayNoteAnim = useRef(new Animated.Value(0)).current;
  const overlayDismissTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Timers
  const sessionStartTimeRef = useRef<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const restEndTimeRef = useRef<number | null>(null);
  const [restSecondsRemaining, setRestSecondsRemaining] = useState(0);
  const [restDurationTotal, setRestDurationTotal] = useState(90);
  const [isRestActive, setIsRestActive] = useState(false);
  const restSubtextOpacity = useRef(new Animated.Value(0)).current;

  const startRestTimer = useCallback((durationSeconds: number) => {
    restEndTimeRef.current = Date.now() + durationSeconds * 1000;
    setRestSecondsRemaining(durationSeconds);
  }, []);

  // Fatigue check-in
  const [showFatigueSheet, setShowFatigueSheet] = useState(false);
  const [showRpeNudgeModal, setShowRpeNudgeModal] = useState(false);
  const [showRpeReference, setShowRpeReference] = useState(false);
  const [rpeReferenceFromNudge, setRpeReferenceFromNudge] = useState(false);
  const [fatigueRating, setFatigueRating] = useState<number | null>(null);
  const isSavingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
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

  const [showWarmupModal, setShowWarmupModal] = useState(false);
  const [warmupSecondsRemaining, setWarmupSecondsRemaining] = useState(WARMUP_DURATION_SECONDS);
  const warmupEndTimeRef = useRef<number | null>(null);
  const [warmupCategory, setWarmupCategory] = useState<WarmupCategory>('fallback');

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Raw `phase` from plan_json for the active week (training mesocycle). */
  const [sessionPlanPhaseRaw, setSessionPlanPhaseRaw] = useState<string | null>(null);
  /** DB row id — use for workout_logs so it always matches the loaded plan row */
  const [resolvedPlanId, setResolvedPlanId] = useState<string | null>(null);
  /** Same plan_id / day_number as INSERT — must match plan_json DayObject.dayNumber */
  const [sessionPlanIdForLogs, setSessionPlanIdForLogs] = useState<string | null>(
    null,
  );
  const [sessionDayNumber, setSessionDayNumber] = useState<number | null>(null);
  /** Canonical week_number for logs / UI — aligns with plans.current_week unless lockToRouteWeek. */
  const [resolvedPlanWeekNumber, setResolvedPlanWeekNumber] = useState<
    number | null
  >(null);
  const [recoveryContext, setRecoveryContext] = useState<{
    sleepHours: number | null;
    readinessScore: number | null;
    hrvMs: number | null;
    restingHeartRate: number | null;
  } | null>(null);
  const [showBLESheet, setShowBLESheet] = useState(false);

  // Draft crash-recovery: called after loadWorkoutData resolves so planId/dayNumber are known
  const checkDraft = async (planId: string, dayNumber: number) => {
    try {
      const raw = await AsyncStorage.getItem(WORKOUT_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as WorkoutDraft;

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !Array.isArray(parsed.sets) ||
        parsed.sets.length === 0
      ) {
        void AsyncStorage.removeItem(WORKOUT_DRAFT_KEY);
        return;
      }

      // Discard if from a different plan or workout day
      if (parsed.planId !== planId || parsed.dayNumber !== dayNumber) {
        void AsyncStorage.removeItem(WORKOUT_DRAFT_KEY);
        return;
      }

      // Discard if older than 7 days
      if (parsed.savedAt < Date.now() - 7 * 24 * 60 * 60 * 1000) {
        void AsyncStorage.removeItem(WORKOUT_DRAFT_KEY);
        return;
      }

      Alert.alert(
        'Unsaved workout found',
        'You have sets from a previous session that were not saved. Resume it?',
        [
          {
            text: 'Resume',
            onPress: () => {
              setSets(parsed.sets);
            },
          },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              void AsyncStorage.removeItem(WORKOUT_DRAFT_KEY);
            },
          },
        ],
      );
    } catch {
      void AsyncStorage.removeItem(WORKOUT_DRAFT_KEY);
    }
  };

  // Load workout data
  useEffect(() => {
    cancelReEngagementPush();
    loadWorkoutData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setResolvedPlanId(null);
    setSessionPlanIdForLogs(null);
    setSessionDayNumber(null);
    setResolvedPlanWeekNumber(null);
  }, [
    params.planId,
    params.weekNumber,
    params.dayNumber,
    params.lockToRouteWeek,
  ]);

  const { queryPostSetHeartRate, fetchHealthData, isAvailable: healthAvailable } =
    useHealthData();
  const ble = useBLEHeartRate();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) return;

        // Fetch today's weight log for sleep + readiness
        const todayDate = getLocalDateString();
        const { data: weightLog } = await supabase
          .from('weight_logs')
          .select('sleep_hours, readiness_score')
          .eq('user_id', userId)
          .eq('log_date', todayDate)
          .maybeSingle();

        // Fetch Health data if permission granted
        const isHealthGranted =
          healthAvailable &&
          (await AsyncStorage.getItem(HEALTH_PERMISSION_GRANTED_KEY)) === '1';

        const healthData: HealthData | null = isHealthGranted
          ? await fetchHealthData()
          : null;

        if (!cancelled) {
          const recoveryContext = {
            sleepHours: (weightLog?.sleep_hours as number | null) ?? healthData?.sleepHours ?? null,
            readinessScore: (weightLog?.readiness_score as number | null) ?? null,
            hrvMs: healthData?.hrvMs ?? null,
            restingHeartRate: healthData?.restingHeartRate ?? null,
          };
          setRecoveryContext(recoveryContext);
          console.log('[Recovery] context fetched:', JSON.stringify(recoveryContext));
        }
      } catch (err) {
        if (__DEV__) console.warn('[ActiveWorkout] recovery context fetch failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [healthAvailable, fetchHealthData]);

  useEffect(() => {
    // Attempt to reconnect to previously paired BLE device on workout start
    void ble.tryReconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getAlternatives = (muscleGroup: string): string[] => {
    const map: Record<string, string[]> = {
      Chest: ['Incline Dumbbell Press', 'Cable Fly', 'Machine Chest Press', 'Push-Up'],
      Back: ['Cable Row', 'Dumbbell Row', 'Chest-Supported Row', 'Lat Pulldown'],
      Legs: ['Leg Press', 'Hack Squat', 'Dumbbell Lunges', 'Bulgarian Split Squat'],
      Shoulders: ['Dumbbell Shoulder Press', 'Arnold Press', 'Cable Lateral Raise'],
      Arms: ['Preacher Curl', 'Hammer Curl', 'Cable Curl'],
      Triceps: ['Overhead Tricep Extension', 'Cable Pushdown', 'Close-Grip Bench Press'],
      Biceps: ['Preacher Curl', 'Hammer Curl', 'Incline Dumbbell Curl'],
      Glutes: ['Hip Thrust', 'Cable Kickback', 'Bulgarian Split Squat'],
      Hamstrings: ['Leg Curl', 'Romanian Deadlift', 'Nordic Curl'],
      Calves: ['Seated Calf Raise', 'Leg Press Calf Raise', 'Single-Leg Calf Raise'],
      Core: ['Plank', 'Cable Crunch', 'Ab Wheel Rollout'],
      'Rear Delts': ['Reverse Dumbbell Fly', 'Face Pull', 'Band Pull-Apart'],
      Traps: ['Dumbbell Shrug', 'Cable Shrug', 'Face Pull'],
      Forearms: ['Wrist Curl', 'Hammer Curl', 'Farmers Carry'],
    };
    return map[muscleGroup] ?? ['Dumbbell Row', 'Cable Row', 'Resistance Band Row'];
  };

  const buildWorkoutFromMock = (): WorkoutData => {
    setIsLoading(false);
    return MOCK_WORKOUT;
  };

  const loadWorkoutData = async () => {
    try {
      setSessionPlanPhaseRaw(null);
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
        setResolvedPlanWeekNumber(null);
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
        setResolvedPlanWeekNumber(null);
        setPreviousSetsMap({});
        setWorkout(buildWorkoutFromMock());
        return;
      }

      const planResult = await supabase
        .from('plans')
        .select('id, plan_json, current_week')
        .eq('id', rawPlanId)
        .maybeSingle();

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

      if (error || !plan) {
        setSessionPlanIdForLogs(null);
        setSessionDayNumber(null);
        setResolvedPlanWeekNumber(null);
        setPreviousSetsMap({});
        setWorkout(buildWorkoutFromMock());
        return;
      }

      const planJson = plan.plan_json;
      const dbCurrentWeek = Number(plan.current_week ?? 1);
      const paramWeek = Number(params.weekNumber ?? dbCurrentWeek);
      const lockWeek = params.lockToRouteWeek === true;

      const findWeekInPlan = (n: number) =>
        planJson.weeks?.find(
          (w: { weekNumber?: number; week_number?: number }) =>
            Number(w.weekNumber ?? w.week_number) === n,
        );

      const intendedWeekNumber = lockWeek ? paramWeek : dbCurrentWeek;

      let weekData =
        findWeekInPlan(intendedWeekNumber);
      if (!weekData) {
        weekData = findWeekInPlan(dbCurrentWeek) ?? planJson.weeks?.[0];
      }

      const resolvedWeekNumber =
        weekData != null
          ? Number(
              weekData.weekNumber ??
                (weekData as { week_number?: number }).week_number ??
                intendedWeekNumber,
            )
          : intendedWeekNumber;

      const dayData = weekData?.days?.find(
        (d: { dayNumber: number }) =>
          Number(d.dayNumber) === Number(params.dayNumber),
      );

      const canonicalDayNumber =
        typeof dayData?.dayNumber === 'number'
          ? dayData.dayNumber
          : params.dayNumber;

      const previousWeekNumber = resolvedWeekNumber - 1;
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
          weekNumber: resolvedWeekNumber,
          routeWeekParam: params.weekNumber,
          planCurrentWeekDb: dbCurrentWeek,
          lockToRouteWeek: params.lockToRouteWeek === true,
          previousWeekQueried:
            previousWeekNumber >= 1 ? previousWeekNumber : null,
          previousLogFound: !!previousLogForDev,
          previousSetsCount: previousSetsForDev.length,
          previousLogPlanId,
        });
      }

      if (!weekData) {
        setSessionPlanIdForLogs(null);
        setSessionDayNumber(null);
        setResolvedPlanWeekNumber(null);
        setWorkout(buildWorkoutFromMock());
        return;
      }

      if (!dayData || dayData.type === 'rest') {
        setSessionPlanIdForLogs(null);
        setSessionDayNumber(null);
        setResolvedPlanWeekNumber(null);
        setWorkout(buildWorkoutFromMock());
        return;
      }

      setResolvedPlanWeekNumber(resolvedWeekNumber);
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
          const setCount = ex.sets > 0 ? ex.sets : 3;
          const setTargets = ex.setTargets;
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
            targetRpe: ex.targetRpe,
            reps: ex.reps,
            sets: Array.from({ length: setCount }, (_, i) => {
              const sn = i + 1;
              const row = setTargets?.find((t) => t.setNumber === sn);
              return {
                setNumber: sn,
                targetReps: row?.targetReps ?? ex.reps,
                targetWeight: row?.targetWeight ?? ex.targetWeight ?? 0,
                targetRpe: row?.targetRpe ?? ex.targetRpe,
              };
            }),
            setTargets: ex.setTargets,
            alternatives: getAlternatives(ex.muscleGroup),
            cues: cuesResolved,
            restSeconds: ex.restSeconds,
            phase: ex.phase,
            coachingNote: ex.coachingNote,
            setStructure: ex.setStructure ?? 'straight',
          };
        },
      );

      const planGoal =
        typeof (planJson as { goal?: string }).goal === 'string'
          ? (planJson as { goal: string }).goal
          : 'general';

      const planGoalLift =
        typeof (planJson as { goalLift?: string }).goalLift === 'string' &&
          (planJson as { goalLift: string }).goalLift.trim() !== ''
          ? (planJson as { goalLift: string }).goalLift.trim()
          : typeof (planJson as { targetLift?: string }).targetLift === 'string' &&
              (planJson as { targetLift: string }).targetLift.trim() !== ''
            ? (planJson as { targetLift: string }).targetLift.trim()
            : null;

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

      setSessionPlanPhaseRaw(
        typeof weekData?.phase === 'string' ? weekData.phase : null,
      );
      setWorkout({ title: dayData.title, goal: planGoal, goalLift: planGoalLift, exercises });
      setExerciseOrder(exercises.map((e) => e.id));
      void checkDraft(idForQueries, dayData.dayNumber);

      // Show warmup modal unless user has opted out for this plan
      const planIdForWarmup = idForQueries;
      if (planIdForWarmup) {
        const skipKey = `${WARMUP_SKIP_KEY_PREFIX}${planIdForWarmup}`;
        const skipped = await AsyncStorage.getItem(skipKey);
        if (!skipped) {
          const dayMuscleGroups: string[] = (dayData.muscleGroups ?? []) as string[];
          const category = classifyWarmupCategory(dayMuscleGroups);
          setWarmupCategory(category);
          setWarmupSecondsRemaining(WARMUP_DURATION_SECONDS);
          setShowWarmupModal(true);
        }
      }
    } catch (e) {
      console.error('Failed to load workout:', e);
      setSessionPlanIdForLogs(null);
      setSessionDayNumber(null);
      setResolvedPlanWeekNumber(null);
      setWorkout(buildWorkoutFromMock());
    } finally {
      setIsLoading(false);
    }
  };

  const totalSetsCount = (workout?.exercises ?? []).reduce(
    (sum, ex) =>
      skippedExercises.has(ex.id) ? sum : sum + ex.sets.length,
    0,
  );
  const allSetsLogged = sets.length >= totalSetsCount;

  const workoutExercises = workout?.exercises ?? [];
  // Apply user reorder — fall back to original order for any
  // IDs not yet in exerciseOrder (e.g. after a swap)
  const orderedExercises =
    exerciseOrder.length > 0
      ? [
          ...exerciseOrder
            .map((id) => workoutExercises.find((e) => e.id === id))
            .filter((e): e is (typeof workoutExercises)[0] => e != null),
          ...workoutExercises.filter((e) => !exerciseOrder.includes(e.id)),
        ]
      : workoutExercises;

  // BUG-7: Active highlight now derived from first exercise with remaining
  // unlogged sets. Cannot bleed onto next exercise until previous is complete.
  const activeExerciseIndex = orderedExercises.findIndex(
    (ex) =>
      !skippedExercises.has(ex.id) &&
      !collapsedExercises.has(ex.id) &&
      sets.filter((s) => s.exerciseId === ex.id).length < ex.sets.length,
  );

  useEffect(() => {
    void activateKeepAwakeAsync();
    return () => {
      deactivateKeepAwake();
    };
  }, []);

  // Elapsed session timer (timestamp-based — survives background throttling)
  useEffect(() => {
    sessionStartTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds(
        Math.floor((Date.now() - sessionStartTimeRef.current) / 1000),
      );
    }, 1000);

    const subscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') {
          setElapsedSeconds(
            Math.floor((Date.now() - sessionStartTimeRef.current) / 1000),
          );
        }
      },
    );

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  // Rest countdown timer (deadline-based)
  useEffect(() => {
    const interval = setInterval(() => {
      if (restEndTimeRef.current == null) return;
      const remaining = Math.max(
        0,
        Math.ceil((restEndTimeRef.current - Date.now()) / 1000),
      );
      setRestSecondsRemaining(remaining);
      if (remaining === 0) {
        restEndTimeRef.current = null;
      }
    }, 1000);

    const subscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active' && restEndTimeRef.current != null) {
          const remaining = Math.max(
            0,
            Math.ceil((restEndTimeRef.current - Date.now()) / 1000),
          );
          setRestSecondsRemaining(remaining);
          if (remaining === 0) {
            restEndTimeRef.current = null;
          }
        }
      },
    );

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  // Warmup countdown timer
  useEffect(() => {
    if (!showWarmupModal) {
      warmupEndTimeRef.current = null;
      return;
    }
    warmupEndTimeRef.current = Date.now() + WARMUP_DURATION_SECONDS * 1000;

    const warmupInterval = setInterval(() => {
      if (warmupEndTimeRef.current == null) return;
      const remaining = Math.max(
        0,
        Math.ceil((warmupEndTimeRef.current - Date.now()) / 1000),
      );
      setWarmupSecondsRemaining(remaining);
      if (remaining === 0) {
        warmupEndTimeRef.current = null;
        setShowWarmupModal(false);
      }
    }, 1000);

    const warmupSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && warmupEndTimeRef.current != null) {
        const remaining = Math.max(
          0,
          Math.ceil((warmupEndTimeRef.current - Date.now()) / 1000),
        );
        setWarmupSecondsRemaining(remaining);
        if (remaining === 0) {
          warmupEndTimeRef.current = null;
          setShowWarmupModal(false);
        }
      }
    });

    return () => {
      clearInterval(warmupInterval);
      warmupSub.remove();
    };
  }, [showWarmupModal]);

  useEffect(() => {
    if (!isRestActive) return;
    if (restSecondsRemaining > 0) return;
    void cancelRestTimerNotification();
    setIsRestActive(false);
    if (AppState.currentState === 'active') {
      void playRestCompleteSound();
    }
    void hapticHeavy();
  }, [isRestActive, restSecondsRemaining]);

  useEffect(() => {
    return () => {
      void cancelRestTimerNotification();
      if (overlayDismissTimeout.current) {
        clearTimeout(overlayDismissTimeout.current);
      }
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

  const sessionWeekForLogs = resolvedPlanWeekNumber ?? params.weekNumber;

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
    opts: {
      isUnilateral?: boolean;
      isLastSetOfExercise?: boolean;
      isLastExercise?: boolean;
      isPyramid?: boolean;
      setNumber?: number;
      totalSets?: number;
    } = {},
    heartRate?: { avgBpm: number | null; peakBpm: number | null } | null,
    recoveryCtx?: typeof recoveryContext,
  ) => {
    const {
      isUnilateral = false,
      isLastSetOfExercise = false,
      isLastExercise = false,
      isPyramid = false,
      setNumber = 0,
      totalSets = 0,
    } = opts;
    setCoachingLoading((prev) => ({ ...prev, [exerciseId]: true }));
    try {
      console.log('[coaching invoke body]', {
        isPyramid,
        isLastSetOfExercise,
        isLastExercise,
        exerciseName,
      });
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
          weekNumber: sessionWeekForLogs,
          isLastSetOfExercise,
          isLastExercise,
          isPyramid,
          setNumber,
          totalSets,
          heartRateAvgBpm: heartRate?.avgBpm ?? null,
          heartRatePeakBpm: heartRate?.peakBpm ?? null,
          sleepHours: recoveryCtx?.sleepHours ?? null,
          readinessScore: recoveryCtx?.readinessScore ?? null,
          hrvMs: recoveryCtx?.hrvMs ?? null,
          restingHeartRate: recoveryCtx?.restingHeartRate ?? null,
        },
      });
      if (error) {
        setCoachingNotes((prev) => {
          const next = { ...prev };
          delete next[exerciseId];
          return next;
        });
      } else {
        const text = data?.feedback ?? 'Good work. Keep it up.';
        setCoachingNotes((prev) => ({ ...prev, [exerciseId]: text }));
        setOverlayNote(text);
        // Parse suggested weight — only show pill for straight sets,
        // not pyramid (pyramid sets have per-set weights already)
        const weightMatch = text.match(/try\s+(\d+(?:\.\d+)?)\s*lbs?/i);
        const parsedWeight = weightMatch ? Number(weightMatch[1]) : null;
        const allowSuggestion =
          parsedWeight != null &&
          parsedWeight > 0 &&
          !isPyramid &&
          !isLastSetOfExercise;
        if (allowSuggestion) {
          setOverlayWeightSuggestion({ exerciseId, weightLbs: parsedWeight });
        } else {
          setOverlayWeightSuggestion(null);
        }
        overlayNoteAnim.setValue(0);
        setOverlayNoteVisible(true);
        Animated.timing(overlayNoteAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
        if (overlayDismissTimeout.current) {
          clearTimeout(overlayDismissTimeout.current);
        }
        const dismissDelay = allowSuggestion ? 8000 : 5000;
        overlayDismissTimeout.current = setTimeout(() => {
          Animated.timing(overlayNoteAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            setOverlayNoteVisible(false);
            setOverlayWeightSuggestion(null);
          });
        }, dismissDelay);
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
    options?: { replaceOnly?: boolean },
  ) => {
    const exercise = (workout?.exercises ?? []).find(
      (ex) => ex.id === exerciseId,
    );
    const isSwapped = exerciseSwaps[exerciseId] !== undefined;
    const resolvedMuscleGroup = (() => {
      if (exercise?.muscleGroup && String(exercise.muscleGroup).trim() !== '') {
        return String(exercise.muscleGroup).trim();
      }
      const name = (exerciseSwaps[exerciseId] ?? exercise?.name ?? '').toLowerCase();
      if (name.includes('chest') || name.includes('bench') || name.includes('fly') || name.includes('pec')) return 'Chest';
      if (name.includes('back') || name.includes('row') || name.includes('pulldown') || name.includes('pull-up') || name.includes('deadlift')) return 'Back';
      if (name.includes('squat') || name.includes('leg press') || name.includes('lunge') || name.includes('quad') || name.includes('hack')) return 'Quads';
      if (name.includes('hamstring') || name.includes('leg curl') || name.includes('rdl') || name.includes('romanian')) return 'Hamstrings';
      if (name.includes('glute') || name.includes('hip thrust')) return 'Glutes';
      if (name.includes('calf') || name.includes('calves')) return 'Calves';
      if (name.includes('shoulder') || name.includes('delt') || name.includes('overhead press') || name.includes('lateral raise') || name.includes('front raise') || name.includes('face pull') || name.includes('rear delt')) return 'Shoulders';
      if (name.includes('bicep') || name.includes('curl') || name.includes('preacher')) return 'Biceps';
      if (name.includes('tricep') || name.includes('pushdown') || name.includes('skull') || name.includes('close grip')) return 'Triceps';
      if (name.includes('trap') || name.includes('shrug')) return 'Traps';
      if (name.includes('core') || name.includes('ab') || name.includes('plank') || name.includes('crunch')) return 'Core';
      return undefined;
    })();

    const newSet: LoggedSet = {
      exerciseId,
      exerciseName:
        exercise != null ? exerciseSwaps[exerciseId] || exercise.name : undefined,
      muscleGroup: resolvedMuscleGroup,
      setNumber,
      weightLbs: weight,
      reps,
      rpe,
      swapped: isSwapped,
    };

    const existingIdx = sets.findIndex(
      (s) => s.exerciseId === exerciseId && s.setNumber === setNumber,
    );
    const newSets =
      existingIdx >= 0
        ? sets.map((s, i) => (i === existingIdx ? newSet : s))
        : [...sets, newSet];
    setSets(newSets);

    // Persist draft so a crash can be recovered on next mount
    const draft: WorkoutDraft = {
      planId: sessionPlanIdForLogs ?? '',
      dayNumber: sessionDayNumber ?? params.dayNumber,
      weekNumber: sessionWeekForLogs,
      sets: newSets,
      savedAt: Date.now(),
    };
    void AsyncStorage.setItem(WORKOUT_DRAFT_KEY, JSON.stringify(draft));

    // Auto-collapse exercise card when all sets are logged
    if (!options?.replaceOnly && existingIdx < 0 && exercise) {
      const exerciseLoggedCount = newSets.filter(
        (s) => s.exerciseId === exerciseId,
      ).length;
      if (exerciseLoggedCount >= exercise.sets.length) {
        setTimeout(() => {
          setCollapsedExercises((prev) => new Set([...prev, exerciseId]));
        }, 600);
      }
    }

    if (options?.replaceOnly || existingIdx >= 0) {
      return;
    }

    if (newSets.length < totalSetsCount) {
      const duration = exercise
        ? resolveRestDurationSeconds(exercise)
        : 120;
      setRestDurationTotal(duration);
      startRestTimer(duration);
      setIsRestActive(true);
      void scheduleRestCompleteNotification(duration);
    }
    if (exercise) {
      const target = exercise.sets.find((s) => s.setNumber === setNumber);
      if (target) {
        const displayName = exerciseSwaps[exerciseId] || exercise.name;
        const isThisExerciseSwapped =
          exerciseSwaps[exerciseId] !== undefined;
        const isLastSetOfExercise = setNumber >= exercise.sets.length;
        const exercises = workout?.exercises ?? [];
        const exerciseIndex = exercises.findIndex((ex) => ex.id === exerciseId);
        const isLastExercise =
          exerciseIndex >= 0 && exerciseIndex === exercises.length - 1;
        console.log('[coaching debug]', {
          exerciseId,
          setStructure: exercise.setStructure,
          setTargets: exercise.setTargets,
        });
        console.log('[handleLogSet]', {
          setNumber,
          totalSets: exercise.sets.length,
          isLastSetOfExercise: setNumber >= exercise.sets.length,
          isPyramid: exercise.setStructure === 'pyramid',
        });
        void (async () => {
          // Query HR post-set — BLE takes priority over Apple Health
          let heartRate: { avgBpm: number | null; peakBpm: number | null } | null = null;
          if (ble.isConnected) {
            const bleHR = ble.getRecentHRAverage(90);
            if (bleHR.avgBpm !== null) {
              heartRate = { avgBpm: bleHR.avgBpm, peakBpm: bleHR.peakBpm };
            }
          }
          if (!heartRate) {
            const isHealthGranted =
              healthAvailable &&
              (await AsyncStorage.getItem(HEALTH_PERMISSION_GRANTED_KEY)) === '1';
            heartRate = isHealthGranted ? await queryPostSetHeartRate(90) : null;
          }

          console.log('[HR] post-set heart rate:', JSON.stringify(heartRate));

          console.log('[Recovery] passing to coaching-feedback:', JSON.stringify(recoveryContext));

          fetchCoachingNote(
            exerciseId,
            displayName,
            target.targetReps,
            isThisExerciseSwapped ? weight : target.targetWeight,
            target.targetRpe,
            reps,
            weight,
            rpe,
            {
              isUnilateral: exercise.isUnilateral,
              isLastSetOfExercise,
              isLastExercise,
              isPyramid: exercise.setStructure === 'pyramid',
              setNumber,
              totalSets: exercise.sets.length,
            },
            heartRate,
            recoveryContext,
          );
        })();
      }
    }
  };

  const handleEditSet = (
    exerciseId: string,
    setNumber: number,
    weight: number,
    reps: number,
    rpe: number | null,
  ) => {
    handleLogSet(exerciseId, setNumber, weight, reps, rpe, { replaceOnly: true });
  };

  const handleSkipExercise = (exerciseId: string) => {
    void hapticLight();
    // Remove any logged sets for this exercise
    setSets((prev) => prev.filter((s) => s.exerciseId !== exerciseId));
    setSkippedExercises((prev) => new Set([...prev, exerciseId]));
    // Also collapse if it was expanded
    setCollapsedExercises((prev) => {
      const next = new Set(prev);
      next.delete(exerciseId);
      return next;
    });
  };

  const handleUnskipExercise = (exerciseId: string) => {
    void hapticLight();
    setSkippedExercises((prev) => {
      const next = new Set(prev);
      next.delete(exerciseId);
      return next;
    });
  };

  const handleReorder = (exerciseId: string, direction: 'up' | 'down') => {
    setExerciseOrder((prev) => {
      const idx = prev.indexOf(exerciseId);
      if (idx < 0) return prev;
      const next = [...prev];
      if (direction === 'up' && idx > 0) {
        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      } else if (direction === 'down' && idx < next.length - 1) {
        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      }
      return next;
    });
    void hapticLight();
  };

  const handleSwapExercise = (
    exerciseId: string,
    newName: string,
    options?: {
      resetWeight?: boolean;
      prefilledWeight?: number;
      pyramidSets?: { setNumber: number; weightLbs: number }[];
    },
  ) => {
    const resetWeight = options?.resetWeight ?? false;
    const prefilledWeight = options?.prefilledWeight;
    const pyramidSets = options?.pyramidSets;

    void hapticMedium();
    setExerciseSwaps((prev) => ({ ...prev, [exerciseId]: newName }));

    if (pyramidSets && pyramidSets.length > 0) {
      setExercisePyramidSetsOverrides((prev) => ({
        ...prev,
        [exerciseId]: pyramidSets,
      }));
    } else {
      setExercisePyramidSetsOverrides((prev) => {
        const next = { ...prev };
        delete next[exerciseId];
        return next;
      });
    }

    if (prefilledWeight !== undefined) {
      setExerciseTargetWeightOverrides((prev) => ({
        ...prev,
        [exerciseId]: prefilledWeight,
      }));
    } else if (resetWeight) {
      setExerciseTargetWeightOverrides((prev) => ({
        ...prev,
        [exerciseId]: 0,
      }));
    }

    showToast(
      prefilledWeight && prefilledWeight > 0
        ? `Exercise swapped. Weight set to ${prefilledWeight} lbs from your history.`
        : resetWeight
          ? 'Exercise swapped. Choose your starting weight.'
          : 'Exercise swapped.',
    );
  };

  const skipRest = () => {
    void hapticLight();
    restEndTimeRef.current = null;
    void cancelRestTimerNotification();
    setIsRestActive(false);
    setRestSecondsRemaining(0);
  };

  const hasAnyRpeLogged = sets.some(
    (s) => s.rpe !== null && s.rpe > 0,
  );

  const openFinishFlow = () => {
    if (!hasAnyRpeLogged && sets.length > 0) {
      setShowRpeNudgeModal(true);
    } else {
      setShowFatigueSheet(true);
    }
  };

  const handleBack = () => {
    Alert.alert(
      'Leave workout?',
      'What would you like to do?',
      [
        {
          text: 'Keep Going',
          style: 'cancel',
        },
        {
          text: 'Finish & Save',
          onPress: openFinishFlow,
        },
        {
          text: 'Discard Workout',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        },
      ],
    );
  };

  const handleSaveAndFinish = async () => {
    if (fatigueRating === null) return;
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);

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

    if (__DEV__) {
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
      console.log('[SAVE workout_log]', {
        plan_id: planIdForLog,
        week_number: sessionWeekForLogs,
        day_number: dayNumberForLog,
        setsCount: sets.length,
        planIdSource,
        dayNumberSource:
          typeof sessionDayNumber === 'number'
            ? 'plan_json.dayNumber'
            : 'route.params',
      });
    }

    let prsHit = 0;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      if (userId && planIdForLog) {
        const { data: priorLogs } = await supabase
          .from('workout_logs')
          .select('sets_json')
          .eq('user_id', userId)
          .eq('plan_id', planIdForLog)
          .eq('skipped', false);

        const historicalBests = buildExerciseBestsFromLogs(priorLogs ?? []);
        // 1. Only count PR if exercise has prior history (historicalBests entry exists)
        // 2. Dedupe per exercise — take best set per exercise name, count once
        const prByExercise = new Map<string, { weight: number; reps: number }>();
        for (const s of sets) {
          const exercise = (workout?.exercises ?? []).find(
            (ex) => ex.id === s.exerciseId,
          );
          const name =
            (typeof s.exerciseName === 'string' && s.exerciseName.trim()) ||
            exercise?.name?.trim() ||
            '';
          if (!name) continue;
          const weight = Number(s.weightLbs ?? 0);
          const reps = Number(s.reps ?? 0);
          if (weight <= 0 || reps <= 0) continue;
          // Require prior history — week 1 with no logs doesn't count as PR
          if (!historicalBests[name]) continue;
          if (!isNewWeightPR(weight, reps, historicalBests[name])) continue;
          const existing = prByExercise.get(name);
          if (!existing || weight > existing.weight || (weight === existing.weight && reps > existing.reps)) {
            prByExercise.set(name, { weight, reps });
          }
        }
        prsHit = prByExercise.size;
      }

      // isUnilateral exercises: reps logged here are per-side. Volume calc multiplies ×2.
      // Do NOT double the value before storing — store exactly what the user entered.
      const { error: insertError } = await supabase
        .from('workout_logs')
        .upsert(
          {
            user_id: userId,
            plan_id: planIdForLog,
            week_number: sessionWeekForLogs,
            day_number: dayNumberForLog,
            logged_at: new Date().toISOString(),
            session_fatigue_rating: fatigueRating,
            notes: sessionNotes || null,
            sets_json: sets,
          },
          { onConflict: 'plan_id,week_number,day_number' },
        );

      if (insertError) throw insertError;

      const swapEntries = Object.entries(exerciseSwaps);
      if (swapEntries.length > 0 && planIdForLog && dayNumberForLog != null) {
        await persistExerciseSwapsToPlan(
          planIdForLog,
          sessionWeekForLogs,
          dayNumberForLog,
          exerciseSwaps,
        );
      }

      // Clear crash-recovery draft on successful save
      await AsyncStorage.removeItem(WORKOUT_DRAFT_KEY);

      // Write session meta to plan_json so HomeScreen can display accurate stats
      // on the workout complete card without relying on stale route params
      try {
        const { data: currentPlan } = await supabase
          .from('plans')
          .select('plan_json')
          .eq('id', planIdForLog)
          .maybeSingle();

        if (currentPlan?.plan_json && typeof currentPlan.plan_json === 'object') {
          await supabase
            .from('plans')
            .update({
              plan_json: {
                ...(currentPlan.plan_json as Record<string, unknown>),
                lastSessionMeta: {
                  durationMinutes: Math.floor(elapsedSeconds / 60),
                  prsHit,
                  totalSets: sets.length,
                  dayNumber: dayNumberForLog,
                  weekNumber: sessionWeekForLogs,
                  savedAt: new Date().toISOString(),
                },
              },
            })
            .eq('id', planIdForLog);
        }
      } catch (metaErr) {
        // Non-blocking — session was already saved successfully
        if (__DEV__) console.warn('[lastSessionMeta] write failed:', metaErr);
      }
    } catch (err) {
      console.error('[SAVE workout_log] failed:', err);
      isSavingRef.current = false;
      setIsSaving(false);
      Alert.alert(
        'Save Failed',
        'Your workout could not be saved. Try again?',
        [
          {
            text: 'Retry',
            onPress: () => { void handleSaveAndFinish(); },
          },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.goBack(),
          },
        ],
      );
      return;
    }

    setShowFatigueSheet(false);

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
      weekNumber: sessionWeekForLogs,
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

  const sessionPhaseBadgeLabel = (() => {
    const p = sessionPlanPhaseRaw?.toLowerCase();
    if (!p) return null;
    const map: Record<string, string> = {
      baseline: 'BASELINE',
      accumulation: 'ACCUMULATION',
      intensification: 'INTENSIFICATION',
      deload: 'DELOAD',
    };
    return map[p] ?? null;
  })();

  const phase1Exercise = workoutExercises.find((e) => e.phase === 'strength');
  const phase1Reps = phase1Exercise?.reps ?? '3–6';
  const phase2Exercise = workoutExercises.find((e) => e.phase === 'hypertrophy');
  const phase2Reps = phase2Exercise?.reps ?? '8–12';

  const restProgressWidth: DimensionValue =
    restDurationTotal > 0
      ? `${Math.max(0, Math.min(100, (restSecondsRemaining / restDurationTotal) * 100))}%`
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
          <View style={styles.workoutTitleCenter} pointerEvents="box-none">
            <Text style={styles.workoutTitleText} numberOfLines={1}>
              {displayWorkoutTitle}
            </Text>
            {sessionPhaseBadgeLabel ? (
              <View style={styles.sessionPhaseBadge}>
                <Text style={styles.sessionPhaseBadgeText}>
                  {sessionPhaseBadgeLabel}
                </Text>
              </View>
            ) : null}
          </View>
          {ble.isConnected && ble.currentHR !== null ? (
            <TouchableOpacity
              style={styles.bleHRBadge}
              onPress={() => setShowBLESheet(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="heart" size={12} color={Colors.danger} />
              <Text style={styles.bleHRBadgeText}>{ble.currentHR} bpm</Text>
            </TouchableOpacity>
          ) : !ble.isConnected && !ble.pairedDevice ? (
            <TouchableOpacity
              style={styles.bleConnectPrompt}
              onPress={() => setShowBLESheet(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="bluetooth-outline" size={12} color={Colors.textTertiary} />
              <Text style={styles.bleConnectPromptText}>HR monitor</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.timerText}>{formatTime(elapsedSeconds)}</Text>
        </View>

        <View style={styles.bodyWrap}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {orderedExercises.map((exercise, exerciseIdx) => {
              const exercises = orderedExercises;
              const prevExercise = exerciseIdx > 0 ? exercises[exerciseIdx - 1] : null;
              const isFirst = exerciseIdx === 0;
              const isLast = exerciseIdx === exercises.length - 1;
              const isCollapsed = collapsedExercises.has(exercise.id);
              const isSkipped = skippedExercises.has(exercise.id);
              const exerciseSets = sets.filter(
                (s) => s.exerciseId === exercise.id,
              );
              const allSetsComplete =
                exerciseSets.length >= exercise.sets.length;
              return (
                <View key={exercise.id}>
                  {exercise.phase === 'strength' && exerciseIdx === 0 && (
                    <View style={styles.phaseHeader}>
                      <Text style={styles.phaseHeaderText}>PHASE 1: STRENGTH</Text>
                      <Text style={styles.phaseHeaderSub}>
                        Heavy compounds · {phase1Reps} reps · RPE 8–9
                      </Text>
                    </View>
                  )}
                  {exercise.phase === 'hypertrophy' && prevExercise?.phase === 'strength' && (
                    <View style={styles.phaseHeader}>
                      <Text style={styles.phaseHeaderText}>PHASE 2: HYPERTROPHY</Text>
                      <Text style={styles.phaseHeaderSub}>
                        Accessories · {phase2Reps} reps · RPE 7–8
                      </Text>
                    </View>
                  )}
                  {isSkipped ? (
                    // Skipped: unified single row — arrows + name + undo
                    <View style={styles.unifiedRow}>
                      <TouchableOpacity
                        style={styles.reorderBtn}
                        activeOpacity={0.6}
                        disabled={isFirst}
                        onPress={() => handleReorder(exercise.id, 'up')}
                      >
                        <Ionicons
                          name="chevron-up"
                          size={18}
                          color={isFirst ? Colors.textTertiary : Colors.textSecondary}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.reorderBtn}
                        activeOpacity={0.6}
                        disabled={isLast}
                        onPress={() => handleReorder(exercise.id, 'down')}
                      >
                        <Ionicons
                          name="chevron-down"
                          size={18}
                          color={isLast ? Colors.textTertiary : Colors.textSecondary}
                        />
                      </TouchableOpacity>
                      <View style={styles.unifiedRowContent}>
                        <Text style={styles.unifiedRowName} numberOfLines={1}>
                          {exerciseSwaps[exercise.id] ?? exercise.name}
                        </Text>
                        <Text style={styles.unifiedRowMeta}>Skipped</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.unskipBtn}
                        activeOpacity={0.7}
                        onPress={() => handleUnskipExercise(exercise.id)}
                      >
                        <Text style={styles.unskipBtnText}>Undo</Text>
                      </TouchableOpacity>
                    </View>
                  ) : isCollapsed ? (
                    // Collapsed: unified single row — arrows + name + sets count
                    // Tap anywhere on the content area to expand
                    <TouchableOpacity
                      style={styles.unifiedRow}
                      activeOpacity={0.7}
                      onPress={() => {
                        setCollapsedExercises((prev) => {
                          const next = new Set(prev);
                          next.delete(exercise.id);
                          return next;
                        });
                      }}
                    >
                      <TouchableOpacity
                        style={styles.reorderBtn}
                        activeOpacity={0.6}
                        disabled={isFirst}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleReorder(exercise.id, 'up');
                        }}
                      >
                        <Ionicons
                          name="chevron-up"
                          size={18}
                          color={isFirst ? Colors.textTertiary : Colors.textSecondary}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.reorderBtn}
                        activeOpacity={0.6}
                        disabled={isLast}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleReorder(exercise.id, 'down');
                        }}
                      >
                        <Ionicons
                          name="chevron-down"
                          size={18}
                          color={isLast ? Colors.textTertiary : Colors.textSecondary}
                        />
                      </TouchableOpacity>
                      <View style={styles.unifiedRowContent}>
                        <Text style={styles.unifiedRowName} numberOfLines={1}>
                          {exerciseSwaps[exercise.id] ?? exercise.name}
                        </Text>
                        <Text style={styles.unifiedRowMeta}>
                          {exerciseSets.length} sets ✓
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-down"
                        size={16}
                        color={Colors.textTertiary}
                      />
                    </TouchableOpacity>
                  ) : (
                    // Expanded: control row above card as before
                    <>
                      <View style={styles.exerciseControlRow}>
                        <TouchableOpacity
                          style={styles.reorderBtn}
                          activeOpacity={0.6}
                          disabled={isFirst}
                          onPress={() => handleReorder(exercise.id, 'up')}
                        >
                          <Ionicons
                            name="chevron-up"
                            size={18}
                            color={isFirst ? Colors.textTertiary : Colors.textSecondary}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.reorderBtn}
                          activeOpacity={0.6}
                          disabled={isLast}
                          onPress={() => handleReorder(exercise.id, 'down')}
                        >
                          <Ionicons
                            name="chevron-down"
                            size={18}
                            color={isLast ? Colors.textTertiary : Colors.textSecondary}
                          />
                        </TouchableOpacity>
                        {!allSetsComplete ? (
                          <TouchableOpacity
                            style={styles.skipExerciseBtn}
                            activeOpacity={0.7}
                            onPress={() => handleSkipExercise(exercise.id)}
                          >
                            <Text style={styles.skipExerciseBtnText}>Skip</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={styles.collapseBtn}
                            activeOpacity={0.7}
                            onPress={() => {
                              setCollapsedExercises((prev) => {
                                const next = new Set(prev);
                                next.add(exercise.id);
                                return next;
                              });
                            }}
                          >
                            <Text style={styles.collapseBtnText}>Collapse ↑</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                  <ExerciseCard
                    exercise={exercise}
                    loggedSets={sets.filter((s) => s.exerciseId === exercise.id)}
                    previousSets={getPreviousSetsForExercise(
                      previousSetsMap,
                      exercise.id,
                      exerciseSwaps[exercise.id] ?? exercise.name,
                    )}
                    isActiveCard={exerciseIdx === activeExerciseIndex}
                    swappedName={exerciseSwaps[exercise.id] ?? null}
                    coachingNote={coachingNotes[exercise.id] ?? null}
                    coachingLoading={coachingLoading[exercise.id] ?? false}
                    weekNumber={sessionWeekForLogs}
                    goal={workout?.goal ?? 'strength'}
                    programGoalLift={workout?.goalLift ?? null}
                    onLogSet={handleLogSet}
                    onEditSet={handleEditSet}
                    onSwapExercise={handleSwapExercise}
                    experience={workoutExperience}
                    planId={
                      sessionPlanIdForLogs ??
                      resolvedPlanId ??
                      (typeof params.planId === 'string'
                        ? params.planId.trim()
                        : params.planId)
                    }
                    targetWeightOverride={
                      exerciseTargetWeightOverrides[exercise.id] ?? undefined
                    }
                    pyramidSetsOverride={
                      exercisePyramidSetsOverrides[exercise.id] ?? undefined
                    }
                    currentWorkoutExerciseNames={orderedExercises.map(
                      (e) => exerciseSwaps[e.id] ?? e.name,
                    )}
                  />
                    </>
                  )}
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
                  {formatRestCountdown(restSecondsRemaining)}
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
              onPress={openFinishFlow}
            >
              <Text style={styles.finishButtonText}>Finish Workout</Text>
            </TouchableOpacity>
          </View>
        ) : null}

      {overlayNoteVisible && overlayNote && (
        <Animated.View
          style={[
            styles.jordanNoteOverlay,
            { opacity: overlayNoteAnim },
          ]}
        >
          <View style={styles.jordanNoteOverlayContent}>
            <View style={styles.jordanNoteOverlayHeader}>
              <Text style={styles.jordanNoteOverlayLabel}>JORDAN</Text>
              <TouchableOpacity
                onPress={() => {
                  if (overlayDismissTimeout.current) {
                    clearTimeout(overlayDismissTimeout.current);
                  }
                  Animated.timing(overlayNoteAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                  }).start(() => {
                    setOverlayNoteVisible(false);
                    setOverlayWeightSuggestion(null);
                  });
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={Colors.textTertiary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.jordanNoteOverlayText}>
              {stripEmDash(overlayNote ?? '')}
            </Text>
            {overlayWeightSuggestion != null ? (
              <TouchableOpacity
                style={styles.jordanWeightSuggestionPill}
                activeOpacity={0.8}
                onPress={() => {
                  void hapticMedium();
                  setExerciseTargetWeightOverrides((prev) => ({
                    ...prev,
                    [overlayWeightSuggestion.exerciseId]:
                      overlayWeightSuggestion.weightLbs,
                  }));
                  if (overlayDismissTimeout.current) {
                    clearTimeout(overlayDismissTimeout.current);
                  }
                  Animated.timing(overlayNoteAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                  }).start(() => {
                    setOverlayNoteVisible(false);
                    setOverlayWeightSuggestion(null);
                  });
                  showToast(`Next set: ${overlayWeightSuggestion.weightLbs} lbs`);
                }}
              >
                <Text style={styles.jordanWeightSuggestionText}>
                  Use {overlayWeightSuggestion.weightLbs} lbs →
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>
      )}

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
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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
                  onPress={() => {
                    void hapticLight();
                    setFatigueRating(opt.rating);
                  }}
                >
                  <Animated.View
                    style={[
                      styles.emojiCard,
                      isSelected && styles.emojiCardSelected,
                      { transform: [{ scale: fatigueEmojiScales[i] }] },
                    ]}
                  >
                    <View
                      style={[
                        styles.ratingDot,
                        { backgroundColor: opt.color },
                        isSelected && styles.ratingDotSelected,
                      ]}
                    />
                    <Text style={styles.emojiLabel}>{opt.label}</Text>
                  </Animated.View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            style={styles.notesInput}
            placeholder="Notes for Jordan — injuries, how you felt, anything that affected today (optional)"
            placeholderTextColor={Colors.textTertiary}
            value={sessionNotes}
            onChangeText={setSessionNotes}
            multiline
            numberOfLines={3}
            maxLength={500}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />

          {isSaving ? (
            <View style={styles.savingOverlay}>
              <ActivityIndicator color={Colors.accent} size="small" />
              <Text style={styles.savingOverlayText}>Saving workout...</Text>
            </View>
          ) : (
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
          )}
        </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={showRpeNudgeModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowRpeNudgeModal(false);
          setShowFatigueSheet(true);
        }}
      >
        <View style={styles.rpeNudgeRoot}>
          <Pressable
            style={styles.rpeNudgeOverlay}
            onPress={() => {
              setShowRpeNudgeModal(false);
              setShowFatigueSheet(true);
            }}
          />
          <View style={styles.rpeNudgeSheet}>
            <View style={styles.rpeNudgeHandle} />

            <View style={styles.rpeNudgeHeaderRow}>
              <JordanAvatar size={32} />
              <Text style={styles.rpeNudgeJordanLabel}>JORDAN</Text>
            </View>

            <Text style={styles.rpeNudgeTitle}>
              No effort ratings this session.
            </Text>

            <Text style={styles.rpeNudgeBody}>
              RPE tells me how hard each set was. Without it, I'm estimating
              your Week {(resolvedPlanWeekNumber ?? 1) + 1} weights instead of
              calculating them from your actual effort. Rate effort on your next
              session and your plan adapts to you specifically.
            </Text>

            <View style={styles.rpeNudgeActions}>
              <TouchableOpacity
                style={styles.rpeNudgeSecondary}
                activeOpacity={0.7}
                onPress={() => {
                  setShowRpeNudgeModal(false);
                  setRpeReferenceFromNudge(true);
                  setShowRpeReference(true);
                }}
              >
                <Text style={styles.rpeNudgeSecondaryText}>What is RPE?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.rpeNudgePrimary}
                activeOpacity={0.8}
                onPress={() => {
                  setShowRpeNudgeModal(false);
                  setShowFatigueSheet(true);
                }}
              >
                <Text style={styles.rpeNudgePrimaryText}>
                  Got it — I'll rate next time
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <RPEReferenceSheet
        visible={showRpeReference}
        onClose={() => {
          setShowRpeReference(false);
          if (rpeReferenceFromNudge) {
            setRpeReferenceFromNudge(false);
            setShowFatigueSheet(true);
          }
        }}
      />

      {/* ── Warmup modal ── */}
      {showWarmupModal ? (
      <Modal
        visible={showWarmupModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWarmupModal(false)}
      >
        <View style={styles.warmupRoot}>
          <View style={styles.warmupSheet}>
            <View style={styles.warmupHandle} />

            {/* Timer */}
            <View style={styles.warmupTimerRow}>
              <View style={styles.warmupTimerRingWrap}>
                {(() => {
                  const SIZE = 148;
                  const STROKE = 5;
                  const R = (SIZE - STROKE) / 2;
                  const CIRCUMFERENCE = 2 * Math.PI * R;
                  const progress = warmupSecondsRemaining / WARMUP_DURATION_SECONDS;
                  const dashOffset = CIRCUMFERENCE * (1 - progress);
                  return (
                    <Svg
                      width={SIZE}
                      height={SIZE}
                      style={styles.warmupTimerRingSvg}
                    >
                      <Circle
                        cx={SIZE / 2}
                        cy={SIZE / 2}
                        r={R}
                        stroke={Colors.divider}
                        strokeWidth={STROKE}
                        fill="none"
                      />
                      <Circle
                        cx={SIZE / 2}
                        cy={SIZE / 2}
                        r={R}
                        stroke={Colors.accent}
                        strokeWidth={STROKE}
                        fill="none"
                        strokeDasharray={`${CIRCUMFERENCE}`}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                        rotation="-90"
                        origin={`${SIZE / 2}, ${SIZE / 2}`}
                      />
                    </Svg>
                  );
                })()}
                <View style={styles.warmupTimerInner}>
                  <Text style={styles.warmupTimerLabel}>WARM UP</Text>
                  <Text style={styles.warmupTimer}>
                    {formatRestCountdown(warmupSecondsRemaining)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Jordan one-liner */}
            <View style={styles.warmupJordanRow}>
              <JordanAvatar size={28} />
              <Text style={styles.warmupJordanText}>
                {WARMUP_JORDAN_LINES[warmupCategory]}
              </Text>
            </View>

            {/* Warmup moves */}
            <View style={styles.warmupMovesList}>
              {WARMUP_MOVES[warmupCategory].map((move, i) => (
                <View
                  key={i}
                  style={[
                    styles.warmupMoveRow,
                    i < WARMUP_MOVES[warmupCategory].length - 1 &&
                      styles.warmupMoveRowBorder,
                  ]}
                >
                  <View style={styles.warmupMoveDot} />
                  <View style={styles.warmupMoveText}>
                    <Text style={styles.warmupMoveName}>{move.name}</Text>
                    <Text style={styles.warmupMoveDetail}>{move.detail}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Start workout button */}
            <TouchableOpacity
              style={styles.warmupStartBtn}
              activeOpacity={0.85}
              onPress={() => setShowWarmupModal(false)}
            >
              <Text style={styles.warmupStartBtnText}>Start Workout →</Text>
            </TouchableOpacity>

            {/* Don't show again */}
            <TouchableOpacity
              style={styles.warmupSkipBtn}
              activeOpacity={0.7}
              onPress={async () => {
                const planIdForSkip = sessionPlanIdForLogs;
                if (planIdForSkip) {
                  const skipKey = `${WARMUP_SKIP_KEY_PREFIX}${planIdForSkip}`;
                  await AsyncStorage.setItem(skipKey, '1');
                }
                setShowWarmupModal(false);
              }}
            >
              <Text style={styles.warmupSkipText}>Don&apos;t show again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      ) : null}

      {showPreSessionModal ? (
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
            <View style={styles.preSessionAvatarWrap}>
              <JordanAvatar size={40} />
            </View>
            <Text style={styles.preSessionLabel}>JORDAN</Text>
            <Text style={styles.preSessionMessage}>
              {preSessionMessage != null ? stripEmDash(preSessionMessage) : ''}
            </Text>
            <Pressable
              style={styles.preSessionCTA}
              onPress={() => setShowPreSessionModal(false)}
            >
              <Text style={styles.preSessionCTAText}>Let's go →</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      ) : null}
      </View>
      <BLEDeviceSheet
        visible={showBLESheet}
        onClose={() => setShowBLESheet(false)}
        onConnect={ble.connect}
        onDisconnect={ble.disconnect}
        onStartScan={ble.startScan}
        onStopScan={ble.stopScan}
        devices={ble.devices}
        connectionState={ble.connectionState}
        connectedDeviceName={ble.isConnected
          ? getBLEHeartRateManager().getConnectedDeviceName()
          : null}
        pairedDevice={ble.pairedDevice}
        error={ble.error}
      />
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
    justifyContent: 'center',
    alignItems: 'flex-start',
    pointerEvents: 'box-none',
  },
  workoutTitleText: {
    width: '100%',
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    textAlign: 'left',
  },
  sessionPhaseBadge: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sessionPhaseBadgeText: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    letterSpacing: 1,
    color: Colors.textSecondary,
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
  bleHRBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  bleHRBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.danger,
  },
  bleConnectPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  bleConnectPromptText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
  },

  exerciseControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    paddingBottom: Spacing.xs,
    gap: Spacing.xs,
  },
  reorderBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  collapseBtn: {
    flex: 1,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  collapseBtnText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  unifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  unifiedRowContent: {
    flex: 1,
    marginHorizontal: Spacing.xs,
  },
  unifiedRowName: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  unifiedRowMeta: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  unskipBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  unskipBtnText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  skipExerciseBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.divider,
    marginLeft: 'auto',
  },
  skipExerciseBtnText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
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

  jordanNoteOverlay: {
    position: 'absolute',
    top: 72,
    left: Spacing.xl,
    right: Spacing.xl,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.md,
    zIndex: 200,
  },
  jordanNoteOverlayLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  jordanNoteOverlayText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  jordanNoteOverlayDismiss: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textTertiary,
    paddingLeft: 4,
  },
  jordanNoteOverlayContent: {
    flex: 1,
    flexDirection: 'column',
    gap: Spacing.xs,
  },
  jordanNoteOverlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },

  jordanWeightSuggestionPill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginTop: Spacing.xs,
  },
  jordanWeightSuggestionText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
    letterSpacing: 0.3,
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
  ratingDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginBottom: 8,
    opacity: 0.5,
  },
  ratingDotSelected: {
    opacity: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
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
  savingOverlay: {
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  savingOverlayText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
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
  preSessionAvatarWrap: {
    alignSelf: 'center',
    marginBottom: Spacing.sm,
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

  rpeNudgeRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  rpeNudgeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  rpeNudgeSheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: Spacing.xl,
    paddingBottom: 48,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  rpeNudgeHandle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  rpeNudgeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  rpeNudgeJordanLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
  },
  rpeNudgeTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  rpeNudgeBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 24,
    marginBottom: Spacing.xl,
  },
  rpeNudgeActions: {
    gap: Spacing.sm,
  },
  rpeNudgePrimary: {
    height: 56,
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rpeNudgePrimaryText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  rpeNudgeSecondary: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rpeNudgeSecondaryText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.accent,
  },
  warmupRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlay,
  },
  warmupSheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: 48,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  warmupHandle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  warmupTimerRow: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  warmupTimerRingWrap: {
    width: 148,
    height: 148,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warmupTimerRingSvg: {
    position: 'absolute',
  },
  warmupTimerInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  warmupTimerLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    letterSpacing: 2,
    marginBottom: 2,
  },
  warmupTimer: {
    fontFamily: Fonts.bold,
    fontSize: 40,
    color: Colors.accent,
    fontVariant: ['tabular-nums'],
    lineHeight: 46,
  },
  warmupJordanRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.xs,
    paddingBottom: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  warmupJordanText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  warmupMovesList: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    marginBottom: Spacing.xl,
    overflow: 'hidden',
  },
  warmupMoveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  warmupMoveRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  warmupMoveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
    flexShrink: 0,
  },
  warmupMoveText: {
    flex: 1,
  },
  warmupMoveName: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  warmupMoveDetail: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  warmupStartBtn: {
    height: 56,
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  warmupStartBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  warmupSkipBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  warmupSkipText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },
});

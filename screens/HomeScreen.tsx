import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  Share,
  type DimensionValue,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions, useFocusEffect, useNavigation } from '@react-navigation/native';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  getLocalDateString,
  getNextTrainingDay,
  getTodayDayLabel,
  isLastScheduledTrainingDayToday,
  isPlanStartDateReached,
  isTodayTrainingDay,
} from '../utils/dateUtils';
import {
  type SessionSignal,
  PRE_SESSION_COPY,
} from '../utils/sessionSignal';
import {
  checkMissedSession,
  markSessionSkipped,
  rescheduleSession,
  type MissedSessionResult,
} from '../utils/missedSession';
import { useMetric, convertSessionFocus } from '../utils/units';
import CardioDayCard from '../components/CardioDayCard';
import CardioDoneCard from '../components/CardioDoneCard';
import ActivityLogSheet, { type ActivityLogRow } from '../components/ActivityLogSheet';
import { resolveActivityCaloriesBurned } from '../utils/activityCalories';
import WorkoutResultsModal, {
  type WorkoutLog,
  type ExerciseObject,
} from '../components/WorkoutResultsModal';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { ShareCard, SHARE_CARD_WIDTH, type ShareCardProps } from '../components/ShareCard';
import { prepareShareCardData, captureAndShareCard } from '../utils/workoutShareAction';
import DailyCheckInSheet from '../components/DailyCheckInSheet';

function formatActivityIntensityShort(intensity: string): string {
  if (intensity === 'low') return 'Low';
  if (intensity === 'moderate') return 'Moderate';
  if (intensity === 'high') return 'High';
  return intensity.charAt(0).toUpperCase() + intensity.slice(1);
}
import { JordanAvatar } from '../components/JordanAvatar';
import { useEntitlement } from '../hooks/useEntitlement';
import { epleyEstimated1RMLbs, matchesTargetLift } from '../utils/strengthGoalLift';
import { parseSetsJson } from '../utils/workoutHistoryData';
import { useAuth } from '../contexts/AuthContext';
import { stripEmDash, cleanJordanMessage } from '../utils/jordanText';
import { Ionicons } from '@expo/vector-icons';

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
  type: 'workout' | 'rest' | 'cardio';
  title: string;
  muscleGroups: string[];
  exercises: Exercise[];
  isNextWeek?: boolean;
  sessionFocus?: string;
  /** When present, matches onboarding day chips (Mon–Sun) */
  dayLabel?: string;
  cardioType?: 'light' | 'medium';
  suggestedDurationMinutes?: number;
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
  /** From plan_json.goal — used for cardio hero (fat_loss / recomp only) */
  planGoal?: string | null;
  /** Cardio day matching today's calendar label, if any */
  todayCardioDay?: WorkoutDay | null;
  /** cardio_logs row exists for todayCardioDay */
  cardioLoggedToday?: boolean;
  /** Calendar training schedule — maps plan days to weekday labels */
  scheduledDays: string[];
  hasDayLabels: boolean;
  /** plan_json excerpts for Jordan card copy only */
  jordanPlanMeta?: {
    jordanWelcome?: string;
    jordanNote?: string;
  };
  /** Mirrors plan_json fields used by Jordan card (session note + welcome) */
  plan_json?: {
    latestJordanNote?: string | null;
    latestJordanNoteUpdatedAt?: string | null;
    jordanWelcome?: string | null;
  };
  /** Set when the plan start_date is in the future — shows "starts on" hero */
  planStartsOn?: string | null;
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

function formatJordanCardUpdatedLabel(
  iso: string | null | undefined,
): string {
  if (!iso || typeof iso !== 'string') return 'Updated today';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Updated recently';

  const startOfLocalDay = (t: Date) => {
    return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  };
  const now = new Date();
  if (startOfLocalDay(d) >= startOfLocalDay(now)) {
    return 'Updated today';
  }
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `Updated ${m}/${day}/${String(y).slice(-2)}`;
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
      color: Colors.bgPrimary,
      bg: Colors.accent,
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
 * Hero session: the first unlogged workout in plan order when it is a training day.
 * Calendar day gates whether we show anything, but the session index is determined
 * by completion count — not by mapping today's weekday to a scheduledDays index.
 * This handles mid-week plan starts correctly (e.g. starting on Wed shows Day 1, not Day 2).
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
    // Cold-start: map today's calendar position to the correct
    // plan day even in bypass/week1 mode
    const noSessionsLogged = completedDayNumbers.size === 0;
    if (noSessionsLogged && scheduledDays.length > 0 && todayLabel) {
      const normalizedScheduled = scheduledDays.map((d) =>
        d.trim().slice(0, 3),
      );
      const todayIndex = normalizedScheduled.indexOf(todayLabel);
      if (todayIndex >= 0) {
        const workoutDaysOrdered = weekDays
          .filter((d) => d.type === 'workout')
          .sort((a, b) => a.dayNumber - b.dayNumber);
        const targetWorkout = workoutDaysOrdered[todayIndex] ?? null;
        if (targetWorkout) return targetWorkout;
      }
    }
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

  // If no sessions logged yet (cold start), map today's calendar
  // position in scheduledDays to the correct plan day number.
  // This prevents a Friday starter from seeing Day 1 when their
  // plan has Day 1 on Monday and Day 5 on Friday.
  const noSessionsLogged = completedDayNumbers.size === 0;
  if (noSessionsLogged && scheduledDays.length > 0 && todayLabel) {
    const normalizedScheduled = scheduledDays.map((d) =>
      d.trim().slice(0, 3),
    );
    const todayIndex = normalizedScheduled.indexOf(todayLabel);
    if (todayIndex >= 0) {
      // Find the workout day that corresponds to this position
      // in the scheduled days array
      const workoutDaysOrdered = weekDays
        .filter((d) => d.type === 'workout')
        .sort((a, b) => a.dayNumber - b.dayNumber);
      const targetWorkout = workoutDaysOrdered[todayIndex] ?? workoutDaysOrdered[0];
      if (targetWorkout) return targetWorkout;
    }
  }

  const w = firstUnloggedInSequence();
  if (w) return w;

  if (nextWeekReady && nextWeekFirstWorkout && allWorkoutsInWeekLogged) {
    return { ...nextWeekFirstWorkout, isNextWeek: true };
  }

  return null;
}

const ALL_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const SUMMARY_FALLBACK_ATTEMPTED_KEY = 'hone_summary_fallback_attempted_week';

/**
 * Map plan dayNumber → calendar label: week days are ordered in plan_json;
 * first plan day aligns with first scheduled training day, then consecutive calendar days.
 */
/** Plan day whose calendar label matches today (any type: workout, rest, cardio). */
function findTodayPlanDayByCalendar(
  weekDays: WorkoutDay[],
  todayLabel: string,
  scheduledDays: string[],
): WorkoutDay | null {
  if (!scheduledDays?.length) return null;

  const firstScheduledIdx = ALL_DAY_LABELS.indexOf(
    scheduledDays[0] as (typeof ALL_DAY_LABELS)[number],
  );
  if (firstScheduledIdx < 0) return null;

  const ordered = [...weekDays].sort((a, b) => a.dayNumber - b.dayNumber);
  const dayNumberToLabel: Record<number, string> = {};
  ordered.forEach((day, idx) => {
    const calendarIdx = (firstScheduledIdx + idx) % 7;
    dayNumberToLabel[day.dayNumber] = ALL_DAY_LABELS[calendarIdx];
  });

  return ordered.find((d) => dayNumberToLabel[d.dayNumber] === todayLabel) ?? null;
}

function findTodayCardioDayByWeekMap(
  weekDays: WorkoutDay[],
  todayLabel: string,
  scheduledDays: string[],
): WorkoutDay | null {
  const d = findTodayPlanDayByCalendar(weekDays, todayLabel, scheduledDays);
  return d?.type === 'cardio' ? d : null;
}

function getJordanRecoverySuggestion(goal: string | null | undefined): string {
  const g = String(goal ?? 'general').toLowerCase();
  const map: Record<string, string> = {
    fat_loss:
      'Active recovery today: a 20–30 minute walk keeps metabolism up without cutting into tomorrow\'s session. Avoid anything that raises heart rate above conversational pace.',
    hypertrophy:
      'Muscles grow on rest days, not training days. Today counts as doing real work. Stay out of the gym. Light walking or stretching is fine; anything that creates soreness is not.',
    strength:
      'CNS recovery is the priority today. Keep activity light. A walk is fine, but skip anything that taxes your nervous system. You need to be fresh for your next heavy session.',
    power_hypertrophy:
      'Today is for CNS recovery. Your sessions are demanding, so respect the rest. Light mobility work is fine; anything that creates fatigue is working against tomorrow\'s output.',
    recomp:
      'Active recovery today: a 20–30 minute walk supports fat loss without adding recovery debt. Avoid intense cardio; you need to be fresh for your next lifting session.',
    general:
      'Take it easy today. A walk, some light stretching, or just doing nothing are all good choices. Recovery is part of the plan, not a break from it.',
  };
  return map[g] ?? 'Rest up today. Your next session will be better for it.';
}

function RecoveryDayCard({
  planGoal,
  dayNumber,
}: {
  planGoal: string | null | undefined;
  dayNumber: number | null;
}) {
  const suggestion = getJordanRecoverySuggestion(planGoal);
  return (
    <View style={styles.recoveryDayCard}>
      <View style={styles.recoveryDayHeaderRow}>
        <Text style={styles.recoveryDayPill}>REST DAY</Text>
        {dayNumber != null ? (
          <Text style={styles.recoveryDayContext}>{`Day ${dayNumber}`}</Text>
        ) : null}
      </View>
      <Text style={styles.recoveryDayTitle}>Recovery Day</Text>
      <View style={styles.jordanSuggestionCard}>
        <Text style={styles.jordanSuggestionBrand}>JORDAN</Text>
        <Text style={styles.jordanSuggestionBody}>{suggestion}</Text>
      </View>
      <View style={styles.recoveryPillarsRow}>
        <View style={styles.recoveryPillarCard}>
          <Ionicons name="moon-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.recoveryPillarLabel}>SLEEP</Text>
          <Text style={styles.recoveryPillarValueBold}>8–9 hrs</Text>
        </View>
        <View style={styles.recoveryPillarCard}>
          <Ionicons name="restaurant-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.recoveryPillarLabel}>PROTEIN</Text>
          <Text style={styles.recoveryPillarValueProtein}>Hit your target</Text>
        </View>
        <View style={styles.recoveryPillarCard}>
          <Ionicons name="water-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.recoveryPillarLabel}>HYDRATION</Text>
          <Text style={styles.recoveryPillarValueBold}>2–3 L water</Text>
        </View>
      </View>
    </View>
  );
}

const SLEEP_PILL_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: '5h' },
  { value: 6, label: '6h' },
  { value: 7, label: '7h' },
  { value: 8, label: '8h' },
  { value: 9, label: '9h' },
  { value: 10, label: '10h+' },
];

/** Map DB `sleep_hours` to a selectable pill value, or null if no match. */
function mapDbSleepHoursToPill(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return null;
  for (const { value: v } of SLEEP_PILL_OPTIONS) {
    if (Math.abs(n - v) < 0.01) return v;
  }
  return null;
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

const formatLiftName = (lift: string) =>
  lift.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function getBestEpleyFromWeekLogs(
  logs: Array<{ sets_json?: unknown }>,
  targetLift: string | null,
): number | null {
  if (!targetLift) return null;
  let best = 0;
  for (const log of logs) {
    for (const s of parseSetsJson(log.sets_json)) {
      const name = s.exerciseName ?? s.name ?? '';
      if (!matchesTargetLift(name, targetLift)) continue;
      const w = Number(s.weightLbs ?? s.weight ?? 0);
      const r = Number(s.reps ?? 0);
      if (w <= 0 || r <= 0) continue;
      const est = epleyEstimated1RMLbs(w, r);
      if (est > best) best = est;
    }
  }
  return best > 0 ? best : null;
}

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { session } = useAuth();
  const {
    isPro,
    status: entitlementStatus,
    loading: entitlementLoading,
    trialEndsAt,
  } = useEntitlement();

  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [planStatus, setPlanStatus] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<{
    display_name?: string | null;
    full_name?: string | null;
  } | null>(null);
  const [totalSessions, setTotalSessions] = useState<number>(0);
  const [progressedCount, setProgressedCount] = useState<number | null>(null);
  const [isWeek1, setIsWeek1] = useState(false);
  const [isDeload, setIsDeload] = useState(false);
  const [currentStreak, setCurrentStreak] = useState<number>(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [coachSummary, setCoachSummary] = useState<{
    headline: string;
    week_number: number;
    coach_note?: string | null;
    summaryText?: string | null;
    generated_at?: string | null;
    updated_at?: string | null;
  } | null>(null);
  /** Latest weekly_summaries row — drives Review Summary CTA even after unviewed flag cleared. */
  const [latestSummary, setLatestSummary] = useState<{ week_number: number } | null>(null);
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
  const [todaySleepHours, setTodaySleepHours] = useState<number | null>(null);
  const [weightLoggedToday, setWeightLoggedToday] = useState(false);
  const [todayReadiness, setTodayReadiness] = useState<number | null>(null);
  const [showDailyCheckIn, setShowDailyCheckIn] = useState(false);
  const uidRef = useRef<string | null>(null);
  const { displayToLbs, lbsToDisplay, formatBodyWeight, unitLabel, isMetric } = useMetric();

  /** BUG-8: false only when we have real scheduled day labels and today is off-cycle */
  const [isTrainingDay, setIsTrainingDay] = useState(true);
  const [nextTrainingDay, setNextTrainingDay] = useState<{
    dayLabel: string;
    daysAway: number;
    displayName: string;
  } | null>(null);
  /** BUG-8: DEV — persisted; skip day-of-week gating and use next-unlogged session */
  const [devBypassDayGate, setDevBypassDayGate] = useState(false);
  /** Week 1 calibration — no workouts logged yet; drives UI hint only */
  const [isWeek1NoSessionsYet, setIsWeek1NoSessionsYet] = useState(false);
  /** Logged a workout for this calendar day — show recovery hero until tomorrow */
  const [hasLoggedWorkoutToday, setHasLoggedWorkoutToday] = useState(false);
  const [showWorkoutResultsModal, setShowWorkoutResultsModal] = useState(false);
  const [todayWorkoutLog, setTodayWorkoutLog] = useState<{
    sets_json: unknown;
    session_fatigue_rating: number | null;
  } | null>(null);
  const [todayPlanExercises, setTodayPlanExercises] = useState<ExerciseObject[]>([]);
  const [todayExerciseMap, setTodayExerciseMap] = useState<Record<string, string>>({});
  const [todaySportLog, setTodaySportLog] = useState<unknown>(null);
  const [lastSessionMeta, setLastSessionMeta] = useState<{
    durationMinutes?: number;
    prsHit?: number;
    totalSets?: number;
    dayNumber?: number;
    weekNumber?: number;
    savedAt?: string;
  } | null>(null);
  const [homeShareCardData, setHomeShareCardData] = useState<ShareCardProps | null>(null);
  const [homeShareCardVisible, setHomeShareCardVisible] = useState(false);
  const [homeShareLoading, setHomeShareLoading] = useState(false);
  const homeShareCardRef = useRef<View>(null);
  const homeShareCapturePendingRef = useRef(false);

  const [missedSessionResult, setMissedSessionResult] =
    useState<MissedSessionResult | null>(null);
  const [missedCardDismissed, setMissedCardDismissed] = useState(false);
  const [planSnapshotForMissed, setPlanSnapshotForMissed] = useState<{
    planId: string;
    currentWeek: number;
    planJson: Record<string, unknown>;
  } | null>(null);
  const [cardioCompleted, setCardioCompleted] = useState(false);
  const [todayActivityLog, setTodayActivityLog] = useState<ActivityLogRow | null>(null);
  const [activityDashboardUserId, setActivityDashboardUserId] = useState<string | null>(null);
  const [dashboardWeightLbs, setDashboardWeightLbs] = useState(170);
  const [goalProgress, setGoalProgress] = useState<{
    targetLift: string | null;
    current1RM: number;
    target1RM: number;
  } | null>(null);

  const displayedGoalProgress = useMemo(() => {
    if (!goalProgress || goalProgress.target1RM <= 0) return null;
    const floor = goalProgress.current1RM;
    const epley = getBestEpleyFromWeekLogs(workoutLogs, goalProgress.targetLift);
    const current1RM =
      epley != null && epley > floor ? epley : floor > 0 ? floor : epley ?? 0;
    if (current1RM <= 0) return null;
    return {
      ...goalProgress,
      current1RM: Math.round(current1RM),
    };
  }, [goalProgress, workoutLogs]);

  const refetchTodayWeightLog = useCallback(async (): Promise<boolean> => {
    const uid =
      uidRef.current ?? (await supabase.auth.getUser()).data.user?.id ?? null;
    if (!uid) return false;
    const todayDate = getLocalDateString();
    const { data: todayLog } = await supabase
      .from('weight_logs')
      .select('weight_lbs, sleep_hours, readiness_score')
      .eq('user_id', uid)
      .eq('log_date', todayDate)
      .maybeSingle();

    if (todayLog) {
      setTodayWeight(todayLog.weight_lbs as number);
      setTodaySleepHours(mapDbSleepHoursToPill(todayLog.sleep_hours));
      setWeightLoggedToday(true);
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    setMissedCardDismissed(false);
  }, [planSnapshotForMissed?.planId, planSnapshotForMissed?.currentWeek]);

  useEffect(() => {
    if (!planSnapshotForMissed?.planId || !planSnapshotForMissed.planJson) {
      setMissedSessionResult(null);
      return;
    }
    if (missedCardDismissed) return;

    checkMissedSession(
      planSnapshotForMissed.planId,
      planSnapshotForMissed.currentWeek,
      planSnapshotForMissed.planJson,
    ).then(setMissedSessionResult);
  }, [planSnapshotForMissed, missedCardDismissed]);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        setPlanStatus(null);
        setUnviewedSummaryWeekNumber(null);
        setStatsLoading(false);
        setDevBypassDayGate(false);
        setIsWeek1NoSessionsYet(false);
        setHasLoggedWorkoutToday(false);
        setPlanSnapshotForMissed(null);
        setTodayActivityLog(null);
        setTodaySportLog(null);
        setActivityDashboardUserId(null);
        setProfile(null);
        setGoalProgress(null);
        setProgressedCount(null);
        setIsWeek1(false);
        setIsDeload(false);
        return;
      }
      uidRef.current = userId;
      setActivityDashboardUserId(userId);

      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      setProfile(profileData);
      const profileWeight = Number(profileData?.weight_lbs ?? 0);
      setDashboardWeightLbs(
        Number.isFinite(profileWeight) && profileWeight > 0 ? profileWeight : 170,
      );

      // Load today's weight log
      const todayDate = getLocalDateString();
      const { data: todayLog } = await supabase
        .from('weight_logs')
        .select('weight_lbs, sleep_hours, readiness_score')
        .eq('user_id', userId)
        .eq('log_date', todayDate)
        .maybeSingle();

      if (todayLog) {
        const w = todayLog.weight_lbs as number;
        setTodayWeight(w);
        if (w > 0) setDashboardWeightLbs(w);
        setTodaySleepHours(mapDbSleepHoursToPill(todayLog.sleep_hours));
        setTodayReadiness(todayLog.readiness_score ?? null);
        setWeightLoggedToday(true);
      } else {
        setTodaySleepHours(null);
        setTodayReadiness(null);
        setWeightLoggedToday(false);
      }

      const { data: planRow, error: planError } = await supabase
        .from('plans')
        .select('id, plan_json, current_week, total_weeks, status, title, start_date, created_at')
        .eq('user_id', userId)
        .in('status', ['active', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Week unlock / hero session always derive from this fresh row — not AsyncStorage or stale state.

      if (planError || !planRow) {
        setPlanStatus(null);
        setPlanData(null);
        setLatestSummary(null);
        setCardioCompleted(false);
        setUnviewedSummaryWeekNumber(null);
        setLastSessionMeta(null);
        setStatsLoading(false);
        setIsTrainingDay(true);
        setNextTrainingDay(null);
        setDevBypassDayGate(false);
        setPlanSnapshotForMissed(null);
        setTodayActivityLog(null);
        setTodaySportLog(null);
        setIsWeek1NoSessionsYet(false);
        setHasLoggedWorkoutToday(false);
        setGoalProgress(null);
        setProgressedCount(null);
        setIsWeek1(false);
        setIsDeload(false);
        return;
      }

      setPlanStatus(planRow.status ?? null);

      if (planRow.status === 'active') {
        const { data: goalRow } = await supabase
          .from('goals')
          .select('goal_type, target_lift, current_1rm, target_1rm')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (goalRow?.goal_type === 'strength' && goalRow.target_1rm) {
          setGoalProgress({
            targetLift: goalRow.target_lift ?? null,
            current1RM: Number(goalRow.current_1rm ?? 0),
            target1RM: Number(goalRow.target_1rm ?? 0),
          });
        } else {
          setGoalProgress(null);
        }
      } else {
        setGoalProgress(null);
      }

      if (planRow.status === 'completed') {
        setPlanData(null);
        setCardioCompleted(false);
        setPlanSnapshotForMissed(null);
        setMissedSessionResult(null);
        setLastSessionMeta(null);
        setLatestSummary(null);
        setCoachSummary(null);
        setJordanWelcome(null);
        setUnviewedSummaryWeekNumber(null);
        setCurrentPhase(undefined);
        setWorkoutLogs([]);
        setIsTrainingDay(true);
        setNextTrainingDay(null);
        setDevBypassDayGate(false);
        setIsWeek1NoSessionsYet(false);
        setTodayActivityLog(null);
        setTodaySportLog(null);
        setHasLoggedWorkoutToday(false);
        loadStats(userId, planRow.id, planRow.current_week ?? 1);
        return;
      }

      const plan = planRow;
      const planJson = plan.plan_json;
      const jordanWelcome: string | null =
        (planJson as { jordanWelcome?: string }).jordanWelcome ?? null;

      const currentWeekData =
        planJson.weeks?.find(
          (w: unknown) => getPlanWeekNumber(w) === plan.current_week,
        ) ?? planJson.weeks?.[0];

      const currentWeekPhase: string | undefined = currentWeekData?.phase;

      if (!currentWeekData) {
        setUnviewedSummaryWeekNumber(null);
        setStatsLoading(false);
        setIsTrainingDay(true);
        setNextTrainingDay(null);
        setDevBypassDayGate(false);
        setIsWeek1NoSessionsYet(false);
        setPlanSnapshotForMissed(null);
        setTodayActivityLog(null);
        setTodaySportLog(null);
        setHasLoggedWorkoutToday(false);
        setProgressedCount(null);
        setIsWeek1(false);
        setIsDeload(false);
        return;
      }

      const currentWeekIndex =
        planJson.weeks?.findIndex(
          (w: unknown) => getPlanWeekNumber(w) === plan.current_week,
        ) ?? -1;
      const adaptationChanges = (
        (currentWeekIndex >= 0
          ? (
              planJson.weeks?.[currentWeekIndex] as {
                adaptationChanges?: Array<{
                  changeType?: string;
                  direction?: string;
                }>;
              }
            )?.adaptationChanges
          : (currentWeekData as { adaptationChanges?: unknown }).adaptationChanges) ??
          []
      ) as Array<{ changeType?: string; direction?: string }>;
      let progressedExerciseCount = adaptationChanges.filter(
        (c) =>
          c.changeType === 'increase' ||
          c.direction === 'up' ||
          c.changeType === 'weight_increase',
      ).length;

      // If current week has no adaptations (W1 never has any), check W2
      // so the adaptation card shows immediately after generate completes
      // on the weekend before Monday auto-advance.
      if (progressedExerciseCount === 0) {
        const nextWeekIndex = (planJson.weeks ?? []).findIndex(
          (w: unknown) => getPlanWeekNumber(w) === (plan.current_week ?? 1) + 1,
        );
        const nextWeekAdaptations = (
          nextWeekIndex >= 0
            ? (
                planJson.weeks?.[nextWeekIndex] as {
                  adaptationChanges?: Array<{
                    changeType?: string;
                    direction?: string;
                  }>;
                }
              )?.adaptationChanges
            : []
        ) ?? [];
        progressedExerciseCount = nextWeekAdaptations.filter(
          (c) =>
            c.changeType === 'increase' ||
            c.direction === 'up' ||
            c.changeType === 'weight_increase',
        ).length;
      }

      setProgressedCount(progressedExerciseCount);
      setIsWeek1((plan.current_week ?? 1) === 1);
      setIsDeload(
        !!(
          currentWeekIndex >= 0 &&
          (planJson.weeks?.[currentWeekIndex] as { phase?: string })?.phase ===
            'deload'
        ) ||
          currentWeekPhase === 'deload',
      );

      // Plan not started until start_date (local YYYY-MM-DD) is today or earlier.
      const planStartRaw: string | null =
        (plan as { start_date?: string | null }).start_date ??
        (planJson as { startDate?: string | null }).startDate ??
        null;
      const planStarted = isPlanStartDateReached(planStartRaw);
      if (planStartRaw && !planStarted) {
        const planStart = new Date(`${planStartRaw.split('T')[0]}T12:00:00`);
        const formattedStart = planStart.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
        const planJsonTyped = planJson as {
          title?: string;
          daysPerWeek?: number;
          days_per_week?: number;
        };
        setPlanData({
          planId: plan.id as string,
          planTitle: planJsonTyped.title ?? (plan as { title?: string }).title ?? 'Your Plan',
          currentWeek: typeof plan.current_week === 'number' ? plan.current_week : 1,
          totalWeeks: typeof plan.total_weeks === 'number' ? plan.total_weeks : 12,
          daysPerWeek: planJsonTyped.daysPerWeek ?? planJsonTyped.days_per_week ?? 3,
          todayWorkout: null,
          weekDays: [],
          completedSessions: 0,
          nextWeekReady: false,
          nextWeekFirstWorkout: null,
          showGenerateNextWeekCTA: false,
          postWeekHeroAllowed: false,
          scheduledDays: [],
          hasDayLabels: false,
          planStartsOn: formattedStart,
        });
        setPlanStatus(plan.status as string ?? null);
        setIsTrainingDay(false);
        setNextTrainingDay(null);
        setIsWeek1NoSessionsYet(false);
        setDevBypassDayGate(false);
        setPlanSnapshotForMissed(null);
        setStatsLoading(false);
        setProgressedCount(null);
        setIsWeek1(false);
        setIsDeload(false);
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

      const weekDays: WorkoutDay[] = currentWeekData.days ?? [];

      const { data: logsWeek } = await supabase
        .from('workout_logs')
        .select('day_number')
        .eq('plan_id', plan.id)
        .eq('week_number', plan.current_week);

      const completedDayNumbers = new Set(
        logsWeek?.map((l: { day_number: number }) => l.day_number) ?? [],
      );
      const rawCompletedSessions = completedDayNumbers.size;

      const completedSessions = rawCompletedSessions;

      // For week-complete CTA: a late-start W1 user is "complete" when they've
      // logged all sessions available from their start date forward.
      // implicitSessionsForCount is used ONLY for the showGenerateNextWeekCTA check below.
      const daysPerWeekForCount: number = plan.plan_json.daysPerWeek ?? 4;
      const dayNamesForCount = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const todayLabelForCount = dayNamesForCount[new Date().getDay()];
      const normalizedForCount = scheduledDays.map((d: string) => d.trim().slice(0, 3));
      const todayScheduledIndexForCount = normalizedForCount.indexOf(todayLabelForCount);

      // Implicit session inflation: only applies on W1 when the user started
      // mid-week and has NOT yet logged today's session.
      // Guard: rawCompletedSessions must be STRICTLY LESS THAN todayScheduledIndex
      // (not <=) — if they equal, today's slot is already logged, no inflation needed.
      const implicitSessionsForCount =
        (plan.current_week ?? 1) === 1 &&
        todayScheduledIndexForCount > 0 &&
        rawCompletedSessions > 0 &&
        rawCompletedSessions < todayScheduledIndexForCount
          ? todayScheduledIndexForCount - (rawCompletedSessions - 1)
          : 0;
      const isWeek1NoSessionsYet =
        (plan.current_week ?? 1) === 1 && completedDayNumbers.size === 0;
      setIsWeek1NoSessionsYet(isWeek1NoSessionsYet);

      const todayDateStr = getLocalDateString();
      const { data: todayLogs } = await supabase
        .from('workout_logs')
        .select('id, logged_at, day_number')
        .eq('user_id', userId)
        .eq('plan_id', plan.id)
        .gte('logged_at', `${todayDateStr}T00:00:00.000Z`)
        .lte('logged_at', `${todayDateStr}T23:59:59.999Z`)
        .limit(1)
        .maybeSingle();

      const calendarTrainingToday =
        !hasDayLabels || isTodayTrainingDay(scheduledDays, todayLabel);

      // Only show "workout complete" if today was actually a training
      // day in the current week. If current_week advanced to W2 and
      // today is not a W2 training day, don't show the complete card.
      const loggedWorkoutToday = !!todayLogs && calendarTrainingToday;
      setHasLoggedWorkoutToday(loggedWorkoutToday);

      if (loggedWorkoutToday) {
        const { data: fullLog } = await supabase
          .from('workout_logs')
          .select('sets_json, session_fatigue_rating')
          .eq('user_id', userId)
          .eq('plan_id', plan.id)
          .gte('logged_at', `${todayDateStr}T00:00:00.000Z`)
          .lte('logged_at', `${todayDateStr}T23:59:59.999Z`)
          .order('logged_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setTodayWorkoutLog(fullLog ?? null);

        const todayDay = currentWeekData?.days?.find(
          (d: WorkoutDay) => d.dayNumber === (todayLogs as { day_number?: number } | null)?.day_number,
        );
        const exercises: ExerciseObject[] = (todayDay?.exercises ?? []).map((e: Exercise) => ({
          id: e.id,
          name: e.name,
          sets: e.sets,
          reps: String(e.reps),
          targetRpe: e.targetRpe,
        }));
        setTodayPlanExercises(exercises);
        const exMap: Record<string, string> = {};
        exercises.forEach((e) => { if (e.id) exMap[e.id] = e.name; });
        setTodayExerciseMap(exMap);
      } else {
        setTodayWorkoutLog(null);
        setTodayPlanExercises([]);
        setTodayExerciseMap({});
      }

      const trainingEligibleToday =
        devBypassRead ||
        calendarTrainingToday ||
        isWeek1NoSessionsYet;
      const nextTraining =
        hasDayLabels && !trainingEligibleToday
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
        trainingEligibleToday,
        'isWeek1NoSessionsYet:',
        isWeek1NoSessionsYet,
      );

      setIsTrainingDay(trainingEligibleToday);
      setNextTrainingDay(nextTraining);

      const nextWeekData =
        planJson.weeks?.find(
          (w: unknown) => getPlanWeekNumber(w) === plan.current_week + 1,
        ) ?? null;

      const nextWeekWorkoutDays: WorkoutDay[] =
        nextWeekData?.days?.filter((d: WorkoutDay) => d.type === 'workout') ?? [];

      const nextWeekFirstWorkout: WorkoutDay | null = nextWeekWorkoutDays[0] ?? null;
      const nextWeekReady = !!nextWeekFirstWorkout;

      // Week 1 calibration exception: Day 1 is always available
      // until the first session is logged, regardless of calendar day.
      const todayWorkout = resolveTodayWorkout({
        weekDays,
        completedDayNumbers,
        devBypassDayGate:
          (devBypassRead || isWeek1NoSessionsYet) && !loggedWorkoutToday,
        hasDayLabels,
        scheduledDays,
        todayLabel,
        isTrainingToday:
          (trainingEligibleToday || isWeek1NoSessionsYet) &&
          !loggedWorkoutToday,
        nextWeekReady,
        nextWeekFirstWorkout,
      });

      const currentWeek = plan.current_week ?? 1;
      const planGoal = (planJson as { goal?: string }).goal ?? null;
      let todayCardioDay: WorkoutDay | null = null;
      let cardioLoggedToday = false;
      if (planGoal === 'fat_loss' || planGoal === 'recomp') {
        todayCardioDay = findTodayCardioDayByWeekMap(
          weekDays,
          todayLabel,
          scheduledDays,
        );
        if (todayCardioDay) {
          const { data: cardioLogCheck } = await supabase
            .from('cardio_logs')
            .select('id')
            .eq('plan_id', plan.id)
            .eq('week_number', currentWeek)
            .eq('day_number', todayCardioDay.dayNumber)
            .maybeSingle();
          cardioLoggedToday = !!cardioLogCheck;
        }
      }
      setCardioCompleted(cardioLoggedToday);

      const { data: sportLogRow } = await supabase
        .from('sport_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_id', plan.id)
        .eq('logged_at', todayDate)
        .maybeSingle();
      setTodayActivityLog((sportLogRow as ActivityLogRow | null) ?? null);

      const daysPerWeek = plan.plan_json.daysPerWeek ?? 4;
      const effectiveCompletedForCTA = Math.min(daysPerWeekForCount, rawCompletedSessions + implicitSessionsForCount);
      const isWeekComplete = effectiveCompletedForCTA >= daysPerWeek && daysPerWeek > 0;

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
        dbCurrentWeek < totalWeeks;

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
        planGoal,
        todayCardioDay,
        cardioLoggedToday,
        scheduledDays,
        hasDayLabels,
        jordanPlanMeta: {
          jordanWelcome: (planJson as { jordanWelcome?: string }).jordanWelcome,
          jordanNote: (planJson as { jordanNote?: string }).jordanNote,
        },
        plan_json: {
          latestJordanNote: (planJson as { latestJordanNote?: string | null })
            .latestJordanNote,
          latestJordanNoteUpdatedAt: (
            planJson as { latestJordanNoteUpdatedAt?: string | null }
          ).latestJordanNoteUpdatedAt,
          jordanWelcome: (planJson as { jordanWelcome?: string }).jordanWelcome ?? null,
        },
        planStartsOn: null,
      });

      const lastSessionMeta = (planJson as {
        lastSessionMeta?: {
          durationMinutes?: number;
          prsHit?: number;
          totalSets?: number;
          dayNumber?: number;
          weekNumber?: number;
          savedAt?: string;
        };
      }).lastSessionMeta ?? null;
      setLastSessionMeta(lastSessionMeta);

      // Monday auto-advance: if today is the first scheduled training
      // day, W2 exists in plan_json, and current_week is still 1,
      // silently advance current_week to 2.
      if (
        (plan.current_week ?? 1) === 1 &&
        hasDayLabels &&
        scheduledDays.length > 0
      ) {
        const firstScheduledDay = scheduledDays[0];
        const todayLabelForAdvance = getTodayDayLabel();
        const normalizedFirst = firstScheduledDay.trim().slice(0, 3);
        const normalizedToday = todayLabelForAdvance.trim().slice(0, 3);

        if (normalizedFirst === normalizedToday) {
          const w2Exists = (planJson.weeks ?? []).some(
            (w: unknown) => getPlanWeekNumber(w) === 2,
          );
          const allW1Done =
            completedSessions >= daysPerWeek ||
            (rawCompletedSessions > 0 &&
              rawCompletedSessions + implicitSessionsForCount >= daysPerWeek);

          if (w2Exists && allW1Done) {
            console.log('[HomeScreen] Monday auto-advance: W1→W2');
            await supabase
              .from('plans')
              .update({ current_week: 2 })
              .eq('id', plan.id);
            void loadDashboardData();
            return;
          }
        }
      }

      setPlanSnapshotForMissed({
        planId: plan.id,
        currentWeek: plan.current_week ?? 1,
        planJson: planJson as Record<string, unknown>,
      });
      setJordanWelcome(jordanWelcome);
      setCurrentPhase(currentWeekPhase);

      // Latest weekly_summaries row for Jordan card — do not gate on current_week so body stays fresh
      const { data: weeklySummaryLatestRow } = await supabase
        .from('weekly_summaries')
        .select('summary_json, week_number, generated_at')
        .eq('user_id', userId)
        .eq('plan_id', plan.id)
        .order('week_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (weeklySummaryLatestRow) {
        setLatestSummary({ week_number: weeklySummaryLatestRow.week_number });
        const summaryJson = weeklySummaryLatestRow.summary_json as {
          headline?: string;
          coach_note?: string;
          summary?: string;
          performanceSummary?: string;
          motivationalNote?: string;
        } | null;

        const rawCoachNote =
          summaryJson?.coach_note != null && String(summaryJson.coach_note).trim() !== ''
            ? String(summaryJson.coach_note).trim()
            : null;
        const rawSummary =
          summaryJson?.summary != null && String(summaryJson.summary).trim() !== ''
            ? String(summaryJson.summary).trim()
            : summaryJson?.performanceSummary != null &&
                String(summaryJson.performanceSummary).trim() !== ''
              ? String(summaryJson.performanceSummary).trim()
              : null;

        setCoachSummary({
          headline:
            summaryJson?.headline != null && String(summaryJson.headline).trim() !== ''
              ? String(summaryJson.headline).trim()
              : '',
          week_number: weeklySummaryLatestRow.week_number,
          coach_note: rawCoachNote,
          summaryText: rawSummary,
          generated_at:
            typeof weeklySummaryLatestRow.generated_at === 'string'
              ? weeklySummaryLatestRow.generated_at
              : null,
          updated_at: null,
        });
      } else {
        setLatestSummary(null);
        setCoachSummary(null);
      }

      // Fallback: fire weekly summary if the week advanced but no summary exists
      // for the prior week and at least one session was logged.
      // Guards against re-firing on every dashboard focus via AsyncStorage flag.
      const dbCurrentWeekForFallback = plan.current_week ?? 1;
      const priorWeekForFallback = dbCurrentWeekForFallback - 1;

      if (
        priorWeekForFallback >= 1 &&
        (!weeklySummaryLatestRow ||
          weeklySummaryLatestRow.week_number < priorWeekForFallback)
      ) {
        const attemptedKey = await AsyncStorage.getItem(SUMMARY_FALLBACK_ATTEMPTED_KEY);
        const alreadyAttempted = attemptedKey === String(priorWeekForFallback);

        if (!alreadyAttempted) {
          const { count: priorWeekSessionCount } = await supabase
            .from('workout_logs')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('plan_id', plan.id)
            .eq('week_number', priorWeekForFallback)
            .eq('skipped', false);

          if ((priorWeekSessionCount ?? 0) > 0) {
            // Mark as attempted before firing — prevents duplicate calls
            // if the function takes a long time and user re-focuses
            await AsyncStorage.setItem(
              SUMMARY_FALLBACK_ATTEMPTED_KEY,
              String(priorWeekForFallback),
            );

            // Fire-and-forget — non-blocking, dashboard renders immediately
            void (async () => {
              try {
                const { data: summaryData } = await supabase.functions.invoke(
                  'weekly-coach-summary',
                  { body: { userId, planId: plan.id, weekNumber: priorWeekForFallback } },
                );
                if (summaryData?.summary) {
                  await AsyncStorage.setItem(
                    'hone_unviewed_summary_week',
                    String(priorWeekForFallback),
                  );
                  // Reload to pick up new summary in Jordan card + unread banner
                  void loadDashboardData();
                }
              } catch (err) {
                if (__DEV__) console.warn('[summary fallback] invoke failed:', err);
                // Remove the attempted flag on failure so it retries next focus
                await AsyncStorage.removeItem(SUMMARY_FALLBACK_ATTEMPTED_KEY);
              }
            })();
          }
        }
      }

      // One-time key migration: afc_ → hone_ (Hone rebrand, May 2026)
      const legacyValue = await AsyncStorage.getItem('afc_unviewed_summary_week');
      if (legacyValue !== null) {
        await AsyncStorage.setItem('hone_unviewed_summary_week', legacyValue);
        await AsyncStorage.removeItem('afc_unviewed_summary_week');
      }

      const unviewedWeekStr = await AsyncStorage.getItem('hone_unviewed_summary_week');
      const parsedUnviewed =
        unviewedWeekStr != null && unviewedWeekStr.trim() !== ''
          ? parseInt(unviewedWeekStr.trim(), 10)
          : NaN;
      const unviewedWeek = Number.isFinite(parsedUnviewed) ? parsedUnviewed : null;
      setUnviewedSummaryWeekNumber(unviewedWeek);

      // Fire stats in background — dashboard renders immediately
      loadStats(userId, plan.id, plan.current_week);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void loadDashboardData();
    }, []),
  );

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

  const handleShareFromDashboard = useCallback(async () => {
    if (!planData || homeShareLoading) return;
    setHomeShareLoading(true);
    try {
      const meta = lastSessionMeta;
      const payload = await prepareShareCardData({
        planId: planData.planId,
        weekNumber: planData.currentWeek,
        dayNumber: meta?.dayNumber ?? planData.todayWorkout?.dayNumber ?? 1,
        totalSets: meta?.totalSets ?? 0,
        durationMinutes: meta?.durationMinutes ?? 0,
        prsHit: meta?.prsHit ?? 0,
        latestJordanNote: null,
      });
      if (!payload) {
        setHomeShareLoading(false);
        return;
      }
      homeShareCapturePendingRef.current = true;
      setHomeShareCardData(payload);
      setHomeShareCardVisible(true);
    } catch {
      setHomeShareLoading(false);
    }
  }, [planData, lastSessionMeta, homeShareLoading]);

  useEffect(() => {
    if (!homeShareCardVisible || !homeShareCardData || !homeShareCapturePendingRef.current) return;
    let cancelled = false;
    void (async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (cancelled) return;
      await captureAndShareCard(homeShareCardRef);
      if (!cancelled) {
        setHomeShareLoading(false);
        setHomeShareCardVisible(false);
        setHomeShareCardData(null);
        homeShareCapturePendingRef.current = false;
      }
    })();
    return () => { cancelled = true; };
  }, [homeShareCardVisible, homeShareCardData]);

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

  const handleStartWorkout = useCallback(async () => {
    const todayWorkout = planData?.todayWorkout ?? null;
    if (!todayWorkout) return;

    const sessionWeek = todayWorkout.isNextWeek
      ? (planData?.currentWeek ?? 1) + 1
      : planData?.currentWeek ?? 1;

    if (Platform.OS !== 'web' && sessionWeek >= 2) {
      if (entitlementLoading) return;
      if (!isPro) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigation.navigate('ProfileTab' as any, { screen: 'SubscriptionManagement' });
        return;
      }
    }

    const daysPerWeekLocal = planData?.daysPerWeek ?? 4;

    let weeklyLogsLocal = workoutLogs ?? [];
    if (
      weeklyLogsLocal.length === 0 &&
      planData?.planId &&
      (planData?.currentWeek ?? 1) >= 2
    ) {
      const { data: freshLogs } = await supabase
        .from('workout_logs')
        .select('id, sets_json, session_fatigue_rating, logged_at')
        .eq('plan_id', planData.planId)
        .eq('week_number', planData.currentWeek)
        .order('logged_at', { ascending: false })
        .limit(5);
      weeklyLogsLocal = freshLogs ?? [];
    }

    const sessionsThisWeekLocal = weeklyLogsLocal.length;
    const isWeekCompleteLocal = sessionsThisWeekLocal >= (daysPerWeekLocal ?? 2);
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
      preSessionMessage: preSessionCopyLocal
        ? (cleanJordanMessage(stripEmDash(preSessionCopyLocal)) ?? null)
        : null,
    });
  }, [navigation, planData, workoutLogs, isPro, entitlementLoading]);

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
  const todayLabelHome = getTodayDayLabel();
  const recoveryDayNumber =
    planData?.hasDayLabels && (planData.scheduledDays?.length ?? 0) > 0
      ? findTodayPlanDayByCalendar(
          planData.weekDays,
          todayLabelHome,
          planData.scheduledDays,
        )?.dayNumber ?? null
      : null;
  const todaySessionFocus = (() => {
    const firstExercise = today?.exercises?.[0];
    if (firstExercise?.targetWeight && firstExercise.targetWeight > 0) {
      const weight = firstExercise.targetWeight;
      const sets = firstExercise.sets ?? 0;
      const reps = firstExercise.reps ?? '';
      const name = firstExercise.name ?? '';
      return `${name} ${sets}×${reps} @ ${weight} lbs`;
    }
    return getSessionIntent(
      currentPhase,
      today?.sessionFocus,
      planData?.planSplit,
    );
  })();
  const displaySessionFocus = convertSessionFocus(todaySessionFocus, isMetric);
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

  const todayLogSets = Array.isArray(
    (todayWorkoutLog?.sets_json as unknown[]),
  ) ? (todayWorkoutLog!.sets_json as unknown[]) : [];
  const isMetaFresh = lastSessionMeta?.weekNumber === planData?.currentWeek
    && lastSessionMeta?.dayNumber != null;
  const todayTotalSets = isMetaFresh && lastSessionMeta?.totalSets != null
    ? lastSessionMeta.totalSets
    : (todayLogSets.length > 0
      ? new Set(todayLogSets.map((s) => (s as { setNumber?: number }).setNumber)).size
      : 0);
  const durationMinutes = isMetaFresh ? (lastSessionMeta?.durationMinutes ?? estMins) : estMins;
  const prsHit: number = isMetaFresh ? (lastSessionMeta?.prsHit ?? 0) : 0;

  const nextDayInfo = (() => {
    if (!planData?.scheduledDays?.length || !planData.weekDays?.length) return null;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const tomorrowLabel = dayNames[(new Date().getDay() + 1) % 7];
    const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const scheduledDays = planData.scheduledDays;
    const firstIdx = allDays.indexOf(scheduledDays[0].trim().slice(0, 3));
    if (firstIdx < 0) return null;
    const ordered = [...planData.weekDays].sort((a, b) => a.dayNumber - b.dayNumber);
    const dayNumberToLabel: Record<number, string> = {};
    ordered.forEach((day, idx) => {
      dayNumberToLabel[day.dayNumber] = allDays[(firstIdx + idx) % 7];
    });
    const tomorrowDay = ordered.find((d) => dayNumberToLabel[d.dayNumber] === tomorrowLabel);
    if (!tomorrowDay) return null;
    if (tomorrowDay.type === 'rest') return { type: 'rest' as const, label: 'Rest day tomorrow' };
    return { type: 'workout' as const, label: tomorrowDay.title, day: tomorrowLabel };
  })();

  const isWeekDoneForCard = completedSessions >= daysPerWeek && daysPerWeek > 0;
  const sessionWeekForGate = today
    ? today.isNextWeek
      ? (planData?.currentWeek ?? 1) + 1
      : (planData?.currentWeek ?? 1)
    : 1;
  const needsWeekPaywall = Platform.OS !== 'web' && sessionWeekForGate >= 2;

  const trialDaysLeft =
    trialEndsAt != null
      ? Math.ceil(
          (trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        )
      : null;
  const showTrialBanner =
    entitlementStatus === 'trial' &&
    trialDaysLeft !== null &&
    trialDaysLeft > 0 &&
    trialDaysLeft <= 3;
  const displayName = (() => {
    if (profile?.full_name) {
      return profile.full_name.trim().split(' ')[0];
    }
    const emailLocal = session?.user?.email?.split('@')[0] ?? '';
    return emailLocal.charAt(0).toUpperCase() + emailLocal.slice(1);
  })();
  const completionRatio =
    daysPerWeek > 0 ? Math.min(1, completedSessions / daysPerWeek) : 0;
  const progressFillWidth: DimensionValue =
    `${Math.round(completionRatio * 100)}%`;

  const streakDisplay = currentStreak === 0 ? '—' : String(currentStreak);
  const sessionsDisplay = statsLoading ? '-' : String(totalSessions);
  const dashboardCurrentWeek = planData?.currentWeek ?? 1;

  const sessionCount = totalSessions;
  const isDay1ColdStart =
    planData != null && sessionCount === 0 && dashboardCurrentWeek === 1;

  const jordanDay1Copy =
    "Day 1 starts now. Choose weights that feel like RPE 7–8: challenging but controlled. Log every set honestly and I'll take it from here.";
  const jordanInWeekCopy =
    "First session logged. Keep the same approach next session. Your numbers are already telling me what Week 2 needs to look like.";

  const jordanCardBodyComputed =
    planStatus === 'completed'
      ? null
      : (() => {
          if (
            coachSummary?.coach_note &&
            String(coachSummary.coach_note).trim() !== ''
          ) {
            return cleanJordanMessage(coachSummary.coach_note.trim()) ?? coachSummary.coach_note.trim();
          }
          if (
            coachSummary?.summaryText &&
            String(coachSummary.summaryText).trim() !== ''
          ) {
            return cleanJordanMessage(coachSummary.summaryText.trim()) ?? coachSummary.summaryText.trim();
          }

          const pjJordan = planData?.plan_json;
          const sessionNote = pjJordan?.latestJordanNote;
          if (sessionNote != null && String(sessionNote).trim() !== '') {
            return cleanJordanMessage(String(sessionNote).trim()) ?? String(sessionNote).trim();
          }

          const currentWeek = planData?.currentWeek ?? 1;
          const hasCompletedSessions =
            pjJordan?.latestJordanNoteUpdatedAt != null &&
            String(pjJordan.latestJordanNoteUpdatedAt).trim() !== '';

          if (currentWeek === 1 && !hasCompletedSessions) {
            const w =
              pjJordan?.jordanWelcome ??
              planData?.jordanPlanMeta?.jordanWelcome ??
              jordanWelcome ??
              null;
            if (w != null && String(w).trim() !== '') {
              return cleanJordanMessage(String(w).trim()) ?? String(w).trim();
            }
          }

          return null;
        })();

  const jordanCardState: JordanCardState =
    planStatus === 'completed'
      ? 'in_week'
      : sessionCount === 0 && dashboardCurrentWeek === 1
        ? 'day1'
        : coachSummary?.headline
          ? 'summary_available'
          : 'in_week';

  const displayedJordanTextRaw =
    planData?.planStartsOn
      ? 'Your plan starts ' + planData.planStartsOn + '. Rest up and come back ready. The work begins then.'
      : planStatus === 'completed'
        ? 'Great work finishing the program. Start a new plan when you\'re ready.'
        : jordanCardBodyComputed != null && jordanCardBodyComputed.trim() !== ''
          ? jordanCardBodyComputed
          : jordanCardState === 'day1'
            ? jordanDay1Copy
            : jordanInWeekCopy;
  const displayedJordanText = stripEmDash(displayedJordanTextRaw ?? '');

  const jordanCardTimestamp =
    coachSummary?.generated_at ??
    coachSummary?.updated_at ??
    planData?.plan_json?.latestJordanNoteUpdatedAt ??
    null;

  const jordanCardUpdatedLabel = formatJordanCardUpdatedLabel(jordanCardTimestamp);

  /** True when an AsyncStorage-flagged unread summary exists and user is on an active plan dashboard. */
  const hasUnviewedWeeklySummary =
    unviewedSummaryWeekNumber != null &&
    planData != null &&
    planStatus !== 'completed';

  const completedWeek = latestSummary?.week_number ?? (planData?.currentWeek ?? 1) - 1;
  const hasViewableSummary =
    latestSummary != null &&
    planStatus === 'active';

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

  console.log('[JORDAN CARD CTA]', {
    hasUnviewedWeeklySummary,
    hasViewableSummary,
    unviewedSummaryWeekNumber,
    planRowStatusFromState: planStatus,
    planDataCurrentWeek: planData?.currentWeek,
    latestSummaryWeek: latestSummary?.week_number,
  });

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
          <Text style={styles.headerDate}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>

        {showTrialBanner ? (
          <View style={styles.trialBanner}>
            <View style={styles.trialBannerLeft}>
              <Ionicons name="time-outline" size={16} color={Colors.accent} />
              <Text style={styles.trialBannerText}>
                {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} left in your
                free trial
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                navigation.navigate('ProfileTab' as any, {
                  screen: 'SubscriptionManagement',
                })
              }
            >
              <Text style={styles.trialBannerManage}>Manage →</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {planStatus === 'completed' ? (
          <View style={styles.planCompleteCard}>
            <Ionicons name="flag-outline" size={20} color={Colors.accent} />
            <Text style={styles.planCompleteTitle}>Plan Complete</Text>
            <Text style={styles.planCompleteSubtitle}>
              You finished the full program. Ready to start your next one?
            </Text>
            <TouchableOpacity
              style={styles.planCompleteCTA}
              onPress={() =>
                navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] })
              }
            >
              <Text style={styles.planCompleteCTAText}>Start New Plan →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
        {missedSessionResult?.isMissed && !missedCardDismissed && planSnapshotForMissed ? (
          <View style={styles.missedCard}>
            <View style={styles.missedCardHeader}>
              <Text style={styles.missedCardLabel}>MISSED SESSION</Text>
              <Text style={styles.missedCardTitle}>
                {missedSessionResult.missedSession?.title}
              </Text>
              {(missedSessionResult.missedSession?.muscleGroups?.length ?? 0) > 0 ? (
                <View style={styles.missedMuscleRow}>
                  {(missedSessionResult.missedSession?.muscleGroups ?? []).map((mg) => (
                    <View key={mg} style={styles.missedMuscleBadge}>
                      <Text style={styles.missedMuscleBadgeText}>{mg}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.missedJordanRow}>
              <JordanAvatar size={32} />
              <Text style={styles.missedJordanText}>
                {missedSessionResult.canReschedule
                  ? `You missed today's session, but ${missedSessionResult.tomorrowDayLabel} is free. Want to move it?`
                  : "You missed today's session. It happens. Next session we push forward and make it count."}
              </Text>
            </View>

            {missedSessionResult.canReschedule ? (
              <View style={styles.missedActions}>
                <TouchableOpacity
                  style={styles.missedActionPrimary}
                  activeOpacity={0.8}
                  onPress={async () => {
                    const uid = uidRef.current;
                    if (!uid) return;
                    try {
                      await rescheduleSession(
                        planSnapshotForMissed.planId,
                        planSnapshotForMissed.currentWeek,
                        missedSessionResult.missedSession!.dayNumber,
                        missedSessionResult.tomorrowDayLabel,
                        planSnapshotForMissed.planJson,
                      );
                      setMissedCardDismissed(true);
                      loadDashboardData();
                    } catch (e) {
                      console.error('[missed] rescheduleSession', e);
                      Alert.alert('Error', 'Could not reschedule. Please try again.');
                    }
                  }}
                >
                  <Text style={styles.missedActionPrimaryText}>
                    {`Move to ${missedSessionResult.tomorrowDayLabel} →`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.missedActionSecondary}
                  activeOpacity={0.8}
                  onPress={async () => {
                    const uid = uidRef.current;
                    if (!uid) return;
                    try {
                      await markSessionSkipped(
                        planSnapshotForMissed.planId,
                        planSnapshotForMissed.currentWeek,
                        missedSessionResult.missedSession!.dayNumber,
                        uid,
                      );
                      setMissedCardDismissed(true);
                      loadDashboardData();
                    } catch (e) {
                      console.error('[missed] markSessionSkipped', e);
                      Alert.alert('Error', 'Could not update. Please try again.');
                    }
                  }}
                >
                  <Text style={styles.missedActionSecondaryText}>Skip it</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.missedActionSecondary}
                activeOpacity={0.8}
                onPress={async () => {
                  const uid = uidRef.current;
                  if (!uid) return;
                  try {
                    await markSessionSkipped(
                      planSnapshotForMissed.planId,
                      planSnapshotForMissed.currentWeek,
                      missedSessionResult.missedSession!.dayNumber,
                      uid,
                    );
                    setMissedCardDismissed(true);
                    loadDashboardData();
                  } catch (e) {
                    console.error('[missed] markSessionSkipped', e);
                    Alert.alert('Error', 'Could not update. Please try again.');
                  }
                }}
              >
                <Text style={styles.missedActionSecondaryText}>Got it</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {planData?.todayCardioDay &&
        planData.todayCardioDay.type === 'cardio' &&
        (planData.planGoal === 'fat_loss' || planData.planGoal === 'recomp') &&
        !cardioCompleted &&
        !devBypassDayGate ? (
          <CardioDayCard
            cardioType={planData.todayCardioDay.cardioType ?? 'light'}
            suggestedDurationMinutes={
              planData.todayCardioDay.suggestedDurationMinutes ?? 30
            }
            planId={planData.planId}
            weekNumber={planData.currentWeek}
            dayNumber={planData.todayCardioDay.dayNumber}
            onComplete={() => {
              setCardioCompleted(true);
              loadDashboardData();
            }}
          />
        ) : null}
        {planData?.todayCardioDay &&
        planData.todayCardioDay.type === 'cardio' &&
        (planData.planGoal === 'fat_loss' || planData.planGoal === 'recomp') &&
        cardioCompleted &&
        !devBypassDayGate ? (
          <CardioDoneCard
            cardioType={planData.todayCardioDay.cardioType ?? 'light'}
            durationMinutes={planData.todayCardioDay.suggestedDurationMinutes ?? 30}
          />
        ) : null}

        {/* ── 2. Today's Workout Card (or Generate CTA or Rest Day) ──
            Priority: calendar rest / generate on rest → generate when training path → today’s session → fallback */}
        {hasLoggedWorkoutToday ? (
          <TouchableOpacity
            style={styles.workoutDoneCard}
            activeOpacity={0.8}
            onPress={() => setShowWorkoutResultsModal(true)}
          >
            <View style={styles.workoutDoneTopRow}>
              <View style={styles.workoutDoneLabelRow}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                <Text style={styles.workoutDonePill}>WORKOUT COMPLETE</Text>
              </View>
              <TouchableOpacity
                style={styles.workoutDoneShareBtn}
                activeOpacity={0.7}
                onPress={(e) => {
                  e.stopPropagation();
                  void handleShareFromDashboard();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={homeShareLoading}
              >
                {homeShareLoading ? (
                  <ActivityIndicator size="small" color={Colors.accent} />
                ) : (
                  <>
                    <Ionicons name="share-outline" size={13} color={Colors.accent} />
                    <Text style={styles.workoutDoneShareText}>Share</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.workoutDoneTitle}>
              {planData?.todayWorkout?.title ?? 'Today\'s Session'}
            </Text>
            <Text style={styles.workoutDoneSubtitle}>
              Day {planData?.todayWorkout?.dayNumber ?? '—'} · Week {planData?.currentWeek ?? 1} of {planData?.totalWeeks ?? 8}
              {'  '}
              <Text style={styles.workoutDoneTapHint}>tap to view results</Text>
            </Text>

            <View style={styles.workoutDoneStatsRow}>
              <View style={[styles.workoutDoneStat, styles.workoutDoneStatBorder]}>
                <Text style={styles.workoutDoneStatValue}>{todayTotalSets}</Text>
                <Text style={styles.workoutDoneStatLabel}>sets</Text>
              </View>
              <View style={[styles.workoutDoneStat, styles.workoutDoneStatBorder]}>
                <Text style={styles.workoutDoneStatValue}>{durationMinutes > 0 ? durationMinutes : estMins}</Text>
                <Text style={styles.workoutDoneStatLabel}>min</Text>
              </View>
              <View style={styles.workoutDoneStat}>
                <Text style={[styles.workoutDoneStatValue, prsHit > 0 && styles.workoutDoneStatValuePr]}>
                  {(() => {
                    const count = prsHit;
                    return count > 0 ? count : '—';
                  })()}
                </Text>
                <Text style={styles.workoutDoneStatLabel}>{prsHit === 1 ? 'PR' : 'PRs'}</Text>
              </View>
            </View>

            <View style={styles.workoutDoneNextRow}>
              {isWeekDoneForCard ? (
                <>
                  <Ionicons name="trophy-outline" size={13} color={Colors.accent} />
                  <Text style={styles.workoutDoneNextText}>
                    Week {planData?.currentWeek} done.{' '}
                    <Text style={styles.workoutDoneNextMuted}>Rest up this weekend.</Text>
                  </Text>
                </>
              ) : nextDayInfo?.type === 'rest' ? (
                <>
                  <Ionicons name="calendar-outline" size={13} color={Colors.textTertiary} />
                  <Text style={styles.workoutDoneNextText}>
                    <Text style={styles.workoutDoneNextMuted}>Next: Rest day tomorrow</Text>
                  </Text>
                </>
              ) : nextDayInfo?.type === 'workout' ? (
                <>
                  <Ionicons name="barbell-outline" size={13} color={Colors.accent} />
                  <Text style={styles.workoutDoneNextText}>
                    Next: {nextDayInfo.label}{' '}
                    <Text style={styles.workoutDoneNextMuted}>· {nextDayInfo.day}</Text>
                  </Text>
                </>
              ) : null}
            </View>
          </TouchableOpacity>
        ) : (
          <>
            {!isTrainingDay && !devBypassDayGate && !planData?.todayCardioDay ? (
          planData?.planStartsOn ? (
            <View style={styles.planFutureCard}>
              <Text style={styles.planFutureLabel}>COMING UP</Text>
              <Text style={styles.planFutureTitle}>Your plan starts</Text>
              <Text style={styles.planFutureDate}>{planData.planStartsOn}</Text>
              <Text style={styles.planFutureHint}>
                {stripEmDash(
                  cleanJordanMessage(
                    'Your plan starts Monday. Rest up, stay active, and come back ready to train. The work begins then.',
                  ) ?? '',
                )}
              </Text>
            </View>
          ) : (
            <RecoveryDayCard planGoal={planData?.planGoal} dayNumber={recoveryDayNumber} />
          )
        ) : today ? (
          <View style={styles.workoutCard}>
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

            <Text style={styles.workoutName}>{today.title}</Text>

            <View style={styles.chipRow}>
              {(today.muscleGroups ?? []).map((muscle) => (
                <View key={muscle} style={styles.muscleChip}>
                  <Text style={styles.muscleChipText}>{muscle}</Text>
                </View>
              ))}
            </View>

            {displaySessionFocus ? (
              <View style={styles.sessionFocusCard}>
                <Text style={styles.sessionFocusText}>{stripEmDash(displaySessionFocus ?? '')}</Text>
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

            {needsWeekPaywall && entitlementLoading ? (
              <View style={[styles.ctaButton, styles.ctaButtonLoadingGate]}>
                <ActivityIndicator color={Colors.accent} />
              </View>
            ) : needsWeekPaywall && !isPro ? (
              <TouchableOpacity
                style={styles.weekUnlockButton}
                activeOpacity={0.8}
                onPress={() => {
                  const rootNav = navigation.getParent()?.getParent();
                  if (rootNav) {
                    rootNav.navigate('SubscriptionManagement');
                  } else {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    navigation.navigate('ProfileTab' as any, {
                      screen: 'SubscriptionManagement',
                    });
                  }
                }}
              >
                <View style={styles.weekUnlockRow}>
                  <Ionicons
                    name="lock-closed"
                    size={16}
                    color={Colors.textPrimary}
                  />
                  <Text style={styles.weekUnlockTitle}>
                    Unlock Week {sessionWeekForGate} — See Plans
                  </Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.ctaButton}
                activeOpacity={0.8}
                onPress={() => void handleStartWorkout()}
              >
                <Text style={styles.ctaText}>Start Workout →</Text>
              </TouchableOpacity>
            )}
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
        ) : planData?.todayCardioDay ? null : (
          <RecoveryDayCard planGoal={planData?.planGoal} dayNumber={recoveryDayNumber} />
        )}
          </>
        )}

        {/* ── 5. Week Progress ── */}
        {planStatus !== 'completed' && (
          <View style={styles.weekProgressSection}>
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
                        <Ionicons name="checkmark" size={16} color={Colors.success} />
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
          </View>
        )}

        {planStatus !== 'completed' &&
          showGenerateNextWeekCTA &&
          !planData?.nextWeekReady && (
          <View style={styles.generateCTACard}>
            <View style={styles.generateCTATitleRow}>
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color={Colors.success}
              />
              <Text style={styles.generateCTATitle}>
                Week {planData?.currentWeek} Complete!
              </Text>
            </View>
            <Text style={styles.generateCTASubtitle}>
              All sessions done. Generate your Week{' '}
              {(planData?.currentWeek ?? 0) + 1} plan when you're ready.
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
        )}

        {/* ── 6. Daily Check-in Card ── */}
        <TouchableOpacity
          style={styles.checkInCard}
          onPress={() => setShowDailyCheckIn(true)}
          activeOpacity={0.8}
        >
          <View style={styles.checkInLeft}>
            <Text style={styles.checkInTitle}>Daily Check-in</Text>
            <View style={styles.checkInStatusRow}>
              {weightLoggedToday ? (
                <View style={styles.checkInBadge}>
                  <Ionicons name="checkmark" size={11} color={Colors.success} />
                  <Text style={styles.checkInBadgeText}>
                    {todayWeight != null ? formatBodyWeight(todayWeight) : 'Weight'}
                  </Text>
                </View>
              ) : (
                <View style={[styles.checkInBadge, styles.checkInBadgePending]}>
                  <Text style={styles.checkInBadgePendingText}>Weight</Text>
                </View>
              )}
              {todaySleepHours != null ? (
                <View style={styles.checkInBadge}>
                  <Ionicons name="checkmark" size={11} color={Colors.success} />
                  <Text style={styles.checkInBadgeText}>{todaySleepHours}h sleep</Text>
                </View>
              ) : (
                <View style={[styles.checkInBadge, styles.checkInBadgePending]}>
                  <Text style={styles.checkInBadgePendingText}>Sleep</Text>
                </View>
              )}
              {todayActivityLog != null ? (
                <View style={styles.checkInBadge}>
                  <Ionicons name="checkmark" size={11} color={Colors.success} />
                  <Text style={styles.checkInBadgeText}>Activity</Text>
                </View>
              ) : (
                <View style={[styles.checkInBadge, styles.checkInBadgePending]}>
                  <Text style={styles.checkInBadgePendingText}>Activity</Text>
                </View>
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </TouchableOpacity>

        {/* ── 7. Quick Stats Row ── */}
        {planStatus !== 'completed' && (
          <View style={styles.statsStrip}>
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
                  <Ionicons name="flame-outline" size={20} color={Colors.accent} />
                  <Text
                    style={[
                      styles.quickStatValue,
                      currentStreak > 0 ? styles.quickStatValuePrimary : null,
                    ]}
                  >
                    {streakDisplay}
                  </Text>
                  <Text style={styles.quickStatLabel}>Day streak</Text>
                </View>
                <View style={styles.quickStatCard}>
                  <Ionicons name="flash-outline" size={20} color={Colors.accent} />
                  <Text
                    style={[
                      styles.quickStatValue,
                      totalSessions > 0 ? styles.quickStatValuePrimary : null,
                    ]}
                  >
                    {sessionsDisplay}
                  </Text>
                  <Text style={styles.quickStatLabel}>Sessions</Text>
                </View>
                <TouchableOpacity
                  style={[styles.statCard, styles.statCardTappable]}
                  onPress={() => {
                    if (
                      progressedCount !== null &&
                      progressedCount > 0
                    ) {
                      navigation.navigate('AdaptationFeed', {
                        weekNumber: progressedCount > 0 && planData?.nextWeekReady
                          ? dashboardCurrentWeek + 1
                          : dashboardCurrentWeek,
                      });
                    }
                  }}
                  activeOpacity={
                    !progressedCount ? 1 : 0.7
                  }
                >
                  {progressedCount !== null &&
                  progressedCount > 0 ? (
                    <View style={styles.statCardChevron}>
                      <Ionicons
                        name="chevron-forward"
                        size={12}
                        color={Colors.accent}
                      />
                    </View>
                  ) : null}

                  {(progressedCount === null || progressedCount === 0) && !isDeload ? (
                    <Ionicons
                      name="flag-outline"
                      size={24}
                      color={Colors.textTertiary}
                    />
                  ) : isDeload ? (
                    <Ionicons
                      name="battery-charging-outline"
                      size={24}
                      color={Colors.textTertiary}
                    />
                  ) : progressedCount === 0 || progressedCount === null ? (
                    <Ionicons
                      name="trending-up"
                      size={24}
                      color={Colors.textTertiary}
                    />
                  ) : (
                    <Ionicons
                      name="trending-up"
                      size={24}
                      color={Colors.success}
                    />
                  )}

                  <Text style={styles.statValue}>
                    {isDeload
                      ? '—'
                      : progressedCount === null || progressedCount === 0
                        ? '—'
                        : String(progressedCount)}
                  </Text>

                  <Text style={styles.statLabel}>
                    {isDeload
                      ? 'deload'
                      : (progressedCount === null || progressedCount === 0)
                        ? 'baseline'
                        : progressedCount === 1
                          ? 'exercise'
                          : 'exercises'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
            <JordanAvatar size={32} />
            <Text style={styles.summaryUnreadText}>
              {`Jordan reviewed your Week ${unviewedSummaryWeekNumber}. Tap to read`}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* ── 8. Coach Card ── */}
        <View style={styles.coachCard}>
          <View style={styles.coachHeaderRow}>
            <View style={styles.coachHeaderLeft}>
              <JordanAvatar size={32} />
              <Text style={styles.coachBrand}>JORDAN</Text>
            </View>
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

          {hasViewableSummary && planData ? (
            <TouchableOpacity
              style={styles.reviewSummaryCTA}
              activeOpacity={0.85}
              onPress={() => {
                const weekNum = latestSummary?.week_number ?? completedWeek;
                const planIdForSummary =
                  planData.planId ??
                  (planData as PlanData & { id?: string }).id ??
                  '';
                const rootNav = navigation.getParent()?.getParent();
                rootNav?.dispatch(
                  CommonActions.reset({
                    index: 0,
                    routes: [
                      {
                        name: 'Dashboard',
                        state: {
                          routes: [
                            {
                              name: 'HomeTab',
                              state: {
                                routes: [
                                  {
                                    name: 'WeeklyCoachSummary',
                                    params: {
                                      planId: planIdForSummary,
                                      weekNumber: weekNum,
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  }),
                );
              }}
            >
              <View style={styles.reviewSummaryCTARow}>
                <Text style={styles.reviewSummaryCTAText}>
                  Review Week {latestSummary?.week_number ?? completedWeek} Summary →
                </Text>
                {hasUnviewedWeeklySummary ? (
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>NEW</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          ) : null}

          <View style={styles.coachFooterRow}>
            {displayedGoalProgress &&
            displayedGoalProgress.target1RM > 0 &&
            planStatus === 'active' ? (
              <View style={styles.goalProgressFooter}>
                <Text style={styles.goalProgressLift}>
                  {formatLiftName(displayedGoalProgress.targetLift ?? '')}
                </Text>
                <Text style={styles.goalProgressValues}>
                  {Math.round(displayedGoalProgress.current1RM)} →{' '}
                  {Math.round(displayedGoalProgress.target1RM)} lbs
                </Text>
              </View>
            ) : (
              <View style={styles.coachFooterSpacer} />
            )}
            <Text style={styles.coachUpdated}>{jordanCardUpdatedLabel}</Text>
          </View>
        </View>

          </>
        )}
      </ScrollView>

      {planData != null && activityDashboardUserId != null ? (
        <DailyCheckInSheet
          visible={showDailyCheckIn}
          onClose={() => setShowDailyCheckIn(false)}
          onSaved={() => void loadDashboardData()}
          userId={activityDashboardUserId}
          planId={planData.planId}
          weightLbs={todayWeight ?? dashboardWeightLbs}
          existingWeightLog={
            weightLoggedToday
              ? { weight_lbs: todayWeight, sleep_hours: todaySleepHours, readiness_score: todayReadiness }
              : null
          }
          existingActivityLog={todayActivityLog}
          isMetric={isMetric}
        />
      ) : null}

      {homeShareCardVisible && homeShareCardData ? (
        <View style={styles.offScreenCapture} pointerEvents="none">
          <ShareCard ref={homeShareCardRef} {...homeShareCardData} />
        </View>
      ) : null}

      {showWorkoutResultsModal && planData ? (
        <WorkoutResultsModal
          visible={showWorkoutResultsModal}
          onClose={() => setShowWorkoutResultsModal(false)}
          dayTitle={planData.todayWorkout?.title ?? 'Today\'s Session'}
          completedDate={new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          workoutLog={todayWorkoutLog as WorkoutLog | null}
          exerciseMap={todayExerciseMap}
          planExercises={todayPlanExercises}
          summaryPlanGoal={planData.planGoal}
          summaryWeek={planData.currentWeek}
          summaryPlanPhase={currentPhase ?? null}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  offScreenCapture: {
    position: 'absolute',
    left: -10000,
    top: 0,
    opacity: 0,
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
    paddingHorizontal: Spacing.xl,
    paddingTop: 56,
    paddingBottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerDate: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    paddingBottom: 4,
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
  trialBanner: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trialBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  trialBannerText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.accent,
    flexShrink: 1,
  },
  trialBannerManage: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  missedCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  missedCardHeader: {
    marginBottom: Spacing.sm,
  },
  missedCardLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.warning,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  missedCardTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  missedMuscleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  missedMuscleBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
  },
  missedMuscleBadgeText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  missedJordanRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  missedJordanText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  missedActions: {
    gap: Spacing.sm,
  },
  missedActionPrimary: {
    height: 48,
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missedActionPrimaryText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  missedActionSecondary: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missedActionSecondaryText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
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
  planFutureCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accent,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  planFutureLabel: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  planFutureTitle: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  planFutureDate: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  planFutureHint: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  recoveryDayCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.md,
  },
  recoveryDayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recoveryDayPill: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  recoveryDayContext: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
  },
  recoveryDayTitle: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  workoutDoneCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.md,
  },
  workoutDoneTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  workoutDoneLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  workoutDonePill: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
  },
  workoutDoneShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  workoutDoneShareText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
  workoutDoneTitle: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  workoutDoneSubtitle: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
    marginBottom: Spacing.md,
  },
  workoutDoneTapHint: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
    opacity: 0.6,
  },
  workoutDoneStatsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  workoutDoneStat: {
    flex: 1,
    alignItems: 'center',
  },
  workoutDoneStatBorder: {
    borderRightWidth: 1,
    borderRightColor: Colors.divider,
  },
  workoutDoneStatValue: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  workoutDoneStatValuePr: {
    color: Colors.accent,
  },
  workoutDoneStatLabel: {
    fontSize: 10,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  workoutDoneNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: Spacing.sm,
  },
  workoutDoneNextText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  workoutDoneNextMuted: {
    color: Colors.textTertiary,
  },
  jordanSuggestionCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accentBorder,
    marginTop: Spacing.sm,
  },
  jordanSuggestionBrand: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  jordanSuggestionBody: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
  },
  recoveryPillarsRow: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
  },
  recoveryPillarCard: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginHorizontal: Spacing.xs,
    alignItems: 'center',
  },
  recoveryPillarEmoji: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    marginBottom: Spacing.xs,
  },
  recoveryPillarLabel: {
    fontSize: FontSizes.micro,
    fontFamily: Fonts.bold,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  recoveryPillarValueBold: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  recoveryPillarValueProtein: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  workoutLabel: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
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
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  sessionFocusText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
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
  ctaButtonLoadingGate: {
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  weekUnlockButton: {
    marginTop: Spacing.xl,
    minHeight: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  weekUnlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  weekUnlockTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.accent,
    textAlign: 'center',
  },
  weekUnlockPrice: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
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

  planCompleteCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  planCompleteEmoji: {
    fontSize: 36,
    marginBottom: Spacing.sm,
  },
  planCompleteTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  planCompleteSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  planCompleteCTA: {
    backgroundColor: Colors.accent,
    height: 48,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  planCompleteCTAText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },

  /** Wrapper for week ring + dots (conditional block clarity) */
  weekProgressSection: {},

  weekCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    backgroundColor: Colors.bgPrimary,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
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
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.success,
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

  /** Quick stats strip (streak / sessions / lbs) — grouped for conditional render */
  statsStrip: {},

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
  statCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  statCardTappable: {
    position: 'relative',
  },
  statCardChevron: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
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
  quickStatValuePrimary: {
    color: Colors.textPrimary,
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
  coachHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
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
  goalProgressFooter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginRight: Spacing.sm,
  },
  goalProgressLift: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },
  goalProgressValues: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  coachLink: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.accent,
  },
  reviewSummaryCTA: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  reviewSummaryCTARow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewSummaryCTAText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.accent,
  },
  newBadge: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  newBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.bgPrimary,
  },
  coachUpdated: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },

  checkInCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkInLeft: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  checkInTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  checkInStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  checkInBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.successMuted,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  checkInBadgePending: {
    backgroundColor: Colors.bgElevated,
  },
  checkInBadgeText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.success,
  },
  checkInBadgePendingText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
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

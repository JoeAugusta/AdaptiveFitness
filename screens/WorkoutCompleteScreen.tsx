import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Animated,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { shareAsync } from 'expo-sharing';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { getSessionSignal } from '../utils/sessionSignal';
import { stripEmDash } from '../utils/jordanText';
import { setPendingJordanNote } from '../utils/sessionNoteStore';
import { hapticMedium, hapticPR, hapticSuccess } from '../utils/haptics';
import { ShareCard, SHARE_CARD_WIDTH, type ShareCardProps } from '../components/ShareCard';
import PRShareCard, { PR_SHARE_CARD_SIZE } from '../components/PRShareCard';
import { useMetric } from '../utils/units';
import { prepareShareCardData } from '../utils/workoutShareAction';
import {
  computeSessionShareStats,
  computeTopLiftsFromSets,
  fallbackJordanNoteFromRpe,
  resolveSessionTitleFromPlan,
  truncateJordanNoteForShare,
} from '../utils/workoutShare';
import { countFlaggedSetsInJson, getSessionOutcome } from '../Lib/records';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'WorkoutComplete'>;
type RouteType = RouteProp<RootStackParamList, 'WorkoutComplete'>;

const FATIGUE_MAP: Record<
  number,
  { color: string; label: string; tip: string }
> = {
  1: {
    color: '#EF4444',
    label: 'Wiped',
    tip: 'Take it easy tomorrow — prioritise sleep and light movement.',
  },
  2: {
    color: Colors.ember,
    label: 'Tired',
    tip: 'Take it easy tomorrow — prioritise sleep and light movement.',
  },
  3: {
    color: '#F59E0B',
    label: 'Good',
    tip: 'Good session. Standard recovery applies.',
  },
  4: {
    color: '#84CC16',
    label: 'Strong',
    tip: "Great energy today. You're ready to push again soon.",
  },
  5: {
    color: '#22C55E',
    label: 'Beast',
    tip: "Great energy today. You're ready to push again soon.",
  },
};

function getRecoveryQuality(
  avgDelta: number | null,
): { label: string; color: string } | null {
  if (avgDelta === null) return null;
  if (avgDelta >= 50) return { label: 'Strong', color: Colors.success };
  if (avgDelta >= 25) return { label: 'Adequate', color: Colors.warning };
  return { label: 'Needs work', color: Colors.danger };
}

const STAT_TILE_COUNT = 4;

const STATIC_TILE_META = [
  { key: 'exercises', label: 'Exercises' },
  { key: 'sets', label: 'Sets Logged' },
  { key: 'duration', label: 'Duration' },
  { key: 'records', label: 'PRs Hit' },
] as const;

type RecordsTileDisplay = {
  label: string;
  value: string;
  isPr: boolean;
  isBaseline: boolean;
};

function recordsTileDisplay(
  outcomeStatus: 'pending' | 'ready' | 'error',
  prCount: number,
  baselineCount: number,
): RecordsTileDisplay {
  if (outcomeStatus !== 'ready') {
    return { label: 'PRs Hit', value: '—', isPr: false, isBaseline: false };
  }
  if (prCount > 0) {
    return {
      label: 'PRs Hit',
      value: String(prCount),
      isPr: true,
      isBaseline: false,
    };
  }
  if (baselineCount > 0) {
    return {
      label: 'Baselines Set',
      value: String(baselineCount),
      isPr: false,
      isBaseline: true,
    };
  }
  return { label: 'PRs Hit', value: '0', isPr: false, isBaseline: false };
}

function statTileIcon(key: (typeof STATIC_TILE_META)[number]['key']): ReactNode {
  switch (key) {
    case 'exercises':
      return <Ionicons name="barbell-outline" size={24} color={Colors.accent} />;
    case 'sets':
      return (
        <Ionicons name="checkmark-circle-outline" size={24} color={Colors.success} />
      );
    case 'duration':
      return <Ionicons name="time-outline" size={24} color={Colors.accent} />;
    case 'records':
      return <Ionicons name="trophy-outline" size={24} color={Colors.accent} />;
  }
}

function rawWeekNumber(w: {
  weekNumber?: unknown;
  week_number?: unknown;
}): number {
  const n = w.weekNumber ?? w.week_number;
  return typeof n === 'number' && !Number.isNaN(n) ? n : 0;
}

function isGenerateNextWeekOk(data: unknown, error: unknown): boolean {
  if (error) return false;
  const d = data as { status?: string; error?: string } | null | undefined;
  if (d == null) return false;
  if (d.error) return false;
  if (d.status === 'error') return false;
  return ['success', 'already_exists', 'plan_complete', 'already_advanced'].includes(
    d.status ?? '',
  );
}

type PlanLogRow = {
  week_number: number;
  day_number: number;
  skipped: boolean | null;
};

/** True when this session completes the last scheduled workout in the final plan week (log already saved). */
function checkIsFinalSession(
  planJson: unknown,
  totalWeeks: number,
  weekNumber: number,
  allLogs: PlanLogRow[],
): boolean {
  if (weekNumber !== totalWeeks) return false;

  const weeks =
    planJson &&
    typeof planJson === 'object' &&
    planJson !== null &&
    'weeks' in planJson &&
    Array.isArray((planJson as { weeks: unknown }).weeks)
      ? (planJson as { weeks: unknown[] }).weeks
      : [];

  const finalWeekObj = weeks.find(
    (w) => rawWeekNumber(w as { weekNumber?: unknown; week_number?: unknown }) === totalWeeks,
  );
  if (!finalWeekObj || typeof finalWeekObj !== 'object' || finalWeekObj === null) {
    return false;
  }

  const days =
    'days' in finalWeekObj &&
    Array.isArray((finalWeekObj as { days?: unknown }).days)
      ? (finalWeekObj as { days: unknown[] }).days
      : [];
  const workoutDays = days.filter(
    (d) =>
      typeof d === 'object' &&
      d !== null &&
      (d as { type?: string }).type === 'workout',
  );
  const scheduledCount = workoutDays.length;
  if (scheduledCount === 0) return false;

  const loggedThisWeek = allLogs.filter(
    (l) => l.week_number === totalWeeks && !l.skipped,
  ).length;

  return loggedThisWeek >= scheduledCount;
}

export default function WorkoutCompleteScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const insets = useSafeAreaInsets();
  const {
    planId,
    weekNumber,
    dayNumber,
    totalSets,
    totalExercises,
    durationMinutes,
    fatigueRating,
    workoutLogId,
    sessionDate,
    sessionAvgHR = null,
    sessionPeakHR = null,
    avgRecoveryDelta = null,
  } = route.params;

  useEffect(() => {
    if (__DEV__) {
      console.log(
        '[WorkoutComplete] workout_log keys (must match row inserted in ActiveWorkout)',
        { planId, weekNumber, dayNumber },
      );
    }
  }, [planId, weekNumber, dayNumber]);

  const triggerNextSessionAdjustment = useCallback(async () => {
    try {
      const signalResult = await getSessionSignal(planId, weekNumber);
      if (!signalResult?.signal || signalResult.signal === 'on_target') return;

      await supabase.functions.invoke('adjust-next-session', {
        body: { planId, weekNumber, signal: signalResult.signal },
      });

      if (__DEV__) {
        console.log('[P3-C1] adjust-next-session triggered:', signalResult.signal);
      }
    } catch (err) {
      if (__DEV__) console.warn('[P3-C1] adjust-next-session failed silently:', err);
    }
  }, [planId, weekNumber]);

  useEffect(() => {
    void triggerNextSessionAdjustment();
  }, [triggerNextSessionAdjustment]);

  const fatigue = FATIGUE_MAP[fatigueRating] ?? FATIGUE_MAP[3];
  const [outcomeStatus, setOutcomeStatus] = useState<'pending' | 'ready' | 'error'>(
    'pending',
  );
  const [sessionPrCount, setSessionPrCount] = useState(0);
  const [sessionBaselineCount, setSessionBaselineCount] = useState(0);
  const [flaggedSetCount, setFlaggedSetCount] = useState(0);
  const recordsDisplay = useMemo(
    () => recordsTileDisplay(outcomeStatus, sessionPrCount, sessionBaselineCount),
    [outcomeStatus, sessionPrCount, sessionBaselineCount],
  );

  const statTileValues = useMemo(
    () => ({
      exercises: String(totalExercises),
      sets: String(totalSets),
      duration: `${durationMinutes} min`,
      records: recordsDisplay.value,
    }),
    [totalExercises, totalSets, durationMinutes, recordsDisplay.value],
  );

  // Animations — fixed length, never tied to async outcome state
  const checkScale = useRef(new Animated.Value(0)).current;
  const cardOpacities = useRef(
    Array.from({ length: STAT_TILE_COUNT }, () => new Animated.Value(0)),
  ).current;
  const skeletonOpacity = useRef(new Animated.Value(0.4)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Coaching note state via ref to avoid re-render loop
  const [coachNote, setCoachNote] = [
    useRef<string | null>(null),
    (v: string | null) => {
      coachNote.current = v;
      setCoachNoteDisplay(v);
    },
  ] as const;
  // Separate display state to trigger re-render
  const [coachNoteDisplay, setCoachNoteDisplay] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(true);
  const [hrTrendDisplay, setHrTrendDisplay] = useState<{
    delta: number;
    direction: 'up' | 'down';
    recentAvg: number;
  } | null>(null);

  const [showSummaryBanner, setShowSummaryBanner] = useState(false);
  const [nextWeekReady, setNextWeekReady] = useState(false);
  const [adaptationChangeCount, setAdaptationChangeCount] = useState(0);
  const [macroAdjustment, setMacroAdjustment] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState(false);
  const [isWeekComplete, setIsWeekComplete] = useState(false);
  const [weekCompletionChecked, setWeekCompletionChecked] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const autoGenStartedRef = useRef(false);
  const workoutCompleteSuccessHapticRef = useRef(false);

  const [sharingAvailable, setSharingAvailable] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCardVisible, setShareCardVisible] = useState(false);
  const [shareCardData, setShareCardData] = useState<ShareCardProps | null>(null);
  const shareCardRef = useRef<View>(null);
  const shareCapturePendingRef = useRef(false);
  const prCardRef = useRef<View>(null);
  const [topPr, setTopPr] = useState<{
    exerciseName: string;
    weightLbs: number;
    reps: number;
    isEstimated: boolean;
    estimated1RM: number;
  } | null>(null);
  const { isMetric } = useMetric();

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    void Sharing.isAvailableAsync()
      .then(setSharingAvailable)
      .catch(() => setSharingAvailable(false));
  }, []);

  useEffect(() => {
    if (workoutCompleteSuccessHapticRef.current) return;
    workoutCompleteSuccessHapticRef.current = true;
    void hapticSuccess();
  }, []);

  const prepareAndShareWorkoutCard = useCallback(async () => {
    setShareLoading(true);
    try {
      const payload = await prepareShareCardData({
        planId,
        weekNumber,
        dayNumber,
        totalSets,
        durationMinutes,
        prsHit: sessionPrCount,
        latestJordanNote: null,
      });
      if (!payload) return;
      shareCapturePendingRef.current = true;
      setShareCardData(payload);
      setShareCardVisible(true);
    } catch (err) {
      if (__DEV__) console.warn('[WorkoutComplete] share prepare failed:', err);
      setShareLoading(false);
      setShareCardVisible(false);
      setShareCardData(null);
      shareCapturePendingRef.current = false;
    }
  }, [planId, weekNumber, dayNumber, totalSets, durationMinutes, sessionPrCount]);

  const handleSharePR = useCallback(async () => {
    if (!topPr || !prCardRef.current) return;
    try {
      await hapticMedium();
      const uri = await captureRef(prCardRef, {
        format: 'jpg',
        quality: 0.95,
        width: PR_SHARE_CARD_SIZE,
        result: 'tmpfile',
      });
      await shareAsync(uri, {
        mimeType: 'image/jpeg',
        dialogTitle: 'Share your PR',
      });
    } catch (e) {
      console.warn('[PRShare]', e);
    }
  }, [topPr]);

  const handleShareWorkout = useCallback(async () => {
    if (!sharingAvailable || shareLoading) return;

    if (topPr && Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Workout Card', 'PR Card', 'Both'],
          cancelButtonIndex: 0,
        },
        async (buttonIndex) => {
          if (buttonIndex === 0) return;
          if (buttonIndex === 1 || buttonIndex === 3) {
            await prepareAndShareWorkoutCard();
          }
          if (buttonIndex === 2 || buttonIndex === 3) {
            await handleSharePR();
          }
        },
      );
      return;
    }

    await prepareAndShareWorkoutCard();
  }, [sharingAvailable, shareLoading, topPr, handleSharePR, prepareAndShareWorkoutCard]);

  useEffect(() => {
    if (!shareCardVisible || !shareCardData || !shareCapturePendingRef.current) {
      return;
    }

    let cancelled = false;

    const runCapture = async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (cancelled) return;

      const node = shareCardRef.current;
      if (!node) {
        if (!cancelled) {
          setShareLoading(false);
          setShareCardVisible(false);
          setShareCardData(null);
          shareCapturePendingRef.current = false;
        }
        return;
      }

      try {
        const uri = await captureRef(node, {
          format: 'jpg',
          quality: 0.95,
          width: SHARE_CARD_WIDTH,
          result: 'tmpfile',
        });

        if (cancelled) return;

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/jpeg',
            dialogTitle: 'Share workout',
          });
        }
      } catch (err) {
        if (__DEV__) console.warn('[WorkoutComplete] share capture failed:', err);
      } finally {
        if (!cancelled) {
          setShareLoading(false);
          setShareCardVisible(false);
          setShareCardData(null);
          shareCapturePendingRef.current = false;
        }
      }
    };

    void runCapture();
    return () => {
      cancelled = true;
    };
  }, [shareCardVisible, shareCardData]);

  useEffect(() => {
    if (outcomeStatus !== 'ready' || sessionPrCount <= 0) return;
    let cancelled = false;
    const prTimer = setTimeout(() => {
      if (!cancelled) void hapticPR();
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(prTimer);
    };
  }, [outcomeStatus, sessionPrCount]);

  useEffect(() => {
    if (!workoutLogId) {
      if (__DEV__) {
        console.warn('[WorkoutComplete] missing workoutLogId — records tile stays placeholder');
      }
      setOutcomeStatus('error');
      setTopPr(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId || cancelled) {
          if (!cancelled && !userId) {
            if (__DEV__) {
              console.warn('[WorkoutComplete] no authenticated user for session outcome');
            }
            setOutcomeStatus('error');
          }
          return;
        }

        const outcome = await getSessionOutcome(
          userId,
          workoutLogId,
          sessionDate,
        );
        if (cancelled) return;

        setSessionPrCount(outcome.prs.length);
        setSessionBaselineCount(outcome.baselines.length);
        setOutcomeStatus('ready');

        const topRecord = [...outcome.prs].sort(
          (a, b) => b.best_e1rm - a.best_e1rm,
        )[0];
        if (topRecord) {
          setTopPr({
            exerciseName: topRecord.display_name,
            weightLbs: topRecord.best_load,
            reps: topRecord.best_reps,
            isEstimated: topRecord.best_reps > 1,
            estimated1RM: topRecord.best_e1rm,
          });
        } else {
          setTopPr(null);
        }

        if (topRecord && outcome.prs.length > 0) {
          void (async () => {
            try {
              const prBody =
                outcome.prs.length === 1
                  ? `New PR on ${topRecord.display_name} — ${topRecord.best_load} lbs × ${topRecord.best_reps}`
                  : `${outcome.prs.length} PRs this session. Top: ${topRecord.display_name} at ${topRecord.best_load} lbs`;
              await supabase.from('notifications').insert({
                user_id: userId,
                type: 'pr_hit',
                title:
                  outcome.prs.length === 1
                    ? 'Personal record!'
                    : `${outcome.prs.length} personal records!`,
                body: prBody,
                metadata: {
                  plan_id: planId,
                  week_number: weekNumber,
                  day_number: dayNumber,
                  prs_hit: outcome.prs.length,
                  top_exercise: topRecord.display_name,
                  top_weight_lbs: topRecord.best_load,
                  top_reps: topRecord.best_reps,
                },
              });
            } catch (notifErr) {
              if (__DEV__) console.warn('[notifications] pr_hit write failed:', notifErr);
            }
          })();
        }
      } catch (err) {
        console.warn('[WorkoutComplete] session outcome load failed:', err);
        if (!cancelled) {
          setOutcomeStatus('error');
          setTopPr(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workoutLogId, sessionDate, planId, weekNumber, dayNumber]);

  useEffect(() => {
    if (!workoutLogId) {
      setFlaggedSetCount(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('workout_logs')
          .select('sets_json')
          .eq('id', workoutLogId)
          .maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        setFlaggedSetCount(countFlaggedSetsInJson(data?.sets_json));
      } catch (err) {
        console.warn('[WorkoutComplete] flagged set count failed:', err);
        if (!cancelled) setFlaggedSetCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workoutLogId]);

  useEffect(() => {
    if (nextWeekReady) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }, [nextWeekReady]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) {
          if (!cancelled) setWeekCompletionChecked(true);
          return;
        }

        const { data: planRow } = await supabase
          .from('plans')
          .select('plan_json, total_weeks')
          .eq('id', planId)
          .maybeSingle();

        const totalWeeks =
          typeof planRow?.total_weeks === 'number' && planRow.total_weeks > 0
            ? planRow.total_weeks
            : typeof (planRow?.plan_json as { totalWeeks?: number } | undefined)?.totalWeeks ===
                'number'
              ? (planRow?.plan_json as { totalWeeks: number }).totalWeeks
              : 1;

        const { data: allLogs } = await supabase
          .from('workout_logs')
          .select('week_number, day_number, skipped')
          .eq('user_id', userId)
          .eq('plan_id', planId);

        const logRows = (allLogs ?? []) as PlanLogRow[];

        const devForce =
          __DEV__ && (await AsyncStorage.getItem('dev_force_plan_complete')) === 'true';
        const planJson = planRow?.plan_json;
        const isFinal = devForce
          ? true
          : checkIsFinalSession(planJson, totalWeeks, weekNumber, logRows);

        if (isFinal) {
          if (!cancelled) {
            navigation.replace('PlanComplete', { planId });
          }
          return;
        }

        const { data: logs } = await supabase
          .from('workout_logs')
          .select('day_number')
          .eq('user_id', userId)
          .eq('plan_id', planId)
          .eq('week_number', weekNumber);

        const distinctLoggedDays = new Set(
          (logs ?? []).map((r: { day_number: number }) => r.day_number),
        ).size;

        const daysPerWeek: number = planRow?.plan_json?.daysPerWeek ?? 7;

        // Cold-start mid-week: sessions before the user's calendar start
        // position are implicitly complete. Only applies when total logged
        // sessions equals today's position in scheduledDays (i.e. this is
        // their first or only session so far this week at the correct slot).
        const scheduledDays: string[] = Array.isArray(
          (planRow?.plan_json as { scheduledDays?: string[] } | undefined)?.scheduledDays,
        )
          ? (planRow?.plan_json as { scheduledDays: string[] }).scheduledDays
          : [];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const todayLabel = dayNames[new Date().getDay()];
        const normalizedScheduled = scheduledDays.map((d) => d.trim().slice(0, 3));
        const todayScheduledIndex = normalizedScheduled.indexOf(todayLabel);
        // If today is at position N in scheduledDays and exactly N sessions
        // have been logged this week, the prior slots are implicitly done.
        const implicitSessions =
          todayScheduledIndex > 0 &&
          distinctLoggedDays > 0 &&
          distinctLoggedDays <= todayScheduledIndex
            ? todayScheduledIndex - (distinctLoggedDays - 1)
            : 0;
        const effectiveCompleted = distinctLoggedDays + implicitSessions;

        if (!cancelled) {
          if (effectiveCompleted >= daysPerWeek) {
            setIsWeekComplete(true);
            setWeekCompletionChecked(true);
            setSummaryLoading(true);

            // Rate App gate — only after week is complete, only on device, non-blocking
            void (async () => {
              try {
                if (
                  Platform.OS !== 'web' &&
                  weekNumber >= 1 &&
                  await StoreReview.hasAction()
                ) {
                  const RATE_APP_KEY = 'hone_rate_app_prompted';
                  const alreadyPrompted = await AsyncStorage.getItem(RATE_APP_KEY);
                  if (!alreadyPrompted) {
                    await StoreReview.requestReview();
                    await AsyncStorage.setItem(RATE_APP_KEY, '1');
                  }
                }
              } catch {
                // Never block on review prompt failure
              }
            })();
            // Fire weekly summary immediately — independent of next week generation
            void (async () => {
              try {
                const { data: { session: authSession } } = await supabase.auth.getSession();
                const uid = authSession?.user?.id;
                if (!uid) return;
                const { data: summaryData } = await supabase.functions.invoke(
                  'weekly-coach-summary',
                  { body: { userId: uid, planId, weekNumber } },
                );
                if (summaryData?.summary) {
                  setShowSummaryBanner(true);
                  await AsyncStorage.setItem(
                    'hone_unviewed_summary_week',
                    String(weekNumber),
                  );
                }
              } catch (err) {
                console.warn('[WorkoutComplete] weekly summary fire failed:', err);
              } finally {
                setSummaryLoading(false);
              }
            })();
          } else {
            setIsWeekComplete(false);
            setWeekCompletionChecked(true);
          }
        }
      } catch {
        if (!cancelled) setWeekCompletionChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, weekNumber, navigation]);

  const handleGenerateNextWeek = useCallback(async () => {
    setIsGenerating(true);
    setGenerationError(false);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        setGenerationError(true);
        return;
      }

      const { data: existingPlan } = await supabase
        .from('plans')
        .select('plan_json')
        .eq('id', planId)
        .maybeSingle();

      const weeks =
        (existingPlan?.plan_json as { weeks?: unknown[] } | undefined)?.weeks ??
        [];
      const nextWeekExists = weeks.some(
        (w) => rawWeekNumber(w as { weekNumber?: unknown; week_number?: unknown }) === weekNumber + 1,
      );

      const summaryPromise = supabase.functions.invoke('weekly-coach-summary', {
        body: { userId, planId, weekNumber },
      });

      const nextWeekPromise = nextWeekExists
        ? Promise.resolve({
            data: { status: 'already_exists' as const },
            error: null,
          })
        : supabase.functions.invoke('generate-next-week', {
            body: { userId, planId, completedWeekNumber: weekNumber },
          });

      const [summarySettled, nextWeekSettled] = await Promise.allSettled([
        summaryPromise,
        nextWeekPromise,
      ]);

      const summaryResult =
        summarySettled.status === 'fulfilled' ? summarySettled.value : null;
      if (summaryResult && !summaryResult.error && summaryResult.data?.summary) {
        setShowSummaryBanner(true);
        const completedWeekNumber = weekNumber;
        try {
          await AsyncStorage.setItem(
            'hone_unviewed_summary_week',
            String(completedWeekNumber),
          );
          console.log(
            '[WorkoutComplete] Set unviewed summary week:',
            completedWeekNumber,
          );
        } catch (asErr) {
          console.warn('[WorkoutComplete] AsyncStorage setItem failed:', asErr);
        }
        try {
          const { data: macroAdj } = await supabase.functions.invoke(
            'adjust-macros',
            { body: { userId, planId, weekNumber } },
          );
        if ((macroAdj?.status === 'adjusted' || macroAdj?.status === 'adherence_check') && macroAdj.reasoning) {
          setMacroAdjustment(macroAdj.reasoning);
        }
        } catch (macroErr) {
          console.error('adjust-macros invoke failed:', macroErr);
        }
        try {
          await supabase.functions.invoke('generate-meals', { body: { userId } });
        } catch {
          // Silent — weekly meal refresh is non-critical
        }
      } else {
        if (summaryResult?.error) {
          console.error('weekly-coach-summary error:', summaryResult.error);
        }
        if (summaryResult && !summaryResult.data?.summary) {
          console.error(
            'weekly-coach-summary: no summary in response',
            summaryResult.data,
          );
        }
      }

      let nextOk = false;
      if (nextWeekSettled.status === 'fulfilled') {
        const { data, error } = nextWeekSettled.value;
        nextOk = isGenerateNextWeekOk(data, error);
      }

      if (!nextOk) {
        setGenerationError(true);
      } else {
        setNextWeekReady(true);
        const genData = nextWeekSettled.status === 'fulfilled'
          ? (nextWeekSettled.value.data as { adaptationChangeCount?: number } | null)
          : null;
        if (typeof genData?.adaptationChangeCount === 'number') {
          setAdaptationChangeCount(genData.adaptationChangeCount);
        } else {
          setAdaptationChangeCount(0);
        }
      }
    } catch (err) {
      console.error('handleGenerateNextWeek:', err);
      setGenerationError(true);
    } finally {
      setIsGenerating(false);
    }
  }, [planId, weekNumber]);


  useEffect(() => {
    // 1 — Checkmark spring
    Animated.spring(checkScale, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();

    // 2 — Stat cards sequential fade-in
    const anims = cardOpacities.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 300,
        delay: i * 100,
        useNativeDriver: true,
      }),
    );
    Animated.parallel(anims).start();

    // 3 — Skeleton pulse
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonOpacity, {
          toValue: 0.8,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(skeletonOpacity, {
          toValue: 0.4,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();

    // 4 — Non-blocking coaching note fetch (real RPE from log + plan targets)
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) {
          pulse.stop();
          setCoachLoading(false);
          setCoachNoteDisplay(null);
          return;
        }

        const { data: log } = await supabase
          .from('workout_logs')
          .select('sets_json')
          .eq('user_id', userId)
          .eq('plan_id', planId)
          .eq('week_number', weekNumber)
          .eq('day_number', dayNumber)
          .order('logged_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const sets = (log?.sets_json ?? []) as Array<{ rpe?: number }>;
        const rpeValues = sets
          .map((s) => Number(s.rpe ?? 0))
          .filter((r) => r > 0);
        const avgRpe =
          rpeValues.length > 0
            ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length
            : 0;

        const { data: planRow } = await supabase
          .from('plans')
          .select('plan_json')
          .eq('id', planId)
          .maybeSingle();

        // Fetch last 4 sessions' HR for trend context
        const { data: priorHRLogs } = await supabase
          .from('workout_logs')
          .select('hr_avg, hr_peak, week_number, day_number, logged_at')
          .eq('user_id', userId)
          .eq('plan_id', planId)
          .not('hr_avg', 'is', null)
          .order('logged_at', { ascending: false })
          .limit(5);

        // Exclude the just-completed session (it's already in
        // workout_logs by the time this screen loads)
        const priorHRAvgsExcludingCurrent = (priorHRLogs ?? [])
          .filter(
            (r: { week_number?: number; day_number?: number }) =>
              !(r.week_number === weekNumber && r.day_number === dayNumber),
          )
          .map((r: { hr_avg?: number | null }) => r.hr_avg)
          .filter((v): v is number => v != null)
          .slice(0, 2);

        const hrTrend = (() => {
          if (priorHRAvgsExcludingCurrent.length < 2 || sessionAvgHR === null) return null;
          const recentAvg = Math.round(
            priorHRAvgsExcludingCurrent.reduce((a, b) => a + b, 0) /
              priorHRAvgsExcludingCurrent.length,
          );
          const delta = sessionAvgHR - recentAvg;
          if (Math.abs(delta) < 5) return null; // not meaningful
          return {
            delta,
            direction: (delta < 0 ? 'down' : 'up') as 'up' | 'down',
            recentAvg,
          };
        })();

        setHrTrendDisplay(hrTrend);

        type PlanWeek = { weekNumber?: number; days?: PlanDay[] };
        type PlanDay = { dayNumber?: number; exercises?: Array<{ targetRpe?: number }> };
        const weeks = (planRow?.plan_json as { weeks?: PlanWeek[] } | undefined)?.weeks ?? [];
        const weekData = weeks.find((w) => w.weekNumber === weekNumber);
        const dayData = (weekData?.days ?? []).find((d) => d.dayNumber === dayNumber);
        const exercises = dayData?.exercises ?? [];
        const targetRpeValues = exercises
          .map((e) => Number(e.targetRpe ?? 0))
          .filter((r) => r > 0);
        const avgTargetRpe =
          targetRpeValues.length > 0
            ? targetRpeValues.reduce((a, b) => a + b, 0) / targetRpeValues.length
            : 7;

        const { data } = await supabase.functions.invoke('coaching-feedback', {
          body: {
            exerciseName: 'session_summary',
            targetReps: totalExercises,
            targetWeight: 0,
            targetRpe: Math.round(avgTargetRpe * 10) / 10,
            loggedReps: totalSets,
            loggedWeight: 0,
            loggedRpe: avgRpe > 0 ? Math.round(avgRpe * 10) / 10 : 0,
            weekNumber,
            heartRateAvgBpm: sessionAvgHR ?? null,
            heartRatePeakBpm: sessionPeakHR ?? null,
            hrTrend: hrTrend ?? null,
            avgRecoveryDelta: avgRecoveryDelta ?? null,
            sessionContext: {
              totalSets,
              totalExercises,
              weekNumber,
              dayNumber,
              rpeRecorded: avgRpe > 0,
            },
          },
        });

        const payload = data as {
          feedback?: string | null;
          message?: string | null;
          note?: string | null;
          coaching_note?: string | null;
        } | null | undefined;

        const coachingNote =
          payload?.message ??
          payload?.note ??
          payload?.coaching_note ??
          payload?.feedback ??
          null;
        const coachingNoteTrimmed =
          coachingNote != null && String(coachingNote).trim() !== ''
            ? String(coachingNote).trim()
            : null;

        pulse.stop();
        setCoachLoading(false);
        setCoachNoteDisplay(coachingNoteTrimmed ?? null);

        if (coachingNoteTrimmed) {
          setPendingJordanNote(coachingNoteTrimmed);
        }
        if (coachingNoteTrimmed && planId) {
          const { data: currentPlan } = await supabase
            .from('plans')
            .select('plan_json')
            .eq('id', planId)
            .maybeSingle();

          if (
            currentPlan?.plan_json != null &&
            typeof currentPlan.plan_json === 'object' &&
            !Array.isArray(currentPlan.plan_json)
          ) {
            const updatedPlanJson = {
              ...(currentPlan.plan_json as Record<string, unknown>),
              latestJordanNote: coachingNoteTrimmed,
              latestJordanNoteUpdatedAt: new Date().toISOString(),
            };

            console.log('[JORDAN NOTE WRITE]', {
              coachingNote,
              planId,
              hasCurrentPlan: !!currentPlan,
            });

            const { error: writeError } = await supabase
              .from('plans')
              .update({ plan_json: updatedPlanJson })
              .eq('id', planId);

            console.log('[JORDAN NOTE WRITE RESULT]', {
              error: writeError?.message ?? null,
              success: !writeError,
            });
          }
        }
      } catch {
        pulse.stop();
        setCoachLoading(false);
        setCoachNoteDisplay(null);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showShareIcon = sharingAvailable && Platform.OS !== 'web';

  return (
    <View style={styles.container}>
      {showShareIcon ? (
        <TouchableOpacity
          onPress={() => void handleShareWorkout()}
          style={[styles.shareIconBtn, { top: insets.top + 8 }]}
          activeOpacity={0.7}
          disabled={shareLoading}
        >
          {shareLoading ? (
            <ActivityIndicator color={Colors.accent} size="small" />
          ) : (
            <Ionicons name="share-outline" size={24} color={Colors.accent} />
          )}
        </TouchableOpacity>
      ) : null}

      {shareCardVisible && shareCardData ? (
        <View style={styles.offScreenCapture} pointerEvents="none">
          <ShareCard ref={shareCardRef} {...shareCardData} />
        </View>
      ) : null}

      {topPr ? (
        <View style={styles.offscreen} pointerEvents="none">
          <PRShareCard
            cardRef={prCardRef}
            exerciseName={topPr.exerciseName}
            estimated1RM={topPr.estimated1RM}
            bestWeightLbs={topPr.weightLbs}
            bestReps={topPr.reps}
            isMetric={isMetric}
            isEstimated={topPr.isEstimated}
            rank={1}
          />
        </View>
      ) : null}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <Animated.View
            style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}
          >
            <Ionicons name="checkmark" size={36} color={Colors.textPrimary} />
          </Animated.View>
          <Text style={styles.heroTitle}>Workout complete</Text>
          <Text style={styles.heroSubtitle}>
            Week {weekNumber} · Day {dayNumber}
          </Text>
        </View>

        <View style={styles.statsGrid}>
          {STATIC_TILE_META.map((tile, i) => {
            const isRecordsTile = tile.key === 'records';
            const label = isRecordsTile ? recordsDisplay.label : tile.label;
            const value = statTileValues[tile.key];
            const isPrCard = isRecordsTile && recordsDisplay.isPr;
            return (
              <Animated.View
                key={tile.key}
                style={[
                  styles.statCard,
                  isPrCard && styles.statCardPr,
                  { opacity: cardOpacities[i] },
                ]}
              >
                {statTileIcon(tile.key)}
                <Text
                  style={[styles.statValue, isPrCard && styles.statValuePr]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {value}
                </Text>
                <Text style={styles.statLabel}>{label}</Text>
              </Animated.View>
            );
          })}
        </View>

        {flaggedSetCount > 0 ? (
          <Text style={styles.flaggedSetsNote}>
            {flaggedSetCount} set{flaggedSetCount === 1 ? '' : 's'} flagged as unusual — review in workout results
          </Text>
        ) : null}

        {avgRecoveryDelta !== null ? (() => {
          const quality = getRecoveryQuality(avgRecoveryDelta);
          if (!quality) return null;
          const recoveryNote =
            avgRecoveryDelta >= 50
              ? 'Your HR recovered well between sets. Cardiovascular fitness is keeping up with your training load.'
              : avgRecoveryDelta >= 25
                ? 'HR recovery between sets was adequate. Standard rest periods are working.'
                : 'HR recovery between sets was slow. Consider extending rest periods next session.';
          return (
            <View style={styles.recoveryBanner}>
              <View style={styles.recoveryBannerRow}>
                <Ionicons name="pulse-outline" size={18} color={quality.color} />
                <Text style={styles.recoveryBannerLabel}>HR RECOVERY</Text>
                <View style={[styles.recoveryBannerBadge, { backgroundColor: quality.color + '22' }]}>
                  <Text style={[styles.recoveryBannerBadgeText, { color: quality.color }]}>
                    {quality.label}
                  </Text>
                </View>
              </View>
              <Text style={styles.recoveryBannerNote}>{recoveryNote}</Text>
            </View>
          );
        })() : null}

        {hrTrendDisplay !== null ? (
          <View style={styles.hrTrendBanner}>
            <View style={styles.hrTrendBannerRow}>
              <Ionicons
                name={hrTrendDisplay.direction === 'down' ? 'trending-down' : 'trending-up'}
                size={18}
                color={hrTrendDisplay.direction === 'down' ? Colors.success : Colors.warning}
              />
              <Text style={styles.hrTrendBannerLabel}>HR TREND</Text>
              <View
                style={[
                  styles.hrTrendBannerBadge,
                  {
                    backgroundColor:
                      (hrTrendDisplay.direction === 'down' ? Colors.success : Colors.warning) + '22',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.hrTrendBannerBadgeText,
                    { color: hrTrendDisplay.direction === 'down' ? Colors.success : Colors.warning },
                  ]}
                >
                  {hrTrendDisplay.direction === 'down' ? 'Improving' : 'Elevated'}
                </Text>
              </View>
            </View>
            <Text style={styles.hrTrendBannerNote}>
              {hrTrendDisplay.direction === 'down'
                ? 'Your heart rate is running lower than recent sessions. That is a sign of improving cardiovascular fitness.'
                : 'Your heart rate is running higher than recent sessions. Worth keeping an eye on recovery.'}
            </Text>
          </View>
        ) : null}

        {showSummaryBanner && (
          <View style={styles.summaryBanner}>
            <View style={styles.summaryBannerTitleRow}>
              <Ionicons name="star-outline" size={24} color={Colors.accent} />
              <Text style={styles.summaryBannerTitle}>
                Week {weekNumber} Complete!
              </Text>
            </View>
            <Text style={styles.summaryBannerSubtitle}>
              Your weekly coach review is ready.
            </Text>
            {nextWeekReady ? (
              <Text style={styles.summaryBannerSubtitleSuccess}>
                Week {weekNumber + 1} is ready. Head to your Dashboard.
              </Text>
            ) : null}
            <TouchableOpacity
              style={styles.summaryBannerButton}
              activeOpacity={0.8}
              onPress={() => {
                navigation.reset({
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
                                  params: { planId, weekNumber },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                  ],
                });
              }}
            >
              <Text style={styles.summaryBannerButtonText}>
                View Weekly Summary
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {macroAdjustment ? (
          <View style={styles.macroCard}>
            <View style={styles.macroCardTitleRow}>
              <Ionicons name="bar-chart-outline" size={20} color={Colors.accent} />
              <Text style={styles.macroCardTitle}>Macros Updated</Text>
            </View>
            <Text style={styles.macroCardBody}>{stripEmDash(macroAdjustment ?? '')}</Text>
          </View>
        ) : null}

        <View style={styles.recoveryCard}>
          <Text style={styles.recoverySectionLabel}>RECOVERY STATUS</Text>
          <View style={styles.fatigueRow}>
            <View style={[styles.ratingDot, { backgroundColor: fatigue.color }]} />
            <Text style={styles.fatigueLabel}>{fatigue.label}</Text>
          </View>
          <Text style={styles.fatigueTip}>{fatigue.tip}</Text>
        </View>

        {(coachLoading || coachNoteDisplay) && (
          <View style={styles.coachCard}>
            <View style={styles.coachHeader}>
              <Text style={styles.coachBrand}>JORDAN</Text>
            </View>
            {coachLoading ? (
              <View>
                <Animated.View
                  style={[
                    styles.coachSkeletonLine,
                    { opacity: skeletonOpacity },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.coachSkeletonLineShort,
                    { opacity: skeletonOpacity },
                  ]}
                />
              </View>
            ) : (
              <Text style={styles.coachNote}>{stripEmDash(coachNoteDisplay ?? '')}</Text>
            )}
          </View>
        )}

        <View style={styles.footerSpacer} />
      </ScrollView>

      {/* ── Section 5: Fixed action buttons ── */}
      <View style={styles.footer}>
        {!weekCompletionChecked ? (
          <View style={styles.generatingState}>
            <ActivityIndicator color={Colors.accent} size="small" />
            <Text style={styles.generatingText}>One moment…</Text>
          </View>
        ) : isWeekComplete ? (
          <View style={{ gap: Spacing.sm }}>
            {summaryLoading ? (
              <View style={styles.summaryLoadingRow}>
                <ActivityIndicator size="small" color={Colors.accent} />
                <Text style={styles.summaryLoadingText}>
                  Jordan is reviewing your week…
                </Text>
              </View>
            ) : !showSummaryBanner ? (
              <View style={styles.weekCompleteNotice}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color={Colors.success}
                />
                <Text style={styles.weekCompleteNoticeText}>
                  Week {weekNumber} complete. Generate Week {weekNumber + 1} from
                  your dashboard when you're ready.
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.8}
              onPress={() =>
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Dashboard' }],
                })
              }
            >
              <Text style={styles.primaryButtonText}>Back to Dashboard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              activeOpacity={0.8}
              onPress={() =>
                (navigation as any).navigate('Dashboard', {
                  screen: 'WorkoutTab',
                  params: {
                    screen: 'PlanView',
                    params: { planId, weekNumber },
                  },
                })
              }
            >
              <Text style={styles.secondaryButtonText}>View Full Plan</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: Spacing.sm }}>
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.8}
              onPress={() =>
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Dashboard' }],
                })
              }
            >
              <Text style={styles.primaryButtonText}>
                Back to Dashboard
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, { marginTop: 10 }]}
              activeOpacity={0.8}
              onPress={() =>
                (navigation as any).navigate('Dashboard', {
                  screen: 'WorkoutTab',
                  params: {
                    screen: 'PlanView',
                    params: { planId, weekNumber },
                  },
                })
              }
            >
              <Text style={styles.secondaryButtonText}>
                View Full Plan
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  scrollView: {
    backgroundColor: Colors.bgPrimary,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 72,
    paddingBottom: 160,
  },

  heroSection: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  checkmark: {
    fontSize: 38,
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
  },
  heroTitle: {
    fontSize: FontSizes.display,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  flaggedSetsNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
    marginTop: -Spacing.sm,
  },
  statCard: {
    width: '47%',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  statCardPr: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
  },
  statValue: {
    fontSize: FontSizes.display,
    fontFamily: Fonts.monoMedium,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  statValuePr: {
    color: Colors.accent,
  },
  statLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },

  recoveryBanner: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  recoveryBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  recoveryBannerLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    flex: 1,
  },
  recoveryBannerBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  recoveryBannerBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
  },
  recoveryBannerNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  hrTrendBanner: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  hrTrendBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  hrTrendBannerLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    flex: 1,
  },
  hrTrendBannerBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  hrTrendBannerBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
  },
  hrTrendBannerNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },

  recoveryCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  recoverySectionLabel: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  fatigueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  ratingDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 8,
  },
  fatigueLabel: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  fatigueTip: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  coachCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  coachBrand: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    letterSpacing: 1.5,
  },
  coachNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  coachSkeletonLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.bgElevated,
    width: '90%',
    alignSelf: 'flex-start',
  },
  coachSkeletonLineShort: {
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.bgElevated,
    width: '70%',
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
  },

  footerSpacer: {
    height: 120,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.bgPrimary,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    gap: Spacing.sm,
  },
  adaptationReadyRow: {
    marginBottom: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  adaptationReadyText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
    textAlign: 'center',
  },
  primaryButton: {
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  summaryLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  summaryLoadingText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    flex: 1,
  },
  weekCompleteNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.xs,
  },
  weekCompleteNoticeText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  generatingState: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
    minHeight: 56,
    justifyContent: 'center',
  },
  generatingText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: Colors.accent,
    height: 56,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  retryButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  primaryButtonText: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
  },
  secondaryButton: {
    height: 52,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold,
    color: Colors.accent,
  },
  secondaryButtonDisabled: {
    opacity: 0.4,
  },
  shareIconBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    padding: 8,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  offScreenCapture: {
    position: 'absolute',
    left: -10000,
    top: 0,
    opacity: 0,
  },
  offscreen: {
    position: 'absolute',
    top: -1000,
    left: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  summaryBanner: {
    marginBottom: Spacing.lg,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  summaryBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  summaryBannerEmoji: {
    fontFamily: Fonts.regular,
    fontSize: 20,
  },
  summaryBannerTitle: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    flex: 1,
  },
  summaryBannerSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  summaryBannerSubtitleSuccess: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.success,
    marginTop: 6,
  },
  summaryBannerButton: {
    marginTop: 14,
    height: 46,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBannerButtonText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },

  macroCard: {
    marginBottom: Spacing.lg,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  macroCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  macroCardEmoji: {
    fontFamily: Fonts.regular,
    fontSize: 20,
  },
  macroCardTitle: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    flex: 1,
  },
  macroCardBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginTop: Spacing.sm,
  },
});

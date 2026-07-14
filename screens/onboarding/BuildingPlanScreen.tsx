import { useEffect, useRef, useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Purchases, { PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList, SubscriptionPlanId } from '../../navigation/types';
import { BETA_BYPASS } from '../../constants/betaBypass';
import { scheduleReEngagementPush } from '../../utils/notifications';
import { supabase } from '../../Lib/supabase';
import { Colors, Fonts, FontSizes, LineHeights, Spacing, Radius } from '../../constants/design';
import { useAuth } from '../../contexts/AuthContext';
import BetaFeedbackModal from '../../components/BetaFeedbackModal';
import { JordanAvatar } from '../../components/JordanAvatar';
import EdgeBar from '../../components/EdgeBar';
import { stripEmDash } from '../../utils/jordanText';
import {
  computeFirstSessionDate,
  formatDisplayDate,
  getLocalDate,
  getLocalDateString,
  getNextScheduledDay,
  isTodayScheduled,
  normalizeScheduledDays,
} from '../../utils/dateUtils';
import { getDeviceId, getDeviceFingerprint } from '../../utils/device';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'BuildingPlan'>;
type RouteType = RouteProp<RootStackParamList, 'BuildingPlan'>;

type LoadingStep = {
  id: string;
  label: string;
  message: string;
  duration: number;
};

const ONBOARDING_SELECTED_PLAN_KEY = 'hone_onboarding_selected_plan';

const LOADING_STEPS: LoadingStep[] = [
  {
    id: 'goals',
    label: 'Goals analyzed',
    message: 'Analyzing your goals...',
    duration: 2000,
  },
  {
    id: 'structure',
    label: 'Split built',
    message: 'Building your training split...',
    duration: 2500,
  },
  {
    id: 'weights',
    label: 'Week 1 calibrated',
    message: 'Calibrating Week 1 weights...',
    duration: 2500,
  },
  {
    id: 'coaching',
    label: 'Coaching notes written',
    message: "Writing Jordan's coaching notes...",
    duration: 2500,
  },
  {
    id: 'ready',
    label: 'Plan ready',
    message: 'Your plan is ready.',
    duration: 1000,
  },
];

// ── Goal projection (fire-and-forget after plan save) ──

async function saveGoalProjection(
  goalId: string,
  goal: string,
  planDuration: number,
  p: {
    current1RM?: string;
    target1RM?: string;
    targetLift?: string;
    startingWeightLbs?: string;
    targetWeightLbs?: string;
  },
) {
  try {
    const current1rm = p.current1RM ? parseFloat(p.current1RM) : 0;
    const target1rm  = p.target1RM  ? parseFloat(p.target1RM)  : 0;
    const startWeight = p.startingWeightLbs ? parseFloat(p.startingWeightLbs) : 0;
    const targetWeight = p.targetWeightLbs   ? parseFloat(p.targetWeightLbs)  : startWeight - 10;
    const lift = p.targetLift ?? '';

    let projectionText = '';
    const projectionMetrics: Record<string, number | string> = {
      expectedWeeklyVolumeIncreasePct: 5,
      expectedConsistencyTarget: 0.8,
      planDurationWeeks: planDuration,
      goalType: goal,
    };

    if (goal === 'strength') {
      const gainLow  = Math.round((target1rm - current1rm) * 0.7);
      const gainHigh = Math.round(target1rm - current1rm);
      projectionText =
        `Based on your current ${current1rm}lb ${lift}, a ${planDuration}-week program ` +
        `targeting progressive overload should add ${gainLow}–${gainHigh}lbs to your 1RM.`;
      projectionMetrics.expectedStrengthGainLbs = target1rm - current1rm;
    } else if (goal === 'hypertrophy') {
      projectionText =
        `Over ${planDuration} weeks of consistent training, you can expect visible muscle ` +
        `development, improved definition, and strength increases of 10–20% on key lifts.`;
    } else if (goal === 'fat_loss') {
      const lossLow  = Math.round((startWeight - targetWeight) * 0.7);
      const lossHigh = startWeight - targetWeight;
      projectionText =
        `A ${planDuration}-week caloric deficit program targeting ${lossLow}–${lossHigh}lbs ` +
        `of total weight loss at a sustainable pace.`;
      projectionMetrics.expectedWeightLossLbs = startWeight - targetWeight;
    } else if (goal === 'recomp') {
      projectionText =
        `Over ${planDuration} weeks, expect gradual fat loss and muscle gain simultaneously. ` +
        `Progress is slower than dedicated bulk/cut phases but changes in body composition ` +
        `will be noticeable by week 6–8.`;
    } else {
      projectionText =
        `A ${planDuration}-week program to build consistent training habits, improve ` +
        `cardiovascular fitness, and develop a foundation of strength across all major muscle groups.`;
    }

    await supabase
      .from('goals')
      .update({ projection_text: projectionText, projection_metrics: projectionMetrics })
      .eq('id', goalId);
  } catch (err) {
    console.error('saveGoalProjection failed:', err);
  }
}

const parseDuration = (sessionLength: string): number => {
  if (sessionLength === '30-45') return 37;
  if (sessionLength === '45-60') return 52;
  if (sessionLength === '60-90') return 75;
  if (sessionLength === '90+') return 90;
  return 60;
};

/** Match chip ids (8w) and numeric strings; align with GoalDetails + generate-plan */
function resolvePlanWeeksFromParams(params: RouteType['params']): number {
  const rec = params.recommendedWeeks;
  if (typeof rec === 'number' && Number.isFinite(rec) && rec >= 1 && rec <= 104) {
    return Math.round(rec);
  }
  const chip =
    params.planDuration ?? (params as { weeks?: string }).weeks ?? (params as { totalWeeks?: string }).totalWeeks;
  if (chip != null && String(chip).trim() !== '') {
    const n = parseInt(String(chip), 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 104) return n;
  }
  const td = params.targetDate;
  if (td && typeof td === 'string') {
    const map: Record<string, number> = {
      '4w': 4,
      '8w': 8,
      '12w': 12,
      '16w': 16,
      '24w': 24,
    };
    const w = map[td];
    if (typeof w === 'number') return w;
  }
  return 12;
}

function computeTargetDate(planDurationParam: string | number | undefined): string {
  const raw = String(planDurationParam ?? '12');
  const weeks = parseInt(raw.replace(/\D/g, ''), 10) || 12;
  const date = getLocalDate();
  date.setDate(date.getDate() + weeks * 7);
  return getLocalDateString(date);
}

type RetryPlanContext = {
  userId: string;
  goalData: { id: string };
  generatePlanBody: Record<string, unknown>;
  planWeeksResolved: number;
};

function isGeneratePlanOverloaded(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { error?: string }).error === 'overloaded'
  );
}

type GeneratedPlanJson = {
  title?: string;
  totalWeeks?: number;
  jordanWelcome?: string | null;
  scheduledDays?: string[];
  startDate?: string;
  weeks?: { days?: { type?: string; dayNumber?: number; title?: string }[] }[];
};

type GeneratePlanFnData = {
  plan?: GeneratedPlanJson;
  status?: string;
  reason?: string;
  message?: string;
  error?: string;
};

function getGeneratePlanBlockMessage(data: GeneratePlanFnData | null): string | null {
  if (!data?.status) return null;
  if (data.status === 'rate_limited') {
    return "You've already generated a plan recently. Subscribe to Hone Pro to create unlimited plans.";
  }
  if (data.status === 'generation_limit_reached') {
    return 'Subscribe to Hone Pro to start a new plan.';
  }
  return data.message ?? null;
}

const cleanJordanMessage = (msg: string | null): string | null => {
  if (!msg) return null;
  return msg
    .replace(/^I'm Jordan[^.]*\.\s*/i, '')
    .replace(/^[^.]*hardest[^.]*\.\s*/i, '')
    .replace(/^[^.]*difficult[^.]*\.\s*/i, '')
    .replace(/^[^.]*toughest[^.]*\.\s*/i, '')
    .replace(/^[^.]*challenging[^.]*\.\s*/i, '')
    .replace(/[^.]*begins (in )?week 2[^.]*\.\s*/gi, '')
    .replace(/[^.]*starts (in )?week 2[^.]*\.\s*/gi, '')
    .replace(/[^.]*your (workouts?|training|schedule) (will )?(begin|start)[^.]*\.\s*/gi, '')
    .trim() || msg;
};

export default function BuildingPlanScreen() {
  const navigation = useNavigation<NavProp>();
  const { refreshPlans } = useAuth();
  const route = useRoute<RouteType>();
  const params = route.params;
  const startTime = useRef(Date.now()).current;

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [apiDone, setApiDone] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const [sequenceEpoch, setSequenceEpoch] = useState(0);
  const [planReady, setPlanReady] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [jordanMessage, setJordanMessage] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [firstSessionDisplayLine, setFirstSessionDisplayLine] = useState<string>('');
  const [firstSessionDateISO, setFirstSessionDateISO] = useState<string>('');
  const [savingStartDate, setSavingStartDate] = useState(false);
  const [weekNumber] = useState(1);
  const [firstDayNumber, setFirstDayNumber] = useState<number>(1);
  const [firstWorkoutTitle, setFirstWorkoutTitle] = useState<string>('Workout');
  const [errorState, setErrorState] = useState<{
    message: string;
    canRetry: boolean;
    showSubscribe?: boolean;
  } | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedStartDate, setSelectedStartDate] = useState<string | null>(null);
  const [todayDateStr, setTodayDateStr] = useState('');
  const [tomorrowDateStr, setTomorrowDateStr] = useState('');
  const [todayIsScheduled, setTodayIsScheduled] = useState(false);
  const [todayDayNumber, setTodayDayNumber] = useState<number | null>(null);
  const [todayDayTitle, setTodayDayTitle] = useState<string | null>(null);
  const [todayIsDay1, setTodayIsDay1] = useState(false);

  const replacePlanId = params.replacePlanId;
  const selectedPlan: SubscriptionPlanId = params.selectedPlan ?? 'annual';
  const [displaySubtitle, setDisplaySubtitle] = useState(LOADING_STEPS[0].message);

  const stopSequenceRef = useRef(false);
  const stepTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const retryContextRef = useRef<RetryPlanContext | null>(null);
  const hasGeneratedRef = useRef(false);
  const hasAdvancedFromSuccessRef = useRef(false);

  const avatarPulseOpacity = useRef(new Animated.Value(1)).current;
  const subtitleOpacity = useRef(new Animated.Value(1)).current;
  const rowOpacities = useRef(
    LOADING_STEPS.map(() => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(avatarPulseOpacity, {
          toValue: 0.7,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(avatarPulseOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [avatarPulseOpacity]);

  const clearStepTimers = () => {
    stepTimersRef.current.forEach(clearTimeout);
    stepTimersRef.current = [];
  };

  const stopLoadingSequence = () => {
    stopSequenceRef.current = true;
    clearStepTimers();
  };

  // Keep screen awake during generation — deactivated on success or error
  useEffect(() => {
    void activateKeepAwakeAsync();
    return () => {
      deactivateKeepAwake();
    };
  }, []);

  useEffect(() => {
    stopSequenceRef.current = false;
    clearStepTimers();
    let stepIndex = 0;

    const advance = () => {
      if (stopSequenceRef.current) return;
      if (stepIndex < LOADING_STEPS.length - 1) {
        setCompletedSteps((prev) => [...prev, LOADING_STEPS[stepIndex].id]);
        stepIndex += 1;
        setCurrentStepIndex(stepIndex);
        const t = setTimeout(advance, LOADING_STEPS[stepIndex].duration);
        stepTimersRef.current.push(t);
      } else {
        setCompletedSteps((prev) => [...prev, LOADING_STEPS[stepIndex].id]);
        setAnimDone(true);
      }
    };

    const t0 = setTimeout(advance, LOADING_STEPS[0].duration);
    stepTimersRef.current.push(t0);

    return () => {
      clearStepTimers();
    };
  }, [sequenceEpoch]);

  useEffect(() => {
    LOADING_STEPS.forEach((_, i) => {
      rowOpacities[i].setValue(0);
    });
  }, [sequenceEpoch, rowOpacities]);

  useEffect(() => {
    Animated.timing(rowOpacities[currentStepIndex], {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [currentStepIndex, sequenceEpoch, rowOpacities]);

  const progressFraction = completedSteps.length / LOADING_STEPS.length;

  const prevStepForSubtitleRef = useRef(0);
  useEffect(() => {
    if (errorState) return;
    if (prevStepForSubtitleRef.current === currentStepIndex) return;
    const nextText = LOADING_STEPS[currentStepIndex].message;
    prevStepForSubtitleRef.current = currentStepIndex;
    Animated.timing(subtitleOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setDisplaySubtitle(nextText);
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }, [currentStepIndex, errorState, subtitleOpacity]);

  useEffect(() => {
    if (apiDone && animDone && !errorState) {
      setPlanReady(true);
    }
  }, [apiDone, animDone, errorState]);

  const goToDashboard = useCallback(() => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Dashboard' }],
    });
  }, [navigation]);

  const attemptPurchaseAndFinish = useCallback(async () => {
    const startDateToSave = selectedStartDate ?? firstSessionDateISO;

    console.log('[StartDate] saving:', {
      selectedStartDate,
      firstSessionDateISO,
      startDateToSave,
      planId,
    });

    if (startDateToSave) {
      const resolvedId = planId ?? (await resolveActivePlanId());
      if (resolvedId) {
        try {
          const { error } = await supabase
            .from('plans')
            .update({ start_date: startDateToSave })
            .eq('id', resolvedId);
          if (error) {
            console.error('[StartDate] UPDATE failed:', error);
          } else {
            console.log('[StartDate] saved successfully:', startDateToSave);
          }
        } catch (e) {
          console.error('[StartDate] save threw:', e);
        }
      } else {
        console.error('[StartDate] No planId resolved — start_date not saved');
      }
    }

    await AsyncStorage.setItem(ONBOARDING_SELECTED_PLAN_KEY, selectedPlan);

    if (BETA_BYPASS || Platform.OS === 'web') {
      scheduleReEngagementPush();
      goToDashboard();
      return;
    }

    try {
      const offerings = await Purchases.getOfferings();
      const offering = offerings.current;
      if (offering) {
        const quarterlyPkg =
          offering.threeMonth ??
          offering.availablePackages.find(
            (p) => p.identifier === '$rc_quarterly',
          );
        const packageToPurchase =
          selectedPlan === 'annual'
            ? offering.annual
            : selectedPlan === 'quarterly'
              ? quarterlyPkg
              : offering.monthly;

        if (packageToPurchase) {
          await Purchases.purchasePackage(packageToPurchase);
        }
      }
    } catch (error) {
      const purchaseError = error as { userCancelled?: boolean; code?: string };
      if (
        purchaseError.code !== PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR &&
        !purchaseError.userCancelled
      ) {
        console.error('[purchase]', error);
      }
    }

    scheduleReEngagementPush();
    goToDashboard();
  }, [selectedStartDate, firstSessionDateISO, planId, selectedPlan, goToDashboard]);

  const handleSuccessCTA = useCallback(async () => {
    if (hasAdvancedFromSuccessRef.current) return;
    hasAdvancedFromSuccessRef.current = true;
    await attemptPurchaseAndFinish();
  }, [attemptPurchaseAndFinish]);

  useEffect(() => {
    if (!planReady || errorState) return;
    if (replacePlanId) return;

    const scheduledDays = normalizeScheduledDays(params.trainingDays ?? []);
    const todayStr = getLocalDateString();
    const tomorrow = getLocalDate();
    tomorrow.setDate(tomorrow.getDate() + 1);
    // "Start fresh" always anchors to Day 1 of the split
    // (scheduledDays[0]), not just the next scheduled day.
    // e.g. Mon-Sat schedule created Friday → next Monday,
    // not Saturday (which would be Day 6 of the split).
    const normalizedForTomorrow = normalizeScheduledDays(
      scheduledDays,
    );
    const day1Label =
      normalizedForTomorrow.length > 0
        ? normalizedForTomorrow[0]
        : null;
    const tomorrowStr = (() => {
      if (!day1Label) {
        return getNextScheduledDay(scheduledDays, tomorrow);
      }
      // Find next occurrence of Day 1 label from tomorrow
      const dayNames = [
        'Sun','Mon','Tue','Wed','Thu','Fri','Sat',
      ];
      for (let i = 0; i < 7; i++) {
        const candidate = getLocalDate();
        candidate.setDate(candidate.getDate() + 1 + i);
        if (dayNames[candidate.getDay()] === day1Label) {
          return getLocalDateString(candidate);
        }
      }
      return getNextScheduledDay(scheduledDays, tomorrow);
    })();
    const todayScheduled = isTodayScheduled(scheduledDays);

    setTodayDateStr(todayStr);
    setTomorrowDateStr(tomorrowStr);
    setTodayIsScheduled(todayScheduled);

    // Compute which day of the split today maps to
    if (todayScheduled) {
      const scheduledNormalized = normalizeScheduledDays(scheduledDays);
      const todayLabel = (() => {
        const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        return names[new Date().getDay()];
      })();
      const idx = scheduledNormalized.indexOf(todayLabel);
      if (idx >= 0) {
        setTodayDayNumber(idx + 1);
        const ordinals = ['first','second','third','fourth','fifth','sixth','seventh'];
        setTodayDayTitle(ordinals[idx] ?? `Day ${idx + 1}`);
      }
    }

    const scheduledNormalized = normalizeScheduledDays(scheduledDays);
    const todayLabel = (() => {
      const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      return names[new Date().getDay()];
    })();
    const isFirstScheduledDay =
      scheduledNormalized.length > 0 &&
      scheduledNormalized[0] === todayLabel;

    setTodayIsDay1(todayScheduled && isFirstScheduledDay);

    // If today IS Day 1 of the split, skip the picker and default to today.
    // Both options would be Day 1 (this week vs next week) — redundant.
    setSelectedStartDate(
      todayScheduled && isFirstScheduledDay ? todayStr : tomorrowStr,
    );
    stopLoadingSequence();
    setShowSuccess(true);
  }, [planReady, errorState, replacePlanId, params.trainingDays]);

  // --- Generate plan, save to Supabase, then navigate ---
  useEffect(() => {
    if (hasGeneratedRef.current) return;
    hasGeneratedRef.current = true;
    generateAndSavePlan(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateAfterDelay = (minMs: number) => {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, minMs - elapsed);
    setTimeout(() => navigation.navigate('Dashboard'), remaining);
  };

  const resolveActivePlanId = async (): Promise<string | null> => {
    // Prefer the planId already stored in state; if missing, fetch from DB.
    if (planId) return planId;
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return null;
    const { data: plan } = await supabase
      .from('plans')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return plan?.id ?? null;
  };

  const handleBeginTraining = async () => {
    if (!firstSessionDateISO) return;
    setSavingStartDate(true);
    try {
      const resolvedPlanId = await resolveActivePlanId();
      if (!resolvedPlanId) {
        console.error('[StartDate] No active plan ID found');
      } else {
        const { error } = await supabase
          .from('plans')
          .update({ start_date: firstSessionDateISO })
          .eq('id', resolvedPlanId);
        if (error) console.error('[StartDate] UPDATE failed:', error);
        else console.log('[StartDate] start_date set:', firstSessionDateISO);
      }
    } catch (e) {
      console.error('[StartDate] handleBeginTraining threw:', e);
    }
    setSavingStartDate(false);
    scheduleReEngagementPush();
    navigation.reset({ index: 0, routes: [{ name: 'Dashboard' }] });
  };

  const generateAndSavePlan = async (isRetry: boolean) => {
    setErrorState(null);
    if (isRetry) {
      stopLoadingSequence();
      setShowSuccess(false);
      setSelectedStartDate(null);
      setTodayDateStr('');
      setTomorrowDateStr('');
      setTodayIsScheduled(false);
      hasAdvancedFromSuccessRef.current = false;
      setApiDone(false);
      setAnimDone(false);
      setPlanReady(false);
      setCompletedSteps([]);
      setCurrentStepIndex(0);
      setDisplaySubtitle(LOADING_STEPS[0].message);
      subtitleOpacity.setValue(1);
      prevStepForSubtitleRef.current = 0;
      setSequenceEpoch((e) => e + 1);
    }
    try {
      let userId: string;
      let goalData: { id: string };
      let generatePlanBody: Record<string, unknown>;
      let planWeeksResolved: number;

      const [deviceId, deviceFingerprint] = await Promise.all([
        getDeviceId(),
        getDeviceFingerprint(),
      ]);

      if (!isRetry && !replacePlanId) {
        let { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
          if (anonError) throw new Error('Could not create session: ' + anonError.message);
          session = anonData.session;
        }

        const uid = session?.user?.id;
        if (!uid) throw new Error('No user session after anonymous sign in');
        userId = uid;

        const sessionStructureForProfile = params.sessionStructure ?? [];
        const profileWorkoutDayCount = sessionStructureForProfile.filter(
          (d: { type: string }) => d.type === 'workout',
        ).length;
        const daysPerWeekForProfile =
          profileWorkoutDayCount > 0
            ? profileWorkoutDayCount
            : parseInt(String(params.daysPerWeek), 10);

        const p = params as typeof params & { biologicalSex?: string | null };
        const sexForProfile = p.sex ?? p.biologicalSex ?? null;

        console.log('[ONBOARDING SAVE]', {
          sex: p.sex ?? p.biologicalSex,
          userId,
        });

        await supabase.from('user_profiles').upsert({
          user_id: userId,
          ...(deviceId ? { device_id: deviceId } : {}),
          ...(deviceFingerprint ? { device_fingerprint: deviceFingerprint } : {}),
          training_age: params.experience,
          days_per_week: daysPerWeekForProfile,
          training_days: params.trainingDays ?? [],
          session_duration_mins: parseDuration(params.sessionLength),
          preferred_split: params.splitId,
          equipment: params.equipment,
          excluded_exercises: params.excludedExercises ?? [],
          injuries: params.injuries ?? [],
          weak_points: params.priorityMuscles ?? [],
          age: parseInt(params.age),
          sex: sexForProfile,
          height_ft: parseInt(params.heightFt),
          height_in: parseInt(params.heightIn),
          weight_lbs: parseFloat(params.weightLbs),
          body_fat_pct: params.bodyFatPct ? parseFloat(params.bodyFatPct) : null,
          enhanced_recovery: params.enhancedRecovery ?? false,
          concurrent_sport: params.concurrentSport ?? null,
        }, {
          onConflict: 'user_id',
          ignoreDuplicates: false,
        });

        planWeeksResolved = resolvePlanWeeksFromParams(params);

        const goalTargetWeightLbs = (() => {
          const raw =
            params.goalTargetWeight?.trim() ||
            params.targetWeightLbs?.trim() ||
            '';
          if (!raw) return null;
          const n = parseFloat(raw);
          return Number.isFinite(n) && n > 0 ? n : null;
        })();

        const { data: gData, error: goalError } = await supabase
          .from('goals')
          .insert({
            user_id: userId,
            goal_type: params.goal,
            target_lift: params.targetLift ?? null,
            current_1rm: params.current1RM ? parseFloat(params.current1RM) : null,
            target_1rm: params.target1RM ? parseFloat(params.target1RM) : null,
            plan_duration_weeks: planWeeksResolved,
            recomp_focus: params.recompFocus ?? null,
            general_focus: params.generalFocus ?? null,
            starting_weight_lbs: params.startingWeightLbs
              ? parseFloat(params.startingWeightLbs)
              : null,
            target_weight_lbs: goalTargetWeightLbs,
            status: 'active',
            target_date: computeTargetDate(
              params.planDuration ?? params.recommendedWeeks ?? 12,
            ),
          })
          .select()
          .single();

        if (goalError) throw goalError;
        if (!gData?.id) throw new Error('Goal insert returned no id');
        goalData = { id: gData.id };

        await supabase.from('macro_plans').insert({
          user_id: userId,
          goal_id: goalData.id,
          calories_target: params.calories,
          protein_g: params.proteinG,
          carbs_g: params.carbsG,
          fats_g: params.fatsG,
          calorie_pace: params.caloriePace ?? 'balanced',
          target_weight_lbs: goalTargetWeightLbs,
        });

        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const { error: pauseError } = await supabase
            .from('plans')
            .update({ status: 'paused' })
            .eq('user_id', user.id)
            .eq('status', 'active');

          if (pauseError) {
            console.warn('[BuildingPlan] Could not pause existing plans:', pauseError);
          } else {
            console.log('[BuildingPlan] Existing active plans paused');
          }
        }

        const sessionStructure = params.sessionStructure ?? [];
        const structureWorkoutCount = sessionStructure.filter(
          (d: { type: string }) => d.type === 'workout',
        ).length;
        const daysPerWeekResolved =
          structureWorkoutCount > 0
            ? String(structureWorkoutCount)
            : params.daysPerWeek;

        console.log('[generate-plan body] daysPerWeek:', daysPerWeekResolved);
        console.log('[generate-plan body] trainingDays:', params.trainingDays);
        console.log('[generate-plan body] sessionStructure length:', structureWorkoutCount);
        console.log(
          '[generate-plan body] totalWeeks:',
          params.recommendedWeeks ?? params.planDuration ?? (params as { totalWeeks?: unknown }).totalWeeks ?? (params as { weeks?: unknown }).weeks,
          'targetDate:',
          params.targetDate,
          '=> resolved:',
          planWeeksResolved,
        );

        generatePlanBody = {
          ...params,
          goalTargetWeight: params.goalTargetWeight,
          targetWeightLbs: params.targetWeightLbs ?? params.goalTargetWeight,
          daysPerWeek: daysPerWeekResolved,
          totalWeeks: planWeeksResolved,
          recommendedWeeks: planWeeksResolved,
          scheduledDays: params.trainingDays ?? [],
          subMusclePreferences: params.subMusclePreferences ?? {},
          userId,
          deviceId,
          isPreview: false,
        };

        console.log(
          '[BuildingPlan] generate-plan request body:',
          JSON.stringify(generatePlanBody, null, 2),
        );

        retryContextRef.current = {
          userId,
          goalData,
          generatePlanBody,
          planWeeksResolved,
        };
      } else if (replacePlanId && params.goalId) {
        let { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
          if (anonError) throw new Error('Could not create session: ' + anonError.message);
          session = anonData.session;
        }
        const uid = session?.user?.id;
        if (!uid) throw new Error('No user session');
        userId = uid;

        planWeeksResolved = resolvePlanWeeksFromParams(params);
        goalData = { id: params.goalId };

        const sessionStructure = params.sessionStructure ?? [];
        const structureWorkoutCount = sessionStructure.filter(
          (d: { type: string }) => d.type === 'workout',
        ).length;
        const daysPerWeekResolved =
          structureWorkoutCount > 0
            ? String(structureWorkoutCount)
            : params.daysPerWeek;

        generatePlanBody = {
          ...params,
          goalTargetWeight: params.goalTargetWeight,
          targetWeightLbs: params.targetWeightLbs ?? params.goalTargetWeight,
          daysPerWeek: daysPerWeekResolved,
          totalWeeks: planWeeksResolved,
          recommendedWeeks: planWeeksResolved,
          scheduledDays: params.trainingDays ?? [],
          subMusclePreferences: params.subMusclePreferences ?? {},
          userId,
          deviceId,
          isPreview: false,
        };

        retryContextRef.current = {
          userId,
          goalData,
          generatePlanBody,
          planWeeksResolved,
        };
      } else {
        const ctx = retryContextRef.current;
        if (!ctx) throw new Error('Nothing to retry');
        userId = ctx.userId;
        goalData = ctx.goalData;
        generatePlanBody = ctx.generatePlanBody;
        planWeeksResolved = ctx.planWeeksResolved;
      }

      const { data: { session: currentSession } } = await supabase.auth.getSession();

      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'generate-plan',
        {
          body: generatePlanBody,
          headers: {
            Authorization: `Bearer ${currentSession?.access_token}`,
          },
        },
      );

      if (isGeneratePlanOverloaded(fnData)) {
        stopLoadingSequence();
        subtitleOpacity.setValue(1);
        setErrorState({
          message: 'Jordan is in high demand right now. Tap to try again.',
          canRetry: true,
        });
        return;
      }

      const fnPayload = fnData as GeneratePlanFnData | null;
      const blockMessage = getGeneratePlanBlockMessage(fnPayload);
      if (blockMessage) {
        stopLoadingSequence();
        subtitleOpacity.setValue(1);
        setErrorState({
          message: blockMessage,
          canRetry: false,
          showSubscribe: true,
        });
        return;
      }

      if (fnError) throw fnError;

      const planJson = fnPayload?.plan;
      if (!planJson) throw new Error('No plan returned from Edge Function');

      let savedPlan: { id: string; start_date?: string | null } | null = null;

      if (replacePlanId) {
        const { data: updated, error: planError } = await supabase
          .from('plans')
          .update({
            title: planJson.title,
            total_weeks: planJson.totalWeeks,
            plan_json: planJson,
            is_preview: false,
          })
          .eq('id', replacePlanId)
          .select('id, start_date')
          .maybeSingle();

        if (planError) throw planError;
        savedPlan = updated;
      } else {
        const { data: inserted, error: planError } = await supabase
          .from('plans')
          .insert({
            user_id: userId,
            goal_id: goalData.id,
            title: planJson.title,
            current_week: 1,
            total_weeks: planJson.totalWeeks,
            status: 'active',
            plan_json: planJson,
            is_preview: false,
          })
          .select('id, start_date')
          .maybeSingle();

        if (planError) throw planError;
        savedPlan = inserted;
      }

      if (!savedPlan?.id) {
        throw new Error('Plan save did not return a row');
      }

      const week1Days = planJson.weeks?.[0]?.days ?? [];
      const firstWorkout = week1Days.find((d: any) => d.type === 'workout');

      setPlanId(savedPlan.id);
      setJordanMessage(planJson.jordanWelcome ?? null);
      setFirstDayNumber(firstWorkout?.dayNumber ?? 1);
      setFirstWorkoutTitle(firstWorkout?.title ?? 'Workout');

      const scheduledFromPlan = Array.isArray(planJson.scheduledDays)
        ? (planJson.scheduledDays as string[])
        : (params.trainingDays ?? []);
      const firstSession = computeFirstSessionDate(scheduledFromPlan);
      if (firstSession) {
        setFirstSessionDateISO(firstSession.dateStr);
        setFirstSessionDisplayLine(firstSession.displayLine);
      } else {
        const fallback = computeFirstSessionDate(params.trainingDays ?? []);
        if (fallback) {
          setFirstSessionDateISO(fallback.dateStr);
          setFirstSessionDisplayLine(fallback.displayLine);
        }
      }

      saveGoalProjection(
        goalData.id,
        params.goal,
        planWeeksResolved,
        {
          current1RM:        params.current1RM,
          target1RM:         params.target1RM,
          targetLift:        params.targetLift,
          startingWeightLbs: params.startingWeightLbs,
          targetWeightLbs:   params.targetWeightLbs,
        },
      );

      await refreshPlans();
      setApiDone(true);
    } catch (error) {
      console.error('Plan generation failed:', error);
      if (retryContextRef.current) {
        stopLoadingSequence();
        subtitleOpacity.setValue(1);
        setErrorState({
          message: 'Something went wrong while building your plan. Tap to try again.',
          canRetry: true,
        });
      } else {
        navigateAfterDelay(1000);
      }
    }
  };

  const isWaitingForApi = animDone && !apiDone && !errorState;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {showSuccess && !replacePlanId ? (
        <View style={styles.successContainer}>
          <Ionicons
            name="checkmark-circle"
            size={72}
            color={Colors.success}
          />
          <Text style={styles.successTitle}>Your plan is ready.</Text>

          {todayIsScheduled && !todayIsDay1 ? (
            <>
              <Text style={styles.successSubtitle}>
                When do you want to start?
              </Text>
              <View style={styles.startDateRow}>
                <TouchableOpacity
                  style={[
                    styles.startDateCard,
                    selectedStartDate === todayDateStr &&
                      styles.startDateCardSelected,
                  ]}
                  onPress={() => setSelectedStartDate(todayDateStr)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.startDateLabel}>Start Today</Text>
                  <Text style={styles.startDateValue}>
                    {formatDisplayDate(todayDateStr)}
                  </Text>
                  {todayDayNumber !== null && todayDayNumber > 1 ? (
                    <Text style={styles.startDateHint}>
                      {`Picks up at Day ${todayDayNumber} of your split`}
                    </Text>
                  ) : null}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.startDateCard,
                    selectedStartDate === tomorrowDateStr &&
                      styles.startDateCardSelected,
                  ]}
                  onPress={() => setSelectedStartDate(tomorrowDateStr)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.startDateLabel}>
                    {(() => {
                      if (!tomorrowDateStr) return 'Start Tomorrow';
                      const d = new Date(`${tomorrowDateStr}T12:00:00`);
                      const days = ['Sunday','Monday','Tuesday','Wednesday',
                                    'Thursday','Friday','Saturday'];
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
                      return tomorrowDateStr === tomorrowKey
                        ? 'Start Tomorrow'
                        : `Start ${days[d.getDay()]}`;
                    })()}
                  </Text>
                  <Text style={styles.startDateValue}>
                    {formatDisplayDate(tomorrowDateStr)}
                  </Text>
                  <Text style={styles.startDateHint}>
                    Start fresh at Day 1 of your split
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <Text style={styles.successSubtitle}>
              First session: {formatDisplayDate(todayIsDay1 ? todayDateStr : tomorrowDateStr)}
            </Text>
          )}

          <TouchableOpacity
            style={styles.successCTA}
            activeOpacity={0.8}
            onPress={() => void handleSuccessCTA()}
          >
            <Text style={styles.successCTAText}>Go to Dashboard →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.topSection}>
            <Animated.View style={{ opacity: avatarPulseOpacity }}>
              <JordanAvatar size={72} />
            </Animated.View>

            <Text style={styles.buildTitle}>Building your plan</Text>
            <Text style={styles.buildTimeHint}>This takes about 2 minutes</Text>

            <Animated.Text
              style={[styles.buildSubtitle, { opacity: subtitleOpacity }]}
            >
              {errorState ? errorState.message : displaySubtitle}
            </Animated.Text>

            {isWaitingForApi && (
              <View style={styles.waitingRow}>
                <ActivityIndicator
                  size="small"
                  color={Colors.accent}
                  style={styles.waitingSpinner}
                />
                <Text style={styles.waitingText}>
                  Jordan is writing your coaching notes — almost done.
                </Text>
              </View>
            )}

            {errorState?.canRetry ? (
              <Pressable
                style={styles.loadRetryButton}
                onPress={() => generateAndSavePlan(true)}
              >
                <Text style={styles.loadRetryButtonText}>Try Again</Text>
              </Pressable>
            ) : null}
            {errorState?.showSubscribe ? (
              <Pressable
                style={styles.loadRetryButton}
                onPress={() =>
                  navigation.navigate('Dashboard', {
                    screen: 'ProfileTab',
                    params: { screen: 'SubscriptionManagement' },
                  } as never)
                }
              >
                <Text style={styles.loadRetryButtonText}>Subscribe →</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.midSection}>
            <EdgeBar
              progress={progressFraction}
              height={4}
              trackColor={Colors.bgElevated}
              fillColor={Colors.accent}
            />

            <View style={styles.stepList}>
              {LOADING_STEPS.slice(0, currentStepIndex + 1).map((step, i) => {
                const isComplete = completedSteps.includes(step.id);
                const isCurrent = i === currentStepIndex && !isComplete;

                return (
                  <Animated.View
                    key={step.id}
                    style={[styles.stepRowOuter, { opacity: rowOpacities[i] }]}
                  >
                    <View style={styles.stepRow}>
                      <View style={styles.stepIconCol}>
                        {isComplete ? (
                          <Text style={styles.stepIconDone}>✓</Text>
                        ) : isCurrent ? (
                          <ActivityIndicator
                            size="small"
                            color={Colors.accent}
                          />
                        ) : (
                          <View style={styles.stepIconPending} />
                        )}
                      </View>
                      <Text
                        style={
                          isComplete
                            ? styles.stepLabelDone
                            : isCurrent
                              ? styles.stepLabelCurrent
                              : styles.stepLabelPending
                        }
                        numberOfLines={2}
                      >
                        {step.label}
                      </Text>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          </View>

          <View style={styles.bottomQuote}>
            <Text style={styles.quoteText}>
              Every number you entered is going into this plan.{'\n'}
              Jordan
            </Text>
          </View>
        </View>
      )}

      {planReady && replacePlanId && (
        <View style={styles.handoffOverlay}>
          <View style={styles.handoffCard}>
            <View style={styles.handoffCheckCircle}>
              <Ionicons name="checkmark" size={36} color={Colors.textPrimary} />
            </View>

            <Text style={styles.handoffTitle}>You're ready to go.</Text>

            {jordanMessage ? (
              <View style={styles.handoffJordanCard}>
                <Text style={styles.handoffJordanLabel}>JORDAN</Text>
                <Text style={styles.handoffJordanText}>
                  {stripEmDash(cleanJordanMessage(jordanMessage) ?? '')}
                </Text>
              </View>
            ) : (
              <Text style={styles.handoffSubtitle}>
                Week 1 is set. First session is waiting.
              </Text>
            )}

            {firstSessionDisplayLine ? (
              <Text style={styles.firstSessionLine}>{firstSessionDisplayLine}</Text>
            ) : null}

            <TouchableOpacity
              style={styles.handoffPrimaryBtn}
              activeOpacity={0.8}
              onPress={() => void handleBeginTraining()}
              disabled={savingStartDate || !firstSessionDateISO}
            >
              {savingStartDate ? (
                <ActivityIndicator color={Colors.textPrimary} size="small" />
              ) : (
                <Text style={styles.handoffPrimaryBtnText}>Begin Training →</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowFeedback(true)}
              style={styles.setupFeedbackLink}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.setupFeedbackText}>
                How was your setup experience? →
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <BetaFeedbackModal
        visible={showFeedback}
        onClose={() => setShowFeedback(false)}
        defaultArea="onboarding"
        lockArea={true}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  successTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  successSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  startDateRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  startDateCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  startDateCardSelected: {
    borderColor: Colors.accent,
    borderWidth: 2,
  },
  startDateLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  startDateValue: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  startDateHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 2,
  },
  successCTA: {
    width: '100%',
    height: 56,
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  successCTAText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  topSection: {
    alignItems: 'center',
    paddingTop: Spacing.md,
  },
  buildTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  buildSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  buildTimeHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  waitingSpinner: {
    marginRight: 4,
  },
  waitingText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  loadRetryButton: {
    marginTop: Spacing.lg,
    width: '100%',
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadRetryButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  midSection: {
    flex: 1,
    marginTop: Spacing.xxl,
    minHeight: 0,
  },
  stepList: {
    marginTop: Spacing.lg,
  },
  stepRowOuter: {
    width: '100%',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  stepIconCol: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  stepIconDone: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.success,
  },
  stepIconPending: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepLabelDone: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  stepLabelCurrent: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.accent,
  },
  stepLabelPending: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textTertiary,
  },
  bottomQuote: {
    paddingBottom: Spacing.lg,
  },
  quoteText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: LineHeights.caption,
  },
  firstSessionLine: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
    lineHeight: LineHeights.body,
  },
  handoffOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  handoffCard: {
    width: '100%',
    alignItems: 'center',
  },
  handoffCheckCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  handoffTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  handoffJordanCard: {
    width: '100%',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.lg,
    marginBottom: 24,
  },
  handoffJordanLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  handoffJordanText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  handoffSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  handoffPrimaryBtn: {
    width: '100%',
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  handoffPrimaryBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  handoffSecondaryBtn: {
    width: '100%',
    height: 52,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handoffSecondaryBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.accent,
  },
  setupFeedbackLink: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  setupFeedbackText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
  },
});

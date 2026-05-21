import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import { scheduleReEngagementPush } from '../../utils/notifications';
import { supabase } from '../../Lib/supabase';
import { Colors, Fonts, FontSizes, LineHeights, Spacing, Radius } from '../../constants/design';
import { useAuth } from '../../contexts/AuthContext';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'BuildingPlan'>;
type RouteType = RouteProp<RootStackParamList, 'BuildingPlan'>;

type LoadingStep = {
  id: string;
  label: string;
  message: string;
  duration: number;
};

const LOADING_STEPS: LoadingStep[] = [
  {
    id: 'goals',
    label: 'Goal & experience analysed',
    message: 'Reading your training history and goal...',
    duration: 2000,
  },
  {
    id: 'structure',
    label: 'Weekly structure built',
    message: 'Mapping your split across your training days...',
    duration: 2500,
  },
  {
    id: 'nutrition',
    label: 'Nutrition targets calculated',
    message: 'Calculating your calories and macro targets...',
    duration: 2000,
  },
  {
    id: 'weights',
    label: 'Week 1 weights calibrated',
    message: 'Setting your starting weights for Week 1...',
    duration: 2000,
  },
  {
    id: 'coaching',
    label: 'Coaching notes written',
    message: 'Jordan is writing your session-by-session cues...',
    duration: 2500,
  },
  {
    id: 'ready',
    label: 'Plan ready',
    message: 'Finishing touches...',
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
  const date = new Date();
  date.setDate(date.getDate() + weeks * 7);
  return date.toISOString().split('T')[0];
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
  const [jordanMessage, setJordanMessage] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [weekNumber] = useState(1);
  const [firstDayNumber, setFirstDayNumber] = useState<number>(1);
  const [firstWorkoutTitle, setFirstWorkoutTitle] = useState<string>('Workout');
  const [errorState, setErrorState] = useState<{ message: string; canRetry: boolean } | null>(null);
  const [displaySubtitle, setDisplaySubtitle] = useState(LOADING_STEPS[0].message);
  const [progressBarWidth, setProgressBarWidth] = useState(0);

  const stopSequenceRef = useRef(false);
  const stepTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const retryContextRef = useRef<RetryPlanContext | null>(null);

  const avatarPulseOpacity = useRef(new Animated.Value(1)).current;
  const subtitleOpacity = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
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

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressFraction,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progressFraction, progressAnim]);

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

  // --- Generate plan, save to Supabase, then navigate ---
  useEffect(() => {
    generateAndSavePlan(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateAfterDelay = (minMs: number) => {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, minMs - elapsed);
    setTimeout(() => navigation.navigate('Dashboard'), remaining);
  };

  const generateAndSavePlan = async (isRetry: boolean) => {
    setErrorState(null);
    if (isRetry) {
      stopLoadingSequence();
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

      if (!isRetry) {
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
          daysPerWeek: daysPerWeekResolved,
          totalWeeks: planWeeksResolved,
          recommendedWeeks: planWeeksResolved,
          scheduledDays: params.trainingDays ?? [],
          subMusclePreferences: params.subMusclePreferences ?? {},
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
          message: 'Jordan is in high demand right now — tap to try again.',
          canRetry: true,
        });
        return;
      }

      if (fnError) throw fnError;

      const planJson = (fnData as { plan?: any } | null)?.plan;
      if (!planJson) throw new Error('No plan returned from Edge Function');

      const { data: savedPlan, error: planError } = await supabase
        .from('plans')
        .insert({
          user_id: userId,
          goal_id: goalData.id,
          title: planJson.title,
          current_week: 1,
          total_weeks: planJson.totalWeeks,
          status: 'active',
          plan_json: planJson,
        })
        .select()
        .maybeSingle();

      if (planError) throw planError;
      if (!savedPlan) {
        throw new Error('Plan insert did not return a row');
      }

      const week1Days = planJson.weeks?.[0]?.days ?? [];
      const firstWorkout = week1Days.find((d: any) => d.type === 'workout');

      setPlanId(savedPlan.id);
      setJordanMessage(planJson.jordanWelcome ?? null);
      setFirstDayNumber(firstWorkout?.dayNumber ?? 1);
      setFirstWorkoutTitle(firstWorkout?.title ?? 'Workout');

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
          message: 'Something went wrong while building your plan — tap to try again.',
          canRetry: true,
        });
      } else {
        navigateAfterDelay(1000);
      }
    }
  };

  const onProgressBarLayout = (e: LayoutChangeEvent) => {
    setProgressBarWidth(e.nativeEvent.layout.width);
  };

  const progressFillWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(0, progressBarWidth)],
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.topSection}>
          <Animated.View
            style={[styles.jordanAvatar, { opacity: avatarPulseOpacity }]}
          >
            <Text style={styles.jordanInitial}>J</Text>
          </Animated.View>

          <Text style={styles.buildTitle}>Building your plan</Text>

          <Animated.Text
            style={[styles.buildSubtitle, { opacity: subtitleOpacity }]}
          >
            {errorState ? errorState.message : displaySubtitle}
          </Animated.Text>

          {errorState?.canRetry ? (
            <Pressable
              style={styles.loadRetryButton}
              onPress={() => generateAndSavePlan(true)}
            >
              <Text style={styles.loadRetryButtonText}>Try Again</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.midSection}>
          <View style={styles.progressTrack} onLayout={onProgressBarLayout}>
            <Animated.View
              style={[styles.progressFill, { width: progressFillWidth }]}
            />
          </View>

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
            The plan is only as good as the data behind it.{'\n'}
            You gave me everything I need.{'\n'}
            — Jordan
          </Text>
        </View>
      </View>

      {planReady && (
        <View style={styles.handoffOverlay}>
          <View style={styles.handoffCard}>
            <View style={styles.handoffCheckCircle}>
              <Text style={styles.handoffCheck}>✓</Text>
            </View>

            <Text style={styles.handoffTitle}>Your Plan is Ready</Text>

            {jordanMessage ? (
              <View style={styles.handoffJordanCard}>
                <Text style={styles.handoffJordanLabel}>JORDAN</Text>
                <Text style={styles.handoffJordanText}>{jordanMessage}</Text>
              </View>
            ) : (
              <Text style={styles.handoffSubtitle}>
                Week 1 is built and ready to go.
              </Text>
            )}

            <TouchableOpacity
              style={styles.handoffPrimaryBtn}
              activeOpacity={0.8}
              onPress={() => {
                if (planId) {
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'Dashboard' }],
                  });
                  setTimeout(() => {
                    navigation.navigate('ActiveWorkout', {
                      planId: planId!,
                      weekNumber: weekNumber,
                      dayNumber: firstDayNumber,
                      workoutTitle: firstWorkoutTitle,
                    });
                  }, 100);
                } else {
                  navigation.navigate('Dashboard');
                }
              }}
            >
              <Text style={styles.handoffPrimaryBtnText}>
                Start Workout Now →
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.handoffSecondaryBtn}
              activeOpacity={0.7}
              onPress={() => {
                scheduleReEngagementPush();
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Dashboard' }],
                });
              }}
            >
              <Text style={styles.handoffSecondaryBtnText}>
                Go to Dashboard
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  topSection: {
    alignItems: 'center',
    paddingTop: Spacing.md,
  },
  jordanAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.bgCard,
    borderWidth: 2,
    borderColor: Colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jordanInitial: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.accent,
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
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgElevated,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
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
    fontStyle: 'italic',
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: LineHeights.caption,
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
    marginBottom: 24,
  },
  handoffCheck: {
    fontSize: 32,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  handoffTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 20,
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
    marginBottom: 32,
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
});

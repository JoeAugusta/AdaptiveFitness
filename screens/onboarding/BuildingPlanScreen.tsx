import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import { supabase } from '../../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'BuildingPlan'>;
type RouteType = RouteProp<RootStackParamList, 'BuildingPlan'>;

const MESSAGES = [
  'Analysing your goals...',
  'Calculating your macros...',
  'Structuring your weekly split...',
  'Applying progressive overload...',
  'Personalising your coaching style...',
  'Almost ready...',
];

const STEPS = [
  'Goal & experience analysed',
  'Nutrition targets calculated',
  'Training plan structured',
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

export default function BuildingPlanScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const params = route.params;
  const startTime = useRef(Date.now()).current;

  // --- Pulsing circle ---
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // --- Cycling subtitle ---
  const [displayedMessage, setDisplayedMessage] = useState(MESSAGES[0]);
  const subtitleOpacity = useRef(new Animated.Value(1)).current;
  const msgIndexRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(subtitleOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        msgIndexRef.current = (msgIndexRef.current + 1) % MESSAGES.length;
        setDisplayedMessage(MESSAGES[msgIndexRef.current]);
        Animated.timing(subtitleOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [subtitleOpacity]);

  // --- Sequential step rows ---
  const stepAnims = useRef(STEPS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    STEPS.forEach((_, i) => {
      const t = setTimeout(() => {
        Animated.timing(stepAnims[i], {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      }, i * 1500);
      timeouts.push(t);
    });
    return () => timeouts.forEach(clearTimeout);
  }, [stepAnims]);

  const [planReady, setPlanReady] = useState(false);
  const [jordanMessage, setJordanMessage] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [weekNumber] = useState(1);
  const [firstDayNumber, setFirstDayNumber] = useState<number>(1);
  const [firstWorkoutTitle, setFirstWorkoutTitle] = useState<string>('Workout');

  // --- Generate plan, save to Supabase, then navigate ---
  useEffect(() => {
    generateAndSavePlan();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateAfterDelay = (minMs: number) => {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, minMs - elapsed);
    setTimeout(() => navigation.navigate('Dashboard'), remaining);
  };

  const generateAndSavePlan = async () => {
    try {
      let { data: { session } } = await supabase.auth.getSession();

      // If no session exists (e.g. web dev mode or auth not completed),
      // sign in anonymously so data can still be saved
      if (!session) {
        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError) throw new Error('Could not create session: ' + anonError.message);
        session = anonData.session;
      }

      const userId = session?.user?.id;
      if (!userId) throw new Error('No user session after anonymous sign in');

      const sessionStructureForProfile = params.sessionStructure ?? [];
      const profileWorkoutDayCount = sessionStructureForProfile.filter(
        (d: { type: string }) => d.type === 'workout',
      ).length;
      const daysPerWeekForProfile =
        profileWorkoutDayCount > 0
          ? profileWorkoutDayCount
          : parseInt(String(params.daysPerWeek), 10);

      // Save user profile
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
        weak_points: params.weakPoints ?? [],
        age: parseInt(params.age),
        sex: params.sex,
        height_ft: parseInt(params.heightFt),
        height_in: parseInt(params.heightIn),
        weight_lbs: parseFloat(params.weightLbs),
        body_fat_pct: params.bodyFatPct ? parseFloat(params.bodyFatPct) : null,
      });

      // Save goal
      const { data: goalData, error: goalError } = await supabase
        .from('goals')
        .insert({
          user_id: userId,
          goal_type: params.goal,
          target_lift: params.targetLift ?? null,
          current_1rm: params.current1RM ? parseFloat(params.current1RM) : null,
          target_1rm: params.target1RM ? parseFloat(params.target1RM) : null,
          plan_duration_weeks: parseInt(params.planDuration ?? '12'),
          recomp_focus: params.recompFocus ?? null,
          general_focus: params.generalFocus ?? null,
          starting_weight_lbs: params.startingWeightLbs
            ? parseFloat(params.startingWeightLbs)
            : null,
          status: 'active',
          target_date: params.targetDate ?? null,
        })
        .select()
        .single();

      if (goalError) throw goalError;

      // Save macro plan
      await supabase.from('macro_plans').insert({
        user_id: userId,
        goal_id: goalData.id,
        calories_target: params.calories,
        protein_g: params.proteinG,
        carbs_g: params.carbsG,
        fats_g: params.fatsG,
      });

      // Pause any existing active plans for this user — avoids duplicate active plans
      const { error: pauseError } = await supabase
        .from('plans')
        .update({ status: 'paused' })
        .eq('user_id', userId)
        .eq('status', 'active');

      if (pauseError) {
        console.warn('[BuildingPlan] Could not pause existing plans:', pauseError);
        // Non-fatal — continue with plan generation
      } else {
        console.log('[BuildingPlan] Existing active plans paused');
      }

      // Call the Edge Function to generate the training plan
      const { data: { session: currentSession } } = await supabase.auth.getSession();

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

      const generatePlanBody = {
        ...params,
        daysPerWeek: daysPerWeekResolved,
      };

      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'generate-plan',
        {
          body: generatePlanBody,
          headers: {
            Authorization: `Bearer ${currentSession?.access_token}`,
          },
        },
      );
      if (fnError) throw fnError;

      const planJson = fnData?.plan;
      if (!planJson) throw new Error('No plan returned from Edge Function');

      // Save plan
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
        .single();

      if (planError) throw planError;

      // Find first workout day
      const week1Days = planJson.weeks?.[0]?.days ?? [];
      const firstWorkout = week1Days.find((d: any) => d.type === 'workout');

      // Set handoff state
      setPlanId(savedPlan.id);
      setJordanMessage(planJson.jordanWelcome ?? null);
      setFirstDayNumber(firstWorkout?.dayNumber ?? 1);
      setFirstWorkoutTitle(firstWorkout?.title ?? 'Workout');

      // Fire-and-forget: save goal projection — does not block navigation
      saveGoalProjection(
        goalData.id,
        params.goal,
        parseInt(params.planDuration ?? '12'),
        {
          current1RM:        params.current1RM,
          target1RM:         params.target1RM,
          targetLift:        params.targetLift,
          startingWeightLbs: params.startingWeightLbs,
          targetWeightLbs:   params.targetWeightLbs,
        },
      );

      // Wait minimum 3 seconds for animation, then show handoff
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 3000 - elapsed);
      setTimeout(() => setPlanReady(true), remaining);
    } catch (error) {
      console.error('Plan generation failed:', error);
      navigateAfterDelay(1000);
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.outerRing, { opacity: pulseAnim }]}
      >
        <View style={styles.innerFill} />
      </Animated.View>

      <Text style={styles.title}>Building Your Plan</Text>
      <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
        {displayedMessage}
      </Animated.Text>

      <View style={styles.checklist}>
        {STEPS.map((step, i) => {
          const inv = stepAnims[i].interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0],
          });
          return (
            <View key={step}>
              <View style={styles.stepRow}>
                <View style={styles.checkSlot}>
                  <Animated.Text style={[styles.pendingGlyph, { opacity: inv }]}>
                    ·
                  </Animated.Text>
                  <Animated.Text
                    style={[styles.checkGlyph, { opacity: stepAnims[i] }]}
                  >
                    ✓
                  </Animated.Text>
                </View>
                <View style={styles.stepTextWrap}>
                  <Animated.Text style={[styles.stepTextPending, { opacity: inv }]}>
                    {step}
                  </Animated.Text>
                  <Animated.Text
                    style={[styles.stepTextDone, { opacity: stepAnims[i] }]}
                  >
                    {step}
                  </Animated.Text>
                </View>
              </View>
              {i < STEPS.length - 1 ? <View style={styles.rowDivider} /> : null}
            </View>
          );
        })}
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
              onPress={() =>
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Dashboard' }],
                })
              }
            >
              <Text style={styles.handoffSecondaryBtnText}>
                Go to Dashboard
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  outerRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.bgCard,
    borderWidth: 2,
    borderColor: Colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerFill: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.accent,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: 32,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  checklist: {
    marginTop: 40,
    alignSelf: 'stretch',
    paddingHorizontal: 16,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  checkSlot: {
    width: 24,
    minHeight: 22,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingGlyph: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textTertiary,
    position: 'absolute',
  },
  checkGlyph: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.success,
    position: 'absolute',
  },
  stepTextWrap: {
    flex: 1,
    position: 'relative',
    minHeight: 22,
    justifyContent: 'center',
  },
  stepTextPending: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textTertiary,
    position: 'absolute',
    left: 0,
    right: 0,
  },
  stepTextDone: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    position: 'absolute',
    left: 0,
    right: 0,
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.divider,
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

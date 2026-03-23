import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import { supabase } from '../../Lib/supabase';

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const CHECK_GREEN = '#10B981';

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

      // Save user profile
      await supabase.from('user_profiles').upsert({
        user_id: userId,
        training_age: params.experience,
        days_per_week: parseInt(params.daysPerWeek),
        session_duration_mins: parseDuration(params.sessionLength),
        preferred_split: params.split,
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

      // Call the Edge Function to generate the training plan
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'generate-plan',
        {
          body: params,
          headers: {
            Authorization: `Bearer ${currentSession?.access_token}`,
          },
        },
      );
      if (fnError) throw fnError;

      const planJson = fnData?.plan;
      if (!planJson) throw new Error('No plan returned from Edge Function');

      // Save plan
      const { error: planError } = await supabase
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

      navigateAfterDelay(3000);
    } catch (error) {
      console.error('Plan generation failed:', error);
      navigateAfterDelay(1000);
    }
  };

  return (
    <View style={styles.container}>
      {/* Pulsing circle */}
      <View style={styles.outerCircle}>
        <Animated.View style={[styles.innerCircle, { opacity: pulseAnim }]} />
      </View>

      {/* Title + cycling subtitle */}
      <View style={styles.middleSection}>
        <Text style={styles.title}>Building Your Plan</Text>
        <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
          {displayedMessage}
        </Animated.Text>
      </View>

      {/* Sequential step rows */}
      <View style={styles.stepsSection}>
        {STEPS.map((step, i) => (
          <Animated.View
            key={step}
            style={[styles.stepRow, { opacity: stepAnims[i] }]}
          >
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.stepText}>{step}</Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: ACCENT_BLUE,
  },
  middleSection: {
    marginTop: 40,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    marginTop: 12,
  },
  stepsSection: {
    marginTop: 60,
    alignItems: 'flex-start',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkmark: {
    color: CHECK_GREEN,
    fontSize: 16,
    marginRight: 10,
  },
  stepText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
  },
});

import { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import InfoTooltip from '../../components/InfoTooltip';

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const CARD_SELECTED_BG = 'rgba(59,130,246,0.12)';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const DISABLED_BG = '#334155';
const DANGER_RED = '#EF4444';
const COLOR_GREEN = '#10B981';
const COLOR_AMBER = '#F59E0B';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'GoalDetails'>;
type RouteType = RouteProp<RootStackParamList, 'GoalDetails'>;

interface Option {
  id: string;
  label: string;
}

const LIFT_OPTIONS: Option[] = [
  { id: 'bench_press', label: 'Bench Press' },
  { id: 'squat', label: 'Back Squat' },
  { id: 'deadlift', label: 'Deadlift' },
  { id: 'ohp', label: 'Overhead Press' },
];

const MUSCLE_OPTIONS: string[] = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
  'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Traps',
];

const TIMELINE_OPTIONS: Option[] = [
  { id: '8w', label: '8 Weeks' },
  { id: '12w', label: '12 Weeks' },
  { id: '16w', label: '16 Weeks' },
  { id: '24w', label: '24 Weeks' },
];

const TIMELINE_WEEKS: Record<string, number> = {
  '8w': 8,
  '12w': 12,
  '16w': 16,
  '24w': 24,
};

const SECONDARY_LIFT_OPTIONS: Option[] = [
  { id: 'bench_press', label: 'Bench Press' },
  { id: 'squat', label: 'Back Squat' },
  { id: 'deadlift', label: 'Deadlift' },
  { id: 'ohp', label: 'Overhead Press' },
  { id: 'none', label: 'None' },
];

const PLAN_DURATION_OPTIONS: Option[] = [
  { id: '8w', label: '8 Weeks' },
  { id: '12w', label: '12 Weeks' },
  { id: '16w', label: '16 Weeks' },
];

const GENERAL_PLAN_OPTIONS: Option[] = [
  { id: '4w', label: '4 Weeks' },
  { id: '8w', label: '8 Weeks' },
  { id: '12w', label: '12 Weeks' },
];

const RECOMP_FOCUS_OPTIONS: (Option & { detail: string })[] = [
  {
    id: 'lose_fat',
    label: 'Prioritise Fat Loss',
    detail: 'Lose fat while maintaining muscle',
  },
  {
    id: 'gain_muscle',
    label: 'Prioritise Muscle Gain',
    detail: 'Build muscle while minimising fat gain',
  },
];

const GENERAL_FOCUS_OPTIONS: (Option & { detail: string })[] = [
  {
    id: 'habit',
    label: 'Build a consistent habit',
    detail: 'Show up regularly and make fitness part of my life',
  },
  {
    id: 'strength',
    label: 'Get stronger and fitter',
    detail: 'Improve strength, endurance and overall fitness',
  },
  {
    id: 'wellbeing',
    label: 'Feel better and move better',
    detail: 'Improve energy, mobility and daily function',
  },
  {
    id: 'event',
    label: 'Prepare for something specific',
    detail: 'Training for a sport, event or physical challenge',
  },
];

const STRENGTH_EXPECTATIONS: Record<string, string> = {
  '8w': 'In 8 weeks of focused strength training, expect a 10–20lb increase on your target lift with consistent progressive overload.',
  '12w': 'In 12 weeks, a 20–40lb 1RM increase is realistic. Your plan will peak you for a max attempt in week 12.',
  '16w': '16 weeks gives you time for two strength phases. Expect 30–50lb gains with a structured deload built in.',
};

const HYPERTROPHY_EXPECTATIONS: Record<string, string> = {
  '8w': '8 weeks is enough to see visible muscle definition changes. Expect 2–4 lbs of lean muscle gain.',
  '12w': '12 weeks is the sweet spot for hypertrophy. Expect 4–6 lbs of lean mass with good nutrition adherence.',
  '16w': '16 weeks of progressive overload can yield 6–8 lbs of lean muscle. Consistency is the key variable.',
};

const FAT_LOSS_EXPECTATIONS: Record<string, string> = {
  '8w': '8 weeks is an aggressive cut. Expect 8–12 lbs of total weight loss if you hit your calorie targets consistently.',
  '12w': '12 weeks at a moderate deficit is sustainable and effective. Expect 10–16 lbs lost while preserving muscle mass.',
  '16w': '16 weeks gives you the best chance of keeping the weight off long term. Slower loss = more muscle retained.',
  '24w': '24 weeks is a long-term lifestyle change. Expect 20–28 lbs lost at a safe, sustainable rate.',
};

const RECOMP_EXPECTATIONS: Record<string, string> = {
  '8w': 'Body recomp in 8 weeks will show early changes in body composition. Scale weight may stay similar — trust the mirror over the scale.',
  '12w': '12 weeks is the minimum to see meaningful recomp results. Expect noticeable changes in muscle tone and fat distribution.',
  '16w': '16 weeks gives your body time to genuinely recompose. Most users see 3–5% body fat reduction alongside visible muscle gains.',
};

const GENERAL_EXPECTATIONS: Record<string, string> = {
  '4w': "4 weeks builds the habit. By week 4 you'll have a consistent routine and noticeable energy improvements.",
  '8w': '8 weeks of consistent training improves strength, endurance and mobility. Most users feel significantly better by week 6.',
  '12w': '12 weeks transforms your baseline fitness. Expect meaningful strength gains and improved body composition.',
};

function StrengthContent({
  onContinue,
}: {
  onContinue: (params: Record<string, unknown>) => void;
}) {
  const [targetLift, setTargetLift] = useState<string | null>(null);
  const [current1RM, setCurrent1RM] = useState('');
  const [target1RM, setTarget1RM] = useState('');
  const [secondaryLift, setSecondaryLift] = useState<string | null>(null);
  const [secondaryLiftError, setSecondaryLiftError] = useState(false);
  const [planDuration, setPlanDuration] = useState('12w');
  const [durationManuallySet, setDurationManuallySet] = useState(false);

  const canContinue = !!targetLift && current1RM.trim() !== '' && target1RM.trim() !== '';

  const feasibility = useMemo(() => {
    if (!current1RM.trim() || !target1RM.trim()) return null;
    const diff = Number(target1RM) - Number(current1RM);
    if (diff <= 20) {
      return { message: `A ${diff}lb increase is very achievable. We recommend an `, weeks: 8, suffix: '-week plan.' };
    }
    if (diff <= 40) {
      return { message: `A ${diff}lb increase is realistic with focused programming. We recommend a `, weeks: 12, suffix: '-week plan.' };
    }
    if (diff <= 60) {
      return { message: `A ${diff}lb increase is ambitious but possible. We recommend a `, weeks: 16, suffix: '-week plan.' };
    }
    return { message: `A ${diff}lb increase is a long-term goal. Consider breaking it into phases. We recommend starting with a `, weeks: 12, suffix: '-week block.' };
  }, [current1RM, target1RM]);

  useEffect(() => {
    if (feasibility && !durationManuallySet) {
      const w = feasibility.weeks;
      setPlanDuration(w <= 8 ? '8w' : w <= 12 ? '12w' : '16w');
    }
  }, [feasibility, durationManuallySet]);

  const handleSecondaryLift = (id: string) => {
    if (id !== 'none' && id === targetLift) {
      setSecondaryLiftError(true);
      return;
    }
    setSecondaryLiftError(false);
    setSecondaryLift(id);
  };

  return (
    <ScreenShell
      title="Strength Goals"
      subtitle="Tell us your current numbers and where you want to get to."
      canContinue={canContinue}
      buttonLabel="Continue"
      onContinue={() =>
        onContinue({
          targetLift,
          current1RM: current1RM.trim(),
          target1RM: target1RM.trim(),
          secondaryLift,
          planDuration,
        })
      }
    >
      <Text style={styles.heading}>Which lift?</Text>
      <View style={styles.cardsContainer}>
        {LIFT_OPTIONS.map((opt) => {
          const selected = targetLift === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.card, selected && styles.cardSelected]}
              onPress={() => {
                setTargetLift(opt.id);
                if (secondaryLift === opt.id) {
                  setSecondaryLift(null);
                  setSecondaryLiftError(false);
                }
              }}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardLabel}>{opt.label}</Text>
              </View>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.heading, styles.sectionGap]}>Current & Target 1RM</Text>
      <View style={styles.inputCard}>
        <Text style={styles.inputLabel}>Current 1RM (lbs)</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. 225"
          placeholderTextColor={TEXT_SECONDARY}
          keyboardType="numeric"
          value={current1RM}
          onChangeText={setCurrent1RM}
        />
      </View>
      <View style={[styles.inputCard, { marginTop: 10 }]}>
        <Text style={styles.inputLabel}>Target 1RM (lbs)</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. 275"
          placeholderTextColor={TEXT_SECONDARY}
          keyboardType="numeric"
          value={target1RM}
          onChangeText={setTarget1RM}
        />
      </View>

      {feasibility && (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            {feasibility.message}
            <Text style={styles.infoHighlight}>{feasibility.weeks}</Text>
            {feasibility.suffix}
          </Text>
        </View>
      )}

      <Text style={[styles.heading, styles.sectionGap]}>Plan Duration</Text>
      <Text style={styles.sectionSubtitle}>
        Based on your goal, we recommend:
      </Text>
      <View style={styles.chipRow}>
        {PLAN_DURATION_OPTIONS.map((opt) => {
          const selected = planDuration === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => {
                setDurationManuallySet(true);
                setPlanDuration(opt.id);
              }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {STRENGTH_EXPECTATIONS[planDuration] && (
        <View style={styles.expectationCard}>
          <Text style={styles.expectationText}>
            {STRENGTH_EXPECTATIONS[planDuration]}
          </Text>
        </View>
      )}

      <Text style={[styles.heading, styles.sectionGap]}>
        Secondary Lift (Optional)
      </Text>
      <Text style={styles.sectionSubtitle}>
        Want to track progress on another lift too?
      </Text>
      <View style={styles.cardsContainer}>
        {SECONDARY_LIFT_OPTIONS.map((opt) => {
          const selected = secondaryLift === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.card, selected && styles.cardSelected]}
              onPress={() => handleSecondaryLift(opt.id)}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardLabel}>{opt.label}</Text>
              </View>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {secondaryLiftError && (
        <Text style={styles.errorText}>
          Must be different from your primary lift
        </Text>
      )}
    </ScreenShell>
  );
}

function HypertrophyContent({
  onContinue,
}: {
  onContinue: (params: Record<string, unknown>) => void;
}) {
  const [priorityMuscles, setPriorityMuscles] = useState<string[]>([]);
  const [planDuration, setPlanDuration] = useState('12w');

  const toggleMuscle = (muscle: string) => {
    setPriorityMuscles((prev) => {
      if (prev.includes(muscle)) return prev.filter((m) => m !== muscle);
      if (prev.length >= 3) return prev;
      return [...prev, muscle];
    });
  };

  return (
    <ScreenShell
      title="Muscle Priority"
      subtitle="Select up to 3 muscle groups you want to prioritise. Your plan will give these extra volume."
      canContinue
      buttonLabel={priorityMuscles.length > 0 ? 'Continue' : 'Skip'}
      onContinue={() => onContinue({ priorityMuscles, planDuration })}
    >
      <View style={styles.chipRow}>
        {MUSCLE_OPTIONS.map((muscle) => {
          const selected = priorityMuscles.includes(muscle);
          const maxed = priorityMuscles.length >= 3 && !selected;
          return (
            <TouchableOpacity
              key={muscle}
              activeOpacity={0.7}
              style={[
                styles.chip,
                selected && styles.chipSelected,
                maxed && { opacity: 0.4 },
              ]}
              onPress={() => toggleMuscle(muscle)}
              disabled={maxed}
            >
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {muscle}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {priorityMuscles.length > 0 && (
        <Text style={styles.chipHint}>
          These muscles will receive priority volume in your program.
        </Text>
      )}

      <Text style={[styles.heading, styles.sectionGap]}>Plan Duration</Text>
      <Text style={styles.sectionSubtitle}>
        How many weeks do you want to commit to?
      </Text>
      <View style={styles.chipRow}>
        {PLAN_DURATION_OPTIONS.map((opt) => {
          const selected = planDuration === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setPlanDuration(opt.id)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {HYPERTROPHY_EXPECTATIONS[planDuration] && (
        <View style={styles.expectationCard}>
          <Text style={styles.expectationText}>
            {HYPERTROPHY_EXPECTATIONS[planDuration]}
          </Text>
        </View>
      )}
    </ScreenShell>
  );
}

function FatLossContent({
  onContinue,
}: {
  onContinue: (params: Record<string, unknown>) => void;
}) {
  const [currentWeightLbs, setCurrentWeightLbs] = useState('');
  const [targetWeightLbs, setTargetWeightLbs] = useState('');
  const [targetDate, setTargetDate] = useState<string | null>(null);

  const canContinue =
    currentWeightLbs.trim() !== '' &&
    targetWeightLbs.trim() !== '' &&
    !!targetDate;

  const rateCheck = useMemo(() => {
    if (!currentWeightLbs.trim() || !targetWeightLbs.trim() || !targetDate) return null;
    const weeks = TIMELINE_WEEKS[targetDate];
    const weeklyRate = (Number(currentWeightLbs) - Number(targetWeightLbs)) / weeks;

    if (weeklyRate <= 0) {
      return {
        message: 'Your target weight is higher than your current weight. Please check your numbers.',
        color: DANGER_RED,
      };
    }
    if (weeklyRate <= 1) {
      return {
        message: `~${weeklyRate.toFixed(1)} lbs/week — this is a safe, sustainable rate. Great choice.`,
        color: COLOR_GREEN,
      };
    }
    if (weeklyRate <= 1.5) {
      return {
        message: `~${weeklyRate.toFixed(1)} lbs/week — aggressive but achievable with strict adherence.`,
        color: COLOR_AMBER,
      };
    }
    return {
      message: `~${weeklyRate.toFixed(1)} lbs/week — this is very aggressive. Consider a longer timeline.`,
      color: DANGER_RED,
    };
  }, [currentWeightLbs, targetWeightLbs, targetDate]);

  return (
    <ScreenShell
      title="Fat Loss Target"
      subtitle="Set a goal weight and timeline so we can build the right deficit for you."
      canContinue={canContinue}
      buttonLabel="Continue"
      onContinue={() =>
        onContinue({
          startingWeightLbs: currentWeightLbs.trim(),
          targetWeightLbs: targetWeightLbs.trim(),
          targetDate,
        })
      }
    >
      <View style={styles.inputCard}>
        <Text style={styles.inputLabel}>Current Weight (lbs)</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. 185"
          placeholderTextColor={TEXT_SECONDARY}
          keyboardType="numeric"
          value={currentWeightLbs}
          onChangeText={setCurrentWeightLbs}
        />
      </View>

      <View style={[styles.inputCard, { marginTop: 10 }]}>
        <Text style={styles.inputLabel}>Target Weight (lbs)</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. 160"
          placeholderTextColor={TEXT_SECONDARY}
          keyboardType="numeric"
          value={targetWeightLbs}
          onChangeText={setTargetWeightLbs}
        />
      </View>

      <Text style={[styles.heading, styles.sectionGap]}>
        Timeline & Plan Duration
      </Text>
      <View style={styles.chipRow}>
        {TIMELINE_OPTIONS.map((opt) => {
          const selected = targetDate === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setTargetDate(opt.id)}
            >
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {rateCheck && (
        <View style={styles.infoCard}>
          <Text style={[styles.infoText, { color: rateCheck.color }]}>
            {rateCheck.message}
          </Text>
        </View>
      )}
      {targetDate && FAT_LOSS_EXPECTATIONS[targetDate] && (
        <View style={styles.expectationCard}>
          <Text style={styles.expectationText}>
            {FAT_LOSS_EXPECTATIONS[targetDate]}
          </Text>
        </View>
      )}
    </ScreenShell>
  );
}

function RecompContent({
  onContinue,
}: {
  onContinue: (params: Record<string, unknown>) => void;
}) {
  const [recompFocus, setRecompFocus] = useState<string | null>(null);
  const [planDuration, setPlanDuration] = useState('12w');

  return (
    <ScreenShell
      title="Body Composition"
      subtitle="Help us understand where you're starting from."
      canContinue={recompFocus !== null}
      buttonLabel="Continue"
      onContinue={() => onContinue({ recompFocus, planDuration })}
    >
      <Text style={styles.heading}>What's your main focus?</Text>
      <Text style={styles.sectionSubtitle}>
        We'll adjust your plan balance accordingly.
      </Text>
      <View style={styles.cardsContainer}>
        {RECOMP_FOCUS_OPTIONS.map((opt) => {
          const selected = recompFocus === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.card, selected && styles.cardSelected]}
              onPress={() => setRecompFocus(opt.id)}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardLabel}>{opt.label}</Text>
                <Text style={styles.cardDetail}>{opt.detail}</Text>
              </View>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.heading, styles.sectionGap]}>Plan Duration</Text>
      <Text style={styles.sectionSubtitle}>
        How many weeks do you want to commit to?
      </Text>
      <View style={styles.chipRow}>
        {PLAN_DURATION_OPTIONS.map((opt) => {
          const selected = planDuration === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setPlanDuration(opt.id)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {RECOMP_EXPECTATIONS[planDuration] && (
        <View style={styles.expectationCard}>
          <Text style={styles.expectationText}>
            {RECOMP_EXPECTATIONS[planDuration]}
          </Text>
        </View>
      )}
    </ScreenShell>
  );
}

function GeneralContent({
  onContinue,
}: {
  onContinue: (params: Record<string, unknown>) => void;
}) {
  const [generalFocus, setGeneralFocus] = useState<string | null>(null);
  const [planDuration, setPlanDuration] = useState('8w');

  return (
    <ScreenShell
      title="General Fitness"
      subtitle="No specific targets needed — we'll build a balanced program to improve your overall fitness."
      canContinue
      buttonLabel="Let's Build My Plan"
      onContinue={() => onContinue({ generalFocus, planDuration })}
    >
      <View style={styles.generalInfoCard}>
        <Text style={styles.generalInfoText}>
          Your plan will cover strength, conditioning, and mobility in a
          balanced weekly structure. Perfect for building a sustainable fitness
          habit.
        </Text>
      </View>

      <Text style={[styles.heading, styles.sectionGap]}>
        What does fitness mean to you right now?
      </Text>
      <Text style={styles.sectionSubtitle}>
        This helps us personalise your program.
      </Text>
      <View style={styles.cardsContainer}>
        {GENERAL_FOCUS_OPTIONS.map((opt) => {
          const selected = generalFocus === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.card, selected && styles.cardSelected]}
              onPress={() => setGeneralFocus(opt.id)}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardLabel}>{opt.label}</Text>
                <Text style={styles.cardDetail}>{opt.detail}</Text>
              </View>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.heading, styles.sectionGap]}>Plan Duration</Text>
      <Text style={styles.sectionSubtitle}>
        How many weeks do you want to commit to?
      </Text>
      <View style={styles.chipRow}>
        {GENERAL_PLAN_OPTIONS.map((opt) => {
          const selected = planDuration === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setPlanDuration(opt.id)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {GENERAL_EXPECTATIONS[planDuration] && (
        <View style={styles.expectationCard}>
          <Text style={styles.expectationText}>
            {GENERAL_EXPECTATIONS[planDuration]}
          </Text>
        </View>
      )}
    </ScreenShell>
  );
}

function ScreenShell({
  title,
  subtitle,
  canContinue,
  buttonLabel,
  onContinue,
  children,
}: {
  title: string;
  subtitle: string;
  canContinue: boolean;
  buttonLabel: string;
  onContinue: () => void;
  children: React.ReactNode;
}) {
  const navigation = useNavigation<NavProp>();

  return (
    <View style={styles.container}>
      <View style={styles.progressBar}>
        <View style={styles.progressFill} />
      </View>

      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Text style={styles.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>Step 2 of 7</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {children}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.button, !canContinue && styles.buttonDisabled]}
          onPress={onContinue}
          disabled={!canContinue}
        >
          <Text
            style={[
              styles.buttonText,
              !canContinue && styles.buttonTextDisabled,
            ]}
          >
            {buttonLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function GoalDetailsScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { goal } = route.params;

  const handleContinue = (details: Record<string, unknown>) => {
    navigation.navigate('Experience', { goal, ...details } as RootStackParamList['Experience']);
  };

  switch (goal) {
    case 'strength':
      return <StrengthContent onContinue={handleContinue} />;
    case 'hypertrophy':
      return <HypertrophyContent onContinue={handleContinue} />;
    case 'fat_loss':
      return <FatLossContent onContinue={handleContinue} />; 
    case 'recomp':
      return <RecompContent onContinue={handleContinue} />;
    case 'general':
    default:
      return <GeneralContent onContinue={handleContinue} />;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_DARK,
  },

  /* Progress */
  progressBar: {
    height: 4,
    backgroundColor: CARD_BG,
    borderRadius: 2,
    marginHorizontal: 24,
    marginTop: 60,
  },
  progressFill: {
    width: '28.5%',
    height: '100%',
    backgroundColor: ACCENT_BLUE,
    borderRadius: 2,
  },

  /* Header */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginHorizontal: 24,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  backArrow: {
    fontSize: 22,
    color: TEXT_PRIMARY,
    marginTop: -2,
  },
  stepLabel: {
    fontSize: 13,
    color: TEXT_SECONDARY,
  },

  /* Scroll */
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
  },

  /* Title / subtitle */
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    marginBottom: 24,
  },

  /* Section headings */
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  sectionGap: {
    marginTop: 24,
  },
  sectionSubtitle: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    marginBottom: 12,
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: DANGER_RED,
    marginTop: 6,
  },

  /* Cards */
  cardsContainer: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: ACCENT_BLUE,
    backgroundColor: CARD_SELECTED_BG,
  },
  cardContent: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  cardDetail: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: TEXT_SECONDARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: ACCENT_BLUE,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: ACCENT_BLUE,
  },

  /* Chips */
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: CARD_BG,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipSelected: {
    borderColor: ACCENT_BLUE,
    backgroundColor: CARD_SELECTED_BG,
  },
  chipText: {
    fontSize: 15,
    fontWeight: '500',
    color: TEXT_SECONDARY,
  },
  chipTextSelected: {
    color: TEXT_PRIMARY,
  },
  chipHint: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginTop: 10,
  },

  /* Input cards */
  inputCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
  },
  inputLabel: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    fontWeight: '500',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: BG_DARK,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: TEXT_PRIMARY,
  },
  inputHelper: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 8,
  },

  /* Expectation card */
  expectationCard: {
    backgroundColor: '#0F2027',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#1E3A4A',
  },
  expectationText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 19,
  },

  /* Info card */
  infoCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
  },
  infoText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 19,
  },
  infoHighlight: {
    color: ACCENT_BLUE,
    fontWeight: '700',
  },

  /* General fitness info */
  generalInfoCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
  },
  generalInfoText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    lineHeight: 22,
  },

  /* Footer */
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    backgroundColor: BG_DARK,
  },
  button: {
    backgroundColor: ACCENT_BLUE,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: DISABLED_BG,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  buttonTextDisabled: {
    color: TEXT_SECONDARY,
  },
});

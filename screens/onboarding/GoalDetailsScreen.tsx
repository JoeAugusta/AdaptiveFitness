import { useState, useMemo } from 'react';
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

function StrengthContent({
  onContinue,
}: {
  onContinue: (params: Record<string, unknown>) => void;
}) {
  const [targetLift, setTargetLift] = useState<string | null>(null);
  const [current1RM, setCurrent1RM] = useState('');
  const [target1RM, setTarget1RM] = useState('');

  const canContinue = !!targetLift && current1RM.trim() !== '' && target1RM.trim() !== '';

  const feasibility = useMemo(() => {
    if (!current1RM.trim() || !target1RM.trim()) return null;
    const diff = Number(target1RM) - Number(current1RM);
    if (diff <= 20) {
      return {
        message: `A ${diff}lb increase is very achievable. We recommend an `,
        weeks: 8,
        suffix: '-week plan.',
      };
    }
    if (diff <= 40) {
      return {
        message: `A ${diff}lb increase is realistic with focused programming. We recommend a `,
        weeks: 12,
        suffix: '-week plan.',
      };
    }
    if (diff <= 60) {
      return {
        message: `A ${diff}lb increase is ambitious but possible. We recommend a `,
        weeks: 16,
        suffix: '-week plan.',
      };
    }
    return {
      message: `A ${diff}lb increase is a long-term goal. Consider breaking it into phases. We recommend starting with a `,
      weeks: 12,
      suffix: '-week block.',
    };
  }, [current1RM, target1RM]);

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
              onPress={() => setTargetLift(opt.id)}
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
            <Text style={styles.infoHighlight}>
              {feasibility.weeks}
            </Text>
            {feasibility.suffix}
          </Text>
        </View>
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
      onContinue={() => onContinue({ priorityMuscles })}
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
    </ScreenShell>
  );
}

function FatLossContent({
  onContinue,
  weightLbs,
}: {
  onContinue: (params: Record<string, unknown>) => void;
  weightLbs?: string;
}) {
  const [targetWeightLbs, setTargetWeightLbs] = useState('');
  const [targetDate, setTargetDate] = useState<string | null>(null);

  const canContinue = targetWeightLbs.trim() !== '' && !!targetDate;

  const rateCheck = useMemo(() => {
    if (!targetWeightLbs.trim() || !targetDate || !weightLbs) return null;
    const weeks = TIMELINE_WEEKS[targetDate];
    const weeklyRate = (Number(weightLbs) - Number(targetWeightLbs)) / weeks;

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
  }, [targetWeightLbs, targetDate, weightLbs]);

  return (
    <ScreenShell
      title="Fat Loss Target"
      subtitle="Set a goal weight and timeline so we can build the right deficit for you."
      canContinue={canContinue}
      buttonLabel="Continue"
      onContinue={() =>
        onContinue({
          targetWeightLbs: targetWeightLbs.trim(),
          targetDate,
        })
      }
    >
      <View style={styles.inputCard}>
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
        When do you want to reach it?
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
    </ScreenShell>
  );
}

function RecompContent({
  onContinue,
}: {
  onContinue: (params: Record<string, unknown>) => void;
}) {
  const [targetBodyFatPct, setTargetBodyFatPct] = useState('');

  return (
    <ScreenShell
      title="Body Composition"
      subtitle="Help us understand where you're starting from."
      canContinue
      buttonLabel={targetBodyFatPct.trim() ? 'Continue' : 'Skip'}
      onContinue={() =>
        onContinue({
          targetBodyFatPct: targetBodyFatPct.trim() || undefined,
        })
      }
    >
      <View style={styles.inputCard}>
        <Text style={styles.inputLabel}>Target Body Fat %</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. 15"
          placeholderTextColor={TEXT_SECONDARY}
          keyboardType="numeric"
          value={targetBodyFatPct}
          onChangeText={setTargetBodyFatPct}
        />
        <Text style={styles.inputHelper}>
          Average: Men 15–20%, Women 22–28%
        </Text>
      </View>

      <View style={[styles.infoCard, styles.sectionGap]}>
        <Text style={styles.infoText}>
          Body recomposition is a slow process — expect 3–6 months to see
          significant changes. Your plan will balance muscle gain and fat loss
          simultaneously.
        </Text>
      </View>
    </ScreenShell>
  );
}

function GeneralContent({
  onContinue,
}: {
  onContinue: (params: Record<string, unknown>) => void;
}) {
  return (
    <ScreenShell
      title="General Fitness"
      subtitle="No specific targets needed — we'll build a balanced program to improve your overall fitness."
      canContinue
      buttonLabel="Let's Build My Plan"
      onContinue={() => onContinue({})}
    >
      <View style={styles.generalInfoCard}>
        <Text style={styles.generalInfoText}>
          Your plan will cover strength, conditioning, and mobility in a
          balanced weekly structure. Perfect for building a sustainable fitness
          habit.
        </Text>
      </View>
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

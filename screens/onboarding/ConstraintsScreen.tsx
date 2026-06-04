import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import InfoTooltip from '../../components/InfoTooltip';
import BetaFeedbackModal from '../../components/BetaFeedbackModal';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Constraints'>;
type RouteType = RouteProp<RootStackParamList, 'Constraints'>;

interface Option {
  id: string;
  label: string;
  detail?: string;
}

const INJURY_OPTIONS: { id: string; label: string }[] = [
  { id: 'shoulder', label: 'Shoulder' },
  { id: 'lower_back', label: 'Lower Back' },
  { id: 'knee', label: 'Knee' },
  { id: 'hip', label: 'Hip' },
  { id: 'wrist', label: 'Wrist' },
  { id: 'elbow', label: 'Elbow' },
];

const INJURY_EXCLUSIONS: Record<string, string[]> = {
  shoulder: [
    'Overhead Press', 'Behind-the-neck Press', 'Upright Rows',
    'Lateral Raises', 'Arnold Press',
  ],
  lower_back: [
    'Deadlift', 'Good Mornings', 'Back Squat', 'Romanian Deadlift',
    'Barbell Row',
  ],
  knee: [
    'Back Squat', 'Lunges', 'Leg Press', 'Box Jumps', 'Step-ups',
  ],
  hip: [
    'Hip Thrust', 'Sumo Deadlift', 'Wide Stance Squat', 'Lateral Lunges',
  ],
  wrist: [
    'Barbell Curl', 'Front Squat', 'Clean and Press', 'Wrist Curls',
  ],
  elbow: [
    'Dips', 'Skull Crushers', 'Close-grip Bench Press',
    'Overhead Tricep Extension',
  ],
};

const EQUIPMENT_OPTIONS: Option[] = [
  { id: 'full_gym', label: 'Full Gym', detail: 'Barbells, machines, cables' },
  { id: 'home_gym', label: 'Home Gym', detail: 'Rack, bench, barbell' },
  { id: 'dumbbells', label: 'Dumbbells Only', detail: 'Adjustable or fixed set' },
  { id: 'bodyweight', label: 'Bodyweight', detail: 'No equipment needed' },
];

const DEFAULT_EXCLUDED: string[] = [
  'Back Squat', 'Deadlift', 'Bench Press', 'Overhead Press',
  'Pull-ups', 'Dips', 'Lunges', 'Romanian Deadlift',
  'Good Mornings', 'Hip Thrust',
];

/** Primary muscle context for "Exercises to Avoid" chips (custom entries fall back to "General"). */
const EXERCISE_MUSCLE_GROUP_LABEL: Record<string, string> = {
  'Overhead Press': 'Shoulders',
  'Behind-the-neck Press': 'Shoulders',
  'Upright Rows': 'Shoulders',
  'Lateral Raises': 'Shoulders',
  'Arnold Press': 'Shoulders',
  'Deadlift': 'Posterior Chain',
  'Good Mornings': 'Hamstrings / Lower Back',
  'Back Squat': 'Quads / Glutes',
  'Romanian Deadlift': 'Hamstrings',
  'Barbell Row': 'Back',
  'Lunges': 'Quads / Glutes',
  'Leg Press': 'Quads',
  'Box Jumps': 'Quads / Calves',
  'Step-ups': 'Quads / Glutes',
  'Hip Thrust': 'Glutes',
  'Sumo Deadlift': 'Posterior Chain',
  'Wide Stance Squat': 'Quads / Glutes',
  'Lateral Lunges': 'Glutes / Quads',
  'Barbell Curl': 'Biceps',
  'Front Squat': 'Quads',
  'Clean and Press': 'Full Body',
  'Wrist Curls': 'Forearms',
  'Dips': 'Chest / Triceps',
  'Skull Crushers': 'Triceps',
  'Close-grip Bench Press': 'Chest / Triceps',
  'Overhead Tricep Extension': 'Triceps',
  'Bench Press': 'Chest',
  'Pull-ups': 'Back',
  'Lat Pulldown': 'Back',
};

function muscleGroupLabelForExercise(name: string): string {
  return EXERCISE_MUSCLE_GROUP_LABEL[name] ?? 'General';
}

const WARNING_BORDER = `${Colors.warning}40`;

export default function ConstraintsScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const insets = useSafeAreaInsets();

  const [injuries, setInjuries] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [excludedExercises, setExcludedExercises] = useState<string[]>([]);
  const [availableExcluded, setAvailableExcluded] = useState<string[]>(DEFAULT_EXCLUDED);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customExercise, setCustomExercise] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);

  const canContinue = !!equipment;

  const allInjuryExclusions = Object.values(INJURY_EXCLUSIONS).flat();

  const toggleInjury = (id: string) => {
    setInjuries((prev) => {
      const updated = prev.includes(id)
        ? prev.filter((i) => i !== id)
        : [...prev, id];

      const autoExcluded = updated.flatMap((i) => INJURY_EXCLUSIONS[i] || []);

      setExcludedExercises((prevExcluded) => {
        const manual = prevExcluded.filter(
          (e) => !allInjuryExclusions.includes(e),
        );
        return [...new Set([...manual, ...autoExcluded])];
      });

      return updated;
    });
  };

  const toggleExcluded = (exercise: string) => {
    setExcludedExercises((prev) =>
      prev.includes(exercise)
        ? prev.filter((e) => e !== exercise)
        : [...prev, exercise],
    );
  };

  const addCustomExercise = () => {
    const trimmed = customExercise.trim();
    if (!trimmed) return;
    if (!availableExcluded.includes(trimmed)) {
      setAvailableExcluded((prev) => [...prev, trimmed]);
    }
    if (!excludedExercises.includes(trimmed)) {
      setExcludedExercises((prev) => [...prev, trimmed]);
    }
    setCustomExercise('');
    setShowCustomInput(false);
  };

  const handleContinue = () => {
    if (!canContinue) return;
    console.log('[Constraints] duration in params:', {
      planDuration: route.params.planDuration,
      recommendedWeeks: route.params.recommendedWeeks,
      targetDate: route.params.targetDate,
    });
    navigation.navigate('BodyMetrics', {
      ...route.params,
      injuries,
      equipment: equipment!,
      excludedExercises,
      concurrentSport: null,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backHit}
          activeOpacity={0.7}
        >
          <Text style={styles.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={styles.stepHeaderTrailing}>
          <Text style={styles.stepIndicator}>5 of 8</Text>
          <TouchableOpacity
            onPress={() => setShowFeedback(true)}
            style={styles.feedbackLink}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.feedbackLinkText}>Feedback</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBlock}>
          <Text style={styles.screenTitle}>Equipment</Text>
          <Text style={styles.screenSubtitle}>
            What do you have access to?
          </Text>
        </View>

        <View style={styles.cardsContainer}>
          {EQUIPMENT_OPTIONS.map((opt) => {
            const selected = equipment === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                style={[
                  styles.equipCard,
                  selected && styles.equipCardSelected,
                ]}
                onPress={() => setEquipment(opt.id)}
              >
                <Text style={styles.equipCardLabel}>{opt.label}</Text>
                {opt.detail ? (
                  <Text style={styles.equipCardDetail}>{opt.detail}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionHeading}>Current Injuries</Text>
        <Text style={styles.sectionCaption}>
          We'll automatically remove movements that could aggravate these.
        </Text>
        <View style={styles.chipRow}>
          {INJURY_OPTIONS.map((opt) => {
            const selected = injuries.includes(opt.id);
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => toggleInjury(opt.id)}
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
        {injuries.length > 0 && (
          <View style={styles.autoExclusionCard}>
            <Text style={styles.autoExclusionText}>
              {'Based on your injuries, we\'ve avoided: '}
              {[...new Set(injuries.flatMap((i) => INJURY_EXCLUSIONS[i] || []))].join(', ')}
            </Text>
          </View>
        )}

        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionHeadingLabel}>Exercises to Avoid</Text>
          <InfoTooltip
            title="Why exclude exercises?"
            content="Excluded exercises will never appear in your plan as main lifts or alternate options. Use this for movements that cause pain, that you lack equipment for, or that you simply don't want to do."
          />
        </View>
        <Text style={styles.sectionCaption}>
          Select any exercises you can't or don't want to do (optional)
        </Text>
        <View style={styles.chipRow}>
          {availableExcluded.map((exercise) => {
            const selected = excludedExercises.includes(exercise);
            return (
              <TouchableOpacity
                key={exercise}
                activeOpacity={0.7}
                style={[styles.chip, styles.avoidExerciseChip, selected && styles.chipSelected]}
                onPress={() => toggleExcluded(exercise)}
              >
                <Text
                  style={[styles.chipText, selected && styles.chipTextSelected]}
                >
                  {exercise}
                </Text>
                <Text style={styles.chipMuscleSub}>
                  {muscleGroupLabelForExercise(exercise)}
                </Text>
              </TouchableOpacity>
            );
          })}

          {!showCustomInput && (
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.chipAdd}
              onPress={() => setShowCustomInput(true)}
            >
              <Text style={styles.chipAddText}>+ Add custom exercise</Text>
            </TouchableOpacity>
          )}
        </View>

        {showCustomInput && (
          <View style={styles.customInputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Exercise name"
              placeholderTextColor={Colors.textTertiary}
              value={customExercise}
              onChangeText={setCustomExercise}
              onSubmitEditing={addCustomExercise}
              autoFocus
              returnKeyType="done"
            />
            <TouchableOpacity
              activeOpacity={0.7}
              style={[
                styles.addBtn,
                !customExercise.trim() && styles.addBtnDisabled,
              ]}
              onPress={addCustomExercise}
              disabled={!customExercise.trim()}
            >
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.cancelBtn}
              onPress={() => {
                setShowCustomInput(false);
                setCustomExercise('');
              }}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Spacing.xxxl + insets.bottom },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.button, !canContinue && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
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
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  backHit: {
    paddingRight: 8,
  },
  backArrow: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    color: Colors.accent,
  },
  stepIndicator: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },
  stepHeaderTrailing: {
    alignItems: 'flex-end',
  },
  feedbackLink: {
    marginTop: Spacing.xs,
  },
  feedbackLinkText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 120,
  },

  titleBlock: {
    marginTop: 56,
  },
  screenTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
  },
  screenSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginTop: 8,
    marginBottom: 32,
  },

  sectionHeading: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 4,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 4,
  },
  sectionHeadingLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    flex: 1,
    marginRight: Spacing.sm,
  },
  sectionCaption: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: 12,
  },

  cardsContainer: {
    gap: 0,
  },
  equipCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  equipCardSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
  },
  equipCardLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  equipCardDetail: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginBottom: -4,
  },
  chip: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: 14,
    paddingVertical: 8,
    margin: 4,
  },
  avoidExerciseChip: {
    alignItems: 'center',
  },
  chipMuscleSub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    marginTop: 2,
    textAlign: 'center',
  },
  chipSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  chipTextSelected: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },

  chipAdd: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    margin: 4,
    justifyContent: 'center',
  },
  chipAddText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },

  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  textInput: {
    fontFamily: Fonts.regular,
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
  },
  addBtnDisabled: {
    opacity: 0.4,
  },
  addBtnText: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
  },
  cancelBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  cancelBtnText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },

  autoExclusionCard: {
    backgroundColor: Colors.warningMuted,
    borderWidth: 1,
    borderColor: WARNING_BORDER,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginTop: Spacing.sm,
  },
  autoExclusionText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.bgPrimary,
  },
  button: {
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
});

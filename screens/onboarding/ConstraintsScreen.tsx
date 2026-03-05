import { useState } from 'react';
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
const DANGER_RED = '#EF4444';
const DANGER_BG = 'rgba(239,68,68,0.12)';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const DISABLED_BG = '#334155';

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

const WEAK_POINT_OPTIONS: string[] = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms',
  'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Traps',
];

const DEFAULT_EXCLUDED: string[] = [
  'Back Squat', 'Deadlift', 'Bench Press', 'Overhead Press',
  'Pull-ups', 'Dips', 'Lunges', 'Romanian Deadlift',
  'Good Mornings', 'Hip Thrust',
];

export default function ConstraintsScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const {
    goal,
    targetLift,
    current1RM,
    target1RM,
    priorityMuscles,
    targetWeightLbs,
    targetDate,
    targetBodyFatPct,
    experience,
    daysPerWeek,
    sessionLength,
    split,
  } = route.params;

  const [injuries, setInjuries] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [weakPoints, setWeakPoints] = useState<string[]>([]);
  const [excludedExercises, setExcludedExercises] = useState<string[]>([]);
  const [availableExcluded, setAvailableExcluded] = useState<string[]>(DEFAULT_EXCLUDED);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customExercise, setCustomExercise] = useState('');

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

  const toggleWeakPoint = (point: string) => {
    setWeakPoints((prev) =>
      prev.includes(point) ? prev.filter((p) => p !== point) : [...prev, point],
    );
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
    navigation.navigate('BodyMetrics', {
      goal,
      targetLift,
      current1RM,
      target1RM,
      priorityMuscles,
      targetWeightLbs,
      targetDate,
      targetBodyFatPct,
      experience,
      daysPerWeek,
      sessionLength,
      split,
      injuries,
      equipment: equipment!,
      weakPoints,
      excludedExercises,
    });
  };

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={styles.progressFill} />
      </View>

      {/* Header row */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Text style={styles.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>Step 4 of 7</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Section 1 — Equipment */}
        <Text style={styles.heading}>Equipment</Text>
        <Text style={styles.subtitle}>What do you have access to?</Text>

        <View style={styles.cardsContainer}>
          {EQUIPMENT_OPTIONS.map((opt) => {
            const selected = equipment === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                style={[styles.card, selected && styles.cardSelected]}
                onPress={() => setEquipment(opt.id)}
              >
                <View style={styles.cardContent}>
                  <Text style={styles.cardLabel}>{opt.label}</Text>
                  {opt.detail && (
                    <Text style={styles.cardDetail}>{opt.detail}</Text>
                  )}
                </View>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Section 2 — Lagging Areas */}
        <View style={styles.headingRow}>
          <Text style={[styles.heading, styles.sectionGap]}>Lagging Areas</Text>
          <InfoTooltip
            title="What are lagging areas?"
            content="Lagging areas are muscle groups that are underdeveloped relative to the rest of your physique. Your coach will add extra sets and frequency to these muscles throughout your plan."
          />
        </View>
        <Text style={styles.subtitle}>
          Any muscle groups you want to prioritise? (optional)
        </Text>
        <View style={styles.chipRow}>
          {WEAK_POINT_OPTIONS.map((point) => {
            const selected = weakPoints.includes(point);
            return (
              <TouchableOpacity
                key={point}
                activeOpacity={0.7}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => toggleWeakPoint(point)}
              >
                <Text
                  style={[styles.chipText, selected && styles.chipTextSelected]}
                >
                  {point}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Section 3 — Current Injuries */}
        <Text style={[styles.heading, styles.sectionGap]}>Current Injuries</Text>
        <Text style={styles.subtitle}>
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
          <View style={styles.injuryFeedbackCard}>
            <Text style={styles.injuryFeedbackText}>
              {'Based on your injuries, we\'ve avoided: '}
              {[...new Set(injuries.flatMap((i) => INJURY_EXCLUSIONS[i] || []))].join(', ')}
            </Text>
          </View>
        )}

        {/* Section 4 — Exercises to Avoid */}
        <View style={styles.headingRow}>
          <Text style={[styles.heading, styles.sectionGap]}>
            Exercises to Avoid
          </Text>
          <InfoTooltip
            title="Why exclude exercises?"
            content="Excluded exercises will never appear in your plan — not even as alternatives. Use this for movements that cause pain, that you lack equipment for, or that you simply don't want to do."
          />
        </View>
        <Text style={styles.subtitle}>
          Select any exercises you can't or don't want to do (optional)
        </Text>
        <View style={styles.chipRow}>
          {availableExcluded.map((exercise) => {
            const selected = excludedExercises.includes(exercise);
            return (
              <TouchableOpacity
                key={exercise}
                activeOpacity={0.7}
                style={[
                  styles.chip,
                  selected && styles.chipDanger,
                ]}
                onPress={() => toggleExcluded(exercise)}
              >
                <Text
                  style={[
                    styles.chipText,
                    selected && styles.chipTextDanger,
                  ]}
                >
                  {exercise}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Add custom exercise chip */}
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
              placeholderTextColor={TEXT_SECONDARY}
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

      {/* Fixed footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.button, !canContinue && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
        >
          <Text
            style={[
              styles.buttonText,
              !canContinue && styles.buttonTextDisabled,
            ]}
          >
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
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
    width: '57.1%',
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

  /* Sections */
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    marginBottom: 16,
  },
  sectionGap: {
    marginTop: 32,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  /* Cards (equipment section) */
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

  /* Chips (weak points + default style) */
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

  /* Danger chips (exercises to avoid) */
  chipDanger: {
    borderColor: DANGER_RED,
    backgroundColor: DANGER_BG,
  },
  chipTextDanger: {
    color: DANGER_RED,
  },

  /* Add-custom chip */
  chipAdd: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: CARD_BG,
    borderWidth: 2,
    borderColor: DISABLED_BG,
    borderStyle: 'dashed',
  },
  chipAddText: {
    fontSize: 15,
    fontWeight: '500',
    color: TEXT_SECONDARY,
  },

  /* Custom exercise input row */
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  textInput: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: TEXT_PRIMARY,
    borderWidth: 2,
    borderColor: ACCENT_BLUE,
  },
  addBtn: {
    backgroundColor: ACCENT_BLUE,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addBtnDisabled: {
    backgroundColor: DISABLED_BG,
  },
  addBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cancelBtnText: {
    fontSize: 15,
    color: TEXT_SECONDARY,
  },

  /* Injury feedback card */
  injuryFeedbackCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  injuryFeedbackText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 18,
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

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
import { Colors } from '../../constants/design';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'BodyMetrics'>;
type RouteType = RouteProp<RootStackParamList, 'BodyMetrics'>;

interface SexOption {
  id: string;
  label: string;
}

const SEX_OPTIONS: SexOption[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export default function BodyMetricsScreen() {
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
    injuries,
    equipment,
    weakPoints,
    excludedExercises,
  } = route.params;

  const [sex, setSex] = useState<string | null>(null);
  const [age, setAge] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState('');

  const canContinue =
    sex !== null &&
    age.trim() !== '' &&
    heightFt.trim() !== '' &&
    heightIn.trim() !== '' &&
    weightLbs.trim() !== '';

  const handleContinue = () => {
    if (!canContinue) return;
    navigation.navigate('MacroSetup', {
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
      equipment,
      weakPoints,
      excludedExercises,
      age: age.trim(),
      sex: sex!,
      heightFt: heightFt.trim(),
      heightIn: heightIn.trim(),
      weightLbs: weightLbs.trim(),
      bodyFatPct: bodyFatPct.trim() || null,
    });
  };

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={styles.progressFill} />
      </View>

      {/* Header row: back button + step label */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Text style={styles.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>Step 5 of 7</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Section 1 — Biological Sex */}
        <Text style={styles.heading}>Biological Sex</Text>
        <Text style={styles.subtitle}>Used to calibrate your fitness metrics.</Text>
        <View style={styles.cardsContainer}>
          {SEX_OPTIONS.map((opt) => {
            const selected = sex === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                style={[styles.card, selected && styles.cardSelected]}
                onPress={() => setSex(opt.id)}
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

        {/* Section 2 — Age */}
        <Text style={[styles.heading, styles.sectionGap]}>Age</Text>
        <Text style={styles.subtitle}>How old are you?</Text>
        <View style={styles.inputCard}>
          <TextInput
            style={styles.input}
            value={age}
            onChangeText={setAge}
            keyboardType="numeric"
            placeholder="e.g. 28"
            placeholderTextColor={Colors.textSecondary}
            maxLength={3}
            returnKeyType="done"
          />
        </View>

        {/* Section 3 — Height & Weight */}
        <Text style={[styles.heading, styles.sectionGap]}>Height & Weight</Text>
        <Text style={styles.subtitle}>Enter your measurements.</Text>
        <View style={styles.metricsStack}>
          {/* Height card */}
          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>Height</Text>
            <View style={styles.unitRow}>
              <TextInput
                style={styles.heightFixedInput}
                value={heightFt}
                onChangeText={setHeightFt}
                keyboardType="numeric"
                placeholder="5"
                placeholderTextColor={Colors.textSecondary}
                maxLength={1}
                returnKeyType="done"
              />
              <Text style={styles.unitLabel}>ft</Text>
              <TextInput
                style={[styles.heightFixedInput, styles.heightInInput]}
                value={heightIn}
                onChangeText={setHeightIn}
                keyboardType="numeric"
                placeholder="11"
                placeholderTextColor={Colors.textSecondary}
                maxLength={2}
                returnKeyType="done"
              />
              <Text style={styles.unitLabel}>in</Text>
            </View>
          </View>
          {/* Weight card */}
          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>Weight</Text>
            <View style={styles.unitRow}>
              <TextInput
                style={[styles.input, styles.flex1]}
                value={weightLbs}
                onChangeText={setWeightLbs}
                keyboardType="numeric"
                placeholder="185"
                placeholderTextColor={Colors.textSecondary}
                maxLength={4}
                returnKeyType="done"
              />
              <Text style={styles.unitLabel}>lbs</Text>
            </View>
          </View>
        </View>

        {/* Section 4 — Body Fat % (Optional) */}
        <View style={styles.headingRow}>
          <Text style={[styles.heading, styles.sectionGap]}>Body Fat %</Text>
          <InfoTooltip
            title="How to estimate body fat"
            content="If you're lean with visible abs: 10–15%. Average build with some muscle definition: 15–20%. Soft build with little definition: 20–30%+. Women add approximately 8–10% to each range. Leave blank and we'll estimate from your other stats."
          />
        </View>
        <Text style={styles.subtitle}>Optional — estimate is fine.</Text>
        <View style={styles.inputCard}>
          <TextInput
            style={styles.input}
            value={bodyFatPct}
            onChangeText={setBodyFatPct}
            keyboardType="numeric"
            placeholder="e.g. 18"
            placeholderTextColor={Colors.textSecondary}
            maxLength={4}
            returnKeyType="done"
          />
        </View>
        <Text style={styles.helperText}>Not sure? Leave blank and we'll estimate.</Text>
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
    backgroundColor: Colors.bgPrimary,
  },

  /* Progress */
  progressBar: {
    height: 4,
    backgroundColor: Colors.bgCard,
    borderRadius: 2,
    marginHorizontal: 24,
    marginTop: 60,
  },
  progressFill: {
    width: '71.4%',
    height: '100%',
    backgroundColor: Colors.accent,
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
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  backArrow: {
    fontSize: 22,
    color: Colors.textPrimary,
    marginTop: -2,
  },
  stepLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
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
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  sectionGap: {
    marginTop: 32,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  /* Cards (sex section) */
  cardsContainer: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentMuted,
  },
  cardContent: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: Colors.accent,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.accent,
  },

  /* Text inputs */
  inputCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  input: {
    fontSize: 17,
    color: Colors.textPrimary,
    paddingVertical: 12,
  },
  inputLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 10,
    marginBottom: -4,
  },

  /* Height & Weight stacked cards */
  metricsStack: {
    gap: 12,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unitLabel: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginLeft: 2,
  },
  heightFixedInput: {
    width: 40,
    fontSize: 17,
    color: Colors.textPrimary,
    paddingVertical: 12,
  },
  heightInInput: {
    marginLeft: 12,
  },
  flex1: {
    flex: 1,
  },

  /* Helper text */
  helperText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 8,
    marginLeft: 4,
  },

  /* Footer */
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    backgroundColor: Colors.bgPrimary,
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: Colors.divider,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  buttonTextDisabled: {
    color: Colors.textSecondary,
  },
});

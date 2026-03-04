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

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const CARD_SELECTED_BG = 'rgba(59,130,246,0.12)';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const DISABLED_BG = '#334155';

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
        <Text style={styles.stepLabel}>Step 4 of 6</Text>
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
            placeholderTextColor={TEXT_SECONDARY}
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
                placeholderTextColor={TEXT_SECONDARY}
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
                placeholderTextColor={TEXT_SECONDARY}
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
                placeholderTextColor={TEXT_SECONDARY}
                maxLength={4}
                returnKeyType="done"
              />
              <Text style={styles.unitLabel}>lbs</Text>
            </View>
          </View>
        </View>

        {/* Section 4 — Body Fat % (Optional) */}
        <Text style={[styles.heading, styles.sectionGap]}>Body Fat %</Text>
        <Text style={styles.subtitle}>Optional — estimate is fine.</Text>
        <View style={styles.inputCard}>
          <TextInput
            style={styles.input}
            value={bodyFatPct}
            onChangeText={setBodyFatPct}
            keyboardType="numeric"
            placeholder="e.g. 18"
            placeholderTextColor={TEXT_SECONDARY}
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
    width: '66.6%',
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

  /* Cards (sex section) */
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

  /* Text inputs */
  inputCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  input: {
    fontSize: 17,
    color: TEXT_PRIMARY,
    paddingVertical: 12,
  },
  inputLabel: {
    fontSize: 12,
    color: TEXT_SECONDARY,
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
    color: TEXT_SECONDARY,
    marginLeft: 2,
  },
  heightFixedInput: {
    width: 40,
    fontSize: 17,
    color: TEXT_PRIMARY,
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
    color: TEXT_SECONDARY,
    marginTop: 8,
    marginLeft: 4,
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

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import InfoTooltip from '../../components/InfoTooltip';
import { Colors, Fonts, FontSizes } from '../../constants/design';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Experience'>;
type RouteType = RouteProp<RootStackParamList, 'Experience'>;

interface Option {
  id: string;
  label: string;
  detail?: string;
}

const EXPERIENCE_OPTIONS: Option[] = [
  { id: 'beginner', label: 'Beginner', detail: 'Less than 1 year' },
  { id: 'intermediate', label: 'Intermediate', detail: '1–3 years' },
  { id: 'advanced', label: 'Advanced', detail: '3+ years' },
];

const DAYS_OPTIONS: Option[] = [
  { id: '3', label: '3 days' },
  { id: '4', label: '4 days' },
  { id: '5', label: '5 days' },
  { id: '6', label: '6 days' },
];

const DURATION_OPTIONS: Option[] = [
  { id: '30-45', label: '30–45 mins' },
  { id: '45-60', label: '45–60 mins' },
  { id: '60-90', label: '60–90 mins' },
  { id: '90+', label: '90+ mins' },
];

const SPLIT_OPTIONS: Option[] = [
  { id: 'ppl', label: 'Push / Pull / Legs' },
  { id: 'upper_lower', label: 'Upper / Lower' },
  { id: 'full_body', label: 'Full Body' },
  { id: 'bro_split', label: 'Bro Split' },
  { id: 'custom', label: 'Custom' },
];

export default function ExperienceScreen() {
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
  } = route.params;

  const [experience, setExperience] = useState<string | null>(null);
  const [daysPerWeek, setDaysPerWeek] = useState<string | null>(null);
  const [sessionLength, setSessionLength] = useState<string | null>(null);
  const [split, setSplit] = useState<string | null>(null);

  const allSelected = experience && daysPerWeek && sessionLength && split;

  const handleContinue = () => {
    if (!allSelected) return;
    navigation.navigate('Constraints', {
      goal,
      targetLift,
      current1RM,
      target1RM,
      priorityMuscles,
      targetWeightLbs,
      targetDate,
      targetBodyFatPct,
      experience: experience!,
      daysPerWeek: daysPerWeek!,
      sessionLength: sessionLength!,
      split: split!,
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
        <Text style={styles.stepLabel}>Step 3 of 7</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Section 1 — Training Experience */}
        <Text style={styles.heading}>Training Experience</Text>
        <Text style={styles.subtitle}>How long have you been training?</Text>
        <View style={styles.cardsContainer}>
          {EXPERIENCE_OPTIONS.map((opt) => {
            const selected = experience === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                style={[styles.card, selected && styles.cardSelected]}
                onPress={() => setExperience(opt.id)}
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

        {/* Section 2 — Days per week */}
        <Text style={[styles.heading, styles.sectionGap]}>Days per week</Text>
        <Text style={styles.subtitle}>How many days can you train?</Text>
        <View style={styles.chipRow}>
          {DAYS_OPTIONS.map((opt) => {
            const selected = daysPerWeek === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setDaysPerWeek(opt.id)}
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

        {/* Section 3 — Session length */}
        <Text style={[styles.heading, styles.sectionGap]}>Session length</Text>
        <Text style={styles.subtitle}>How long is a typical session?</Text>
        <View style={styles.chipRow}>
          {DURATION_OPTIONS.map((opt) => {
            const selected = sessionLength === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setSessionLength(opt.id)}
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

        {/* Section 4 — Training Split */}
        <View style={styles.headingRow}>
          <Text style={[styles.heading, styles.sectionGap]}>Training Split</Text>
          <InfoTooltip
            title="What's a training split?"
            content="A training split defines how you divide muscle groups across your weekly sessions. Push/Pull/Legs is the most popular for intermediate lifters. Upper/Lower suits those training 4 days. Full Body works best for 3 days/week."
          />
        </View>
        <Text style={styles.subtitle}>
          How do you prefer to structure your training?
        </Text>
        <View style={styles.chipRow}>
          {SPLIT_OPTIONS.map((opt) => {
            const selected = split === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setSplit(opt.id)}
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
        <Text style={styles.splitHint}>
          Not sure? Push / Pull / Legs is a great default for most goals.
        </Text>
      </ScrollView>

      {/* Fixed footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.button, !allSelected && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!allSelected}
        >
          <Text
            style={[
              styles.buttonText,
              !allSelected && styles.buttonTextDisabled,
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
    width: '42.8%',
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
    fontFamily: Fonts.regular,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
    marginTop: -2,
  },
  stepLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
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
    fontSize: FontSizes.heading1,
    fontFamily: Fonts.bold, 
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
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

  /* Cards (experience section) */
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
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold, 
    color: Colors.textPrimary,
  },
  cardDetail: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
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

  /* Chips (days + session length) */
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.bgCard,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentMuted,
  },
  chipText: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.medium, 
    color: Colors.textSecondary,
  },
  chipTextSelected: {
    color: Colors.textPrimary,
  },
  splitHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 10,
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
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold, 
    color: Colors.textPrimary,
  },
  buttonTextDisabled: {
    color: Colors.textSecondary,
  },
});

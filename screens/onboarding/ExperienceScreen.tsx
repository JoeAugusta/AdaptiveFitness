import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';

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

const SPLIT_INFO_TITLE = "What's a training split?";
const SPLIT_INFO_BODY =
  'A training split defines how you divide muscle groups across your weekly sessions. Push/Pull/Legs is the most popular for intermediate lifters. Upper/Lower suits those training 4 days. Full Body works best for 3 days/week.';

export default function ExperienceScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const insets = useSafeAreaInsets();
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
  const [splitInfoVisible, setSplitInfoVisible] = useState(false);

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backHit}
          activeOpacity={0.7}
        >
          <Text style={styles.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.stepIndicator}>3 of 7</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBlock}>
          <Text style={styles.screenTitle}>Training Experience</Text>
          <Text style={styles.screenSubtitle}>
            How long have you been training?
          </Text>
        </View>

        <View style={styles.cardsContainer}>
          {EXPERIENCE_OPTIONS.map((opt) => {
            const selected = experience === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                style={[styles.expCard, selected && styles.expCardSelected]}
                onPress={() => setExperience(opt.id)}
              >
                <Text style={styles.expCardLabel}>{opt.label}</Text>
                {opt.detail ? (
                  <Text style={styles.expCardDetail}>{opt.detail}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionHeading}>Days per week</Text>
        <Text style={styles.sectionSubtitle}>
          How many days can you train?
        </Text>
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

        <Text style={styles.sectionHeading}>Session length</Text>
        <Text style={styles.sectionSubtitle}>
          How long is a typical session?
        </Text>
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

        <View style={styles.splitHeadingRow}>
          <Text style={styles.sectionHeadingLabel}>Training Split</Text>
          <TouchableOpacity
            onPress={() => setSplitInfoVisible(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.splitInfoIcon}>ⓘ</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionSubtitle}>
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

      <View
        style={[
          styles.footer,
          { paddingBottom: Spacing.xxxl + insets.bottom },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.button, !allSelected && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!allSelected}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={splitInfoVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setSplitInfoVisible(false)}
      >
        <View style={styles.modalRoot}>
          <TouchableWithoutFeedback
            onPress={() => setSplitInfoVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>
          <View style={styles.modalCard} pointerEvents="box-none">
            <Text style={styles.modalTitle}>{SPLIT_INFO_TITLE}</Text>
            <Text style={styles.modalBody}>{SPLIT_INFO_BODY}</Text>
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.modalButton}
              onPress={() => setSplitInfoVisible(false)}
            >
              <Text style={styles.modalButtonLabel}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    marginBottom: 12,
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
  splitHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 12,
  },
  splitInfoIcon: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  sectionSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginBottom: 12,
    marginTop: 0,
  },

  cardsContainer: {
    gap: Spacing.sm,
  },
  expCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
  },
  expCardSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
  },
  expCardLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  expCardDetail: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
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

  splitHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
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

  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  modalCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.xl,
    padding: Spacing.xxl,
  },
  modalTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },
  modalBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginTop: 12,
  },
  modalButton: {
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  modalButtonLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
});

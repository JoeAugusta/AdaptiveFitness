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

interface SplitRecommendation {
  splitId: string;
  reason: string;
  warning?: string;
}

function getRecommendedSplit(
  goal: string,
  days: string,
  targetLift?: string,
): SplitRecommendation {
  const d = parseInt(days);
  const lift = targetLift?.replace(/_/g, ' ') ?? 'your target lift';

  if (goal === 'strength') {
    if (d <= 3) {
      return {
        splitId: 'upper_lower',
        reason: `Upper/Lower lets ${lift} appear twice per week — essential for 1RM progression.`,
        warning: `PPL with 3 days means ${lift} only appears once per week. Upper/Lower gives you twice the practice on your target lift.`,
      };
    }
    if (d === 4) {
      return {
        splitId: 'upper_lower',
        reason: `Upper/Lower A/B gives you two ${lift} sessions per week at different intensities — heavy and volume.`,
        warning: `PPL works at 4 days but Upper/Lower puts ${lift} on both upper days, giving you twice the weekly exposure to your target movement.`,
      };
    }
    // 5-6 days
    return {
      splitId: 'ppl',
      reason: `PPL at ${d} days gives you two push sessions per week — one heavy, one volume — ideal for ${lift} progression.`,
      warning: `Upper/Lower works well too at ${d} days. PPL is slightly better for strength specialisation as it dedicates full sessions to your target movement pattern.`,
    };
  }

  if (goal === 'hypertrophy') {
    if (d <= 3) {
      return {
        splitId: 'full_body',
        reason: 'Full Body hits every muscle group 3x per week — optimal frequency for muscle growth at 3 days.',
        warning: 'PPL with 3 days means each muscle only gets hit once per week. Full Body gives 3x the weekly stimulus for the same number of sessions.',
      };
    }
    if (d === 4) {
      return {
        splitId: 'upper_lower',
        reason: 'Upper/Lower gives each muscle 2x weekly frequency — the sweet spot for hypertrophy at 4 days.',
        warning: 'PPL works well at 4 days too — slightly less weekly frequency per muscle but higher volume per session. Both are solid choices.',
      };
    }
    // 5-6 days
    return {
      splitId: 'ppl',
      reason: `PPL at ${d} days gives high volume per muscle group with full recovery between sessions — ideal for hypertrophy.`,
      warning: 'Upper/Lower at this frequency can work but PPL keeps volume per session higher, which is better for hypertrophy stimulus.',
    };
  }

  if (goal === 'recomp') {
    if (d <= 3) {
      return {
        splitId: 'full_body',
        reason: 'Full Body sessions maximise caloric burn while hitting every muscle — ideal for recomposition at 3 days.',
        warning: 'PPL means each muscle only gets hit once per week. Full Body keeps frequency high while burning more calories per session.',
      };
    }
    return {
      splitId: 'upper_lower',
      reason: 'Upper/Lower keeps intensity high and frequency balanced — effective for building muscle while in a slight deficit.',
      warning: 'PPL is a reasonable choice. Upper/Lower gives slightly more weekly frequency per muscle which helps maintain muscle during a deficit.',
    };
  }

  if (goal === 'fat_loss') {
    if (d <= 3) {
      return {
        splitId: 'full_body',
        reason: 'Full Body sessions burn significantly more calories and keep muscle stimulus high across fewer days.',
        warning: 'PPL means each muscle only trains once per week. Full Body burns more calories per session and preserves more muscle during fat loss.',
      };
    }
    return {
      splitId: 'upper_lower',
      reason: 'Upper/Lower balances muscle preservation with caloric expenditure — each muscle trains twice weekly.',
      warning: 'PPL can work for fat loss but Full Body or Upper/Lower burns more calories per session and preserves more muscle.',
    };
  }

  // general
  if (d <= 3) {
    return {
      splitId: 'full_body',
      reason: 'Full Body is the most efficient way to build balanced fitness at 3 days — every session hits everything.',
      warning: 'PPL with 3 days means each muscle only trains once per week. Full Body gives more balanced stimulus for general fitness.',
    };
  }
  if (d === 4) {
    return {
      splitId: 'upper_lower',
      reason: 'Upper/Lower is the most balanced split for general fitness at 4 days — each muscle trains twice weekly.',
      warning: 'PPL works well at 4 days too. Upper/Lower is slightly more balanced for general fitness as it hits everything twice per week.',
    };
  }
  // 5-6 days
  return {
    splitId: 'ppl',
    reason: `PPL at ${d} days gives great volume distribution and recovery — solid for building overall fitness.`,
    warning: 'Upper/Lower works too at this frequency. PPL gives slightly more volume per session which can be better for strength and size.',
  };
}

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
  const [recommendation, setRecommendation] = useState<SplitRecommendation | null>(
    null,
  );
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
                onPress={() => {
                  setDaysPerWeek(opt.id);
                  const rec = getRecommendedSplit(goal, opt.id, targetLift);
                  setRecommendation(rec);
                  setSplit(rec.splitId);
                }}
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
        {recommendation && split ? (
          split === recommendation.splitId ? (
            <View style={styles.recommendCard}>
              <Text style={styles.recommendLabel}>JORDAN</Text>
              <Text style={styles.recommendText}>{recommendation.reason}</Text>
            </View>
          ) : recommendation.warning ? (
            <View style={styles.warningCard}>
              <Text style={styles.warningLabel}>JORDAN</Text>
              <Text style={styles.warningText}>{recommendation.warning}</Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setSplit(recommendation.splitId)}
                style={styles.warningRevertBtn}
              >
                <Text style={styles.warningRevertText}>
                  Switch to{' '}
                  {SPLIT_OPTIONS.find((s) => s.id === recommendation.splitId)
                    ?.label}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null
        ) : (
          <Text style={styles.splitHint}>
            Select days per week to get Jordan's recommendation.
          </Text>
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

  recommendCard: {
    marginTop: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.md,
  },
  recommendLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  recommendText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  warningCard: {
    marginTop: Spacing.md,
    backgroundColor: Colors.warningMuted,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: Spacing.md,
  },
  warningLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.warning,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  warningText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  warningRevertBtn: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
  },
  warningRevertText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.warning,
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

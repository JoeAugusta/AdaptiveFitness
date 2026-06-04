import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import InfoTooltip from '../../components/InfoTooltip';
import BetaFeedbackModal from '../../components/BetaFeedbackModal';
import { JordanAvatar } from '../../components/JordanAvatar';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';

const COLOR_PROTEIN = Colors.accent;
const COLOR_CARBS = Colors.warning;
const COLOR_FATS = Colors.success;

const PACE_CONFIG = {
  fat_loss: [
    {
      id: 'conservative',
      label: 'Conservative',
      adjustment: -250,
      sub: '−250 cal/day',
      note: 'Slower but easier to sustain',
    },
    {
      id: 'balanced',
      label: 'Balanced',
      adjustment: -400,
      sub: '−400 cal/day',
      note: 'Best for most people',
      default: true,
    },
    {
      id: 'aggressive',
      label: 'Aggressive',
      adjustment: -600,
      sub: '−600 cal/day',
      note: 'Fastest results, harder to sustain',
    },
  ],
  hypertrophy: [
    {
      id: 'conservative',
      label: 'Lean Bulk',
      adjustment: 200,
      sub: '+200 cal/day',
      note: 'Clean gains, minimal fat',
    },
    {
      id: 'balanced',
      label: 'Moderate',
      adjustment: 300,
      sub: '+300 cal/day',
      note: 'Best for most people',
      default: true,
    },
    {
      id: 'aggressive',
      label: 'Aggressive',
      adjustment: 500,
      sub: '+500 cal/day',
      note: 'Fastest gains, some fat gain',
    },
  ],
} as const;

const MIN_CALORIES = 1200;
const MAX_CALORIES = 5500;
const CALORIE_STEP = 50;

const MACRO_WEEKLY_ADJUST_NOTE =
  'These targets will adjust weekly based on your weight trend and performance data.';

const MACRO_INFO_BODY =
  'Protein is set at 1g per lb of bodyweight to maximise muscle retention. Fats cover 25% of calories for hormone health. Carbohydrates fill the remainder to fuel your training sessions.';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'MacroSetup'>;
type RouteType = RouteProp<RootStackParamList, 'MacroSetup'>;

function roundToNearest(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

function calcBaseMacros(
  calories: number,
  weightLbs: number,
  goal: string,
): { proteinG: number; carbsG: number; fatsG: number } {
  const proteinMultiplier = goal === 'fat_loss' ? 0.8 : 1.0;
  const proteinG = roundToNearest(weightLbs * proteinMultiplier, 5);
  const fatsG = Math.max(50, roundToNearest((calories * 0.25) / 9, 5));
  const remainingCals = calories - proteinG * 4 - fatsG * 9;
  const carbsG = roundToNearest(remainingCals / 4, 5);
  return { proteinG, carbsG, fatsG };
}

function calculateBMR(params: {
  weightLbs: number;
  heightFt: number;
  heightIn: number;
  age: number;
  sex: 'male' | 'female' | 'other';
  bodyFatPct?: number | null;
}): number {
  const weightKg = params.weightLbs * 0.453592;
  const heightCm =
    (params.heightFt * 12 + params.heightIn) * 2.54;

  // Katch-McArdle when body fat % is available
  if (
    params.bodyFatPct != null &&
    params.bodyFatPct > 0 &&
    params.bodyFatPct < 100
  ) {
    const leanMassKg = weightKg * (1 - params.bodyFatPct / 100);
    return 370 + 21.6 * leanMassKg;
  }

  // Fallback: Mifflin-St Jeor
  const base = 10 * weightKg + 6.25 * heightCm - 5 * params.age;
  if (params.sex === 'male') return base + 5;
  if (params.sex === 'female') return base - 161;
  return base - 78; // other: midpoint
}

function getActivityMultiplier(daysPerWeek: number): number {
  if (daysPerWeek <= 2) return 1.375;
  if (daysPerWeek <= 4) return 1.55;
  if (daysPerWeek <= 6) return 1.725;
  return 1.9;
}

function resolveTargetWeightLbs(params: RouteType['params']): number | null {
  const raw =
    params.goalTargetWeight?.trim() ||
    params.targetWeightLbs?.trim() ||
    '';
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function calculateCalorieAdjustment(params: {
  goalType: string;
  currentWeightLbs: number;
  targetWeightLbs: number | null;
}): number {
  const current = params.currentWeightLbs;
  const target = params.targetWeightLbs ?? current;
  const delta = target - current;

  const wantsToLose = delta < -2;
  const wantsToGain = delta > 2;

  // fat_loss always in deficit
  if (params.goalType === 'fat_loss') {
    return -400;
  }

  // recomp and general always maintenance
  if (params.goalType === 'recomp' || params.goalType === 'general') {
    return 0;
  }

  // strength, hypertrophy, power_hypertrophy: direction driven by weight goal
  if (wantsToLose) return -200;
  if (wantsToGain) {
    if (params.goalType === 'strength') return 200;
    if (params.goalType === 'hypertrophy') return 300;
    if (params.goalType === 'power_hypertrophy') return 250;
    return 200;
  }
  return 0; // maintaining
}

function computeTdee(params: RouteType['params']): number {
  const bodyFatRaw = params.bodyFatPct;
  const bodyFatPct =
    bodyFatRaw != null && bodyFatRaw !== ''
      ? Number(bodyFatRaw)
      : null;
  const sex =
    params.sex === 'male' || params.sex === 'female' || params.sex === 'other'
      ? params.sex
      : 'other';

  const bmr = calculateBMR({
    weightLbs: Number(params.weightLbs),
    heightFt: Number(params.heightFt),
    heightIn: Number(params.heightIn),
    age: Number(params.age),
    sex,
    bodyFatPct:
      bodyFatPct != null && Number.isFinite(bodyFatPct) ? bodyFatPct : null,
  });

  const daysPerWeek = Math.min(7, Math.max(1, Number(params.daysPerWeek) || 4));
  const activityMultiplier = getActivityMultiplier(daysPerWeek);

  return bmr * activityMultiplier;
}

function computeTargetCalories(
  params: RouteType['params'],
  caloriePace: string,
): number {
  const tdee = computeTdee(params);
  const currentWeightLbs = Number(params.weightLbs);
  const targetWeightLbs = resolveTargetWeightLbs(params);
  const goalAdjustment = calculateCalorieAdjustment({
    goalType: params.goal,
    currentWeightLbs,
    targetWeightLbs,
  });
  const paceAdjustment = (() => {
    const goalPaces = PACE_CONFIG[params.goal as keyof typeof PACE_CONFIG];
    if (!goalPaces) return goalAdjustment;
    return (
      goalPaces.find((p) => p.id === caloriePace)?.adjustment ?? goalAdjustment
    );
  })();
  const calories = Math.round((tdee + paceAdjustment) / 50) * 50;
  return Math.max(
    MIN_CALORIES,
    Math.min(MAX_CALORIES, calories),
  );
}

function formatGoalLabel(goal: string): string {
  switch (goal) {
    case 'fat_loss':
      return 'Fat Loss';
    case 'hypertrophy':
      return 'Hypertrophy';
    case 'strength':
      return 'Strength';
    case 'power_hypertrophy':
      return 'Strength & Size';
    case 'recomp':
      return 'Recomp';
    case 'general':
      return 'General Fitness';
    default:
      return goal.charAt(0).toUpperCase() + goal.slice(1);
  }
}

export default function MacroSetupScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const insets = useSafeAreaInsets();
  const params = route.params;

  const [caloriePace, setCaloriePace] = useState<string>('balanced');
  const [calories, setCalories] = useState(() =>
    computeTargetCalories(params, 'balanced'),
  );
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    const finalCalories = computeTargetCalories(params, caloriePace);
    setCalories(finalCalories);
    console.log('[MacroSetup] TDEE calculation:', {
      weightKg: Number(params.weightLbs) * 0.453592,
      heightCm:
        (Number(params.heightFt) * 12 + Number(params.heightIn)) * 2.54,
      age: params.age,
      sex: params.sex,
      daysPerWeek: params.daysPerWeek,
      goal: params.goal,
      tdee: computeTdee(params),
      goalAdjustment: calculateCalorieAdjustment({
        goalType: params.goal,
        currentWeightLbs: Number(params.weightLbs),
        targetWeightLbs: resolveTargetWeightLbs(params),
      }),
      finalCalories,
    });
  }, [caloriePace]);

  const { proteinG, carbsG, fatsG } = useMemo(
    () => calcBaseMacros(calories, Number(params.weightLbs), params.goal),
    [calories, params.goal, params.weightLbs],
  );

  const jordanCalorieNote = useMemo(() => {
    const currentWeightLbs = Number(params.weightLbs);
    const goalTargetWeight = resolveTargetWeightLbs(params);
    const targetWeight = goalTargetWeight ?? currentWeightLbs;
    const delta = targetWeight - currentWeightLbs;
    const goalType = params.goal;

    if (goalType === 'fat_loss' || delta < -2) {
      return (
        'Slight deficit to support fat loss while protecting your muscle. Protein ' +
        'stays high so lean mass is preserved during training.'
      );
    }
    if (delta > 2) {
      return (
        'Surplus calibrated for muscle building. Enough to fuel growth ' +
        'without excess fat gain.'
      );
    }
    return (
      'Maintenance calories — body recomposition focus. Weight stays ' +
      'steady while body composition shifts.'
    );
  }, [
    params.goal,
    params.weightLbs,
    params.goalTargetWeight,
    params.targetWeightLbs,
  ]);

  const handleDecrease = () => {
    setCalories((prev) => Math.max(MIN_CALORIES, prev - CALORIE_STEP));
  };

  const handleIncrease = () => {
    setCalories((prev) => Math.min(MAX_CALORIES, prev + CALORIE_STEP));
  };

  const handleContinue = () => {
    console.log('[MacroSetup] duration in params:', {
      planDuration: params.planDuration,
      recommendedWeeks: params.recommendedWeeks,
      targetDate: params.targetDate,
    });
    navigation.navigate('Pricing', {
      ...params,
      calories,
      proteinG,
      carbsG,
      fatsG,
      caloriePace,
    });
  };

  const decreaseDisabled = calories <= MIN_CALORIES;
  const increaseDisabled = calories >= MAX_CALORIES;

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
          <Text style={styles.stepIndicator}>7 of 8</Text>
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
          <Text style={styles.screenTitle}>Your Daily Targets</Text>
          <Text style={styles.screenSubtitle}>
            Review and adjust your calorie goal below.
          </Text>
        </View>

        <View style={styles.calorieCard}>
          <View style={styles.calorieLabelRow}>
            <Text style={styles.dailyCaloriesLabel}>Daily Calories</Text>
            <InfoTooltip
              title="How were these calculated?"
              content="Your calories are based on your Basal Metabolic Rate (BMR), the energy your body burns at rest, multiplied by your activity level to get your Total Daily Energy Expenditure (TDEE). We then adjust up or down based on your goal."
            />
          </View>
          <View style={styles.calorieValueRow}>
            <Text style={styles.calorieNumber}>{calories}</Text>
            <Text style={styles.calorieKcalSuffix}> kcal</Text>
          </View>
          <View style={styles.adjustRow}>
            <Pressable
              style={({ pressed }) => [
                styles.adjustButton,
                pressed && !decreaseDisabled && styles.adjustButtonPressed,
                decreaseDisabled && styles.adjustButtonDisabled,
              ]}
              onPress={handleDecrease}
              disabled={decreaseDisabled}
            >
              {({ pressed }) => (
                <Text
                  style={[
                    styles.adjustButtonLabel,
                    pressed &&
                      !decreaseDisabled &&
                      styles.adjustButtonLabelPressed,
                    decreaseDisabled && styles.adjustButtonLabelDisabled,
                  ]}
                >
                  − 50
                </Text>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.adjustButton,
                pressed && !increaseDisabled && styles.adjustButtonPressed,
                increaseDisabled && styles.adjustButtonDisabled,
              ]}
              onPress={handleIncrease}
              disabled={increaseDisabled}
            >
              {({ pressed }) => (
                <Text
                  style={[
                    styles.adjustButtonLabel,
                    pressed &&
                      !increaseDisabled &&
                      styles.adjustButtonLabelPressed,
                    increaseDisabled && styles.adjustButtonLabelDisabled,
                  ]}
                >
                  + 50
                </Text>
              )}
            </Pressable>
          </View>
          <Text style={styles.goalNote}>
            Based on your {formatGoalLabel(params.goal)} goal
          </Text>
        </View>

        <View style={styles.calorieDirectionCard}>
          <JordanAvatar size={20} />
          <Text style={styles.calorieDirectionText}>{jordanCalorieNote}</Text>
        </View>

        <Text style={styles.macroAdjustNote}>{MACRO_WEEKLY_ADJUST_NOTE}</Text>

        {(params.goal === 'fat_loss' || params.goal === 'hypertrophy') && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>
              PACE
            </Text>
            <View style={styles.paceRow}>
              {PACE_CONFIG[params.goal].map((pace) => (
                <Pressable
                  key={pace.id}
                  style={[
                    styles.paceCard,
                    caloriePace === pace.id && styles.paceCardActive,
                  ]}
                  onPress={() => setCaloriePace(pace.id)}
                >
                  <Text
                    style={[
                      styles.paceLabel,
                      caloriePace === pace.id && styles.paceLabelActive,
                    ]}
                  >
                    {pace.label}
                  </Text>
                  <Text style={styles.paceSub}>{pace.sub}</Text>
                  <Text style={styles.paceNote}>{pace.note}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <View style={styles.macroRow}>
          <View style={styles.macroCard}>
            <View style={styles.macroAmountRow}>
              <Text style={[styles.macroAmount, { color: COLOR_PROTEIN }]}>
                {proteinG}
              </Text>
              <Text style={[styles.macroGSuffix, { color: COLOR_PROTEIN }]}>
                g
              </Text>
            </View>
            <Text style={styles.macroName}>Protein</Text>
          </View>
          <View style={styles.macroCard}>
            <View style={styles.macroAmountRow}>
              <Text style={[styles.macroAmount, { color: COLOR_CARBS }]}>
                {carbsG}
              </Text>
              <Text style={[styles.macroGSuffix, { color: COLOR_CARBS }]}>
                g
              </Text>
            </View>
            <Text style={styles.macroName}>Carbs</Text>
          </View>
          <View style={styles.macroCard}>
            <View style={styles.macroAmountRow}>
              <Text style={[styles.macroAmount, { color: COLOR_FATS }]}>
                {fatsG}
              </Text>
              <Text style={[styles.macroGSuffix, { color: COLOR_FATS }]}>
                g
              </Text>
            </View>
            <Text style={styles.macroName}>Fats</Text>
          </View>
        </View>

        <Text style={styles.infoSectionHeading}>How are macros split?</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoCardText}>{MACRO_INFO_BODY}</Text>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Spacing.xxxl + insets.bottom },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.button}
          onPress={handleContinue}
        >
          <Text style={styles.buttonText}>Build My Plan</Text>
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

  calorieCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.xxl,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  calorieLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  dailyCaloriesLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  calorieValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 8,
  },
  calorieNumber: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.display,
    color: Colors.textPrimary,
  },
  calorieKcalSuffix: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  adjustRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  adjustButton: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  adjustButtonPressed: {
    borderColor: Colors.accent,
  },
  adjustButtonDisabled: {
    opacity: 0.35,
  },
  adjustButtonLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  adjustButtonLabelPressed: {
    color: Colors.accent,
  },
  adjustButtonLabelDisabled: {
    color: Colors.textSecondary,
  },
  goalNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 12,
    textAlign: 'center',
  },
  calorieDirectionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    padding: Spacing.md,
    backgroundColor: Colors.accentMuted,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accentBorder,
    borderRadius: Radius.md,
  },
  calorieDirectionText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  macroAdjustNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },

  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  paceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.md,
  },
  paceCard: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    backgroundColor: Colors.bgCard,
  },
  paceCardActive: {
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentMuted,
  },
  paceLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  paceLabelActive: {
    color: Colors.accent,
  },
  paceSub: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  paceNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    lineHeight: 14,
  },

  macroRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.md,
  },
  macroCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  macroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  macroAmount: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
  },
  macroGSuffix: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    marginLeft: 2,
  },
  macroName: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 4,
  },

  infoSectionHeading: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
  },
  infoCardText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
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
  buttonText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
});

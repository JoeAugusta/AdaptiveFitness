import { useMemo, useState } from 'react';
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
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';

const COLOR_PROTEIN = Colors.accent;
const COLOR_CARBS = Colors.warning;
const COLOR_FATS = Colors.success;

const MIN_CALORIES = 1200;
const MAX_CALORIES = 5000;
const CALORIE_STEP = 50;

const MACRO_INFO_BODY =
  'Protein is set at 1g per lb of bodyweight to maximise muscle retention. Fats cover 25% of calories for hormone health. Carbohydrates fill the remainder to fuel your training sessions.\n\nThese targets will adjust weekly based on your weight trend and performance data.';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'MacroSetup'>;
type RouteType = RouteProp<RootStackParamList, 'MacroSetup'>;

function roundToNearest(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

function calcBaseMacros(
  calories: number,
  weightLbs: number,
): { proteinG: number; carbsG: number; fatsG: number } {
  const proteinG = roundToNearest(weightLbs * 1.0, 5);
  const fatsG = roundToNearest((calories * 0.25) / 9, 5);
  const remainingCals = calories - proteinG * 4 - fatsG * 9;
  const carbsG = roundToNearest(remainingCals / 4, 5);
  return { proteinG, carbsG, fatsG };
}

function calcInitialCalories(params: RouteType['params']): number {
  const heightCm =
    (Number(params.heightFt) * 12 + Number(params.heightIn)) * 2.54;
  const weightKg = Number(params.weightLbs) * 0.453592;
  const age = Number(params.age);

  const bmrMale = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  const bmrFemale = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  let bmr: number;
  if (params.sex === 'male') {
    bmr = bmrMale;
  } else if (params.sex === 'female') {
    bmr = bmrFemale;
  } else {
    bmr = (bmrMale + bmrFemale) / 2;
  }

  const days = Number(params.daysPerWeek);
  let activityMultiplier: number;
  if (days <= 2) {
    activityMultiplier = 1.375;
  } else if (days <= 4) {
    activityMultiplier = 1.55;
  } else if (days <= 6) {
    activityMultiplier = 1.725;
  } else {
    activityMultiplier = 1.9;
  }

  const tdee = bmr * activityMultiplier;

  let targetCalories: number;
  switch (params.goal) {
    case 'strength':
      targetCalories = tdee + 200;
      break;
    case 'hypertrophy':
      targetCalories = tdee + 300;
      break;
    case 'fat_loss':
      targetCalories = tdee - 400;
      break;
    case 'recomp':
    case 'general':
    default:
      targetCalories = tdee;
      break;
  }

  return Math.max(
    MIN_CALORIES,
    Math.min(MAX_CALORIES, roundToNearest(targetCalories, 50)),
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

  const initialCalories = useMemo(() => calcInitialCalories(params), []);
  const [calories, setCalories] = useState(initialCalories);

  const { proteinG, carbsG, fatsG } = useMemo(
    () => calcBaseMacros(calories, Number(params.weightLbs)),
    [calories],
  );

  const handleDecrease = () => {
    setCalories((prev) => Math.max(MIN_CALORIES, prev - CALORIE_STEP));
  };

  const handleIncrease = () => {
    setCalories((prev) => Math.min(MAX_CALORIES, prev + CALORIE_STEP));
  };

  const handleContinue = () => {
    navigation.navigate('PlanPreview', {
      ...params,
      calories,
      proteinG,
      carbsG,
      fatsG,
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
        <Text style={styles.stepIndicator}>6 of 7</Text>
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
              content="Your calories are based on your Basal Metabolic Rate (BMR) — the energy your body burns at rest — multiplied by your activity level to get your Total Daily Energy Expenditure (TDEE). We then adjust up or down based on your goal."
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

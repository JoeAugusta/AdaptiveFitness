import { useMemo, useState } from 'react';
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

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';

const COLOR_PROTEIN = ACCENT_BLUE;
const COLOR_CARBS = '#F59E0B';
const COLOR_FATS = '#10B981';

const MIN_CALORIES = 1200;
const MAX_CALORIES = 5000;
const CALORIE_STEP = 50;

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
        <Text style={styles.stepLabel}>Step 6 of 7</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Your Daily Targets</Text>
        <Text style={styles.subtitle}>
          Review and adjust your calorie goal below.
        </Text>

        {/* Section 1 — Calorie target card */}
        <View style={styles.calorieCard}>
          <View style={styles.headingRow}>
            <Text style={styles.calorieLabel}>Daily Calories</Text>
            <InfoTooltip
              title="How were these calculated?"
              content="Your calories are based on your Basal Metabolic Rate (BMR) — the energy your body burns at rest — multiplied by your activity level to get your Total Daily Energy Expenditure (TDEE). We then adjust up or down based on your goal."
            />
          </View>
          <View style={styles.calorieNumberRow}>
            <Text style={styles.calorieNumber}>{calories}</Text>
            <Text style={styles.calorieUnit}>kcal</Text>
          </View>
          <View style={styles.adjustRow}>
            <TouchableOpacity
              style={[
                styles.adjustButton,
                calories <= MIN_CALORIES && styles.adjustButtonDisabled,
              ]}
              onPress={handleDecrease}
              activeOpacity={0.7}
              disabled={calories <= MIN_CALORIES}
            >
              <Text
                style={[
                  styles.adjustButtonText,
                  calories <= MIN_CALORIES && styles.adjustButtonTextDisabled,
                ]}
              >
                − 50
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.adjustButton,
                calories >= MAX_CALORIES && styles.adjustButtonDisabled,
              ]}
              onPress={handleIncrease}
              activeOpacity={0.7}
              disabled={calories >= MAX_CALORIES}
            >
              <Text
                style={[
                  styles.adjustButtonText,
                  calories >= MAX_CALORIES && styles.adjustButtonTextDisabled,
                ]}
              >
                + 50
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.goalNote}>
            Based on your {formatGoalLabel(params.goal)} goal
          </Text>
        </View>

        {/* Section 2 — Macro breakdown */}
        <View style={styles.macroRow}>
          <View style={styles.macroCard}>
            <View style={styles.macroNumberRow}>
              <Text style={[styles.macroNumber, { color: COLOR_PROTEIN }]}>
                {proteinG}
              </Text>
              <Text style={styles.macroUnit}>g</Text>
            </View>
            <Text style={styles.macroLabel}>Protein</Text>
          </View>
          <View style={styles.macroCard}>
            <View style={styles.macroNumberRow}>
              <Text style={[styles.macroNumber, { color: COLOR_CARBS }]}>
                {carbsG}
              </Text>
              <Text style={styles.macroUnit}>g</Text>
            </View>
            <Text style={styles.macroLabel}>Carbs</Text>
          </View>
          <View style={styles.macroCard}>
            <View style={styles.macroNumberRow}>
              <Text style={[styles.macroNumber, { color: COLOR_FATS }]}>
                {fatsG}
              </Text>
              <Text style={styles.macroUnit}>g</Text>
            </View>
            <Text style={styles.macroLabel}>Fats</Text>
          </View>
        </View>

        {/* Macro split tooltip */}
        <View style={styles.macroTooltipRow}>
          <Text style={styles.macroTooltipLabel}>How are macros split?</Text>
          <InfoTooltip
            title="Your macro breakdown"
            content="Protein is set at 1g per lb of bodyweight to maximise muscle retention. Fats cover 25% of calories for hormone health. Carbohydrates fill the remainder to fuel your training sessions."
          />
        </View>

        {/* Section 3 — Info note */}
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            These targets will adjust weekly based on your weight trend and
            performance data.
          </Text>
        </View>
      </ScrollView>

      {/* Fixed footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.button}
          onPress={handleContinue}
        >
          <Text style={styles.buttonText}>Build My Plan</Text>
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
    width: '85.7%',
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

  /* Heading */
  heading: {
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

  /* Calorie card */
  calorieCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  calorieLabel: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    fontWeight: '500',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  calorieNumberRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  calorieNumber: {
    fontSize: 48,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    lineHeight: 52,
  },
  calorieUnit: {
    fontSize: 18,
    color: TEXT_SECONDARY,
    fontWeight: '500',
    marginLeft: 6,
    marginBottom: 6,
  },
  adjustRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  adjustButton: {
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#273449',
    borderWidth: 1,
    borderColor: '#334155',
  },
  adjustButtonDisabled: {
    opacity: 0.35,
  },
  adjustButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  adjustButtonTextDisabled: {
    color: TEXT_SECONDARY,
  },
  goalNote: {
    fontSize: 13,
    color: TEXT_SECONDARY,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  macroTooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  macroTooltipLabel: {
    fontSize: 13,
    color: TEXT_SECONDARY,
  },

  /* Macro row */
  macroRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  macroCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  macroNumberRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  macroNumber: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  macroUnit: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    fontWeight: '500',
    marginLeft: 2,
    marginBottom: 2,
  },
  macroLabel: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginTop: 4,
  },

  /* Info note */
  infoCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
  },
  infoText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 19,
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
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
});

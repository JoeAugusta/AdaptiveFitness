/** Macro target math shared by onboarding, tracker adjust sheet, and meal generation. */

export const MACRO_ADJUST = {
  calMin: 1200,
  calMax: 5500,
  calStep: 50,
  proteinMin: 50,
  proteinMax: 400,
  proteinStep: 5,
  carbsMin: 0,
  carbsMax: 600,
  carbsStep: 5,
  fatsMin: 30,
  fatsMax: 200,
  fatsStep: 5,
} as const;

export type MacroTargetValues = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
};

const PACE_CONFIG: Record<
  string,
  { id: string; adjustment: number; default?: boolean }[]
> = {
  fat_loss: [
    { id: 'conservative', adjustment: -250 },
    { id: 'balanced', adjustment: -400, default: true },
    { id: 'aggressive', adjustment: -600 },
  ],
  hypertrophy: [
    { id: 'conservative', adjustment: 200 },
    { id: 'balanced', adjustment: 300, default: true },
    { id: 'aggressive', adjustment: 500 },
  ],
};

export function roundToNearest(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

export function recalcCarbsG(
  calories: number,
  proteinG: number,
  fatsG: number,
): number {
  const proteinCals = proteinG * 4;
  const fatCals = fatsG * 9;
  const carbCals = Math.max(0, calories - proteinCals - fatCals);
  return roundToNearest(carbCals / 4, MACRO_ADJUST.carbsStep);
}

export function macrosExceedCalories(
  calories: number,
  proteinG: number,
  fatsG: number,
): boolean {
  return calories - proteinG * 4 - fatsG * 9 < 0;
}

export function clampMacroAdjustDraft(
  draft: MacroTargetValues,
  changed: 'calories' | 'protein_g' | 'fats_g',
): MacroTargetValues {
  let calories = draft.calories;
  let protein_g = draft.protein_g;
  let fats_g = draft.fats_g;

  if (changed === 'calories') {
    calories = Math.max(
      MACRO_ADJUST.calMin,
      Math.min(MACRO_ADJUST.calMax, roundToNearest(calories, MACRO_ADJUST.calStep)),
    );
  } else if (changed === 'protein_g') {
    protein_g = Math.max(
      MACRO_ADJUST.proteinMin,
      Math.min(MACRO_ADJUST.proteinMax, roundToNearest(protein_g, MACRO_ADJUST.proteinStep)),
    );
  } else if (changed === 'fats_g') {
    fats_g = Math.max(
      MACRO_ADJUST.fatsMin,
      Math.min(MACRO_ADJUST.fatsMax, roundToNearest(fats_g, MACRO_ADJUST.fatsStep)),
    );
  }

  const carbs_g = recalcCarbsG(calories, protein_g, fats_g);
  return { calories, protein_g, carbs_g, fats_g };
}

function getGoalAdjustment(goal: string): number {
  switch (goal) {
    case 'strength':
    case 'power_hypertrophy':
      return 200;
    case 'hypertrophy':
      return 300;
    case 'fat_loss':
      return -400;
    case 'recomp':
    case 'general':
    default:
      return 0;
  }
}

function computeTdee(input: {
  weightLbs: number;
  heightFt: number;
  heightIn: number;
  age: number;
  sex: string;
  daysPerWeek: number;
  concurrentSport?: { type: string[]; daysPerWeek: number } | null;
}): number {
  const heightCm = (input.heightFt * 12 + input.heightIn) * 2.54;
  const weightKg = input.weightLbs * 0.453592;
  const age = input.age;

  const bmrMale = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  const bmrFemale = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  const sex = String(input.sex ?? '').toLowerCase();
  let bmr: number;
  if (sex === 'male') bmr = bmrMale;
  else if (sex === 'female') bmr = bmrFemale;
  else bmr = (bmrMale + bmrFemale) / 2;

  const days = input.daysPerWeek;
  let activityMultiplier: number;
  if (days <= 2) activityMultiplier = 1.375;
  else if (days <= 4) activityMultiplier = 1.55;
  else if (days <= 6) activityMultiplier = 1.725;
  else activityMultiplier = 1.9;

  let tdee = bmr * activityMultiplier;

  const concurrentSport = input.concurrentSport;
  if (concurrentSport?.type?.length && concurrentSport.daysPerWeek > 0) {
    const intensityCal: Record<string, number> = {
      martial_arts: 150,
      team_sports: 150,
      running: 120,
      cycling: 120,
      swimming: 130,
      other: 100,
    };
    const avgIntensity =
      concurrentSport.type.reduce(
        (sum, t) => sum + (intensityCal[t] ?? 100),
        0,
      ) / concurrentSport.type.length;
    tdee += avgIntensity * concurrentSport.daysPerWeek;
  }

  return tdee;
}

function calcBaseMacros(
  calories: number,
  weightLbs: number,
  goal: string,
): Pick<MacroTargetValues, 'protein_g' | 'carbs_g' | 'fats_g'> {
  const proteinMultiplier = goal === 'fat_loss' ? 0.8 : 1.0;
  const protein_g = roundToNearest(weightLbs * proteinMultiplier, MACRO_ADJUST.proteinStep);
  const fats_g = Math.max(
    MACRO_ADJUST.fatsMin,
    roundToNearest((calories * 0.25) / 9, MACRO_ADJUST.fatsStep),
  );
  const carbs_g = recalcCarbsG(calories, protein_g, fats_g);
  return { protein_g, carbs_g, fats_g };
}

function computeTargetCalories(
  goal: string,
  caloriePace: string,
  tdee: number,
): number {
  const goalAdjustment = getGoalAdjustment(goal);
  const paceAdjustment = (() => {
    const goalPaces = PACE_CONFIG[goal];
    if (!goalPaces) return goalAdjustment;
    return (
      goalPaces.find((p) => p.id === caloriePace)?.adjustment ?? goalAdjustment
    );
  })();
  const calories = roundToNearest(tdee + paceAdjustment, MACRO_ADJUST.calStep);
  return Math.max(
    MACRO_ADJUST.calMin,
    Math.min(MACRO_ADJUST.calMax, calories),
  );
}

export function computeRecommendedMacroTargets(input: {
  weightLbs: number;
  heightFt: number;
  heightIn: number;
  age: number;
  sex: string;
  daysPerWeek: number;
  goal: string;
  caloriePace?: string | null;
  concurrentSport?: { type: string[]; daysPerWeek: number } | null;
}): MacroTargetValues {
  const tdee = computeTdee(input);
  const calories = computeTargetCalories(
    input.goal,
    input.caloriePace ?? 'balanced',
    tdee,
  );
  const { protein_g, carbs_g, fats_g } = calcBaseMacros(
    calories,
    input.weightLbs,
    input.goal,
  );
  return { calories, protein_g, carbs_g, fats_g };
}

export const TRAINING_DAY_CARB_BOOST = 1.15;
export const REST_DAY_CARB_REDUCTION = 0.85;

export function applyTrainingDayMacroAdjust(
  targets: MacroTargetValues,
  isTrainingDay: boolean,
): MacroTargetValues {
  const carbMultiplier = isTrainingDay
    ? TRAINING_DAY_CARB_BOOST
    : REST_DAY_CARB_REDUCTION;
  const adjustedCarbs = roundToNearest(
    targets.carbs_g * carbMultiplier,
    MACRO_ADJUST.carbsStep,
  );
  // Keep total calories fixed — only redistribute between carbs and fats
  const carbCalDiff = (adjustedCarbs - targets.carbs_g) * 4;
  const adjustedFats = Math.max(
    MACRO_ADJUST.fatsMin,
    roundToNearest(
      targets.fats_g - carbCalDiff / 9,
      MACRO_ADJUST.fatsStep,
    ),
  );
  return {
    calories: targets.calories,
    protein_g: targets.protein_g,
    carbs_g: adjustedCarbs,
    fats_g: adjustedFats,
  };
}

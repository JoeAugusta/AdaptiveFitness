type GoalDetailParams = {
  targetLift?: string;
  current1RM?: string;
  target1RM?: string;
  priorityMuscles?: string[];
  targetWeightLbs?: string;
  targetDate?: string;
  targetBodyFatPct?: string;
};

export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  GoalDetails: { goal: string };
  Experience: { goal: string } & GoalDetailParams;
  Constraints: {
    goal: string;
    experience: string;
    daysPerWeek: string;
    sessionLength: string;
    split: string;
  } & GoalDetailParams;
  BodyMetrics: {
    goal: string;
    experience: string;
    daysPerWeek: string;
    sessionLength: string;
    split: string;
    injuries: string[];
    equipment: string;
    weakPoints: string[];
    excludedExercises: string[];
  } & GoalDetailParams;
  MacroSetup: {
    goal: string;
    experience: string;
    daysPerWeek: string;
    sessionLength: string;
    split: string;
    injuries: string[];
    equipment: string;
    weakPoints: string[];
    excludedExercises: string[];
    age: string;
    sex: string;
    heightFt: string;
    heightIn: string;
    weightLbs: string;
    bodyFatPct: string | null;
  } & GoalDetailParams;
  PlanPreview: {
    goal: string;
    experience: string;
    daysPerWeek: string;
    sessionLength: string;
    split: string;
    injuries: string[];
    equipment: string;
    weakPoints: string[];
    excludedExercises: string[];
    age: string;
    sex: string;
    heightFt: string;
    heightIn: string;
    weightLbs: string;
    bodyFatPct: string | null;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatsG: number;
  } & GoalDetailParams;
  Dashboard: undefined;
};

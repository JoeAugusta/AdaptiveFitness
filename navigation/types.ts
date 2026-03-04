export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Experience: { goal: string };
  Constraints: {
    goal: string;
    experience: string;
    daysPerWeek: string;
    sessionLength: string;
  };
  BodyMetrics: {
    goal: string;
    experience: string;
    daysPerWeek: string;
    sessionLength: string;
    equipment: string;
    weakPoints: string[];
    excludedExercises: string[];
  };
  MacroSetup: {
    goal: string;
    experience: string;
    daysPerWeek: string;
    sessionLength: string;
    equipment: string;
    weakPoints: string[];
    excludedExercises: string[];
    age: string;
    sex: string;
    heightFt: string;
    heightIn: string;
    weightLbs: string;
    bodyFatPct: string | null;
  };
  PlanPreview: {
    goal: string;
    experience: string;
    daysPerWeek: string;
    sessionLength: string;
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
  };
  Dashboard: undefined;
};

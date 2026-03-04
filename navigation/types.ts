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
};

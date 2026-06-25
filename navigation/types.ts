import type { SessionDay } from '../utils/splitRecommendation';
import type { ActivityLogRow } from '../components/ActivityLogSheet';

export type SubscriptionPlanId = 'monthly' | 'quarterly' | 'annual';

type BillingParams = {
  selectedPlan?: SubscriptionPlanId;
};

/** Macro output passed into Pricing, then BuildingPlan with selectedPlan */
type PlanGenerationInputParams = {
  goal: string;
  experience: string;
  daysPerWeek: string;
  trainingDays: string[];
  sessionLength: string;
  injuries: string[];
  equipment: string;
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
  caloriePace?: string;
  concurrentSport: { type: string[]; daysPerWeek: number } | null;
} & GoalDetailParams &
  PlanStructureParams;

export type GoalDetailParams = {
  targetLift?: string;
  current1RM?: string;
  target1RM?: string;
  secondaryLift?: string;
  priorityMuscles?: string[];
  /** S02b sub-muscle focus chips (hypertrophy); e.g. { Biceps: 'long_head', Chest: 'upper' } */
  subMusclePreferences?: Record<string, string>;
  startingWeightLbs?: string;
  targetWeightLbs?: string;
  /** Optional nutrition target; blank at GoalDetails → maintenance (current weight) */
  goalTargetWeight?: string;
  targetDate?: string;
  targetBodyFatPct?: string;
  recompFocus?: string;
  generalFocus?: string;
  planDuration?: string;
  /** Numeric weeks from duration chips (single source of truth for plan length) */
  recommendedWeeks?: number;
  /** Optional training history (GoalDetails) — passed through to generate-plan */
  currentSplit?: string | null;
  currentSplitOther?: string | null;
  splitDuration?: string | null;
  trainingBackground?: string | null;
  /** GAP-5: Power-hypertrophy optional multi-lift current 1RM estimates */
  currentLifts?: {
    benchPress: number | null;
    backSquat: number | null;
    deadlift: number | null;
    overheadPress: number | null;
  } | null;
};

/** Jordan-chosen split + weekly session template (S03 → generate-plan) */
type PlanStructureParams = {
  splitId: string;
  splitName: string;
  splitRationale: string;
  sessionStructure: SessionDay[];
  /** GAP-2: Enhanced recovery flag — user indicates exceptional recovery capacity */
  enhancedRecovery?: boolean;
};

export type RootStackParamList = {
  Splash: undefined;
  BetaWelcome: undefined;
  Auth: undefined;
  SignUp: undefined;
  SignIn: undefined;
  JordanIntro: undefined;
  Onboarding: undefined;
  /** S02b — optional experience for sub-muscle defaults (advanced = no pre-select); usually set only when re-entering flow */
  GoalDetails: { goal: string; experience?: string };
  Experience: { goal: string } & GoalDetailParams;
  RPEEducation: {
    goal: string;
    experience: string;
    daysPerWeek: string;
    trainingDays: string[];
    sessionLength: string;
  } & GoalDetailParams &
    PlanStructureParams;
  Constraints: {
    goal: string;
    experience: string;
    daysPerWeek: string;
    trainingDays: string[];
    sessionLength: string;
  } & GoalDetailParams &
    PlanStructureParams;
  BodyMetrics: {
    goal: string;
    experience: string;
    daysPerWeek: string;
    trainingDays: string[];
    sessionLength: string;
    injuries: string[];
    equipment: string;
    excludedExercises: string[];
    /** GAP-1: Concurrent sport training context */
    concurrentSport: { type: string[]; daysPerWeek: number } | null;
  } & GoalDetailParams &
    PlanStructureParams;
  MacroSetup: {
    goal: string;
    experience: string;
    daysPerWeek: string;
    trainingDays: string[];
    sessionLength: string;
    injuries: string[];
    equipment: string;
    excludedExercises: string[];
    age: string;
    sex: string;
    heightFt: string;
    heightIn: string;
    weightLbs: string;
    bodyFatPct: string | null;
    concurrentSport: { type: string[]; daysPerWeek: number } | null;
  } & GoalDetailParams &
    PlanStructureParams;
  /** After MacroSetup — plan selection, then full plan generation */
  Pricing: PlanGenerationInputParams;
  BuildingPlan: {
    replacePlanId?: string;
    goalId?: string;
  } & PlanGenerationInputParams &
    BillingParams;
  Dashboard: undefined;
  ActiveWorkout: {
    planId: string;
    weekNumber: number;
    dayNumber: number;
    workoutTitle?: string;
    preSessionMessage?: string | null;
    /** When true, use `weekNumber` from route (e.g. Plan calendar). Omit for Dashboard — DB `plans.current_week` is source of truth. */
    lockToRouteWeek?: boolean;
  };
  WorkoutComplete: {
    planId: string;
    weekNumber: number;
    dayNumber: number;
    totalSets: number;
    totalExercises: number;
    durationMinutes: number;
    fatigueRating: number;
    prsHit: number;
    sessionAvgHR?: number | null;
    sessionPeakHR?: number | null;
    avgRecoveryDelta?: number | null;
  };
  /** Final plan retrospective (full-screen, same level as WorkoutComplete) */
  PlanComplete: { planId: string };
  PlanView: {
    planId: string;
    weekNumber?: number;
  } | undefined;
  WeeklyCoachSummary: {
    planId: string;
    weekNumber: number;
  };
  AdaptationFeed: {
    weekNumber: number;
  };
  WorkoutHome: undefined;
  /** Logged in Workout tab stack; listed here for cross-navigator `navigate` typing */
  WorkoutHistory: undefined;
  FreeSession: undefined;
  ExerciseLibrary: undefined;
  ProgressCharts: undefined;
  GoalTracker: undefined;
  PersonalRecords: undefined;
  BodyMeasurements: undefined;
  ProgressPhoto: undefined;
  MacroTracker: undefined;
  ProfileSettings: undefined;
  SubscriptionManagement: undefined;
  NotificationsSettings: undefined;
  DailyCheckIn: {
    userId: string;
    planId: string;
    weightLbs: number;
    existingWeightLog: { weight_lbs: number | null; sleep_hours: number | null; readiness_score: number | null } | null;
    existingActivityLog: ActivityLogRow | null;
  };
};

/** Progress tab stack */
export type ProgressStackParamList = {
  ProgressCharts: undefined;
  GoalTracker: undefined;
  PersonalRecords: undefined;
  BodyMeasurements: undefined;
  ProgressPhoto: undefined;
  WorkoutHistory: undefined;
  ExerciseHistoryDetail: { exerciseName: string };
};

/** Workout tab stack — PlanComplete is also registered on the root stack for navigation from WorkoutComplete */
export type WorkoutStackParamList = {
  WorkoutHome: undefined;
  PlanView: { planId: string; weekNumber?: number } | undefined;
  ExerciseLibrary: undefined;
  PlanComplete: { planId: string };
  WorkoutHistory: undefined;
  ExerciseHistoryDetail: { exerciseName: string };
  FreeSession: undefined;
};

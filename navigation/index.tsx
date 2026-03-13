import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ExperienceScreen from '../screens/onboarding/ExperienceScreen';
import ConstraintsScreen from '../screens/onboarding/ConstraintsScreen';
import BodyMetricsScreen from '../screens/onboarding/BodyMetricsScreen';
import GoalDetailsScreen from '../screens/onboarding/GoalDetailsScreen';
import MacroSetupScreen from '../screens/onboarding/MacroSetupScreen';
import PlanPreviewScreen from '../screens/onboarding/PlanPreviewScreen';
import BuildingPlanScreen from '../screens/onboarding/BuildingPlanScreen';
import HomeScreen from '../screens/HomeScreen';
import ActiveWorkoutScreen from '../screens/ActiveWorkoutScreen';
import WorkoutCompleteScreen from '../screens/WorkoutCompleteScreen';
import PlanViewScreen from '../screens/PlanViewScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0F172A' },
      }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="GoalDetails" component={GoalDetailsScreen} />
      <Stack.Screen name="Experience" component={ExperienceScreen} />
      <Stack.Screen name="Constraints" component={ConstraintsScreen} />
      <Stack.Screen name="BodyMetrics" component={BodyMetricsScreen} />
      <Stack.Screen name="MacroSetup" component={MacroSetupScreen} />
      <Stack.Screen name="PlanPreview" component={PlanPreviewScreen} />
      <Stack.Screen name="BuildingPlan" component={BuildingPlanScreen} />
      <Stack.Screen name="Dashboard" component={HomeScreen} />
      <Stack.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} />
      <Stack.Screen name="WorkoutComplete" component={WorkoutCompleteScreen} />
      <Stack.Screen name="PlanView" component={PlanViewScreen} />
    </Stack.Navigator>
  );
}

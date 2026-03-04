import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ExperienceScreen from '../screens/onboarding/ExperienceScreen';
import ConstraintsScreen from '../screens/onboarding/ConstraintsScreen';
import BodyMetricsScreen from '../screens/onboarding/BodyMetricsScreen';
import MacroSetupScreen from '../screens/onboarding/MacroSetupScreen';
import PlanPreviewScreen from '../screens/onboarding/PlanPreviewScreen';

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
      <Stack.Screen name="Experience" component={ExperienceScreen} />
      <Stack.Screen name="Constraints" component={ConstraintsScreen} />
      <Stack.Screen name="BodyMetrics" component={BodyMetricsScreen} />
      <Stack.Screen name="MacroSetup" component={MacroSetupScreen} />
      <Stack.Screen name="PlanPreview" component={PlanPreviewScreen} />
    </Stack.Navigator>
  );
}

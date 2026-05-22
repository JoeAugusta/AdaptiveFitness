import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from './types';
import { Colors, Fonts, FontSizes } from '../constants/design';

import SplashScreen from '../screens/SplashScreen';
import BetaWelcomeScreen from '../screens/BetaWelcomeScreen';
import AuthScreen from '../screens/auth/AuthScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import SignInScreen from '../screens/auth/SignInScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import GoalDetailsScreen from '../screens/onboarding/GoalDetailsScreen';
import ExperienceScreen from '../screens/onboarding/ExperienceScreen';
import RPEEducationScreen from '../screens/onboarding/RPEEducationScreen';
import ConstraintsScreen from '../screens/onboarding/ConstraintsScreen';
import BodyMetricsScreen from '../screens/onboarding/BodyMetricsScreen';
import MacroSetupScreen from '../screens/onboarding/MacroSetupScreen';
import PlanPreviewScreen from '../screens/onboarding/PlanPreviewScreen';
import BuildingPlanScreen from '../screens/onboarding/BuildingPlanScreen';
import HomeScreen from '../screens/HomeScreen';
import ActiveWorkoutScreen from '../screens/ActiveWorkoutScreen';
import WorkoutCompleteScreen from '../screens/WorkoutCompleteScreen';
import PlanCompleteScreen from '../screens/PlanCompleteScreen';
import PlanViewScreen from '../screens/PlanViewScreen';
import WorkoutHomeScreen from '../screens/WorkoutHomeScreen';
import WeeklyCoachSummaryScreen from '../screens/WeeklyCoachSummaryScreen';
import ProgressChartsScreen from '../screens/ProgressChartsScreen';
import GoalTrackerScreen from '../screens/GoalTrackerScreen';
import PersonalRecordsScreen from '../screens/PersonalRecordsScreen';
import BodyMeasurementsScreen from '../screens/BodyMeasurementsScreen';
import ProfileSettingsScreen from '../screens/ProfileSettingsScreen';
import SubscriptionManagementScreen from '../screens/SubscriptionManagementScreen';
import NotificationsSettingsScreen from '../screens/NotificationsSettingsScreen';
import MacroTrackerScreen from '../screens/MacroTrackerScreen';
import ExerciseLibraryScreen from '../screens/ExerciseLibraryScreen';
import WorkoutHistoryScreen from '../screens/WorkoutHistoryScreen';
import FreeSessionScreen from '../screens/FreeSessionScreen';

// ── Nested stack navigators (untyped — screen files own their nav prop types) ──

const HomeStack = createNativeStackNavigator();
const WorkoutStack = createNativeStackNavigator();
const ProgressStack = createNativeStackNavigator();
const NutritionStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const Root = createNativeStackNavigator<RootStackParamList>();

// ── Tab stack components ──

function HomeTabStack() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Dashboard" component={HomeScreen} />
      <HomeStack.Screen name="WeeklyCoachSummary" component={WeeklyCoachSummaryScreen} />
    </HomeStack.Navigator>
  );
}

function WorkoutTabStack() {
  return (
    <WorkoutStack.Navigator screenOptions={{ headerShown: false }}>
      <WorkoutStack.Screen name="WorkoutHome" component={WorkoutHomeScreen} />
      <WorkoutStack.Screen name="PlanView" component={PlanViewScreen} />
      <WorkoutStack.Screen name="ExerciseLibrary" component={ExerciseLibraryScreen} />
      <WorkoutStack.Screen name="WorkoutHistory" component={WorkoutHistoryScreen} />
      <WorkoutStack.Screen name="FreeSession" component={FreeSessionScreen} />
      <WorkoutStack.Screen name="PlanComplete" component={PlanCompleteScreen} />
    </WorkoutStack.Navigator>
  );
}

function ProgressTabStack() {
  return (
    <ProgressStack.Navigator screenOptions={{ headerShown: false }}>
      <ProgressStack.Screen name="ProgressCharts" component={ProgressChartsScreen} />
      <ProgressStack.Screen name="GoalTracker" component={GoalTrackerScreen} />
      <ProgressStack.Screen name="PersonalRecords" component={PersonalRecordsScreen} />
      <ProgressStack.Screen name="BodyMeasurements" component={BodyMeasurementsScreen} />
    </ProgressStack.Navigator>
  );
}

function NutritionTabStack() {
  return (
    <NutritionStack.Navigator screenOptions={{ headerShown: false }}>
      <NutritionStack.Screen name="MacroTracker" component={MacroTrackerScreen} />
    </NutritionStack.Navigator>
  );
}

function ProfileTabStack() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileSettings" component={ProfileSettingsScreen} />
      <ProfileStack.Screen name="SubscriptionManagement" component={SubscriptionManagementScreen} />
      <ProfileStack.Screen name="NotificationsSettings" component={NotificationsSettingsScreen} />
    </ProfileStack.Navigator>
  );
}

// ── Bottom tab navigator ──

type TabRouteName = 'HomeTab' | 'WorkoutTab' | 'ProgressTab' | 'NutritionTab' | 'ProfileTab';

const TAB_ICONS: Record<TabRouteName, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  HomeTab:       ['home',        'home-outline'],
  WorkoutTab:    ['barbell',     'barbell-outline'],
  ProgressTab:   ['stats-chart', 'stats-chart-outline'],
  NutritionTab:  ['nutrition',   'nutrition-outline'],
  ProfileTab:    ['person',      'person-outline'],
};

const TAB_LABELS: Record<TabRouteName, string> = {
  HomeTab:      'Home',
  WorkoutTab:   'Workout',
  ProgressTab:  'Progress',
  NutritionTab: 'Nutrition',
  ProfileTab:   'Profile',
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const name = route.name as TabRouteName;
        const icons = TAB_ICONS[name] ?? ['home', 'home-outline'];
        return {
          headerShown: false,
          tabBarStyle: {
            backgroundColor: Colors.bgCard,
            borderTopColor: Colors.divider,
            borderTopWidth: 1,
            height: 84,
            paddingBottom: 28,
            paddingTop: 8,
          },
          tabBarActiveTintColor: Colors.accent,
          tabBarInactiveTintColor: Colors.textTertiary,
          tabBarLabelStyle: { fontSize: FontSizes.micro, fontFamily: Fonts.medium },
          tabBarLabel: TAB_LABELS[name] ?? name,
          tabBarIcon: ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
            <Ionicons name={focused ? icons[0] : icons[1]} size={size} color={color} />
          ),
        };
      }}
    >
      <Tab.Screen name="HomeTab"      component={HomeTabStack} />
      <Tab.Screen name="WorkoutTab"   component={WorkoutTabStack} />
      <Tab.Screen name="ProgressTab"  component={ProgressTabStack} />
      <Tab.Screen name="NutritionTab" component={NutritionTabStack} />
      <Tab.Screen name="ProfileTab"   component={ProfileTabStack} />
    </Tab.Navigator>
  );
}

// ── Root navigator ──
//
// Architecture rationale:
//   • Onboarding screens live at the root stack level (no tab bar).
//   • 'Dashboard' at the root level renders MainTabs — so navigation.replace('Dashboard')
//     and navigation.reset({ index: 0, routes: [{ name: 'Dashboard' }] }) both work from
//     any screen without modification.
//   • ActiveWorkout and WorkoutComplete live at the root level so they render full-screen
//     (no tab bar) and are reachable via navigation.navigate() from any nested screen.
//   • All other app screens (PlanView, WeeklyCoachSummary, etc.) live in their tab stacks;
//     React Navigation's tree-wide search means navigation.navigate('PlanView', params)
//     from any nested screen finds them without changing any existing screen files.

export default function RootNavigator() {
  return (
    <Root.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.bgPrimary },
      }}
    >
      {/* ── Onboarding ── */}
      <Root.Screen name="Splash" component={SplashScreen} />
      <Root.Screen
        name="BetaWelcome"
        component={BetaWelcomeScreen}
        options={{ headerShown: false }}
      />
      <Root.Screen name="Auth" component={AuthScreen} />
      <Root.Screen name="SignUp" component={SignUpScreen} />
      <Root.Screen name="SignIn" component={SignInScreen} />
      <Root.Screen name="Onboarding" component={OnboardingScreen} />
      <Root.Screen name="GoalDetails"  component={GoalDetailsScreen} />
      <Root.Screen name="Experience"    component={ExperienceScreen} />
      <Root.Screen name="RPEEducation"  component={RPEEducationScreen} />
      <Root.Screen name="Constraints"   component={ConstraintsScreen} />
      <Root.Screen name="BodyMetrics"  component={BodyMetricsScreen} />
      <Root.Screen name="MacroSetup"   component={MacroSetupScreen} />
      <Root.Screen name="PlanPreview"  component={PlanPreviewScreen} />
      <Root.Screen name="BuildingPlan" component={BuildingPlanScreen} />

      {/* ── Main app (tab bar lives inside MainTabs) ── */}
      <Root.Screen name="Dashboard" component={MainTabs} />

      {/* ── Full-screen experiences (above tab bar) ── */}
      <Root.Screen name="ActiveWorkout"    component={ActiveWorkoutScreen} />
      <Root.Screen name="WorkoutComplete"  component={WorkoutCompleteScreen} />
      <Root.Screen name="PlanComplete" component={PlanCompleteScreen} />
    </Root.Navigator>
  );
}

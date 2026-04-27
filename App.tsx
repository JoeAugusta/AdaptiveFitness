import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { useEffect } from 'react';
import {
  useFonts,
  DMSans_400Regular,
  DMSans_400Regular_Italic,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import type { RootStackParamList } from './navigation/types';
import RootNavigator from './navigation';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function App() {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { deepLink?: string }
        | undefined;
      if (data?.deepLink === 'dashboard') {
        if (navigationRef.isReady()) {
          navigationRef.navigate('Dashboard');
        }
      }
    });
    return () => subscription.remove();
  }, []);

  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_400Regular_Italic,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar style="light" />
      <RootNavigator />
    </NavigationContainer>
  );
}

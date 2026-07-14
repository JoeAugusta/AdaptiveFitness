import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import {
  CommonActions,
  createNavigationContainerRef,
  NavigationContainer,
} from '@react-navigation/native';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { BETA_BYPASS } from './constants/betaBypass';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setDevDateOverride } from './utils/dateUtils';
import {
  useFonts,
  DMSans_400Regular,
  DMSans_400Regular_Italic,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  ChakraPetch_600SemiBold,
  ChakraPetch_700Bold,
} from '@expo-google-fonts/chakra-petch';
import type { RootStackParamList } from './navigation/types';
import RootNavigator from './navigation';
import { supabase } from './Lib/supabase';
import { AuthProvider } from './contexts/AuthContext';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as
      | Record<string, unknown>
      | undefined;
    const isForegroundOnly =
      data?.foregroundOnly === true ||
      data?.type === 'rest_timer';
    return {
      shouldShowBanner: !isForegroundOnly,
      shouldShowList: !isForegroundOnly,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function App() {
  useEffect(() => {
    if (__DEV__) {
      void AsyncStorage.getItem('dev_date_override').then((val) => {
        if (val) {
          const d = new Date(`${val}T12:00:00`);
          if (!isNaN(d.getTime())) {
            setDevDateOverride(d);
            console.log('[DEV] Date override active:', val);
          }
        }
      });
    }
  }, []);

  useEffect(() => {
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return;
      if (!navigationRef.isReady()) return;
      navigationRef.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Auth' }],
        }),
      );
    });

    return () => {
      authSub.subscription.unsubscribe();
    };
  }, []);

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

  useEffect(() => {
    if (BETA_BYPASS) return;
    if (Platform.OS === 'web') return;

    const apiKey = Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? ''
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

    if (!apiKey || apiKey === 'placeholder') {
      console.warn('[RevenueCat] No API key configured');
      return;
    }

    Purchases.configure({ apiKey });

    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }
  }, []);

  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_400Regular_Italic,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    ChakraPetch_600SemiBold,
    ChakraPetch_700Bold,
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </NavigationContainer>
  );
}

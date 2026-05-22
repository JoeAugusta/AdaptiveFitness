import { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Colors, Fonts } from '../constants/design';
import { useAuth } from '../contexts/AuthContext';

type SplashNavProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

export default function SplashScreen() {
  const navigation = useNavigation<SplashNavProp>();
  const { session, authReady, hasPlans } = useAuth();
  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    const run = async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (cancelled) return;
        if (!authReady) return;

        console.log('[SPLASH]', {
          authReady,
          hasSession: !!session,
          isAnonymous: session?.user?.is_anonymous,
          hasPlans,
          userId: session?.user?.id,
        });
        console.log('[SPLASH]', {
          hasSession: !!session,
          isAnonymous: session?.user?.is_anonymous,
          hasPlans,
        });

        if (!session) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Auth' }],
          });
          return;
        }

        if (session.user.is_anonymous) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Dashboard' }],
          });
          return;
        }

        if (!hasPlans) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Onboarding' }],
          });
          return;
        }

        navigation.reset({
          index: 0,
          routes: [{ name: 'Dashboard' }],
        });
      } catch {
        if (!cancelled) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Auth' }],
          });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [authReady, session, hasPlans, navigation]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.centerContent}>
        <Svg width={96} height={96} viewBox="0 0 72 72">
          <Rect x="0" y="0" width="72" height="72" rx="16" fill="#F97316" />
          <Rect x="19" y="16" width="10" height="40" rx="3" fill="#09090B" />
          <Rect x="43" y="16" width="10" height="40" rx="3" fill="#09090B" />
          <Rect x="19" y="31" width="34" height="10" rx="3" fill="#09090B" />
        </Svg>

        <Text style={styles.wordmark}>hone</Text>

        <ActivityIndicator
          style={styles.spinner}
          color={Colors.accent}
          size="small"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    marginTop: 20,
    fontFamily: Fonts.bold,
    fontSize: 32,
    color: Colors.textPrimary,
    letterSpacing: 3,
  },
  spinner: {
    marginTop: 32,
  },
});

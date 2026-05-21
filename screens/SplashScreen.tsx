import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Colors, Fonts, FontSizes } from '../constants/design';
import { useAuth } from '../contexts/AuthContext';

type SplashNavProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

export default function SplashScreen() {
  const navigation = useNavigation<SplashNavProp>();
  const { session, authReady, hasPlans } = useAuth();
  const [checking, setChecking] = useState(true);

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
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [authReady, session, hasPlans, navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AdaptiveFitness</Text>
      {checking ? (
        <ActivityIndicator color={Colors.accent} size="small" style={styles.spinner} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSizes.display,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    letterSpacing: 0.5,
  },
  spinner: {
    marginTop: 24,
  },
});

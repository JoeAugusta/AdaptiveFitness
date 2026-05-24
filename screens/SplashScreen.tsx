import { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Polygon, Rect } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Colors, Fonts } from '../constants/design';
import { useAuth } from '../contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../Lib/supabase';

type SplashNavProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

export default function SplashScreen() {
  const navigation = useNavigation<SplashNavProp>();
  const { session, authReady, hasPlans } = useAuth();

  useEffect(() => {
    // Safety net: if authReady hasn't fired in 3 seconds,
    // force a session check directly
    const timeout = setTimeout(async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) {
        const seen = await AsyncStorage.getItem('hone_beta_welcome_seen');
        navigation.reset({
          index: 0,
          routes: [{ name: seen ? 'Auth' : 'BetaWelcome' }],
        });
      } else {
        const { data: planData } = await supabase
          .from('plans')
          .select('id')
          .eq('user_id', s.user.id)
          .in('status', ['active', 'completed'])
          .limit(1)
          .maybeSingle();
        navigation.reset({
          index: 0,
          routes: [{ name: planData ? 'Dashboard' : 'JordanIntro' }],
        });
      }
    }, 3000);

    return () => clearTimeout(timeout);
  }, [navigation]);

  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    AsyncStorage.getItem('hone_beta_welcome_seen').then((seenWelcome) => {
      if (cancelled) return;

      if (!session) {
        if (!seenWelcome) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'BetaWelcome' }],
          });
          return;
        }
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
          routes: [{ name: 'JordanIntro' }],
        });
        return;
      }

      navigation.reset({
        index: 0,
        routes: [{ name: 'Dashboard' }],
      });
    });

    return () => {
      cancelled = true;
    };
  }, [authReady, session, hasPlans, navigation]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.centerContent}>
        <Svg width={96} height={96} viewBox="0 0 100 100">
          <Polygon
            points="50,7 89,28 89,72 50,93 11,72 11,28"
            fill="#09090B"
            stroke="#F97316"
            strokeWidth="5"
          />
          <Rect x="24" y="28" width="18" height="44" rx="4" fill="#F97316"/>
          <Rect x="58" y="28" width="18" height="44" rx="4" fill="#F97316"/>
          <Rect x="24" y="42" width="52" height="14" rx="3" fill="#F97316"/>
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

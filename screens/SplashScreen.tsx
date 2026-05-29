import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Polygon, Rect } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Colors, Fonts } from '../constants/design';
import { useAuth } from '../contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

type SplashNavProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

export default function SplashScreen() {
  const navigation = useNavigation<SplashNavProp>();
  const { session, authReady, hasPlans } = useAuth();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (!authReady) return;
    if (hasNavigated.current) return;
    hasNavigated.current = true;

    AsyncStorage.getItem('hone_beta_welcome_seen').then((seenWelcome) => {
      if (!session) {
        navigation.reset({
          index: 0,
          routes: [{ name: seenWelcome ? 'Auth' : 'BetaWelcome' }],
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

      navigation.reset({
        index: 0,
        routes: [{ name: hasPlans ? 'Dashboard' : 'JordanIntro' }],
      });
    });
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
      </View>

      <ActivityIndicator
        style={styles.spinner}
        color={Colors.accent}
        size="small"
      />
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
    paddingBottom: '20%',
  },
  wordmark: {
    marginTop: 20,
    fontFamily: Fonts.bold,
    fontSize: 32,
    color: Colors.textPrimary,
    letterSpacing: 3,
  },
  spinner: {
    position: 'absolute',
    bottom: '15%',
    alignSelf: 'center',
  },
});

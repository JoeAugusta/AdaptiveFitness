import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';
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
        <Image
          source={require('../assets/splash-icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.wordmark}>Hone</Text>
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
  logo: {
    width: 280,
    height: 280,
  },
  wordmark: {
    marginTop: 4,
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
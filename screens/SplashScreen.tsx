import { useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/design';
import { useAuth } from '../contexts/AuthContext';
import BrandLockup from '../components/BrandLockup';

type SplashNavProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

export default function SplashScreen() {
  const navigation = useNavigation<SplashNavProp>();
  const { session, authReady, hasPlans } = useAuth();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (!authReady) return;
    if (hasNavigated.current) return;
    hasNavigated.current = true;

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

    navigation.reset({
      index: 0,
      routes: [{ name: hasPlans ? 'Dashboard' : 'JordanIntro' }],
    });
  }, [authReady, session, hasPlans, navigation]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.centerContent}>
        <BrandLockup orientation="vertical" size={280} />
      </View>

      <ActivityIndicator
        style={styles.spinner}
        color={Colors.ember}
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
  spinner: {
    position: 'absolute',
    bottom: '15%',
    alignSelf: 'center',
  },
});

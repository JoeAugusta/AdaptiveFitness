import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes } from '../constants/design';

type SplashNavProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

export default function SplashScreen() {
  const navigation = useNavigation<SplashNavProp>();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        await new Promise((resolve) => setTimeout(resolve, 1500));

        if (cancelled) return;

        if (session) {
          navigation.reset({ index: 0, routes: [{ name: 'Dashboard' }] });
        } else {
          navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
        }
      } catch {
        if (!cancelled) {
          navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    };

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AdaptiveFitness</Text>
      {checking ? (
        <ActivityIndicator
          color={Colors.accent}
          size="small"
          style={styles.spinner}
        />
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

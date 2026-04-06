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
    async function checkSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          navigation.replace('Onboarding');
          return;
        }

        const { data: plan } = await supabase
          .from('plans')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        navigation.replace(plan ? 'Dashboard' : 'Onboarding');
      } catch {
        navigation.replace('Onboarding');
      } finally {
        setChecking(false);
      }
    }

    checkSession();
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AdaptiveFitness</Text>
      {checking && (
        <ActivityIndicator
          color={Colors.accent}
          size="small"
          style={styles.spinner}
        />
      )}
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

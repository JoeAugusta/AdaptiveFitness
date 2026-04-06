import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes } from '../constants/design';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function WorkoutHomeScreen() {
  const navigation = useNavigation<NavProp>();
  const [noPlan, setNoPlan] = useState(false);

  useEffect(() => {
    async function loadAndRedirect() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) { navigation.replace('Onboarding'); return; }

        const { data: plan } = await supabase
          .from('plans')
          .select('id, current_week')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!plan) { setNoPlan(true); return; }

        navigation.replace('PlanView', {
          planId: plan.id,
          weekNumber: plan.current_week,
        });
      } catch {
        setNoPlan(true);
      }
    }

    loadAndRedirect();
  }, [navigation]);

  if (noPlan) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>No active plan found</Text>
        <Text style={styles.sub}>Complete onboarding to generate your plan.</Text>
        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Dashboard')}
        >
          <Text style={styles.buttonText}>Go to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary, alignItems: 'center', justifyContent: 'center', gap: 12 },
  message: { color: Colors.textPrimary, fontSize: FontSizes.title, fontFamily: Fonts.semiBold, },
  sub: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, textAlign: 'center', paddingHorizontal: 40 },
  button: { backgroundColor: Colors.accent, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  buttonText: { color: '#FFFFFF', fontSize: FontSizes.caption, fontFamily: Fonts.semiBold, }, // TODO: map to design token
});

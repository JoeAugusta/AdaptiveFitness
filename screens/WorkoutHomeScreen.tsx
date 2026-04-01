import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';

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
      <ActivityIndicator size="large" color={ACCENT_BLUE} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_DARK, alignItems: 'center', justifyContent: 'center', gap: 12 },
  message: { color: TEXT_PRIMARY, fontSize: 16, fontWeight: '600' },
  sub: { color: TEXT_SECONDARY, fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
  button: { backgroundColor: ACCENT_BLUE, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});

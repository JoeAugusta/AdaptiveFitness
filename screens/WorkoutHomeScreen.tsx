import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';

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
          .maybeSingle();

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
          onPress={() => {
            // Root tab shell is registered as `Dashboard` (see navigation/index.tsx); Home tab is `HomeTab`.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            navigation.navigate('Dashboard' as any, {
              screen: 'HomeTab',
            });
          }}
        >
          <Text style={styles.buttonText}>Go to Dashboard</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.historyLink}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('WorkoutHistory')}
        >
          <Text style={styles.historyLinkText}>View Workout History →</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.extraWorkCard}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('FreeSession' as never)}
        >
          <Text style={styles.extraWorkCardLabel}>EXTRA WORK</Text>
          <Text style={styles.extraWorkCardText}>
            Train outside your plan — Jordan tracks it →
          </Text>
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
  historyLink: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  historyLinkText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  extraWorkCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accentBorder,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  extraWorkCardLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  extraWorkCardText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
});

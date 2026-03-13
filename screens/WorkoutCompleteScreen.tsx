import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'WorkoutComplete'>;
type RouteType = RouteProp<RootStackParamList, 'WorkoutComplete'>;

export default function WorkoutCompleteScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const {
    totalSets,
    totalExercises,
    durationMinutes,
    fatigueRating,
    prsHit,
  } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.checkmark}>✓</Text>
      <Text style={styles.title}>Workout Complete!</Text>
      <Text style={styles.subtitle}>Great session — keep it up.</Text>

      <View style={styles.statsContainer}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Exercises</Text>
          <Text style={styles.statValue}>{totalExercises}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Sets Logged</Text>
          <Text style={styles.statValue}>{totalSets}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Duration</Text>
          <Text style={styles.statValue}>{durationMinutes} min</Text>
        </View>
        {prsHit > 0 && (
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>PRs Hit</Text>
            <Text style={[styles.statValue, styles.prValue]}>
              {prsHit}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Dashboard')}
        >
          <Text style={styles.buttonText}>Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  checkmark: {
    fontSize: 48,
    color: ACCENT_BLUE,
    fontWeight: '700',
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    marginBottom: 32,
  },
  statsContainer: {
    width: '100%',
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 20,
    gap: 16,
    marginBottom: 32,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: { fontSize: 15, color: TEXT_SECONDARY },
  statValue: { fontSize: 17, fontWeight: '600', color: TEXT_PRIMARY },
  prValue: { color: ACCENT_BLUE },
  footer: { width: '100%' },
  button: {
    backgroundColor: ACCENT_BLUE,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { fontSize: 17, fontWeight: '600', color: TEXT_PRIMARY },
});

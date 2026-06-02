import { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { WorkoutStackParamList } from '../navigation/types';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import {
  buildExerciseSessionHistory,
  formatLongDate,
  formatWeightLb,
  getWorkoutHistoryCache,
} from '../utils/workoutHistoryData';

type NavProp = NativeStackNavigationProp<
  WorkoutStackParamList,
  'ExerciseHistoryDetail'
>;
type RouteType = RouteProp<WorkoutStackParamList, 'ExerciseHistoryDetail'>;

export default function ExerciseHistoryDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { exerciseName } = route.params;

  const detail = useMemo(() => {
    const cache = getWorkoutHistoryCache();
    if (!cache) {
      return {
        personalBestWeight: 0,
        personalBestReps: 0,
        estimatedOneRM: 0,
        personalBestDate: '',
        sessions: [],
      };
    }
    return buildExerciseSessionHistory(cache.logs, exerciseName);
  }, [exerciseName]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {exerciseName}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pbHero}>
          <Text style={styles.pbLabel}>PERSONAL BEST</Text>
          <Text style={styles.pbMain}>
            {formatWeightLb(detail.personalBestWeight)} lbs ×{' '}
            {detail.personalBestReps} reps
          </Text>
          <Text style={styles.pbSub}>
            Estimated 1RM: {formatWeightLb(detail.estimatedOneRM)} lbs
          </Text>
          {detail.personalBestDate ? (
            <Text style={styles.pbDate}>
              {formatLongDate(detail.personalBestDate)}
            </Text>
          ) : null}
        </View>

        {detail.sessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No logged sets for this exercise.</Text>
          </View>
        ) : (
          detail.sessions.map((session) => (
            <View key={session.logId} style={styles.sessionCard}>
              <View style={styles.sessionHeader}>
                <Text style={styles.sessionMeta}>
                  Week {session.weekNumber} · Day {session.dayNumber}
                </Text>
                <Text style={styles.sessionDate}>
                  {formatLongDate(session.loggedAt)}
                </Text>
              </View>

              {session.sets.map((set, idx) => (
                <View
                  key={`${session.logId}-${set.setNumber}-${idx}`}
                  style={styles.setRow}
                >
                  <Text
                    style={[
                      styles.setText,
                      set.isTopSet ? styles.setTextTop : styles.setTextRegular,
                    ]}
                  >
                    Set {set.setNumber || idx + 1}: {formatWeightLb(set.weightLbs)}{' '}
                    lbs × {set.reps}
                    {set.rpe != null ? `    RPE ${set.rpe}` : ''}
                  </Text>
                  {set.isPersonalBest ? (
                    <View style={styles.pbBadge}>
                      <Text style={styles.pbBadgeText}>PB</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 8,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  backChevron: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
  headerTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxxl,
  },
  pbHero: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  pbLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  pbMain: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.accent,
  },
  pbSub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  pbDate: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: Spacing.xs,
  },
  sessionCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  sessionMeta: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
  },
  sessionDate: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  setText: {
    flex: 1,
    fontSize: FontSizes.body,
    lineHeight: 22,
  },
  setTextTop: {
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  setTextRegular: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  pbBadge: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  pbBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.bgPrimary,
  },
  emptyCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.xl,
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});

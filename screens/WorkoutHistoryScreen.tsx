import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { WorkoutStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import {
  buildExerciseSummaries,
  buildSessionSummaries,
  formatLongDate,
  formatShortDate,
  formatWeightLb,
  setWorkoutHistoryCache,
  type ExerciseSummary,
  type SessionSummary,
  type WorkoutLogEntry,
} from '../utils/workoutHistoryData';

type NavProp = NativeStackNavigationProp<WorkoutStackParamList, 'WorkoutHistory'>;
type TabKey = 'exercises' | 'sessions';

function TrendIcon({ trend }: { trend: ExerciseSummary['trend'] }) {
  if (trend === 'up') {
    return (
      <Ionicons name="trending-up-outline" size={18} color={Colors.success} />
    );
  }
  if (trend === 'down') {
    return (
      <Ionicons name="trending-down-outline" size={18} color={Colors.danger} />
    );
  }
  return <Ionicons name="remove-outline" size={18} color={Colors.textTertiary} />;
}

function ExerciseCard({
  item,
  onPress,
}: {
  item: ExerciseSummary;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.cardTopRow}>
        <Text style={styles.exerciseName} numberOfLines={2}>
          {item.exerciseName.toUpperCase()}
        </Text>
        <TrendIcon trend={item.trend} />
      </View>

      <Text style={styles.sectionLabel}>Personal Best</Text>
      <View style={styles.pbRow}>
        <Text style={styles.pbWeightReps}>
          {formatWeightLb(item.personalBestWeight)} lbs × {item.personalBestReps} reps
        </Text>
        <Text style={styles.pbOneRm}>
          est. 1RM: {formatWeightLb(item.estimatedOneRM)} lbs
        </Text>
      </View>

      <Text style={styles.metaLine}>
        Last logged: {formatShortDate(item.lastLoggedAt)} •{' '}
        {formatWeightLb(item.lastWeightLbs)} lbs
      </Text>
      <Text style={styles.metaMuted}>
        {item.totalSessions} session{item.totalSessions === 1 ? '' : 's'} •{' '}
        {item.totalSets} sets total
      </Text>
    </TouchableOpacity>
  );
}

function SessionCard({ item }: { item: SessionSummary }) {
  const topLiftsText =
    item.topLifts.length > 0
      ? item.topLifts
          .map((lift) => `${lift.name} ${formatWeightLb(lift.weightLbs)} lbs`)
          .join(' · ')
      : 'No weighted sets logged';

  return (
    <View style={styles.card}>
      <View style={styles.sessionTitleRow}>
        <Text style={styles.sessionTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.sessionWeekDay}>
          Week {item.weekNumber} · Day {item.dayNumber}
        </Text>
      </View>

      <Text style={styles.metaLine}>
        {formatLongDate(item.loggedAt)} • {item.totalSets} sets logged
      </Text>

      <Text style={styles.topLiftsLabel}>Top lifts:</Text>
      <Text style={styles.topLiftsText}>{topLiftsText}</Text>

      <Text style={styles.metaLine}>
        RPE avg: {item.avgRpe != null ? item.avgRpe.toFixed(1) : '—'} • Fatigue:{' '}
        {item.fatigueLabel}
      </Text>
    </View>
  );
}

export default function WorkoutHistoryScreen() {
  const navigation = useNavigation<NavProp>();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<WorkoutLogEntry[]>([]);
  const [planJson, setPlanJson] = useState<unknown>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('exercises');
  const [searchQuery, setSearchQuery] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        setLogs([]);
        setPlanJson(null);
        return;
      }

      const { data: plan } = await supabase
        .from('plans')
        .select('id, plan_json')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!plan?.id) {
        setLogs([]);
        setPlanJson(null);
        return;
      }

      const { data, error } = await supabase
        .from('workout_logs')
        .select(
          'id, week_number, day_number, logged_at, session_fatigue_rating, sets_json',
        )
        .eq('user_id', userId)
        .eq('plan_id', plan.id)
        .order('logged_at', { ascending: false });

      if (error) {
        console.warn('[WorkoutHistory] workout_logs', error.message);
        setLogs([]);
        return;
      }

      const rows = (data ?? []) as WorkoutLogEntry[];
      setLogs(rows);
      setPlanJson(plan.plan_json);
      setWorkoutHistoryCache({
        logs: rows,
        planJson: plan.plan_json,
        planId: plan.id,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const exerciseSummaries = useMemo(
    () => buildExerciseSummaries(logs),
    [logs],
  );

  const sessionSummaries = useMemo(
    () => buildSessionSummaries(logs, planJson),
    [logs, planJson],
  );

  const query = searchQuery.trim().toLowerCase();

  const filteredExercises = useMemo(() => {
    if (!query) return exerciseSummaries;
    return exerciseSummaries.filter((item) =>
      item.exerciseName.toLowerCase().includes(query),
    );
  }, [exerciseSummaries, query]);

  const filteredSessions = useMemo(() => {
    if (!query) return sessionSummaries;
    return sessionSummaries.filter((item) =>
      item.title.toLowerCase().includes(query),
    );
  }, [sessionSummaries, query]);

  const listData = activeTab === 'exercises' ? filteredExercises : filteredSessions;

  const ListHeader = (
    <>
      <View style={styles.searchWrap}>
        <Ionicons
          name="search-outline"
          size={18}
          color={Colors.textTertiary}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search exercises..."
          placeholderTextColor={Colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="never"
        />
        {searchQuery.length > 0 ? (
          <Pressable
            onPress={() => setSearchQuery('')}
            hitSlop={8}
            style={styles.clearButton}
          >
            <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'exercises' && styles.tabActive]}
          onPress={() => setActiveTab('exercises')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'exercises' && styles.tabTextActive,
            ]}
          >
            Exercises
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sessions' && styles.tabActive]}
          onPress={() => setActiveTab('sessions')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'sessions' && styles.tabTextActive,
            ]}
          >
            Sessions
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const EmptyState = (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>No workouts logged yet.</Text>
      <Text style={styles.emptyBody}>
        Complete your first session to see your history here.
      </Text>
    </View>
  );

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
        <Text style={styles.headerTitle}>Workout History</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : logs.length === 0 ? (
        <View style={styles.emptyContainer}>
          {ListHeader}
          {EmptyState}
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) =>
            activeTab === 'exercises'
              ? (item as ExerciseSummary).exerciseName
              : (item as SessionSummary).id
          }
          ListHeaderComponent={ListHeader}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyBody}>No matches for your search.</Text>
            </View>
          }
          renderItem={({ item }) =>
            activeTab === 'exercises' ? (
              <ExerciseCard
                item={item as ExerciseSummary}
                onPress={() =>
                  navigation.navigate('ExerciseHistoryDetail', {
                    exerciseName: (item as ExerciseSummary).exerciseName,
                  })
                }
              />
            ) : (
              <SessionCard item={item as SessionSummary} />
            )
          }
          ItemSeparatorComponent={() => <View style={styles.itemGap} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 8,
    paddingBottom: Spacing.sm,
  },
  backChevron: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    paddingRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxxl,
  },
  emptyContainer: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    paddingVertical: Spacing.md,
  },
  clearButton: {
    marginLeft: Spacing.sm,
  },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  tabActive: {
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentMuted,
  },
  tabText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.accent,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  exerciseName: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  pbRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    marginBottom: Spacing.sm,
  },
  pbWeightReps: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.accent,
  },
  pbOneRm: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  metaLine: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  metaMuted: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  sessionTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  sessionWeekDay: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  topLiftsLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  topLiftsText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
    marginBottom: Spacing.xs,
  },
  itemGap: {
    height: Spacing.md,
  },
  emptyWrap: {
    paddingVertical: Spacing.xxxl,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});

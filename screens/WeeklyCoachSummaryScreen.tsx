import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import { Colors } from '../constants/design';

type PerformanceRating = 'strong' | 'on-track' | 'tough-week';

interface WeeklySummaryData {
  weekNumber: number;
  performanceRating: PerformanceRating;
  headline: string;
  highlights: string[];
  performanceSummary: string;
  nextWeekChanges: string;
  nutritionCheckin: string;
  motivationalNote: string;
}

interface WeeklySummaryRow {
  id: string;
  week_number: number;
  summary_json: WeeklySummaryData;
  generated_at: string;
}

type NavProp = NativeStackNavigationProp<RootStackParamList, 'WeeklyCoachSummary'>;
type RouteType = RouteProp<RootStackParamList, 'WeeklyCoachSummary'>;

const RATING_CONFIG: Record<PerformanceRating, { bg: string; label: string }> = {
  'strong': { bg: Colors.success, label: 'Strong Week' },
  'on-track': { bg: Colors.accent, label: 'On Track' },
  'tough-week': { bg: Colors.warning, label: 'Tough Week' },
};

function RatingBadge({ rating }: { rating: PerformanceRating }) {
  const config = RATING_CONFIG[rating] ?? RATING_CONFIG['on-track'];
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={styles.badgeText}>{config.label}</Text>
    </View>
  );
}

function SummaryCards({ summary }: { summary: WeeklySummaryData }) {
  return (
    <>
      {/* Performance Card */}
      <View style={styles.card}>
        <Text style={styles.headline}>{summary.headline}</Text>
        <RatingBadge rating={summary.performanceRating} />
        <Text style={styles.bodyText}>{summary.performanceSummary}</Text>
      </View>

      {/* Highlights Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>This Week's Wins 🏆</Text>
        <View style={styles.highlightsList}>
          {summary.highlights.map((item, i) => (
            <View key={i} style={styles.highlightRow}>
              <Text style={styles.checkIcon}>✓</Text>
              <Text style={styles.highlightText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Next Week Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>What's Changing Next Week</Text>
        <Text style={styles.bodyText}>{summary.nextWeekChanges}</Text>
      </View>

      {/* Nutrition Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Nutrition Check-in</Text>
        <Text style={styles.bodyText}>{summary.nutritionCheckin}</Text>
      </View>

      {/* Coach Note Card */}
      <View style={[styles.card, styles.coachCard]}>
        <Text style={styles.coachNote}>{summary.motivationalNote}</Text>
      </View>
    </>
  );
}

export default function WeeklyCoachSummaryScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { planId, weekNumber } = route.params;

  const [currentSummary, setCurrentSummary] = useState<WeeklySummaryData | null>(null);
  const [history, setHistory] = useState<WeeklySummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [weekInProgress, setWeekInProgress] = useState(false);
  const [currentWeekNum, setCurrentWeekNum] = useState(0);

  const pulseAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (!loading) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [loading, pulseAnim]);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWeekInProgress(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('No authenticated user');

      // Fetch current_week first so it is available on all code paths
      const { data: planRow } = await supabase
        .from('plans')
        .select('current_week')
        .eq('id', planId)
        .single();

      const currentWeek: number = planRow?.current_week ?? (weekNumber + 1);
      setCurrentWeekNum(currentWeek);

      const { data: rows, error: fetchErr } = await supabase
        .from('weekly_summaries')
        .select('id, week_number, summary_json, generated_at')
        .eq('plan_id', planId)
        .order('week_number', { ascending: false })
        .limit(4);

      if (fetchErr) throw new Error(fetchErr.message);

      const existing = (rows ?? []) as WeeklySummaryRow[];
      const currentRow = existing.find((r) => r.week_number === weekNumber);

      if (currentRow) {
        setCurrentSummary(currentRow.summary_json);
        setHistory(existing.filter((r) => r.week_number !== weekNumber));
        setLoading(false);
        return;
      }

      // Guard: only generate a summary for a completed week
      if (weekNumber >= currentWeek) {
        setWeekInProgress(true);
        setLoading(false);
        return;
      }

      // Generate via Edge Function
      const { data: fnData, error: fnErr } = await supabase.functions.invoke(
        'weekly-coach-summary',
        { body: { userId, planId, weekNumber } },
      );

      if (fnErr) throw new Error(fnErr.message ?? 'Edge Function failed');
      if (fnData?.error) throw new Error(fnData.error);

      const summary: WeeklySummaryData = fnData.summary;

      // Save to weekly_summaries — upsert to handle duplicate calls gracefully
      const { error: insertErr } = await supabase.from('weekly_summaries').upsert(
        {
          user_id: userId,
          plan_id: planId,
          week_number: weekNumber,
          summary_json: summary,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,plan_id,week_number' },
      );

      if (insertErr) console.warn('Failed to save summary:', insertErr.message);

      setCurrentSummary(summary);
      setHistory(existing);
      setLoading(false);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setLoading(false);
    }
  }, [planId, weekNumber]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const toggleHistory = (week: number) => {
    setExpandedWeek((prev) => (prev === week ? null : week));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Weekly Review</Text>
            <Text style={styles.headerSubtitle}>Week {weekNumber}</Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        {/* Loading State */}
        {loading && (
          <Animated.View style={[styles.card, styles.loadingCard, { opacity: pulseAnim }]}>
            <ActivityIndicator color={Colors.accent} style={{ marginBottom: 12 }} />
            <Text style={styles.loadingText}>Your coach is reviewing your week...</Text>
            <Text style={styles.loadingSubtext}>This takes a few seconds</Text>
          </Animated.View>
        )}

        {/* Week In Progress State */}
        {!loading && weekInProgress && (
          <View style={styles.inProgressCard}>
            <Text style={styles.inProgressEmoji}>🏋️</Text>
            <Text style={styles.inProgressTitle}>Week {weekNumber} is in progress</Text>
            <Text style={styles.inProgressBody}>
              Your weekly summary from Jordan will be ready once you've completed this week's sessions.
            </Text>
          </View>
        )}

        {/* Error State */}
        {!loading && error && (
          <View style={[styles.card, styles.errorCard]}>
            <Text style={styles.bodyText}>
              Couldn't load your weekly summary. Check your connection and try again.
            </Text>
            <TouchableOpacity onPress={fetchSummary} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Current Week Summary */}
        {!loading && !error && currentSummary && (
          <SummaryCards summary={currentSummary} />
        )}

        {/* History Section */}
        {!loading && (() => {
          const previousWeekNumbers = Array.from(
            { length: currentWeekNum - 1 },
            (_, i) => i + 1,
          ).reverse();

          return (
            <>
              <Text style={styles.sectionHeader}>Previous Weeks</Text>

              {previousWeekNumbers.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.emptyText}>
                    Previous weeks will appear here as you complete them.
                  </Text>
                </View>
              ) : (
                previousWeekNumbers.map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={styles.prevWeekRow}
                    onPress={() =>
                      navigation.navigate('WeeklyCoachSummary', { planId, weekNumber: n })
                    }
                    activeOpacity={0.7}
                  >
                    <Text style={styles.prevWeekLabel}>Week {n}</Text>
                    <Text style={styles.prevWeekChevron}>›</Text>
                  </TouchableOpacity>
                ))
              )}
            </>
          );
        })()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backChevron: {
    color: Colors.textPrimary,
    fontSize: 32,
    lineHeight: 36,
    paddingRight: 8,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  headline: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: '#FFFFFF', // TODO: map to design token
    fontSize: 12,
    fontWeight: '700',
  },
  bodyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  cardTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  highlightsList: {
    gap: 8,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkIcon: {
    color: Colors.accent,
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
    lineHeight: 20,
  },
  highlightText: {
    color: Colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  coachCard: {
    backgroundColor: '#243044', // TODO: map to design token
  },
  coachNote: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 22,
  },
  loadingCard: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontStyle: 'italic',
  },
  loadingSubtext: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
  },
  errorCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.danger,
  },
  retryButton: {
    marginTop: 8,
  },
  retryText: {
    color: Colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  sectionHeader: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 12,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 4,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  historyWeekLabel: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  chevronIcon: {
    color: Colors.textSecondary,
    fontSize: 18,
    marginLeft: 'auto',
    transform: [{ rotate: '90deg' }],
  },
  chevronUp: {
    transform: [{ rotate: '-90deg' }],
  },
  historyHeadline: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },

  // ── Week in progress ──
  inProgressCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 24,
    alignItems: 'center',
  },
  inProgressEmoji: {
    fontSize: 32,
    textAlign: 'center',
    marginBottom: 8,
  },
  inProgressTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  inProgressBody: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 6,
  },

  // ── Previous weeks list ──
  prevWeekRow: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prevWeekLabel: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  prevWeekChevron: {
    color: Colors.textSecondary,
    fontSize: 18,
  },
});

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

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const CARD_SELECTED_BG = 'rgba(59,130,246,0.12)';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const COACH_CARD_BG = '#243044';

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
  'strong': { bg: '#22C55E', label: 'Strong Week' },
  'on-track': { bg: ACCENT_BLUE, label: 'On Track' },
  'tough-week': { bg: '#F59E0B', label: 'Tough Week' },
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
        <Text style={styles.coachSignoff}>— Your AI Coach</Text>
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

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('No authenticated user');

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

      // Generate via Edge Function
      const { data: fnData, error: fnErr } = await supabase.functions.invoke(
        'weekly-coach-summary',
        { body: { userId, planId, weekNumber } },
      );

      if (fnErr) throw new Error(fnErr.message ?? 'Edge Function failed');
      if (fnData?.error) throw new Error(fnData.error);

      const summary: WeeklySummaryData = fnData.summary;

      // Save to weekly_summaries
      const { error: insertErr } = await supabase.from('weekly_summaries').insert({
        user_id: userId,
        plan_id: planId,
        week_number: weekNumber,
        summary_json: summary,
        generated_at: new Date().toISOString(),
      });

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
            <ActivityIndicator color={ACCENT_BLUE} style={{ marginBottom: 12 }} />
            <Text style={styles.loadingText}>Your coach is reviewing your week...</Text>
            <Text style={styles.loadingSubtext}>This takes a few seconds</Text>
          </Animated.View>
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
        {!loading && (
          <>
            <Text style={styles.sectionHeader}>Previous Weeks</Text>

            {history.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.emptyText}>
                  Previous weeks will appear here as you complete them.
                </Text>
              </View>
            ) : (
              history.map((row) => {
                const isExpanded = expandedWeek === row.week_number;
                const s = row.summary_json;
                return (
                  <View key={row.id} style={styles.card}>
                    <TouchableOpacity
                      onPress={() => toggleHistory(row.week_number)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.historyHeader}>
                        <Text style={styles.historyWeekLabel}>Week {row.week_number}</Text>
                        <RatingBadge rating={s.performanceRating} />
                        <Text style={[styles.chevronIcon, isExpanded && styles.chevronUp]}>›</Text>
                      </View>
                      {!isExpanded && (
                        <Text style={styles.historyHeadline} numberOfLines={1}>
                          {s.headline}
                        </Text>
                      )}
                    </TouchableOpacity>

                    {isExpanded && <SummaryCards summary={s} />}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG_DARK,
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
    color: TEXT_PRIMARY,
    fontSize: 32,
    lineHeight: 36,
    paddingRight: 8,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    marginTop: 2,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  headline: {
    color: TEXT_PRIMARY,
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
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  bodyText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  cardTitle: {
    color: TEXT_PRIMARY,
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
    color: ACCENT_BLUE,
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
    lineHeight: 20,
  },
  highlightText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  coachCard: {
    backgroundColor: COACH_CARD_BG,
  },
  coachNote: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 22,
  },
  coachSignoff: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  loadingCard: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    fontStyle: 'italic',
  },
  loadingSubtext: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    marginTop: 6,
  },
  errorCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  retryButton: {
    marginTop: 8,
  },
  retryText: {
    color: ACCENT_BLUE,
    fontSize: 15,
    fontWeight: '600',
  },
  sectionHeader: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 12,
  },
  emptyText: {
    color: TEXT_SECONDARY,
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
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
  },
  chevronIcon: {
    color: TEXT_SECONDARY,
    fontSize: 18,
    marginLeft: 'auto',
    transform: [{ rotate: '90deg' }],
  },
  chevronUp: {
    transform: [{ rotate: '-90deg' }],
  },
  historyHeadline: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    marginTop: 4,
  },
});

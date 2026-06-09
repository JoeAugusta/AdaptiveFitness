import { useState, useEffect, useRef, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  SafeAreaView,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cleanJordanMessage, stripEmDash } from '../utils/jordanText';

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
  // Structured fields — present on new summaries, absent on old (graceful fallback)
  prCount?: number;
  sessionsCompleted?: number;
  sessionsPlanned?: number;
  avgRpe?: number;
}

interface WeeklySummaryRow {
  id: string;
  week_number: number;
  summary_json: WeeklySummaryData;
  generated_at: string;
}

type NavProp = NativeStackNavigationProp<RootStackParamList, 'WeeklyCoachSummary'>;
type RouteType = RouteProp<RootStackParamList, 'WeeklyCoachSummary'>;

const RATING_LABELS: Record<PerformanceRating, string> = {
  strong: 'Strong Week',
  'on-track': 'On Track',
  'tough-week': 'Tough Week',
};

function SummaryCards({
  summary,
  adaptationWeekNumber,
  onSeeDetailedChanges,
}: {
  summary: WeeklySummaryData;
  adaptationWeekNumber: number;
  onSeeDetailedChanges: () => void;
}) {
  const [expandedSection, setExpandedSection] = useState<
    'wins' | 'nutrition' | 'analysis' | null
  >(null);

  const toggleSection = (section: 'wins' | 'nutrition' | 'analysis') => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  // Structured stats — only show if new fields present
  const hasStructuredStats =
    summary.sessionsCompleted != null ||
    summary.prCount != null ||
    summary.avgRpe != null;

  const ratingColor =
    summary.performanceRating === 'strong'
      ? Colors.success
      : summary.performanceRating === 'tough-week'
        ? Colors.warning
        : Colors.accent;

  const ratingBg =
    summary.performanceRating === 'strong'
      ? Colors.successMuted
      : summary.performanceRating === 'tough-week'
        ? Colors.warningMuted
        : Colors.accentMuted;

  const ratingLabel = RATING_LABELS[summary.performanceRating] ?? 'On Track';

  return (
    <View style={styles.summaryContent}>

      {/* ── Hero block ── */}
      <View style={[styles.heroCard, { borderLeftColor: ratingColor }]}>
        {/* Rating badge */}
        <View style={[styles.ratingPill, { backgroundColor: ratingBg }]}>
          <Text style={[styles.ratingPillText, { color: ratingColor }]}>
            {ratingLabel.toUpperCase()}
          </Text>
        </View>

        {/* Headline */}
        <Text style={styles.heroHeadline}>
          {stripEmDash(summary.headline)}
        </Text>

        {/* Stat strip — hidden on old summaries lacking structured fields */}
        {hasStructuredStats ? (
          <View style={styles.statStrip}>
            {summary.prCount != null && summary.prCount > 0 ? (
              <View style={styles.statChip}>
                <Text style={styles.statChipValue}>{summary.prCount}</Text>
                <Text style={styles.statChipLabel}>
                  {summary.prCount === 1 ? 'PR' : 'PRs'}
                </Text>
              </View>
            ) : null}
            {summary.sessionsCompleted != null &&
            summary.sessionsPlanned != null ? (
              <View style={styles.statChip}>
                <Text style={styles.statChipValue}>
                  {summary.sessionsCompleted}/{summary.sessionsPlanned}
                </Text>
                <Text style={styles.statChipLabel}>Sessions</Text>
              </View>
            ) : null}
            {summary.avgRpe != null && summary.avgRpe > 0 ? (
              <View style={styles.statChip}>
                <Text style={styles.statChipValue}>
                  {summary.avgRpe.toFixed(1)}
                </Text>
                <Text style={styles.statChipLabel}>Avg RPE</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* ── Jordan one-liner ── */}
      <View style={styles.jordanNoteCard}>
        <Text style={styles.jordanLabel}>JORDAN</Text>
        <Text style={styles.jordanNoteText}>
          {(cleanJordanMessage(stripEmDash(summary.motivationalNote)) ?? '')
            .replace(/\.\.+/g, '.')
            .replace(/[.,]?\s*—?\s*Jordan\.?$/i, '')
            .trim()}
        </Text>
      </View>

      {/* ── Collapsible: This Week's Wins ── */}
      {summary.highlights.length > 0 ? (
        <View style={styles.collapsibleCard}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => toggleSection('wins')}
            activeOpacity={0.7}
          >
            <Text style={styles.collapsibleTitle}>THIS WEEK</Text>
            <View style={styles.collapsibleRight}>
              {expandedSection !== 'wins' ? (
                <Text style={styles.tapHint}>tap to expand</Text>
              ) : null}
              <Ionicons
                name={expandedSection === 'wins' ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.textTertiary}
              />
            </View>
          </TouchableOpacity>
          {expandedSection === 'wins' ? (
            <View style={styles.collapsibleBody}>
              {summary.highlights.map((item, i) => (
                <View
                  key={i}
                  style={[
                    styles.highlightRow,
                    i < summary.highlights.length - 1 &&
                      styles.highlightRowBorder,
                  ]}
                >
                  <Ionicons
                    name="checkmark"
                    size={14}
                    color={Colors.success}
                  />
                  <Text style={styles.highlightText}>
                    {stripEmDash(item)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── Collapsible: Nutrition ── */}
      {summary.nutritionCheckin ? (
        <View style={styles.collapsibleCard}>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => toggleSection('nutrition')}
            activeOpacity={0.7}
          >
            <Text style={styles.collapsibleTitle}>NUTRITION</Text>
            <View style={styles.collapsibleRight}>
              {expandedSection !== 'nutrition' ? (
                <Text style={styles.tapHint}>tap to expand</Text>
              ) : null}
              <Ionicons
                name={
                  expandedSection === 'nutrition'
                    ? 'chevron-up'
                    : 'chevron-down'
                }
                size={16}
                color={Colors.textTertiary}
              />
            </View>
          </TouchableOpacity>
          {expandedSection === 'nutrition' ? (
            <View style={styles.collapsibleBody}>
              <Text style={styles.collapsibleBodyText}>
                {stripEmDash(summary.nutritionCheckin)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── Collapsible: Full Analysis ── */}
      <View style={styles.collapsibleCard}>
        <TouchableOpacity
          style={styles.collapsibleHeader}
          onPress={() => toggleSection('analysis')}
          activeOpacity={0.7}
        >
          <Text style={styles.collapsibleTitle}>FULL ANALYSIS</Text>
          <View style={styles.collapsibleRight}>
            {expandedSection !== 'analysis' ? (
              <Text style={styles.tapHint}>tap to expand</Text>
            ) : null}
            <Ionicons
              name={
                expandedSection === 'analysis' ? 'chevron-up' : 'chevron-down'
              }
              size={16}
              color={Colors.textTertiary}
            />
          </View>
        </TouchableOpacity>
        {expandedSection === 'analysis' ? (
          <View style={styles.collapsibleBody}>
            <Text style={styles.collapsibleBodyText}>
              {stripEmDash(summary.performanceSummary)}
            </Text>
            {summary.nextWeekChanges ? (
              <>
                <View style={styles.collapsibleDivider} />
                <Text style={styles.collapsibleSectionLabel}>
                  WHAT&apos;S CHANGING
                </Text>
                <Text style={styles.collapsibleBodyText}>
                  {stripEmDash(summary.nextWeekChanges)}
                </Text>
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function WeeklyCoachSummaryScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { planId, weekNumber } = route.params;

  useEffect(() => {
    const key = `summary_viewed_${planId}_week${weekNumber}`;
    void AsyncStorage.setItem(key, 'true');
  }, [planId, weekNumber]);

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

      const [{ data: planRow }, { data: exactRow, error: exactErr }] = await Promise.all([
        supabase.from('plans').select('current_week').eq('id', planId).maybeSingle(),
        supabase
          .from('weekly_summaries')
          .select('id, week_number, summary_json, generated_at')
          .eq('plan_id', planId)
          .eq('week_number', weekNumber)
          .maybeSingle(),
      ]);

      const currentWeek: number = planRow?.current_week ?? (weekNumber + 1);
      setCurrentWeekNum(currentWeek);

      if (exactErr) throw new Error(exactErr.message);

      if (exactRow) {
        const { data: histRows, error: histErr } = await supabase
          .from('weekly_summaries')
          .select('id, week_number, summary_json, generated_at')
          .eq('plan_id', planId)
          .neq('week_number', weekNumber)
          .order('week_number', { ascending: false })
          .limit(8);

        if (histErr) throw new Error(histErr.message);

        setCurrentSummary(exactRow.summary_json);
        setHistory((histRows ?? []) as WeeklySummaryRow[]);
        await AsyncStorage.removeItem('hone_unviewed_summary_week');
        setLoading(false);
        return;
      }

      /* Prior rows-only — avoids re-invoking when this week wasn't in the truncated top-N list */
      let existing: WeeklySummaryRow[] = [];
      const { data: rows, error: fetchErr } = await supabase
        .from('weekly_summaries')
        .select('id, week_number, summary_json, generated_at')
        .eq('plan_id', planId)
        .order('week_number', { ascending: false })
        .limit(8);

      if (fetchErr) throw new Error(fetchErr.message);
      existing = (rows ?? []) as WeeklySummaryRow[];

      if (weekNumber >= currentWeek && currentWeek > 1) {
        setWeekInProgress(true);
        setLoading(false);
        return;
      }

      const { data: fnData, error: fnErr } = await supabase.functions.invoke(
        'weekly-coach-summary',
        { body: { userId, planId, weekNumber } },
      );

      if (fnErr) throw new Error(fnErr.message ?? 'Edge Function failed');
      if (fnData?.error) throw new Error(fnData.error);

      const summary: WeeklySummaryData = fnData.summary;

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
      setHistory(existing.filter((r) => r.week_number !== weekNumber));
      await AsyncStorage.removeItem('hone_unviewed_summary_week');
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
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Dashboard' as any)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.backHit}
          >
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Weekly Review</Text>
            <Text style={styles.headerSubtitle}>Week {weekNumber}</Text>
          </View>
        </View>

        {loading && (
          <Animated.View style={[styles.loadingCard, { opacity: pulseAnim }]}>
            <View style={styles.loadingSpinnerWrap}>
              <ActivityIndicator size="small" color={Colors.accent} />
            </View>
            <Text style={styles.loadingTitle}>JORDAN IS REVIEWING YOUR WEEK</Text>
            <Text style={styles.loadingSubtext}>This takes a few seconds</Text>
          </Animated.View>
        )}

        {!loading && weekInProgress && (
          <View style={styles.inProgressCard}>
            <Ionicons name="barbell-outline" size={32} color={Colors.textSecondary} />
            <Text style={styles.inProgressTitle}>Week {weekNumber} is in progress</Text>
            <Text style={styles.inProgressBody}>
              {
                "Nothing to review yet — go earn it. Complete your sessions and I'll break down exactly how you did."
              }
            </Text>
            <Pressable
              style={styles.startWorkoutCTA}
              onPress={() => {
                const tabNav = navigation.getParent();
                if (tabNav) {
                  tabNav.reset({
                    index: 1,
                    routes: [
                      {
                        name: 'HomeTab',
                        state: { routes: [{ name: 'Dashboard' }], index: 0 },
                      },
                      {
                        name: 'WorkoutTab',
                        state: { routes: [{ name: 'WorkoutHome' }], index: 0 },
                      },
                      {
                        name: 'ProgressTab',
                        state: { routes: [{ name: 'ProgressCharts' }], index: 0 },
                      },
                      {
                        name: 'NutritionTab',
                        state: { routes: [{ name: 'MacroTracker' }], index: 0 },
                      },
                      {
                        name: 'ProfileTab',
                        state: { routes: [{ name: 'ProfileSettings' }], index: 0 },
                      },
                    ],
                  } as any);
                } else {
                  navigation.navigate(
                    'Dashboard',
                    {
                      screen: 'WorkoutTab',
                      params: { screen: 'WorkoutHome' },
                    } as any,
                  );
                }
              }}
            >
              <Text style={styles.startWorkoutCTAText}>
                {`Start Today's Workout →`}
              </Text>
            </Pressable>
          </View>
        )}

        {!loading && error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorMessage}>
              Couldn&apos;t load your weekly summary. Check your connection and try again.
            </Text>
            <TouchableOpacity onPress={fetchSummary} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && currentSummary && (
          <SummaryCards
            summary={currentSummary}
            adaptationWeekNumber={
              currentWeekNum > weekNumber + 1 ? currentWeekNum : weekNumber + 1
            }
            onSeeDetailedChanges={() =>
              navigation.navigate('AdaptationFeed', {
                weekNumber:
                  currentWeekNum > weekNumber + 1 ? currentWeekNum : weekNumber + 1,
              })
            }
          />
        )}

        {!loading && (() => {
        const previousWeekNumbers = Array.from(
          { length: currentWeekNum - 1 },
          (_, i) => i + 1,
        )
          .filter((n) => n !== weekNumber)
          .reverse();

          return (
            <>
              <Text style={styles.previousSectionHeading}>PREVIOUS WEEKS</Text>

              {previousWeekNumbers.length === 0 ? (
                <View style={styles.previousWeeksCard}>
                  <Text style={styles.previousWeeksEmpty}>
                    Previous weeks will appear here as you complete them.
                  </Text>
                </View>
              ) : (
                <View style={styles.previousWeeksCard}>
                  {previousWeekNumbers.map((n, idx) => (
                    <TouchableOpacity
                      key={n}
                      style={[
                        styles.prevWeekRow,
                        idx < previousWeekNumbers.length - 1 && styles.prevWeekRowDivider,
                      ]}
                      onPress={() =>
                        navigation.navigate('WeeklyCoachSummary', {
                          planId,
                          weekNumber: n,
                        })
                      }
                      activeOpacity={0.7}
                    >
                      <Text style={styles.prevWeekLabel}>Week {n}</Text>
                      <Text style={styles.prevWeekChevron}>›</Text>
                    </TouchableOpacity>
                  ))}
                </View>
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
    backgroundColor: Colors.bgPrimary,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 56,
    paddingBottom: Spacing.sm,
  },
  backHit: {
    marginRight: 12,
  },
  backChevron: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FontSizes.heading1,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  loadingCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xxxl,
    alignItems: 'center',
  },
  loadingSpinnerWrap: {
    marginBottom: Spacing.md,
  },
  loadingTitle: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 6,
  },
  loadingSubtext: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  inProgressCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xxxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  inProgressTitle: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  inProgressBody: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 22,
  },
  startWorkoutCTA: {
    alignSelf: 'stretch',
    backgroundColor: Colors.accent,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  startWorkoutCTAText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  errorCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
  },
  errorMessage: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  retryButton: {
    marginTop: Spacing.md,
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  retryText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },

  // ── Summary layout ──
  summaryContent: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },

  // ── Hero ──
  heroCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderLeftWidth: 4,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  ratingPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  ratingPillText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    letterSpacing: 1.5,
  },
  heroHeadline: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    color: Colors.textPrimary,
    lineHeight: 34,
  },
  statStrip: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  statChip: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  statChipValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.accent,
  },
  statChipLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
  },

  // ── Jordan one-liner ──
  jordanNoteCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.xl,
    gap: Spacing.xs,
  },
  jordanLabel: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    letterSpacing: 1.5,
  },
  jordanNoteText: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
    lineHeight: 24,
  },

  // ── Collapsible sections ──
  collapsibleCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  collapsibleTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
  },
  collapsibleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  tapHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
  },
  collapsibleBody: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  collapsibleBodyText: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  collapsibleDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.sm,
  },
  collapsibleSectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  highlightRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  highlightText: {
    flex: 1,
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
    lineHeight: 22,
  },

  // ── Previous weeks ──
  previousSectionHeading: {
    marginTop: Spacing.xxxl,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  previousWeeksCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    marginHorizontal: Spacing.xl,
    overflow: 'hidden',
  },
  previousWeeksEmpty: {
    padding: Spacing.xl,
    textAlign: 'center',
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  prevWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  prevWeekRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  prevWeekLabel: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
  },
  prevWeekChevron: {
    fontSize: 20,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
});

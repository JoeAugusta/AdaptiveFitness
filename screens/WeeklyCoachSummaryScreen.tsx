import { useState, useEffect, useRef, useCallback } from 'react';
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

const RATING_LABELS: Record<PerformanceRating, string> = {
  strong: 'Strong Week',
  'on-track': 'On Track',
  'tough-week': 'Tough Week',
};

function RatingBadge({ rating }: { rating: PerformanceRating }) {
  const label = RATING_LABELS[rating] ?? RATING_LABELS['on-track'];
  const pillExtra =
    rating === 'strong'
      ? styles.ratingPillStrong
      : rating === 'tough-week'
        ? styles.ratingPillTough
        : styles.ratingPillOnTrack;
  const textExtra =
    rating === 'strong'
      ? styles.ratingPillTextStrong
      : rating === 'tough-week'
        ? styles.ratingPillTextTough
        : styles.ratingPillTextOnTrack;

  return (
    <View style={[styles.ratingPill, pillExtra]}>
      <Text style={[styles.ratingPillText, textExtra]}>{label}</Text>
    </View>
  );
}

function SummaryCards({ summary }: { summary: WeeklySummaryData }) {
  const headlineBorder =
    summary.performanceRating === 'strong'
      ? styles.headlineCardBorderStrong
      : summary.performanceRating === 'tough-week'
        ? styles.headlineCardBorderTough
        : styles.headlineCardBorderOnTrack;

  return (
    <View style={styles.summaryContent}>
      <View style={[styles.headlineCard, headlineBorder]}>
        <Text style={styles.headline}>{summary.headline}</Text>
        <RatingBadge rating={summary.performanceRating} />
        <Text style={styles.performanceSummary}>{summary.performanceSummary}</Text>
      </View>

      <Text style={styles.sectionHeadingWins}>{"THIS WEEK'S WINS"}</Text>
      <View style={styles.contentCard}>
        <View style={styles.highlightsList}>
          {summary.highlights.map((item, i) => (
            <View
              key={i}
              style={[
                styles.highlightRow,
                i === summary.highlights.length - 1 && styles.highlightRowLast,
              ]}
            >
              <Text style={styles.checkIcon}>✓</Text>
              <Text style={styles.highlightText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.sectionHeadingNext}>{"WHAT'S CHANGING NEXT WEEK"}</Text>
      <View style={styles.contentCard}>
        <Text style={styles.sectionBody}>{summary.nextWeekChanges}</Text>
      </View>

      <Text style={styles.sectionHeadingNutrition}>NUTRITION CHECK-IN</Text>
      <View style={styles.contentCard}>
        <Text style={styles.sectionBody}>{summary.nutritionCheckin}</Text>
      </View>

      <View style={styles.jordanNoteCard}>
        <View style={styles.jordanLabelRow}>
          <Text style={styles.jordanLabel}>JORDAN</Text>
        </View>
        <Text style={styles.jordanNoteText}>{summary.motivationalNote}</Text>
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
        await AsyncStorage.removeItem('afc_unviewed_summary_week');
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

      if (weekNumber >= currentWeek) {
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
      await AsyncStorage.removeItem('afc_unviewed_summary_week');
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
            <Text style={styles.inProgressEmoji}>🏋️</Text>
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
          <SummaryCards summary={currentSummary} />
        )}

        {!loading && (() => {
          const previousWeekNumbers = Array.from(
            { length: currentWeekNum - 1 },
            (_, i) => i + 1,
          ).reverse();

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
  inProgressEmoji: {
    fontFamily: Fonts.regular,
    fontSize: 40,
    marginBottom: Spacing.md,
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

  summaryContent: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
  },
  headlineCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderLeftWidth: 3,
  },
  headlineCardBorderStrong: {
    borderLeftColor: Colors.success,
  },
  headlineCardBorderOnTrack: {
    borderLeftColor: Colors.accent,
  },
  headlineCardBorderTough: {
    borderLeftColor: Colors.warning,
  },
  headline: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    lineHeight: 28,
    marginBottom: Spacing.md,
  },
  ratingPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  ratingPillStrong: {
    backgroundColor: Colors.successMuted,
  },
  ratingPillOnTrack: {
    backgroundColor: Colors.accentMuted,
  },
  ratingPillTough: {
    backgroundColor: Colors.warningMuted,
  },
  ratingPillText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold,
  },
  ratingPillTextStrong: {
    color: Colors.success,
  },
  ratingPillTextOnTrack: {
    color: Colors.accent,
  },
  ratingPillTextTough: {
    color: Colors.warning,
  },
  performanceSummary: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginTop: Spacing.md,
  },

  sectionHeadingWins: {
    marginTop: Spacing.xxl,
    marginBottom: Spacing.md,
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionHeadingNext: {
    marginTop: Spacing.xxl,
    marginBottom: Spacing.md,
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionHeadingNutrition: {
    marginTop: Spacing.xxl,
    marginBottom: Spacing.md,
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  contentCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
  },
  highlightsList: {
    gap: 0,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: Spacing.md,
  },
  highlightRowLast: {
    marginBottom: 0,
  },
  checkIcon: {
    width: 20,
    color: Colors.accent,
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
  },
  highlightText: {
    flex: 1,
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  sectionBody: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    lineHeight: 22,
  },

  jordanNoteCard: {
    marginTop: Spacing.xxl,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  jordanLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
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
    fontStyle: 'italic',
    color: Colors.textPrimary,
    lineHeight: 24,
  },

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

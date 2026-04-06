import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'WorkoutComplete'>;
type RouteType = RouteProp<RootStackParamList, 'WorkoutComplete'>;

const FATIGUE_MAP: Record<
  number,
  { emoji: string; label: string; tip: string }
> = {
  1: {
    emoji: '😴',
    label: 'Wiped',
    tip: 'Take it easy tomorrow — prioritise sleep and light movement.',
  },
  2: {
    emoji: '😓',
    label: 'Tired',
    tip: 'Take it easy tomorrow — prioritise sleep and light movement.',
  },
  3: {
    emoji: '😊',
    label: 'Good',
    tip: 'Good session. Standard recovery applies.',
  },
  4: {
    emoji: '💪',
    label: 'Strong',
    tip: "Great energy today. You're ready to push again soon.",
  },
  5: {
    emoji: '🔥',
    label: 'Beast Mode',
    tip: "Great energy today. You're ready to push again soon.",
  },
};

const STAT_CARDS = (
  totalExercises: number,
  totalSets: number,
  durationMinutes: number,
  prsHit: number,
) => [
  { icon: '🏋️', label: 'Exercises', value: String(totalExercises) },
  { icon: '✅', label: 'Sets Logged', value: String(totalSets) },
  { icon: '⏱️', label: 'Duration', value: `${durationMinutes} min` },
  { icon: '🏆', label: 'PRs Hit', value: String(prsHit), isPr: true },
];

export default function WorkoutCompleteScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const {
    planId,
    weekNumber,
    dayNumber,
    totalSets,
    totalExercises,
    durationMinutes,
    fatigueRating,
    prsHit,
  } = route.params;

  const fatigue = FATIGUE_MAP[fatigueRating] ?? FATIGUE_MAP[3];
  const stats = STAT_CARDS(totalExercises, totalSets, durationMinutes, prsHit);

  // Animations
  const checkScale = useRef(new Animated.Value(0)).current;
  const cardOpacities = useRef(stats.map(() => new Animated.Value(0))).current;
  const skeletonOpacity = useRef(new Animated.Value(0.4)).current;

  // Coaching note state via ref to avoid re-render loop
  const [coachNote, setCoachNote] = [
    useRef<string | null>(null),
    (v: string | null) => {
      coachNote.current = v;
      setCoachNoteDisplay(v);
    },
  ] as const;
  // Separate display state to trigger re-render
  const [coachNoteDisplay, setCoachNoteDisplay] =
    require('react').useState<string | null>(null);
  const [coachLoading, setCoachLoading] =
    require('react').useState(true);

  const [showSummaryBanner, setShowSummaryBanner] = useState(false);
  const [nextWeekReady, setNextWeekReady] = useState(false);
  const [macroAdjustment, setMacroAdjustment] = useState<string | null>(null);

  // Check whether the completed session finishes the week — if so, pre-generate the summary
  useEffect(() => {
    async function checkWeekCompletion() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) return;

        const { data: logs } = await supabase
          .from('workout_logs')
          .select('day_number')
          .eq('user_id', userId)
          .eq('plan_id', planId)
          .eq('week_number', weekNumber);

        const distinctDays = new Set(
          (logs ?? []).map((r: { day_number: number }) => r.day_number),
        ).size;

        const { data: planRow } = await supabase
          .from('plans')
          .select('plan_json, current_week')
          .eq('id', planId)
          .single();

        const daysPerWeek: number = planRow?.plan_json?.daysPerWeek ?? 7;
        const currentWeek: number = planRow?.current_week ?? (weekNumber + 1);

        if (distinctDays < daysPerWeek) return;
        if (weekNumber >= currentWeek) return;

        supabase.functions
          .invoke('weekly-coach-summary', { body: { userId, planId, weekNumber } })
          .then(async ({ data, error }) => {
            if (error) {
              console.error('weekly-coach-summary error:', error);
              return;
            }
            if (!data?.summary) {
              console.error('weekly-coach-summary: no summary in response', data);
              return;
            }
            const { error: upsertError } = await supabase
              .from('weekly_summaries')
              .upsert(
                {
                  user_id: userId,
                  plan_id: planId,
                  week_number: weekNumber,
                  summary_json: data.summary,
                  generated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,plan_id,week_number' },
              );
            if (upsertError) {
              console.error('weekly_summaries upsert error:', upsertError);
              return;
            }
            setShowSummaryBanner(true);

            try {
              const { data: macroAdj } = await supabase.functions.invoke(
                'adjust-macros',
                { body: { userId, planId, weekNumber } },
              );
              if (macroAdj?.status === 'adjusted' && macroAdj.reasoning) {
                setMacroAdjustment(macroAdj.reasoning);
              }
            } catch (macroErr) {
              console.error('adjust-macros invoke failed:', macroErr);
            }

            try {
              await supabase.functions.invoke('generate-meals', { body: { userId } });
            } catch {
              // Silent — weekly meal refresh is non-critical
            }
          })
          .catch((err) => {
            console.error('weekly-coach-summary invoke failed:', err);
          });

        supabase.functions
          .invoke('generate-next-week', {
            body: { userId, planId, completedWeekNumber: weekNumber },
          })
          .then(({ data, error }) => {
            if (error) return;
            if (data?.status === 'success') setNextWeekReady(true);
            if (data?.status === 'plan_complete') setNextWeekReady(false);
          })
          .catch(() => {
            // Non-critical — plan generation failure is silent here
          });
      } catch {
        // Non-critical
      }
    }

    checkWeekCompletion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // 1 — Checkmark spring
    Animated.spring(checkScale, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();

    // 2 — Stat cards sequential fade-in
    const anims = cardOpacities.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 300,
        delay: i * 100,
        useNativeDriver: true,
      }),
    );
    Animated.parallel(anims).start();

    // 3 — Skeleton pulse
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonOpacity, {
          toValue: 0.8,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(skeletonOpacity, {
          toValue: 0.4,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();

    // 4 — Non-blocking coaching note fetch
    supabase.functions
      .invoke('coaching-feedback', {
        body: {
          exerciseName: 'session_summary',
          targetReps: `${totalSets} sets across ${totalExercises} exercises`,
          targetWeight: 0,
          targetRpe: 7,
          loggedReps: totalSets,
          loggedWeight: 0,
          loggedRpe: fatigueRating * 2,
        },
      })
      .then(({ data }) => {
        pulse.stop();
        setCoachLoading(false);
        setCoachNoteDisplay(data?.feedback ?? 'Great session — keep building on this!');
      })
      .catch(() => {
        pulse.stop();
        setCoachLoading(false);
        setCoachNoteDisplay('Great session — keep building on this!');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <Animated.View
            style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}
          >
            <Text style={styles.checkmark}>✓</Text>
          </Animated.View>
          <Text style={styles.heroTitle}>Workout Complete!</Text>
          <Text style={styles.heroSubtitle}>
            Week {weekNumber} · Day {dayNumber}
          </Text>
        </View>

        <View style={styles.statsGrid}>
          {stats.map((stat, i) => {
            const isPrCard = stat.isPr && prsHit > 0;
            return (
              <Animated.View
                key={stat.label}
                style={[
                  styles.statCard,
                  isPrCard && styles.statCardPr,
                  { opacity: cardOpacities[i] },
                ]}
              >
                <Text style={styles.statIcon}>{stat.icon}</Text>
                <Text style={[styles.statValue, isPrCard && styles.statValuePr]}>
                  {stat.value}
                </Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </Animated.View>
            );
          })}
        </View>

        {showSummaryBanner && (
          <View style={styles.summaryBanner}>
            <View style={styles.summaryBannerTitleRow}>
              <Text style={styles.summaryBannerEmoji}>🎉</Text>
              <Text style={styles.summaryBannerTitle}>
                Week {weekNumber} Complete!
              </Text>
            </View>
            <Text style={styles.summaryBannerSubtitle}>
              Your weekly coach review is ready.
            </Text>
            {nextWeekReady ? (
              <Text style={styles.summaryBannerSubtitleSuccess}>
                Week {weekNumber + 1} is ready — head to your Dashboard.
              </Text>
            ) : null}
            <TouchableOpacity
              style={styles.summaryBannerButton}
              activeOpacity={0.8}
              onPress={() =>
                navigation.navigate('WeeklyCoachSummary', {
                  planId,
                  weekNumber,
                })
              }
            >
              <Text style={styles.summaryBannerButtonText}>
                View Weekly Summary
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {macroAdjustment ? (
          <View style={styles.macroCard}>
            <View style={styles.macroCardTitleRow}>
              <Text style={styles.macroCardEmoji}>📊</Text>
              <Text style={styles.macroCardTitle}>Macros Updated</Text>
            </View>
            <Text style={styles.macroCardBody}>{macroAdjustment}</Text>
          </View>
        ) : null}

        <View style={styles.recoveryCard}>
          <Text style={styles.recoverySectionLabel}>RECOVERY STATUS</Text>
          <View style={styles.fatigueRow}>
            <Text style={styles.fatigueEmoji}>{fatigue.emoji}</Text>
            <Text style={styles.fatigueLabel}>{fatigue.label}</Text>
          </View>
          <Text style={styles.fatigueTip}>{fatigue.tip}</Text>
        </View>

        <View style={styles.coachCard}>
          <View style={styles.coachHeader}>
            <Text style={styles.coachBrand}>JORDAN</Text>
          </View>
          {coachLoading ? (
            <View>
              <Animated.View
                style={[
                  styles.coachSkeletonLine,
                  { opacity: skeletonOpacity },
                ]}
              />
              <Animated.View
                style={[
                  styles.coachSkeletonLineShort,
                  { opacity: skeletonOpacity },
                ]}
              />
            </View>
          ) : (
            <Text style={styles.coachNote}>{coachNoteDisplay}</Text>
          )}
        </View>

        <View style={styles.footerSpacer} />
      </ScrollView>

      {/* ── Section 5: Fixed action buttons ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.8}
          onPress={() =>
            navigation.reset({ index: 0, routes: [{ name: 'Dashboard' }] })
          }
        >
          <Text style={styles.primaryButtonText}>Back to Dashboard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('PlanView')}
        >
          <Text style={styles.secondaryButtonText}>View Full Plan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  scrollView: {
    backgroundColor: Colors.bgPrimary,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 72,
    paddingBottom: 160,
  },

  heroSection: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  checkmark: {
    fontSize: 38,
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
  },
  heroTitle: {
    fontSize: FontSizes.display,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  statCard: {
    width: '47%',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  statCardPr: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
  },
  statIcon: {
    fontFamily: Fonts.regular,
    fontSize: 24,
    marginBottom: Spacing.sm,
  },
  statValue: {
    fontSize: FontSizes.display,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  statValuePr: {
    color: Colors.accent,
  },
  statLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },

  recoveryCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  recoverySectionLabel: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  fatigueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  fatigueEmoji: {
    fontFamily: Fonts.regular,
    fontSize: 32,
  },
  fatigueLabel: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  fatigueTip: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  coachCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  coachBrand: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    letterSpacing: 1.5,
  },
  coachNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  coachSkeletonLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.bgElevated,
    width: '90%',
    alignSelf: 'flex-start',
  },
  coachSkeletonLineShort: {
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.bgElevated,
    width: '70%',
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
  },

  footerSpacer: {
    height: 120,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.bgPrimary,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    gap: 10,
  },
  primaryButton: {
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
  },
  secondaryButton: {
    height: 52,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold,
    color: Colors.accent,
  },

  summaryBanner: {
    marginBottom: Spacing.lg,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  summaryBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  summaryBannerEmoji: {
    fontFamily: Fonts.regular,
    fontSize: 20,
  },
  summaryBannerTitle: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    flex: 1,
  },
  summaryBannerSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  summaryBannerSubtitleSuccess: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.success,
    marginTop: 6,
  },
  summaryBannerButton: {
    marginTop: 14,
    height: 46,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBannerButtonText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },

  macroCard: {
    marginBottom: Spacing.lg,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  macroCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  macroCardEmoji: {
    fontFamily: Fonts.regular,
    fontSize: 20,
  },
  macroCardTitle: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    flex: 1,
  },
  macroCardBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginTop: Spacing.sm,
  },
});

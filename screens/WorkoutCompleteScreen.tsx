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
import { Colors } from '../constants/design';

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
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Week Complete Banner (appears once Edge Function resolves) ── */}
        {showSummaryBanner && (
          <View style={styles.summaryBanner}>
            <Text style={styles.summaryBannerTitle}>Week {weekNumber} Complete 🎉</Text>
            <Text style={styles.summaryBannerSubtitle}>
              Your weekly coach review is ready.
            </Text>
            {nextWeekReady && (
              <Text style={styles.summaryBannerSubtitle}>
                Week {weekNumber + 1} is ready — head to your Dashboard.
              </Text>
            )}
            <TouchableOpacity
              style={styles.summaryBannerButton}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('WeeklyCoachSummary', { planId, weekNumber })}
            >
              <Text style={styles.summaryBannerButtonText}>View Weekly Summary</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Macro Adjustment Card ── */}
        {macroAdjustment && (
          <View style={styles.macroCard}>
            <Text style={styles.macroCardTitle}>Macros Updated 📊</Text>
            <Text style={styles.macroCardBody}>{macroAdjustment}</Text>
          </View>
        )}

        {/* ── Section 1: Hero ── */}
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

        {/* ── Section 2: Stats 2×2 grid ── */}
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

        {/* ── Section 3: Fatigue Summary ── */}
        <View style={styles.card}>
          <Text style={styles.cardSectionLabel}>RECOVERY STATUS</Text>
          <View style={styles.fatigueRow}>
            <Text style={styles.fatigueEmoji}>{fatigue.emoji}</Text>
            <Text style={styles.fatigueLabel}>{fatigue.label}</Text>
          </View>
          <Text style={styles.fatigueTip}>{fatigue.tip}</Text>
        </View>

        {/* ── Section 4: Coach's Note ── */}
        <View style={styles.card}>
          <View style={styles.coachHeader}>
            <Text style={styles.coachEmoji}>🤖</Text>
            <Text style={styles.cardSectionLabel}>YOUR COACH</Text>
          </View>
          {coachLoading ? (
            <Animated.View
              style={[styles.skeleton, { opacity: skeletonOpacity }]}
            />
          ) : (
            <Text style={styles.coachNote}>{coachNoteDisplay}</Text>
          )}
        </View>

        {/* Bottom padding so content isn't hidden behind the fixed footer */}
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
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 24,
  },

  /* Hero */
  heroSection: { alignItems: 'center', marginBottom: 32 },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  checkmark: { fontSize: 38, color: '#FFFFFF', fontWeight: '700' }, // TODO: map to design token
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  heroSubtitle: { fontSize: 15, color: Colors.textSecondary },

  /* Stats grid */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    width: '47%',
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  statCardPr: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accent,
  },
  statIcon: { fontSize: 20, marginBottom: 8 },
  statValue: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  statValuePr: { color: Colors.accent },
  statLabel: { fontSize: 12, color: Colors.textSecondary },

  /* Shared card */
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  cardSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 10,
  },

  /* Fatigue */
  fatigueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  fatigueEmoji: { fontSize: 32 },
  fatigueLabel: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  fatigueTip: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  /* Coach */
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  coachEmoji: { fontSize: 14 },
  coachNote: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22 },
  skeleton: {
    height: 16,
    backgroundColor: Colors.divider,
    borderRadius: 8,
    width: '100%',
  },

  /* Footer */
  footerSpacer: { height: 120 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.bgPrimary,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: Colors.bgCard,
    gap: 10,
  },
  primaryButton: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: { fontSize: 17, fontWeight: '600', color: '#FFFFFF' }, // TODO: map to design token
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.accent,
  },
  secondaryButtonText: { fontSize: 17, fontWeight: '600', color: Colors.accent },

  /* Week complete summary banner */
  summaryBanner: {
    backgroundColor: Colors.bgCard,
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryBannerTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  summaryBannerSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
  },
  summaryBannerButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  summaryBannerButtonText: {
    color: '#FFFFFF', // TODO: map to design token
    fontSize: 14,
    fontWeight: '700',
  },

  /* Macro adjustment card */
  macroCard: {
    backgroundColor: Colors.bgCard,
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  macroCardTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  macroCardBody: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});

import { useEffect, useRef } from 'react';
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

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const CARD_SELECTED_BG = 'rgba(59,130,246,0.12)';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';

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
  container: { flex: 1, backgroundColor: BG_DARK },
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
    backgroundColor: ACCENT_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: ACCENT_BLUE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  checkmark: { fontSize: 38, color: '#FFFFFF', fontWeight: '700' },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 6,
  },
  heroSubtitle: { fontSize: 15, color: TEXT_SECONDARY },

  /* Stats grid */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    width: '47%',
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  statCardPr: {
    backgroundColor: CARD_SELECTED_BG,
    borderColor: ACCENT_BLUE,
  },
  statIcon: { fontSize: 20, marginBottom: 8 },
  statValue: {
    fontSize: 26,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  statValuePr: { color: ACCENT_BLUE },
  statLabel: { fontSize: 12, color: TEXT_SECONDARY },

  /* Shared card */
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  cardSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_SECONDARY,
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
  fatigueLabel: { fontSize: 20, fontWeight: '700', color: TEXT_PRIMARY },
  fatigueTip: { fontSize: 14, color: TEXT_SECONDARY, lineHeight: 20 },

  /* Coach */
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  coachEmoji: { fontSize: 14 },
  coachNote: { fontSize: 15, color: TEXT_SECONDARY, lineHeight: 22 },
  skeleton: {
    height: 16,
    backgroundColor: '#334155',
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
    backgroundColor: BG_DARK,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    gap: 10,
  },
  primaryButton: {
    backgroundColor: ACCENT_BLUE,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: ACCENT_BLUE,
  },
  secondaryButtonText: { fontSize: 17, fontWeight: '600', color: ACCENT_BLUE },
});

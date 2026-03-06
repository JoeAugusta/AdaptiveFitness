import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const CARD_SELECTED_BG = 'rgba(59,130,246,0.12)';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const DISABLED_BG = '#334155';

const DIVIDER_COLOR = '#2D3F55';

// TODO: When plan data is loaded from Supabase, check if today is a
// rest day. If so, replace the Today's Workout Card with a Rest Day
// card: CARD_BG, same borderRadius, centered content showing
// "Rest Day 💤" heading and a short recovery tip message.

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingTop}>Good morning,</Text>
            <Text style={styles.greetingName}>Joe</Text>
          </View>
          <View style={styles.profileButton}>
            <Text style={styles.profileInitial}>J</Text>
          </View>
        </View>

        {/* ── 2. Today's Workout Card ── */}
        <View style={styles.workoutCard}>
          {/* Left accent bar */}
          <View style={styles.accentBar} />

          {/* Top label row */}
          <View style={styles.workoutTopRow}>
            <Text style={styles.workoutLabel}>TODAY'S WORKOUT</Text>
            <View style={styles.dayBadge}>
              <Text style={styles.dayBadgeText}>Day 3</Text>
            </View>
          </View>

          {/* Workout name */}
          <Text style={styles.workoutName}>Upper Body A</Text>

          {/* Muscle group chips */}
          <View style={styles.chipRow}>
            {['Chest', 'Back', 'Shoulders'].map((muscle) => (
              <View key={muscle} style={styles.muscleChip}>
                <Text style={styles.muscleChipText}>{muscle}</Text>
              </View>
            ))}
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>4</Text>
              <Text style={styles.statLabel}>exercises</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>16</Text>
              <Text style={styles.statLabel}>sets</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>60</Text>
              <Text style={styles.statLabel}>min</Text>
            </View>
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={styles.ctaButton}
            activeOpacity={0.8}
            onPress={() => console.log('Start Workout pressed')}
          >
            <Text style={styles.ctaText}>Start Workout →</Text>
          </TouchableOpacity>
        </View>

        {/* ── 3. Week Progress Bar ── */}
        <View style={styles.weekCard}>
          <View style={styles.weekTopRow}>
            <Text style={styles.weekLabel}>WEEK 1 OF 8</Text>
            <Text style={styles.weekSessions}>3 of 4 sessions</Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>

          {/* Day dots */}
          <View style={styles.dotsRow}>
            {[1, 2, 3, 4].map((day) => {
              const isComplete = day <= 3;
              const isCurrent = day === 4;
              return (
                <View
                  key={day}
                  style={[
                    styles.dayDot,
                    isComplete && styles.dayDotComplete,
                    isCurrent && styles.dayDotCurrent,
                  ]}
                >
                  {isComplete && (
                    <Text style={styles.dotCheckmark}>✓</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* ── 4. Quick Stats Row ── */}
        <View style={styles.quickStatsRow}>
          <View style={styles.quickStatCard}>
            <Text style={styles.quickStatEmoji}>🔥</Text>
            <Text style={styles.quickStatValue}>7</Text>
            <Text style={styles.quickStatLabel}>Day streak</Text>
          </View>
          <View style={styles.quickStatCard}>
            <Text style={styles.quickStatEmoji}>⚡</Text>
            <Text style={styles.quickStatValue}>24</Text>
            <Text style={styles.quickStatLabel}>Sessions</Text>
          </View>
          <View style={styles.quickStatCard}>
            <Text style={styles.quickStatEmoji}>📈</Text>
            <View style={styles.volRow}>
              <Text style={styles.quickStatValue}>12,400</Text>
              <Text style={styles.volUnit}>kg</Text>
            </View>
            <Text style={styles.quickStatLabel}>Vol. this week</Text>
          </View>
        </View>

        {/* ── 5. Coach Message Card ── */}
        <View style={styles.coachCard}>
          {/* Header row */}
          <View style={styles.coachHeaderRow}>
            <View style={styles.coachTitleGroup}>
              <Text style={styles.coachEmoji}>🤖</Text>
              <Text style={styles.coachTitle}>Your Coach</Text>
            </View>
            <View style={styles.weekPill}>
              <Text style={styles.weekPillText}>Week 1</Text>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Message */}
          <Text style={styles.coachMessage}>
            Great start to the week, Joe. You hit all your targets on Monday and
            Wednesday. For today's upper session, focus on controlling the
            eccentric on your bench press sets — your RPE was high last time.
            Let's keep the momentum going.
          </Text>

          {/* Bottom row */}
          <View style={styles.coachFooterRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => console.log('Weekly Summary pressed')}
            >
              <Text style={styles.coachLink}>Weekly Summary →</Text>
            </TouchableOpacity>
            <Text style={styles.coachUpdated}>Updated today</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG_DARK,
  },
  scroll: {
    flex: 1,
    backgroundColor: BG_DARK,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 60,
    marginBottom: 24,
  },
  greetingTop: {
    fontSize: 14,
    color: TEXT_SECONDARY,
  },
  greetingName: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },

  /* ── Today's Workout Card ── */
  workoutCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    paddingLeft: 24,
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: ACCENT_BLUE,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  workoutTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  workoutLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: ACCENT_BLUE,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  dayBadge: {
    backgroundColor: CARD_SELECTED_BG,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  dayBadgeText: {
    fontSize: 12,
    color: ACCENT_BLUE,
  },
  workoutName: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginTop: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  muscleChip: {
    backgroundColor: DISABLED_BG,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 6,
  },
  muscleChipText: {
    fontSize: 11,
    color: TEXT_SECONDARY,
  },
  divider: {
    height: 1,
    backgroundColor: DIVIDER_COLOR,
    marginTop: 16,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  statLabel: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },
  ctaButton: {
    marginTop: 16,
    backgroundColor: ACCENT_BLUE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },

  /* ── Week Progress Card ── */
  weekCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  weekTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weekLabel: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    textTransform: 'uppercase',
  },
  weekSessions: {
    fontSize: 12,
    color: TEXT_SECONDARY,
  },
  progressTrack: {
    marginTop: 10,
    height: 6,
    borderRadius: 3,
    backgroundColor: DISABLED_BG,
  },
  progressFill: {
    width: '75%',
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT_BLUE,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  dayDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: DISABLED_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotComplete: {
    backgroundColor: ACCENT_BLUE,
  },
  dayDotCurrent: {
    backgroundColor: CARD_SELECTED_BG,
    borderWidth: 1.5,
    borderColor: ACCENT_BLUE,
  },
  dotCheckmark: {
    fontSize: 14,
    color: '#FFFFFF',
  },

  /* ── Quick Stats Row ── */
  quickStatsRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 10,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
  },
  quickStatEmoji: {
    fontSize: 20,
  },
  quickStatValue: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginTop: 4,
  },
  quickStatLabel: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    marginTop: 2,
    textAlign: 'center',
  },
  volRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    marginTop: 4,
  },
  volUnit: {
    fontSize: 10,
    color: TEXT_SECONDARY,
  },

  /* ── Coach Message Card ── */
  coachCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  coachHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coachTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  coachEmoji: {
    fontSize: 18,
  },
  coachTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginLeft: 8,
  },
  weekPill: {
    backgroundColor: CARD_SELECTED_BG,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  weekPillText: {
    fontSize: 11,
    color: ACCENT_BLUE,
  },
  coachMessage: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    lineHeight: 22,
  },
  coachFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  coachLink: {
    fontSize: 13,
    color: ACCENT_BLUE,
  },
  coachUpdated: {
    fontSize: 11,
    color: TEXT_SECONDARY,
  },
});

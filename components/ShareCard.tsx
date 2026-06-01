import { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Fonts } from '../constants/design';
import { stripEmDash } from '../utils/jordanText';

export const SHARE_CARD_SIZE = 1080;

export type ShareCardProps = {
  sessionTitle: string;
  weekNumber: number;
  dayNumber: number;
  totalSets: number;
  avgRpe: number;
  volumeLbs: number;
  jordanNote: string;
};

function formatVolumeLbs(lbs: number): string {
  return Math.round(lbs).toLocaleString('en-US');
}

function formatAvgRpe(avgRpe: number): string {
  if (avgRpe <= 0) return '—';
  return avgRpe.toFixed(1);
}

export const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard(
  {
    sessionTitle,
    weekNumber,
    dayNumber,
    totalSets,
    avgRpe,
    volumeLbs,
    jordanNote,
  },
  ref,
) {
  const note = stripEmDash(jordanNote);

  return (
    <View
      ref={ref}
      style={styles.card}
      collapsable={false}
    >
      <View style={styles.accentBar} />
      <View style={styles.inner}>
        <Text style={styles.wordmark}>hone</Text>

        <Text style={styles.completeLabel}>WORKOUT COMPLETE</Text>

        <Text style={styles.sessionTitle} numberOfLines={2}>
          {sessionTitle}
        </Text>
        <Text style={styles.weekDay}>
          Week {weekNumber} · Day {dayNumber}
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{totalSets}</Text>
            <Text style={styles.statLabel}>Sets</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{formatAvgRpe(avgRpe)}</Text>
            <Text style={styles.statLabel}>RPE</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{formatVolumeLbs(volumeLbs)}</Text>
            <Text style={styles.statLabel}>lbs</Text>
          </View>
        </View>

        <Text style={styles.jordanNote}>&quot;{note}&quot;</Text>

        <Text style={styles.footerUrl}>hone.app</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_SIZE,
    height: SHARE_CARD_SIZE,
    backgroundColor: Colors.bgPrimary,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  accentBar: {
    width: 4,
    backgroundColor: Colors.accent,
    alignSelf: 'stretch',
  },
  inner: {
    flex: 1,
    paddingTop: 80,
    paddingBottom: 80,
    paddingHorizontal: 72,
    justifyContent: 'space-between',
  },
  wordmark: {
    fontFamily: Fonts.bold,
    fontSize: 56,
    color: Colors.accent,
    letterSpacing: -1,
  },
  completeLabel: {
    fontFamily: Fonts.bold,
    fontSize: 24,
    color: Colors.textSecondary,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 48,
  },
  sessionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 52,
    color: Colors.textPrimary,
    marginTop: 32,
    lineHeight: 60,
  },
  weekDay: {
    fontFamily: Fonts.regular,
    fontSize: 32,
    color: Colors.textSecondary,
    marginTop: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 56,
    marginBottom: 56,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: 20,
    paddingVertical: 36,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontFamily: Fonts.bold,
    fontSize: 64,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  statLabel: {
    fontFamily: Fonts.medium,
    fontSize: 24,
    color: Colors.textSecondary,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  jordanNote: {
    fontFamily: Fonts.regular,
    fontSize: 34,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 48,
    flexShrink: 1,
  },
  footerUrl: {
    fontFamily: Fonts.regular,
    fontSize: 26,
    color: Colors.textTertiary,
    alignSelf: 'flex-end',
    marginTop: 24,
  },
});

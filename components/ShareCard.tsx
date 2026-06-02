import { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Fonts } from '../constants/design';
import { stripEmDash } from '../utils/jordanText';
import { formatShareLiftLine, type ShareTopLift } from '../utils/workoutShare';

export const SHARE_CARD_SIZE = 1080;

const CARD_BG = '#09090B';

export type ShareCardProps = {
  sessionTitle: string;
  weekNumber: number;
  dayNumber: number;
  totalSets: number;
  avgRpe: number;
  durationMinutes: number;
  topLifts: ShareTopLift[];
  jordanNote: string;
};

function formatAvgRpe(avgRpe: number): string {
  if (avgRpe <= 0) return '—';
  return avgRpe.toFixed(1);
}

function formatSummaryLine(
  totalSets: number,
  avgRpe: number,
  durationMinutes: number,
): string {
  const parts = [
    `${totalSets} ${totalSets === 1 ? 'set' : 'sets'}`,
    `RPE ${formatAvgRpe(avgRpe)}`,
    `${durationMinutes} min`,
  ];
  return parts.join('  ·  ');
}

export const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard(
  {
    sessionTitle,
    weekNumber,
    dayNumber,
    totalSets,
    avgRpe,
    durationMinutes,
    topLifts,
    jordanNote,
  },
  ref,
) {
  const note = stripEmDash(jordanNote);
  const liftsToShow = topLifts.slice(0, 3);

  return (
    <View ref={ref} style={styles.card} collapsable={false}>
      <View style={styles.inner}>
        <Text style={styles.wordmark}>Hone</Text>
        <View style={styles.accentLine} />

        <Text style={styles.sessionTitle} numberOfLines={2}>
          {sessionTitle.toUpperCase()}
        </Text>
        <Text style={styles.weekDay}>
          Week {weekNumber} · Day {dayNumber}
        </Text>

        {liftsToShow.length > 0 ? (
          <View style={styles.liftsBlock}>
            <Text style={styles.sectionLabel}>TOP LIFTS THIS SESSION</Text>
            {liftsToShow.map((lift) => (
              <View key={lift.exerciseName} style={styles.liftRow}>
                <Text style={styles.liftName} numberOfLines={2}>
                  {lift.exerciseName}
                </Text>
                <Text style={styles.liftStats}>{formatShareLiftLine(lift)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.dividerRow}>
          {Array.from({ length: 10 }).map((_, i) => (
            <View key={i} style={styles.dividerDash} />
          ))}
        </View>

        <Text style={styles.summaryLine}>
          {formatSummaryLine(totalSets, avgRpe, durationMinutes)}
        </Text>

        {note ? (
          <Text style={styles.jordanNote}>&quot;{note}&quot;</Text>
        ) : null}

        <Text style={styles.footerUrl}>hone.app</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_SIZE,
    height: SHARE_CARD_SIZE,
    backgroundColor: CARD_BG,
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    paddingTop: 72,
    paddingBottom: 72,
    paddingHorizontal: 72,
  },
  wordmark: {
    fontFamily: Fonts.bold,
    fontSize: 96,
    color: Colors.accent,
    letterSpacing: -1,
  },
  accentLine: {
    height: 3,
    backgroundColor: Colors.accent,
    marginTop: 24,
    marginBottom: 40,
    alignSelf: 'stretch',
  },
  sessionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 54,
    color: Colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    lineHeight: 62,
  },
  weekDay: {
    fontFamily: Fonts.regular,
    fontSize: 36,
    color: Colors.textSecondary,
    marginTop: 12,
    marginBottom: 48,
  },
  liftsBlock: {
    marginBottom: 40,
    gap: 28,
  },
  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: 30,
    color: Colors.textSecondary,
    letterSpacing: 6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  liftRow: {
    gap: 8,
  },
  liftName: {
    fontFamily: Fonts.bold,
    fontSize: 42,
    color: Colors.textPrimary,
    lineHeight: 48,
  },
  liftStats: {
    fontFamily: Fonts.bold,
    fontSize: 60,
    color: Colors.accent,
    lineHeight: 68,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
    paddingVertical: 8,
  },
  dividerDash: {
    width: 48,
    height: 3,
    backgroundColor: Colors.textTertiary,
    opacity: 0.45,
    borderRadius: 2,
  },
  summaryLine: {
    fontFamily: Fonts.regular,
    fontSize: 30,
    color: Colors.textSecondary,
    marginBottom: 28,
  },
  jordanNote: {
    fontFamily: Fonts.regular,
    fontSize: 27,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 38,
    flexShrink: 1,
    marginBottom: 32,
  },
  footerUrl: {
    fontFamily: Fonts.regular,
    fontSize: 27,
    color: Colors.textTertiary,
    alignSelf: 'flex-end',
    marginTop: 'auto',
  },
});

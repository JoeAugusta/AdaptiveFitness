import { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, FontSizes, LineHeights, Radius, Spacing } from '../constants/design';
import { formatShareLiftLine, type ShareTopLift } from '../utils/workoutShare';

export const SHARE_CARD_WIDTH = 375;
export const SHARE_CARD_HEIGHT = Math.round(SHARE_CARD_WIDTH * (5 / 4));

const CARD_BG = Colors.bgPrimary;
const TOP_BG = '#111111';
const FOOTER_BG = '#111111';

export type ShareCardProps = {
  sessionTitle: string;
  weekNumber: number;
  dayNumber: number;
  totalSets: number;
  avgRpe: number;
  durationMinutes: number;
  prsHit: number;
  topLifts: ShareTopLift[];
  jordanNote: string;
};

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
    durationMinutes,
    prsHit,
    topLifts,
  },
  ref,
) {
  const liftsToShow = topLifts.slice(0, 3);

  return (
    <View ref={ref} style={styles.card} collapsable={false}>
      <View style={styles.topAccent} />

      <View style={styles.body}>
        <Text style={styles.wordmark}>Hone</Text>
        <View style={styles.wordmarkDivider} />

        <Text style={styles.sessionTitle} numberOfLines={2}>
          {sessionTitle.toUpperCase()}
        </Text>
        <View style={styles.weekDayPill}>
          <Text style={styles.weekDayText}>
            Week {weekNumber} · Day {dayNumber}
          </Text>
        </View>

        {prsHit > 0 ? (
          <View style={styles.prBanner}>
            <Ionicons name="star" size={14} color={Colors.bgPrimary} />
            <Text style={styles.prBannerText}>
              {prsHit} Personal Best{prsHit > 1 ? 's' : ''} Today
            </Text>
          </View>
        ) : null}

        {liftsToShow.length > 0 ? (
          <View style={styles.liftsBlock}>
            <Text style={styles.sectionLabel}>TOP LIFTS</Text>
            {liftsToShow.map((lift) => (
              <View key={lift.exerciseName} style={styles.liftRow}>
                <Text style={styles.liftName} numberOfLines={2}>
                  {lift.exerciseName.toUpperCase()}
                </Text>
                <Text style={styles.liftStats}>{formatShareLiftLine(lift)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <Ionicons name="layers-outline" size={14} color={Colors.accent} />
            <Text style={styles.statPillText}>
              {totalSets} {totalSets === 1 ? 'set' : 'sets'}
            </Text>
          </View>
          <View style={styles.statPill}>
            <Ionicons name="pulse-outline" size={14} color={Colors.accent} />
            <Text style={styles.statPillText}>RPE {formatAvgRpe(avgRpe)}</Text>
          </View>
          <View style={styles.statPill}>
            <Ionicons name="time-outline" size={14} color={Colors.accent} />
            <Text style={styles.statPillText}>{durationMinutes} min</Text>
          </View>
        </View>
      </View>

      <View style={styles.downloadFooter}>
        <View style={styles.downloadFooterLeft}>
          <Text style={styles.downloadTagline}>Train smarter.</Text>
          <Text style={styles.downloadUrl}>hone.app</Text>
        </View>
        <View style={styles.qrPlaceholder}>
          <Text style={styles.qrPlaceholderText}>↓ hone.app</Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    backgroundColor: CARD_BG,
    overflow: 'hidden',
  },
  topAccent: {
    height: 3,
    width: '100%',
    backgroundColor: Colors.accent,
  },
  body: {
    flex: 1,
    backgroundColor: TOP_BG,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  wordmark: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.accent,
    letterSpacing: -0.5,
  },
  wordmarkDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  sessionTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    lineHeight: LineHeights.heading1,
  },
  weekDayPill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  weekDayText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  prBanner: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.md,
  },
  prBannerText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.bgPrimary,
    letterSpacing: 1,
  },
  liftsBlock: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  liftRow: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.accent,
    paddingLeft: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  liftName: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  liftStats: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.accent,
    lineHeight: 24,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: 'auto',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  statPillText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
  },
  downloadFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: FOOTER_BG,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  downloadFooterLeft: {
    flex: 1,
    gap: 2,
  },
  downloadTagline: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
  },
  downloadUrl: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  qrPlaceholder: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPlaceholderText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.bgPrimary,
    textAlign: 'center',
  },
});

import { forwardRef } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { Colors, Fonts, FontSizes, Radius, Spacing } from '../constants/design';
import { formatShareLiftLine, type ShareTopLift } from '../utils/workoutShare';

export const SHARE_CARD_WIDTH = 375;
export const SHARE_CARD_HEIGHT = Math.round(SHARE_CARD_WIDTH * (5 / 4));

export type ShareCardProps = {
  sessionTitle: string;
  weekNumber: number;
  dayNumber: number;
  totalSets: number;
  totalWeeks: number;
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
    totalWeeks,
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

      {/* Orange arc — top right */}
      <View style={styles.arcContainer} pointerEvents="none">
        <Svg width={240} height={240} viewBox="0 0 100 100" style={StyleSheet.absoluteFillObject}>
          <Circle cx="100" cy="0" r="80" fill="none" stroke={Colors.accent} strokeWidth="14" opacity="0.18" />
        </Svg>
      </View>

      {/* Logo watermark — center */}
      <View style={styles.logoWatermarkContainer} pointerEvents="none">
        <Image
          source={require('../assets/icon.png')}
          style={styles.logoWatermark}
          resizeMode="contain"
        />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>Hone</Text>
        <Text style={styles.weekLabel}>WEEK {weekNumber} OF {totalWeeks}</Text>
      </View>

      {/* Session label */}
      <View style={styles.sessionBlock}>
        <Text style={styles.sessionMeta}>SESSION COMPLETE</Text>
        <Text style={styles.sessionTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {sessionTitle.toUpperCase()}
        </Text>
      </View>

      {/* Big 3 stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCell, styles.statCellBorder]}>
          <Text style={styles.statLabel}>SETS</Text>
          <Text style={styles.statNumber}>{totalSets}</Text>
        </View>
        <View style={[styles.statCell, styles.statCellBorder]}>
          <Text style={styles.statLabel}>AVG RPE</Text>
          <Text style={styles.statNumber}>{formatAvgRpe(avgRpe)}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>MIN</Text>
          <Text style={styles.statNumber}>{durationMinutes}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Top lifts */}
      {liftsToShow.length > 0 ? (
        <View style={styles.liftsBlock}>
          <Text style={styles.liftsHeading}>TOP LIFTS</Text>
          {liftsToShow.map((lift, i) => (
            <View key={lift.exerciseName} style={[styles.liftRow, i < liftsToShow.length - 1 && styles.liftRowBorder]}>
              <Text style={styles.liftName} numberOfLines={1}>{lift.exerciseName}</Text>
              <Text style={styles.liftStat}>{formatShareLiftLine(lift)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {prsHit > 0 ? (
        <View style={styles.prBanner}>
          <Ionicons name="star" size={12} color={Colors.bgPrimary} />
          <Text style={styles.prBannerText}>
            {prsHit} Personal Best{prsHit > 1 ? 's' : ''} Today
          </Text>
        </View>
      ) : null}

      {/* Footer */}
      <View style={styles.footer}>
        <View>
          <Text style={styles.tagline}>Train smarter.</Text>
          <Text style={styles.subTagline}>Your plan adapts every week.</Text>
        </View>
        <Text style={styles.appUrl}>honefitness.app</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    backgroundColor: Colors.bgPrimary,
    overflow: 'hidden',
  },
  arcContainer: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 240,
    height: 240,
  },
  logoWatermarkContainer: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWatermark: {
    width: 220,
    height: 220,
    opacity: 0.045,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  weekLabel: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: '#3a3a3a',
    letterSpacing: 1,
  },
  sessionBlock: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  sessionMeta: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textTertiary,
    letterSpacing: 2.5,
    marginBottom: 4,
  },
  sessionTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
    letterSpacing: 0.3,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  statCell: {
    flex: 1,
  },
  statCellBorder: {
    borderRightWidth: 1,
    borderRightColor: '#1a1a1a',
    marginRight: Spacing.lg,
    paddingRight: Spacing.lg,
  },
  statLabel: {
    fontFamily: Fonts.bold,
    fontSize: 9,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  statNumber: {
    fontFamily: Fonts.bold,
    fontSize: 52,
    color: Colors.accent,
    lineHeight: 62,
    includeFontPadding: false,
  },
  divider: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  liftsBlock: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  liftsHeading: {
    fontFamily: Fonts.bold,
    fontSize: 9,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    marginBottom: Spacing.md,
  },
  liftRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 9,
  },
  liftRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  liftName: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    flex: 1,
    marginRight: Spacing.sm,
  },
  liftStat: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  prBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    alignSelf: 'flex-start',
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  prBannerText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.bgPrimary,
    letterSpacing: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  tagline: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
  },
  subTagline: {
    fontFamily: Fonts.regular,
    fontSize: 10,
    color: '#3a3a3a',
    marginTop: 1,
  },
  appUrl: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
  },
});
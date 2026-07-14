import { forwardRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Fonts, FontSizes, Spacing } from '../constants/design';
import {
  formatShareLiftLineCompact,
  type ShareTopLift,
} from '../utils/workoutShare';
import {
  EmberLeftAccent,
  ShareCardFooter,
  ShareCardHeader,
  ShareCardWatermark,
  ShareDivider,
  ShareMonoLabel,
  SharePrChip,
  ShareStatNumber,
  SHARE_CARD_BG,
  SHARE_LABEL_COLOR,
  SHARE_PR_ROW_BG,
} from './shareCardShared';

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

const LIFT_ROW_HEIGHT = 44;

function formatAvgRpe(avgRpe: number): string {
  if (avgRpe <= 0) return '—';
  return avgRpe.toFixed(1);
}

function ShareLiftRow({ lift }: { lift: ShareTopLift }) {
  const [rowHeight, setRowHeight] = useState(LIFT_ROW_HEIGHT);

  return (
    <View
      style={[styles.liftRow, lift.isPr && styles.liftRowPr]}
      onLayout={(event) => {
        const nextHeight = Math.round(event.nativeEvent.layout.height);
        if (nextHeight > 0 && nextHeight !== rowHeight) {
          setRowHeight(nextHeight);
        }
      }}
    >
      {lift.isPr ? <EmberLeftAccent rowHeight={rowHeight} /> : null}
      <View style={styles.liftRowContent}>
        <View style={styles.liftNameRow}>
          <Text style={styles.liftName} numberOfLines={1} ellipsizeMode="tail">
            {lift.exerciseName}
          </Text>
          {lift.isPr ? <SharePrChip /> : null}
        </View>
        <Text
          style={styles.liftStat}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {formatShareLiftLineCompact(lift)}
        </Text>
      </View>
    </View>
  );
}

export const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard(
  {
    sessionTitle,
    weekNumber,
    totalSets,
    totalWeeks,
    avgRpe,
    durationMinutes,
    topLifts,
  },
  ref,
) {
  const liftsToShow = topLifts.slice(0, 3);

  return (
    <View ref={ref} style={styles.card} collapsable={false}>
      <ShareCardWatermark />

      <ShareCardHeader contextLabel={`WEEK ${weekNumber} OF ${totalWeeks}`} />

      <View style={styles.sessionBlock}>
        <Text style={styles.sessionMeta}>SESSION COMPLETE</Text>
        <Text
          style={styles.sessionTitle}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {sessionTitle}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCell, styles.statCellSets]}>
          <ShareStatNumber>{String(totalSets)}</ShareStatNumber>
          <View style={styles.statLabelWrap}>
            <ShareMonoLabel>SETS</ShareMonoLabel>
          </View>
        </View>
        <View style={[styles.statCell, styles.statCellRpe, styles.statCellBorder]}>
          <ShareStatNumber>{formatAvgRpe(avgRpe)}</ShareStatNumber>
          <View style={styles.statLabelWrap}>
            <ShareMonoLabel>AVG RPE</ShareMonoLabel>
          </View>
        </View>
        <View style={[styles.statCell, styles.statCellMin, styles.statCellBorder]}>
          <ShareStatNumber>{String(durationMinutes)}</ShareStatNumber>
          <View style={styles.statLabelWrap}>
            <ShareMonoLabel>MIN</ShareMonoLabel>
          </View>
        </View>
      </View>

      <ShareDivider />

      {liftsToShow.length > 0 ? (
        <View style={styles.liftsBlock}>
          <ShareMonoLabel>TOP LIFTS</ShareMonoLabel>
          <View style={styles.liftsList}>
            {liftsToShow.map((lift, index) => (
              <View key={`${lift.exerciseName}-${index}`}>
                <ShareLiftRow lift={lift} />
                {index < liftsToShow.length - 1 ? (
                  <View style={styles.liftDivider} />
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.liftsSpacer} />
      )}

      <ShareCardFooter
        tagline="Sharper every session."
        subTagline="The plan adapts to every rep."
      />
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    backgroundColor: SHARE_CARD_BG,
    overflow: 'hidden',
  },
  sessionBlock: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  sessionMeta: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 3,
    marginBottom: 6,
  },
  sessionTitle: {
    fontFamily: Fonts.display,
    fontSize: FontSizes.display,
    color: Colors.textPrimary,
    letterSpacing: 0.2,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  statCell: {
    minWidth: 0,
    flex: 1,
  },
  statCellSets: {
    flex: 1,
  },
  statCellRpe: {
    flex: 1.2,
  },
  statCellMin: {
    flex: 1,
  },
  statCellBorder: {
    borderLeftWidth: 1,
    borderLeftColor: Colors.divider,
    paddingLeft: Spacing.lg,
    marginLeft: Spacing.lg,
  },
  statLabelWrap: {
    marginTop: 4,
  },
  liftsBlock: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
  },
  liftsSpacer: {
    flex: 1,
  },
  liftsList: {
    marginTop: Spacing.md,
  },
  liftRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: LIFT_ROW_HEIGHT,
    paddingVertical: 10,
  },
  liftRowPr: {
    backgroundColor: SHARE_PR_ROW_BG,
    marginHorizontal: -Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  liftRowContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  liftNameRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  liftName: {
    flexShrink: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  liftStat: {
    flexShrink: 0,
    maxWidth: '46%',
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    textAlign: 'right',
  },
  liftDivider: {
    height: 1,
    backgroundColor: Colors.divider,
  },
});

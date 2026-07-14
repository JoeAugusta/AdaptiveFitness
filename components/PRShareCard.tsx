import { View, Text, StyleSheet } from 'react-native';
import type { RefObject } from 'react';
import { Colors, Fonts, FontSizes, Spacing } from '../constants/design';
import { LBS_TO_KG } from '../utils/units';
import {
  ShareCardFooter,
  ShareCardHeader,
  ShareCardWatermark,
  SHARE_CARD_BG,
  SHARE_MUTED_COLOR,
} from './shareCardShared';

export const PR_SHARE_CARD_SIZE = 375;

export type PRShareCardProps = {
  exerciseName: string;
  estimated1RM: number;
  bestWeightLbs: number;
  bestReps: number;
  isMetric: boolean;
  isEstimated?: boolean;
  rank?: number;
  cardRef: RefObject<View | null>;
};

function formatWeight(weightLbs: number, isMetric: boolean): string {
  if (isMetric) {
    return `${Math.round(weightLbs * LBS_TO_KG)}`;
  }
  return `${Math.round(weightLbs)}`;
}

function unitLabel(isMetric: boolean): string {
  return isMetric ? 'kg' : 'lbs';
}

function currentMonthYearLabel(): string {
  return new Date()
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    .toUpperCase();
}

export default function PRShareCard({
  exerciseName,
  bestWeightLbs,
  bestReps,
  isMetric,
  rank,
  cardRef,
}: PRShareCardProps) {
  const displayWeight = formatWeight(bestWeightLbs, isMetric);
  const unit = unitLabel(isMetric);
  const repsLabel = `× ${bestReps} reps`;

  return (
    <View ref={cardRef} style={styles.card} collapsable={false}>
      <ShareCardWatermark />

      <View style={styles.diagonalLineWrap} pointerEvents="none">
        <View style={styles.diagonalLine} />
      </View>

      <ShareCardHeader contextLabel={currentMonthYearLabel()} />

      <View style={styles.body}>
        <View style={styles.badgeRow}>
          <Text style={styles.recordLabel}>NEW PR</Text>
          {typeof rank === 'number' && rank > 0 ? (
            <View style={styles.rankBadge}>
              <Text style={styles.rankBadgeText}>
                <Text style={styles.rankBadgeRank}>#{rank}</Text>
                {' ALL-TIME'}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.numberRow}>
          <Text
            style={styles.weightNumber}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.35}
          >
            {displayWeight}
          </Text>
          <View style={styles.unitRepsStack}>
            <Text style={styles.weightUnit}>{unit}</Text>
            <Text style={styles.repsInline}>{repsLabel}</Text>
          </View>
        </View>

        <Text style={styles.exerciseName} numberOfLines={1} ellipsizeMode="tail">
          {exerciseName}
        </Text>
      </View>

      <ShareCardFooter
        tagline="Sharper every session."
        subTagline="Every PR detected automatically."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: PR_SHARE_CARD_SIZE,
    height: PR_SHARE_CARD_SIZE,
    backgroundColor: SHARE_CARD_BG,
    overflow: 'hidden',
  },
  diagonalLineWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  diagonalLine: {
    position: 'absolute',
    left: -72,
    top: '38%',
    width: 520,
    height: 5,
    backgroundColor: Colors.ember,
    opacity: 0.85,
    transform: [{ rotate: '-20deg' }],
  },
  body: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  recordLabel: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 3,
  },
  rankBadge: {
    borderWidth: 1,
    borderColor: Colors.emberBorder,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  rankBadgeText: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.micro,
    color: Colors.accent,
    letterSpacing: 1,
  },
  rankBadgeRank: {
    fontFamily: Fonts.monoMedium,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginBottom: Spacing.md,
  },
  weightNumber: {
    flexShrink: 1,
    maxWidth: '72%',
    fontFamily: Fonts.display,
    fontSize: 118,
    color: Colors.accent,
    lineHeight: 118,
    letterSpacing: -2,
    includeFontPadding: false,
  },
  weightUnit: {
    fontFamily: Fonts.monoMedium,
    fontSize: 28,
    color: SHARE_MUTED_COLOR,
    paddingBottom: 8,
  },
  unitRepsStack: {
    flexDirection: 'column',
    justifyContent: 'flex-end',
    paddingBottom: 6,
    gap: 4,
  },
  repsInline: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.body,
    color: SHARE_MUTED_COLOR,
    letterSpacing: 0.3,
  },
  exerciseName: {
    fontFamily: Fonts.displaySemi,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
});

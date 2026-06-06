import { View, Text, StyleSheet } from 'react-native';
import type { RefObject } from 'react';
import Svg, { Circle } from 'react-native-svg';
import { Colors, Fonts, FontSizes, Radius, Spacing } from '../constants/design';
import { LBS_TO_KG } from '../utils/units';

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

export default function PRShareCard({
  exerciseName,
  estimated1RM,
  bestWeightLbs,
  bestReps,
  isMetric,
  isEstimated = true,
  rank,
  cardRef,
}: PRShareCardProps) {
  const displayWeight = formatWeight(estimated1RM, isMetric);
  const unit = unitLabel(isMetric);
  const sourceLabel = `${Math.round(bestWeightLbs)} lbs × ${bestReps} reps`;

  return (
    <View ref={cardRef} style={styles.card} collapsable={false}>

      {/* Concentric rings — top right */}
      <View style={styles.ringsContainer} pointerEvents="none">
        <Svg width={320} height={320} viewBox="0 0 100 100" style={styles.ringsSvg}>
          <Circle cx="50" cy="50" r="48" fill="none" stroke="#FFFFFF" strokeWidth="0.8" opacity="0.12" />
          <Circle cx="50" cy="50" r="40" fill="none" stroke="#FFFFFF" strokeWidth="0.4" opacity="0.12" />
          <Circle cx="50" cy="50" r="32" fill="none" stroke="#FFFFFF" strokeWidth="0.3" opacity="0.12" />
        </Svg>
      </View>

      {/* Orange arc — bottom left */}
      <View style={styles.arcContainer} pointerEvents="none">
        <Svg width={200} height={200} viewBox="0 0 100 100" style={styles.arcSvg}>
          <Circle cx="0" cy="100" r="80" fill="none" stroke={Colors.accent} strokeWidth="12" opacity="0.15" />
        </Svg>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>Hone</Text>
        <Text style={styles.weekLabel}>
          {`WEEK ${rank ?? 1} OF 16`}
        </Text>
      </View>

      {/* Main content — bottom aligned */}
      <View style={styles.body}>
        <Text style={styles.recordLabel}>PERSONAL RECORD</Text>

        {/* Big number inline with unit */}
        <View style={styles.numberRow}>
          <Text style={styles.weightNumber}>{displayWeight}</Text>
          <Text style={styles.weightUnit}>{unit}</Text>
        </View>

        {/* Exercise name + source set */}
        <View style={styles.exerciseRow}>
          <Text style={styles.exerciseName} numberOfLines={1}>{exerciseName}</Text>
          <View style={styles.dot} />
          <Text style={styles.sourceLabel}>{sourceLabel}</Text>
        </View>

        <View style={styles.divider} />

        {/* Footer row */}
        <View style={styles.footerRow}>
          <View>
            <Text style={styles.tagline}>Train smarter.</Text>
            <Text style={styles.subTagline}>Your plan adapts every week.</Text>
          </View>
          {typeof rank === 'number' && rank > 0 ? (
            <View style={styles.rankBadge}>
              <Text style={styles.rankBadgeText}>#{rank} ALL-TIME</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: PR_SHARE_CARD_SIZE,
    height: PR_SHARE_CARD_SIZE,
    backgroundColor: Colors.bgPrimary,
    overflow: 'hidden',
  },
  ringsContainer: {
    position: 'absolute',
    top: -30,
    right: -60,
    width: 320,
    height: 320,
  },
  ringsSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  arcContainer: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    width: 200,
    height: 200,
  },
  arcSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
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
  body: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  recordLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textTertiary,
    letterSpacing: 3,
    marginBottom: 6,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginBottom: 12,
  },
  weightNumber: {
    fontFamily: Fonts.bold,
    fontSize: 118,
    color: Colors.accent,
    lineHeight: 100,
    letterSpacing: -4,
  },
  weightUnit: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    color: Colors.accent,
    paddingBottom: 6,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  exerciseName: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textTertiary,
  },
  sourceLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },
  divider: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginBottom: 14,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  rankBadge: {
    backgroundColor: 'rgba(249,115,22,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.4)',
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  rankBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1,
  },
});
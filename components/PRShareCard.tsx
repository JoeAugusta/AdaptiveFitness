import { View, Text, StyleSheet } from 'react-native';
import type { RefObject } from 'react';
import { Colors, Fonts, FontSizes, Radius, Spacing } from '../constants/design';
import { LBS_TO_KG } from '../utils/units';

export const PR_SHARE_CARD_SIZE = 375;

export type PRShareCardProps = {
  exerciseName: string;
  weightLbs: number;
  reps: number;
  isMetric: boolean;
  isEstimated?: boolean;
  rank?: number;
  cardRef: RefObject<View | null>;
};

function formatPrWeight(weightLbs: number, isMetric: boolean): string {
  if (isMetric) {
    return `${Math.round(weightLbs * LBS_TO_KG)} kg`;
  }
  return `${Math.round(weightLbs)} lbs`;
}

export default function PRShareCard({
  exerciseName,
  weightLbs,
  reps,
  isMetric,
  isEstimated = true,
  rank,
  cardRef,
}: PRShareCardProps) {
  const subLabel = isEstimated ? 'Estimated 1RM' : 'Top Set';
  const displayWeight = isEstimated && reps > 1
    ? Math.round(weightLbs * (1 + reps / 30))
    : Math.round(weightLbs);

  return (
    <View ref={cardRef} style={styles.card} collapsable={false}>
      <View style={styles.topAccent} />

      <View style={styles.header}>
        <Text style={styles.wordmark}>Hone</Text>
        <View style={styles.wordmarkDivider} />
      </View>

      <View style={styles.hero}>
        <Text style={styles.prLabel}>NEW PERSONAL RECORD</Text>
        <Text style={styles.exerciseName} numberOfLines={2} adjustsFontSizeToFit>
          {exerciseName}
        </Text>
        <Text style={styles.weightValue}>{formatPrWeight(displayWeight, isMetric)}</Text>
        <Text style={styles.subLabel}>{subLabel}</Text>
        <Text style={styles.sourceLabel}>
          {`${Math.round(weightLbs)} lbs × ${reps} reps`}
        </Text>
        {typeof rank === 'number' && rank > 0 ? (
          <View style={styles.rankBadge}>
            <Text style={styles.rankBadgeText}>#{rank} All-Time</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerTagline}>Train smarter.</Text>
        <Text style={styles.footerUrl}>hone.app</Text>
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
  topAccent: {
    height: 3,
    width: '100%',
    backgroundColor: Colors.accent,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  wordmark: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    color: Colors.accent,
  },
  wordmarkDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginTop: Spacing.sm,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  prLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  exerciseName: {
    fontFamily: Fonts.bold,
    fontSize: 32,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  weightValue: {
    fontFamily: Fonts.bold,
    fontSize: 64,
    color: Colors.accent,
    textAlign: 'center',
  },
  subLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  sourceLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 4,
    textAlign: 'center',
  },
  rankBadge: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    marginTop: Spacing.md,
  },
  rankBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.bgPrimary,
  },
  footer: {
    backgroundColor: '#111111',
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerTagline: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
  },
  footerUrl: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
});

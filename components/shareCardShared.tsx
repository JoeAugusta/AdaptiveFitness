import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Colors, Fonts, Spacing } from '../constants/design';
import BrandLockup, { BrandMark } from './BrandLockup';
export const SHARE_CARD_BG = '#0E0F12';
export const ShareType = {
  monoLabel: 7,
  footerSub: 7,
  footerUrl: 8,
  liftName: 11,
  liftStat: 11,
  footerTagline: 11,
  prReps: 17,
  prExerciseName: 20,
  sessionTitle: 26,
  statNumber: 36,
  prWeightUnit: 28,
  prWeightNumber: 92,
} as const;

export const SHARE_GUTTER = 28;

export const SHARE_BRAND_LOCKUP_SIZE = 16;
export const SHARE_LABEL_COLOR = '#5B636E';
export const SHARE_MUTED_COLOR = '#98A1AC';
export const SHARE_PR_ROW_BG = 'rgba(244,82,14,0.08)';
export const SHARE_SKEW_DEG = '-20deg';
export const SHARE_COUNTER_SKEW_DEG = '20deg';

export function ShareStatNumber({
  children,
  style,
}: {
  children: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.statNumberWrap, style]}>
      <Text
        style={styles.statNumber}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {children}
      </Text>
    </View>
  );
}

export function ShareCardHeader({ contextLabel }: { contextLabel: string }) {
  return (
    <View style={styles.header}>
      <BrandLockup size={SHARE_BRAND_LOCKUP_SIZE} />
      <Text style={styles.headerContext}>{contextLabel}</Text>
    </View>
  );
}

export function ShareCardWatermark() {
  return (
    <View style={styles.watermarkWrap} pointerEvents="none">
      <BrandMark size={280} style={styles.watermarkMark} />
    </View>
  );
}

export function ShareCardFooter({
  tagline,
  subTagline,
}: {
  tagline: string;
  subTagline: string;
}) {
  return (
    <View style={styles.footer}>
      <View style={styles.footerCopy}>
        <Text style={styles.footerTagline}>{tagline}</Text>
        <Text style={styles.footerSubTagline}>{subTagline}</Text>
      </View>
      <Text style={styles.footerUrl}>honefitness.app</Text>
    </View>
  );
}

export function EmberLeftAccent() {
  return <View style={styles.emberAccentBar} />;
}

export function SharePrChip() {
  return (
    <View style={styles.prChipClip}>
      <View style={styles.prChipSkew}>
        <Text style={styles.prChipText}>★ PR</Text>
      </View>
    </View>
  );
}

export function ShareMonoLabel({ children }: { children: string }) {
  return <Text style={styles.monoLabel}>{children}</Text>;
}

export function ShareDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  statNumberWrap: {
    minWidth: 0,
    width: '100%',
  },
  statNumber: {
    fontFamily: Fonts.monoMedium,
    fontSize: ShareType.statNumber,
    color: Colors.accent,
    lineHeight: 44,
    includeFontPadding: false,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SHARE_GUTTER,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerContext: {
    fontFamily: Fonts.monoMedium,
    fontSize: ShareType.monoLabel,
    color: SHARE_LABEL_COLOR,
    letterSpacing: 2,
  },
  watermarkWrap: {
    position: 'absolute',
    right: -36,
    top: '34%',
    width: 280,
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },
  watermarkMark: {
    opacity: 0.05,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingHorizontal: SHARE_GUTTER,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  footerCopy: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  footerTagline: {
    fontFamily: Fonts.displaySemi,
    fontSize: ShareType.footerTagline,
    color: Colors.textPrimary,
  },
  footerSubTagline: {
    fontFamily: Fonts.regular,
    fontSize: ShareType.footerSub,
    color: SHARE_MUTED_COLOR,
    marginTop: 2,
  },
  footerUrl: {
    fontFamily: Fonts.monoMedium,
    fontSize: ShareType.footerUrl,
    color: SHARE_MUTED_COLOR,
    letterSpacing: 0.3,
  },
  emberAccentBar: {
    width: 5,
    alignSelf: 'stretch',
    backgroundColor: Colors.ember,
    marginRight: Spacing.sm,
  },
  prChipClip: {
    overflow: 'hidden',
    marginLeft: Spacing.sm,
    alignSelf: 'center',
  },
  prChipSkew: {
    backgroundColor: Colors.ember,
    paddingHorizontal: 7,
    paddingVertical: 2,
    transform: [{ skewX: SHARE_SKEW_DEG }],
  },
  prChipText: {
    fontFamily: Fonts.monoMedium,
    fontSize: ShareType.monoLabel,
    color: SHARE_CARD_BG,
    letterSpacing: 0.4,
    transform: [{ skewX: SHARE_COUNTER_SKEW_DEG }],
  },
  monoLabel: {
    fontFamily: Fonts.monoMedium,
    fontSize: ShareType.monoLabel,
    color: SHARE_LABEL_COLOR,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginHorizontal: SHARE_GUTTER,
  },
});

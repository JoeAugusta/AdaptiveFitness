import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Colors, Fonts, FontSizes, Spacing } from '../constants/design';
import BrandLockup, { BrandMark } from './BrandLockup';
export const SHARE_CARD_BG = '#0E0F12';
export const SHARE_LABEL_COLOR = '#5B636E';
export const SHARE_MUTED_COLOR = '#98A1AC';
export const SHARE_PR_ROW_BG = 'rgba(244,82,14,0.08)';
export const SHARE_SKEW_DEG = '-20deg';
export const SHARE_COUNTER_SKEW_DEG = '20deg';
const TAN_20_DEG = 0.36397;

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
        minimumFontScale={0.6}
      >
        {children}
      </Text>
    </View>
  );
}

export function ShareCardHeader({ contextLabel }: { contextLabel: string }) {
  return (
    <View style={styles.header}>
      <BrandLockup size={46} />
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

export function EmberLeftAccent({ rowHeight }: { rowHeight: number }) {
  const borderWidth = 5;
  const cut = Math.max(rowHeight * TAN_20_DEG, 6);

  return (
    <View style={[styles.emberAccentClip, { height: rowHeight }]}>
      <View
        style={[
          styles.emberAccentBar,
          {
            width: borderWidth,
            height: rowHeight + cut,
            marginTop: -cut * 0.35,
          },
        ]}
      />
    </View>
  );
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
    fontSize: 52,
    color: Colors.accent,
    lineHeight: 56,
    includeFontPadding: false,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerContext: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.micro,
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
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  footerCopy: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  footerTagline: {
    fontFamily: Fonts.displaySemi,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
  },
  footerSubTagline: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: SHARE_MUTED_COLOR,
    marginTop: 2,
  },
  footerUrl: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.micro,
    color: SHARE_MUTED_COLOR,
    letterSpacing: 0.3,
  },
  emberAccentClip: {
    width: 8,
    overflow: 'hidden',
    marginRight: Spacing.sm,
  },
  emberAccentBar: {
    backgroundColor: Colors.ember,
    transform: [{ skewX: SHARE_SKEW_DEG }],
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
    fontSize: 9,
    color: SHARE_CARD_BG,
    letterSpacing: 0.4,
    transform: [{ skewX: SHARE_COUNTER_SKEW_DEG }],
  },
  monoLabel: {
    fontFamily: Fonts.monoMedium,
    fontSize: 9,
    color: SHARE_LABEL_COLOR,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginHorizontal: Spacing.xl,
  },
});

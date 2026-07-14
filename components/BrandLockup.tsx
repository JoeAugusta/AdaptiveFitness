import { useId } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { ClipPath, Defs, G, Polygon } from 'react-native-svg';
import { Colors, Fonts } from '../constants/design';

const BONE = '#F5F2EC';
const BLADE = '#F4520E';

const STEM_LEFT = '16,20 38,12 38,84 16,92';
const STEM_RIGHT = '62,20 84,12 84,84 62,92';
const BLADE_SHAPE = '34,44.8 66,33.2 66,55.2 34,66.8';
const CLIP_TOP = '-40,-40 140,-40 140,22.1 -40,87.6';
const CLIP_BOTTOM = '-40,92.4 140,26.9 140,140 -40,140';

export type BrandLockupProps = {
  size?: number;
  orientation?: 'horizontal' | 'vertical';
  showWordmark?: boolean;
  style?: StyleProp<ViewStyle>;
};

function horizontalLetterSpacing(): number {
  return 3;
}

function horizontalFontSize(markSize: number): number {
  return Math.round(markSize * 0.62);
}

/** Inverse tracking: ~4 at size 96, tighter as mark grows; capped at 6% of fontSize. */
function verticalLetterSpacing(markSize: number, fontSize: number): number {
  const inverse = (4 * 96) / markSize;
  const cap = fontSize * 0.06;
  return Math.round(Math.min(inverse, cap) * 10) / 10;
}

function verticalFontSize(markSize: number): number {
  return Math.round(markSize * 0.34);
}

function lockupTypography(
  markSize: number,
  orientation: 'horizontal' | 'vertical',
): { fontSize: number; letterSpacing: number } {
  if (orientation === 'horizontal') {
    return {
      fontSize: horizontalFontSize(markSize),
      letterSpacing: horizontalLetterSpacing(),
    };
  }

  const fontSize = verticalFontSize(markSize);
  return {
    fontSize,
    letterSpacing: verticalLetterSpacing(markSize, fontSize),
  };
}

function BrandMarkSvg({ size }: { size: number }) {
  const uid = useId().replace(/:/g, '');
  const clipTopId = `brand-kt-${uid}`;
  const clipBottomId = `brand-kb-${uid}`;

  const markBody = (
    <>
      <Polygon points={STEM_LEFT} fill={BONE} />
      <Polygon points={STEM_RIGHT} fill={BONE} />
      <Polygon points={BLADE_SHAPE} fill={BLADE} />
    </>
  );

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <ClipPath id={clipTopId}>
          <Polygon points={CLIP_TOP} />
        </ClipPath>
        <ClipPath id={clipBottomId}>
          <Polygon points={CLIP_BOTTOM} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipTopId})`}>{markBody}</G>
      <G clipPath={`url(#${clipBottomId})`}>{markBody}</G>
    </Svg>
  );
}

/** Blade H mark only — for watermarks and non-lockup uses. */
export function BrandMark({
  size,
  style,
}: {
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <BrandMarkSvg size={size} />
    </View>
  );
}

export default function BrandLockup({
  size = 28,
  orientation = 'horizontal',
  showWordmark = true,
  style,
}: BrandLockupProps) {
  const gap = size * (orientation === 'horizontal' ? 0.35 : 0.45);
  const { fontSize, letterSpacing } = lockupTypography(size, orientation);

  const wordmark = showWordmark ? (
    <Text
      style={[
        styles.wordmark,
        {
          fontSize,
          letterSpacing,
        },
      ]}
    >
      HONE
    </Text>
  ) : null;

  if (orientation === 'vertical') {
    return (
      <View style={[styles.vertical, style]}>
        <BrandMarkSvg size={size} />
        {showWordmark ? <View style={{ height: gap }} /> : null}
        {wordmark}
      </View>
    );
  }

  return (
    <View style={[styles.horizontal, { gap }, style]}>
      <BrandMarkSvg size={size} />
      {wordmark}
    </View>
  );
}

const styles = StyleSheet.create({
  horizontal: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vertical: {
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: Fonts.displaySemi,
    color: BONE,
    includeFontPadding: false,
  },
});

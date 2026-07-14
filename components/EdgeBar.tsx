import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  View,
  StyleSheet,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Colors } from '../constants/design';

const TAN_20_DEG = 0.36397;
const ANIM_DURATION_MS = 250;

type FillMode = 'empty' | 'square' | 'skew' | 'full';

export type EdgeBarProps = {
  progress: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
  style?: StyleProp<ViewStyle>;
};

function resolveFillMode(
  progress: number,
  trackWidth: number,
  cut: number,
): FillMode {
  if (progress <= 0) return 'empty';
  if (progress >= 1) return 'full';
  if (progress <= 0.05 || progress * trackWidth < 2 * cut) return 'square';
  return 'skew';
}

function targetFillWidth(mode: FillMode, progress: number, trackWidth: number, cut: number): number {
  switch (mode) {
    case 'empty':
      return 0;
    case 'full':
      return trackWidth;
    case 'square':
      return progress * trackWidth;
    case 'skew':
      return progress * trackWidth + cut;
    default:
      return 0;
  }
}

export default function EdgeBar({
  progress,
  height = 8,
  trackColor = Colors.divider,
  fillColor = Colors.ember,
  style,
}: EdgeBarProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const animatedFillWidth = useRef(new Animated.Value(0)).current;

  const clamped = Math.min(1, Math.max(0, progress));
  const cut = height * TAN_20_DEG;

  const fillMode = useMemo(
    () => (trackWidth > 0 ? resolveFillMode(clamped, trackWidth, cut) : 'empty'),
    [clamped, trackWidth, cut],
  );

  useEffect(() => {
    if (trackWidth <= 0) return;
    const mode = resolveFillMode(clamped, trackWidth, cut);
    const toWidth = targetFillWidth(mode, clamped, trackWidth, cut);
    Animated.timing(animatedFillWidth, {
      toValue: toWidth,
      duration: ANIM_DURATION_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [animatedFillWidth, clamped, cut, trackWidth]);

  const onTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const fillLeft = fillMode === 'skew' ? -cut : 0;
  const fillSkew = fillMode === 'skew' ? [{ skewX: '-20deg' as const }] : undefined;

  return (
    <View
      style={[styles.track, { height, backgroundColor: trackColor }, style]}
      onLayout={onTrackLayout}
    >
      {trackWidth > 0 ? (
        <Animated.View
          style={[
            styles.fill,
            {
              height,
              backgroundColor: fillColor,
              left: fillLeft,
              width: animatedFillWidth,
              transform: fillSkew,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: 'hidden',
    borderRadius: 2,
    width: '100%',
  },
  fill: {
    position: 'absolute',
    top: 0,
  },
});

import { useEffect, useMemo, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Mask,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { Colors, Fonts } from '../constants/design';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export type ProjectionChartLine = {
  data: number[];
  color: string;
  strokeWidth: number;
  dashed?: boolean;
  opacity?: number;
  /** Only one line should use animate; mask reveals left → right */
  animate?: boolean;
};

export type ProjectionChartGoal =
  | 'fat_loss'
  | 'hypertrophy'
  | 'strength'
  | 'recomp'
  | 'general';

export type ProjectionChartProps = {
  width: number;
  height?: number;
  weeks: number;
  yMin: number;
  yMax: number;
  yLabel: string;
  /** Onboarding / multi-pace mode */
  lines?: ProjectionChartLine[];
  /** Goal Tracker: single projection series (alternative to lines) */
  data?: number[];
  projectionColor?: string;
  /** Alias for projection line stroke (Goal Tracker); overrides default when set */
  color?: string;
  /** Enables gradient fill, optional band, end bubble; pass from Plan Preview / Tracker */
  chartGoal?: ProjectionChartGoal | null;
  /** Recomp end-callout: % BF drop from this start value */
  recompBfStart?: number;
  /** Goal Tracker: shaded past region + dashed “Wk n” marker */
  trackerWeekMarkerStyle?: boolean;
  /** Observed values aligned to projection indices; gaps = null */
  actualsData?: (number | null)[];
  actualColor?: string;
  /** Week index along x-axis (0 … weeks) for “you are here” line */
  currentWeek?: number;
  currentWeekMarkerColor?: string;
  /** Horizontal reference (e.g. target 1RM) */
  targetValue?: number;
  /** Plan Preview strength: start/target markers, goal line, gap end bubble */
  strengthGapAnnotate?: { current1RM: number; target1RM: number };
  /** Default true; set false on Goal Tracker to skip wipe-reveal */
  animateEntry?: boolean;
};

const DEFAULT_H = 200;
const LEFT = 44;
const RIGHT = 12;
const TOP = 12;
const BOTTOM = 32;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function buildSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  if (pts.length === 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function buildClosedFillPath(
  pts: { x: number; y: number }[],
  baselineY: number,
): string {
  if (pts.length === 0) return '';
  const line = buildSmoothPath(pts);
  const f = pts[0];
  const l = pts[pts.length - 1];
  return `${line} L ${l.x} ${baselineY} L ${f.x} ${baselineY} Z`;
}

function buildBandPath(
  series: number[],
  xAt: (i: number) => number,
  yAt: (v: number) => number,
): string {
  if (series.length === 0) return '';
  const upper = series.map((v, i) => ({
    x: xAt(i),
    y: yAt(v * 1.2),
  }));
  const lower = series.map((v, i) => ({
    x: xAt(i),
    y: yAt(v * 0.8),
  }));
  let d = buildSmoothPath(upper);
  const ll = lower[lower.length - 1];
  d += ` L ${ll.x} ${ll.y}`;
  for (let i = lower.length - 2; i >= 0; i--) {
    d += ` L ${lower[i].x} ${lower[i].y}`;
  }
  d += ' Z';
  return d;
}

function gradientStopsFor(hex: string): { top: string; bottom: string } {
  return { top: hex, bottom: hex };
}

function formatChartEndLabel(
  endValue: number,
  chartGoal: ProjectionChartGoal,
  recompBfStart: number,
): string {
  switch (chartGoal) {
    case 'hypertrophy': {
      const v =
        Math.abs(endValue - Math.round(endValue)) < 1e-6
          ? Math.round(endValue)
          : endValue;
      return `+${v} lbs`;
    }
    case 'fat_loss':
    case 'strength': {
      const v =
        Math.abs(endValue - Math.round(endValue)) < 1e-6
          ? Math.round(endValue)
          : Number(endValue.toFixed(1));
      return `${v} lbs`;
    }
    case 'recomp':
      return `−${(recompBfStart - endValue).toFixed(1)}% BF`;
    case 'general':
    default:
      return `${endValue.toFixed(1)}`;
  }
}

function yTicks(yMin: number, yMax: number, count: number): number[] {
  if (yMax <= yMin) return [yMin];
  const step = (yMax - yMin) / (count - 1);
  return Array.from({ length: count }, (_, i) => yMin + step * i);
}

export default function ProjectionChart({
  width,
  height = DEFAULT_H,
  weeks,
  yMin,
  yMax,
  yLabel,
  lines: linesProp,
  data,
  projectionColor = '#F97316',
  color: colorProp,
  chartGoal = null,
  recompBfStart = 22,
  trackerWeekMarkerStyle = false,
  actualsData,
  actualColor = Colors.success,
  currentWeek,
  currentWeekMarkerColor = Colors.accent,
  targetValue,
  strengthGapAnnotate,
  animateEntry = true,
}: ProjectionChartProps) {
  const maskId = useRef(`projMask-${Math.random().toString(36).slice(2)}`).current;
  const fillGradId = useRef(`fillGrad-${Math.random().toString(36).slice(2)}`).current;
  const anim = useRef(new Animated.Value(animateEntry ? 0 : 1)).current;
  const plotW = Math.max(1, width - LEFT - RIGHT);
  const chartRightX = LEFT + plotW;
  const plotH = Math.max(1, height - TOP - BOTTOM);
  const wk = Math.max(weeks, 1);
  const baselineY = TOP + plotH;

  const strokeColor = colorProp ?? projectionColor;

  const lines = useMemo((): ProjectionChartLine[] => {
    if (linesProp && linesProp.length > 0) return linesProp;
    if (data && data.length > 0) {
      return [
        {
          data,
          color: strokeColor,
          strokeWidth: 2.5,
          animate: animateEntry,
        },
      ];
    }
    return [];
  }, [linesProp, data, strokeColor, animateEntry]);

  const xAt = (weekIndex: number) => LEFT + (weekIndex / wk) * plotW;

  const yAt = (v: number) => {
    const t = (v - yMin) / (yMax - yMin || 1);
    return TOP + (1 - clamp(t, 0, 1)) * plotH;
  };

  const primaryLine = useMemo(() => {
    const animated = lines.find((l) => l.animate);
    return animated ?? lines[lines.length - 1] ?? null;
  }, [lines]);

  const showExtras = chartGoal != null && primaryLine != null;
  const showBand =
    showExtras &&
    (chartGoal === 'hypertrophy' || chartGoal === 'recomp');

  const gradientHex = useMemo(() => {
    switch (chartGoal) {
      case 'hypertrophy':
        return '#22C55E';
      case 'strength':
        return '#F59E0B';
      case 'recomp':
        return '#22C55E';
      case 'fat_loss':
      case 'general':
      default:
        return '#F97316';
    }
  }, [chartGoal]);

  const primaryPts = useMemo(() => {
    if (!primaryLine) return [];
    return primaryLine.data.map((val, i) => ({
      x: xAt(i),
      y: yAt(val),
    }));
  }, [primaryLine, weeks, yMin, yMax, width, height]);

  const fillPathD = useMemo(() => {
    if (!showExtras || primaryPts.length === 0) return '';
    return buildClosedFillPath(primaryPts, baselineY);
  }, [showExtras, primaryPts, baselineY]);

  const bandPathD = useMemo(() => {
    if (!showBand || !primaryLine) return '';
    return buildBandPath(primaryLine.data, xAt, yAt);
  }, [showBand, primaryLine, weeks, yMin, yMax, width, height]);

  const endPoint = primaryPts.length > 0 ? primaryPts[primaryPts.length - 1] : null;
  const showStrengthGapEndBubble =
    chartGoal === 'strength' &&
    strengthGapAnnotate != null &&
    primaryLine != null &&
    endPoint != null;
  const endLabel =
    showExtras &&
    chartGoal &&
    primaryLine &&
    endPoint &&
    !showStrengthGapEndBubble
      ? formatChartEndLabel(
          primaryLine.data[primaryLine.data.length - 1],
          chartGoal,
          recompBfStart,
        )
      : null;

  const linesSig = useMemo(
    () => lines.map((l) => `${l.animate ? 1 : 0}:${l.data.join(',')}`).join('|'),
    [lines],
  );

  useEffect(() => {
    if (!animateEntry) {
      anim.setValue(1);
      return;
    }
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [anim, weeks, linesSig, animateEntry]);

  const actualPathPts = useMemo(() => {
    if (!actualsData?.length) return [];
    const pw = Math.max(1, width - LEFT - RIGHT);
    const ph = Math.max(1, height - TOP - BOTTOM);
    const wkx = Math.max(weeks, 1);
    const xa = (weekIndex: number) => LEFT + (weekIndex / wkx) * pw;
    const ya = (v: number) => {
      const t = (v - yMin) / (yMax - yMin || 1);
      return TOP + (1 - clamp(t, 0, 1)) * ph;
    };
    return actualsData
      .map((val, i) =>
        val != null && Number.isFinite(val) ? { x: xa(i), y: ya(val) } : null,
      )
      .filter((p): p is { x: number; y: number } => p != null);
  }, [actualsData, weeks, yMin, yMax, width, height]);

  const actualPathD = useMemo(
    () => buildSmoothPath(actualPathPts),
    [actualPathPts],
  );

  const markerX =
    currentWeek != null ? xAt(clamp(currentWeek, 0, wk)) : null;

  const animatedWidth = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, width],
  });

  const gridYs = useMemo(() => yTicks(yMin, yMax, 5), [yMin, yMax]);

  const xWeekLabels = useMemo(() => {
    const base = [0, 3, 6, 9, 12].filter((x) => x <= weeks);
    if (weeks > 0 && !base.includes(weeks)) base.push(weeks);
    return [...new Set(base)].sort((a, b) => a - b);
  }, [weeks]);

  const linePaths = lines.map((line, idx) => {
    const pts = line.data.map((val, i) => ({
      x: xAt(i),
      y: yAt(val),
    }));
    return { line, pts, path: buildSmoothPath(pts), key: `ln-${idx}` };
  });

  const staticLinePaths = primaryLine
    ? linePaths.filter((lp) => lp.line !== primaryLine)
    : linePaths;

  const primaryPathStr =
    primaryPts.length > 0 ? buildSmoothPath(primaryPts) : '';
  const endDot = primaryPts.length > 0 ? primaryPts[primaryPts.length - 1] : null;
  const useRevealMask = primaryLine?.animate === true;

  let targetY: number | null = null;
  if (targetValue != null && yMax > yMin) {
    targetY = yAt(targetValue);
    if (targetY < TOP || targetY > TOP + plotH) targetY = null;
  }

  const lineColorForExtras = primaryLine?.color ?? strokeColor;
  const { top: gradTop } = gradientStopsFor(gradientHex);

  const strengthStartY =
    chartGoal === 'strength' && strengthGapAnnotate
      ? yAt(strengthGapAnnotate.current1RM)
      : null;

  let strengthGapBubbleMeta: {
    projectedEnd: number;
    remaining: number;
    crossingWeek: number;
    tgt: number;
  } | null = null;
  if (showStrengthGapEndBubble && primaryLine && strengthGapAnnotate) {
    const dataSeries = primaryLine.data;
    const projectedEnd = dataSeries[dataSeries.length - 1];
    const tgt = strengthGapAnnotate.target1RM;
    const remaining = tgt - projectedEnd;
    const hitIdx = dataSeries.findIndex((v) => v >= tgt);
    const crossingWeek = hitIdx >= 0 ? hitIdx : dataSeries.length - 1;
    strengthGapBubbleMeta = { projectedEnd, remaining, crossingWeek, tgt };
  }

  if (lines.length === 0) {
    return <View style={[styles.wrap, { width, height: DEFAULT_H }]} />;
  }

  const shadeW =
    trackerWeekMarkerStyle && markerX != null
      ? Math.max(0, markerX - LEFT)
      : 0;

  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height}>
        <Defs>
          <Mask id={maskId} x={0} y={0} width={width} height={height}>
            <AnimatedRect
              x={0}
              y={0}
              width={animatedWidth}
              height={height}
              fill="#ffffff"
            />
          </Mask>
          <LinearGradient id={fillGradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={gradTop} stopOpacity={0.25} />
            <Stop offset="1" stopColor={gradTop} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {gridYs.map((gv) => {
          const gy = yAt(gv);
          return (
            <Line
              key={`g-${gv}`}
              x1={LEFT}
              y1={gy}
              x2={chartRightX}
              y2={gy}
              stroke={Colors.divider}
              strokeWidth={1}
              opacity={0.5}
            />
          );
        })}

        {targetY != null && !strengthGapAnnotate ? (
          <Line
            x1={LEFT}
            y1={targetY}
            x2={chartRightX}
            y2={targetY}
            stroke={Colors.accentBorder}
            strokeWidth={1.5}
            strokeDasharray="6,4"
          />
        ) : null}

        {trackerWeekMarkerStyle && shadeW > 0 ? (
          <Rect
            x={LEFT}
            y={TOP}
            width={shadeW}
            height={plotH}
            fill="rgba(249,115,22,0.05)"
          />
        ) : null}

        {bandPathD ? (
          <Path
            d={bandPathD}
            fill={lineColorForExtras}
            fillOpacity={0.07}
          />
        ) : null}

        {staticLinePaths.map(({ line, path, key }) => (
          <Path
            key={key}
            d={path}
            fill="none"
            stroke={line.color}
            strokeWidth={line.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={line.dashed ? '4,4' : undefined}
            opacity={line.opacity ?? 1}
          />
        ))}

        {primaryLine && primaryPathStr ? (
          useRevealMask ? (
            <G mask={`url(#${maskId})`}>
              {fillPathD ? (
                <Path d={fillPathD} fill={`url(#${fillGradId})`} />
              ) : null}
              <Path
                d={primaryPathStr}
                fill="none"
                stroke={primaryLine.color}
                strokeWidth={primaryLine.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {endDot && !endLabel && !showStrengthGapEndBubble ? (
                <Circle
                  cx={endDot.x}
                  cy={endDot.y}
                  r={4}
                  fill={primaryLine.color}
                />
              ) : null}
            </G>
          ) : (
            <G>
              {fillPathD ? (
                <Path d={fillPathD} fill={`url(#${fillGradId})`} />
              ) : null}
              <Path
                d={primaryPathStr}
                fill="none"
                stroke={primaryLine.color}
                strokeWidth={primaryLine.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {endDot && !endLabel && !showStrengthGapEndBubble ? (
                <Circle
                  cx={endDot.x}
                  cy={endDot.y}
                  r={4}
                  fill={primaryLine.color}
                />
              ) : null}
            </G>
          )
        ) : null}

        {strengthGapAnnotate && chartGoal === 'strength' && targetY != null ? (
          <G pointerEvents="none">
            <Line
              x1={LEFT}
              y1={targetY}
              x2={chartRightX}
              y2={targetY}
              stroke="#F97316"
              strokeWidth={1.5}
              strokeDasharray="6,4"
              opacity={0.6}
            />
            <SvgText
              x={chartRightX - 4}
              y={targetY - 6}
              textAnchor="end"
              fill="#F97316"
              fontSize={11}
              fontFamily={Fonts.bold}
            >
              {`Goal: ${strengthGapAnnotate.target1RM} lbs`}
            </SvgText>
          </G>
        ) : null}

        {strengthStartY != null && strengthGapAnnotate ? (
          <G pointerEvents="none">
            <Circle cx={xAt(0)} cy={strengthStartY} r={5} fill="#F59E0B" />
            <SvgText
              x={LEFT + 8}
              y={strengthStartY - 8}
              fill="#F59E0B"
              fontSize={11}
              fontFamily={Fonts.medium}
            >
              {`${strengthGapAnnotate.current1RM} lbs`}
            </SvgText>
          </G>
        ) : null}

        {actualPathD ? (
          <Path
            d={actualPathD}
            fill="none"
            stroke={actualColor}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {actualPathPts.map((p, i) => (
          <Circle key={`a-${i}`} cx={p.x} cy={p.y} r={4} fill={actualColor} />
        ))}

        {strengthGapBubbleMeta && endPoint ? (
          <G pointerEvents="none">
            {strengthGapBubbleMeta.remaining > 0 ? (
              <>
                <Rect
                  x={endPoint.x - 39}
                  y={endPoint.y - 50}
                  width={78}
                  height={40}
                  rx={12}
                  fill="#F59E0B"
                />
                <SvgText
                  x={endPoint.x}
                  y={endPoint.y - 32}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize={11}
                  fontFamily={Fonts.semiBold}
                >
                  {`${Math.round(strengthGapBubbleMeta.projectedEnd)} lbs`}
                </SvgText>
                <SvgText
                  x={endPoint.x}
                  y={endPoint.y - 18}
                  textAnchor="middle"
                  fill={Colors.textSecondary}
                  fontSize={9}
                  fontFamily={Fonts.medium}
                >
                  {`${Math.round(strengthGapBubbleMeta.remaining)} lbs to goal`}
                </SvgText>
              </>
            ) : (
              <>
                <Rect
                  x={endPoint.x - 39}
                  y={endPoint.y - 50}
                  width={78}
                  height={40}
                  rx={12}
                  fill={Colors.success}
                />
                <SvgText
                  x={endPoint.x}
                  y={endPoint.y - 32}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize={11}
                  fontFamily={Fonts.semiBold}
                >
                  {`${strengthGapBubbleMeta.tgt} lbs`}
                </SvgText>
                <SvgText
                  x={endPoint.x}
                  y={endPoint.y - 18}
                  textAnchor="middle"
                  fill="#DCFCE7"
                  fontSize={9}
                  fontFamily={Fonts.medium}
                >
                  {`Goal reached Wk ${strengthGapBubbleMeta.crossingWeek}`}
                </SvgText>
              </>
            )}
          </G>
        ) : endPoint && endLabel && chartGoal ? (
          <G pointerEvents="none">
            <Rect
              x={endPoint.x - 28}
              y={endPoint.y - 32}
              width={56}
              height={22}
              rx={11}
              fill={lineColorForExtras}
            />
            <SvgText
              x={endPoint.x}
              y={endPoint.y - 17}
              textAnchor="middle"
              fill="#fff"
              fontSize={11}
              fontFamily={Fonts.semiBold}
            >
              {endLabel}
            </SvgText>
          </G>
        ) : null}

        {!trackerWeekMarkerStyle && markerX != null ? (
          <Line
            x1={markerX}
            y1={TOP}
            x2={markerX}
            y2={TOP + plotH}
            stroke={currentWeekMarkerColor}
            strokeWidth={1.5}
            opacity={0.85}
          />
        ) : null}

        {trackerWeekMarkerStyle && markerX != null && currentWeek != null ? (
          <G pointerEvents="none">
            <Line
              x1={markerX}
              y1={TOP}
              x2={markerX}
              y2={TOP + plotH}
              stroke="#F97316"
              strokeWidth={2}
              strokeDasharray="4,3"
            />
            <SvgText
              x={markerX + 6}
              y={TOP + 14}
              fill="#F97316"
              fontSize={10}
              fontFamily={Fonts.bold}
            >
              {`Wk ${currentWeek}`}
            </SvgText>
          </G>
        ) : null}

        {gridYs.map((gv) => {
          const gy = yAt(gv);
          const label =
            Math.abs(gv) >= 100 ? Math.round(gv).toString() : gv.toFixed(1);
          return (
            <SvgText
              key={`yl-${gv}`}
              x={4}
              y={gy + 4}
              fill={Colors.textTertiary}
              fontSize={9}
            >
              {label}
            </SvgText>
          );
        })}

        {xWeekLabels.map((wkIdx) => {
          const x = xAt(wkIdx);
          const label = wkIdx === 0 ? 'Now' : `Wk ${wkIdx}`;
          return (
            <SvgText
              key={`xl-${wkIdx}`}
              x={x - (wkIdx === 0 ? 8 : 14)}
              y={height - 8}
              fill={Colors.textSecondary}
              fontSize={10}
            >
              {label}
            </SvgText>
          );
        })}

        <SvgText
          x={width - RIGHT - 36}
          y={14}
          fill={Colors.textTertiary}
          fontSize={9}
        >
          {yLabel}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
  },
});

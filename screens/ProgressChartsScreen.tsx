import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { stripEmDash } from '../utils/jordanText';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import Svg, { Line as SvgLine, Rect, Circle, Text as SvgText, G } from 'react-native-svg';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import EdgeBar from '../components/EdgeBar';
import { Ionicons } from '@expo/vector-icons';
import { useMetric, lbsToDisplay, unitLabel } from '../utils/units';
import {
  estimateE1RM,
  getExerciseRecords,
  isTimedRawSet,
  plausibilityStatusForRawSet,
  shouldExcludeSetFromRecords,
  type ExerciseRecordDisplay,
} from '../Lib/records';
import { useEntitlement } from '../hooks/useEntitlement';
import {
  daysUntilCheckIn,
  formatCheckInDate,
  getNextCheckInDate,
  isPhotoCheckInAvailable,
} from '../utils/progressPhotoCheckIn';
import { EXERCISES } from '../constants/exerciseLibrary';
import {
  STRENGTH_CATEGORY_CHIPS,
  getMuscleCategoryForExercise,
  resolveWeeklyVolumeMuscleGroup,
  collapseToVolumeBucket,
} from '../constants/strengthMuscleGroups';
import { getStrengthProjection } from '../utils/projections';
import { getLocalDateString } from '../utils/dateUtils';

interface StrengthDataPoint {
  week: number;
  estimated1RM: number;
  isDeload?: boolean;
}

interface WeightLogPoint {
  log_date: string;
  weight_lbs: number;
}

/** Compact x-axis ticks for bodyweight chart (reduces overlap vs "Mar 23"). */
const formatWeightAxisTickDate = (dateStr: string): string => {
  const d = new Date(`${dateStr}T12:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

interface ConsistencyDay {
  dateStr: string;
  trained: boolean;
}

/** Monday 00:00 local of the week containing `anchor` (fallback when no plan created_at). */
function planMondayFromAnchor(anchor: Date): Date {
  const planMonday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const dayOfWeek = anchor.getDay();
  const daysToMonday = (dayOfWeek + 6) % 7;
  planMonday.setDate(planMonday.getDate() - daysToMonday);
  planMonday.setHours(0, 0, 0, 0);
  return planMonday;
}

/** Match plan grid anchor: Monday of the calendar week containing plan `created_at`. */
function planMondayFromCreatedAt(planCreatedAt: Date): Date {
  const dow = planCreatedAt.getDay();
  const daysBack = (dow + 6) % 7;
  const planMonday = new Date(planCreatedAt);
  planMonday.setDate(planCreatedAt.getDate() - daysBack);
  planMonday.setHours(0, 0, 0, 0);
  return planMonday;
}

function localDateKey(d: Date): string {
  return getLocalDateString(d);
}

/** Mon–Sun; index aligns with dayIndex = (getDay() + 6) % 7 */
const HEATMAP_DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const HEATMAP_ROWS = 7;
const HEATMAP_CELL_SIZE = 30;
const HEATMAP_CELL_GAP = 3;
const HEATMAP_GRID_HEIGHT =
  HEATMAP_CELL_SIZE * HEATMAP_ROWS + HEATMAP_CELL_GAP * (HEATMAP_ROWS - 1);

/** Weekly Volume chart — intentional muscle → color system (keys are Title Case). */
const MUSCLE_COLORS: Record<string, string> = {
  // Push — orange
  Chest: Colors.accent,
  Triceps: Colors.accent,
  Quads: Colors.accent,

  // Pull — green
  Back: Colors.success,
  Biceps: Colors.success,
  Hamstrings: Colors.success,
  Traps: Colors.success,

  // Overhead / compound — amber
  Shoulders: Colors.warning,
  Glutes: Colors.warning,

  // Accessory / small — gray
  Core: Colors.textTertiary,
  Calves: Colors.textTertiary,
  Forearms: Colors.textTertiary,
  'Full Body': Colors.textSecondary,
};

function getMuscleColor(muscle: string): string {
  const trimmed = muscle.trim();
  if (!trimmed) return Colors.textSecondary;
  const lower = trimmed.toLowerCase();
  const key =
    lower === 'quadriceps'
      ? 'Quads'
      : trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  return MUSCLE_COLORS[key] ?? Colors.textSecondary;
}

function getDefaultStrengthLiftId(
  planGoal: string | undefined,
  goalLift?: string | null,
): string {
  const g = (planGoal ?? 'general').toLowerCase();
  const gl = goalLift?.trim() || undefined;
  const map: Record<string, string> = {
    hypertrophy: 'barbell_bench_press',
    strength: gl ?? 'barbell_squat',
    fat_loss: 'barbell_squat',
    recomp: 'barbell_bench_press',
    power_hypertrophy: 'barbell_bench_press',
    general: 'barbell_squat',
  };
  return map[g] ?? 'barbell_squat';
}

/** Map canonical lift id to a display name present in `topExercises` chips. */
function pickExerciseNameForDefaultLift(
  defaultLiftId: string,
  candidates: string[],
): string | null {
  const id = defaultLiftId.toLowerCase();
  for (const c of candidates) {
    const n = c.toLowerCase();
    if (id.includes('ohp') || id.includes('overhead') || /\bohp\b/.test(id)) {
      if (n.includes('overhead') || n.includes('military') || /\bohp\b/.test(n)) {
        return c;
      }
      continue;
    }
    const slug = id.replace(/^barbell_/, '').replace(/_/g, ' ');
    const parts = slug.split(/\s+/).filter(Boolean);
    if (parts.length > 0 && parts.every((p) => n.includes(p))) return c;
  }
  return null;
}

function computeBodyweightContradictionNote(
  planGoal: string | undefined,
  weightLogs: WeightLogPoint[],
): string | null {
  if (!planGoal) return null;
  const g = planGoal.toLowerCase();
  if (weightLogs.length < 5) return null;
  const recent = weightLogs.slice(-7);
  if (recent.length < 2) return null;
  const firstW = recent[0].weight_lbs;
  const lastW = recent[recent.length - 1].weight_lbs;
  const delta = lastW - firstW;
  const t0 = new Date(`${recent[0].log_date}T12:00:00`).getTime();
  const t1 = new Date(`${recent[recent.length - 1].log_date}T12:00:00`).getTime();
  const days = Math.max(1, (t1 - t0) / 86400000);
  const weeklyRate = (delta / days) * 7;

  if (g === 'hypertrophy' && delta < -0.5) {
    return "You're losing weight on a muscle-building plan — you may be under-eating. Check your calorie targets.";
  }
  if (g === 'fat_loss' && delta > 0.5) {
    return 'Your weight is trending up on a fat-loss plan — your calorie intake may be running above target.';
  }
  if (g === 'strength' && weeklyRate < -1.0) {
    return "Rapid weight loss can compromise strength gains — make sure you're hitting your calorie and protein targets.";
  }
  return null;
}

// ── SVG Line Chart ──

function LineChart({
  data,
  projectionData,
  projectionDashedOnly = false,
  width,
  height,
}: {
  data: StrengthDataPoint[];
  projectionData?: StrengthDataPoint[];
  projectionDashedOnly?: boolean;
  width: number;
  height: number;
}) {
  const plotActual = !projectionDashedOnly && data.length > 0;
  const plotProjection = (projectionData?.length ?? 0) > 0;
  if (!plotActual && !plotProjection) return null;

  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const cw = width - padL - padR;
  const ch = height - padT - padB;

  const allPoints = [
    ...(plotActual ? data : []),
    ...(plotProjection ? projectionData! : []),
  ];
  const weeks = allPoints.map((d) => d.week);
  const vals = allPoints.map((d) => d.estimated1RM);
  const minW = Math.min(...weeks);
  const maxW = Math.max(...weeks);
  const minV = Math.min(...vals) * 0.9;
  const maxV = Math.max(...vals) * 1.1;
  const rangeW = maxW - minW || 1;
  const rangeV = maxV - minV || 1;

  const toX = (w: number) => padL + ((w - minW) / rangeW) * cw;
  const toY = (v: number) => padT + ch - ((v - minV) / rangeV) * ch;

  const actualPoints = plotActual
    ? data.map((d) => ({ x: toX(d.week), y: toY(d.estimated1RM) }))
    : [];
  const projectionPoints = plotProjection
    ? projectionData!.map((d) => ({ x: toX(d.week), y: toY(d.estimated1RM) }))
    : [];

  const yTicks = 4;
  const yStep = rangeV / yTicks;

  const xLabelWeeks = Array.from(
    new Set([
      ...(plotActual ? data.map((d) => d.week) : []),
      ...(plotProjection ? projectionData!.map((d) => d.week) : []),
    ]),
  ).sort((a, b) => a - b);

  return (
    <Svg width={width} height={height}>
      {/* Y axis grid + labels */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const val = minV + i * yStep;
        const y = toY(val);
        return (
          <G key={`y-${i}`}>
            <SvgLine x1={padL} y1={y} x2={width - padR} y2={y} stroke={Colors.divider} strokeWidth={1} />
            <SvgText
              x={padL - 6}
              y={y + 4}
              fill={Colors.textSecondary}
              fontSize={FontSizes.micro}
              fontFamily={Fonts.regular}
              textAnchor="end"
            >
              {Math.round(val)}
            </SvgText>
          </G>
        );
      })}
      {/* X axis labels */}
      {xLabelWeeks.map((wk) => {
        const isDeloadWeek =
          plotActual && data.some((d) => d.week === wk && d.isDeload);
        return (
          <G key={`x-${wk}`}>
            {isDeloadWeek ? (
              <SvgText
                x={toX(wk)}
                y={height - 16}
                fill={Colors.textTertiary}
                fontSize={FontSizes.micro}
                fontFamily={Fonts.regular}
                textAnchor="middle"
              >
                D
              </SvgText>
            ) : null}
            <SvgText
              x={toX(wk)}
              y={height - 6}
              fill={Colors.textSecondary}
              fontSize={FontSizes.micro}
              fontFamily={Fonts.regular}
              textAnchor="middle"
            >
              W{wk}
            </SvgText>
          </G>
        );
      })}
      {/* Line */}
      <SvgLine x1={padL} y1={padT + ch} x2={width - padR} y2={padT + ch} stroke={Colors.divider} strokeWidth={1} />
      {projectionPoints.length > 1 ? (
        <G key="proj-layer">
          {(() => {
            const pathEl: React.ReactNode[] = [];
            for (let i = 1; i < projectionPoints.length; i++) {
              pathEl.push(
                <SvgLine
                  key={`proj-${i}`}
                  x1={projectionPoints[i - 1].x}
                  y1={projectionPoints[i - 1].y}
                  x2={projectionPoints[i].x}
                  y2={projectionPoints[i].y}
                  stroke={projectionDashedOnly ? Colors.textTertiary : Colors.accent}
                  strokeWidth={2.5}
                  strokeDasharray={projectionDashedOnly ? '8,6' : '0'}
                  opacity={projectionDashedOnly ? 0.85 : 0.45}
                />,
              );
            }
            return pathEl;
          })()}
        </G>
      ) : null}
      {actualPoints.length > 1 ? (
        <G key="act-layer">
          {(() => {
            const pathEl: React.ReactNode[] = [];
            for (let i = 1; i < actualPoints.length; i++) {
              const segIsDeload = data[i - 1]?.isDeload || data[i]?.isDeload;
              pathEl.push(
                <SvgLine
                  key={`act-seg-${i}`}
                  x1={actualPoints[i - 1].x}
                  y1={actualPoints[i - 1].y}
                  x2={actualPoints[i].x}
                  y2={actualPoints[i].y}
                  stroke={segIsDeload ? Colors.textTertiary : Colors.accent}
                  strokeWidth={2.5}
                  strokeDasharray={segIsDeload ? '6,5' : '0'}
                  opacity={segIsDeload ? 0.75 : 1}
                />,
              );
            }
            return pathEl;
          })()}
        </G>
      ) : null}
      {actualPoints.length > 0 ? (
        <G key="dot-layer">
          {actualPoints.map((p, i) => {
            const isDeload = data[i]?.isDeload;
            return isDeload ? (
              <Circle
                key={`dot-${i}`}
                cx={p.x}
                cy={p.y}
                r={4}
                fill={Colors.bgCard}
                stroke={Colors.textTertiary}
                strokeWidth={2}
              />
            ) : (
              <Circle key={`dot-${i}`} cx={p.x} cy={p.y} r={4} fill={Colors.accent} />
            );
          })}
        </G>
      ) : null}
    </Svg>
  );
}

// ── Weight Line Chart ──

function WeightLineChart({
  data,
  width,
  height,
  isMetric,
  lbsToDisplay: toDisp,
  formatBodyWeight: formatBodyW,
}: {
  data: WeightLogPoint[];
  width: number;
  height: number;
  isMetric: boolean;
  lbsToDisplay: (lbs: number) => number;
  formatBodyWeight: (lbs: number) => string;
}) {
  if (data.length < 2) return null;

  const padL = 44;
  const padR = 20 + 48;
  const padT = 24;
  const padB = 28;
  const cw = width - padL - padR;
  const ch = height - padT - padB;

  const displayWeights = data.map((d) => toDisp(d.weight_lbs));
  const minW = Math.min(...displayWeights);
  const maxW = Math.max(...displayWeights);
  const pad = isMetric ? 1 : 2;
  const minV = Math.floor(minW - pad);
  const maxV = Math.ceil(maxW + pad);
  const rangeV = maxV - minV || 1;

  const toX = (i: number) => padL + (i / (data.length - 1)) * cw;
  const toY = (v: number) => padT + ch - ((v - minV) / rangeV) * ch;

  const points = data.map((d, i) => ({
    x: toX(i),
    y: toY(toDisp(d.weight_lbs)),
  }));

  // Few x-axis labels to avoid overlap (~6 max including last day)
  const maxXLabels = 6;
  const labelIndices: number[] = [];
  if (data.length <= maxXLabels) {
    for (let i = 0; i < data.length; i++) labelIndices.push(i);
  } else {
    const labelStep = Math.max(1, Math.ceil((data.length - 1) / (maxXLabels - 1)));
    for (let i = 0; i < data.length; i += labelStep) {
      labelIndices.push(i);
    }
    if (labelIndices[labelIndices.length - 1] !== data.length - 1) {
      labelIndices.push(data.length - 1);
    }
  }

  // 4 Y-axis grid lines
  const yTicks = 4;
  const yStep = rangeV / yTicks;

  const lastPt = points[points.length - 1];
  const lastWeightLbs = data[data.length - 1].weight_lbs;
  const calloutTooCloseToRight = lastPt.x > width - 60;
  const calloutX = calloutTooCloseToRight ? width - 60 : lastPt.x;
  const calloutAnchor = calloutTooCloseToRight ? ('end' as const) : ('middle' as const);

  return (
    <Svg width={width} height={height}>
      {/* Y axis grid + labels */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const val = minV + i * yStep;
        const y = toY(val);
        return (
          <G key={`yw-${i}`}>
            <SvgLine x1={padL} y1={y} x2={width - padR} y2={y} stroke={Colors.divider} strokeWidth={1} />
            <SvgText
              x={padL - 6}
              y={y + 4}
              fill={Colors.textTertiary}
              fontSize={FontSizes.micro}
              fontFamily={Fonts.regular}
              textAnchor="end"
            >
              {isMetric
                ? Math.abs(val - Math.round(val)) < 0.05
                  ? String(Math.round(val))
                  : val.toFixed(1)
                : String(Math.round(val))}
            </SvgText>
          </G>
        );
      })}

      {/* X axis baseline */}
      <SvgLine x1={padL} y1={padT + ch} x2={width - padR} y2={padT + ch} stroke={Colors.divider} strokeWidth={1} />

      {/* X axis date labels */}
      {labelIndices.map((idx) => (
        <SvgText
          key={`xw-${idx}`}
          x={points[idx].x}
          y={height - 6}
          fill={Colors.textTertiary}
          fontSize={FontSizes.micro}
          fontFamily={Fonts.regular}
          textAnchor="middle"
        >
          {formatWeightAxisTickDate(data[idx].log_date)}
        </SvgText>
      ))}

      {/* Line segments */}
      {points.length > 1 && (() => {
        const segs: React.ReactNode[] = [];
        for (let i = 1; i < points.length; i++) {
          segs.push(
            <SvgLine
              key={`wseg-${i}`}
              x1={points[i - 1].x}
              y1={points[i - 1].y}
              x2={points[i].x}
              y2={points[i].y}
              stroke={Colors.accent}
              strokeWidth={2}
            />,
          );
        }
        return segs;
      })()}

      {/* Data point dots */}
      {points.map((p, i) => (
        <Circle key={`wdot-${i}`} cx={p.x} cy={p.y} r={4} fill={Colors.accent} />
      ))}

      {/* Most recent weight callout */}
      <SvgText
        x={calloutX}
        y={lastPt.y - 10}
        fill={Colors.textPrimary}
        fontSize={FontSizes.body}
        fontFamily={Fonts.bold}
        textAnchor={calloutAnchor}
      >
        {formatBodyW(lastWeightLbs)}
      </SvgText>
    </Svg>
  );
}

function getStrengthInsight(
  data: StrengthDataPoint[],
  exerciseName: string,
): string | null {
  if (data.length < 2) return null;
  const lastPoint = data[data.length - 1];
  const first = data[0].estimated1RM;
  const last = lastPoint.estimated1RM;
  const gain = Math.round(last - first);
  const weeks = lastPoint.week - data[0].week;

  if (lastPoint.isDeload) {
    return `Week ${lastPoint.week} is a scheduled deload — the dip here is planned recovery, not lost strength. Numbers pick back up next week.`;
  }

  if (gain <= 0) {
    return `${exerciseName} has held steady over ${weeks} weeks — weights may need increasing to drive further progress.`;
  }
  return `${exerciseName} is up an estimated ${gain} lbs over ${weeks} weeks. Keep the load climbing each session.`;
}

function muscleGroupLabel(raw: string): string {
  const t = String(raw ?? '').trim();
  return t.length > 0 ? t : 'Your top muscle group';
}

function getVolumeInsight(
  muscleRows: [string, number][],
  daysPerWeek: number,
): string | null {
  if (!muscleRows || muscleRows.length === 0) return null;

  const volumeData = muscleRows.map(([name, sets]) => ({
    name: muscleGroupLabel(name),
    sets,
  }));
  const sorted = [...volumeData].sort((a, b) => b.sets - a.sets);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];

  if (sorted.length < 2) return null;
  if (highest.sets <= 0) return null;

  const maxRealistic = daysPerWeek * 8;
  const imbalanceRatio = lowest.sets / highest.sets;

  const isolationMuscles = [
    'biceps',
    'triceps',
    'calves',
    'forearms',
    'rear delts',
  ];
  const lowestIsIsolation = isolationMuscles.some((m) =>
    lowest.name.toLowerCase().includes(m),
  );

  if (lowestIsIsolation && daysPerWeek <= 3) {
    return (
      `${lowest.name} is at ${lowest.sets} sets — ` +
      `normal for a ${daysPerWeek}-day program. ` +
      `Compound pulling movements provide indirect stimulus. ` +
      `Direct volume increases are available on higher-frequency plans.`
    );
  }

  if (imbalanceRatio < 0.5 && !lowestIsIsolation) {
    return (
      `${highest.name} leads at ${highest.sets} sets. ` +
      `${lowest.name} is at ${lowest.sets} — Jordan will ` +
      `increase direct volume in the next generated week.`
    );
  }

  if (highest.sets > maxRealistic * 0.9) {
    return (
      `${highest.name} is approaching the upper limit of ` +
      `productive volume at ${highest.sets} sets. ` +
      `Quality is more important than adding further sets.`
    );
  }

  return (
    `${highest.sets} sets for ${highest.name} leads this week ` +
    `across ${volumeData.length} muscle groups — ` +
    `volume is distributed appropriately for your schedule.`
  );
}

function getWeightInsight(data: WeightLogPoint[], isMetric: boolean): string | null {
  if (data.length < 4) return null;
  const first = lbsToDisplay(data[0].weight_lbs, isMetric);
  const last = lbsToDisplay(data[data.length - 1].weight_lbs, isMetric);
  const diff = Math.round((last - first) * 10) / 10;
  const days = data.length;
  const u = unitLabel(isMetric);
  if (Math.abs(diff) < 0.5) {
    return `Weight has been stable over ${days} days — consistent with a maintenance or recomp approach.`;
  }
  if (diff < 0) {
    return `Down ${Math.abs(diff)} ${u} over ${days} days — on track. Keep hitting your protein target to preserve muscle.`;
  }
  return `Up ${diff} ${u} over ${days} days — expected for a building phase. Monitor the rate and adjust calories if needed.`;
}

function getConsistencyInsight(
  totalLoggedSessions: number,
  activeWeeks: number,
  daysPerWeek: number,
): string | null {
  if (totalLoggedSessions === 0) return null;
  const totalPlannedSessions = activeWeeks * daysPerWeek;
  const consistencyRate =
    totalPlannedSessions > 0
      ? Math.round((totalLoggedSessions / totalPlannedSessions) * 100)
      : 0;

  let consistencyContext = '';
  if (consistencyRate >= 80) {
    consistencyContext = 'elite-level consistency';
  } else if (consistencyRate >= 60) {
    consistencyContext = 'solid consistency';
  } else {
    consistencyContext = 'room to improve';
  }

  return `${consistencyRate}% session completion — ${consistencyContext}. Hitting your ${daysPerWeek} sessions every week is the single biggest lever for results.`;
}

type PlanWeekLike = {
  weekNumber?: number;
  week_number?: number;
  phase?: string;
  days?: Array<{ type?: string }>;
};

function findPlanWeekDays(weeks: PlanWeekLike[], weekNum: number): Array<{ type?: string }> {
  const w =
    weeks.find((x) => (x.weekNumber ?? x.week_number) === weekNum) ??
    weeks[weekNum - 1];
  return Array.isArray(w?.days) ? w.days! : [];
}

/** Early-plan copy avoids raw % on sparse heatmaps; week 3+ delegates to getConsistencyInsight. */
function getConsistencyJordanNote(
  logs: Array<{ week_number: number; plan_id?: string }>,
  currentWeek: number,
  planWeeks: PlanWeekLike[],
  daysPerWeekFallback: number,
): string | null {
  const completedWeeks = new Set(logs.map((l) => l.week_number)).size;
  const totalSessions = logs.length;

  if (completedWeeks === 0) {
    return null;
  }

  const weekDays = findPlanWeekDays(planWeeks, currentWeek);
  const workoutDayCount = weekDays.filter((d) => d.type === 'workout').length;
  const sessionsPlanned =
    workoutDayCount > 0 ? workoutDayCount : daysPerWeekFallback;
  const sessionsThisWeek = logs.filter((l) => l.week_number === currentWeek).length;
  const weekCompletionRate =
    sessionsPlanned > 0 ? sessionsThisWeek / sessionsPlanned : 0;

  if (completedWeeks === 1 && weekCompletionRate >= 1.0) {
    return 'Week 1 done — 100% completion rate. The grid fills up fast from here.';
  }

  if (completedWeeks < 3) {
    return `${totalSessions} ${totalSessions === 1 ? 'session' : 'sessions'} completed — keep building.`;
  }

  const weeksWithSessions = new Set(logs.map((l) => l.week_number)).size;
  const totalCompletedSessions = logs.length;
  return getConsistencyInsight(totalCompletedSessions, weeksWithSessions, daysPerWeekFallback);
}

function JordanInsightCard({ text }: { text: string }) {
  return (
    <View style={insightStyles.card}>
      <Text style={insightStyles.label}>JORDAN</Text>
      <Text style={insightStyles.text}>{stripEmDash(text)}</Text>
    </View>
  );
}

function LockedProFeatureCard({
  title,
  onUpgrade,
}: {
  title: string;
  onUpgrade: () => void;
}) {
  return (
    <View style={lockedProStyles.wrap}>
      <View style={lockedProStyles.card}>
        <Ionicons name="lock-closed-outline" size={20} color={Colors.textSecondary} />
        <Text style={lockedProStyles.chartName}>{title}</Text>
        <Text style={lockedProStyles.sub}>Available with Pro</Text>
        <TouchableOpacity
          onPress={onUpgrade}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={lockedProStyles.upgrade}>Upgrade →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const lockedProStyles = StyleSheet.create({
  wrap: {
    marginTop: 32,
  },
  card: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    alignItems: 'center',
    minHeight: 120,
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 24,
    marginBottom: Spacing.xs,
  },
  chartName: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.semiBold,
    color: Colors.textSecondary,
  },
  sub: {
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  upgrade: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.semiBold,
    color: Colors.accent,
    marginTop: Spacing.sm,
  },
});

const monthlyCheckInStyles = StyleSheet.create({
  wrap: { marginTop: Spacing.lg, marginBottom: Spacing.md },
  card: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  cardActive: { borderColor: Colors.accentBorder },
  label: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },
  labelActive: { color: Colors.accent },
  body: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  sub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  gateDate: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textSecondary,
  },
  gateSub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  upgrade: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
    marginTop: Spacing.sm,
  },
  cta: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  viewHistory: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
});

// ── Main Screen ──

export default function ProgressChartsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isPro: isRcPro } = useEntitlement();
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - Spacing.xl * 2 - 40;
  const {
    formatWorkoutWeight,
    unitLabel: unitLabelStr,
    isMetric,
    lbsToDisplay: lbsToDisplayHook,
    formatBodyWeight,
  } = useMetric();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  /** Active plan only — weekly volume + consistency heatmap */
  const [planLogs, setPlanLogs] = useState<any[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  interface ExerciseInfo { name: string; muscleGroup: string; }
  const [exerciseMap, setExerciseMap] = useState<Record<string, ExerciseInfo>>({});
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [planGoalMeta, setPlanGoalMeta] = useState<{
    goal?: string;
    goalLift?: string;
    current1RM?: number;
    experience?: string;
  } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedVolumeWeek, setSelectedVolumeWeek] = useState<number | null>(null);
  const chartFadeAnim = useRef(new Animated.Value(1)).current;
  const [weightData, setWeightData] = useState<WeightLogPoint[]>([]);
  const [planDaysPerWeek, setPlanDaysPerWeek] = useState(4);
  const [planCurrentWeek, setPlanCurrentWeek] = useState(1);
  const [planWeeksJson, setPlanWeeksJson] = useState<PlanWeekLike[]>([]);
  const [planCreatedAt, setPlanCreatedAt] = useState<string | null>(null);
  const [planTotalWeeks, setPlanTotalWeeks] = useState(12);
  const [prs, setPrs] = useState<ExerciseRecordDisplay[]>([]);
  const [prsLoading, setPrsLoading] = useState(true);
  const [lastPhotoAnalysisAt, setLastPhotoAnalysisAt] = useState<string | null>(
    null,
  );

  const loadProgressData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('No session');

      const [{ data: wlWeightLogs }, { data: profileRow }] = await Promise.all([
        supabase
          .from('weight_logs')
          .select('log_date, weight_lbs')
          .eq('user_id', userId)
          .order('log_date', { ascending: true })
          .limit(30),
        supabase
          .from('user_profiles')
          .select('last_photo_analysis_at')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      setWeightData((wlWeightLogs ?? []) as WeightLogPoint[]);
      setLastPhotoAnalysisAt(
        (profileRow as { last_photo_analysis_at?: string } | null)
          ?.last_photo_analysis_at ?? null,
      );

      // Fetch active plan first — workout_logs are gated on plan.id
      const { data: plan, error: pe } = await supabase
        .from('plans')
        .select('id, plan_json, current_week, total_weeks, goal_id, created_at')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pe || !plan) {
        setPlanGoalMeta(null);
        setPlanId(null);
        setLogs([]);
        setPlanLogs([]);
        setExerciseMap({});
        setPlanDaysPerWeek(4);
        setPlanCurrentWeek(1);
        setPlanWeeksJson([]);
        setPlanCreatedAt(null);
        setPlanTotalWeeks(12);
        setLoading(false);
        return;
      }

      setPlanId(plan.id);

      setPrsLoading(true);
      void getExerciseRecords(userId)
        .then((records) => {
          setPrs(records);
        })
        .catch(() => setPrs([]))
        .finally(() => setPrsLoading(false));

      // Gate on plan.id — only load logs for the active plan
      const { data: wlogs, error: le } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_id', plan.id)
        .order('week_number', { ascending: true });

      if (le) throw new Error(le.message);
      setLogs(wlogs ?? []);
      setPlanLogs(wlogs ?? []);

      setPlanCreatedAt(
        typeof plan.created_at === 'string' ? plan.created_at : null,
      );
      const pj = plan.plan_json as {
        daysPerWeek?: number;
        weeks?: PlanWeekLike[];
        totalWeeks?: number;
        goal?: string;
        goalLift?: string;
        targetLift?: string;
        current1RM?: number | string;
        experience?: string;
      } | null;
      const goalLiftRaw = pj?.goalLift ?? pj?.targetLift;
      const current1RMRaw = pj?.current1RM;
      const current1RMNum =
        current1RMRaw != null && String(current1RMRaw).trim() !== ''
          ? Number(current1RMRaw)
          : undefined;
      setPlanGoalMeta({
        goal: typeof pj?.goal === 'string' ? pj.goal : undefined,
        goalLift: typeof goalLiftRaw === 'string' ? goalLiftRaw : undefined,
        current1RM:
          current1RMNum != null && Number.isFinite(current1RMNum) && current1RMNum > 0
            ? current1RMNum
            : undefined,
        experience:
          typeof (pj as { experience?: string })?.experience === 'string'
            ? (pj as { experience: string }).experience
            : undefined,
      });
      const dpwRaw = pj?.daysPerWeek;
      setPlanDaysPerWeek(
        typeof dpwRaw === 'number' && dpwRaw >= 1 && dpwRaw <= 7
          ? dpwRaw
          : 4,
      );
      setPlanCurrentWeek(
        typeof plan.current_week === 'number' && plan.current_week >= 1
          ? plan.current_week
          : 1,
      );
      setPlanWeeksJson(Array.isArray(pj?.weeks) ? pj!.weeks! : []);

      const weeksFromJson = Array.isArray(pj?.weeks) ? pj!.weeks!.length : 0;
      const twRaw =
        typeof plan.total_weeks === 'number' && plan.total_weeks >= 1
          ? plan.total_weeks
          : typeof pj?.totalWeeks === 'number' && pj.totalWeeks >= 1
            ? pj.totalWeeks
            : weeksFromJson >= 1
              ? weeksFromJson
              : 12;
      setPlanTotalWeeks(Math.min(52, Math.max(1, twRaw)));

      const eMap: Record<string, { name: string; muscleGroup: string }> = {};
      for (const week of (plan.plan_json?.weeks ?? [])) {
        for (const day of (week.days ?? [])) {
          for (const ex of (day.exercises ?? [])) {
            if (ex.id && ex.name) {
              eMap[ex.id] = { name: ex.name, muscleGroup: ex.muscleGroup ?? '' };
            }
          }
        }
      }
      for (const log of wlogs ?? []) {
        const sets: unknown[] = Array.isArray(log.sets_json) ? log.sets_json : [];
        for (const raw of sets) {
          const s = raw as {
            exerciseId?: string;
            exerciseName?: string;
            name?: string;
            muscleGroup?: string;
          };
          const id = s.exerciseId;
          const name = s.exerciseName ?? s.name;
          if (id && name && !eMap[id]) {
            eMap[id] = { name, muscleGroup: s.muscleGroup ?? '' };
          }
        }
      }
      setExerciseMap(eMap);
    } catch (e: unknown) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProgressData();
  }, [loadProgressData]);

  // ── Process data ──

  function normalizeExerciseName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s*\(.*?\)/g, '')
      .replace(/s$/, '')
      .replace(/bent-over/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const exerciseNameToMuscle = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ex of EXERCISES) {
      map[normalizeExerciseName(ex.name)] = ex.primaryMuscle;
    }
    return map;
  }, []);

  const {
    strengthMap,
    loggedExercises,
    planExerciseNames,
    exerciseVolume,
    volumeWeekData,
    totalWorkouts,
    currentStreak,
    bestWeek,
  } = useMemo(() => {
    const sMap: Record<string, Map<number, number>> = {};
    const volMap = new Map<number, Map<string, number>>();
    const exerciseVolume: Record<string, number> = {};
    const logDates = new Set<string>();

    // Loop 1: ALL logs — strength 1RM history + streak + dates
    for (const log of logs) {
      const wk: number = log.week_number;
      const loggedAt: string | null = log.logged_at ?? log.created_at;
      if (loggedAt) {
        const d = new Date(loggedAt);
        logDates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }

      const sets: any[] = log.sets_json ?? [];
      for (const s of sets) {
        const name: string =
          s.exerciseName ?? s.name ?? exerciseMap[s.exerciseId]?.name ?? s.exerciseId ?? '';
        const weight = Number(s.weightLbs ?? s.weight ?? s.loggedWeight ?? 0);
        const reps = Number(s.reps ?? s.loggedReps ?? 0);
        if (!name || weight <= 0 || reps <= 0) continue;

        if (
          shouldExcludeSetFromRecords({
            is_timed: isTimedRawSet(s),
            plausibility_status: plausibilityStatusForRawSet(s),
            exercise_name: name,
            weight_lbs: weight,
            reps,
            rpe: s.rpe == null || s.rpe === 0 ? null : Number(s.rpe),
          })
        ) {
          continue;
        }

        const est1RM = estimateE1RM({
          load: weight,
          reps,
          rpe: s.rpe == null || s.rpe === 0 ? null : Number(s.rpe),
        });
        if (est1RM == null) continue;

        if (!sMap[name]) sMap[name] = new Map();
        const prev = sMap[name].get(wk) ?? 0;
        if (est1RM > prev) sMap[name].set(wk, Math.round(est1RM));
      }
    }

    // Loop 2: PLAN logs only — top exercises + volume
    // Uses planLogs so old test plans don't pollute topExercises
    for (const log of planLogs) {
      const sets: any[] = log.sets_json ?? [];
      for (const s of sets) {
        const name: string =
          s.exerciseName ?? s.name ?? exerciseMap[s.exerciseId]?.name ?? s.exerciseId ?? '';
        const weight = Number(s.weightLbs ?? s.weight ?? s.loggedWeight ?? 0);
        const reps = Number(s.reps ?? s.loggedReps ?? 0);
        if (!name || weight === 0) continue;

        exerciseVolume[name] = (exerciseVolume[name] ?? 0) + weight * reps;
      }
    }

    // Weekly volume by muscle: active plan only
    for (const log of planLogs) {
      const wk: number = log.week_number;
      const sets: any[] = log.sets_json ?? [];
      for (const s of sets) {
        const name: string =
          s.exerciseName ?? s.name ?? exerciseMap[s.exerciseId]?.name ?? s.exerciseId ?? '';
        const planMuscle = s.muscleGroup ?? exerciseMap[s.exerciseId]?.muscleGroup ?? '';
        const muscleGroup = planMuscle
          ? collapseToVolumeBucket(planMuscle)
          : resolveWeeklyVolumeMuscleGroup(name, exerciseNameToMuscle[normalizeExerciseName(name)]);

        if (!volMap.has(wk)) volMap.set(wk, new Map());
        const wkMap = volMap.get(wk)!;
        wkMap.set(muscleGroup, (wkMap.get(muscleGroup) ?? 0) + 1);
      }
    }

    const logged = Object.keys(sMap).filter((name) => (sMap[name]?.size ?? 0) > 0);
    logged.sort(
      (a, b) => (exerciseVolume[b] ?? 0) - (exerciseVolume[a] ?? 0),
    );

    const planNames = new Set<string>();
    for (const week of planWeeksJson) {
      for (const day of week.days ?? []) {
        for (const ex of (day as { exercises?: Array<{ name?: string; exerciseName?: string }> })
          .exercises ?? []) {
          const n = String(ex.exerciseName ?? ex.name ?? '').trim();
          if (n) planNames.add(n);
        }
      }
    }

    // Streak
    const today = new Date();
    let streak = 0;
    const sortedDates = Array.from(logDates).sort().reverse();
    if (sortedDates.length > 0) {
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const yesterdayD = new Date(today);
      yesterdayD.setDate(yesterdayD.getDate() - 1);
      const yesterdayStr = `${yesterdayD.getFullYear()}-${String(yesterdayD.getMonth() + 1).padStart(2, '0')}-${String(yesterdayD.getDate()).padStart(2, '0')}`;

      if (sortedDates[0] === todayStr || sortedDates[0] === yesterdayStr) {
        let checkDate = new Date(sortedDates[0]);
        for (const ds of sortedDates) {
          const expected = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
          if (ds === expected) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }
      }
    }

    // Best week
    const weekCounts: Record<number, number> = {};
    for (const log of logs) {
      weekCounts[log.week_number] = (weekCounts[log.week_number] ?? 0) + 1;
    }
    const bw = Object.entries(weekCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      strengthMap: sMap,
      loggedExercises: logged,
      planExerciseNames: [...planNames],
      exerciseVolume,
      volumeWeekData: volMap,
      totalWorkouts: logs.length,
      currentStreak: streak,
      bestWeek: bw ? { week: Number(bw[0]), sessions: bw[1] } : null,
    };
  }, [logs, planLogs, exerciseMap, planWeeksJson]);

  const isWeek1SparseState =
    planCurrentWeek === 1 && planLogs.length < 2;

  const targetLiftDisplayName = useMemo(() => {
    if (!planGoalMeta?.goalLift) return null;
    const defaultId = getDefaultStrengthLiftId(
      planGoalMeta.goal,
      planGoalMeta.goalLift,
    );
    const pool = [...new Set([...loggedExercises, ...planExerciseNames])];
    return pickExerciseNameForDefaultLift(defaultId, pool);
  }, [planGoalMeta, loggedExercises, planExerciseNames]);

  const visibleCategoryChips = useMemo(() => {
    const pool = isWeek1SparseState
      ? [...new Set([...loggedExercises, ...planExerciseNames])]
      : loggedExercises;
    const chips: string[] = ['All'];
    for (const cat of STRENGTH_CATEGORY_CHIPS) {
      if (cat === 'All') continue;
      if (pool.some((n) => getMuscleCategoryForExercise(n) === cat)) {
        chips.push(cat);
      }
    }
    return chips;
  }, [loggedExercises, planExerciseNames, isWeek1SparseState]);

  const exerciseChipList = useMemo(() => {
    const basePool = isWeek1SparseState
      ? [...new Set([...planExerciseNames, ...loggedExercises])]
      : loggedExercises;
    const filtered =
      selectedCategory === 'All'
        ? basePool
        : basePool.filter((n) => {
            const cat = getMuscleCategoryForExercise(n);
            return cat != null && cat === selectedCategory;
          });
    const sorted = [...filtered].sort(
      (a, b) => (exerciseVolume[b] ?? 0) - (exerciseVolume[a] ?? 0),
    );
    if (targetLiftDisplayName && sorted.includes(targetLiftDisplayName)) {
      return [
        targetLiftDisplayName,
        ...sorted.filter((n) => n !== targetLiftDisplayName),
      ];
    }
    return sorted;
  }, [
    loggedExercises,
    planExerciseNames,
    selectedCategory,
    isWeek1SparseState,
    exerciseVolume,
    targetLiftDisplayName,
  ]);

  useEffect(() => {
    if (exerciseChipList.length === 0) return;
    if (
      selectedExercise == null ||
      !exerciseChipList.includes(selectedExercise)
    ) {
      setSelectedExercise(exerciseChipList[0]);
    }
  }, [exerciseChipList, selectedExercise]);

  useEffect(() => {
    if (selectedExercise == null && targetLiftDisplayName) {
      setSelectedExercise(targetLiftDisplayName);
    }
  }, [targetLiftDisplayName, selectedExercise]);

  const strengthProjectionData: StrengthDataPoint[] = useMemo(() => {
    const start = planGoalMeta?.current1RM;
    if (!start || start <= 0) return [];
    const exp = planGoalMeta.experience ?? 'intermediate';
    const series = getStrengthProjection(start, exp, planTotalWeeks);
    return series.map((estimated1RM, week) => ({
      week,
      estimated1RM: Math.round(estimated1RM),
    }));
  }, [planGoalMeta, planTotalWeeks]);

  const showDashedProjectionOnly =
    isWeek1SparseState && strengthProjectionData.length > 0;

  const planMondayHeatmap = useMemo((): Date => {
    if (planCreatedAt) {
      return planMondayFromCreatedAt(new Date(planCreatedAt));
    }
    if (planLogs.length > 0) {
      const times = planLogs
        .map((l) => new Date(l.logged_at ?? l.created_at).getTime())
        .filter((t) => !Number.isNaN(t));
      const anchorDate = new Date(times.length > 0 ? Math.min(...times) : Date.now());
      return planMondayFromAnchor(anchorDate);
    }
    return planMondayFromAnchor(new Date());
  }, [planCreatedAt, planLogs]);

  const heatmapTotalWeeks = useMemo(
    () => Math.min(52, Math.max(1, planTotalWeeks)),
    [planTotalWeeks],
  );

  const gridDates = useMemo(() => {
    const n = heatmapTotalWeeks * HEATMAP_ROWS;
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(planMondayHeatmap);
      d.setDate(planMondayHeatmap.getDate() + i);
      return d;
    });
  }, [planMondayHeatmap, heatmapTotalWeeks]);

  const trainedIndices = useMemo(() => {
    const indices = new Set<number>();
    const numCells = heatmapTotalWeeks * HEATMAP_ROWS;
    if (!planLogs?.length) return indices;

    const planStartMidnight = new Date(planMondayHeatmap);
    planStartMidnight.setHours(0, 0, 0, 0);

    planLogs.forEach((log) => {
      const raw = log.logged_at ?? log.created_at;
      if (!raw) return;
      const logDate = new Date(raw);
      logDate.setHours(0, 0, 0, 0);
      const daysSince = Math.floor(
        (logDate.getTime() - planStartMidnight.getTime()) / (1000 * 60 * 60 * 24),
      );
      const weekIndex = Math.floor(daysSince / 7);
      const dayIndex = (logDate.getDay() + 6) % 7;
      const cellIndex = weekIndex * HEATMAP_ROWS + dayIndex;
      if (cellIndex >= 0 && cellIndex < numCells) {
        indices.add(cellIndex);
      }
    });

    return indices;
  }, [planLogs, planMondayHeatmap, heatmapTotalWeeks]);

  const heatmapDays = useMemo((): ConsistencyDay[] => {
    const cells = gridDates.map((d, i) => ({
      dateStr: localDateKey(d),
      trained: trainedIndices.has(i),
    }));
    if (__DEV__) {
      const planStartMidnight = new Date(planMondayHeatmap);
      planStartMidnight.setHours(0, 0, 0, 0);
      const grid0 = gridDates[0];
      console.log('[heatmap] planMonday:', planMondayHeatmap.toISOString());
      console.log('[heatmap] trained cell indices:', [...trainedIndices].sort((a, b) => a - b));
      console.log('[heatmap] gridDate[0]:', grid0 ? grid0.toISOString() : null);
      console.log(
        '[heatmap] gridDate[0] local key matches planMonday:',
        grid0 ? localDateKey(grid0) === localDateKey(planStartMidnight) : false,
      );
    }
    return cells;
  }, [gridDates, trainedIndices, planMondayHeatmap]);

  const activeExercise = selectedExercise ?? exerciseChipList[0] ?? null;

  const deloadWeekNumbers = useMemo(() => {
    const set = new Set<number>();
    for (const w of planWeeksJson) {
      const wk = w.weekNumber ?? w.week_number;
      if (typeof wk === 'number' && w.phase === 'deload') {
        set.add(wk);
      }
    }
    return set;
  }, [planWeeksJson]);

  const strengthData: StrengthDataPoint[] = useMemo(() => {
    if (!activeExercise || !strengthMap[activeExercise]) return [];
    return Array.from(strengthMap[activeExercise].entries())
      .map(([week, estimated1RM]) => ({
        week,
        estimated1RM,
        isDeload: deloadWeekNumbers.has(week),
      }))
      .sort((a, b) => a.week - b.week);
  }, [activeExercise, strengthMap, deloadWeekNumbers]);

  useEffect(() => {
    chartFadeAnim.setValue(0);
    Animated.timing(chartFadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [activeExercise, chartFadeAnim]);

  const categoryHasNoExercises =
    selectedCategory !== 'All' &&
    exerciseChipList.length === 0 &&
    !isWeek1SparseState;

  const showWeek1ChartHint =
    isWeek1SparseState &&
    (showDashedProjectionOnly || strengthData.length < 2);

  // ── Render ──

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.center, styles.statePadded]}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.statePadded}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Progress</Text>
          </View>
        </View>
        <View style={[styles.center, styles.statePadded]}>
          <TouchableOpacity style={styles.errorCard} onPress={loadProgressData} activeOpacity={0.7}>
            <Text style={styles.errorText}>Couldn't load your progress data. Tap to retry.</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const hasData = logs.length > 0;
  const sessionsLogged = planLogs.length;
  const heatmapStatLabel = `${sessionsLogged} ${sessionsLogged === 1 ? 'session' : 'sessions'} completed — Week ${planCurrentWeek} of ${planTotalWeeks}`;
  const premiumLocked = Platform.OS !== 'web' && !isRcPro;
  const goPaywall = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigation.navigate('ProfileTab' as any, {
      screen: 'SubscriptionManagement',
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Progress</Text>
          <Text style={styles.headerSubtitle}>Track your performance over time</Text>
        </View>

        <TouchableOpacity
          onPress={() => navigation.navigate('GoalTracker')}
          style={styles.goalLink}
          activeOpacity={0.7}
        >
          <Text style={styles.goalLinkText}>My Goal →</Text>
        </TouchableOpacity>

        {!hasData ? (
          <View style={styles.sectionCard}>
            <Text style={styles.placeholderText}>
              Complete your first workout to see progress charts.
            </Text>
          </View>
        ) : (
          <View style={styles.quickStatsRow}>
            <View style={styles.statCard}>
              <Text
                style={[
                  styles.statValue,
                  totalWorkouts > 0 && styles.statValueAccent,
                ]}
              >
                {totalWorkouts}
              </Text>
              <Text style={styles.statLabel}>Workouts</Text>
            </View>
            <View style={styles.statCard}>
              <Text
                style={[
                  styles.statValue,
                  currentStreak > 0 && styles.statValueAccent,
                ]}
              >
                {currentStreak}
              </Text>
              <Text style={styles.statLabel}>Day streak</Text>
            </View>
            <View style={styles.statCard}>
              <Text
                style={[
                  styles.statValue,
                  bestWeek != null && styles.statValueAccent,
                ]}
              >
                {bestWeek ? `W${bestWeek.week}` : '—'}
              </Text>
              <Text style={styles.statLabel}>Best week</Text>
            </View>
          </View>
        )}

        {Platform.OS !== 'web' ? (
          premiumLocked ? (
            <View style={monthlyCheckInStyles.wrap}>
              <View style={monthlyCheckInStyles.card}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.textSecondary} />
                <Text style={monthlyCheckInStyles.label}>MONTHLY CHECK-IN</Text>
                <Text style={monthlyCheckInStyles.sub}>Pro feature</Text>
                <TouchableOpacity onPress={goPaywall} activeOpacity={0.7}>
                  <Text style={monthlyCheckInStyles.upgrade}>Upgrade →</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (() => {
            const available = isPhotoCheckInAvailable(lastPhotoAnalysisAt);
            const nextAt = getNextCheckInDate(lastPhotoAnalysisAt);
            const daysLeft = daysUntilCheckIn(lastPhotoAnalysisAt);
            return (
              <View style={monthlyCheckInStyles.wrap}>
                {available ? (
                  <View style={[monthlyCheckInStyles.card, monthlyCheckInStyles.cardActive]}>
                    <Text style={[monthlyCheckInStyles.label, monthlyCheckInStyles.labelActive]}>
                      MONTHLY CHECK-IN
                    </Text>
                    <Text style={monthlyCheckInStyles.body}>
                      Jordan analyzes your progress photos to track body composition
                      changes and adjust your nutrition targets.
                    </Text>
                    <TouchableOpacity
                      style={monthlyCheckInStyles.cta}
                      onPress={() => navigation.navigate('ProgressPhoto')}
                      activeOpacity={0.85}
                    >
                      <Text style={monthlyCheckInStyles.ctaText}>Start Check-In →</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={monthlyCheckInStyles.card}>
                    <Text style={monthlyCheckInStyles.label}>NEXT CHECK-IN</Text>
                    {nextAt ? (
                      <>
                        <Text style={monthlyCheckInStyles.gateDate}>
                          Available {formatCheckInDate(nextAt)}
                        </Text>
                        <Text style={monthlyCheckInStyles.gateSub}>
                          in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
                        </Text>
                      </>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => navigation.navigate('ProgressPhoto')}
                      activeOpacity={0.7}
                      style={{ marginTop: Spacing.sm }}
                    >
                      <Text style={monthlyCheckInStyles.viewHistory}>View history →</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })()
        ) : null}

        {premiumLocked ? (
          <LockedProFeatureCard title="Strength Progression" onUpgrade={goPaywall} />
        ) : hasData ? (
          <>
            <Text style={styles.sectionHeading}>Strength Progression</Text>
            <Text style={styles.sectionSubLabel}>Estimated 1RM over time</Text>
            <View style={styles.sectionCard}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryChipScroll}
              >
                {visibleCategoryChips.map((cat) => {
                  const active = cat === selectedCategory;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categoryChip,
                        active && styles.categoryChipSelected,
                      ]}
                      onPress={() => setSelectedCategory(cat)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          active && styles.categoryChipTextSelected,
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {categoryHasNoExercises ? (
                <Text style={styles.categoryEmptyText}>
                  No {selectedCategory} exercises logged yet
                </Text>
              ) : exerciseChipList.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.liftChipRow,
                    isWeek1SparseState && styles.liftChipRowDimmed,
                  ]}
                >
                  {exerciseChipList.map((name) => {
                    const active = name === activeExercise;
                    const hasLoggedData = loggedExercises.includes(name);
                    const isTargetLift = name === targetLiftDisplayName;
                    const dimmed = isWeek1SparseState && !hasLoggedData;
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[
                          styles.liftChip,
                          active && styles.liftChipSelected,
                          isTargetLift && styles.liftChipPinned,
                          dimmed && styles.liftChipDimmed,
                        ]}
                        onPress={() => setSelectedExercise(name)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.liftChipText,
                            active && styles.liftChipTextSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : isWeek1SparseState ? (
                <Text style={styles.categoryEmptyText}>
                  No exercises in plan for this category yet
                </Text>
              ) : (
                <Text style={styles.placeholderTextMuted}>
                  Log more workouts to see progression
                </Text>
              )}

              {(strengthData.length > 0 || showDashedProjectionOnly) &&
              activeExercise ? (
                <Animated.View style={{ opacity: chartFadeAnim }}>
                  <LineChart
                    data={strengthData}
                    projectionData={strengthProjectionData}
                    projectionDashedOnly={showDashedProjectionOnly}
                    width={chartWidth}
                    height={200}
                  />
                </Animated.View>
              ) : activeExercise && !categoryHasNoExercises ? (
                <Text style={styles.placeholderTextMuted}>
                  No data for this exercise yet.
                </Text>
              ) : null}

              {strengthData.some((d) => d.isDeload) ? (
                <Text style={styles.chartHintText}>
                  Dashed segment = scheduled deload week (weight intentionally reduced)
                </Text>
              ) : null}

              {showWeek1ChartHint ? (
                <Text style={styles.chartWeek1Hint}>
                  Complete more sessions to see your progression curve
                </Text>
              ) : strengthData.length === 1 &&
                !isWeek1SparseState &&
                !strengthData.some((d) => d.isDeload) ? (
                <Text style={styles.chartHintText}>
                  Log more workouts to see progression
                </Text>
              ) : null}
            </View>

            {(() => {
              const insight = getStrengthInsight(strengthData, activeExercise ?? '');
              return insight ? <JordanInsightCard text={insight} /> : null;
            })()}
          </>
        ) : null}

        {/* ── PERSONAL RECORDS ─────────────────────────── */}
        {premiumLocked ? (
          <LockedProFeatureCard title="Personal Records" onUpgrade={goPaywall} />
        ) : (
          <>
            <View style={styles.prHeader}>
              <View>
                <Text style={styles.sectionLabel}>PERSONAL RECORDS</Text>
                <Text style={styles.sectionSub}>All-time best by estimated 1RM</Text>
              </View>
              <TouchableOpacity
                onPress={() => navigation.navigate('PersonalRecords')}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.prSeeAll}>See All →</Text>
              </TouchableOpacity>
            </View>

            {prsLoading ? (
              <ActivityIndicator
                color={Colors.accent}
                style={{ marginVertical: Spacing.lg }}
              />
            ) : prs.length === 0 ? (
              <View style={styles.prEmptyRow}>
                <Text style={styles.prEmptyRowText}>
                  Complete your first session to see records here.
                </Text>
              </View>
            ) : (
              <View style={styles.prList}>
                {prs.slice(0, 5).map((pr, i) => (
                  <TouchableOpacity
                    key={`${pr.exercise_key}-${i}`}
                    style={[
                      styles.prRow,
                      i === Math.min(prs.length, 5) - 1 && { borderBottomWidth: 0 },
                    ]}
                    onPress={() => navigation.navigate('PersonalRecords')}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.prRowRank,
                      i === 0 ? styles.prRankGold
                      : i === 1 ? styles.prRankSilver
                      : i === 2 ? styles.prRankBronze
                      : null,
                    ]}>
                      #{i + 1}
                    </Text>

                    <Text style={styles.prRowName} numberOfLines={1}>
                      {pr.display_name}
                    </Text>

                    <View style={styles.prRowRight}>
                      {pr.isRecent ? (
                        <View style={styles.prNewBadge}>
                          <Text style={styles.prNewText}>NEW</Text>
                        </View>
                      ) : null}
                      <Text style={styles.prRowValue}>
                        {formatWorkoutWeight(pr.best_e1rm)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!prsLoading && prs.length > 0 ? (
              <View style={styles.jordanCard}>
                <Text style={styles.jordanLabel}>JORDAN</Text>
                <Text style={styles.jordanText}>
                  {stripEmDash(`Your strongest lift is ${prs[0].display_name} at an estimated ${formatWorkoutWeight(prs[0].best_e1rm)} 1RM.${
                    prs.filter((p) => p.isRecent).length > 0
                      ? ` You set ${prs.filter((p) => p.isRecent).length} new record${prs.filter((p) => p.isRecent).length > 1 ? 's' : ''} in the last two weeks.`
                      : ' Keep logging to push these numbers up.'
                  }`)}
                </Text>
              </View>
            ) : null}
          </>
        )}

        {premiumLocked ? (
          <LockedProFeatureCard title="Body Measurements" onUpgrade={goPaywall} />
        ) : (
          <TouchableOpacity
            style={styles.bodyMeasurementsRow}
            onPress={() => navigation.navigate('BodyMeasurements')}
            activeOpacity={0.7}
          >
            <View style={styles.bodyMeasurementsRowLeft}>
              <Ionicons name="resize-outline" size={22} color={Colors.textSecondary} />
              <View>
                <Text style={styles.bodyMeasurementsTitle}>Body Measurements</Text>
                <Text style={styles.bodyMeasurementsSubtitle}>
                  Track waist, chest, hips & arms over time
                </Text>
              </View>
            </View>
            <Text style={styles.bodyMeasurementsChevron}>›</Text>
          </TouchableOpacity>
        )}

        {premiumLocked ? (
          <>
            <LockedProFeatureCard title="Weekly Volume" onUpgrade={goPaywall} />
            <LockedProFeatureCard title="Bodyweight Trend" onUpgrade={goPaywall} />
            <LockedProFeatureCard title="Consistency Heatmap" onUpgrade={goPaywall} />
          </>
        ) : hasData ? (
          <>
            {(() => {
              const volumeWeeks = Array.from(volumeWeekData.keys()).sort((a, b) => a - b);
              const activeVolWeek = selectedVolumeWeek ?? volumeWeeks[volumeWeeks.length - 1] ?? null;
              const weekMuscleData = activeVolWeek != null ? volumeWeekData.get(activeVolWeek) : null;
              const allMuscleEntries = weekMuscleData
                ? Array.from(weekMuscleData.entries()).filter(
                    ([mg]) => mg !== 'Other',
                  )
                : [];
              const totalSets = allMuscleEntries.reduce(
                (sum, [, s]) => sum + s,
                0,
              );
              const muscleRows = [...allMuscleEntries]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6);
              const maxSets = muscleRows[0]?.[1] ?? 1;
              const muscleGroupCount = allMuscleEntries.length;

              return (
                <>
                  <Text style={styles.sectionHeading}>Weekly Volume</Text>
                  <Text style={styles.sectionSubLabel}>
                    Total sets this week by muscle group
                  </Text>
                  <View style={styles.sectionCard}>
                    {volumeWeeks.length === 0 ? (
                      <Text style={styles.placeholderTextMuted}>
                        Log workouts to see weekly volume breakdown.
                      </Text>
                    ) : (
                      <>
                        <View style={styles.weekPillRow}>
                          {volumeWeeks.map((wk) => {
                            const active = wk === activeVolWeek;
                            return (
                              <TouchableOpacity
                                key={wk}
                                style={[
                                  styles.weekPill,
                                  active && styles.weekPillSelected,
                                ]}
                                onPress={() => setSelectedVolumeWeek(wk)}
                                activeOpacity={0.7}
                              >
                                <Text
                                  style={[
                                    styles.weekPillText,
                                    active && styles.weekPillTextSelected,
                                  ]}
                                >
                                  W{wk}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        {muscleRows.length > 0 ? (
                          <>
                            {muscleRows.map(([mg, sets]) => {
                              const color = getMuscleColor(mg);
                              const pct = sets / maxSets;
                              return (
                                <View key={mg} style={styles.volRow}>
                                  <View style={styles.volRowHeader}>
                                    <Text style={styles.volMuscle}>{mg}</Text>
                                    <Text style={styles.volSets}>{sets} sets</Text>
                                  </View>
                                  <EdgeBar
                                    progress={pct}
                                    height={8}
                                    fillColor={color}
                                    style={styles.volBarEdge}
                                  />
                                </View>
                              );
                            })}
                            <Text style={styles.volSummary}>
                              Week {activeVolWeek} · {totalSets} total sets across{' '}
                              {muscleGroupCount} muscle groups
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.placeholderTextMuted}>
                            No sets recorded for this week.
                          </Text>
                        )}
                      </>
                    )}
                  </View>

                  {(() => {
                    const insight = getVolumeInsight(muscleRows, planDaysPerWeek);
                    return insight ? <JordanInsightCard text={insight} /> : null;
                  })()}
                </>
              );
            })()}

            <Text style={styles.sectionHeading}>Bodyweight Trend</Text>
            <Text style={styles.sectionSubLabel}>Last 30 days ({unitLabelStr})</Text>
            <View style={[styles.sectionCard, styles.bodyweightSectionCard]}>
              {weightData.length < 2 ? (
                <Text style={styles.weightChartEmpty}>
                  Log your weight daily on the Dashboard to track your trend here.
                </Text>
              ) : (
                <WeightLineChart
                  data={weightData}
                  width={chartWidth}
                  height={180}
                  isMetric={isMetric}
                  lbsToDisplay={lbsToDisplayHook}
                  formatBodyWeight={formatBodyWeight}
                />
              )}
            </View>

            {(() => {
              const insight = getWeightInsight(weightData, isMetric);
              return insight ? <JordanInsightCard text={insight} /> : null;
            })()}

            {(() => {
              const note = computeBodyweightContradictionNote(
                planGoalMeta?.goal,
                weightData,
              );
              return note ? (
                <View style={styles.bodyweightGoalNoteCard}>
                  <Text style={styles.bodyweightGoalNoteLabel}>JORDAN</Text>
                  <Text style={styles.bodyweightGoalNoteText}>{note}</Text>
                </View>
              ) : null;
            })()}

            <Text style={styles.sectionHeading}>Consistency</Text>
            <Text style={styles.sectionSubLabel}>
              Training days by plan week
            </Text>
            <View style={styles.sectionCard}>
              <View style={styles.heatmapContainer}>
                <View style={styles.heatmapDayLabelsColumn}>
                  <View style={styles.heatmapWeekHeaderSpacer} />
                  {Array.from({ length: HEATMAP_ROWS }, (_, i) => (
                    <View key={i} style={styles.heatmapRow}>
                      <Text style={styles.heatmapRowLabel}>{HEATMAP_DAY_LABELS[i]}</Text>
                    </View>
                  ))}
                </View>
                {(() => {
                  const heatmapCore = (
                    <View>
                      <View style={styles.heatmapWeekLabelsRow}>
                        <View style={styles.heatmapWeekLabelGutter} />
                        {Array.from({ length: heatmapTotalWeeks }, (_, colIndex) => (
                          <View
                            key={colIndex}
                            style={[
                              styles.heatmapWeekLabelCell,
                              heatmapTotalWeeks <= 10 && styles.heatmapWeekLabelCellFlex,
                            ]}
                          >
                            <Text style={styles.heatmapWeekLabel}>
                              {colIndex + 1}
                            </Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.heatmapColumnsRow}>
                        {Array.from({ length: heatmapTotalWeeks }, (_, colIndex) => {
                          const isCurrentWeekCol = colIndex === planCurrentWeek - 1;
                          return (
                            <View
                              key={colIndex}
                              style={[
                                styles.heatmapWeekColumn,
                                heatmapTotalWeeks <= 10 && styles.heatmapWeekColumnFlex,
                                isCurrentWeekCol && styles.heatmapWeekColumnCurrent,
                              ]}
                            >
                              {Array.from({ length: HEATMAP_ROWS }, (_, rowIndex) => {
                                const cellIndex = colIndex * HEATMAP_ROWS + rowIndex;
                                const day = heatmapDays[cellIndex];
                                const trained = !!day?.trained;
                                return (
                                  <View
                                    key={rowIndex}
                                    style={[
                                      styles.heatmapCell,
                                      trained && styles.heatmapCellActive,
                                    ]}
                                  />
                                );
                              })}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                  return heatmapTotalWeeks > 10 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {heatmapCore}
                    </ScrollView>
                  ) : (
                    heatmapCore
                  );
                })()}
              </View>

              <Text style={styles.heatmapStat}>
                {heatmapStatLabel}
              </Text>
            </View>

            {(() => {
              const insight = getConsistencyJordanNote(
                planLogs as Array<{ week_number: number; plan_id?: string }>,
                planCurrentWeek,
                planWeeksJson,
                planDaysPerWeek,
              );
              return insight ? <JordanInsightCard text={insight} /> : null;
            })()}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 56,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  statePadded: {
    paddingTop: 56,
    paddingHorizontal: Spacing.xl,
  },

  header: {
    marginBottom: 0,
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  goalLink: {
    marginTop: 8,
    marginBottom: 0,
    alignSelf: 'flex-start',
  },
  goalLinkText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },

  prHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 32,
    marginBottom: Spacing.sm,
  },
  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionSub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  prSeeAll: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.accent,
    marginTop: 2,
  },
  prList: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  prRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  prRowRank: {
    fontSize: 16,
    width: 32,
    textAlign: 'center',
    fontFamily: Fonts.bold,
    color: Colors.textTertiary,
  },
  prRankGold:   { color: '#F59E0B' },
  prRankSilver: { color: '#A1A1AA' },
  prRankBronze: { color: '#C2783A' },
  prRowName: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    marginLeft: Spacing.sm,
    marginRight: Spacing.sm,
  },
  prRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  prNewBadge: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
  },
  prRowValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.accent,
  },
  prRowUnit: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  prNewText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.accent,
  },
  prEmptyRow: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  prEmptyRowText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  jordanCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  jordanLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  jordanText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  sectionHeading: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 32,
    marginBottom: 4,
  },
  sectionSubLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  sectionCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 20,
    marginBottom: Spacing.lg,
  },
  bodyweightSectionCard: {
    overflow: 'visible',
  },

  placeholderText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 24,
  },
  placeholderTextMuted: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 16,
  },
  chartHintText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 12,
  },
  weightChartEmpty: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 20,
  },
  bodyweightGoalNoteCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  bodyweightGoalNoteLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  bodyweightGoalNoteText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  errorCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.danger,
    padding: Spacing.lg,
  },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },

  quickStatsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
  },
  statValueAccent: {
    color: Colors.accent,
  },
  statLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },

  categoryChipScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
  },
  categoryChip: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  categoryChipSelected: {
    backgroundColor: Colors.accent,
  },
  categoryChipText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  categoryChipTextSelected: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: '#FFFFFF',
  },
  categoryEmptyText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginBottom: 12,
  },
  liftChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    paddingRight: 8,
  },
  liftChipRowDimmed: {
    opacity: 1,
  },
  liftChip: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
    maxWidth: 220,
  },
  liftChipSelected: {
    backgroundColor: Colors.accent,
  },
  liftChipPinned: {
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  liftChipDimmed: {
    opacity: 0.4,
  },
  liftChipText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  liftChipTextSelected: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: '#FFFFFF',
  },
  chartWeek1Hint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 12,
  },

  weekPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  weekPill: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekPillSelected: {
    backgroundColor: Colors.accent,
    borderWidth: 0,
  },
  weekPillText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },
  weekPillTextSelected: {
    color: Colors.textPrimary,
  },

  volRow: {
    marginBottom: Spacing.sm,
  },
  volRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  volMuscle: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  volSets: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginLeft: 8,
  },
  volBarEdge: {
    marginTop: 6,
  },
  volSummary: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },

  heatmapContainer: {
    flexDirection: 'row',
    marginTop: 4,
  },
  heatmapDayLabelsColumn: {
    justifyContent: 'flex-start',
    marginRight: Spacing.xs,
    minHeight: HEATMAP_GRID_HEIGHT,
  },
  heatmapWeekHeaderSpacer: {
    width: 14,
    height: 22,
  },
  heatmapWeekLabelGutter: {
    width: 14,
    height: 18,
    marginBottom: 4,
  },
  heatmapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEATMAP_CELL_SIZE,
    marginBottom: HEATMAP_CELL_GAP,
  },
  heatmapRowLabel: {
    width: 14,
    height: HEATMAP_CELL_SIZE,
    lineHeight: HEATMAP_CELL_SIZE,
    textAlignVertical: 'center',
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    textAlign: 'right',
  },
  heatmapWeekLabelsRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  heatmapWeekLabelCell: {
    width: HEATMAP_CELL_SIZE + HEATMAP_CELL_GAP,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heatmapWeekLabelCellFlex: {
    flex: 1,
    width: undefined,
    minWidth: HEATMAP_CELL_SIZE + HEATMAP_CELL_GAP,
  },
  heatmapWeekLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  heatmapColumnsRow: {
    flexDirection: 'row',
  },
  heatmapWeekColumn: {
    width: HEATMAP_CELL_SIZE + HEATMAP_CELL_GAP,
    alignItems: 'center',
    height: HEATMAP_GRID_HEIGHT,
  },
  heatmapWeekColumnFlex: {
    flex: 1,
    width: undefined,
    minWidth: HEATMAP_CELL_SIZE + HEATMAP_CELL_GAP,
    height: HEATMAP_GRID_HEIGHT,
  },
  heatmapWeekColumnCurrent: {
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    borderRadius: Radius.sm,
  },
  heatmapCell: {
    width: HEATMAP_CELL_SIZE,
    height: HEATMAP_CELL_SIZE,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.divider,
    marginBottom: HEATMAP_CELL_GAP,
  },
  heatmapCellActive: {
    backgroundColor: Colors.accent,
    borderWidth: 0,
  },
  heatmapStat: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: 20,
  },

  bodyMeasurementsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  bodyMeasurementsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  bodyMeasurementsEmoji: {
    fontSize: 22,
    marginRight: Spacing.sm,
  },
  bodyMeasurementsTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  bodyMeasurementsSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  bodyMeasurementsChevron: {
    fontFamily: Fonts.bold,
    fontSize: 22,
    color: Colors.accent,
  },
});

const insightStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.md,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.lg,
  },
  label: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  text: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});

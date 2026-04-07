import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import Svg, { Line as SvgLine, Rect, Circle, Text as SvgText, G } from 'react-native-svg';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';

interface StrengthDataPoint {
  week: number;
  estimated1RM: number;
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

const MUSCLE_COLORS: Record<string, string> = {
  'chest':        Colors.accent,
  'back':         Colors.success,
  'quadriceps':   Colors.warning,
  'quads':        Colors.warning,
  'shoulders':    '#8B5CF6', // TODO: map to design token
  'hamstrings':   '#EC4899', // TODO: map to design token
  'glutes':       Colors.accent,
  'biceps':       '#06B6D4', // TODO: map to design token
  'triceps':      '#84CC16', // TODO: map to design token
  'calves':       '#A78BFA', // TODO: map to design token
  'core':         '#FB923C', // TODO: map to design token
  'other':        Colors.divider,
};

// ── SVG Line Chart ──

function LineChart({
  data,
  width,
  height,
}: {
  data: StrengthDataPoint[];
  width: number;
  height: number;
}) {
  if (data.length === 0) return null;

  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const cw = width - padL - padR;
  const ch = height - padT - padB;

  const weeks = data.map((d) => d.week);
  const vals = data.map((d) => d.estimated1RM);
  const minW = Math.min(...weeks);
  const maxW = Math.max(...weeks);
  const minV = Math.min(...vals) * 0.9;
  const maxV = Math.max(...vals) * 1.1;
  const rangeW = maxW - minW || 1;
  const rangeV = maxV - minV || 1;

  const toX = (w: number) => padL + ((w - minW) / rangeW) * cw;
  const toY = (v: number) => padT + ch - ((v - minV) / rangeV) * ch;

  const points = data.map((d) => ({ x: toX(d.week), y: toY(d.estimated1RM) }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  const yTicks = 4;
  const yStep = rangeV / yTicks;

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
      {data.map((d) => (
        <SvgText
          key={`x-${d.week}`}
          x={toX(d.week)}
          y={height - 6}
          fill={Colors.textSecondary}
          fontSize={FontSizes.micro}
          fontFamily={Fonts.regular}
          textAnchor="middle"
        >
          W{d.week}
        </SvgText>
      ))}
      {/* Line */}
      <SvgLine x1={padL} y1={padT + ch} x2={width - padR} y2={padT + ch} stroke={Colors.divider} strokeWidth={1} />
      {points.length > 1 ? (
        <G>
          {/* eslint-disable-next-line react-native/no-raw-text */}
          <Rect width={0} height={0} />
          {(() => {
            const pathEl: React.ReactNode[] = [];
            for (let i = 1; i < points.length; i++) {
              pathEl.push(
                <SvgLine
                  key={`seg-${i}`}
                  x1={points[i - 1].x}
                  y1={points[i - 1].y}
                  x2={points[i].x}
                  y2={points[i].y}
                  stroke={Colors.accent}
                  strokeWidth={2.5}
                />
              );
            }
            return pathEl;
          })()}
        </G>
      ) : null}
      {/* Dots */}
      {points.map((p, i) => (
        <Circle key={`dot-${i}`} cx={p.x} cy={p.y} r={4} fill={Colors.accent} />
      ))}
    </Svg>
  );
}

// ── Weight Line Chart ──

function WeightLineChart({
  data,
  width,
  height,
}: {
  data: WeightLogPoint[];
  width: number;
  height: number;
}) {
  if (data.length < 2) return null;

  const padL = 44;
  const padR = 20 + 48;
  const padT = 24;
  const padB = 28;
  const cw = width - padL - padR;
  const ch = height - padT - padB;

  const weights = data.map((d) => d.weight_lbs);
  const minV = Math.floor(Math.min(...weights) - 2);
  const maxV = Math.ceil(Math.max(...weights) + 2);
  const rangeV = maxV - minV || 1;

  const toX = (i: number) => padL + (i / (data.length - 1)) * cw;
  const toY = (v: number) => padT + ch - ((v - minV) / rangeV) * ch;

  const points = data.map((d, i) => ({ x: toX(i), y: toY(d.weight_lbs) }));

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
  const lastWeight = data[data.length - 1].weight_lbs;
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
              {Math.round(val)}
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
        {`${lastWeight} lbs`}
      </SvgText>
    </Svg>
  );
}

function getStrengthInsight(
  data: StrengthDataPoint[],
  exerciseName: string,
): string | null {
  if (data.length < 2) return null;
  const first = data[0].estimated1RM;
  const last = data[data.length - 1].estimated1RM;
  const gain = Math.round(last - first);
  const weeks = data[data.length - 1].week - data[0].week;
  if (gain <= 0) {
    return `${exerciseName} has held steady over ${weeks} weeks — weights may need increasing to drive further progress.`;
  }
  return `${exerciseName} is up an estimated ${gain} lbs over ${weeks} weeks. Keep the load climbing each session.`;
}

function getVolumeInsight(
  muscleRows: [string, number][],
  weekNum: number,
): string | null {
  if (muscleRows.length === 0) return null;
  const top = muscleRows[0];
  const totalSets = muscleRows.reduce((s, [, n]) => s + n, 0);
  const lowest = muscleRows[muscleRows.length - 1];
  if (muscleRows.length === 1) {
    return `${top[0]} got ${top[1]} sets in Week ${weekNum}. Add variety across more muscle groups next week.`;
  }
  return `${top[0]} leads with ${top[1]} sets this week. ${lowest[0]} is lowest at ${lowest[1]} — consider balancing the volume.`;
}

function getWeightInsight(data: WeightLogPoint[]): string | null {
  if (data.length < 4) return null;
  const first = data[0].weight_lbs;
  const last = data[data.length - 1].weight_lbs;
  const diff = Math.round((last - first) * 10) / 10;
  const days = data.length;
  if (Math.abs(diff) < 0.5) {
    return `Weight has been stable over ${days} days — consistent with a maintenance or recomp approach.`;
  }
  if (diff < 0) {
    return `Down ${Math.abs(diff)} lbs over ${days} days — on track. Keep hitting your protein target to preserve muscle.`;
  }
  return `Up ${diff} lbs over ${days} days — expected for a building phase. Monitor the rate and adjust calories if needed.`;
}

function getConsistencyInsight(
  trainedDays: number,
  totalDays: number,
): string | null {
  const rate = Math.round((trainedDays / totalDays) * 100);
  if (trainedDays === 0) return null;
  if (rate >= 80) {
    return `${rate}% consistency over 10 weeks — that's elite-level attendance. This is what drives long-term results.`;
  }
  if (rate >= 60) {
    return `${rate}% consistency over 10 weeks — solid. Closing the gap to 80%+ will accelerate your progress significantly.`;
  }
  return `${rate}% consistency over 10 weeks. Getting to 3+ sessions per week consistently is the single biggest lever for improvement.`;
}

function JordanInsightCard({ text }: { text: string }) {
  return (
    <View style={insightStyles.card}>
      <Text style={insightStyles.label}>JORDAN</Text>
      <Text style={insightStyles.text}>{text}</Text>
    </View>
  );
}

// ── Main Screen ──

export default function ProgressChartsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - Spacing.xl * 2 - 40;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  interface ExerciseInfo { name: string; muscleGroup: string; }
  const [exerciseMap, setExerciseMap] = useState<Record<string, ExerciseInfo>>({});
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [selectedVolumeWeek, setSelectedVolumeWeek] = useState<number | null>(null);
  const [weightData, setWeightData] = useState<WeightLogPoint[]>([]);

  const loadProgressData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('No session');

      const { data: plan, error: pe } = await supabase
        .from('plans')
        .select('id, plan_json, current_week, total_weeks, goal_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (pe || !plan) {
        setPlanId(null);
        setLogs([]);
        setLoading(false);
        return;
      }

      setPlanId(plan.id);

      // Build exerciseId → { name, muscleGroup } lookup from plan_json
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
      setExerciseMap(eMap);

      const { data: wlogs, error: le } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_id', plan.id)
        .order('week_number', { ascending: true });

      if (le) throw new Error(le.message);
      setLogs(wlogs ?? []);

      const { data: wlWeightLogs } = await supabase
        .from('weight_logs')
        .select('log_date, weight_lbs')
        .eq('user_id', userId)
        .order('log_date', { ascending: true })
        .limit(30);

      setWeightData((wlWeightLogs ?? []) as WeightLogPoint[]);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProgressData();
  }, [loadProgressData]);

  // ── Process data ──

  const { strengthMap, topExercises, volumeWeekData, consistencyDays, totalWorkouts, currentStreak, bestWeek } = useMemo(() => {
    const sMap: Record<string, Map<number, number>> = {};
    const volMap = new Map<number, Map<string, number>>();
    const exerciseVolume: Record<string, number> = {};
    const logDates = new Set<string>();

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
        const rawMuscle: string =
          s.muscleGroup ?? exerciseMap[s.exerciseId]?.muscleGroup ?? 'Other';
        // Normalise to Title Case to prevent duplicate keys ("back" vs "Back")
        const muscleGroup = rawMuscle.charAt(0).toUpperCase() + rawMuscle.slice(1).toLowerCase();
        if (!name || weight === 0) continue;

        // Strength: Epley 1RM
        const est1RM = weight * (1 + reps / 30);

        if (!sMap[name]) sMap[name] = new Map();
        const prev = sMap[name].get(wk) ?? 0;
        if (est1RM > prev) sMap[name].set(wk, Math.round(est1RM));

        // Volume accumulator
        exerciseVolume[name] = (exerciseVolume[name] ?? 0) + weight * reps;

        if (!volMap.has(wk)) volMap.set(wk, new Map());
        const wkMap = volMap.get(wk)!;
        wkMap.set(muscleGroup, (wkMap.get(muscleGroup) ?? 0) + 1);
      }
    }

    // Top 4 exercises by volume
    const sorted = Object.entries(exerciseVolume).sort((a, b) => b[1] - a[1]);
    const top4 = sorted.slice(0, 4).map(([name]) => name);

    // Consistency: last 10 weeks calendar
    const today = new Date();
    const cDays: ConsistencyDay[] = [];
    for (let i = 69; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      cDays.push({ dateStr: ds, trained: logDates.has(ds) });
    }

    // Streak
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
      topExercises: top4,
      volumeWeekData: volMap,
      consistencyDays: cDays,
      totalWorkouts: logs.length,
      currentStreak: streak,
      bestWeek: bw ? { week: Number(bw[0]), sessions: bw[1] } : null,
    };
  }, [logs, exerciseMap]);

  const activeExercise = selectedExercise ?? topExercises[0] ?? null;
  const strengthData: StrengthDataPoint[] = useMemo(() => {
    if (!activeExercise || !strengthMap[activeExercise]) return [];
    return Array.from(strengthMap[activeExercise].entries())
      .map(([week, estimated1RM]) => ({ week, estimated1RM }))
      .sort((a, b) => a.week - b.week);
  }, [activeExercise, strengthMap]);

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
  const trainedDaysCount = consistencyDays.filter((d) => d.trained).length;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

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
          <>
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

            <Text style={styles.sectionHeading}>Strength Progression</Text>
            <Text style={styles.sectionSubLabel}>Estimated 1RM over time</Text>
            <View style={styles.sectionCard}>
              {topExercises.length > 0 ? (
                <>
                  <View style={styles.liftChipRow}>
                    {topExercises.map((name) => {
                      const active = name === activeExercise;
                      return (
                        <TouchableOpacity
                          key={name}
                          style={[styles.liftChip, active && styles.liftChipSelected]}
                          onPress={() => setSelectedExercise(name)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.liftChipText,
                              active && styles.liftChipTextSelected,
                            ]}
                          >
                            {name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {strengthData.length > 0 ? (
                    <>
                      <LineChart data={strengthData} width={chartWidth} height={200} />
                      {strengthData.length === 1 ? (
                        <Text style={styles.chartHintText}>
                          Keep training to see your progression curve
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.placeholderTextMuted}>
                      No data for this exercise yet.
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.placeholderTextMuted}>
                  Log your first workout to see strength progression.
                </Text>
              )}
            </View>

            {(() => {
              const insight = getStrengthInsight(strengthData, activeExercise ?? '');
              return insight ? <JordanInsightCard text={insight} /> : null;
            })()}

            {(() => {
              const volumeWeeks = Array.from(volumeWeekData.keys()).sort((a, b) => a - b);
              const activeVolWeek = selectedVolumeWeek ?? volumeWeeks[volumeWeeks.length - 1] ?? null;
              const weekMuscleData = activeVolWeek != null ? volumeWeekData.get(activeVolWeek) : null;
              const muscleRows = weekMuscleData
                ? Array.from(weekMuscleData.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
                : [];
              const maxSets = muscleRows[0]?.[1] ?? 1;
              const totalSets = muscleRows.reduce((sum, [, s]) => sum + s, 0);

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
                              const color = MUSCLE_COLORS[mg.toLowerCase()] ?? Colors.divider;
                              const pct = sets / maxSets;
                              return (
                                <View key={mg} style={styles.volRow}>
                                  <View style={styles.volRowHeader}>
                                    <Text style={styles.volMuscle}>{mg}</Text>
                                    <Text style={styles.volSets}>{sets} sets</Text>
                                  </View>
                                  <View style={styles.volBarBg}>
                                    <View
                                      style={[
                                        styles.volBarFill,
                                        {
                                          width: `${pct * 100}%` as `${number}%`,
                                          backgroundColor: color,
                                        },
                                      ]}
                                    />
                                  </View>
                                </View>
                              );
                            })}
                            <Text style={styles.volSummary}>
                              Week {activeVolWeek} · {totalSets} total sets across{' '}
                              {muscleRows.length} muscle groups
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.placeholderTextMuted}>
                            No sets logged for this week.
                          </Text>
                        )}
                      </>
                    )}
                  </View>

                  {(() => {
                    const insight = getVolumeInsight(muscleRows, activeVolWeek ?? 0);
                    return insight ? <JordanInsightCard text={insight} /> : null;
                  })()}
                </>
              );
            })()}

            <Text style={styles.sectionHeading}>Bodyweight Trend</Text>
            <Text style={styles.sectionSubLabel}>Last 30 days</Text>
            <View style={[styles.sectionCard, styles.bodyweightSectionCard]}>
              {weightData.length < 2 ? (
                <Text style={styles.weightChartEmpty}>
                  Log your weight daily on the Dashboard to track your trend here.
                </Text>
              ) : (
                <WeightLineChart data={weightData} width={chartWidth} height={180} />
              )}
            </View>

            {(() => {
              const insight = getWeightInsight(weightData);
              return insight ? <JordanInsightCard text={insight} /> : null;
            })()}

            <Text style={styles.sectionHeading}>Consistency</Text>
            <Text style={styles.sectionSubLabel}>
              Your training days over the last 10 weeks
            </Text>
            <View style={styles.sectionCard}>
              <View style={styles.heatmapContainer}>
                <View style={styles.heatmapDayLabels}>
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <Text key={i} style={styles.heatmapDayLabel}>
                      {d}
                    </Text>
                  ))}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View>
                    <View style={styles.heatmapWeekLabels}>
                      {Array.from({ length: 10 }, (_, i) => (
                        <Text key={i} style={styles.heatmapWeekLabel}>
                          {i + 1}
                        </Text>
                      ))}
                    </View>
                    {Array.from({ length: 7 }, (_, row) => (
                      <View key={row} style={styles.heatmapRow}>
                        {Array.from({ length: 10 }, (_, col) => {
                          const idx = col * 7 + row;
                          const day = consistencyDays[idx];
                          const isToday = day?.dateStr === todayStr;
                          return (
                            <View
                              key={col}
                              style={[
                                styles.heatmapCell,
                                isToday
                                  ? styles.heatmapCellToday
                                  : day?.trained
                                    ? styles.heatmapCellTrained
                                    : styles.heatmapCellEmpty,
                              ]}
                            />
                          );
                        })}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>

              <Text style={styles.heatmapStat}>
                {trainedDaysCount} training days in the last 10 weeks
              </Text>
            </View>

            {(() => {
              const insight = getConsistencyInsight(
                trainedDaysCount,
                consistencyDays.length,
              );
              return insight ? <JordanInsightCard text={insight} /> : null;
            })()}
          </>
        )}
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
    fontFamily: Fonts.bold,
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

  liftChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  liftChip: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  liftChipSelected: {
    backgroundColor: Colors.accent,
    borderWidth: 0,
  },
  liftChipText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  liftChipTextSelected: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
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
  volBarBg: {
    height: 6,
    backgroundColor: Colors.divider,
    borderRadius: Radius.full,
    marginTop: 6,
    overflow: 'hidden',
  },
  volBarFill: {
    height: 6,
    borderRadius: Radius.full,
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
  heatmapDayLabels: {
    justifyContent: 'flex-start',
    marginRight: Spacing.xs,
    paddingTop: 22,
  },
  heatmapDayLabel: {
    width: 16,
    height: 28,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    textAlign: 'right',
    lineHeight: 28,
  },
  heatmapWeekLabels: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  heatmapWeekLabel: {
    width: 32,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    textAlign: 'center',
    height: 18,
    lineHeight: 18,
  },
  heatmapRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  heatmapCell: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    margin: 2,
  },
  heatmapCellEmpty: {
    backgroundColor: Colors.bgElevated,
  },
  heatmapCellTrained: {
    backgroundColor: Colors.accent,
  },
  heatmapCellToday: {
    borderWidth: 1.5,
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentMuted,
  },
  heatmapStat: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: 20,
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

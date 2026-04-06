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
import { Colors } from '../constants/design';

interface StrengthDataPoint {
  week: number;
  estimated1RM: number;
}

interface WeightLogPoint {
  log_date: string;
  weight_lbs: number;
}

const formatChartDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
            <SvgText x={padL - 6} y={y + 4} fill={Colors.textSecondary} fontSize={10} textAnchor="end">
              {Math.round(val)}
            </SvgText>
          </G>
        );
      })}
      {/* X axis labels */}
      {data.map((d) => (
        <SvgText key={`x-${d.week}`} x={toX(d.week)} y={height - 6} fill={Colors.textSecondary} fontSize={10} textAnchor="middle">
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
  const padR = 20;
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

  // Max 7 evenly-spaced X axis labels
  const labelStep = data.length <= 7 ? 1 : Math.floor((data.length - 1) / 6);
  const labelIndices: number[] = [];
  for (let i = 0; i < data.length; i += labelStep) {
    labelIndices.push(i);
  }
  if (labelIndices[labelIndices.length - 1] !== data.length - 1) {
    labelIndices.push(data.length - 1);
  }

  // 4 Y-axis grid lines
  const yTicks = 4;
  const yStep = rangeV / yTicks;

  const lastPt = points[points.length - 1];
  const lastWeight = data[data.length - 1].weight_lbs;

  return (
    <Svg width={width} height={height}>
      {/* Y axis grid + labels */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const val = minV + i * yStep;
        const y = toY(val);
        return (
          <G key={`yw-${i}`}>
            <SvgLine x1={padL} y1={y} x2={width - padR} y2={y} stroke={Colors.divider} strokeWidth={1} />
            <SvgText x={padL - 6} y={y + 4} fill={Colors.textSecondary} fontSize={10} textAnchor="end">
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
          fill={Colors.textSecondary}
          fontSize={10}
          textAnchor="middle"
        >
          {formatChartDate(data[idx].log_date)}
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
        x={lastPt.x}
        y={lastPt.y - 10}
        fill={Colors.textPrimary}
        fontSize={13}
        fontWeight="600"
        textAnchor="middle"
      >
        {`${lastWeight} lbs`}
      </SvgText>
    </Svg>
  );
}

// ── Main Screen ──

export default function ProgressChartsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - 72; // card padding + scroll padding

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

  const { strengthMap, topExercises, volumeWeekData, volumeGroups, consistencyDays, totalWorkouts, currentStreak, bestWeek } = useMemo(() => {
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
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Progress</Text>
        </View>
        <View style={styles.center}>
          <TouchableOpacity style={styles.errorCard} onPress={loadProgressData} activeOpacity={0.7}>
            <Text style={styles.errorText}>Couldn't load your progress data. Tap to retry.</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const hasData = logs.length > 0;
  const trainedDaysCount = consistencyDays.filter((d) => d.trained).length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Progress</Text>
          <Text style={styles.headerSubtitle}>Track your performance over time</Text>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('GoalTracker')} style={styles.goalLink} activeOpacity={0.7}>
          <Text style={styles.goalLinkText}>My Goal →</Text>
        </TouchableOpacity>

        {!hasData ? (
          <View style={styles.card}>
            <Text style={styles.placeholderText}>
              Complete your first workout to see progress charts.
            </Text>
          </View>
        ) : (
          <>
            {/* ── Quick Stats ── */}
            <View style={styles.quickStatsRow}>
              <View style={styles.miniCard}>
                <Text style={styles.miniValue}>{totalWorkouts}</Text>
                <Text style={styles.miniLabel}>Workouts</Text>
              </View>
              <View style={styles.miniCard}>
                <Text style={styles.miniValue}>{currentStreak}</Text>
                <Text style={styles.miniLabel}>Day streak</Text>
              </View>
              <View style={styles.miniCard}>
                <Text style={styles.miniValue}>
                  {bestWeek ? `W${bestWeek.week}` : '—'}
                </Text>
                <Text style={styles.miniLabel}>Best week</Text>
              </View>
            </View>

            {/* ── Strength Progression ── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Strength Progression</Text>
              <Text style={styles.cardSubtitle}>Estimated 1RM over time</Text>

              {topExercises.length > 0 ? (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.chipScroll}
                    contentContainerStyle={styles.chipRow}
                  >
                    {topExercises.map((name) => {
                      const active = name === activeExercise;
                      return (
                        <TouchableOpacity
                          key={name}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setSelectedExercise(name)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {strengthData.length > 0 ? (
                    <>
                      <LineChart data={strengthData} width={chartWidth} height={200} />
                      {strengthData.length === 1 && (
                        <Text style={styles.hintText}>
                          Keep training to see your progression curve
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={styles.placeholderText}>
                      No data for this exercise yet.
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.placeholderText}>
                  Log your first workout to see strength progression.
                </Text>
              )}
            </View>

            {/* ── Weekly Volume ── */}
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
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Weekly Volume</Text>
                  <Text style={styles.cardSubtitle}>Total sets this week by muscle group</Text>

                  {volumeWeeks.length === 0 ? (
                    <Text style={styles.placeholderText}>
                      Log workouts to see weekly volume breakdown.
                    </Text>
                  ) : (
                    <>
                      {/* Week selector chips */}
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.chipScroll}
                        contentContainerStyle={styles.chipRow}
                      >
                        {volumeWeeks.map((wk) => {
                          const active = wk === activeVolWeek;
                          return (
                            <TouchableOpacity
                              key={wk}
                              style={[styles.chip, active && styles.chipActive]}
                              onPress={() => setSelectedVolumeWeek(wk)}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                W{wk}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>

                      {/* Muscle group bar list */}
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
                                  <View style={[styles.volBarFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
                                </View>
                              </View>
                            );
                          })}
                          <View style={styles.volDivider} />
                          <Text style={styles.volSummary}>
                            Week {activeVolWeek} · {totalSets} total sets across {muscleRows.length} muscle groups
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.placeholderText}>No sets logged for this week.</Text>
                      )}
                    </>
                  )}
                </View>
              );
            })()}

            {/* ── Bodyweight Trend ── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Bodyweight Trend</Text>
              <Text style={styles.cardSubtitle}>Last 30 days</Text>
              {weightData.length < 2 ? (
                <Text style={styles.weightChartEmpty}>
                  Log your weight daily on the Dashboard to track your trend here.
                </Text>
              ) : (
                <WeightLineChart data={weightData} width={chartWidth} height={180} />
              )}
            </View>

            {/* ── Consistency Heatmap ── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Consistency</Text>
              <Text style={styles.cardSubtitle}>Your training days over the last 10 weeks</Text>

              <View style={styles.heatmapContainer}>
                {/* Day labels */}
                <View style={styles.heatmapDayLabels}>
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <Text key={i} style={styles.heatmapDayLabel}>{d}</Text>
                  ))}
                </View>
                {/* Grid */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View>
                    {/* Week number labels */}
                    <View style={styles.heatmapWeekLabels}>
                      {Array.from({ length: 10 }, (_, i) => (
                        <Text key={i} style={styles.heatmapWeekLabel}>{i + 1}</Text>
                      ))}
                    </View>
                    {/* Cells: 7 rows × 10 columns */}
                    {Array.from({ length: 7 }, (_, row) => (
                      <View key={row} style={styles.heatmapRow}>
                        {Array.from({ length: 10 }, (_, col) => {
                          const idx = col * 7 + row;
                          const day = consistencyDays[idx];
                          return (
                            <View
                              key={col}
                              style={[
                                styles.heatmapCell,
                                { backgroundColor: day?.trained ? Colors.accent : Colors.divider },
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
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },

  header: { marginTop: 20, marginBottom: 24 },
  headerTitle: { color: Colors.textPrimary, fontSize: 24, fontWeight: '700' },
  headerSubtitle: { color: Colors.textSecondary, fontSize: 14, marginTop: 2 },
  goalLink: { marginBottom: 16 },
  goalLinkText: { color: Colors.accent, fontSize: 14, fontWeight: '700' },

  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  cardSubtitle: { color: Colors.textSecondary, fontSize: 13, marginBottom: 12 },

  placeholderText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  placeholderCenter: { alignItems: 'center', paddingVertical: 20 },
  placeholderEmoji: { fontSize: 32, marginBottom: 12 },
  placeholderTitleText: { color: Colors.textPrimary, fontSize: 15, textAlign: 'center' },
  placeholderSubText: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 8 },

  hintText: { color: Colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 8 },
  weightChartEmpty: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
  },

  errorCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.danger,
    padding: 16,
  },
  errorText: { color: Colors.textSecondary, fontSize: 14 },

  /* Quick Stats */
  quickStatsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  miniCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  miniValue: { color: Colors.textPrimary, fontSize: 22, fontWeight: '700' },
  miniLabel: { color: Colors.textSecondary, fontSize: 11, marginTop: 2, textAlign: 'center' },

  /* Chips */
  chipScroll: { marginBottom: 12 },
  chipRow: { gap: 8 },
  chip: {
    backgroundColor: Colors.divider,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  chipActive: { backgroundColor: Colors.accent },
  chipText: { color: Colors.textSecondary, fontSize: 12 },
  chipTextActive: { color: '#FFFFFF' }, // TODO: map to design token

  /* Volume list */
  volRow: { marginBottom: 10 },
  volRowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  volMuscle: { color: Colors.textPrimary, fontSize: 14, flex: 1 },
  volSets: { color: Colors.textSecondary, fontSize: 13 },
  volBarBg: { height: 6, borderRadius: 3, backgroundColor: Colors.divider, overflow: 'hidden' },
  volBarFill: { height: 6, borderRadius: 3 },
  volDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: 12 },
  volSummary: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center' },

  /* Heatmap */
  heatmapContainer: { flexDirection: 'row', marginTop: 12 },
  heatmapDayLabels: { justifyContent: 'flex-start', marginRight: 6, paddingTop: 18 },
  heatmapDayLabel: { color: Colors.textSecondary, fontSize: 10, height: 32, lineHeight: 32, textAlign: 'right' },
  heatmapWeekLabels: { flexDirection: 'row' },
  heatmapWeekLabel: { color: Colors.textSecondary, fontSize: 10, width: 32, textAlign: 'center', height: 18, lineHeight: 18 },
  heatmapRow: { flexDirection: 'row' },
  heatmapCell: { width: 28, height: 28, borderRadius: 4, margin: 2 },
  heatmapStat: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 12 },
});

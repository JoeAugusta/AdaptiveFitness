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
import Svg, { Line as SvgLine, Rect, Circle, Text as SvgText, G } from 'react-native-svg';
import { supabase } from '../Lib/supabase';

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const DISABLED_BG = '#334155';
const GRID_COLOR = '#2D3F55';

interface StrengthDataPoint {
  week: number;
  estimated1RM: number;
}

interface VolumeDataPoint {
  week: number;
  sets: number;
  muscleGroup: string;
}

interface ConsistencyDay {
  dateStr: string;
  trained: boolean;
}

const MUSCLE_COLORS: Record<string, string> = {
  Chest: '#3B82F6',
  Back: '#22C55E',
  Legs: '#F59E0B',
  Shoulders: '#8B5CF6',
};
const FALLBACK_COLORS = ['#EC4899', '#06B6D4', '#F97316', '#14B8A6'];

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
            <SvgLine x1={padL} y1={y} x2={width - padR} y2={y} stroke={GRID_COLOR} strokeWidth={1} />
            <SvgText x={padL - 6} y={y + 4} fill={TEXT_SECONDARY} fontSize={10} textAnchor="end">
              {Math.round(val)}
            </SvgText>
          </G>
        );
      })}
      {/* X axis labels */}
      {data.map((d) => (
        <SvgText key={`x-${d.week}`} x={toX(d.week)} y={height - 6} fill={TEXT_SECONDARY} fontSize={10} textAnchor="middle">
          W{d.week}
        </SvgText>
      ))}
      {/* Line */}
      <SvgLine x1={padL} y1={padT + ch} x2={width - padR} y2={padT + ch} stroke={GRID_COLOR} strokeWidth={1} />
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
                  stroke={ACCENT_BLUE}
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
        <Circle key={`dot-${i}`} cx={p.x} cy={p.y} r={4} fill={ACCENT_BLUE} />
      ))}
    </Svg>
  );
}

// ── SVG Bar Chart ──

function BarChart({
  weekData,
  groups,
  width,
  height,
}: {
  weekData: Map<number, Map<string, number>>;
  groups: string[];
  width: number;
  height: number;
}) {
  const padL = 36;
  const padR = 16;
  const padT = 12;
  const padB = 28;
  const cw = width - padL - padR;
  const ch = height - padT - padB;

  const weeks = Array.from(weekData.keys()).sort((a, b) => a - b);
  if (weeks.length === 0) return null;

  let maxSets = 0;
  for (const mg of weekData.values()) {
    for (const v of mg.values()) {
      if (v > maxSets) maxSets = v;
    }
  }
  maxSets = maxSets || 1;

  const groupW = cw / weeks.length;
  const barW = Math.max(4, (groupW * 0.7) / groups.length);
  const gapW = (groupW - barW * groups.length) / 2;

  const colorMap: Record<string, string> = {};
  let fallbackIdx = 0;
  for (const g of groups) {
    colorMap[g] = MUSCLE_COLORS[g] ?? FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length];
  }

  return (
    <Svg width={width} height={height}>
      <SvgLine x1={padL} y1={padT + ch} x2={width - padR} y2={padT + ch} stroke={GRID_COLOR} strokeWidth={1} />
      {weeks.map((wk, wi) => {
        const x0 = padL + wi * groupW + gapW;
        const mg = weekData.get(wk)!;
        return (
          <G key={`wg-${wk}`}>
            {groups.map((g, gi) => {
              const val = mg.get(g) ?? 0;
              const barH = (val / maxSets) * ch;
              return (
                <Rect
                  key={`b-${wk}-${g}`}
                  x={x0 + gi * barW}
                  y={padT + ch - barH}
                  width={barW - 1}
                  height={barH}
                  fill={colorMap[g]}
                  rx={2}
                />
              );
            })}
            <SvgText
              x={padL + wi * groupW + groupW / 2}
              y={height - 6}
              fill={TEXT_SECONDARY}
              fontSize={10}
              textAnchor="middle"
            >
              W{wk}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ── Main Screen ──

export default function ProgressChartsScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - 72; // card padding + scroll padding

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

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

      const { data: wlogs, error: le } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_id', plan.id)
        .order('week_number', { ascending: true });

      if (le) throw new Error(le.message);
      setLogs(wlogs ?? []);
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
        const name: string = s.exerciseName ?? s.name ?? '';
        const weight = Number(s.weight ?? s.loggedWeight ?? 0);
        const reps = Number(s.reps ?? s.loggedReps ?? 0);
        const muscleGroup: string = s.muscleGroup ?? 'Other';
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

    // All unique muscle groups from volume data, pick top 4
    const mgTotals: Record<string, number> = {};
    for (const wkMap of volMap.values()) {
      for (const [mg, sets] of wkMap.entries()) {
        mgTotals[mg] = (mgTotals[mg] ?? 0) + sets;
      }
    }
    const vGroups = Object.entries(mgTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([mg]) => mg);

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
      volumeGroups: vGroups,
      consistencyDays: cDays,
      totalWorkouts: logs.length,
      currentStreak: streak,
      bestWeek: bw ? { week: Number(bw[0]), sessions: bw[1] } : null,
    };
  }, [logs]);

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
          <ActivityIndicator size="large" color={ACCENT_BLUE} />
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
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Weekly Volume</Text>
              <Text style={styles.cardSubtitle}>Total sets per muscle group</Text>

              {volumeGroups.length > 0 ? (
                <>
                  <BarChart
                    weekData={volumeWeekData}
                    groups={volumeGroups}
                    width={chartWidth}
                    height={200}
                  />
                  <View style={styles.legendRow}>
                    {volumeGroups.map((g, i) => {
                      const color = MUSCLE_COLORS[g] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
                      return (
                        <View key={g} style={styles.legendItem}>
                          <View style={[styles.legendDot, { backgroundColor: color }]} />
                          <Text style={styles.legendText}>{g}</Text>
                        </View>
                      );
                    })}
                  </View>
                </>
              ) : (
                <Text style={styles.placeholderText}>
                  Log workouts to see weekly volume breakdown.
                </Text>
              )}
            </View>

            {/* ── Bodyweight Trend (placeholder) ── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Bodyweight Trend</Text>
              <View style={styles.placeholderCenter}>
                <Text style={styles.placeholderEmoji}>📊</Text>
                <Text style={styles.placeholderTitleText}>Bodyweight tracking coming soon</Text>
                <Text style={styles.placeholderSubText}>
                  Log your weight daily to track progress toward your goal.
                </Text>
              </View>
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
                                { backgroundColor: day?.trained ? ACCENT_BLUE : DISABLED_BG },
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
  safe: { flex: 1, backgroundColor: BG_DARK },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },

  header: { marginTop: 20, marginBottom: 24 },
  headerTitle: { color: TEXT_PRIMARY, fontSize: 24, fontWeight: '700' },
  headerSubtitle: { color: TEXT_SECONDARY, fontSize: 14, marginTop: 2 },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { color: TEXT_PRIMARY, fontSize: 16, fontWeight: '700' },
  cardSubtitle: { color: TEXT_SECONDARY, fontSize: 13, marginBottom: 12 },

  placeholderText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  placeholderCenter: { alignItems: 'center', paddingVertical: 20 },
  placeholderEmoji: { fontSize: 32, marginBottom: 12 },
  placeholderTitleText: { color: TEXT_PRIMARY, fontSize: 15, textAlign: 'center' },
  placeholderSubText: { color: TEXT_SECONDARY, fontSize: 13, textAlign: 'center', marginTop: 8 },

  hintText: { color: TEXT_SECONDARY, fontSize: 12, textAlign: 'center', marginTop: 8 },

  errorCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
    padding: 16,
  },
  errorText: { color: TEXT_SECONDARY, fontSize: 14 },

  /* Quick Stats */
  quickStatsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  miniCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  miniValue: { color: TEXT_PRIMARY, fontSize: 22, fontWeight: '700' },
  miniLabel: { color: TEXT_SECONDARY, fontSize: 11, marginTop: 2, textAlign: 'center' },

  /* Chips */
  chipScroll: { marginBottom: 12 },
  chipRow: { gap: 8 },
  chip: {
    backgroundColor: DISABLED_BG,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  chipActive: { backgroundColor: ACCENT_BLUE },
  chipText: { color: TEXT_SECONDARY, fontSize: 12 },
  chipTextActive: { color: '#FFFFFF' },

  /* Legend */
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: TEXT_SECONDARY, fontSize: 11 },

  /* Heatmap */
  heatmapContainer: { flexDirection: 'row', marginTop: 12 },
  heatmapDayLabels: { justifyContent: 'flex-start', marginRight: 6, paddingTop: 18 },
  heatmapDayLabel: { color: TEXT_SECONDARY, fontSize: 10, height: 32, lineHeight: 32, textAlign: 'right' },
  heatmapWeekLabels: { flexDirection: 'row' },
  heatmapWeekLabel: { color: TEXT_SECONDARY, fontSize: 10, width: 32, textAlign: 'center', height: 18, lineHeight: 18 },
  heatmapRow: { flexDirection: 'row' },
  heatmapCell: { width: 28, height: 28, borderRadius: 4, margin: 2 },
  heatmapStat: { color: TEXT_PRIMARY, fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 12 },
});

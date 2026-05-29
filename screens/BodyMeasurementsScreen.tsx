import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Line as SvgLine, Circle, Text as SvgText, G } from 'react-native-svg';
import type { ProgressStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { Ionicons } from '@expo/vector-icons';

type Nav = NativeStackNavigationProp<ProgressStackParamList, 'BodyMeasurements'>;

export type BodyMeasurementRow = {
  id: string;
  user_id: string;
  measured_at: string;
  waist_in: number | null;
  chest_in: number | null;
  hips_in: number | null;
  left_arm_in: number | null;
  right_arm_in: number | null;
  left_thigh_in: number | null;
  right_thigh_in: number | null;
  left_calf_in: number | null;
  right_calf_in: number | null;
  created_at: string;
};

type MeasureKey =
  | 'waist_in'
  | 'chest_in'
  | 'hips_in'
  | 'left_arm_in'
  | 'right_arm_in'
  | 'left_thigh_in'
  | 'right_thigh_in'
  | 'left_calf_in'
  | 'right_calf_in';

const MEASURE_ORDER: MeasureKey[] = [
  'waist_in',
  'chest_in',
  'hips_in',
  'left_arm_in',
  'right_arm_in',
  'left_thigh_in',
  'right_thigh_in',
  'left_calf_in',
  'right_calf_in',
];

const PILL_LABELS: Record<MeasureKey, string> = {
  waist_in: 'Waist',
  chest_in: 'Chest',
  hips_in: 'Hips',
  left_arm_in: 'Left Arm',
  right_arm_in: 'Right Arm',
  left_thigh_in: 'Left Thigh',
  right_thigh_in: 'Right Thigh',
  left_calf_in: 'Left Calf',
  right_calf_in: 'Right Calf',
};

const STAT_LABELS: Record<MeasureKey, string> = {
  waist_in: 'WAIST',
  chest_in: 'CHEST',
  hips_in: 'HIPS',
  left_arm_in: 'LEFT ARM',
  right_arm_in: 'RIGHT ARM',
  left_thigh_in: 'LEFT THIGH',
  right_thigh_in: 'RIGHT THIGH',
  left_calf_in: 'LEFT CALF',
  right_calf_in: 'RIGHT CALF',
};

const HISTORY_ABBR: Record<MeasureKey, string> = {
  waist_in: 'W',
  chest_in: 'C',
  hips_in: 'H',
  left_arm_in: 'LA',
  right_arm_in: 'RA',
  left_thigh_in: 'LT',
  right_thigh_in: 'RT',
  left_calf_in: 'LC',
  right_calf_in: 'RC',
};

function formatChartAxisDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function localTodayYmd(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function sortRowsChrono(a: BodyMeasurementRow, b: BodyMeasurementRow): number {
  const ad = a.measured_at.localeCompare(b.measured_at);
  if (ad !== 0) return ad;
  return a.created_at.localeCompare(b.created_at);
}

function sortRowsRev(a: BodyMeasurementRow, b: BodyMeasurementRow): number {
  return -sortRowsChrono(a, b);
}

function valueFor(row: BodyMeasurementRow, key: MeasureKey): number | null {
  const v = row[key];
  return v != null && Number.isFinite(v) ? v : null;
}

function chartPointsFor(rows: BodyMeasurementRow[], key: MeasureKey): { date: string; value: number }[] {
  const sorted = [...rows].sort(sortRowsChrono);
  const out: { date: string; value: number }[] = [];
  for (const r of sorted) {
    const v = valueFor(r, key);
    if (v != null) out.push({ date: r.measured_at, value: v });
  }
  return out;
}

function MeasurementLineChart({
  data,
  width,
  height,
}: {
  data: { date: string; value: number }[];
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

  const vals = data.map((d) => d.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const pad = (maxV - minV) * 0.1 || 0.5;
  const minY = minV - pad;
  const maxY = maxV + pad;
  const rangeY = maxY - minY || 1;

  const toX = (i: number) => padL + (i / (data.length - 1)) * cw;
  const toY = (v: number) => padT + ch - ((v - minY) / rangeY) * ch;

  const points = data.map((d, i) => ({ x: toX(i), y: toY(d.value) }));

  const labelIndices: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    labelIndices.push(i);
  }
  if (labelIndices[labelIndices.length - 1] !== data.length - 1) {
    labelIndices.push(data.length - 1);
  }

  const yTicks = 4;
  const yStep = rangeY / yTicks;

  return (
    <Svg width={width} height={height}>
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const val = minY + i * yStep;
        const y = toY(val);
        return (
          <G key={`ym-${i}`}>
            <SvgLine x1={padL} y1={y} x2={width - padR} y2={y} stroke={Colors.divider} strokeWidth={1} />
            <SvgText
              x={padL - 6}
              y={y + 4}
              fill={Colors.textTertiary}
              fontSize={FontSizes.micro}
              fontFamily={Fonts.regular}
              textAnchor="end"
            >
              {Math.round(val * 10) / 10}
            </SvgText>
          </G>
        );
      })}
      <SvgLine x1={padL} y1={padT + ch} x2={width - padR} y2={padT + ch} stroke={Colors.divider} strokeWidth={1} />
      {labelIndices.map((idx) => (
        <SvgText
          key={`xm-${idx}`}
          x={points[idx].x}
          y={height - 6}
          fill={Colors.textTertiary}
          fontSize={FontSizes.micro}
          fontFamily={Fonts.regular}
          textAnchor="middle"
        >
          {formatChartAxisDate(data[idx].date)}
        </SvgText>
      ))}
      {(() => {
        const segs: React.ReactNode[] = [];
        for (let i = 1; i < points.length; i++) {
          segs.push(
            <SvgLine
              key={`ms-${i}`}
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
      {points.map((p, i) => (
        <Circle key={`md-${i}`} cx={p.x} cy={p.y} r={4} fill={Colors.accent} />
      ))}
    </Svg>
  );
}

function badgeColorForDelta(
  key: MeasureKey,
  delta: number,
  goal: string | null,
): string {
  const g = goal ?? '';
  const fatStyle = g === 'fat_loss' || g === 'recomp';
  const muscleGoals =
    g === 'hypertrophy' || g === 'strength' || g === 'power_hypertrophy';

  if (key === 'waist_in' || key === 'hips_in') {
    if (fatStyle) {
      return delta <= 0 ? Colors.success : Colors.danger;
    }
    return delta <= 0 ? Colors.success : Colors.danger;
  }
  if (muscleGoals) {
    return delta >= 0 ? Colors.success : Colors.danger;
  }
  return delta >= 0 ? Colors.success : Colors.danger;
}

function firstLastForField(
  rows: BodyMeasurementRow[],
  key: MeasureKey,
): { first: number; last: number } | null {
  const sorted = [...rows].sort(sortRowsChrono);
  const vals: number[] = [];
  for (const r of sorted) {
    const v = valueFor(r, key);
    if (v != null) vals.push(v);
  }
  if (vals.length < 2) return null;
  return { first: vals[0]!, last: vals[vals.length - 1]! };
}

function latestPlaceholder(
  rows: BodyMeasurementRow[],
  key: MeasureKey,
): string {
  const rev = [...rows].sort(sortRowsRev);
  for (const r of rev) {
    const v = valueFor(r, key);
    if (v != null) return String(v);
  }
  return '';
}

type LogModalProps = {
  visible: boolean;
  onClose: () => void;
  userId: string;
  rows: BodyMeasurementRow[];
  onSaved: () => void;
};

function LogMeasurementModal({ visible, onClose, userId, rows, onSaved }: LogModalProps) {
  const today = useMemo(() => new Date(), []);
  const measuredAt = localTodayYmd();
  const displayDate = formatDisplayDate(today);

  const [waist, setWaist] = useState('');
  const [chest, setChest] = useState('');
  const [hips, setHips] = useState('');
  const [leftArm, setLeftArm] = useState('');
  const [rightArm, setRightArm] = useState('');
  const [leftThigh, setLeftThigh] = useState('');
  const [rightThigh, setRightThigh] = useState('');
  const [leftCalf, setLeftCalf] = useState('');
  const [rightCalf, setRightCalf] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setWaist('');
    setChest('');
    setHips('');
    setLeftArm('');
    setRightArm('');
    setLeftThigh('');
    setRightThigh('');
    setLeftCalf('');
    setRightCalf('');
  }, [visible]);

  const hasAnyNumber = useMemo(() => {
    const nums = [
      waist,
      chest,
      hips,
      leftArm,
      rightArm,
      leftThigh,
      rightThigh,
      leftCalf,
      rightCalf,
    ].map((s) => parseFloat(String(s).trim()));
    return nums.some((n) => !Number.isNaN(n) && n > 0);
  }, [waist, chest, hips, leftArm, rightArm, leftThigh, rightThigh, leftCalf, rightCalf]);

  const save = async () => {
    setError(null);
    const payload: Record<string, unknown> = {
      user_id: userId,
      measured_at: measuredAt,
    };
    const w = parseFloat(waist.trim());
    if (!Number.isNaN(w) && w > 0) payload.waist_in = w;
    const c = parseFloat(chest.trim());
    if (!Number.isNaN(c) && c > 0) payload.chest_in = c;
    const h = parseFloat(hips.trim());
    if (!Number.isNaN(h) && h > 0) payload.hips_in = h;
    const la = parseFloat(leftArm.trim());
    if (!Number.isNaN(la) && la > 0) payload.left_arm_in = la;
    const ra = parseFloat(rightArm.trim());
    if (!Number.isNaN(ra) && ra > 0) payload.right_arm_in = ra;
    const lt = parseFloat(leftThigh.trim());
    if (!Number.isNaN(lt) && lt > 0) payload.left_thigh_in = lt;
    const rt = parseFloat(rightThigh.trim());
    if (!Number.isNaN(rt) && rt > 0) payload.right_thigh_in = rt;
    const lc = parseFloat(leftCalf.trim());
    if (!Number.isNaN(lc) && lc > 0) payload.left_calf_in = lc;
    const rc = parseFloat(rightCalf.trim());
    if (!Number.isNaN(rc) && rc > 0) payload.right_calf_in = rc;

    if (Object.keys(payload).length <= 2) {
      setError('Enter at least one measurement.');
      return;
    }

    setSaving(true);
    const { error: insErr } = await supabase.from('body_measurements').insert(payload as never);
    setSaving(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    onSaved();
    onClose();
  };

  const row = (
    label: string,
    value: string,
    setVal: (s: string) => void,
    ph: string,
  ) => (
    <View style={modalStyles.inputRow}>
      <Text style={modalStyles.inputLabel}>{label}</Text>
      <View style={modalStyles.inputContainer}>
        <TextInput
          style={modalStyles.input}
          value={value}
          onChangeText={setVal}
          keyboardType="decimal-pad"
          placeholder={ph.length > 0 ? ph : '—'}
          placeholderTextColor={Colors.textTertiary}
        />
      </View>
      <Text style={modalStyles.unit}>in</Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={modalStyles.modalRoot}>
        <TouchableOpacity style={modalStyles.backdrop} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={modalStyles.sheetWrap}
        >
        <View style={modalStyles.sheet}>
          <View style={modalStyles.sheetHeader}>
            <Text style={modalStyles.sheetTitle}>Log Measurements</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={modalStyles.sheetClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={modalStyles.dateLabel}>Date</Text>
          <Text style={modalStyles.dateValue}>{displayDate}</Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={modalStyles.sheetScroll}
          >
            {row('Waist', waist, setWaist, latestPlaceholder(rows, 'waist_in'))}
            {row('Chest', chest, setChest, latestPlaceholder(rows, 'chest_in'))}
            {row('Hips', hips, setHips, latestPlaceholder(rows, 'hips_in'))}
            {row('Left arm', leftArm, setLeftArm, latestPlaceholder(rows, 'left_arm_in'))}
            {row('Right arm', rightArm, setRightArm, latestPlaceholder(rows, 'right_arm_in'))}
            {row('Left thigh', leftThigh, setLeftThigh, latestPlaceholder(rows, 'left_thigh_in'))}
            {row('Right thigh', rightThigh, setRightThigh, latestPlaceholder(rows, 'right_thigh_in'))}
            {row('Left calf', leftCalf, setLeftCalf, latestPlaceholder(rows, 'left_calf_in'))}
            {row('Right calf', rightCalf, setRightCalf, latestPlaceholder(rows, 'right_calf_in'))}
          </ScrollView>
          {error ? <Text style={modalStyles.errorText}>{error}</Text> : null}
          <TouchableOpacity
            style={[modalStyles.saveBtn, (!hasAnyNumber || saving) && modalStyles.saveBtnDisabled]}
            onPress={save}
            disabled={!hasAnyNumber || saving}
            activeOpacity={0.85}
          >
            <Text style={[modalStyles.saveBtnText, (!hasAnyNumber || saving) && modalStyles.saveBtnTextDisabled]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function BodyMeasurementsScreen() {
  const navigation = useNavigation<Nav>();
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - Spacing.xl * 2;
  const statCardWidth = (screenWidth - Spacing.xl * 2 - Spacing.md) / 2;
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BodyMeasurementRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MeasureKey>('waist_in');
  const [logOpen, setLogOpen] = useState(false);
  const [planGoal, setPlanGoal] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id ?? null;
    setUserId(uid);
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }

    const [{ data: ms, error: mErr }, { data: planRow }] = await Promise.all([
      supabase
        .from('body_measurements')
        .select('*')
        .eq('user_id', uid)
        .order('measured_at', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('plans')
        .select('plan_json')
        .eq('user_id', uid)
        .in('status', ['active', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!mErr && ms) {
      setRows(ms as BodyMeasurementRow[]);
    } else {
      setRows([]);
    }

    const pj = planRow?.plan_json as { goal?: string } | undefined;
    setPlanGoal(pj?.goal ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const series = useMemo(() => chartPointsFor(rows, selected), [rows, selected]);

  const stats = useMemo(() => {
    const rev = [...rows].sort(sortRowsRev);
    const out: Record<MeasureKey, number | null> = {
      waist_in: null,
      chest_in: null,
      hips_in: null,
      left_arm_in: null,
      right_arm_in: null,
      left_thigh_in: null,
      right_thigh_in: null,
      left_calf_in: null,
      right_calf_in: null,
    };
    for (const key of MEASURE_ORDER) {
      for (const r of rev) {
        const v = valueFor(r, key);
        if (v != null) {
          out[key] = v;
          break;
        }
      }
    }
    return out;
  }, [rows]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Body Measurements</Text>
        <TouchableOpacity onPress={() => setLogOpen(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.logBtn}>Log</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
            {MEASURE_ORDER.map((key) => {
              const active = key === selected;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setSelected(key)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{PILL_LABELS[key]}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.chartCard}>
            {rows.length === 0 ? (
              <View style={styles.emptyChart}>
                <Ionicons name="resize-outline" size={48} color={Colors.textSecondary} />
                <Text style={styles.emptyTitle}>No measurements yet</Text>
                <Text style={styles.emptySub}>Tap Log to record your first check-in</Text>
              </View>
            ) : series.length < 2 ? (
              <View style={styles.emptyChart}>
                <Text style={styles.emptyTitle}>Not enough data</Text>
                <Text style={styles.emptySub}>
                  Log at least two entries with {PILL_LABELS[selected]} to see the trend.
                </Text>
              </View>
            ) : (
              <MeasurementLineChart data={series} width={chartWidth - Spacing.md * 2} height={200} />
            )}
          </View>

          <View style={styles.statGrid}>
            {MEASURE_ORDER.map((key) => {
              const v = stats[key];
              const fl = firstLastForField(rows, key);
              let deltaStr: string | null = null;
              let deltaColor = Colors.textSecondary;
              if (fl) {
                const delta = fl.last - fl.first;
                if (Math.abs(delta) >= 0.01) {
                  const sign = delta > 0 ? '+' : '−';
                  deltaStr = `${sign}${Math.abs(delta).toFixed(1)} in`;
                  deltaColor = badgeColorForDelta(key, delta, planGoal);
                }
              }
              return (
                <View key={key} style={[styles.statCard, { width: statCardWidth }]}>
                  <Text style={styles.statName}>{STAT_LABELS[key]}</Text>
                  <Text style={styles.statValue}>{v != null ? `${v} in` : '—'}</Text>
                  {deltaStr ? <Text style={[styles.statDelta, { color: deltaColor }]}>{deltaStr}</Text> : null}
                </View>
              );
            })}
          </View>

          <Text style={styles.historyHeading}>HISTORY</Text>
          {(() => {
            const historySorted = [...rows].sort(sortRowsRev);
            return historySorted.map((r, i) => {
            const parts: string[] = [];
            for (const key of MEASURE_ORDER) {
              const v = valueFor(r, key);
              if (v != null) parts.push(`${HISTORY_ABBR[key]}: ${v}`);
            }
            const d = new Date(`${r.measured_at}T12:00:00`);
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return (
              <View key={r.id}>
                <View style={styles.historyRow}>
                  <Text style={styles.historyDate}>{dateStr}</Text>
                  <Text style={styles.historyVals}>{parts.join('  ') || '—'}</Text>
                </View>
                {i < historySorted.length - 1 ? <View style={styles.historyDivider} /> : null}
              </View>
            );
          });
          })()}
        </ScrollView>
      )}

      {userId ? (
        <LogMeasurementModal
          visible={logOpen}
          onClose={() => setLogOpen(false)}
          userId={userId}
          rows={rows}
          onSaved={() => void load()}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  backChevron: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    color: Colors.accent,
    width: 40,
  },
  screenTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  logBtn: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.accent,
    width: 40,
    textAlign: 'right',
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxxl,
  },
  pillRow: {
    flexDirection: 'row',
    paddingBottom: Spacing.md,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.divider,
    marginRight: Spacing.sm,
  },
  pillActive: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
  },
  pillText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  pillTextActive: {
    color: Colors.accent,
  },
  chartCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    minHeight: 220,
    justifyContent: 'center',
  },
  emptyChart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  statCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  statName: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  statValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },
  statDelta: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    marginTop: Spacing.xs,
  },
  historyHeading: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: Spacing.md,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  historyDate: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    flexShrink: 0,
  },
  historyVals: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    flex: 1,
    textAlign: 'right',
  },
  historyDivider: {
    height: 1,
    backgroundColor: Colors.divider,
  },
});

const modalStyles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: '92%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sheetTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  sheetClose: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textSecondary,
  },
  dateLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  dateValue: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
  },
  sheetScroll: {
    paddingBottom: Spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  inputLabel: {
    width: 90,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  inputContainer: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  input: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    textAlign: 'right',
    padding: 0,
    margin: 0,
  },
  unit: {
    marginLeft: Spacing.xs,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    width: 20,
  },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.danger,
    marginBottom: Spacing.sm,
  },
  saveBtn: {
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  saveBtnDisabled: {
    backgroundColor: Colors.bgElevated,
  },
  saveBtnText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  saveBtnTextDisabled: {
    color: Colors.textTertiary,
  },
});

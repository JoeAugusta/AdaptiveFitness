import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Animated,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes } from '../constants/design';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// ── Types ──

interface GoalRow {
  id: string;
  user_id: string;
  goal_type: string;
  target_lift?: string;
  current_1rm?: number;
  target_1rm?: number;
  starting_weight_lbs?: number;
  target_weight_lbs?: number;
  target_body_fat_pct?: number;
  plan_duration_weeks?: number;
  status: string;
  created_at: string;
  projection_text?: string | null;
  projection_metrics?: Record<string, any> | null;
}

interface PlanRow {
  id: string;
  current_week: number;
  total_weeks: number;
  plan_json: any;
}

interface ProgressResult {
  progressPct: number;
  progressLabel: string;
  details: string;
}

interface Milestone {
  pct: number;
  label: string;
  reached: boolean;
}

const GOAL_BADGE: Record<string, { color: string; label: string }> = {
  strength:    { color: Colors.warning, label: 'Strength' },
  hypertrophy: { color: '#8B5CF6', label: 'Hypertrophy' }, // TODO: map to design token
  recomp:      { color: '#06B6D4', label: 'Recomposition' }, // TODO: map to design token
  fat_loss:    { color: Colors.success, label: 'Fat Loss' },
  general:     { color: Colors.accent, label: 'General Fitness' },
};

const MILESTONE_DEFS = [
  { pct: 25,  label: 'Getting Started 🌱' },
  { pct: 50,  label: 'Halfway There 💪' },
  { pct: 75,  label: 'Almost There 🔥' },
  { pct: 90,  label: 'Final Push ⚡' },
  { pct: 100, label: 'Goal Complete 🏆' },
];

function calculateProgress(goal: GoalRow, plan: PlanRow | null, current1rm: number | null): ProgressResult {
  const gt = goal.goal_type;

  if (gt === 'strength') {
    const start = goal.current_1rm ?? 0;
    const target = goal.target_1rm ?? start;
    const current = current1rm ?? start;
    const range = target - start;
    const pct = range > 0 ? Math.min(100, Math.max(0, ((current - start) / range) * 100)) : 0;
    return {
      progressPct: Math.round(pct),
      progressLabel: 'Current estimated 1RM',
      details: `${Math.round(current)}lbs → ${target}lbs`,
    };
  }

  if (gt === 'fat_loss') {
    const start = goal.starting_weight_lbs ?? 0;
    const target = goal.target_weight_lbs ?? (start - 10);
    const range = start - target;
    return {
      progressPct: 0,
      progressLabel: 'Weight lost',
      details: `Started ${start}lbs, target ${target}lbs`,
    };
  }

  // hypertrophy, recomp, general — plan completion
  const current = plan?.current_week ?? 1;
  const total = plan?.total_weeks ?? 12;
  const pct = Math.min(100, Math.max(0, (current / total) * 100));
  return {
    progressPct: Math.round(pct),
    progressLabel: 'Plan completion',
    details: `Week ${current} of ${total}`,
  };
}

function buildMilestones(progressPct: number): Milestone[] {
  return MILESTONE_DEFS.map((m) => ({
    pct: m.pct,
    label: m.label,
    reached: progressPct >= m.pct,
  }));
}

function getGoalTitle(goal: GoalRow): string {
  const gt = goal.goal_type;
  if (gt === 'strength') return `Hit ${goal.target_1rm ?? '?'}lbs ${goal.target_lift ?? ''}`;
  if (gt === 'hypertrophy') return `Build Muscle — ${goal.plan_duration_weeks ?? '?'} Week Plan`;
  if (gt === 'fat_loss') return `Lose Weight — Target ${goal.target_weight_lbs ?? '?'}lbs`;
  if (gt === 'recomp') return `Body Recomposition — ${goal.plan_duration_weeks ?? '?'} Weeks`;
  return `General Fitness — ${goal.plan_duration_weeks ?? '?'} Week Plan`;
}

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `Started ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Main Screen ──

export default function GoalTrackerScreen() {
  const navigation = useNavigation<NavProp>();

  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState<GoalRow | null>(null);
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [current1rm, setCurrent1rm] = useState<number | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [logs, setLogs] = useState<any[]>([]);
  const [history, setHistory] = useState<GoalRow[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState('');

  const progressAnim = useRef(new Animated.Value(0)).current;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) { setLoading(false); return; }

      const [goalRes, planRes, historyRes] = await Promise.all([
        supabase
          .from('goals')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from('plans')
          .select('id, current_week, total_weeks, plan_json')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from('goals')
          .select('*')
          .eq('user_id', userId)
          .in('status', ['completed', 'abandoned'])
          .order('created_at', { ascending: false }),
      ]);

      const activeGoal = goalRes.data as GoalRow | null;
      const activePlan = planRes.data as PlanRow | null;

      setGoal(activeGoal);
      setPlan(activePlan);
      setHistory((historyRes.data ?? []) as GoalRow[]);

      // Session count + raw logs for trend analysis
      if (activePlan) {
        const { data: logsData, count } = await supabase
          .from('workout_logs')
          .select('week_number, sets_json', { count: 'exact' })
          .eq('user_id', userId)
          .eq('plan_id', activePlan.id);
        setSessionCount(count ?? 0);
        setLogs(logsData ?? []);
      }

      // Strength goal: estimate current 1RM from recent logs for target lift
      if (activeGoal?.goal_type === 'strength' && activeGoal.target_lift && activePlan) {
        const exerciseMap: Record<string, string> = {};
        for (const week of (activePlan.plan_json?.weeks ?? [])) {
          for (const day of (week.days ?? [])) {
            for (const ex of (day.exercises ?? [])) {
              if (ex.id && ex.name) exerciseMap[ex.id] = ex.name;
            }
          }
        }

        const { data: recentLogs } = await supabase
          .from('workout_logs')
          .select('sets_json')
          .eq('user_id', userId)
          .eq('plan_id', activePlan.id)
          .order('created_at', { ascending: false })
          .limit(10);

        let best1rm = 0;
        const targetLower = activeGoal.target_lift.toLowerCase();
        for (const log of (recentLogs ?? [])) {
          for (const s of (log.sets_json ?? [])) {
            const name = (s.exerciseName ?? s.name ?? exerciseMap[s.exerciseId] ?? '').toLowerCase();
            if (!name.includes(targetLower)) continue;
            const w = Number(s.weightLbs ?? s.weight ?? 0);
            const r = Number(s.reps ?? 0);
            if (w > 0 && r > 0) {
              const est = w * (1 + r / 30);
              if (est > best1rm) best1rm = est;
            }
          }
        }
        setCurrent1rm(best1rm > 0 ? best1rm : null);
      }
    } catch {
      // Silently handle — empty states will show
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Animate progress bar after data loads
  const progress = goal && plan ? calculateProgress(goal, plan, current1rm) : null;
  useEffect(() => {
    if (progress) {
      progressAnim.setValue(0);
      Animated.timing(progressAnim, {
        toValue: progress.progressPct,
        duration: 800,
        useNativeDriver: false,
      }).start();
    }
  }, [progress?.progressPct]);

  const milestones = progress ? buildMilestones(progress.progressPct) : [];

  const handleSaveEdit = async () => {
    if (!goal) return;
    const updates: any = {};
    if (goal.goal_type === 'strength') updates.target_1rm = Number(editTarget) || goal.target_1rm;
    if (goal.goal_type === 'fat_loss') updates.target_weight_lbs = Number(editTarget) || goal.target_weight_lbs;

    if (Object.keys(updates).length > 0) {
      await supabase.from('goals').update(updates).eq('id', goal.id);
    }
    setShowEditModal(false);
    loadData();
  };

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

  const badge = goal ? GOAL_BADGE[goal.goal_type] ?? GOAL_BADGE.general : null;
  const weeksCompleted = plan ? Math.max(0, plan.current_week - 1) : 0;
  const daysRemaining = plan ? (plan.total_weeks - plan.current_week) * 7 : 0;

  // ── Expectations vs Reality metrics ──
  const currentWeek = plan?.current_week ?? 1;
  const daysPerWeek: number = plan?.plan_json?.daysPerWeek ?? 4;

  const weeklyVolumes: Record<number, number> = {};
  for (const log of logs) {
    const wk: number = log.week_number;
    for (const s of (log.sets_json ?? [])) {
      const w = Number(s.weightLbs ?? s.weight ?? 0);
      const r = Number(s.reps ?? s.loggedReps ?? 0);
      weeklyVolumes[wk] = (weeklyVolumes[wk] ?? 0) + w * r;
    }
  }
  const volumeWeeks = Object.keys(weeklyVolumes).map(Number).sort((a, b) => a - b);
  const week1Vol = weeklyVolumes[volumeWeeks[0]] ?? 0;
  const latestWeekVol = weeklyVolumes[volumeWeeks[volumeWeeks.length - 1]] ?? 0;
  const hasVolumeData = volumeWeeks.length >= 2;
  const volumeChangePct = hasVolumeData && week1Vol > 0
    ? ((latestWeekVol - week1Vol) / week1Vol) * 100
    : 0;

  const weeksWithLogs = new Set(logs.map((l) => l.week_number)).size;
  const consistencyRate = currentWeek > 1 ? weeksWithLogs / (currentWeek - 1) : 0;

  const avgSessionsPerWeek = currentWeek > 1
    ? Math.min(logs.length / (currentWeek - 1), daysPerWeek)
    : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Goal</Text>
        </View>

        {/* ── Active Goal Card ── */}
        {!goal ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🎯</Text>
            <Text style={styles.emptyTitle}>No active goal</Text>
            <Text style={styles.emptySubtext}>Complete onboarding to set your goal.</Text>
          </View>
        ) : (
          <View style={styles.goalCard}>
            {/* Top row: badge + edit */}
            <View style={styles.goalTopRow}>
              {badge && (
                <View style={[styles.goalBadge, { backgroundColor: badge.color }]}>
                  <Text style={styles.goalBadgeText}>{badge.label}</Text>
                </View>
              )}
              <TouchableOpacity onPress={() => {
                if (goal.goal_type === 'strength') setEditTarget(String(goal.target_1rm ?? ''));
                else if (goal.goal_type === 'fat_loss') setEditTarget(String(goal.target_weight_lbs ?? ''));
                setShowEditModal(true);
              }}>
                <Text style={styles.editBtn}>Edit →</Text>
              </TouchableOpacity>
            </View>

            {/* Title */}
            <Text style={styles.goalTitle}>{getGoalTitle(goal)}</Text>

            {/* Progress */}
            {progress && (
              <View style={styles.progressSection}>
                <Text style={styles.progressLabel}>{progress.progressLabel}</Text>
                <Text style={styles.progressPct}>{progress.progressPct}%</Text>
                <Text style={styles.progressDetails}>{progress.details}</Text>

                {goal.goal_type === 'fat_loss' && progress.progressPct === 0 && (
                  <Text style={styles.progressHint}>Log your weight to track fat loss progress</Text>
                )}

                {/* Progress bar */}
                <View style={styles.progressTrack}>
                  <Animated.View
                    style={[
                      styles.progressFill,
                      {
                        width: progressAnim.interpolate({
                          inputRange: [0, 100],
                          outputRange: ['0%', '100%'],
                        }),
                      },
                    ]}
                  />
                </View>
              </View>
            )}

            {/* Stats row */}
            <View style={styles.statsDivider} />
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{weeksCompleted}</Text>
                <Text style={styles.statLabel}>Weeks done</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{sessionCount}</Text>
                <Text style={styles.statLabel}>Sessions</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{daysRemaining}</Text>
                <Text style={styles.statLabel}>Days left</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Expectations vs Reality ── */}
        {goal && (
          <View style={styles.evrCard}>
            {/* Header row */}
            <View style={styles.evrHeaderRow}>
              <Text style={styles.evrTitle}>Expectations vs Reality</Text>
              <TouchableOpacity
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => Alert.alert(
                  'About this card',
                  'This card compares what your plan projected at the start vs your actual training data so far.',
                )}
              >
                <Text style={styles.evrInfoIcon}>ⓘ</Text>
              </TouchableOpacity>
            </View>

            {/* Projection */}
            <View style={styles.evrSection}>
              <Text style={styles.evrSectionLabel}>YOUR PLAN PROJECTED</Text>
              {goal.projection_text ? (
                <View style={styles.evrQuote}>
                  <Text style={styles.evrQuoteText}>{goal.projection_text}</Text>
                </View>
              ) : (
                <Text style={styles.evrNoData}>
                  Projection data not available for this goal.
                </Text>
              )}
            </View>

            <View style={styles.evrDivider} />

            {/* Reality */}
            <Text style={styles.evrSectionLabel}>WHAT'S ACTUALLY HAPPENING</Text>

            {/* Row 1 — Volume Trend */}
            <View style={styles.evrMetricRow}>
              <Text style={styles.evrMetricIcon}>
                {!hasVolumeData ? '➡️' : volumeChangePct > 0 ? '📈' : volumeChangePct < 0 ? '📉' : '➡️'}
              </Text>
              <Text style={styles.evrMetricLabel}>Weekly Volume Trend</Text>
              {!hasVolumeData ? (
                <Text style={[styles.evrMetricValue, { color: Colors.textSecondary }]}>Not enough data yet</Text>
              ) : volumeChangePct === 0 ? (
                <Text style={[styles.evrMetricValue, { color: Colors.textSecondary }]}>No change vs Week 1</Text>
              ) : (
                <Text style={[styles.evrMetricValue, { color: volumeChangePct > 0 ? Colors.success : Colors.danger }]}>
                  {volumeChangePct > 0 ? '+' : ''}{Math.round(volumeChangePct)}% vs Week 1
                </Text>
              )}
            </View>

            {/* Row 2 — Consistency */}
            <View style={styles.evrMetricRow}>
              <Text style={styles.evrMetricIcon}>🎯</Text>
              <Text style={styles.evrMetricLabel}>Training Consistency</Text>
              {currentWeek <= 1 ? (
                <Text style={[styles.evrMetricValue, { color: Colors.textSecondary }]}>Just getting started</Text>
              ) : (
                <Text style={[styles.evrMetricValue, {
                  color: consistencyRate >= 0.8 ? Colors.success : consistencyRate >= 0.6 ? Colors.warning : Colors.danger,
                }]}>
                  {Math.round(consistencyRate * 100)}% of weeks trained
                </Text>
              )}
            </View>

            {/* Row 3 — Pace */}
            <View style={styles.evrMetricRow}>
              <Text style={styles.evrMetricIcon}>⚡</Text>
              <Text style={styles.evrMetricLabel}>Sessions per Week</Text>
              <View style={styles.evrPaceValue}>
                <Text style={[styles.evrMetricValue, {
                  color: avgSessionsPerWeek >= daysPerWeek * 0.8
                    ? Colors.success
                    : avgSessionsPerWeek >= daysPerWeek * 0.6
                    ? Colors.warning
                    : Colors.danger,
                }]}>
                  {currentWeek <= 1 ? '—' : `${avgSessionsPerWeek.toFixed(1)} avg`}
                </Text>
                <Text style={styles.evrPaceTarget}> (target: {daysPerWeek})</Text>
              </View>
            </View>

            {currentWeek <= 2 && (
              <Text style={styles.evrBottomNote}>
                Check back after a few more weeks for meaningful trends.
              </Text>
            )}
          </View>
        )}

        {/* ── Milestones ── */}
        {goal && progress && (
          <View style={styles.milestonesCard}>
            <Text style={styles.milestonesTitle}>Milestones</Text>

            {milestones.map((m, i) => (
              <View key={m.pct}>
                {/* Connecting line (above this milestone, except first) */}
                {i > 0 && (
                  <View style={styles.milestoneLineWrap}>
                    <View
                      style={[
                        styles.milestoneLine,
                        { backgroundColor: milestones[i - 1].reached ? Colors.accent : Colors.divider },
                      ]}
                    />
                  </View>
                )}
                <View style={styles.milestoneRow}>
                  {/* Icon circle */}
                  <View
                    style={[
                      styles.milestoneCircle,
                      { backgroundColor: m.reached ? Colors.accent : Colors.divider },
                    ]}
                  >
                    <Text style={styles.milestoneCircleText}>
                      {m.reached ? '✓' : `${m.pct}%`}
                    </Text>
                  </View>
                  {/* Label */}
                  <Text
                    style={[
                      styles.milestoneLabel,
                      { color: m.reached ? Colors.textPrimary : Colors.textSecondary },
                    ]}
                  >
                    {m.label}
                  </Text>
                  {/* Right indicator */}
                  <Text style={styles.milestoneRight}>
                    {m.reached ? '✓' : '🔒'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Goal History ── */}
        <Text style={styles.sectionHeader}>Past Goals</Text>

        {history.length === 0 ? (
          <View style={styles.historyEmpty}>
            <Text style={styles.historyEmptyText}>
              Your completed goals will appear here.
            </Text>
          </View>
        ) : (
          history.map((h) => {
            const hBadge = GOAL_BADGE[h.goal_type] ?? GOAL_BADGE.general;
            const isCompleted = h.status === 'completed';
            return (
              <View key={h.id} style={styles.historyCard}>
                <View style={styles.historyTopRow}>
                  <View style={[styles.historyBadge, { backgroundColor: hBadge.color }]}>
                    <Text style={styles.historyBadgeText}>{hBadge.label}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: isCompleted ? Colors.success : Colors.divider },
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>
                      {isCompleted ? 'Completed ✓' : 'Abandoned'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.historyDesc}>{getGoalTitle(h)}</Text>
                <Text style={styles.historyDate}>{formatMonth(h.created_at)}</Text>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── Edit Goal Modal ── */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Goal Target</Text>
            <Text style={styles.modalSubtitle}>
              Update your target — your plan will adapt accordingly
            </Text>

            {goal?.goal_type === 'strength' && (
              <View style={styles.modalField}>
                <Text style={styles.modalFieldLabel}>Target 1RM (lbs)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editTarget}
                  onChangeText={setEditTarget}
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textSecondary}
                />
                <Text style={styles.modalFieldHint}>
                  Target lift: {goal.target_lift ?? '—'}
                </Text>
              </View>
            )}

            {goal?.goal_type === 'fat_loss' && (
              <View style={styles.modalField}>
                <Text style={styles.modalFieldLabel}>Target weight (lbs)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editTarget}
                  onChangeText={setEditTarget}
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
            )}

            {goal && !['strength', 'fat_loss'].includes(goal.goal_type) && (
              <Text style={styles.modalAutoText}>
                Your plan adapts automatically each week based on your performance.
                No manual target needed.
              </Text>
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowEditModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSave}
                onPress={handleSaveEdit}
                activeOpacity={0.8}
              >
                <Text style={styles.modalSaveText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 20 },
  backChevron: {
    fontFamily: Fonts.regular,
    color: Colors.textPrimary, fontSize: FontSizes.display, lineHeight: 36, paddingRight: 8 },
  headerTitle: { color: Colors.textPrimary, fontSize: FontSizes.heading2, fontFamily: Fonts.bold, },

  /* Empty goal */
  emptyCard: { backgroundColor: Colors.bgCard, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16 },
  emptyEmoji: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.display, },
  emptyTitle: { color: Colors.textPrimary, fontSize: FontSizes.title, fontFamily: Fonts.bold,  marginTop: 12 },
  emptySubtext: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, marginTop: 4 },

  /* Active goal card */
  goalCard: { backgroundColor: Colors.bgCard, borderRadius: 16, padding: 20, marginBottom: 16 },
  goalTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  goalBadgeText: { color: '#FFFFFF', fontSize: FontSizes.label, fontFamily: Fonts.bold, }, // TODO: map to design token
  editBtn: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, },
  goalTitle: { color: Colors.textPrimary, fontSize: FontSizes.heading2, fontFamily: Fonts.bold,  marginTop: 12 },

  /* Progress */
  progressSection: { marginTop: 16 },
  progressLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  progressPct: { color: Colors.textPrimary, fontSize: FontSizes.display, fontFamily: Fonts.bold, },
  progressDetails: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, marginTop: 2 },
  progressHint: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, fontStyle: 'italic', marginTop: 6 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.divider, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: Colors.accent },

  /* Stats */
  statsDivider: { height: 1, backgroundColor: Colors.divider, marginTop: 16, marginBottom: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statValue: { color: Colors.textPrimary, fontSize: FontSizes.title, fontFamily: Fonts.bold, },
  statLabel: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.label, marginTop: 2 },

  /* Expectations vs Reality */
  evrCard: { backgroundColor: Colors.bgCard, borderRadius: 16, padding: 16, marginBottom: 16 },
  evrHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  evrTitle: { color: Colors.textPrimary, fontSize: FontSizes.title, fontFamily: Fonts.bold, },
  evrInfoIcon: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.title, },
  evrSection: { marginTop: 12 },
  evrSectionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  evrQuote: { borderLeftWidth: 3, borderLeftColor: Colors.accent, paddingLeft: 10 },
  evrQuoteText: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, fontStyle: 'italic', lineHeight: 20 },
  evrNoData: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, fontStyle: 'italic' },
  evrDivider: { height: 1, backgroundColor: Colors.divider, marginTop: 16, marginBottom: 16 },
  evrMetricRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  evrMetricIcon: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.title, width: 26 },
  evrMetricLabel: {
    fontFamily: Fonts.regular,
    flex: 1, color: Colors.textPrimary, fontSize: FontSizes.caption, },
  evrMetricValue: { fontSize: FontSizes.caption, fontFamily: Fonts.semiBold,  textAlign: 'right' },
  evrPaceValue: { flexDirection: 'row', alignItems: 'baseline' },
  evrPaceTarget: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, },
  evrBottomNote: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, fontStyle: 'italic', textAlign: 'center', marginTop: 4 },

  /* Milestones */
  milestonesCard: { backgroundColor: Colors.bgCard, borderRadius: 16, padding: 16, marginBottom: 16 },
  milestonesTitle: { color: Colors.textPrimary, fontSize: FontSizes.title, fontFamily: Fonts.bold,  marginBottom: 12 },
  milestoneRow: { flexDirection: 'row', alignItems: 'center' },
  milestoneCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  milestoneCircleText: { color: '#FFFFFF', fontSize: FontSizes.micro, fontFamily: Fonts.bold, }, // TODO: map to design token
  milestoneLabel: {
    fontFamily: Fonts.regular,
    flex: 1, fontSize: FontSizes.caption, marginLeft: 12 },
  milestoneRight: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption, color: Colors.success },
  milestoneLineWrap: { paddingLeft: 13, height: 16 },
  milestoneLine: { width: 3, height: 16, borderRadius: 1.5 },

  /* History */
  sectionHeader: {
    color: Colors.textSecondary,
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 12,
  },
  historyEmpty: { backgroundColor: Colors.bgCard, borderRadius: 12, padding: 20, alignItems: 'center' },
  historyEmptyText: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, textAlign: 'center' },
  historyCard: { backgroundColor: Colors.bgCard, borderRadius: 12, padding: 14, marginBottom: 8 },
  historyTopRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  historyBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  historyBadgeText: { color: '#FFFFFF', fontSize: FontSizes.micro, fontFamily: Fonts.semiBold, }, // TODO: map to design token
  statusBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadgeText: { color: '#FFFFFF', fontSize: FontSizes.micro, fontFamily: Fonts.semiBold, }, // TODO: map to design token
  historyDesc: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, marginTop: 6 },
  historyDate: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.label, marginTop: 4, opacity: 0.7 },

  /* Edit Modal */
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: Colors.bgCard, borderRadius: 16, padding: 24, marginHorizontal: 20, width: '90%' },
  modalTitle: { color: Colors.textPrimary, fontSize: FontSizes.heading2, fontFamily: Fonts.bold, },
  modalSubtitle: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, marginTop: 4, marginBottom: 20 },
  modalField: { marginBottom: 16 },
  modalFieldLabel: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, textTransform: 'uppercase', marginBottom: 8 },
  modalInput: {
    fontFamily: Fonts.regular,
    backgroundColor: Colors.divider, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: Colors.textPrimary, fontSize: FontSizes.title, },
  modalFieldHint: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, marginTop: 6 },
  modalAutoText: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, textAlign: 'center', paddingVertical: 16 },
  modalFooter: { flexDirection: 'row', marginTop: 8, gap: 8 },
  modalCancel: { flex: 1, backgroundColor: Colors.divider, borderRadius: 8, padding: 12, alignItems: 'center' },
  modalCancelText: { color: Colors.textSecondary, fontSize: FontSizes.caption, fontFamily: Fonts.semiBold, },
  modalSave: { flex: 1, backgroundColor: Colors.accent, borderRadius: 8, padding: 12, alignItems: 'center' },
  modalSaveText: { color: '#FFFFFF', fontSize: FontSizes.caption, fontFamily: Fonts.semiBold, }, // TODO: map to design token
});

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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';

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

const formatLiftName = (lift: string) =>
  lift.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function getGoalTitle(goal: GoalRow): string {
  const gt = goal.goal_type;
  if (gt === 'strength') {
    const lift = goal.target_lift ? formatLiftName(goal.target_lift) : '';
    return lift ? `Hit ${goal.target_1rm ?? '?'}lbs ${lift}` : `Hit ${goal.target_1rm ?? '?'}lbs`;
  }
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
  const [modalInputFocused, setModalInputFocused] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

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
      <SafeAreaView style={styles.safe} edges={['top']}>
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
            <View style={styles.goalTopRow}>
              {badge ? (
                <View style={styles.goalBadge}>
                  <Text style={styles.goalBadgeText}>{badge.label}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.editBtnTouch}
                onPress={() => {
                  if (goal.goal_type === 'strength') setEditTarget(String(goal.target_1rm ?? ''));
                  else if (goal.goal_type === 'fat_loss') setEditTarget(String(goal.target_weight_lbs ?? ''));
                  setShowEditModal(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.editBtn}>Edit →</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.goalTitle}>{getGoalTitle(goal)}</Text>

            {progress && (
              <View style={styles.progressSection}>
                <Text style={styles.progressLabel}>{progress.progressLabel}</Text>
                <Text style={styles.progressPct}>{progress.progressPct}%</Text>
                <Text style={styles.progressDetails}>{progress.details}</Text>

                {goal.goal_type === 'fat_loss' && progress.progressPct === 0 && (
                  <Text style={styles.progressHint}>Log your weight to track fat loss progress</Text>
                )}

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
                <Text style={[styles.statValue, daysRemaining > 0 && styles.statValueAccent]}>{daysRemaining}</Text>
                <Text style={styles.statLabel}>Days left</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Expectations vs Reality ── */}
        {goal && (
          <>
            <View style={styles.evrHeadingRow}>
              <Text style={styles.evrHeadingLabel}>EXPECTATIONS VS REALITY</Text>
              <TouchableOpacity
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => setShowTooltip(true)}
              >
                <Text style={styles.evrInfoIcon}>ⓘ</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.evrCard}>
              <Text style={styles.evrSubLabelProjected}>YOUR PLAN PROJECTED</Text>
              {goal.projection_text ? (
                <View style={styles.evrQuote}>
                  <Text style={styles.evrQuoteText}>{goal.projection_text}</Text>
                </View>
              ) : (
                <Text style={styles.evrNoData}>
                  Projection data not available for this goal.
                </Text>
              )}

              <Text style={styles.evrSubLabelReality}>WHAT&apos;S ACTUALLY HAPPENING</Text>

              <View style={styles.evrMetricRow}>
                <Text style={styles.evrMetricIcon}>
                  {!hasVolumeData ? '➡️' : volumeChangePct > 0 ? '📈' : volumeChangePct < 0 ? '📉' : '➡️'}
                </Text>
                <Text style={styles.evrMetricLabel}>Weekly Volume Trend</Text>
                {!hasVolumeData ? (
                  <Text style={styles.evrMetricValue}>Not enough data yet</Text>
                ) : volumeChangePct === 0 ? (
                  <Text style={styles.evrMetricValue}>No change vs Week 1</Text>
                ) : (
                  <Text style={styles.evrMetricValue}>
                    {volumeChangePct > 0 ? '+' : ''}{Math.round(volumeChangePct)}% vs Week 1
                  </Text>
                )}
              </View>

              <View style={styles.evrMetricRow}>
                <Text style={styles.evrMetricIcon}>🎯</Text>
                <Text style={styles.evrMetricLabel}>Training Consistency</Text>
                {currentWeek <= 1 ? (
                  <Text style={styles.evrMetricValue}>Just getting started</Text>
                ) : (
                  <Text style={styles.evrMetricValue}>
                    {Math.round(consistencyRate * 100)}% of weeks trained
                  </Text>
                )}
              </View>

              <View style={[styles.evrMetricRow, styles.evrMetricRowLast]}>
                <Text style={styles.evrMetricIcon}>⚡</Text>
                <Text style={styles.evrMetricLabel}>Sessions per Week</Text>
                <View style={styles.evrPaceValue}>
                  <Text
                    style={[
                      styles.evrMetricValue,
                      currentWeek <= 1 && styles.evrMetricValueWarning,
                    ]}
                  >
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
          </>
        )}

        {/* ── Milestones ── */}
        {goal && progress && (
          <>
            <Text style={styles.milestonesSectionLabel}>MILESTONES</Text>
            <View style={styles.milestonesCard}>
              {milestones.map((m, i) => {
                const isLast = i === milestones.length - 1;
                return (
                  <View
                    key={m.pct}
                    style={[styles.milestoneRow, isLast && styles.milestoneRowLast]}
                  >
                    <View style={styles.milestonePctPill}>
                      <Text
                        style={[
                          styles.milestonePctText,
                          m.reached ? styles.milestonePctTextReached : styles.milestonePctTextLocked,
                        ]}
                      >
                        {m.pct}%
                      </Text>
                    </View>
                    <Text style={styles.milestoneName}>{m.label}</Text>
                    <Text
                      style={[
                        styles.milestoneStatusIcon,
                        m.reached ? styles.milestoneStatusReached : styles.milestoneStatusLocked,
                      ]}
                    >
                      {m.reached ? (m.pct >= 100 ? '🏆' : '✅') : '🔒'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Goal History ── */}
        <Text style={styles.pastGoalsSectionLabel}>PAST GOALS</Text>

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
                  <View style={[styles.historyBadge, historyBadgeStyle(h.goal_type)]}>
                    <Text style={styles.historyBadgeText}>{hBadge.label}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      isCompleted ? styles.statusBadgeCompleted : styles.statusBadgeAbandoned,
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
      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onShow={() => setModalInputFocused(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Goal Target</Text>
            <Text style={styles.modalSubtitle}>
              Update your target — your plan will adapt accordingly
            </Text>

            {goal?.goal_type === 'strength' && (
              <View style={styles.modalField}>
                <Text style={styles.modalFieldLabel}>TARGET 1RM (LBS)</Text>
                <TextInput
                  style={[styles.modalInput, modalInputFocused && styles.modalInputFocused]}
                  value={editTarget}
                  onChangeText={setEditTarget}
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textTertiary}
                  onFocus={() => setModalInputFocused(true)}
                  onBlur={() => setModalInputFocused(false)}
                />
                <Text style={styles.modalFieldHint}>
                  Target lift: {goal.target_lift ? formatLiftName(goal.target_lift) : '—'}
                </Text>
              </View>
            )}

            {goal?.goal_type === 'fat_loss' && (
              <View style={styles.modalField}>
                <Text style={styles.modalFieldLabel}>TARGET WEIGHT (LBS)</Text>
                <TextInput
                  style={[styles.modalInput, modalInputFocused && styles.modalInputFocused]}
                  value={editTarget}
                  onChangeText={setEditTarget}
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textTertiary}
                  onFocus={() => setModalInputFocused(true)}
                  onBlur={() => setModalInputFocused(false)}
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
                onPress={() => {
                  setModalInputFocused(false);
                  setShowEditModal(false);
                }}
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

      <Modal visible={showTooltip} transparent animationType="fade">
        <View style={styles.tooltipBackdrop}>
          <View style={styles.tooltipCard}>
            <Text style={styles.tooltipTitle}>How this works</Text>
            <Text style={styles.tooltipBody}>
              Your Plan Projected is Jordan&apos;s estimate based on your goal and program at the start.
              What&apos;s Actually Happening is calculated from your real workout logs and updates each week as
              you train.
            </Text>
            <TouchableOpacity
              style={styles.tooltipButton}
              onPress={() => setShowTooltip(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.tooltipButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 56,
    paddingBottom: 40,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  backChevron: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    paddingRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },

  emptyCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 24,
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  emptyEmoji: { fontFamily: Fonts.regular, fontSize: FontSizes.display },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    marginTop: 12,
  },
  emptySubtext: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 4,
  },

  goalCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 20,
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  goalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalBadge: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  goalBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.textPrimary,
  },
  editBtnTouch: { marginLeft: 'auto' },
  editBtn: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  goalTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
    marginTop: 12,
  },

  progressSection: { marginTop: 0 },
  progressLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 4,
  },
  progressPct: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.display,
    color: Colors.textPrimary,
  },
  progressDetails: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  progressHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 6,
  },
  progressTrack: {
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.divider,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
  },

  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 20,
  },
  statItem: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },
  statValueAccent: { color: Colors.accent },
  statLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  evrHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 12,
  },
  evrHeadingLabel: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  evrInfoIcon: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textTertiary,
  },
  evrCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 20,
    marginBottom: Spacing.lg,
  },
  evrSubLabelProjected: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  evrQuote: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    paddingLeft: 12,
    marginBottom: 20,
  },
  evrQuoteText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  evrNoData: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  evrSubLabelReality: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  evrMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  evrMetricRowLast: { borderBottomWidth: 0 },
  evrMetricIcon: {
    fontFamily: Fonts.regular,
    fontSize: 18,
    marginRight: 10,
  },
  evrMetricLabel: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  evrMetricValue: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  evrMetricValueWarning: { color: Colors.warning },
  evrPaceValue: { flexDirection: 'row', alignItems: 'baseline', flexShrink: 0 },
  evrPaceTarget: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  evrBottomNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 16,
  },

  milestonesSectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 32,
    marginBottom: 12,
  },
  milestonesCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 20,
    marginBottom: Spacing.lg,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  milestoneRowLast: { borderBottomWidth: 0 },
  milestonePctPill: {
    width: 44,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestonePctText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    textAlign: 'center',
  },
  milestonePctTextReached: { color: Colors.accent },
  milestonePctTextLocked: { color: Colors.textTertiary },
  milestoneName: {
    flex: 1,
    marginLeft: 12,
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  milestoneStatusIcon: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
  },
  milestoneStatusReached: { color: Colors.accent },
  milestoneStatusLocked: { color: Colors.textTertiary },

  pastGoalsSectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 32,
    marginBottom: 12,
  },
  historyEmpty: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 24,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  historyEmptyText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  historyCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 14,
    marginBottom: Spacing.sm,
  },
  historyTopRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  historyBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  historyBadgeStrength: { backgroundColor: Colors.warning },
  historyBadgeHypertrophy: { backgroundColor: '#8B5CF6' },
  historyBadgeRecomp: { backgroundColor: '#06B6D4' },
  historyBadgeFatLoss: { backgroundColor: Colors.success },
  historyBadgeGeneral: { backgroundColor: Colors.accent },
  historyBadgeText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.micro,
    fontFamily: Fonts.semiBold,
  },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadgeCompleted: { backgroundColor: Colors.success },
  statusBadgeAbandoned: { backgroundColor: Colors.divider },
  statusBadgeText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.micro,
    fontFamily: Fonts.semiBold,
  },
  historyDesc: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.caption,
    marginTop: 6,
  },
  historyDate: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.label,
    marginTop: 4,
    opacity: 0.7,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.xl,
    padding: 24,
    marginHorizontal: 32,
    alignSelf: 'stretch',
  },
  modalTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 4,
    marginBottom: 20,
  },
  modalField: { marginBottom: 16 },
  modalFieldLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  modalInput: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.bgPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 14,
  },
  modalInputFocused: { borderColor: Colors.accent },
  modalFieldHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  modalAutoText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  modalCancel: {
    flex: 1,
    height: 48,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  modalSave: {
    flex: 1,
    height: 48,
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },

  tooltipBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    padding: 32,
  },
  tooltipCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.xl,
    padding: 24,
  },
  tooltipTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  tooltipBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  tooltipButton: {
    marginTop: 20,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltipButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
});

function historyBadgeStyle(goalType: string) {
  switch (goalType) {
    case 'strength':
      return styles.historyBadgeStrength;
    case 'hypertrophy':
      return styles.historyBadgeHypertrophy;
    case 'recomp':
      return styles.historyBadgeRecomp;
    case 'fat_loss':
      return styles.historyBadgeFatLoss;
    default:
      return styles.historyBadgeGeneral;
  }
}

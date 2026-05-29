import { useCallback, useEffect, useMemo, useState } from 'react';
import { stripEmDash } from '../utils/jordanText';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import WorkoutResultsModal, { type ExerciseObject } from '../components/WorkoutResultsModal';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'WorkoutHistory'>;

type SetJsonRow = {
  weightLbs?: number;
  weight?: number;
  reps?: number;
  exerciseName?: string;
  name?: string;
  exerciseId?: string;
};

type PlanJoinRow = {
  title: string | null;
  plan_json: unknown;
} | null;

type WorkoutLogRow = {
  id: string;
  plan_id: string;
  week_number: number;
  day_number: number;
  logged_at: string;
  session_fatigue_rating: number | null;
  sets_json: SetJsonRow[] | null;
  skipped: boolean | null;
  plans: PlanJoinRow | PlanJoinRow[];
};

type FreeSessionRow = {
  id: string;
  session_name: string | null;
  sets_json: SetJsonRow[] | null;
  session_fatigue_rating: number | null;
  logged_at: string;
};

/** Unified row for SectionList — plan workouts + free sessions */
type HistorySessionRow = {
  id: string;
  logged_at: string;
  isFreeSession: boolean;
  title: string;
  sessionFocus: string | null;
  planTitle: string;
  weekNumber: number | null;
  muscleGroups: string[];
  totalSets: number;
  totalVolumeLbs: number;
  topLift: { name: string; weightLbs: number } | null;
  sessionFatigueRating: number | null;
  planId: string | null;
  /** Raw sets as stored (for WorkoutResultsModal) */
  rawSetsJson: SetJsonRow[] | null;
  /** From workout_logs.session_fatigue_rating; null for free sessions */
  rawFatigueRating: number | null;
  /** Plan day exercises for target reps / checkmarks; empty for free sessions */
  planExercises: ExerciseObject[];
  /** For Jordan session debrief in results modal — plan workouts only */
  summaryPlanGoal: string | null;
  summaryPlanPhase: string | null;
  /**
   * Plan workouts only — full `workout_logs` row from Supabase (authoritative for
   * `session_fatigue_rating` + `sets_json`). Null for free sessions.
   */
  workoutLogSource: WorkoutLogRow | null;
}

function extractWeekPhaseFromPlan(planJson: unknown, weekNumber: number): string | null {
  const pj = planJson as {
    weeks?: Array<{ weekNumber?: number; week_number?: number; phase?: string }>;
  } | null;
  if (!pj?.weeks?.length) return null;
  const wn = Number(weekNumber);
  const week =
    pj.weeks.find((w) => (w.weekNumber ?? w.week_number) === wn) ?? pj.weeks[wn - 1];
  const ph = week?.phase;
  return typeof ph === 'string' ? ph : null;
}

function extractPlanExercises(
  planJson: unknown,
  weekNumber: number,
  dayNumber: number,
): ExerciseObject[] {
  const pj = planJson as {
    weeks?: Array<{
      weekNumber?: number;
      week_number?: number;
      days?: Array<{
        dayNumber?: number;
        day_number?: number;
        exercises?: unknown[];
      }>;
    }>;
  } | null;
  if (!pj?.weeks?.length) return [];
  const wn = Number(weekNumber);
  const week =
    pj.weeks.find((w) => (w.weekNumber ?? w.week_number) === wn) ?? pj.weeks[wn - 1];
  if (!week?.days?.length) return [];
  const dn = Number(dayNumber);
  const day =
    week.days.find((d) => Number(d.dayNumber ?? d.day_number) === dn) ??
    week.days[dn - 1];
  if (!day) return [];
  return (day.exercises ?? []).map((ex: any) => ({
    id: ex.id,
    name: ex.name,
    sets: ex.sets,
    reps: ex.reps,
    targetRpe: ex.targetRpe,
    phase: ex.phase,
  }));
}

function normalizePlanJoin(plans: WorkoutLogRow['plans']): PlanJoinRow {
  if (plans == null) return null;
  return Array.isArray(plans) ? plans[0] ?? null : plans;
}

function readSessionFromPlan(
  planJson: unknown,
  weekNumber: number,
  dayNumber: number,
): { title: string; sessionFocus?: string; muscleGroups: string[] } {
  const pj = planJson as {
    title?: string;
    weeks?: Array<{
      weekNumber?: number;
      week_number?: number;
      days?: Array<{
        dayNumber?: number;
        title?: string;
        sessionFocus?: string;
        muscleGroups?: string[];
      }>;
    }>;
  } | null;

  const weeks = pj?.weeks ?? [];
  const wn = Number(weekNumber);
  const week =
    weeks.find((w) => (w.weekNumber ?? w.week_number) === wn) ?? weeks[wn - 1];
  const days = week?.days ?? [];
  const dn = Number(dayNumber);
  const day =
    days.find((d) => Number(d.dayNumber) === dn) ?? days[dn - 1];
  const rawTitle = day?.title?.trim();
  const title =
    rawTitle && rawTitle.length > 0 ? rawTitle : 'Session';
  return {
    title,
    sessionFocus: typeof day?.sessionFocus === 'string' ? day.sessionFocus : undefined,
    muscleGroups: Array.isArray(day?.muscleGroups) ? day.muscleGroups : [],
  };
}

function planDisplayTitle(planRow: PlanJoinRow, planJson: unknown): string {
  if (planRow?.title && planRow.title.trim().length > 0) return planRow.title.trim();
  const t = (planJson as { title?: string } | null)?.title;
  return typeof t === 'string' && t.trim().length > 0 ? t.trim() : 'Plan';
}

function computeTotals(sets: SetJsonRow[] | null | undefined): {
  totalSets: number;
  totalVolumeLbs: number;
  topLift: { name: string; weightLbs: number } | null;
} {
  const list = Array.isArray(sets) ? sets : [];
  let totalVolumeLbs = 0;
  let best: { name: string; weightLbs: number } | null = null;

  for (const s of list) {
    const w = Number(s.weightLbs ?? s.weight ?? 0);
    const r = Number(s.reps ?? 0);
    if (w > 0 && r > 0) {
      totalVolumeLbs += w * r;
    }
    if (w > 0) {
      const name = (s.exerciseName ?? s.name ?? 'Exercise').trim() || 'Exercise';
      if (!best || w > best.weightLbs) {
        best = { name, weightLbs: w };
      }
    }
  }

  return {
    totalSets: list.length,
    totalVolumeLbs,
    topLift: best,
  };
}

function normalizeWorkoutLogEntry(log: WorkoutLogRow): HistorySessionRow {
  const planRow = normalizePlanJoin(log.plans);
  const pj = planRow?.plan_json;
  const meta = readSessionFromPlan(pj, log.week_number, log.day_number);
  const sessionTitle = meta.title || 'Workout';
  const { totalSets, totalVolumeLbs, topLift } = computeTotals(log.sets_json);
  const planName = planDisplayTitle(planRow, pj);
  const summaryPlanGoal =
    pj && typeof (pj as { goal?: string }).goal === 'string'
      ? (pj as { goal: string }).goal
      : null;
  const summaryPlanPhase = extractWeekPhaseFromPlan(pj, log.week_number);
  /** Direct from `workout_logs.session_fatigue_rating` — no transform */
  const fatigueFromRow = log.session_fatigue_rating;
  return {
    id: log.id,
    logged_at: log.logged_at,
    isFreeSession: false,
    title: sessionTitle,
    sessionFocus: meta.sessionFocus ?? null,
    planTitle: planName,
    weekNumber: log.week_number,
    muscleGroups: meta.muscleGroups ?? [],
    totalSets,
    totalVolumeLbs,
    topLift,
    sessionFatigueRating: fatigueFromRow,
    planId: log.plan_id,
    rawSetsJson: log.sets_json,
    rawFatigueRating: fatigueFromRow,
    planExercises: extractPlanExercises(pj, log.week_number, log.day_number),
    summaryPlanGoal,
    summaryPlanPhase,
    workoutLogSource: log,
  };
}

const FATIGUE_LABEL: Record<number, string> = {
  1: 'Wiped',
  2: 'Tired',
  3: 'Good',
  4: 'Strong',
  5: 'Beast',
};

function fatigueLabel(rating: number | null | undefined): string {
  if (rating == null || Number.isNaN(rating)) return '—';
  const k = Math.round(Number(rating));
  return FATIGUE_LABEL[k] ?? '—';
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type Section = {
  title: string;
  data: HistorySessionRow[];
};

export default function WorkoutHistoryScreen() {
  const navigation = useNavigation<NavProp>();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<HistorySessionRow[]>([]);
  const [selectedSession, setSelectedSession] = useState<HistorySessionRow | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        setSessions([]);
        return;
      }

      // One card per DB row — no merge/dedup. Same plan/week/day can appear multiple times (e.g. dev); newest first.
      const { data, error } = await supabase
        .from('workout_logs')
        .select(`
          id,
          plan_id,
          week_number,
          day_number,
          logged_at,
          session_fatigue_rating,
          sets_json,
          skipped,
          plans ( title, plan_json )
        `)
        .eq('user_id', userId)
        .eq('skipped', false)
        .order('logged_at', { ascending: false });

      if (error) {
        console.warn('[WorkoutHistory] workout_logs', error.message);
      }

      const { data: freeSessionLogs, error: freeErr } = await supabase
        .from('free_sessions')
        .select('id, session_name, sets_json, session_fatigue_rating, logged_at')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false });

      if (freeErr) {
        console.warn('[WorkoutHistory] free_sessions', freeErr.message);
      }

      const workoutData = (error ? [] : (data ?? [])) as WorkoutLogRow[];
      const workoutNormalised = workoutData.map(normalizeWorkoutLogEntry);

      const freeSessionNormalised = ((freeErr ? [] : freeSessionLogs) ?? []).map(
        (fs: FreeSessionRow) => {
          const sets = (fs.sets_json ?? []) as SetJsonRow[];
          const { totalSets, totalVolumeLbs, topLift } = computeTotals(sets);
          return {
            id: fs.id,
            logged_at: fs.logged_at,
            title: fs.session_name ?? 'Extra Work',
            sessionFocus: null,
            planTitle: 'Extra Work',
            weekNumber: null,
            muscleGroups: [] as string[],
            totalSets,
            totalVolumeLbs,
            topLift,
            sessionFatigueRating: fs.session_fatigue_rating,
            isFreeSession: true,
            summaryPlanGoal: null,
            summaryPlanPhase: null,
            planId: null,
            rawSetsJson: fs.sets_json,
            rawFatigueRating: null,
            planExercises: [],
            workoutLogSource: null,
          } satisfies HistorySessionRow;
        },
      );

      const allSessions = [...workoutNormalised, ...freeSessionNormalised].sort(
        (a, b) =>
          new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime(),
      );

      setSessions(allSessions);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const summary = useMemo(() => {
    const totalSessions = sessions.length;
    const totalVolumeLbs = sessions.reduce((sum, s) => sum + s.totalVolumeLbs, 0);
    const workoutPlanIds = new Set(
      sessions
        .filter((s) => !s.isFreeSession && s.planId)
        .map((s) => s.planId as string),
    );
    const planCount =
      workoutPlanIds.size + (sessions.some((s) => s.isFreeSession) ? 1 : 0);
    return {
      totalSessions,
      totalVolumeLbs,
      planCount,
    };
  }, [sessions]);

  const sections: Section[] = useMemo(() => {
    const byMonth = new Map<string, HistorySessionRow[]>();
    for (const row of sessions) {
      const d = new Date(row.logged_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(row);
    }
    const sortedKeys = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));
    return sortedKeys.map((key) => {
      const [y, m] = key.split('-').map(Number);
      const label = new Date(y, m - 1, 1)
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        .toUpperCase();
      return {
        title: label,
        data: byMonth.get(key)!,
      };
    });
  }, [sessions]);

  const ListHeader = useMemo(
    () => (
      <View style={styles.summaryRow}>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryPillLabel}>Total Sessions</Text>
          <Text style={styles.summaryPillValue}>{summary.totalSessions}</Text>
        </View>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryPillLabel}>Total Volume</Text>
          <Text style={styles.summaryPillValue}>
            {summary.totalVolumeLbs.toLocaleString('en-US')} lbs
          </Text>
        </View>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryPillLabel}>Plans</Text>
          <Text style={styles.summaryPillValue}>{summary.planCount}</Text>
        </View>
      </View>
    ),
    [summary.planCount, summary.totalSessions, summary.totalVolumeLbs],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Workout History</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Workout History</Text>
      </View>

      {sessions.length === 0 ? (
        <View style={styles.emptyWrap}>
          {ListHeader}
          <View style={styles.jordanCard}>
            <Text style={styles.jordanLabel}>JORDAN</Text>
            <Text style={styles.jordanBody}>
              No sessions completed yet. Complete your first workout and it&apos;ll show up
              here.
            </Text>
          </View>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text style={styles.monthHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const sessionTitle = item.title;
            const { totalSets, totalVolumeLbs, topLift } = item;
            const planName = item.planTitle;
            const groups = item.muscleGroups ?? [];
            const shown = groups.slice(0, 3);
            const overflow = groups.length - shown.length;

            return (
              <TouchableOpacity
                style={styles.sessionCard}
                onPress={() => {
                  if (__DEV__) {
                    console.log('[history modal debug]', {
                      logId: item.id,
                      isFreeSession: item.isFreeSession,
                      rawFatigueRating: item.rawFatigueRating,
                      logged_at: item.logged_at,
                    });
                  }
                  setSelectedSession(item);
                }}
                activeOpacity={0.75}
              >
                <View style={styles.row1}>
                  <Text style={styles.sessionTitle} numberOfLines={2}>
                    {sessionTitle}
                  </Text>
                  <View style={styles.datePill}>
                    <Text style={styles.datePillText}>{formatShortDate(item.logged_at)}</Text>
                  </View>
                </View>
                {item.sessionFocus ? (
                  <Text style={styles.sessionFocus} numberOfLines={2}>
                    {stripEmDash(item.sessionFocus ?? '')}
                  </Text>
                ) : null}
                <View style={styles.row2}>
                  <Text style={styles.planName} numberOfLines={1}>
                    {planName}
                  </Text>
                  {item.isFreeSession ? (
                    <View style={styles.extraBadge}>
                      <Text style={styles.extraBadgeText}>EXTRA</Text>
                    </View>
                  ) : (
                    <View style={styles.weekBadge}>
                      <Text style={styles.weekBadgeText}>
                        Week {item.weekNumber}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.chipRow}>
                  {shown.map((mg) => (
                    <View key={mg} style={styles.muscleChip}>
                      <Text style={styles.muscleChipText}>{mg}</Text>
                    </View>
                  ))}
                  {overflow > 0 ? (
                    <Text style={styles.moreChips}>+{overflow} more</Text>
                  ) : null}
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>SETS</Text>
                    <Text style={styles.statValue}>{totalSets}</Text>
                  </View>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>VOLUME</Text>
                    <Text style={styles.statValue}>
                      {totalVolumeLbs.toLocaleString('en-US')} lbs
                    </Text>
                  </View>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>RPE</Text>
                    <Text style={styles.statValue}>
                      {fatigueLabel(item.sessionFatigueRating)}
                    </Text>
                  </View>
                </View>
                {topLift ? (
                  <View style={styles.topLiftRow}>
                    <Text style={styles.topLiftText}>
                      <Text style={styles.topLiftArrow}>↑ </Text>
                      <Text style={styles.topLiftName}>{topLift.name}</Text>
                      <Text style={styles.topLiftRest}> — {Math.round(topLift.weightLbs)} lbs</Text>
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      )}
      {selectedSession ? (
        <WorkoutResultsModal
          visible={!!selectedSession}
          onClose={() => setSelectedSession(null)}
          dayTitle={selectedSession.title ?? 'Session'}
          completedDate={new Date(selectedSession.logged_at).toLocaleDateString(
            'en-US',
            { month: 'long', day: 'numeric', year: 'numeric' },
          )}
          workoutLog={{
            sets_json: selectedSession.isFreeSession
              ? selectedSession.rawSetsJson
              : selectedSession.workoutLogSource?.sets_json ?? null,
            session_fatigue_rating: selectedSession.isFreeSession
              ? selectedSession.sessionFatigueRating
              : selectedSession.workoutLogSource?.session_fatigue_rating ?? null,
          }}
          exerciseMap={{}}
          planExercises={
            selectedSession.isFreeSession ? [] : (selectedSession.planExercises ?? [])
          }
          summaryPlanGoal={
            selectedSession.isFreeSession ? null : selectedSession.summaryPlanGoal
          }
          summaryWeek={
            selectedSession.isFreeSession ? null : selectedSession.weekNumber
          }
          summaryPlanPhase={
            selectedSession.isFreeSession ? null : selectedSession.summaryPlanPhase
          }
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 8,
    paddingBottom: Spacing.sm,
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
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 40,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  summaryPill: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
  },
  summaryPillLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  summaryPillValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  monthHeader: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  sessionCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 16,
    marginBottom: 8,
  },
  row1: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  sessionTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  datePill: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  datePillText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  sessionFocus: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  row2: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  planName: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },
  weekBadge: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  weekBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  extraBadge: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  extraBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
  },
  muscleChip: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  muscleChipText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
  },
  moreChips: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: 12,
    marginTop: 12,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
  },
  topLiftRow: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.accent,
    paddingLeft: 8,
    marginTop: 8,
  },
  topLiftText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  topLiftArrow: {
    color: Colors.textSecondary,
  },
  topLiftName: {
    fontFamily: Fonts.medium,
    color: Colors.textPrimary,
  },
  topLiftRest: {
    color: Colors.textSecondary,
  },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  jordanCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    marginTop: Spacing.md,
  },
  jordanLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  jordanBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
});

import { useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { isExerciseUnilateral } from '../constants/exerciseLibrary';

export interface SetLog {
  exerciseId: string;
  setNumber: number;
  weightLbs: number | null;
  reps: number | null;
  rpe: number | null;
  swapped?: boolean;
  exerciseName?: string;
}

export interface WorkoutLog {
  sets_json: SetLog[] | null;
  session_fatigue_rating: number | null;
}

export interface ExerciseObject {
  id?: string;
  name: string;
  sets?: number;
  reps?: string;
  targetRpe?: number;
  phase?: 'strength' | 'hypertrophy';
}

interface WorkoutResultsModalProps {
  visible: boolean;
  onClose: () => void;
  dayTitle: string;
  completedDate: string;
  workoutLog: WorkoutLog | null;
  exerciseMap: Record<string, string>;
  planExercises: ExerciseObject[];
}

function calculateAvgRpe(sets: SetLog[]): number | null {
  const rpeValues = sets.filter((s) => s.rpe && s.rpe > 0).map((s) => s.rpe!);
  if (rpeValues.length === 0) return null;
  return Math.round((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10) / 10;
}

// Unilateral exercises: reps are per-side, multiply ×2 for bilateral-equivalent volume
function calculateTotalVolume(sets: SetLog[]): number {
  return sets.reduce((total, s) => {
    const repMultiplier = isExerciseUnilateral(s.exerciseName ?? '') ? 2 : 1;
    return total + (s.weightLbs ?? 0) * (s.reps ?? 0) * repMultiplier;
  }, 0);
}

function formatVolume(lbs: number): string {
  return lbs >= 1000
    ? `${(lbs / 1000).toFixed(1)}k lbs`
    : `${lbs} lbs`;
}

function getFatigueEmoji(rating: number | null | undefined): string {
  if (!rating) return '—';
  const r = Math.min(5, Math.max(1, Math.round(Number(rating))));
  const map: Record<number, string> = {
    1: '😴', // Wiped
    2: '😤', // Tired
    3: '😊', // Good
    4: '💪', // Strong
    5: '🔥', // Beast Mode
  };
  return map[r] ?? '—';
}

function getFatigueLabel(rating: number | null | undefined): string {
  if (!rating) return '—';
  const r = Math.min(5, Math.max(1, Math.round(Number(rating))));
  const map: Record<number, string> = {
    1: 'Wiped',
    2: 'Tired',
    3: 'Good',
    4: 'Strong',
    5: 'Beast Mode',
  };
  return map[r] ?? '—';
}

function groupSetsByExercise(sets: SetLog[]): Record<string, SetLog[]> {
  return sets.reduce((acc, set) => {
    if (!acc[set.exerciseId]) acc[set.exerciseId] = [];
    acc[set.exerciseId].push(set);
    return acc;
  }, {} as Record<string, SetLog[]>);
}

function parseSetsJson(rawSets: WorkoutLog['sets_json'] | string | null | undefined): SetLog[] {
  if (typeof rawSets === 'string') {
    try {
      const parsed = JSON.parse(rawSets) as unknown;
      return Array.isArray(parsed) ? (parsed as SetLog[]) : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(rawSets) ? rawSets : [];
}

function buildExerciseMap(
  planExercises: ExerciseObject[],
  setsJson: SetLog[],
): Record<string, SetLog[]> {
  const byId: Record<string, SetLog[]> = {};
  setsJson.forEach((set) => {
    const key = set.exerciseId ?? '';
    if (!key) return;
    if (!byId[key]) byId[key] = [];
    byId[key].push(set);
  });

  const hasMatches = planExercises.some((ex) => !!ex.id && (byId[ex.id]?.length ?? 0) > 0);
  if (hasMatches || planExercises.length === 0) return byId;

  console.warn('[sets_json] No id matches — attempting name fallback');
  const nameMap: Record<string, string> = {};
  planExercises.forEach((ex) => {
    if (ex.id && ex.name) nameMap[ex.name.toLowerCase()] = ex.id;
  });

  const byName: Record<string, SetLog[]> = {};
  setsJson.forEach((set) => {
    const exerciseName = (set.exerciseName ?? '').toLowerCase();
    const resolvedId = nameMap[exerciseName] ?? set.exerciseId ?? exerciseName;
    if (!resolvedId) return;
    if (!byName[resolvedId]) byName[resolvedId] = [];
    byName[resolvedId].push(set);
  });

  return byName;
}

function parseTargetReps(repsString: string): { min: number; max: number } {
  const parts = repsString.split('-').map(Number);
  return parts.length === 2
    ? { min: parts[0], max: parts[1] }
    : { min: parts[0], max: parts[0] };
}

function getRepStatus(logged: number, targetReps: string): '↑' | '✓' | '↓' {
  const { min, max } = parseTargetReps(targetReps);
  if (logged > max) return '↑';
  if (logged < min) return '↓';
  return '✓';
}

function getRpeDisplayColor(rpe: number | null): { bg: string; text: string } {
  if (!rpe || rpe <= 0) {
    return { bg: Colors.bgElevated, text: Colors.textTertiary };
  }
  if (rpe <= 4) return { bg: Colors.successMuted, text: Colors.success };
  if (rpe <= 7) return { bg: Colors.warningMuted, text: Colors.warning };
  return { bg: Colors.dangerMuted, text: Colors.danger };
}

function getAvgRpeColor(avgRpe: number | null): string {
  if (avgRpe === null) return Colors.textPrimary;
  if (avgRpe < 6) return Colors.success;
  if (avgRpe <= 8) return Colors.warning;
  return Colors.danger;
}

function sanitizeRepString(value: string): string {
  return value.replace('–', '-').trim();
}

function formatSetDisplay(set: SetLog, exercise: ExerciseObject | undefined): string {
  const exerciseName = (exercise?.name ?? set.exerciseName ?? '').toLowerCase();
  const knownTimed =
    exerciseName.includes('plank') ||
    exerciseName.includes('hold') ||
    exerciseName.includes('carry');
  if (set.weightLbs === 0 && (knownTimed || (set.reps ?? 0) > 20)) {
    return `${set.reps ?? 0} sec`;
  }
  if (set.weightLbs === 0) {
    return `Bodyweight × ${set.reps ?? 0}`;
  }
  return `${set.weightLbs ?? 0} lbs × ${set.reps ?? 0}`;
}

export default function WorkoutResultsModal({
  visible,
  onClose,
  dayTitle,
  completedDate,
  workoutLog,
  exerciseMap,
  planExercises,
}: WorkoutResultsModalProps) {
  const sets = useMemo(
    () => parseSetsJson((workoutLog?.sets_json as WorkoutLog['sets_json'] | string | null | undefined) ?? []),
    [workoutLog],
  );
  const groupedSets = useMemo(() => buildExerciseMap(planExercises, sets), [planExercises, sets]);
  const avgRpe = useMemo(() => calculateAvgRpe(sets), [sets]);
  const totalVolume = useMemo(() => calculateTotalVolume(sets), [sets]);
  const fatigueEmoji = getFatigueEmoji(workoutLog?.session_fatigue_rating ?? null);
  const fatigueDescriptor = getFatigueLabel(workoutLog?.session_fatigue_rating ?? null);

  const planExerciseMap = useMemo(() => {
    const map: Record<string, ExerciseObject> = {};
    planExercises.forEach((exercise) => {
      if (exercise.id) map[exercise.id] = exercise;
    });
    return map;
  }, [planExercises]);

  const exerciseIds = useMemo(() => Object.keys(groupedSets), [groupedSets]);
  const hasData = exerciseIds.length > 0;
  const showNoDataYet = !workoutLog || sets.length === 0;

  // GAP-5: Determine if this is a two-phase session
  const hasPhasedExercises = planExercises.some((ex) => ex.phase === 'strength' || ex.phase === 'hypertrophy');

  const phaseForExercise = useMemo(() => {
    const map: Record<string, 'strength' | 'hypertrophy' | undefined> = {};
    planExercises.forEach((ex) => {
      if (ex.id) map[ex.id] = ex.phase;
    });
    return map;
  }, [planExercises]);

  if (__DEV__) {
    console.log('[WorkoutResultsModal]', {
      totalSets: sets.length,
      planExerciseCount: planExercises.length,
      uniqueExerciseIds: [...new Set(sets.map((s) => s.exerciseId))],
      planExerciseIds: planExercises.map((e) => e.id),
      firstSet: sets[0] ?? null,
    });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {dayTitle}
          </Text>
          <Text style={styles.headerDate}>{completedDate}</Text>
        </View>

        <View style={styles.summaryStrip}>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: getAvgRpeColor(avgRpe) }]}>
              {avgRpe === null ? '—' : avgRpe.toFixed(1)}
            </Text>
            <Text style={styles.summaryLabel}>AVG RPE</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{formatVolume(totalVolume)}</Text>
            <Text style={styles.summaryLabel}>VOLUME</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{fatigueEmoji}</Text>
            <Text style={styles.fatigueDescriptor}>{fatigueDescriptor}</Text>
            <Text style={styles.summaryLabel}>ENERGY</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            showNoDataYet && styles.scrollContentCentered,
          ]}
        >
          {showNoDataYet ? (
            <View style={styles.emptyStateWrap}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No data yet</Text>
              <Text style={styles.emptySubtitle}>
                Complete this workout to see your results here.
              </Text>
            </View>
          ) : hasData ? (() => {
            let lastPhase: string | undefined;
            return exerciseIds.map((exerciseId) => {
            const exerciseSets = [...groupedSets[exerciseId]].sort(
              (a, b) => a.setNumber - b.setNumber,
            );
            const planExercise =
              planExerciseMap[exerciseId] ??
              planExercises.find(
                (ex) =>
                  ex.name.toLowerCase() ===
                  ((exerciseSets[0]?.exerciseName ?? '').toLowerCase()),
              );
            const exerciseName =
              exerciseMap[exerciseId] ??
              planExercise?.name ??
              exerciseSets[0]?.exerciseName ??
              'Exercise';
            const targetLabel =
              planExercise && planExercise.sets && planExercise.reps
                ? `Target: ${planExercise.sets}×${planExercise.reps}${planExercise.targetRpe ? ` @ RPE ${planExercise.targetRpe}` : ''}`
                : null;

            const bestSet = exerciseSets.reduce((best, current) => {
              const bestWeight = best.weightLbs ?? 0;
              const currentWeight = current.weightLbs ?? 0;
              return currentWeight > bestWeight ? current : best;
            }, exerciseSets[0]);
            const hasSwap = exerciseSets.some((s) => s.swapped);
            const exTopWeight = exerciseSets.reduce(
              (max, s) => Math.max(max, s.weightLbs ?? 0), 0,
            );
            const exVolume = calculateTotalVolume(exerciseSets);
            const exAvgRpe = calculateAvgRpe(exerciseSets);

            const currentPhase = phaseForExercise[exerciseId];
            const showPhaseHeader = hasPhasedExercises && currentPhase && currentPhase !== lastPhase;
            if (currentPhase) lastPhase = currentPhase;

            return (
              <View key={exerciseId}>
                {showPhaseHeader && currentPhase === 'strength' ? (
                  <View style={styles.phaseHeader}>
                    <Text style={styles.phaseHeaderText}>PHASE 1 — STRENGTH</Text>
                    <Text style={styles.phaseHeaderSub}>Heavy compounds · top set weight</Text>
                  </View>
                ) : null}
                {showPhaseHeader && currentPhase === 'hypertrophy' ? (
                  <View style={styles.phaseHeader}>
                    <Text style={styles.phaseHeaderText}>PHASE 2 — HYPERTROPHY</Text>
                    <Text style={styles.phaseHeaderSub}>Accessories · total volume</Text>
                  </View>
                ) : null}

                <View style={styles.exerciseCard}>
                <View style={styles.exerciseHeader}>
                  <Text style={styles.exerciseName}>{exerciseName}</Text>
                  {targetLabel ? <Text style={styles.targetText}>{targetLabel}</Text> : null}
                  {hasPhasedExercises && currentPhase === 'strength' ? (
                    <Text style={styles.phaseMetricText}>Top: {exTopWeight} lbs · RPE {exAvgRpe?.toFixed(1) ?? '—'}</Text>
                  ) : null}
                  {hasPhasedExercises && currentPhase === 'hypertrophy' ? (
                    <Text style={styles.phaseMetricText}>Vol: {formatVolume(exVolume)} · RPE {exAvgRpe?.toFixed(1) ?? '—'}</Text>
                  ) : null}
                </View>

                <View style={styles.setRowsContainer}>
                  {exerciseSets.map((set, index) => {
                    const targetReps = planExercise?.reps
                      ? sanitizeRepString(planExercise.reps)
                      : null;
                    const repStatus =
                      targetReps && set.reps != null
                        ? getRepStatus(set.reps, targetReps)
                        : null;
                    const rpeColors = getRpeDisplayColor(set.rpe);
                    const showRpeBadge = !!set.rpe && set.rpe > 0;
                    const isLast = index === exerciseSets.length - 1;

                    return (
                      <View key={`${exerciseId}-${set.setNumber}-${index}`} style={[styles.setRow, !isLast && styles.setRowDivider]}>
                        <View style={styles.setBadge}>
                          <Text style={styles.setBadgeText}>S{set.setNumber}</Text>
                        </View>

                        <View style={styles.weightRepsWrap}>
                          <Text style={styles.weightRepsText}>
                            {formatSetDisplay(set, planExercise)}
                          </Text>
                        </View>

                        {showRpeBadge ? (
                          <View style={[styles.rpeBadge, { backgroundColor: rpeColors.bg }]}>
                            <Text style={[styles.rpeText, { color: rpeColors.text }]}>
                              RPE {set.rpe}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.noRpeText}>—</Text>
                        )}

                        {repStatus ? (
                          <Text
                            style={[
                              styles.repStatusText,
                              repStatus === '↓' ? styles.repStatusDown : styles.repStatusGood,
                            ]}
                          >
                            {repStatus}
                          </Text>
                        ) : (
                          <View style={styles.repStatusSpacer} />
                        )}
                      </View>
                    );
                  })}
                </View>

                <View style={[styles.exerciseFooter, hasSwap && styles.exerciseFooterSwapped]}>
                  {hasSwap ? (
                    <Text style={styles.swapText}>⟳ Exercise was swapped</Text>
                  ) : null}
                  <Text style={styles.bestSetText}>
                    Best set:{' '}
                    {formatSetDisplay(bestSet, planExercise)}
                  </Text>
                </View>
                </View>
              </View>
            );
          });
          })() : (
            <View style={styles.rawFallbackWrap}>
              <Text style={styles.rawFallbackLabel}>Raw session data</Text>
              {sets.map((set, idx) => (
                <Text key={`${set.setNumber}-${idx}`} style={styles.rawFallbackRow}>
                  Set {set.setNumber}: {set.weightLbs ?? 0} lbs × {set.reps ?? 0} reps RPE {set.rpe ?? '—'}
                </Text>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  phaseHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  phaseHeaderText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
  },
  phaseHeaderSub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  phaseMetricText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  closeButton: {
    width: 40,
    alignItems: 'flex-start',
  },
  closeText: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  headerDate: {
    width: 96,
    textAlign: 'right',
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
  },
  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  fatigueDescriptor: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.label,
    fontFamily: Fonts.semiBold,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  summaryLabel: {
    marginTop: 4,
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxxl,
  },
  scrollContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyStateWrap: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  emptyIcon: {
    fontSize: FontSizes.display,
  },
  emptyTitle: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  exerciseCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  exerciseHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  exerciseName: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  targetText: {
    marginTop: 4,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
  },
  setRowsContainer: {
    paddingHorizontal: Spacing.md,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  setRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  setBadge: {
    width: 28,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  setBadgeText: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  weightRepsWrap: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  weightRepsText: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
  },
  rpeBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: Spacing.sm,
  },
  rpeText: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.semiBold,
  },
  noRpeText: {
    marginLeft: Spacing.sm,
    fontSize: FontSizes.label,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
    minWidth: 22,
    textAlign: 'center',
  },
  repStatusText: {
    marginLeft: Spacing.sm,
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    width: 18,
    textAlign: 'center',
  },
  repStatusGood: {
    color: Colors.success,
  },
  repStatusDown: {
    color: Colors.warning,
  },
  repStatusSpacer: {
    width: 18,
    marginLeft: Spacing.sm,
  },
  exerciseFooter: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  exerciseFooterSwapped: {
    backgroundColor: Colors.bgElevated,
  },
  swapText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
    marginBottom: 4,
  },
  bestSetText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  rawFallbackWrap: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.md,
  },
  rawFallbackLabel: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.semiBold,
    color: Colors.textTertiary,
    marginBottom: Spacing.sm,
  },
  rawFallbackRow: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
});

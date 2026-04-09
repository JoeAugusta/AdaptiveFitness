import { useState, Fragment, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';

export const WARMUP_COLLAPSED_STORAGE_KEY = 'warmup_collapsed_compound';

export type CompoundTier = 'primary_compound' | 'secondary_compound' | 'isolation';

export interface WarmupSet {
  label: string;
  weightLbs: number;
  reps: number;
  note: string;
}

function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

export function calculateWarmupSets(workingWeightLbs: number): WarmupSet[] {
  if (workingWeightLbs < 95) return [];
  const w = workingWeightLbs;
  return [
    {
      label: 'Warm-up 1',
      weightLbs: round5(w * 0.4),
      reps: 10,
      note: 'Light — just moving the bar',
    },
    {
      label: 'Warm-up 2',
      weightLbs: round5(w * 0.6),
      reps: 5,
      note: 'Building to working weight',
    },
    {
      label: 'Warm-up 3',
      weightLbs: round5(w * 0.8),
      reps: 3,
      note: 'One step below working weight',
    },
  ].filter((s) => s.weightLbs >= 45);
}

export interface SetTarget {
  setNumber: number;
  targetReps: string;
  targetWeight: number;
  targetRpe: number;
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  usesWeight?: boolean;
  /** Plan / library: compound vs isolation */
  planCategory?: 'compound' | 'isolation';
  /** From exercise library tier — drives warmup eligibility */
  compoundTier?: CompoundTier;
  /** Same as compoundTier when present — used for warmup compound check */
  category?: CompoundTier;
  /** From exercise library — fallback when category missing */
  movementPattern?: string;
  /** Denormalized working weight (usually matches first set) */
  targetWeight?: number;
  /** Denormalized rep prescription (usually matches first set) */
  reps?: string;
  sets: SetTarget[];
  alternatives: string[];
}

export interface LoggedSet {
  exerciseId: string;
  setNumber: number;
  weightLbs: number;
  reps: number;
  rpe: number | null;
  swapped: boolean;
}

function getLastWeekPills(sets: LoggedSet[]): string[] {
  const sortedSets = [...sets].sort((a, b) => a.setNumber - b.setNumber);
  return sortedSets.map((s) => {
    const w = s.weightLbs === 0 ? 'BW' : `${s.weightLbs}`;
    return `${w}×${s.reps ?? 0}`;
  });
}

function getLastWeekAvgRpe(sets: LoggedSet[]): string | null {
  const sortedSets = [...sets].sort((a, b) => a.setNumber - b.setNumber);
  const rpeVals = sortedSets.filter((s) => s.rpe != null && s.rpe > 0).map((s) => s.rpe!);
  if (rpeVals.length === 0) return null;
  const avg = rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length;
  return avg.toFixed(1);
}

function getLastWeekBestSet(sets: LoggedSet[]): string {
  if (!sets.length) return '';
  const sortedSets = [...sets].sort((a, b) => a.setNumber - b.setNumber);
  const best = sortedSets.reduce((p, c) => ((c.weightLbs ?? 0) > (p.weightLbs ?? 0) ? c : p));
  const w = best.weightLbs === 0 ? 'BW' : `${best.weightLbs}`;
  return `${w}×${best.reps ?? 0}`;
}

function rpeValueColor(rpe: number) {
  if (rpe >= 1 && rpe <= 4) return Colors.success;
  if (rpe >= 5 && rpe <= 7) return Colors.warning;
  return Colors.danger;
}

function isTimedExercise(repsString: string): boolean {
  return /second|sec|s$|\d+s\b/i.test(repsString.trim());
}

function parseTimedDuration(repsString: string): number {
  const match = repsString.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 30;
}

export type PlanGoalType =
  | 'strength'
  | 'hypertrophy'
  | 'recomp'
  | 'fat_loss'
  | 'general'
  | string;

interface ExerciseCardProps {
  exercise: Exercise;
  loggedSets: LoggedSet[];
  previousSets?: LoggedSet[];
  swappedName: string | null;
  coachingNote: string | null;
  coachingLoading: boolean;
  /** Plan week — affects self-select coach copy when no prescribed weight */
  weekNumber?: number;
  /** From plan_json.goal */
  goal?: PlanGoalType;
  /** Shared across compound exercises in one active workout */
  warmupCollapsedCompound?: boolean;
  onWarmupCollapsedCompoundChange?: (collapsed: boolean) => void;
  onLogSet: (
    exerciseId: string,
    setNumber: number,
    weight: number,
    reps: number,
    rpe: number | null,
  ) => void;
  onSwapExercise: (exerciseId: string, newName: string) => void;
}

export default function ExerciseCard({
  exercise,
  loggedSets,
  previousSets = [],
  swappedName,
  coachingNote,
  coachingLoading,
  weekNumber = 1,
  goal = 'strength',
  warmupCollapsedCompound = false,
  onWarmupCollapsedCompoundChange,
  onLogSet,
  onSwapExercise,
}: ExerciseCardProps) {
  const displayName = swappedName || exercise.name;
  const isBodyweightExercise = exercise.usesWeight === false;
  const tw =
    exercise.targetWeight ?? exercise.sets[0]?.targetWeight ?? 0;
  const isSelfSelectMode =
    !isBodyweightExercise && tw === 0 && goal !== 'strength';

  const repsForWarmup =
    exercise.reps ?? exercise.sets[0]?.targetReps ?? '';

  const [enteredWeight, setEnteredWeight] = useState(0);

  useEffect(() => {
    setEnteredWeight(0);
  }, [exercise.id]);

  const effectiveWeight = isSelfSelectMode
    ? enteredWeight
    : (exercise.targetWeight ?? exercise.sets[0]?.targetWeight ?? 0);

  const warmupCompoundSlot =
    exercise.category ?? exercise.compoundTier ?? 'isolation';
  const needsWarmup =
    effectiveWeight >= 95 &&
    !isBodyweightExercise &&
    !isTimedExercise(repsForWarmup) &&
    (warmupCompoundSlot === 'primary_compound' ||
      warmupCompoundSlot === 'secondary_compound' ||
      exercise.movementPattern === 'horizontal_push' ||
      exercise.movementPattern === 'horizontal_pull' ||
      exercise.movementPattern === 'vertical_push' ||
      exercise.movementPattern === 'squat' ||
      exercise.movementPattern === 'hinge');

  useEffect(() => {
    if (__DEV__) {
      console.log('[warmup reactive]', {
        name: exercise.name,
        enteredWeight,
        effectiveWeight,
        needsWarmup,
      });
    }
  }, [exercise.name, enteredWeight, effectiveWeight, needsWarmup]);

  const warmupSets = useMemo(
    () => (needsWarmup ? calculateWarmupSets(effectiveWeight) : []),
    [needsWarmup, effectiveWeight],
  );

  const showWarmup = needsWarmup && warmupSets.length > 0 && !warmupCollapsedCompound;

  const [inputValues, setInputValues] = useState<
    Record<number, { weight: string; reps: string; rpe: number | null }>
  >({});
  const [rpeExpandedSet, setRpeExpandedSet] = useState<number | null>(null);
  const [showCoachingSheet, setShowCoachingSheet] = useState(false);
  const [showSwapSheet, setShowSwapSheet] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [trendBySet, setTrendBySet] = useState<Record<number, { text: string; color: string }>>({});
  const trendTimeouts = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const getDefaultInput = (setNumber: number) => {
    const lastLogged =
      loggedSets.length > 0 ? loggedSets[loggedSets.length - 1] : null;
    const target = exercise.sets.find((s) => s.setNumber === setNumber);
    return {
      weight: lastLogged
        ? String(lastLogged.weightLbs)
        : isBodyweightExercise
          ? '0'
          : isSelfSelectMode
            ? ''
            : String(target?.targetWeight ?? ''),
      reps: target
        ? (isTimedExercise(target.targetReps)
          ? String(parseTimedDuration(target.targetReps))
          : target.targetReps.split(/[–\-]/)[0].trim())
        : '',
      rpe: null as number | null,
    };
  };

  const getInputForSet = (setNumber: number) =>
    inputValues[setNumber] || getDefaultInput(setNumber);

  const updateInput = (
    setNumber: number,
    field: 'weight' | 'reps',
    value: string,
  ) => {
    if (field === 'weight' && isSelfSelectMode) {
      setEnteredWeight(parseFloat(value) || 0);
    }
    setInputValues((prev) => {
      const existing = prev[setNumber] || getDefaultInput(setNumber);
      return { ...prev, [setNumber]: { ...existing, [field]: value } };
    });
  };

  const setRpeForSet = (setNumber: number, rpe: number) => {
    setInputValues((prev) => {
      const existing = prev[setNumber] || getDefaultInput(setNumber);
      return { ...prev, [setNumber]: { ...existing, rpe } };
    });
  };

  const isSetLogged = (setNumber: number) =>
    loggedSets.some((s) => s.setNumber === setNumber);

  const getLoggedSet = (setNumber: number) =>
    loggedSets.find((s) => s.setNumber === setNumber);

  const canLogSet = (setNumber: number) => {
    if (isSetLogged(setNumber)) return false;
    const input = getInputForSet(setNumber);
    const weight = parseFloat(input.weight);
    const reps = parseInt(input.reps, 10);
    if (isNaN(reps) || reps <= 0) return false;
    if (isBodyweightExercise) return true;
    return !isNaN(weight) && weight > 0;
  };

  const handleLogSet = (setNumber: number) => {
    const input = getInputForSet(setNumber);
    const weight = isBodyweightExercise ? 0 : parseFloat(input.weight);
    const reps = parseInt(input.reps, 10);
    if (isNaN(reps) || reps <= 0) return;
    if (!isBodyweightExercise && (isNaN(weight) || weight <= 0)) return;
    onLogSet(exercise.id, setNumber, weight, reps, input.rpe);

    const lastWeekSameSet = previousSets.find((s) => s.setNumber === setNumber);
    if (!lastWeekSameSet) return;

    const lastWeight = lastWeekSameSet.weightLbs ?? 0;
    const lastReps = lastWeekSameSet.reps ?? 0;
    let trend: { text: string; color: string } | null = null;

    if (lastWeight === 0 && weight === 0) {
      trend = null;
    } else if (lastWeight === 0 && weight > 0) {
      trend = {
        text: `First weighted session — baseline set at ${weight} lbs`,
        color: Colors.accent,
      };
    } else if (weight > lastWeight) {
      trend = { text: `↑ ${weight - lastWeight} lbs more than last week`, color: Colors.success };
    } else if (weight === lastWeight && reps > lastReps) {
      trend = { text: `↑ ${reps - lastReps} more reps than last week`, color: Colors.success };
    } else if (weight === lastWeight && reps === lastReps) {
      trend = { text: '= Same as last week', color: Colors.textSecondary };
    } else if (weight < lastWeight) {
      trend = { text: `↓ ${lastWeight - weight} lbs less than last week`, color: Colors.warning };
    }

    if (!trend) return;
    setTrendBySet((prev) => ({ ...prev, [setNumber]: trend! }));
    if (trendTimeouts.current[setNumber]) {
      clearTimeout(trendTimeouts.current[setNumber]);
    }
    trendTimeouts.current[setNumber] = setTimeout(() => {
      setTrendBySet((prev) => {
        const next = { ...prev };
        delete next[setNumber];
        return next;
      });
      delete trendTimeouts.current[setNumber];
    }, 2000);
  };

  const firstTarget = exercise.sets[0];
  const firstTargetIsTimed = firstTarget ? isTimedExercise(firstTarget.targetReps) : false;
  const firstTargetDuration = firstTarget ? parseTimedDuration(firstTarget.targetReps) : 0;
  const firstTargetRpe = firstTarget?.targetRpe ?? 0;
  const selfSelectText =
    weekNumber === 1
      ? `Choose a weight at RPE ${firstTargetRpe} and log it — I'll set Week 2 from your numbers.`
      : `No weight was set for this exercise — choose a weight at RPE ${firstTargetRpe} and log it.`;
  const repsSubtitlePart = firstTargetIsTimed
    ? `${firstTargetDuration} sec`
    : (exercise.reps ?? firstTarget?.targetReps ?? '');
  const targetSummary =
    firstTarget != null
      ? isSelfSelectMode
        ? `${exercise.sets.length} sets × ${repsSubtitlePart} — choose load for RPE target`
        : isBodyweightExercise
          ? `${exercise.sets.length} sets × ${repsSubtitlePart}`
          : `${exercise.sets.length} sets × ${repsSubtitlePart} @ ${exercise.targetWeight ?? firstTarget.targetWeight} lbs`
      : '';

  const showSelfSelectWarmupHint =
    isSelfSelectMode &&
    enteredWeight <= 0 &&
    !(needsWarmup && warmupSets.length > 0);

  const showCoachingBlock =
    loggedSets.length > 0 && (coachingNote != null || coachingLoading);
  const lastWeekPillLabels = getLastWeekPills(previousSets);
  const lastWeekBestStr = getLastWeekBestSet(previousSets);
  const lastWeekAvgRpeStr = getLastWeekAvgRpe(previousSets);
  const lastWeekVisiblePills = lastWeekPillLabels.slice(0, 5);
  const lastWeekMoreCount = lastWeekPillLabels.length - lastWeekVisiblePills.length;
  const previousWasSwapped = previousSets.some((s) => s.swapped);

  useEffect(() => () => {
    Object.values(trendTimeouts.current).forEach((timeoutId) => clearTimeout(timeoutId));
  }, []);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.exerciseName} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.muscleTag}>
            <Text style={styles.muscleTagText}>{exercise.muscleGroup}</Text>
          </View>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => setShowCoachingSheet(true)}
        >
          <Text style={styles.infoIcon}>ⓘ</Text>
        </TouchableOpacity>
      </View>

      {isSelfSelectMode ? (
        <View style={styles.selfSelectStrip}>
          <View style={styles.selfSelectStripRow}>
            <View style={styles.selfSelectJCircle}>
              <Text style={styles.selfSelectJLetter}>J</Text>
            </View>
            <Text style={styles.selfSelectStripText}>{selfSelectText}</Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.targetLine}>{targetSummary}</Text>
      {previousSets.length > 0 ? (
        <View style={styles.lastWeekStrip}>
          <View style={styles.lastWeekHeaderRow}>
            <Text style={styles.lastWeekLabel}>LAST WEEK</Text>
            {lastWeekBestStr ? (
              <View style={styles.lastWeekBestPill}>
                <Text style={styles.lastWeekBestPillText}>
                  🏆 {lastWeekBestStr}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.lastWeekPillsRow}>
            {lastWeekVisiblePills.map((label, idx) => (
              <View key={`last-week-set-${idx}`} style={styles.lastWeekSetPill}>
                <Text style={styles.lastWeekSetPillText}>{label}</Text>
              </View>
            ))}
            {lastWeekMoreCount > 0 ? (
              <View style={styles.lastWeekMorePill}>
                <Text style={styles.lastWeekMorePillText}>
                  +{lastWeekMoreCount} more
                </Text>
              </View>
            ) : null}
          </View>
          {previousWasSwapped ? (
            <Text style={styles.lastWeekSwappedNote}>Swapped exercise last week</Text>
          ) : null}
          {lastWeekAvgRpeStr != null ? (
            <Text style={styles.lastWeekRpeLine}>Avg RPE {lastWeekAvgRpeStr}</Text>
          ) : (
            <Text style={styles.lastWeekRpeMissing}>No RPE logged last week</Text>
          )}
        </View>
      ) : null}

      {needsWarmup && warmupSets.length > 0 ? (
        <View style={styles.warmupSection}>
          <TouchableOpacity
            style={styles.warmupHeaderRow}
            activeOpacity={0.7}
            onPress={() => {
              const next = !warmupCollapsedCompound;
              onWarmupCollapsedCompoundChange?.(next);
              void (next
                ? AsyncStorage.setItem(WARMUP_COLLAPSED_STORAGE_KEY, '1')
                : AsyncStorage.removeItem(WARMUP_COLLAPSED_STORAGE_KEY));
            }}
          >
            <Text style={styles.warmupHeaderLabel}>
              WARM-UP SETS {warmupCollapsedCompound ? '∨' : '∧'}
              {warmupCollapsedCompound ? ' (tap to show)' : ''}
            </Text>
            <Text style={styles.warmupHeaderNotLogged}>Not logged</Text>
          </TouchableOpacity>

          {showWarmup ? (
            <>
              {warmupSets.map((ws, wi) => (
                <View key={ws.label}>
                  <View style={styles.warmupSetRow}>
                    <View style={styles.warmupBadge}>
                      <Text style={styles.warmupBadgeText}>W{wi + 1}</Text>
                    </View>
                    <Text style={styles.warmupWeight}>{ws.weightLbs} lbs</Text>
                    <Text style={styles.warmupRepsSep}>×</Text>
                    <Text style={styles.warmupReps}>{ws.reps}</Text>
                  </View>
                  {wi === 0 ? (
                    <Text style={styles.warmupNoteOnce}>
                      These don&apos;t count toward your logged sets
                    </Text>
                  ) : null}
                </View>
              ))}
            </>
          ) : null}

          <View style={styles.workingSetsDividerWrap}>
            <View style={styles.workingSetsDividerLine} />
            <View style={styles.workingSetsDividerLabelBg}>
              <Text style={styles.workingSetsDividerLabel}>WORKING SETS</Text>
            </View>
            <View style={styles.workingSetsDividerLine} />
          </View>
        </View>
      ) : null}

      {showSelfSelectWarmupHint ? (
        <Text style={styles.warmupEntryHint}>
          💡 Enter a weight to see your warm-up sets
        </Text>
      ) : null}

      {exercise.sets.map((set, setIdx) => {
        const logged = isSetLogged(set.setNumber);
        const loggedData = getLoggedSet(set.setNumber);
        const input = getInputForSet(set.setNumber);
        const timedSet = isTimedExercise(set.targetReps);
        const timedDuration = parseTimedDuration(set.targetReps);
        const isFirstWorkingAfterWarmup =
          setIdx === 0 && needsWarmup && warmupSets.length > 0;

        return (
          <Fragment key={set.setNumber}>
            <View
              style={[
                styles.setRow,
                logged && styles.setRowLogged,
                isFirstWorkingAfterWarmup && styles.setRowFirstWorking,
              ]}
            >
              <View style={styles.setBadge}>
                <Text style={styles.setBadgeText}>{set.setNumber}</Text>
              </View>

              {logged && loggedData ? (
                <>
                  <Text style={styles.loggedWeight}>
                    {loggedData.weightLbs > 0 ? `${loggedData.weightLbs}` : 'BW'}
                  </Text>
                  {timedSet ? (
                    <Text style={styles.loggedTimedText}>{loggedData.reps} sec</Text>
                  ) : (
                    <>
                      <Text style={styles.timesSep}>×</Text>
                      <Text style={styles.loggedReps}>{loggedData.reps}</Text>
                    </>
                  )}
                  <View style={styles.rpeBadge}>
                    {loggedData.rpe != null ? (
                      <Text
                        style={[
                          styles.rpeBadgeValue,
                          { color: rpeValueColor(loggedData.rpe) },
                        ]}
                      >
                        {loggedData.rpe}
                      </Text>
                    ) : (
                      <Text style={styles.rpeBadgePlaceholder}>RPE</Text>
                    )}
                  </View>
                  <View style={styles.completionCircleDone}>
                    <Text style={styles.completionCheckDone}>✓</Text>
                  </View>
                </>
              ) : (
                <>
                  {!isBodyweightExercise ? (
                    <TextInput
                      style={[
                        styles.setInputWeight,
                        focusedField === `w-${set.setNumber}` && styles.inputFocused,
                      ]}
                      keyboardType="numeric"
                      value={
                        isSelfSelectMode
                          ? parseFloat(input.weight) > 0
                            ? input.weight
                            : ''
                          : input.weight
                      }
                      onChangeText={(v) => updateInput(set.setNumber, 'weight', v)}
                      placeholder={isSelfSelectMode ? 'Choose weight' : '0'}
                      placeholderTextColor={Colors.textTertiary}
                      selectTextOnFocus
                      onFocus={() => setFocusedField(`w-${set.setNumber}`)}
                      onBlur={() => setFocusedField(null)}
                    />
                  ) : (
                    <Text style={styles.bodyweightText}>Bodyweight</Text>
                  )}
                  {timedSet ? (
                    <Text style={styles.timedTargetText}>{timedDuration} sec</Text>
                  ) : (
                    <>
                      <Text style={styles.timesSep}>×</Text>
                      <TextInput
                        style={[
                          styles.setInputReps,
                          focusedField === `r-${set.setNumber}` && styles.inputFocused,
                        ]}
                        keyboardType="numeric"
                        value={input.reps}
                        onChangeText={(v) => updateInput(set.setNumber, 'reps', v)}
                        placeholder="0"
                        placeholderTextColor={Colors.textTertiary}
                        selectTextOnFocus
                        onFocus={() => setFocusedField(`r-${set.setNumber}`)}
                        onBlur={() => setFocusedField(null)}
                      />
                    </>
                  )}
                  <TouchableOpacity
                    style={styles.rpeBadge}
                    activeOpacity={0.7}
                    onPress={() =>
                      setRpeExpandedSet((prev) =>
                        prev === set.setNumber ? null : set.setNumber,
                      )
                    }
                  >
                    {input.rpe != null ? (
                      <Text
                        style={[
                          styles.rpeBadgeValue,
                          { color: rpeValueColor(input.rpe) },
                        ]}
                      >
                        {input.rpe}
                      </Text>
                    ) : (
                      <Text style={styles.rpeBadgePlaceholder}>RPE</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.completionCircle,
                      canLogSet(set.setNumber) && styles.completionCircleReady,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => handleLogSet(set.setNumber)}
                    disabled={!canLogSet(set.setNumber)}
                  >
                    <Text style={styles.completionCheckIdle}>✓</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
            {!logged && rpeExpandedSet === set.setNumber && (
              <View style={styles.rpeInlineRow}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[
                      styles.rpeInlineBtn,
                      input.rpe === val && styles.rpeInlineBtnSelected,
                      val <= 4 && input.rpe === val && styles.rpeInlineBtnSuccess,
                      val >= 5 &&
                        val <= 7 &&
                        input.rpe === val &&
                        styles.rpeInlineBtnWarning,
                      val >= 8 && input.rpe === val && styles.rpeInlineBtnDanger,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      setRpeForSet(set.setNumber, val);
                      setRpeExpandedSet(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.rpeInlineBtnText,
                        input.rpe === val && styles.rpeInlineBtnTextSelected,
                      ]}
                    >
                      {val}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {logged && trendBySet[set.setNumber] ? (
              <Text style={[styles.trendText, { color: trendBySet[set.setNumber].color }]}>
                {trendBySet[set.setNumber].text}
              </Text>
            ) : null}
          </Fragment>
        );
      })}

      {showCoachingBlock ? (
        <View style={styles.coachingNoteBox}>
          <Text style={styles.coachingJordan}>JORDAN</Text>
          {coachingLoading ? (
            <View style={styles.coachingSkeleton} />
          ) : (
            <Text style={styles.coachingNoteText}>{coachingNote}</Text>
          )}
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.swapButton}
        activeOpacity={0.7}
        onPress={() => setShowSwapSheet(true)}
      >
        <Text style={styles.swapButtonText}>Swap Exercise →</Text>
      </TouchableOpacity>

      <Modal
        visible={showCoachingSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCoachingSheet(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowCoachingSheet(false)}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <View style={styles.coachSheet}>
          <View style={styles.sheetDragHandle} />
          <Text style={styles.coachSheetBrand}>JORDAN</Text>
          {coachingLoading ? (
            <View style={styles.coachingSkeletonWide} />
          ) : coachingNote ? (
            <Text style={styles.coachSheetBody}>{coachingNote}</Text>
          ) : (
            <Text style={styles.coachSheetBody}>
              Complete a set to receive coaching feedback.
            </Text>
          )}
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.coachSheetBtn}
            onPress={() => setShowCoachingSheet(false)}
          >
            <Text style={styles.coachSheetBtnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal
        visible={showSwapSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSwapSheet(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowSwapSheet(false)}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <View style={styles.swapSheet}>
          <View style={styles.sheetDragHandle} />
          <Text style={styles.swapSheetTitle}>Swap Exercise</Text>
          <Text style={styles.swapSheetSubtitle}>
            Choose an alternative for {displayName}
          </Text>
          {exercise.alternatives.map((alt) => (
            <TouchableOpacity
              key={alt}
              style={styles.swapOption}
              activeOpacity={0.7}
              onPress={() => {
                onSwapExercise(exercise.id, alt);
                setShowSwapSheet(false);
              }}
            >
              <Text style={styles.swapOptionText}>{alt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: Spacing.sm,
  },
  exerciseName: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  muscleTag: {
    marginLeft: Spacing.sm,
    backgroundColor: Colors.bgElevated,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  muscleTagText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
  },
  infoIcon: {
    fontFamily: Fonts.regular,
    fontSize: 18,
    color: Colors.textSecondary,
  },
  targetLine: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  lastWeekStrip: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  lastWeekHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastWeekLabel: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
  },
  lastWeekBestPill: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  lastWeekBestPillText: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.semiBold,
    color: Colors.textSecondary,
  },
  lastWeekPillsRow: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  lastWeekSetPill: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginRight: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  lastWeekSetPillText: {
    fontSize: FontSizes.micro,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
  },
  lastWeekMorePill: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginRight: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  lastWeekMorePillText: {
    fontSize: FontSizes.micro,
    fontFamily: Fonts.medium,
    color: Colors.textTertiary,
  },
  lastWeekSwappedNote: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.micro,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
  },
  lastWeekRpeLine: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.micro,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
  },
  lastWeekRpeMissing: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.micro,
    fontFamily: Fonts.regular,
    fontStyle: 'italic',
    color: Colors.textTertiary,
  },
  selfSelectStrip: {
    backgroundColor: Colors.accentMuted,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  selfSelectStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  selfSelectJCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selfSelectJLetter: {
    fontSize: FontSizes.micro,
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
  selfSelectStripText: {
    flex: 1,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
  },
  warmupEntryHint: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  warmupSection: {
    marginBottom: Spacing.sm,
  },
  warmupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  warmupHeaderLabel: {
    flex: 1,
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    marginRight: Spacing.sm,
  },
  warmupHeaderNotLogged: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
  },
  warmupSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  warmupBadge: {
    width: 28,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  warmupBadgeText: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textTertiary,
  },
  warmupWeight: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.semiBold,
    color: Colors.textTertiary,
  },
  warmupRepsSep: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
  },
  warmupReps: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
    flex: 1,
  },
  warmupNoteOnce: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    marginBottom: Spacing.sm,
    marginLeft: 36,
  },
  workingSetsDividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  workingSetsDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.divider,
  },
  workingSetsDividerLabelBg: {
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.bgCard,
  },
  workingSetsDividerLabel: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
  },
  setRowFirstWorking: {
    borderTopWidth: 0,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  setRowLogged: {
    backgroundColor: Colors.successMuted,
    borderRadius: Radius.sm,
    paddingHorizontal: 0,
  },
  setBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setBadgeText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  setInputWeight: {
    width: 90,
    height: 44,
    backgroundColor: Colors.bgPrimary,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlign: 'center',
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  setInputReps: {
    width: 72,
    height: 44,
    backgroundColor: Colors.bgPrimary,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlign: 'center',
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  bodyweightText: {
    width: 90,
    height: 44,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
    paddingTop: 10,
  },
  timedTargetText: {
    width: 72,
    textAlign: 'center',
    fontSize: FontSizes.body,
    fontFamily: Fonts.semiBold,
    color: Colors.textSecondary,
  },
  inputFocused: {
    borderColor: Colors.accent,
  },
  timesSep: {
    width: 20,
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  loggedWeight: {
    width: 90,
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  loggedReps: {
    width: 72,
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  loggedTimedText: {
    width: 92,
    fontSize: FontSizes.body,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  rpeBadge: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rpeBadgeValue: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold,
  },
  rpeBadgePlaceholder: {
    fontSize: 9,
    fontFamily: Fonts.bold,
    color: Colors.textTertiary,
  },
  completionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.bgElevated,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionCircleReady: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentMuted,
  },
  completionCircleDone: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionCheckIdle: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
  },
  completionCheckDone: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  rpeInlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  rpeInlineBtn: {
    width: 26,
    height: 26,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rpeInlineBtnSelected: {
    borderWidth: 1.5,
  },
  rpeInlineBtnSuccess: {
    backgroundColor: Colors.successMuted,
    borderColor: Colors.success,
  },
  rpeInlineBtnWarning: {
    backgroundColor: Colors.warningMuted,
    borderColor: Colors.warning,
  },
  rpeInlineBtnDanger: {
    backgroundColor: Colors.dangerMuted,
    borderColor: Colors.danger,
  },
  rpeInlineBtnText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  rpeInlineBtnTextSelected: {
    color: Colors.textPrimary,
  },
  trendText: {
    marginTop: 4,
    marginBottom: 6,
    marginLeft: 34,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.semiBold,
  },
  coachingNoteBox: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  coachingJordan: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  coachingNoteText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  coachingSkeleton: {
    height: 12,
    width: '80%',
    backgroundColor: Colors.bgElevated,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  swapButton: {
    marginTop: Spacing.md,
    alignSelf: 'flex-start',
  },
  swapButtonText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
  },
  sheetDragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.divider,
    alignSelf: 'center',
    marginBottom: Spacing.xl,
  },
  coachSheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xxl,
  },
  coachSheetBrand: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    letterSpacing: 1.5,
  },
  coachSheetBody: {
    marginTop: Spacing.md,
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  coachingSkeletonWide: {
    marginTop: Spacing.md,
    height: 12,
    width: '80%',
    backgroundColor: Colors.bgElevated,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  coachSheetBtn: {
    marginTop: Spacing.xl,
    height: 52,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachSheetBtnText: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
  },
  swapSheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.xxl,
    paddingBottom: 40,
  },
  swapSheetTitle: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  swapSheetSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  swapOption: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  swapOptionText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
});

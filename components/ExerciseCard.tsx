import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import RPESelector from './RPESelector';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';

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

function rpeValueColor(rpe: number) {
  if (rpe >= 1 && rpe <= 4) return Colors.success;
  if (rpe >= 5 && rpe <= 7) return Colors.warning;
  return Colors.danger;
}

interface ExerciseCardProps {
  exercise: Exercise;
  loggedSets: LoggedSet[];
  swappedName: string | null;
  coachingNote: string | null;
  coachingLoading: boolean;
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
  swappedName,
  coachingNote,
  coachingLoading,
  onLogSet,
  onSwapExercise,
}: ExerciseCardProps) {
  const displayName = swappedName || exercise.name;

  const [inputValues, setInputValues] = useState<
    Record<number, { weight: string; reps: string; rpe: number | null }>
  >({});
  const [rpeModalSet, setRpeModalSet] = useState<number | null>(null);
  const [showCoachingSheet, setShowCoachingSheet] = useState(false);
  const [showSwapSheet, setShowSwapSheet] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const getDefaultInput = (setNumber: number) => {
    const lastLogged =
      loggedSets.length > 0 ? loggedSets[loggedSets.length - 1] : null;
    const target = exercise.sets.find((s) => s.setNumber === setNumber);
    return {
      weight: lastLogged
        ? String(lastLogged.weightLbs)
        : String(target?.targetWeight ?? ''),
      reps: target ? target.targetReps.split(/[–\-]/)[0].trim() : '',
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
    setRpeModalSet(null);
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
    return !isNaN(weight) && weight > 0 && !isNaN(reps) && reps > 0;
  };

  const handleLogSet = (setNumber: number) => {
    const input = getInputForSet(setNumber);
    const weight = parseFloat(input.weight);
    const reps = parseInt(input.reps, 10);
    if (isNaN(weight) || weight <= 0 || isNaN(reps) || reps <= 0) return;
    onLogSet(exercise.id, setNumber, weight, reps, input.rpe);
  };

  const firstTarget = exercise.sets[0];
  const targetSummary =
    firstTarget != null
      ? `${exercise.sets.length} sets × ${firstTarget.targetReps} reps @ ${firstTarget.targetWeight} lbs`
      : '';

  const showCoachingBlock =
    loggedSets.length > 0 && (coachingNote != null || coachingLoading);

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

      <Text style={styles.targetLine}>{targetSummary}</Text>

      {exercise.sets.map((set) => {
        const logged = isSetLogged(set.setNumber);
        const loggedData = getLoggedSet(set.setNumber);
        const input = getInputForSet(set.setNumber);

        return (
          <View
            key={set.setNumber}
            style={[styles.setRow, logged && styles.setRowLogged]}
          >
            <View style={styles.setBadge}>
              <Text style={styles.setBadgeText}>{set.setNumber}</Text>
            </View>

            {logged && loggedData ? (
              <>
                <Text style={styles.loggedWeight}>{loggedData.weightLbs}</Text>
                <Text style={styles.timesSep}>×</Text>
                <Text style={styles.loggedReps}>{loggedData.reps}</Text>
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
                  <Text style={styles.completionCheck}>✓</Text>
                </View>
              </>
            ) : (
              <>
                <TextInput
                  style={[
                    styles.setInputWeight,
                    focusedField === `w-${set.setNumber}` && styles.inputFocused,
                  ]}
                  keyboardType="numeric"
                  value={input.weight}
                  onChangeText={(v) => updateInput(set.setNumber, 'weight', v)}
                  placeholder="0"
                  placeholderTextColor={Colors.textTertiary}
                  selectTextOnFocus
                  onFocus={() => setFocusedField(`w-${set.setNumber}`)}
                  onBlur={() => setFocusedField(null)}
                />
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
                <TouchableOpacity
                  style={styles.rpeBadge}
                  activeOpacity={0.7}
                  onPress={() => setRpeModalSet(set.setNumber)}
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
                  <View />
                </TouchableOpacity>
              </>
            )}
          </View>
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

      <RPESelector
        visible={rpeModalSet !== null}
        onClose={() => setRpeModalSet(null)}
        onConfirm={(rpe) => {
          if (rpeModalSet !== null) setRpeForSet(rpeModalSet, rpe);
        }}
        initialValue={
          rpeModalSet !== null
            ? (inputValues[rpeModalSet]?.rpe ?? null)
            : null
        }
      />

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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionCircleReady: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentMuted,
  },
  completionCircleDone: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionCheck: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
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

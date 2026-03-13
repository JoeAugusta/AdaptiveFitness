import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import RPESelector from './RPESelector';

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const CARD_SELECTED_BG = 'rgba(59,130,246,0.12)';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';

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

  return (
    <View style={styles.card}>
      {/* Header */}
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
          {coachingLoading ? (
            <ActivityIndicator size="small" color={ACCENT_BLUE} />
          ) : (
            <Text style={styles.infoIcon}>ⓘ</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Coaching note inline preview */}
      {(coachingNote || coachingLoading) && (
        <View style={styles.coachingPreview}>
          {coachingLoading ? (
            <View style={styles.skeletonBlock} />
          ) : (
            <Text style={styles.coachingText} numberOfLines={2}>
              {coachingNote}
            </Text>
          )}
        </View>
      )}

      {/* Sets table header */}
      <View style={styles.tableHeader}>
        <View style={styles.colSet}>
          <Text style={styles.colHeaderText}>SET</Text>
        </View>
        <View style={styles.colTarget}>
          <Text style={styles.colHeaderText}>TARGET</Text>
        </View>
        <View style={styles.colWeight}>
          <Text style={styles.colHeaderText}>WEIGHT</Text>
        </View>
        <View style={styles.colReps}>
          <Text style={styles.colHeaderText}>REPS</Text>
        </View>
        <View style={styles.colRpe}>
          <Text style={styles.colHeaderText}>RPE</Text>
        </View>
        <View style={styles.colCheck}>
          <Text style={styles.colHeaderText}>✓</Text>
        </View>
      </View>

      {/* Sets rows */}
      {exercise.sets.map((set) => {
        const logged = isSetLogged(set.setNumber);
        const loggedData = getLoggedSet(set.setNumber);
        const input = getInputForSet(set.setNumber);

        return (
          <View
            key={set.setNumber}
            style={[styles.tableRow, logged && styles.tableRowLogged]}
          >
            <View style={styles.colSet}>
              <Text style={styles.cellText}>{set.setNumber}</Text>
            </View>
            <View style={styles.colTarget}>
              <Text style={styles.cellTextSecondary} numberOfLines={1}>
                {set.targetReps} @ {set.targetWeight}
              </Text>
            </View>

            {logged ? (
              <>
                <View style={styles.colWeight}>
                  <Text style={styles.cellText}>{loggedData!.weightLbs}</Text>
                </View>
                <View style={styles.colReps}>
                  <Text style={styles.cellText}>{loggedData!.reps}</Text>
                </View>
                <View style={styles.colRpe}>
                  <Text style={styles.cellText}>
                    {loggedData!.rpe ?? '—'}
                  </Text>
                </View>
                <View style={styles.colCheck}>
                  <Text style={styles.checkSolid}>✓</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.colWeight}>
                  <TextInput
                    style={styles.inputCell}
                    keyboardType="numeric"
                    value={input.weight}
                    onChangeText={(v) =>
                      updateInput(set.setNumber, 'weight', v)
                    }
                    placeholder="0"
                    placeholderTextColor="#475569"
                    selectTextOnFocus
                  />
                </View>
                <View style={styles.colReps}>
                  <TextInput
                    style={styles.inputCell}
                    keyboardType="numeric"
                    value={input.reps}
                    onChangeText={(v) => updateInput(set.setNumber, 'reps', v)}
                    placeholder="0"
                    placeholderTextColor="#475569"
                    selectTextOnFocus
                  />
                </View>
                <TouchableOpacity
                  style={[styles.colRpe, styles.rpeTappable]}
                  activeOpacity={0.7}
                  onPress={() => setRpeModalSet(set.setNumber)}
                >
                  <Text style={styles.rpeCellText}>
                    {input.rpe ?? '—'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.colCheck}
                  activeOpacity={0.7}
                  onPress={() => handleLogSet(set.setNumber)}
                  disabled={!canLogSet(set.setNumber)}
                >
                  <Text
                    style={[
                      styles.checkIcon,
                      canLogSet(set.setNumber) && styles.checkIconEnabled,
                    ]}
                  >
                    ✓
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        );
      })}

      {/* Swap exercise */}
      <TouchableOpacity
        style={styles.swapButton}
        activeOpacity={0.7}
        onPress={() => setShowSwapSheet(true)}
      >
        <Text style={styles.swapButtonText}>Swap Exercise →</Text>
      </TouchableOpacity>

      {/* RPE Selector */}
      <RPESelector
        visible={rpeModalSet !== null}
        onClose={() => setRpeModalSet(null)}
        onConfirm={(rpe) => {
          if (rpeModalSet !== null) setRpeForSet(rpeModalSet, rpe);
        }}
        initialValue={rpeModalSet !== null ? (inputValues[rpeModalSet]?.rpe ?? null) : null}
      />

      {/* Coaching note sheet */}
      <Modal
        visible={showCoachingSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCoachingSheet(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowCoachingSheet(false)}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <View style={styles.bottomSheet}>
          <View style={styles.dragHandle} />
          <Text style={styles.sheetTitle}>Coach's Note</Text>
          {coachingLoading ? (
            <ActivityIndicator
              size="small"
              color={ACCENT_BLUE}
              style={{ marginVertical: 20 }}
            />
          ) : coachingNote ? (
            <Text style={styles.sheetContent}>{coachingNote}</Text>
          ) : (
            <Text style={styles.sheetContent}>
              Complete a set to receive coaching feedback.
            </Text>
          )}
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.sheetCloseButton}
            onPress={() => setShowCoachingSheet(false)}
          >
            <Text style={styles.sheetCloseText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Swap exercise sheet */}
      <Modal
        visible={showSwapSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSwapSheet(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowSwapSheet(false)}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <View style={styles.bottomSheet}>
          <View style={styles.dragHandle} />
          <Text style={styles.sheetTitle}>Swap Exercise</Text>
          <Text style={styles.sheetSubtitle}>
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
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },

  /* Header */
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  exerciseName: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    flexShrink: 1,
  },
  muscleTag: {
    backgroundColor: BG_DARK,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  muscleTagText: { fontSize: 12, color: TEXT_SECONDARY },
  infoIcon: { fontSize: 18, color: TEXT_SECONDARY },

  /* Coaching preview */
  coachingPreview: {
    backgroundColor: BG_DARK,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  skeletonBlock: {
    backgroundColor: '#334155',
    borderRadius: 4,
    height: 14,
    width: '80%',
  },
  coachingText: { fontSize: 13, color: TEXT_SECONDARY, lineHeight: 18 },

  /* Table */
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    marginBottom: 4,
  },
  colHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: TEXT_SECONDARY,
    textAlign: 'center',
  },
  colSet: { width: 28, alignItems: 'center' },
  colTarget: { flex: 1, paddingLeft: 4 },
  colWeight: { width: 62, alignItems: 'center' },
  colReps: { width: 44, alignItems: 'center' },
  colRpe: { width: 40, alignItems: 'center' },
  colCheck: { width: 34, alignItems: 'center' },

  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  tableRowLogged: { backgroundColor: CARD_SELECTED_BG },

  cellText: { fontSize: 14, color: TEXT_PRIMARY, textAlign: 'center' },
  cellTextSecondary: { fontSize: 12, color: TEXT_SECONDARY },

  inputCell: {
    backgroundColor: BG_DARK,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 14,
    color: TEXT_PRIMARY,
    textAlign: 'center',
    width: '92%',
    minHeight: 32,
  },
  rpeTappable: {
    backgroundColor: BG_DARK,
    borderRadius: 6,
    paddingVertical: 4,
    minHeight: 32,
    justifyContent: 'center',
  },
  rpeCellText: { fontSize: 14, color: TEXT_SECONDARY, textAlign: 'center' },
  checkIcon: { fontSize: 18, color: '#334155' },
  checkIconEnabled: { color: ACCENT_BLUE },
  checkSolid: { fontSize: 18, color: ACCENT_BLUE, fontWeight: '700' },

  /* Swap */
  swapButton: { marginTop: 12, alignSelf: 'flex-start' },
  swapButtonText: { fontSize: 14, color: TEXT_SECONDARY },

  /* Shared modal styles */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  bottomSheet: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginBottom: 16,
  },
  sheetContent: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    lineHeight: 22,
    marginBottom: 20,
  },
  sheetCloseButton: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetCloseText: { fontSize: 15, fontWeight: '600', color: TEXT_PRIMARY },
  swapOption: {
    backgroundColor: BG_DARK,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  swapOptionText: { fontSize: 15, color: TEXT_PRIMARY },
});

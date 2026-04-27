import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../navigation/types';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { supabase } from '../Lib/supabase';
import ExerciseCard from '../components/ExerciseCard';
import type { LoggedSet, CompoundTier, SetTarget } from '../components/ExerciseCard';
import { EXERCISES, type Exercise as LibraryExercise } from '../constants/exerciseLibrary';

type FreeExercise = {
  id: string;
  name: string;
  muscleGroup: string;
  usesWeight: boolean;
  isUnilateral: boolean;
  planCategory: 'compound' | 'isolation';
  compoundTier: CompoundTier;
  category: CompoundTier;
  movementPattern?: string;
  targetWeight: number;
  reps: string;
  sets: SetTarget[];
  alternatives: string[];
  cues: string[];
  coachingNote?: string;
  restSeconds?: number;
  phase?: 'strength' | 'hypertrophy';
};

type Phase = 'setup' | 'logging' | 'complete';

/** Matches WorkoutResultsModal / ActiveWorkout 1–5 energy scale */
const FATIGUE_OPTIONS = [
  { rating: 1, emoji: '😴', label: 'Wiped' },
  { rating: 2, emoji: '😤', label: 'Tired' },
  { rating: 3, emoji: '😊', label: 'Good' },
  { rating: 4, emoji: '💪', label: 'Strong' },
  { rating: 5, emoji: '🔥', label: 'Beast Mode' },
] as const;

type Nav = NativeStackNavigationProp<WorkoutStackParamList>;

/** Group order for free-session exercise picker — matches EXERCISES primaryMuscle values */
const MUSCLE_ORDER = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Core',
  'Traps',
  'Forearms',
] as const;

const buildFreeExerciseFromLibrary = (libEx: LibraryExercise): FreeExercise => ({
  id: `free_${libEx.id}_${Date.now()}`,
  name: libEx.name,
  muscleGroup: libEx.primaryMuscle,
  usesWeight: libEx.usesWeight,
  isUnilateral: libEx.isUnilateral,
  planCategory: libEx.category,
  compoundTier: libEx.compoundTier,
  category: libEx.compoundTier,
  movementPattern: libEx.movementPattern,
  targetWeight: 0,
  reps: '1-20',
  sets: [],
  alternatives: [],
  cues: [...libEx.cues],
  coachingNote: 'Log your sets — choose a weight that challenges you.',
});

export default function FreeSessionScreen() {
  const navigation = useNavigation<Nav>();
  const [phase, setPhase] = useState<Phase>('setup');
  const [sessionName, setSessionName] = useState('Extra Work');
  const [exercises, setExercises] = useState<FreeExercise[]>([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([]);
  const [fatigueRating, setFatigueRating] = useState<number>(3);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [jordanNote, setJordanNote] = useState('');

  const [restSeconds, setRestSeconds] = useState(0);
  const [restDurationTotal, setRestDurationTotal] = useState(90);
  const [isRestActive, setIsRestActive] = useState(false);

  useEffect(() => {
    if (!isRestActive) return;
    if (restSeconds <= 0) {
      setIsRestActive(false);
      return;
    }
    const timeout = setTimeout(() => setRestSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timeout);
  }, [isRestActive, restSeconds]);

  const groupedExercises = useMemo(() => {
    const query = exerciseSearch.toLowerCase().trim();
    const filtered = query
      ? EXERCISES.filter((e) => e.name.toLowerCase().includes(query))
      : EXERCISES;

    return MUSCLE_ORDER.map((muscle) => ({
      muscle,
      exercises: filtered.filter((e) => e.primaryMuscle === muscle),
    })).filter((g) => g.exercises.length > 0);
  }, [exerciseSearch]);

  function formatRestCountdown(seconds: number): string {
    const m = Math.floor(Math.max(0, seconds) / 60);
    const s = Math.max(0, seconds) % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  const handleRemoveExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddSet = (exerciseId: string) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;
        const newSet: SetTarget = {
          setNumber: ex.sets.length + 1,
          targetReps: '1-20',
          targetWeight: 0,
          targetRpe: 8,
        };
        return { ...ex, sets: [...ex.sets, newSet] };
      }),
    );
  };

  const handleLogSet = useCallback(
    (
      exerciseId: string,
      setNumber: number,
      weight: number,
      reps: number,
      rpe: number | null,
    ) => {
      const newSet: LoggedSet = {
        exerciseId,
        exerciseName: exercises.find((e) => e.id === exerciseId)?.name,
        setNumber,
        weightLbs: weight,
        reps,
        rpe,
        swapped: false,
      };
      setLoggedSets((prev) => [...prev, newSet]);

      setRestDurationTotal(90);
      setRestSeconds(90);
      setIsRestActive(true);
    },
    [exercises],
  );

  const generateJordanNote = (): string => {
    const totalSets = loggedSets.length;
    const totalExercises = exercises.filter((e) =>
      loggedSets.some((s) => s.exerciseId === e.id),
    ).length;
    const topSet = loggedSets
      .filter((s) => s.weightLbs > 0)
      .sort((a, b) => b.weightLbs - a.weightLbs)[0];

    if (totalSets === 0) {
      return 'Good showing up. Next time, log your sets so I can track your progress.';
    }
    return `${totalSets} set${totalSets > 1 ? 's' : ''} across ${totalExercises} exercise${totalExercises > 1 ? 's' : ''}.${
      topSet ? ` Top set: ${topSet.exerciseName} at ${topSet.weightLbs} lbs.` : ''
    } Extra work doesn't adapt your plan — but Jordan sees it when building next week.`;
  };

  const handleFinishSession = () => {
    const note = generateJordanNote();
    setJordanNote(note);
    setPhase('complete');
  };

  const totalLoggedSets = loggedSets.length;
  const topWeightLbs = loggedSets.reduce(
    (max, s) => Math.max(max, s.weightLbs),
    0,
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error('No session');

      const { error } = await supabase.from('free_sessions').insert({
        user_id: session.user.id,
        session_name: sessionName.trim() || 'Extra Work',
        sets_json: loggedSets,
        session_fatigue_rating: fatigueRating,
        notes: notes.trim() || null,
        logged_at: new Date().toISOString(),
      });
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigation as any).navigate('Dashboard', {
        screen: 'WorkoutTab',
        params: { screen: 'WorkoutHome' },
      });
    } catch {
      Alert.alert('Error', 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (phase === 'setup') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Extra Work</Text>
          <View style={{ width: 28 }} />
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            style={styles.sessionNameInput}
            value={sessionName}
            onChangeText={setSessionName}
            placeholder="Session name (e.g. Push Day)"
            placeholderTextColor={Colors.textTertiary}
            maxLength={40}
          />

          <TouchableOpacity
            style={styles.addExercisePickerBtn}
            onPress={() => {
              setExerciseSearch('');
              setShowExercisePicker(true);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.addExercisePickerBtnText}>+ Add Exercise</Text>
          </TouchableOpacity>

          {exercises.map((ex, i) => (
            <View key={ex.id} style={styles.exerciseSetupRow}>
              <Text style={styles.exerciseSetupName} numberOfLines={2}>
                {ex.name}
              </Text>
              <View style={[styles.exerciseSetsBadge, { marginRight: Spacing.sm }]}>
                <Text style={styles.exerciseSetsBadgeText}>
                  {ex.sets.length} sets
                </Text>
              </View>
              <TouchableOpacity
                style={styles.exerciseRemove}
                onPress={() => handleRemoveExercise(i)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.exerciseRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={[
              styles.startCTA,
              exercises.length === 0 && { opacity: 0.4 },
            ]}
            disabled={exercises.length === 0}
            onPress={() => setPhase('logging')}
            activeOpacity={0.85}
          >
            <Text style={styles.startCTAText}>Start Session →</Text>
          </TouchableOpacity>
        </ScrollView>

        <Modal
          visible={showExercisePicker}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowExercisePicker(false)}
        >
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Exercise</Text>
              <TouchableOpacity
                onPress={() => setShowExercisePicker(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.pickerClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.pickerSearchRow}>
              <TextInput
                style={styles.pickerSearchInput}
                value={exerciseSearch}
                onChangeText={setExerciseSearch}
                placeholder="Search exercises..."
                placeholderTextColor={Colors.textTertiary}
                autoFocus
                clearButtonMode="while-editing"
              />
            </View>

            <ScrollView
              style={styles.pickerScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {groupedExercises.map((group) => (
                <View key={group.muscle}>
                  <Text style={styles.pickerGroupLabel}>
                    {group.muscle.toUpperCase()}
                  </Text>
                  {group.exercises.map((ex, i) => (
                    <TouchableOpacity
                      key={ex.id}
                      style={[
                        styles.pickerRow,
                        i === group.exercises.length - 1 && styles.pickerRowLast,
                      ]}
                      onPress={() => {
                        if (exercises.some((e) => e.name === ex.name)) {
                          setShowExercisePicker(false);
                          return;
                        }
                        setExercises((prev) => [
                          ...prev,
                          buildFreeExerciseFromLibrary(ex),
                        ]);
                        setShowExercisePicker(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.pickerRowLeft}>
                        <Text style={styles.pickerExName}>{ex.name}</Text>
                        <View style={styles.pickerTagRow}>
                          <View style={styles.pickerEquipTag}>
                            <Text style={styles.pickerEquipTagText}>
                              {ex.equipment}
                            </Text>
                          </View>
                          {ex.category === 'compound' ? (
                            <View style={styles.pickerCompoundTag}>
                              <Text style={styles.pickerCompoundTagText}>
                                compound
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      {exercises.some((e) => e.name === ex.name) ? (
                        <Text style={styles.pickerAdded}>✓ Added</Text>
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
              {groupedExercises.length === 0 ? (
                <View style={styles.pickerEmpty}>
                  <Text style={styles.pickerEmptyText}>
                    No exercises match &quot;{exerciseSearch}&quot;
                  </Text>
                </View>
              ) : null}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  if (phase === 'logging') {
    const activeExerciseIndex = exercises.findIndex((ex) => {
      const logged = loggedSets.filter((s) => s.exerciseId === ex.id).length;
      return logged < ex.sets.length;
    });

    const totalLogged = loggedSets.length;
    const hasAnyLoggedSets = totalLogged > 0;

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loggingRoot}>
          <View style={styles.header}>
            <View style={{ width: 28 }} />
            <Text style={styles.headerTitle} numberOfLines={1}>
              {sessionName}
            </Text>
            <TouchableOpacity
              onPress={() =>
                Alert.alert('End Session', "Save what you've logged so far?", [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'End Session',
                    onPress: handleFinishSession,
                  },
                ])
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.headerRightMultiline}>
                End{'\n'}Session
              </Text>
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            style={styles.kav}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              style={styles.loggingScroll}
              contentContainerStyle={{
                padding: Spacing.md,
                paddingBottom: 140,
              }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {exercises.map((ex, idx) => (
                <View key={ex.id}>
                  <ExerciseCard
                    exercise={ex}
                    loggedSets={loggedSets.filter((s) => s.exerciseId === ex.id)}
                    previousSets={[]}
                    isActiveCard={idx === activeExerciseIndex}
                    swappedName={null}
                    coachingNote={null}
                    coachingLoading={false}
                    weekNumber={0}
                    goal="general"
                    experience="intermediate"
                    onLogSet={handleLogSet}
                    onSwapExercise={(_exerciseId, _newName) => {}}
                  />
                  <TouchableOpacity
                    style={styles.addSetBelowCard}
                    onPress={() => handleAddSet(ex.id)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.addSetBelowCardText}>+ Add Set</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </KeyboardAvoidingView>

          {isRestActive ? (
            <View style={styles.restTimer} pointerEvents="box-none">
              <View style={styles.restTimerRow}>
                <Text style={styles.restTimerCountdown}>
                  {formatRestCountdown(restSeconds)}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setIsRestActive(false);
                    setRestSeconds(0);
                  }}
                >
                  <Text style={styles.restTimerSkip}>Skip →</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.restTimerTrack}>
                <View
                  style={[
                    styles.restTimerFill,
                    {
                      width:
                        restDurationTotal > 0
                          ? `${Math.max(
                              0,
                              (restSeconds / restDurationTotal) * 100,
                            )}%`
                          : '0%',
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}

          <View style={styles.finishCTAWrapper}>
            <TouchableOpacity
              style={[
                styles.finishCTA,
                !hasAnyLoggedSets && styles.finishCTADisabled,
              ]}
              disabled={!hasAnyLoggedSets}
              onPress={handleFinishSession}
              activeOpacity={0.85}
            >
              <Text style={styles.finishCTAText}>Finish Session</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ width: 28 }} />
        <Text style={styles.headerTitle}>Session Complete</Text>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.strip}>
          <View style={[styles.stripCell, { marginRight: Spacing.sm }]}>
            <Text style={styles.stripLabel}>EXERCISES</Text>
            <Text style={styles.stripValue}>{exercises.length}</Text>
          </View>
          <View style={[styles.stripCell, { marginRight: Spacing.sm }]}>
            <Text style={styles.stripLabel}>SETS</Text>
            <Text style={styles.stripValue}>{totalLoggedSets}</Text>
          </View>
          <View style={styles.stripCell}>
            <Text style={styles.stripLabel}>TOP WEIGHT</Text>
            <Text style={styles.stripValue}>
              {topWeightLbs <= 0 ? 'BW' : `${topWeightLbs} lbs`}
            </Text>
          </View>
        </View>

        <View style={styles.jordanCard}>
          <Text style={styles.jordanLabel}>JORDAN</Text>
          <Text style={styles.jordanText}>{jordanNote}</Text>
        </View>

        <Text style={styles.sectionLabel}>HOW DO YOU FEEL?</Text>
        <View style={styles.fatigueRow}>
          {FATIGUE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.rating}
              style={[
                styles.fatigueBtn,
                fatigueRating === opt.rating && styles.fatigueBtnActive,
              ]}
              onPress={() => setFatigueRating(opt.rating)}
            >
              <Text style={styles.fatigueEmoji}>{opt.emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="Any notes about this session..."
          placeholderTextColor={Colors.textTertiary}
          multiline
          numberOfLines={4}
        />

        <TouchableOpacity
          style={[styles.saveCTA, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={Colors.textPrimary} />
          ) : (
            <Text style={styles.saveCTAText}>Save Session</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  loggingRoot: {
    flex: 1,
  },
  kav: {
    flex: 1,
  },
  loggingScroll: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  headerRightMultiline: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'right',
    width: 80,
  },
  back: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
    padding: Spacing.md,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  sessionNameInput: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addExercisePickerBtn: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderStyle: 'dashed',
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  addExercisePickerBtnText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.accent,
  },
  pickerContainer: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  pickerTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  pickerClose: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  pickerSearchRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  pickerSearchInput: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pickerScroll: {
    flex: 1,
  },
  pickerGroupLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
    backgroundColor: Colors.bgPrimary,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    backgroundColor: Colors.bgCard,
  },
  pickerRowLast: {
    borderBottomWidth: 0,
  },
  pickerRowLeft: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  pickerExName: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  pickerTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerEquipTag: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 6,
  },
  pickerEquipTagText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
  },
  pickerCompoundTag: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pickerCompoundTagText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.accent,
  },
  pickerAdded: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.success,
  },
  pickerEmpty: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  pickerEmptyText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  exerciseSetupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  exerciseSetupName: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  exerciseSetsBadge: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  exerciseSetsBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  exerciseRemove: {
    padding: 4,
  },
  exerciseRemoveText: {
    fontFamily: Fonts.regular,
    fontSize: 16,
    color: Colors.textTertiary,
  },
  startCTA: {
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
    marginBottom: 32,
  },
  startCTAText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  addSetBelowCard: {
    marginTop: -Spacing.sm,
    marginBottom: Spacing.lg,
    marginHorizontal: Spacing.xs,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderTopWidth: 0,
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
  },
  addSetBelowCardText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.accent,
  },
  restTimer: {
    position: 'absolute',
    bottom: 80,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent,
    zIndex: 100,
  },
  restTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  restTimerCountdown: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.accent,
    fontVariant: ['tabular-nums'],
  },
  restTimerSkip: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  restTimerTrack: {
    marginTop: Spacing.sm,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.divider,
    overflow: 'hidden',
  },
  restTimerFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.accent,
  },
  finishCTAWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    paddingBottom: 32,
    backgroundColor: Colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  finishCTA: {
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishCTADisabled: {
    opacity: 0.4,
  },
  finishCTAText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
  strip: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  stripCell: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  stripLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  stripValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },
  jordanCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  jordanLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  jordanText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  fatigueRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  fatigueBtn: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fatigueBtnActive: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accent,
  },
  fatigueEmoji: {
    fontSize: 24,
  },
  notesInput: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 96,
    textAlignVertical: 'top',
    marginBottom: Spacing.lg,
  },
  saveCTA: {
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  saveCTAText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
});

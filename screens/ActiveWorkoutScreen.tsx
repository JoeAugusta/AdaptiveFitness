// Requires: npx expo install expo-haptics
import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import ExerciseCard from '../components/ExerciseCard';
import type { LoggedSet, Exercise } from '../components/ExerciseCard';
import { Colors, Fonts, FontSizes } from '../constants/design';

const REST_DURATION = 90;

type NavProp = NativeStackNavigationProp<RootStackParamList, 'ActiveWorkout'>;
type RouteType = RouteProp<RootStackParamList, 'ActiveWorkout'>;

const FATIGUE_OPTIONS = [
  { rating: 1, emoji: '😴', label: 'Wiped' },
  { rating: 2, emoji: '😓', label: 'Tired' },
  { rating: 3, emoji: '😊', label: 'Good' },
  { rating: 4, emoji: '💪', label: 'Strong' },
  { rating: 5, emoji: '🔥', label: 'Beast Mode' },
];

const MOCK_WORKOUT = {
  title: 'Push Day A',
  exercises: [
    {
      id: 'ex_bench',
      name: 'Barbell Bench Press',
      muscleGroup: 'Chest',
      sets: [
        { setNumber: 1, targetReps: '8–10', targetWeight: 135, targetRpe: 7 },
        { setNumber: 2, targetReps: '8–10', targetWeight: 135, targetRpe: 7 },
        { setNumber: 3, targetReps: '8–10', targetWeight: 135, targetRpe: 8 },
      ],
      alternatives: ['Incline DB Press', 'Cable Fly', 'Machine Chest Press'],
    },
    {
      id: 'ex_ohp',
      name: 'Overhead Press',
      muscleGroup: 'Shoulders',
      sets: [
        { setNumber: 1, targetReps: '8–10', targetWeight: 75, targetRpe: 7 },
        { setNumber: 2, targetReps: '8–10', targetWeight: 75, targetRpe: 7 },
        { setNumber: 3, targetReps: '8–10', targetWeight: 75, targetRpe: 8 },
      ],
      alternatives: ['DB Shoulder Press', 'Arnold Press', 'Landmine Press'],
    },
    {
      id: 'ex_tricep',
      name: 'Tricep Pushdown',
      muscleGroup: 'Triceps',
      sets: [
        { setNumber: 1, targetReps: '10–12', targetWeight: 50, targetRpe: 7 },
        { setNumber: 2, targetReps: '10–12', targetWeight: 50, targetRpe: 7 },
        { setNumber: 3, targetReps: '10–12', targetWeight: 50, targetRpe: 8 },
      ],
      alternatives: [
        'Skull Crushers',
        'Overhead Tricep Extension',
        'Close-grip Bench',
      ],
    },
  ] satisfies Exercise[],
};

type ExerciseSet = {
  setNumber: number;
  targetReps: string;
  targetWeight: number;
  targetRpe: number;
};

type WorkoutExercise = {
  id: string;
  name: string;
  muscleGroup: string;
  sets: ExerciseSet[];
  alternatives: string[];
};

type WorkoutData = {
  title: string;
  exercises: WorkoutExercise[];
};

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function ActiveWorkoutScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const params = route.params;
  const workoutTitle = params.workoutTitle ?? workout?.title ?? 'Workout';
  const sessionStartedAt = useRef(new Date()).current;

  // Workout data
  const [workout, setWorkout] = useState<WorkoutData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Session state
  const [sets, setSets] = useState<LoggedSet[]>([]);
  const [exerciseSwaps, setExerciseSwaps] = useState<Record<string, string>>(
    {},
  );
  const [coachingNotes, setCoachingNotes] = useState<
    Record<string, string | null>
  >({});
  const [coachingLoading, setCoachingLoading] = useState<
    Record<string, boolean>
  >({});

  // Timers
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [restSeconds, setRestSeconds] = useState(0);
  const [isRestActive, setIsRestActive] = useState(false);

  // Fatigue check-in
  const [showFatigueSheet, setShowFatigueSheet] = useState(false);
  const [fatigueRating, setFatigueRating] = useState<number | null>(null);
  const [sessionNotes, setSessionNotes] = useState('');

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load workout data
  useEffect(() => {
    loadWorkoutData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getAlternatives = (muscleGroup: string): string[] => {
    const map: Record<string, string[]> = {
      Chest: ['Incline DB Press', 'Cable Fly', 'Machine Chest Press'],
      Back: ['Cable Row', 'DB Row', 'Chest-Supported Row'],
      Legs: ['Leg Press', 'Hack Squat', 'DB Lunges'],
      Shoulders: ['DB Shoulder Press', 'Arnold Press', 'Landmine Press'],
      Arms: ['Preacher Curl', 'Hammer Curl', 'Cable Curl'],
      Triceps: ['Overhead Tricep Extension', 'Cable Pushdown', 'Close-grip Bench'],
      Biceps: ['Preacher Curl', 'Hammer Curl', 'Incline DB Curl'],
      Glutes: ['Hip Thrust', 'Cable Kickback', 'Bulgarian Split Squat'],
      Hamstrings: ['Leg Curl', 'Nordic Curl', 'Stiff-leg Deadlift'],
      Calves: ['Seated Calf Raise', 'Leg Press Calf Raise', 'Single-leg Calf Raise'],
      Core: ['Plank', 'Cable Crunch', 'Ab Wheel'],
    };
    return map[muscleGroup] ?? ['Alternative Exercise 1', 'Alternative Exercise 2', 'Alternative Exercise 3'];
  };

  const buildWorkoutFromMock = (): WorkoutData => {
    setIsLoading(false);
    return MOCK_WORKOUT;
  };

  const loadWorkoutData = async () => {
    try {
      if (params.planId === 'mock') {
        setWorkout(buildWorkoutFromMock());
        return;
      }

      const { data: plan, error } = await supabase
        .from('plans')
        .select('plan_json, current_week')
        .eq('id', params.planId)
        .single();

      if (error || !plan) {
        setWorkout(buildWorkoutFromMock());
        return;
      }

      const planJson = plan.plan_json;
      const weekData =
        planJson.weeks?.find(
          (w: { weekNumber: number }) => w.weekNumber === params.weekNumber,
        ) ?? planJson.weeks?.[0];

      if (!weekData) {
        setWorkout(buildWorkoutFromMock());
        return;
      }

      const dayData = weekData.days?.find(
        (d: { dayNumber: number }) => d.dayNumber === params.dayNumber,
      );

      if (!dayData || dayData.type === 'rest') {
        setWorkout(buildWorkoutFromMock());
        return;
      }

      const exercises: WorkoutExercise[] = dayData.exercises.map(
        (ex: {
          id: string;
          name: string;
          muscleGroup: string;
          sets: number;
          reps: string;
          targetWeight: number;
          targetRpe: number;
        }) => ({
          id: ex.id,
          name: ex.name,
          muscleGroup: ex.muscleGroup,
          sets: Array.from({ length: ex.sets }, (_, i) => ({
            setNumber: i + 1,
            targetReps: ex.reps,
            targetWeight: ex.targetWeight,
            targetRpe: ex.targetRpe,
          })),
          alternatives: getAlternatives(ex.muscleGroup),
        }),
      );

      setWorkout({ title: dayData.title, exercises });
    } catch (e) {
      console.error('Failed to load workout:', e);
      setWorkout(buildWorkoutFromMock());
    } finally {
      setIsLoading(false);
    }
  };

  const totalSetsCount = (workout?.exercises ?? []).reduce(
    (sum, ex) => sum + ex.sets.length,
    0,
  );
  const allSetsLogged = sets.length >= totalSetsCount;

  // Elapsed session timer
  useEffect(() => {
    const interval = setInterval(
      () => setElapsedSeconds((s) => s + 1),
      1000,
    );
    return () => clearInterval(interval);
  }, []);

  // Rest countdown timer
  useEffect(() => {
    if (!isRestActive) return;
    if (restSeconds <= 0) {
      setIsRestActive(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    const timeout = setTimeout(
      () => setRestSeconds((s) => s - 1),
      1000,
    );
    return () => clearTimeout(timeout);
  }, [isRestActive, restSeconds]);

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToastMessage(null), 2500);
  };

  const fetchCoachingNote = async (
    exerciseId: string,
    exerciseName: string,
    targetReps: string,
    targetWeight: number,
    targetRpe: number,
    loggedReps: number,
    loggedWeight: number,
    loggedRpe: number | null,
  ) => {
    setCoachingLoading((prev) => ({ ...prev, [exerciseId]: true }));
    try {
      const { data } = await supabase.functions.invoke('coaching-feedback', {
        body: {
          exerciseName,
          targetReps,
          targetWeight,
          targetRpe,
          loggedReps,
          loggedWeight,
          loggedRpe: loggedRpe ?? 'not rated',
        },
      });
      const text = data?.feedback ?? 'Good work — keep it up.';
      setCoachingNotes((prev) => ({ ...prev, [exerciseId]: text }));
    } catch {
      setCoachingNotes((prev) => ({
        ...prev,
        [exerciseId]: 'Good work — keep it up.',
      }));
    } finally {
      setCoachingLoading((prev) => ({ ...prev, [exerciseId]: false }));
    }
  };

  const handleLogSet = (
    exerciseId: string,
    setNumber: number,
    weight: number,
    reps: number,
    rpe: number | null,
  ) => {
    const isSwapped = exerciseSwaps[exerciseId] !== undefined;
    const newSet: LoggedSet = {
      exerciseId,
      setNumber,
      weightLbs: weight,
      reps,
      rpe,
      swapped: isSwapped,
    };

    const newSets = [...sets, newSet];
    setSets(newSets);

    if (newSets.length < totalSetsCount) {
      setRestSeconds(REST_DURATION);
      setIsRestActive(true);
    }

    const exercise = (workout?.exercises ?? []).find(
      (ex) => ex.id === exerciseId,
    );
    if (exercise) {
      const target = exercise.sets.find((s) => s.setNumber === setNumber);
      if (target) {
        const displayName = exerciseSwaps[exerciseId] || exercise.name;
        fetchCoachingNote(
          exerciseId,
          displayName,
          target.targetReps,
          target.targetWeight,
          target.targetRpe,
          reps,
          weight,
          rpe,
        );
      }
    }
  };

  const handleSwapExercise = (exerciseId: string, newName: string) => {
    setExerciseSwaps((prev) => ({ ...prev, [exerciseId]: newName }));
    showToast('Exercise swapped. Your coach will note this.');
  };

  const skipRest = () => {
    setIsRestActive(false);
    setRestSeconds(0);
  };

  const handleBack = () => {
    Alert.alert(
      'End workout early?',
      'Your progress will be saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Workout',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        },
      ],
    );
  };

  const handleSaveAndFinish = async () => {
    if (fatigueRating === null) return;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      await supabase.from('workout_logs').insert({
        user_id: userId,
        plan_id: params.planId,
        week_number: params.weekNumber,
        day_number: params.dayNumber,
        logged_at: new Date().toISOString(),
        session_fatigue_rating: fatigueRating,
        notes: sessionNotes || null,
        sets_json: sets,
      });
    } catch {
      Alert.alert('Error', 'Failed to save workout. Please try again.');
      return;
    }

    setShowFatigueSheet(false);

    const prsHit = sets.filter((s) => {
      const exercise = (workout?.exercises ?? []).find(
        (ex) => ex.id === s.exerciseId,
      );
      const target = exercise?.sets.find(
        (t) => t.setNumber === s.setNumber,
      );
      return target && s.weightLbs > target.targetWeight;
    }).length;

    navigation.navigate('WorkoutComplete', {
      planId: params.planId,
      weekNumber: params.weekNumber,
      dayNumber: params.dayNumber,
      totalSets: sets.length,
      totalExercises: (workout?.exercises ?? []).length,
      durationMinutes: Math.floor(elapsedSeconds / 60),
      fatigueRating,
      prsHit,
    });
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Sticky header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Text style={styles.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.workoutTitle} numberOfLines={1}>
          {workoutTitle}
        </Text>
        <Text style={styles.timerText}>{formatTime(elapsedSeconds)}</Text>
      </View>

      {/* Body */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {(workout?.exercises ?? []).map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            loggedSets={sets.filter((s) => s.exerciseId === exercise.id)}
            swappedName={exerciseSwaps[exercise.id] ?? null}
            coachingNote={coachingNotes[exercise.id] ?? null}
            coachingLoading={coachingLoading[exercise.id] ?? false}
            onLogSet={handleLogSet}
            onSwapExercise={handleSwapExercise}
          />
        ))}
      </ScrollView>

      {/* Bottom bar */}
      {allSetsLogged ? (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.finishButton}
            activeOpacity={0.8}
            onPress={() => setShowFatigueSheet(true)}
          >
            <Text style={styles.finishButtonText}>Finish Workout</Text>
          </TouchableOpacity>
        </View>
      ) : isRestActive ? (
        <View style={styles.bottomBar}>
          <View style={styles.restRow}>
            <Text style={styles.restLabel}>Rest</Text>
            <Text style={styles.restTimer}>{formatTime(restSeconds)}</Text>
          </View>
          <TouchableOpacity onPress={skipRest} activeOpacity={0.7}>
            <Text style={styles.skipRestText}>Skip Rest</Text>
          </TouchableOpacity>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${(restSeconds / REST_DURATION) * 100}%` },
              ]}
            />
          </View>
        </View>
      ) : null}

      {/* Toast */}
      {toastMessage && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      {/* Fatigue check-in */}
      <Modal
        visible={showFatigueSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFatigueSheet(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => setShowFatigueSheet(false)}
        >
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <View style={styles.fatigueSheet}>
          <View style={styles.dragHandle} />
          <Text style={styles.fatigueTitle}>How do you feel?</Text>
          <Text style={styles.fatigueSubtitle}>
            Overall session fatigue
          </Text>

          <View style={styles.emojiRow}>
            {FATIGUE_OPTIONS.map((opt) => {
              const isSelected = fatigueRating === opt.rating;
              return (
                <TouchableOpacity
                  key={opt.rating}
                  activeOpacity={0.7}
                  style={[
                    styles.emojiCard,
                    isSelected && styles.emojiCardSelected,
                  ]}
                  onPress={() => setFatigueRating(opt.rating)}
                >
                  <Text style={styles.emoji}>{opt.emoji}</Text>
                  <Text
                    style={[
                      styles.emojiLabel,
                      isSelected && styles.emojiLabelSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            style={styles.notesInput}
            placeholder="Any notes for your coach? (optional)"
            placeholderTextColor={Colors.textSecondary}
            value={sessionNotes}
            onChangeText={setSessionNotes}
            multiline
            numberOfLines={3}
            maxLength={500}
          />

          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.saveButton,
              fatigueRating === null && styles.saveButtonDisabled,
            ]}
            onPress={handleSaveAndFinish}
            disabled={fatigueRating === null}
          >
            <Text
              style={[
                styles.saveButtonText,
                fatigueRating === null && styles.saveButtonTextDisabled,
              ]}
            >
              Save & Finish
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: Colors.bgPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bgCard,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.heading1, color: Colors.textPrimary, marginTop: -2 },
  workoutTitle: {
    flex: 1,
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold, 
    color: Colors.textPrimary,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  timerText: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.semiBold, 
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  /* Scroll */
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 140 },

  /* Bottom bar */
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.bgCard,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  restRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  restLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption, color: Colors.textSecondary },
  restTimer: {
    fontSize: FontSizes.display,
    fontFamily: Fonts.bold, 
    color: Colors.accent,
    fontVariant: ['tabular-nums'],
  },
  skipRestText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.bgPrimary,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
  finishButton: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  finishButtonText: { fontSize: FontSizes.title, fontFamily: Fonts.semiBold,  color: Colors.textPrimary },

  /* Toast */
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 24,
    right: 24,
    backgroundColor: Colors.divider,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  toastText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption, color: Colors.textPrimary },

  /* Fatigue sheet */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }, // TODO: map to design token
  fatigueSheet: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.divider,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  fatigueTitle: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold, 
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  fatigueSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 20,
  },
  emojiCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.bgPrimary,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emojiCardSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentMuted,
  },
  emoji: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.display, marginBottom: 4 },
  emojiLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro, color: Colors.textSecondary, textAlign: 'center' },
  emojiLabelSelected: { color: Colors.textPrimary },
  notesInput: {
    fontFamily: Fonts.regular,
    backgroundColor: Colors.bgPrimary,
    borderRadius: 12,
    padding: 14,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  saveButton: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: { backgroundColor: Colors.divider },
  saveButtonText: { fontSize: FontSizes.title, fontFamily: Fonts.semiBold,  color: Colors.textPrimary },
  saveButtonTextDisabled: { color: Colors.textSecondary },
});

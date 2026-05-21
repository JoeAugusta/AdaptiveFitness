import { useState, Fragment, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import {
  deriveAdaptationReason,
  type AdaptationReason,
  SIGNAL_COLOR_KEY,
  SIGNAL_ICON,
  type LastWeekData,
  type AdaptationExtras,
} from '../utils/adaptationReason';
import { isStrengthProgramTargetLiftExercise } from '../utils/strengthGoalLift';
import { useMetric, formatTrendDeltaLbs } from '../utils/units';
import { hapticLight, hapticMedium, hapticPR } from '../utils/haptics';
import { RPEReferenceSheet } from './RPEReferenceSheet';
import ExerciseEducationModal from './ExerciseEducationModal';

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
  /** When set, overrides `name` for library-style matching (optional) */
  exerciseName?: string;
  /** From exercise library — drives bodyweight vs loaded UI with `usesWeight` */
  equipment?: string;
  muscleGroup: string;
  usesWeight?: boolean;
  isUnilateral?: boolean;
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
  /** Selection reasoning from plan_json (GAP-6) */
  coachingNote?: string;
  /** Denormalized rep prescription (usually matches first set) */
  reps?: string;
  /** Prescribed RPE anchor from plan_json (adaptation sheet & session summary) */
  targetRpe?: number;
  /** Per generate-plan — pyramid uses independent weights per set */
  setStructure?: 'straight' | 'pyramid' | 'wave';
  /** W2+ pyramid: per-set targets from generate-next-week (plan keeps `sets` as count on server) */
  setTargets?: SetTarget[];
  sets: SetTarget[];
  alternatives: string[];
  /** From plan / library — three form cues; optional for legacy payloads */
  cues?: string[];
  /** P3-C1 fatigue adjustment — drives adaptation copy */
  adjustedBySignal?: string;
}

function shouldShowWarmups(exercise: any): boolean {
  const name = (
    exercise.exerciseName ?? exercise.name ?? ''
  ).toLowerCase();
  const equipment = (exercise.equipment ?? '').toLowerCase();
  const tier = (exercise.compoundTier ?? '').toLowerCase();
  const targetWeight = exercise.targetWeight ?? 0;

  // Derive equipment from name if missing
  const inferredEquipment = (() => {
    if (!equipment) {
      if (
        name.includes('barbell') ||
        name.includes('squat') ||
        name.includes('deadlift') ||
        name.includes('bench press') ||
        name.includes('overhead press') ||
        name.includes('row') ||
        name.includes('curl') ||
        name.includes('good morning')
      ) {
        return 'barbell';
      }
      if (name.includes('dumbbell') || name.includes('db ')) {
        return 'dumbbell';
      }
      if (name.includes('cable')) return 'cable';
      if (
        name.includes('machine') ||
        name.includes('leg press') ||
        name.includes('lat pulldown') ||
        name.includes('seated row')
      ) {
        return 'machine';
      }
      if (
        name.includes('pull-up') ||
        name.includes('pullup') ||
        name.includes('dip') ||
        name.includes('push-up')
      ) {
        return 'bodyweight';
      }
    }
    return equipment;
  })();

  // NEVER show warmups for:
  if (inferredEquipment === 'cable') return false;
  if (inferredEquipment === 'machine') return false;
  if (inferredEquipment === 'bodyweight') return false;

  // ALWAYS show warmups for barbell compounds:
  if (
    inferredEquipment === 'barbell' &&
    (tier === 'primary_compound' ||
      tier === 'secondary_compound' ||
      name.includes('squat') ||
      name.includes('deadlift') ||
      name.includes('bench') ||
      name.includes('row') ||
      name.includes('overhead press') ||
      name.includes('good morning'))
  ) {
    return true;
  }

  // Barbell isolation (curls etc): weight-dependent
  if (inferredEquipment === 'barbell') return targetWeight >= 50;

  // Dumbbell compounds: weight-dependent
  if (
    inferredEquipment === 'dumbbell' &&
    (tier === 'primary_compound' ||
      tier === 'secondary_compound' ||
      name.includes('press') ||
      name.includes('row'))
  ) {
    return targetWeight >= 40;
  }

  // Dumbbell isolation: weight-dependent
  if (inferredEquipment === 'dumbbell') return targetWeight >= 30;

  // Name-based fallbacks when equipment truly unknown:
  if (name.includes('curl') && targetWeight >= 50) return true;
  if (name.includes('press') && targetWeight >= 30) return true;

  return false;
}

export interface LoggedSet {
  exerciseId: string;
  /** Present when logs were saved with display name (legacy id mismatch fallback) */
  exerciseName?: string;
  setNumber: number;
  weightLbs: number;
  reps: number;
  rpe: number | null;
  swapped: boolean;
}

function getLastWeekPills(
  sets: LoggedSet[],
  isUnilateral: boolean,
  formatW: (lbs: number) => string,
): string[] {
  const sortedSets = [...sets].sort((a, b) => a.setNumber - b.setNumber);
  const suffix = isUnilateral ? ' ea' : '';
  return sortedSets.map((s) => {
    const w = s.weightLbs === 0 ? 'BW' : formatW(s.weightLbs);
    return `${w}×${s.reps ?? 0}${suffix}`;
  });
}

function getLastWeekAvgRpe(sets: LoggedSet[]): string | null {
  const sortedSets = [...sets].sort((a, b) => a.setNumber - b.setNumber);
  const rpeVals = sortedSets.filter((s) => s.rpe != null && s.rpe > 0).map((s) => s.rpe!);
  if (rpeVals.length === 0) return null;
  const avg = rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length;
  return avg.toFixed(1);
}

function getLastWeekBestSet(sets: LoggedSet[], formatW: (lbs: number) => string): string {
  if (!sets.length) return '';
  const sortedSets = [...sets].sort((a, b) => a.setNumber - b.setNumber);
  const best = sortedSets.reduce((p, c) => ((c.weightLbs ?? 0) > (p.weightLbs ?? 0) ? c : p));
  const w = best.weightLbs === 0 ? 'BW' : formatW(best.weightLbs);
  return `${w}×${best.reps ?? 0}`;
}

function rpeValueColor(rpe: number) {
  if (rpe >= 1 && rpe <= 4) return Colors.success;
  if (rpe >= 5 && rpe <= 7) return Colors.warning;
  return Colors.danger;
}

function isTimedExercise(repsValue: any): boolean {
  const repsString = String(repsValue ?? '');
  return repsString.trim().toLowerCase().includes('sec') ||
         repsString.trim().toLowerCase().includes('min');
}

function getAdaptationSignalColor(signal: AdaptationReason['signal']) {
  switch (SIGNAL_COLOR_KEY[signal]) {
    case 'success':
      return Colors.success;
    case 'danger':
      return Colors.danger;
    case 'warning':
      return Colors.warning;
    case 'accent':
      return Colors.accent;
    case 'textSecondary':
      return Colors.textSecondary;
    default:
      return Colors.accent;
  }
}

function parseTimedDuration(repsValue: any): number {
  const repsString = String(repsValue ?? '');
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
  /**
   * True only when this card is the first exercise across the whole session
   * that still has unlogged sets. Controlled by ActiveWorkoutScreen — never
   * derived per-card — so the green active highlight cannot bleed onto
   * subsequent cards before preceding exercises are complete.
   */
  isActiveCard?: boolean;
  /** Plan week — affects self-select coach copy when no prescribed weight */
  weekNumber?: number;
  /** From plan_json.goal */
  goal?: PlanGoalType;
  /** From plan_json.goalLift / targetLift — strength primary lift id */
  programGoalLift?: string | null;
  experience?: 'beginner' | 'intermediate' | 'advanced';
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
  isActiveCard = false,
  weekNumber = 1,
  goal = 'strength',
  programGoalLift = null,
  experience: _experience = 'intermediate',
  onLogSet,
  onSwapExercise,
}: ExerciseCardProps) {
  const { lbsToDisplay, displayToLbs, formatWorkoutWeight, isMetric } = useMetric();

  const displayName = swappedName || exercise.name;
  const exerciseNameLower = (
    exercise.exerciseName ??
    exercise.name ??
    ''
  ).toLowerCase();
  const isWeightedVariant = exerciseNameLower.includes('weighted');
  const isBodyweightExercise =
    (exercise.equipment === 'bodyweight' ||
      (exercise.equipment === undefined && exercise.usesWeight === false)) &&
    !isWeightedVariant;
  const tw =
    exercise.targetWeight ?? exercise.sets[0]?.targetWeight ?? 0;
  const isSelfSelectMode =
    !isBodyweightExercise && tw === 0 && goal !== 'strength';

  const repsForWarmup =
    String(exercise.reps ?? exercise.sets[0]?.targetReps ?? '');

  const [enteredWeight, setEnteredWeight] = useState(0);
  const [set1EnteredWeight, setSet1EnteredWeight] = useState(0);
  /** W1 self-select (Mode A): warm-up % track Set 1 input only; reset per exercise. */
  const [reactiveWarmupBase, setReactiveWarmupBase] = useState(0);
  /** Per-card UI only — resets when `exercise.id` changes (new session / navigation). */
  const [warmupSectionExpanded, setWarmupSectionExpanded] = useState(true);

  const coachingSkelOpacity = useRef(new Animated.Value(0)).current;
  const coachingContentOpacity = useRef(new Animated.Value(0)).current;
  const coachingPulseOpacity = useRef(new Animated.Value(1)).current;
  const coachingPulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    setEnteredWeight(0);
    setSet1EnteredWeight(0);
    setReactiveWarmupBase(0);
    setWarmupSectionExpanded(true);
  }, [exercise.id]);

  useLayoutEffect(() => {
    if (coachingLoading) {
      coachingSkelOpacity.setValue(1);
      coachingContentOpacity.setValue(0);
    }
  }, [coachingLoading, coachingSkelOpacity, coachingContentOpacity]);

  useEffect(() => {
    if (!coachingLoading) {
      coachingPulseLoopRef.current?.stop();
      coachingPulseLoopRef.current = null;
      return;
    }
    coachingPulseOpacity.setValue(1);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(coachingPulseOpacity, {
          toValue: 0.4,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(coachingPulseOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    coachingPulseLoopRef.current = loop;
    loop.start();
    return () => {
      loop.stop();
      coachingPulseLoopRef.current = null;
    };
  }, [coachingLoading, coachingPulseOpacity]);

  useEffect(() => {
    if (coachingLoading || !coachingNote) return;
    Animated.parallel([
      Animated.timing(coachingSkelOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(coachingContentOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [coachingLoading, coachingNote, coachingSkelOpacity, coachingContentOpacity]);

  const isFrozenWarmupMode =
    (exercise.targetWeight ?? 0) > 0 ||
    (exercise.setTargets != null && exercise.setTargets.length > 0);

  /** Mode B (W2+): frozen at mount. Mode A uses reactiveWarmupBase from Set 1 only. */
  const frozenWarmupBase = useMemo(() => {
    if (
      exercise.setStructure === 'pyramid' &&
      exercise.setTargets != null &&
      exercise.setTargets.length > 0
    ) {
      return exercise.setTargets[0].targetWeight;
    }
    return exercise.targetWeight ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: snapshot on mount only
  }, []);

  const warmupBaseWeight = isFrozenWarmupMode
    ? frozenWarmupBase
    : reactiveWarmupBase;

  const wantsWarmupByRule = shouldShowWarmups(exercise);

  useEffect(() => {
    if (__DEV__) {
      console.log('[warmup]', {
        name: exercise.name,
        warmupBaseWeight,
        wantsWarmupByRule,
      });
    }
  }, [exercise.name, warmupBaseWeight, wantsWarmupByRule]);

  const warmupSets = useMemo(
    () => (wantsWarmupByRule ? calculateWarmupSets(warmupBaseWeight) : []),
    [wantsWarmupByRule, warmupBaseWeight],
  );

  const showWarmup =
    wantsWarmupByRule && warmupSets.length > 0 && warmupSectionExpanded;

  const [inputValues, setInputValues] = useState<
    Record<number, { weight: string; reps: string; rpe: number | null }>
  >({});
  const [rpeExpandedSet, setRpeExpandedSet] = useState<number | null>(null);
  const [showRpeReference, setShowRpeReference] = useState(false);
  const [showCoachingSheet, setShowCoachingSheet] = useState(false);
  const [showSwapSheet, setShowSwapSheet] = useState(false);
  const [showAdaptationSheet, setShowAdaptationSheet] = useState(false);
  const [showEducation, setShowEducation] = useState(false);
  const [adaptationReason, setAdaptationReason] = useState<AdaptationReason | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [trendBySet, setTrendBySet] = useState<Record<number, { text: string; color: string }>>({});
  const trendTimeouts = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const getDefaultInput = (setNumber: number) => {
    const target = exercise.sets.find((s) => s.setNumber === setNumber);
    const isPyramid = exercise.setStructure === 'pyramid';

    const setTarget = exercise.setTargets?.find(
      (st) => st.setNumber === setNumber,
    );
    const perSetTargetWeight = setTarget?.targetWeight ?? 0;

    const exerciseTopSetWeight =
      exercise.targetWeight ?? exercise.sets[0]?.targetWeight ?? 0;

    const isWeek1SelfSelect = isPyramid && exerciseTopSetWeight === 0;

    const loggedWeights = [...loggedSets]
      .sort((a, b) => a.setNumber - b.setNumber)
      .filter((s) => s.weightLbs > 0)
      .map((s) => s.weightLbs);
    const isLoggingAscending =
      loggedWeights.length >= 2 &&
      loggedWeights.every(
        (w, i) => i === 0 || w >= loggedWeights[i - 1]!,
      ) &&
      loggedWeights[loggedWeights.length - 1]! > loggedWeights[0]!;

    const pyramidPrefill = (() => {
      if (!isPyramid) return 0;
      if (isWeek1SelfSelect) return 0;
      if (perSetTargetWeight > 0) return perSetTargetWeight;
      return exerciseTopSetWeight;
    })();

    const lastLogged =
      !isPyramid && !isLoggingAscending && loggedSets.length > 0
        ? loggedSets[loggedSets.length - 1]!
        : null;

    return {
      weight: lastLogged
        ? String(lbsToDisplay(lastLogged.weightLbs))
        : isBodyweightExercise
          ? '0'
          : (isSelfSelectMode || isLoggingAscending || isWeek1SelfSelect)
            ? ''
            : pyramidPrefill > 0
              ? String(lbsToDisplay(pyramidPrefill))
              : String(lbsToDisplay(target?.targetWeight ?? 0)),
      reps: (() => {
        if (setTarget?.targetReps) {
          return isTimedExercise(setTarget.targetReps)
            ? String(parseTimedDuration(setTarget.targetReps))
            : String(setTarget.targetReps ?? '')
              .split(/[–\-]/)[0]!
              .trim();
        }
        if (!target) return '';
        return isTimedExercise(target.targetReps)
          ? String(parseTimedDuration(target.targetReps))
          : String(target.targetReps ?? '')
            .split(/[–\-]/)[0]!
            .trim();
      })(),
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
    if (field === 'weight' && setNumber === 1) {
      const parsed = parseFloat(value) || 0;
      setSet1EnteredWeight(parsed);
      if (!isFrozenWarmupMode) {
        setReactiveWarmupBase(isBodyweightExercise ? 0 : displayToLbs(parsed));
      }
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

  const activeWorkingSetIndex = useMemo(() => {
    // Active set = first set that has NOT been logged yet.
    // This never advances until the user taps ✓ — typing does
    // not change the active highlight.
    return exercise.sets.findIndex(
      (t) => !loggedSets.some((s) => s.setNumber === t.setNumber),
    );
  }, [exercise.sets, loggedSets]);

  const canLogSet = (setNumber: number) => {
    if (isSetLogged(setNumber)) return false;
    const input = getInputForSet(setNumber);
    const wDisplay = parseFloat(input.weight);
    const weightLbs = isBodyweightExercise ? 0 : displayToLbs(wDisplay);
    const reps = parseInt(input.reps, 10);
    if (isNaN(reps) || reps <= 0) return false;
    if (isBodyweightExercise) return true;
    return !isNaN(weightLbs) && weightLbs > 0;
  };

  const handleLogSet = (setNumber: number) => {
    const input = getInputForSet(setNumber);
    const weightLbs = isBodyweightExercise ? 0 : displayToLbs(parseFloat(input.weight));
    const reps = parseInt(input.reps, 10);
    if (isNaN(reps) || reps <= 0) return;
    if (!isBodyweightExercise && (isNaN(weightLbs) || weightLbs <= 0)) return;
    onLogSet(exercise.id, setNumber, weightLbs, reps, input.rpe);

    const lastWeekSameSet = previousSets.find((s) => s.setNumber === setNumber);
    if (!lastWeekSameSet) {
      void hapticMedium();
      return;
    }

    const lastWeight = lastWeekSameSet.weightLbs ?? 0;
    const lastReps = lastWeekSameSet.reps ?? 0;
    let trend: { text: string; color: string } | null = null;

    if (lastWeight === 0 && weightLbs === 0) {
      trend = null;
    } else if (lastWeight === 0 && weightLbs > 0) {
      trend = {
        text: `First weighted session — baseline set at ${formatWorkoutWeight(weightLbs)}`,
        color: Colors.accent,
      };
    } else if (weightLbs > lastWeight) {
      trend = {
        text: `↑ ${formatTrendDeltaLbs(weightLbs - lastWeight, isMetric)} more than last week`,
        color: Colors.success,
      };
    } else if (weightLbs === lastWeight && reps > lastReps) {
      trend = { text: `↑ ${reps - lastReps} more reps than last week`, color: Colors.success };
    } else if (weightLbs === lastWeight && reps === lastReps) {
      trend = { text: '= Same as last week', color: Colors.textSecondary };
    } else if (weightLbs < lastWeight) {
      trend = {
        text: `↓ ${formatTrendDeltaLbs(lastWeight - weightLbs, isMetric)} less than last week`,
        color: Colors.warning,
      };
    }

    const isPR =
      !(
        lastWeight === 0 &&
        weightLbs > 0
      ) &&
      (weightLbs > lastWeight ||
        (weightLbs === lastWeight && reps > lastReps));

    if (isPR) void hapticPR();
    else void hapticMedium();

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
  const rawReps = String(exercise.reps ?? firstTarget?.targetReps ?? '');
  const eachSideSuffix = exercise.isUnilateral ? ' each side' : '';
  const repsSubtitlePart = firstTargetIsTimed
    ? `${firstTargetDuration} sec`
    : `${rawReps}${eachSideSuffix}`;
  const displayWeight = (() => {
    const targets = exercise.setTargets;
    if (
      exercise.setStructure === 'pyramid' &&
      Array.isArray(targets) &&
      targets.length > 0
    ) {
      return Math.max(0, ...targets.map((t) => t.targetWeight ?? 0));
    }
    return exercise.targetWeight ?? firstTarget?.targetWeight ?? 0;
  })();
  const targetSummary =
    firstTarget != null
      ? isSelfSelectMode
        ? `${exercise.sets.length} sets × ${repsSubtitlePart} — choose load for RPE target`
        : isBodyweightExercise
          ? `${exercise.sets.length} sets × ${repsSubtitlePart} @ Bodyweight`
          : `${exercise.sets.length} sets × ${repsSubtitlePart} @ ${
              displayWeight > 0 ? formatWorkoutWeight(displayWeight) : 'Add weight'
            }`
      : '';

  const strengthBlockLabel =
    goal === 'strength' &&
    programGoalLift != null &&
    String(programGoalLift).trim() !== '' &&
    isStrengthProgramTargetLiftExercise(exercise, programGoalLift) &&
    firstTarget != null
      ? `${exercise.sets.length}×${repsSubtitlePart}`
      : undefined;

  const prescribedDisplayWeight = displayWeight;

  useEffect(() => {
    if (!prescribedDisplayWeight || prescribedDisplayWeight === 0) {
      setAdaptationReason(null);
      return;
    }

    let lastWeekData: LastWeekData | null = null;
    if (previousSets.some((s) => Number(s.weightLbs ?? 0) > 0)) {
      lastWeekData = {
        avgWeightLbs: 0,
        avgRpe: 0,
        targetRpe: firstTarget?.targetRpe ?? 8,
        targetWeightLbs: prescribedDisplayWeight,
      };
    }

    const extras: AdaptationExtras = {
      isStrengthProgramTargetLift:
        goal === 'strength' &&
        programGoalLift != null &&
        String(programGoalLift).trim() !== '' &&
        isStrengthProgramTargetLiftExercise(exercise, programGoalLift),
      currentRepsPrescription:
        String(exercise.reps ?? exercise.sets[0]?.targetReps ?? ''),
      strengthBlockLabel,
    };

    setAdaptationReason(
      deriveAdaptationReason(
        exercise.name,
        prescribedDisplayWeight,
        typeof exercise.targetRpe === 'number' && Number.isFinite(exercise.targetRpe)
          ? exercise.targetRpe
          : (firstTarget?.targetRpe ?? 8),
        weekNumber,
        lastWeekData,
        exercise.adjustedBySignal,
        previousSets,
        exercise.setStructure,
        isMetric,
        goal,
        exercise.sets.length,
        extras,
      ),
    );
  }, [
    previousSets,
    exercise.targetWeight,
    exercise.name,
    exercise.targetRpe,
    exercise.reps,
    exercise.adjustedBySignal,
    exercise.sets,
    exercise.setStructure,
    exercise.setTargets,
    weekNumber,
    firstTarget?.targetRpe,
    prescribedDisplayWeight,
    programGoalLift,
    isMetric,
    goal,
    strengthBlockLabel,
  ]);

  const showTappableTargetWeight =
    !isSelfSelectMode &&
    !isBodyweightExercise &&
    prescribedDisplayWeight > 0 &&
    firstTarget != null;

  const showSelfSelectWarmupHint =
    isSelfSelectMode &&
    enteredWeight <= 0 &&
    !(wantsWarmupByRule && warmupSets.length > 0);

  const showCoachingBlock =
    loggedSets.length > 0 && (coachingNote != null || coachingLoading);
  useEffect(() => {
    if (!showCoachingBlock && showCoachingSheet) {
      setShowCoachingSheet(false);
    }
  }, [showCoachingBlock, showCoachingSheet]);
  const lastWeekPillLabels = useMemo(
    () => getLastWeekPills(previousSets, !!exercise.isUnilateral, formatWorkoutWeight),
    [previousSets, exercise.isUnilateral, formatWorkoutWeight],
  );
  const lastWeekBestStr = useMemo(
    () => getLastWeekBestSet(previousSets, formatWorkoutWeight),
    [previousSets, formatWorkoutWeight],
  );
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
          <View style={styles.cardHeaderTitleBlock}>
            <Text
              style={styles.exerciseName}
              numberOfLines={2}
              adjustsFontSizeToFit={false}
            >
              {displayName}
            </Text>
          </View>
          <View style={styles.cardHeaderTagsRow}>
            <View style={styles.muscleTag}>
              <Text style={styles.muscleTagText}>{exercise.muscleGroup}</Text>
            </View>
            {exercise.setStructure === 'pyramid' ? (
              <View style={styles.pyramidBadge}>
                <Text style={styles.pyramidBadgeText}>PYRAMID</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {isSelfSelectMode ? (
        <View style={styles.selfSelectStrip}>
          <View style={styles.selfSelectStripRow}>
            <View style={styles.selfSelectJCircle}>
              <Text style={styles.selfSelectJLetter}>J</Text>
            </View>
            <View style={styles.jordanNoteTextColumn}>
              <Text style={styles.jordanNoteText}>
                {exercise.coachingNote ||
                  'Week 1 baseline — log your honest effort after each set.'}
              </Text>
              {weekNumber === 1 &&
                (!exercise.targetWeight || exercise.targetWeight === 0) && (
                  <Text style={styles.jordanNoteSubtext}>
                    {`Pick a weight that lands at RPE ${firstTargetRpe} — I'll program Week 2 from your actual numbers.`}
                  </Text>
                )}
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.targetLineRow}>
        {targetSummary ? (
          showTappableTargetWeight ? (
            <View style={[styles.targetLineFlex, styles.targetLineTappableRow]}>
              <Text style={styles.targetLine} numberOfLines={3}>
                {exercise.sets.length} sets × {repsSubtitlePart} @{' '}
              </Text>
              <TouchableOpacity
                onPress={() => setShowAdaptationSheet(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Why this target weight"
              >
                <Text style={styles.targetWeightTappable}>
                  {formatWorkoutWeight(prescribedDisplayWeight)} ⓘ
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={[styles.targetLine, styles.targetLineFlex]} numberOfLines={3}>
              {targetSummary}
            </Text>
          )
        ) : (
          <View style={styles.targetLineFlex} />
        )}
        <TouchableOpacity
          onPress={() => setShowRpeReference(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="What is RPE?"
        >
          <Text style={styles.rpeHelpLink}>RPE ?</Text>
        </TouchableOpacity>
      </View>
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

      {wantsWarmupByRule && warmupSets.length > 0 ? (
        <View style={styles.warmupSection}>
          <TouchableOpacity
            style={styles.warmupHeaderRow}
            activeOpacity={0.7}
            onPress={() => {
              void hapticLight();
              setWarmupSectionExpanded((v) => !v);
            }}
          >
            <Text style={styles.warmupHeaderLabel}>
              WARM-UP SETS {warmupSectionExpanded ? '↑' : '↓'}
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
                    <Text style={styles.warmupWeight}>{formatWorkoutWeight(ws.weightLbs)}</Text>
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
        </View>
      ) : null}

      {showSelfSelectWarmupHint ? (
        <Text style={styles.warmupEntryHint}>
          💡 Enter a weight to see your warm-up sets
        </Text>
      ) : null}

      <TouchableOpacity
        onPress={() => {
          void hapticLight();
          setShowEducation(true);
        }}
        activeOpacity={0.7}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        accessibilityRole="button"
        accessibilityLabel="How to perform this exercise"
      >
        <Text style={styles.howToLink}>How To →</Text>
      </TouchableOpacity>

      {wantsWarmupByRule && warmupSets.length > 0 ? (
        <View style={styles.workingSetsDividerWrap}>
          <View style={styles.workingSetsDividerLine} />
          <View style={styles.workingSetsDividerLabelBg}>
            <Text style={styles.workingSetsDividerLabel}>WORKING SETS</Text>
          </View>
          <View style={styles.workingSetsDividerLine} />
        </View>
      ) : null}

      {exercise.sets.map((set, setIdx) => {
        const logged = isSetLogged(set.setNumber);
        const loggedData = getLoggedSet(set.setNumber);
        const input = getInputForSet(set.setNumber);
        const timedSet = isTimedExercise(set.targetReps);
        const timedDuration = parseTimedDuration(set.targetReps);
        const isFirstWorkingAfterWarmup =
          setIdx === 0 && wantsWarmupByRule && warmupSets.length > 0;
        // BUG-7: Active highlight now derived from first exercise with remaining
        // unlogged sets. Cannot bleed onto next exercise until previous is complete.
        const isActiveRow =
          isActiveCard &&
          !logged &&
          activeWorkingSetIndex >= 0 &&
          setIdx === activeWorkingSetIndex;

        return (
          <Fragment key={set.setNumber}>
            <View
              style={[
                styles.setRow,
                logged && styles.setRowLogged,
                isActiveRow && styles.setRowActive,
                isFirstWorkingAfterWarmup && styles.setRowFirstWorking,
              ]}
            >
              <View style={styles.setBadge}>
                <Text style={styles.setBadgeText}>{set.setNumber}</Text>
              </View>

              {logged && loggedData ? (
                <>
                  <Text style={styles.loggedWeight}>
                    {loggedData.weightLbs > 0 ? formatWorkoutWeight(loggedData.weightLbs) : 'BW'}
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
                      void hapticLight();
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
        <TouchableOpacity
          style={[
            styles.coachingCardBase,
            coachingLoading ? styles.coachingCardLoading : styles.coachingCardReady,
          ]}
          activeOpacity={0.85}
          onPress={() => setShowCoachingSheet(true)}
        >
          <Text style={styles.coachingJordan}>JORDAN</Text>
          <View style={styles.coachingBodySlot}>
            <Animated.View
              pointerEvents="none"
              style={[styles.coachingSkelAbs, { opacity: coachingSkelOpacity }]}
            >
              <Animated.View style={{ opacity: coachingPulseOpacity }}>
                <View style={styles.coachingSkelLine1} />
                <View style={styles.coachingSkelLine2} />
              </Animated.View>
            </Animated.View>
            <Animated.View
              style={[styles.coachingContentWrap, { opacity: coachingContentOpacity }]}
            >
              {coachingNote ? (
                <Text style={styles.coachingNoteText}>{coachingNote}</Text>
              ) : null}
            </Animated.View>
          </View>
        </TouchableOpacity>
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
          <View style={styles.coachSheetBodyArea}>
            <Animated.View
              pointerEvents="none"
              style={[styles.coachingSkelAbs, { opacity: coachingSkelOpacity }]}
            >
              <View style={styles.coachSheetSkelCard}>
                <Animated.View style={{ opacity: coachingPulseOpacity }}>
                  <View style={styles.coachingSkelLine1} />
                  <View style={styles.coachingSkelLine2} />
                </Animated.View>
              </View>
            </Animated.View>
            <Animated.View
              style={[styles.coachSheetContentWrap, { opacity: coachingContentOpacity }]}
            >
              {coachingNote ? (
                <Text style={styles.coachSheetBody}>{coachingNote}</Text>
              ) : !coachingLoading ? (
                <Text style={styles.coachSheetBody}>
                  Complete a set to receive coaching feedback.
                </Text>
              ) : null}
            </Animated.View>
          </View>
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

      <Modal
        visible={showAdaptationSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdaptationSheet(false)}
      >
        <View style={styles.adaptSheetRoot}>
          <TouchableOpacity
            style={styles.adaptSheetBackdrop}
            activeOpacity={1}
            onPress={() => setShowAdaptationSheet(false)}
          />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetJordanRow}>
              <View style={styles.sheetJordanAvatar}>
                <Text style={styles.sheetJordanAvatarText}>J</Text>
              </View>
              <Text style={styles.sheetJordanLabel}>JORDAN</Text>
            </View>

            {adaptationReason ? (
              <>
                <View style={styles.sheetHeadlineRow}>
                  <Text
                    style={[
                      styles.sheetSignalIcon,
                      { color: getAdaptationSignalColor(adaptationReason.signal) },
                    ]}
                  >
                    {SIGNAL_ICON[adaptationReason.signal]}
                  </Text>
                  <Text style={styles.sheetHeadline}>
                    {adaptationReason.headline}
                  </Text>
                </View>

                <Text style={styles.sheetDetail}>{adaptationReason.detail}</Text>
              </>
            ) : null}

            <View style={styles.sheetContextRow}>
              <Text style={styles.sheetContextLabel}>THIS SESSION</Text>
              <Text style={styles.sheetContextValue}>
                {adaptationReason?.sessionContextValue != null &&
                adaptationReason.sessionContextValue !== ''
                  ? adaptationReason.sessionContextValue
                  : `${formatWorkoutWeight(prescribedDisplayWeight)} × ${rawReps} reps @ RPE ${
                      typeof exercise.targetRpe === 'number' &&
                      Number.isFinite(exercise.targetRpe)
                        ? exercise.targetRpe
                        : (firstTarget?.targetRpe ?? '—')
                    }`}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.sheetCloseButton}
              onPress={() => setShowAdaptationSheet(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.sheetCloseText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <RPEReferenceSheet
        visible={showRpeReference}
        onClose={() => setShowRpeReference(false)}
      />

      <ExerciseEducationModal
        visible={showEducation}
        onClose={() => setShowEducation(false)}
        exerciseName={exercise.name}
      />
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
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
  },
  cardHeaderLeft: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: Spacing.sm,
    minWidth: 0,
  },
  cardHeaderTitleBlock: {
    alignSelf: 'stretch',
    width: '100%',
  },
  cardHeaderTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexWrap: 'wrap',
    marginTop: Spacing.xs,
  },
  exerciseName: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  muscleTag: {
    marginRight: Spacing.sm,
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
  pyramidBadge: {
    backgroundColor: Colors.warningMuted,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pyramidBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.warning,
  },
  targetLineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  targetLine: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  targetLineFlex: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  targetLineTappableRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  targetWeightTappable: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.accent,
    textDecorationLine: 'underline',
  },
  adaptSheetRoot: {
    flex: 1,
    backgroundColor: Colors.overlay,
  },
  adaptSheetBackdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  sheetJordanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  sheetJordanAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetJordanAvatarText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.textPrimary,
  },
  sheetJordanLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
  },
  sheetHeadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sheetSignalIcon: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
  },
  sheetHeadline: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  sheetDetail: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  sheetContextRow: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  sheetContextLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  sheetContextValue: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  sheetCloseButton: {
    height: 48,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sheetCloseText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  rpeHelpLink: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.semiBold,
    color: Colors.accent,
    textDecorationLine: 'underline',
    paddingTop: 1,
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
  jordanNoteTextColumn: {
    flex: 1,
  },
  jordanNoteText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
  },
  jordanNoteSubtext: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  warmupEntryHint: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  howToLink: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.semiBold,
    color: Colors.accentBorder,
    textDecorationLine: 'underline',
    marginTop: Spacing.xs,
    alignSelf: 'flex-start',
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
    paddingRight: 2,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  setRowActive: {
    backgroundColor: Colors.successMuted,
    borderRadius: Radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.success,
    paddingLeft: 4,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bgElevated,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  completionCircleReady: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentMuted,
  },
  completionCircleDone: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
  coachingCardBase: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderLeftWidth: 3,
    overflow: 'hidden',
  },
  coachingCardLoading: {
    backgroundColor: Colors.bgCard,
    borderLeftColor: Colors.accentBorder,
  },
  coachingCardReady: {
    backgroundColor: Colors.accentMuted,
    borderLeftColor: Colors.accent,
  },
  coachingBodySlot: {
    position: 'relative',
    minHeight: 40,
  },
  coachingSkelAbs: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  coachingContentWrap: {
    minHeight: 40,
  },
  coachingSkelLine1: {
    width: '80%',
    height: 12,
    backgroundColor: Colors.bgElevated,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  coachingSkelLine2: {
    width: '55%',
    height: 12,
    backgroundColor: Colors.bgElevated,
    borderRadius: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
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
  coachSheetBodyArea: {
    marginTop: Spacing.md,
    position: 'relative',
    minHeight: 56,
  },
  coachSheetSkelCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accentBorder,
    padding: Spacing.md,
  },
  coachSheetContentWrap: {
    minHeight: 40,
  },
  coachSheetBody: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
    lineHeight: 22,
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

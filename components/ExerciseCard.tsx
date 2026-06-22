import { useState, Fragment, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  TouchableWithoutFeedback,
  Animated,
  Keyboard,
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
import { JordanAvatar } from './JordanAvatar';
import {
  buildExerciseSwapCandidates,
  buildSwapCandidateFromName,
  type ExerciseSwapCandidate,
} from '../utils/exerciseSwap';
import {
  fetchLastLoggedSetsForExercise,
} from '../utils/swapWeightHistory';
import { supabase } from '../Lib/supabase';
import { EXERCISES } from '../constants/exerciseLibrary';
import { stripEmDash } from '../utils/jordanText';
import { Ionicons } from '@expo/vector-icons';

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
      note: 'Light, just moving the bar',
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

function inferEquipmentFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('dumbbell') || n.includes(' db ') || n.startsWith('db ')) {
    return 'dumbbell';
  }
  if (n.includes('barbell')) return 'barbell';
  if (n.includes('cable')) return 'cable';
  if (
    n.includes('machine') ||
    n.includes('press machine') ||
    n.includes('row machine')
  ) {
    return 'machine';
  }
  if (
    n.includes('pull-up') ||
    n.includes('pullup') ||
    n.includes('chin-up') ||
    n.includes('chinup') ||
    n.includes('dip') ||
    n.includes('push-up')
  ) {
    return 'bodyweight';
  }
  return 'other';
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
  muscleGroup?: string;
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
  const repsString = String(repsValue ?? '').trim().toLowerCase();
  return (
    repsString.includes('sec') ||
    repsString.includes('min') ||
    /^\d+s$/.test(repsString) ||          // e.g. "30s"
    /^\d+-\d+s$/.test(repsString) ||      // e.g. "30-60s"
    /^\d+\s*-\s*\d+\s*s$/.test(repsString) // e.g. "30 - 60s"
  );
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
  const repsString = String(repsValue ?? '').trim().toLowerCase();
  // For ranges like "30-60s", use the lower bound as the target
  const rangeMatch = repsString.match(/^(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) return parseInt(rangeMatch[1], 10);
  const singleMatch = repsString.match(/(\d+)/);
  return singleMatch ? parseInt(singleMatch[1], 10) : 30;
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
  onEditSet?: (
    exerciseId: string,
    setNumber: number,
    weight: number,
    reps: number,
    rpe: number | null,
  ) => void;
  onSwapExercise: (
    exerciseId: string,
    newName: string,
    options?: {
      resetWeight?: boolean;
      prefilledWeight?: number;
      pyramidSets?: { setNumber: number; weightLbs: number }[];
    },
  ) => void;
  /** When set (e.g. after swap), overrides exercise.targetWeight for display and defaults */
  targetWeightOverride?: number;
  pyramidSetsOverride?: { setNumber: number; weightLbs: number }[];
  /** Active plan id — used to prefill swap weight from workout history */
  planId?: string;
  /** Display names already in today's workout — excludes swap candidates */
  currentWorkoutExerciseNames?: string[];
  /** Set numbers the user has skipped for this exercise (not logged, excluded from gate) */
  skippedSetNumbers?: number[];
  /** Skip all currently-unlogged sets of this exercise */
  onSkipRemainingSets?: () => void;
  /** Restore previously skipped sets */
  onRestoreSkippedSets?: () => void;
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
  onEditSet,
  onSwapExercise,
  targetWeightOverride,
  pyramidSetsOverride,
  planId,
  currentWorkoutExerciseNames,
  skippedSetNumbers = [],
  onSkipRemainingSets,
  onRestoreSkippedSets,
}: ExerciseCardProps) {
  const { lbsToDisplay, displayToLbs, formatWorkoutWeight, isMetric } = useMetric();

  const effectiveTargetWeight =
    targetWeightOverride !== undefined
      ? targetWeightOverride
      : exercise.targetWeight;

  const displayName = swappedName || exercise.name;

  const displayedMuscleGroup = useMemo(() => {
    const currentName = swappedName ?? exercise.name;
    const libraryMatch = EXERCISES.find(
      (e) => e.name.toLowerCase() === currentName.toLowerCase(),
    );
    return libraryMatch?.primaryMuscle ?? exercise.muscleGroup;
  }, [swappedName, exercise.name, exercise.muscleGroup]);
  const effectiveNameForEquipment = swappedName ?? exercise.exerciseName ?? exercise.name ?? '';
  const exerciseNameLower = effectiveNameForEquipment.toLowerCase();
  const isWeightedVariant = exerciseNameLower.includes('weighted');

  const effectiveEquipment = (() => {
    if (!swappedName) return exercise.equipment;
    const swapLib = EXERCISES.find(
      (e) => e.name.toLowerCase() === swappedName.toLowerCase(),
    );
    if (swapLib) return swapLib.usesWeight ? swapLib.equipment : 'bodyweight';
    const n = swappedName.toLowerCase();
    if (n.includes('machine') || n.includes('smith')) return 'machine';
    if (n.includes('dumbbell') || n.includes(' db ')) return 'dumbbell';
    if (n.includes('barbell')) return 'barbell';
    if (n.includes('cable')) return 'cable';
    return exercise.equipment;
  })();

  const isBodyweightExercise =
    (effectiveEquipment === 'bodyweight' ||
      (effectiveEquipment === undefined && exercise.usesWeight === false)) &&
    !isWeightedVariant;
  const isDumbbellExercise =
    effectiveEquipment === 'dumbbell' ||
    (!effectiveEquipment && exerciseNameLower.includes('dumbbell'));
  const tw =
    effectiveTargetWeight ?? exercise.sets[0]?.targetWeight ?? 0;
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
    (effectiveTargetWeight ?? 0) > 0 ||
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
    return effectiveTargetWeight ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: snapshot on mount only
  }, []);

  const warmupBaseWeight = isFrozenWarmupMode
    ? frozenWarmupBase
    : reactiveWarmupBase;

  const wantsWarmupByRule = shouldShowWarmups({
    ...exercise,
    targetWeight: effectiveTargetWeight,
  });

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
  useEffect(() => {
    if (targetWeightOverride === undefined || targetWeightOverride <= 0) return;
    console.log('[weight override]', {
      targetWeightOverride,
      setStructure: exercise.setStructure,
      setTargets: exercise.setTargets,
      isPyramid: exercise.setStructure === 'pyramid',
    });
    const isPyramid = exercise.setStructure === 'pyramid';
    setInputValues((prev) => {
      const next = { ...prev };
      for (const set of exercise.sets) {
        if (loggedSets.some((s) => s.setNumber === set.setNumber)) continue;
        const existing = next[set.setNumber];
        let newWeight: number;
        if (isPyramid) {
          const originalTargets = exercise.setTargets;
          const originalTopWeight =
            originalTargets && originalTargets.length > 0
              ? Math.max(...originalTargets.map((t) => t.targetWeight ?? 0))
              : 0;
          const originalThisSet = originalTargets?.find(
            (t) => t.setNumber === set.setNumber,
          );
          if (
            originalTopWeight > 0 &&
            originalThisSet != null &&
            originalThisSet.targetWeight > 0
          ) {
            // Shift all sets by the same delta as top set change
            const delta = targetWeightOverride - originalTopWeight;
            newWeight = Math.round(
              (originalThisSet.targetWeight + delta) / 5,
            ) * 5;
          } else {
            newWeight = targetWeightOverride;
          }
        } else {
          newWeight = targetWeightOverride;
        }
        const defaultForSet = existing ?? {
          weight: '',
          reps: String(set.targetReps ?? '').split(/[–\-]/)[0]!.trim(),
          rpe: null as number | null,
        };
        next[set.setNumber] = {
          ...defaultForSet,
          weight: String(lbsToDisplay(newWeight)),
        };
      }
      return next;
    });
    setEnteredWeight(0);
    setSet1EnteredWeight(0);
    setReactiveWarmupBase(0);
  // loggedSets intentionally excluded — only re-run when override changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetWeightOverride]);

  const [editingSet, setEditingSet] = useState<number | null>(null);
  const [rpeExpandedSet, setRpeExpandedSet] = useState<number | null>(null);
  const [showRpeReference, setShowRpeReference] = useState(false);
  const [showCoachingSheet, setShowCoachingSheet] = useState(false);
  const [showSwapSheet, setShowSwapSheet] = useState(false);
  const [pendingSwapCandidate, setPendingSwapCandidate] =
    useState<ExerciseSwapCandidate | null>(null);
  const [showAdaptationSheet, setShowAdaptationSheet] = useState(false);
  const [showEducation, setShowEducation] = useState(false);
  const [showPyramidInfo, setShowPyramidInfo] = useState(false);
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
      effectiveTargetWeight ?? exercise.sets[0]?.targetWeight ?? 0;

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

      if (pyramidSetsOverride && pyramidSetsOverride.length > 0) {
        const matchingSet = pyramidSetsOverride.find(
          (s) => s.setNumber === setNumber,
        );
        if (matchingSet) return matchingSet.weightLbs;
        return Math.max(...pyramidSetsOverride.map((s) => s.weightLbs));
      }

      if (
        targetWeightOverride !== undefined &&
        targetWeightOverride > 0
      ) {
        return targetWeightOverride;
      }

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
          : (isSelfSelectMode || isWeek1SelfSelect)
            ? ''
            : pyramidPrefill > 0
              ? String(lbsToDisplay(pyramidPrefill))
              : targetWeightOverride !== undefined
                ? String(lbsToDisplay(effectiveTargetWeight ?? 0))
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

  const isSetSkipped = (setNumber: number) => skippedSetNumbers.includes(setNumber);

  const activeWorkingSetIndex = useMemo(() => {
    // Active set = first set that has NOT been logged yet.
    // This never advances until the user taps ✓ — typing does
    // not change the active highlight.
    return exercise.sets.findIndex(
      (t) =>
        !loggedSets.some((s) => s.setNumber === t.setNumber) &&
        !skippedSetNumbers.includes(t.setNumber),
    );
  }, [exercise.sets, loggedSets, skippedSetNumbers]);

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

  const previousWasSwapped = previousSets.some((s) => s.swapped);

  const handleLogSet = (setNumber: number) => {
    const input = getInputForSet(setNumber);
    const weightLbs = isBodyweightExercise ? 0 : displayToLbs(parseFloat(input.weight));
    const reps = parseInt(input.reps, 10);
    if (isNaN(reps) || reps <= 0) return;
    if (!isBodyweightExercise && (isNaN(weightLbs) || weightLbs <= 0)) return;
    onLogSet(exercise.id, setNumber, weightLbs, reps, input.rpe);

    // Auto-expand RPE for next set if current set had no RPE
    if (input.rpe === null) {
      const nextUnloggedSet = exercise.sets.find(
        (s) =>
          s.setNumber > setNumber &&
          !loggedSets.some((ls) => ls.setNumber === s.setNumber),
      );
      if (nextUnloggedSet) {
        // Small delay so the set logs first visually
        setTimeout(() => {
          setRpeExpandedSet(nextUnloggedSet.setNumber);
        }, 300);
      }
    }

    const lastWeekSameSet = previousSets.find((s) => s.setNumber === setNumber);

    // If last week was a different exercise (swap), skip weight comparison
    if (!lastWeekSameSet || previousWasSwapped) {
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
        text: `First weighted session. Baseline set at ${formatWorkoutWeight(weightLbs)}`,
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
    return effectiveTargetWeight ?? firstTarget?.targetWeight ?? 0;
  })();
  const weightSuffix = isDumbbellExercise ? ' per dumbbell' : '';
  const targetSummary =
    firstTarget != null
      ? isSelfSelectMode
        ? `${exercise.sets.length} sets × ${repsSubtitlePart}. Choose load for RPE target`
        : isBodyweightExercise
          ? `${exercise.sets.length} sets × ${repsSubtitlePart} @ Bodyweight`
          : `${exercise.sets.length} sets × ${repsSubtitlePart} @ ${
              displayWeight > 0
                ? `${formatWorkoutWeight(displayWeight)}${weightSuffix}`
                : 'Add weight'
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
    effectiveTargetWeight,
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

  useEffect(() => () => {
    Object.values(trendTimeouts.current).forEach((timeoutId) => clearTimeout(timeoutId));
  }, []);

  const displayCandidates = useMemo(() => {
    const swapCandidates = buildExerciseSwapCandidates(
      exercise.name,
      exercise.muscleGroup,
    );
    console.log('[swap]', exercise.name, exercise.muscleGroup,
      JSON.stringify(swapCandidates));
    if (swapCandidates.length > 0) return swapCandidates;
    return (exercise.alternatives ?? [])
      .slice(0, 5)
      .map((name) => buildSwapCandidateFromName(name));
  }, [exercise.name, exercise.muscleGroup, exercise.alternatives]);

  const closeSwapSheet = useCallback(() => {
    setPendingSwapCandidate(null);
    setShowSwapSheet(false);
  }, []);

  const applySwap = useCallback(
    async (candidate: ExerciseSwapCandidate) => {
      const shouldResetWeight = candidate.sameWeightOk !== true;
      let prefilledWeight = 0;
      let pyramidSets:
        | { setNumber: number; weightLbs: number }[]
        | undefined;

      if (planId) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (userId) {
          const loggedSets = await fetchLastLoggedSetsForExercise(
            userId,
            planId,
            candidate.name,
          );
          if (loggedSets && loggedSets.length > 0) {
            prefilledWeight = Math.max(
              ...loggedSets.map((s) => s.weightLbs),
            );
            const isRamp =
              loggedSets.length >= 2 &&
              loggedSets[loggedSets.length - 1]!.weightLbs >
                loggedSets[0]!.weightLbs;
            if (isRamp) {
              pyramidSets = loggedSets;
            }
          }
        }
      }

      onSwapExercise(exercise.id, candidate.name, {
        resetWeight: shouldResetWeight,
        prefilledWeight,
        pyramidSets,
      });
    },
    [exercise.id, onSwapExercise, planId],
  );

  return (
    <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
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
              <Text style={styles.muscleTagText}>{displayedMuscleGroup}</Text>
            </View>
            {exercise.setStructure === 'pyramid' ? (
              <TouchableOpacity
                onPress={() => setShowPyramidInfo(true)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <View style={styles.pyramidBadge}>
                  <Text style={styles.pyramidBadgeText}>PYRAMID ⓘ</Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      {isSelfSelectMode ? (
        <View style={styles.selfSelectStrip}>
          <View style={styles.selfSelectStripRow}>
            <JordanAvatar size={24} />
            <View style={styles.jordanNoteTextColumn}>
              <Text style={styles.jordanNoteText}>
                {exercise.coachingNote
                  ? stripEmDash(exercise.coachingNote)
                  : 'Week 1 baseline. Log your honest effort after each set.'}
              </Text>
              {weekNumber === 1 &&
                (!effectiveTargetWeight || effectiveTargetWeight === 0) && (
                  <Text style={styles.jordanNoteSubtext}>
                    {`Pick a weight that lands at RPE ${firstTargetRpe}. I'll program Week 2 from your actual numbers.`}
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
                  <Ionicons name="trophy-outline" size={16} color={Colors.accent} /> {lastWeekBestStr}
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
                      <Text style={styles.warmupBadgeText} numberOfLines={1}>W{wi + 1}</Text>
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
          <Ionicons name="bulb-outline" size={16} color={Colors.textSecondary} />{' '}Enter a weight to see your warm-up sets
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
        const skipped = isSetSkipped(set.setNumber);
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
                skipped && styles.setRowSkipped,
              ]}
            >
              <View style={styles.setBadge}>
                <Text style={styles.setBadgeText}>{set.setNumber}</Text>
              </View>

              {skipped ? (
                <Text style={styles.setSkippedText}>Skipped</Text>
              ) : (
                <>
              {logged && loggedData && editingSet !== set.setNumber ? (
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
                  {onEditSet ? (
                    <TouchableOpacity
                      style={styles.editSetBtn}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => {
                        // Pre-fill inputValues with logged data for editing
                        setInputValues((prev) => ({
                          ...prev,
                          [set.setNumber]: {
                            weight: loggedData.weightLbs > 0
                              ? String(lbsToDisplay(loggedData.weightLbs))
                              : '0',
                            reps: String(loggedData.reps),
                            rpe: loggedData.rpe,
                          },
                        }));
                        setEditingSet(set.setNumber);
                      }}
                    >
                      <Ionicons name="pencil-outline" size={16} color={Colors.textTertiary} />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.completionCircleDone}>
                      <Ionicons name="checkmark" size={16} color={Colors.success} />
                    </View>
                  )}
                </>
              ) : logged && loggedData && editingSet === set.setNumber ? (
                // Edit mode — re-open inputs pre-filled with logged values
                <>
                  {!isBodyweightExercise ? (
                    <TextInput
                      style={[
                        styles.setInputWeight,
                        focusedField === `w-${set.setNumber}` && styles.inputFocused,
                      ]}
                      keyboardType="numeric"
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
                      value={getInputForSet(set.setNumber).weight}
                      onChangeText={(v) => updateInput(set.setNumber, 'weight', v)}
                      placeholder="lbs"
                      placeholderTextColor={Colors.textTertiary}
                      selectTextOnFocus
                      autoFocus
                      onFocus={() => setFocusedField(`w-${set.setNumber}`)}
                      onBlur={() => setFocusedField(null)}
                    />
                  ) : (
                    <Text style={styles.bodyweightText}>Bodyweight</Text>
                  )}
                  {timedSet ? (
                    <Text style={styles.timedTargetText}>{parseTimedDuration(set.targetReps)} sec</Text>
                  ) : (
                    <>
                      <Text style={styles.timesSep}>×</Text>
                      <TextInput
                        style={[
                          styles.setInputReps,
                          focusedField === `r-${set.setNumber}` && styles.inputFocused,
                        ]}
                        keyboardType="numeric"
                        returnKeyType="done"
                        onSubmitEditing={() => Keyboard.dismiss()}
                        value={getInputForSet(set.setNumber).reps}
                        onChangeText={(v) => updateInput(set.setNumber, 'reps', v)}
                        placeholder="reps"
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
                    {getInputForSet(set.setNumber).rpe != null ? (
                      <Text
                        style={[
                          styles.rpeBadgeValue,
                          { color: rpeValueColor(getInputForSet(set.setNumber).rpe!) },
                        ]}
                      >
                        {getInputForSet(set.setNumber).rpe}
                      </Text>
                    ) : (
                      <Text style={styles.rpeBadgePlaceholder}>RPE</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.completionCircleDone}
                    activeOpacity={0.7}
                    onPress={() => {
                      const input = getInputForSet(set.setNumber);
                      const weightLbs = isBodyweightExercise
                        ? 0
                        : displayToLbs(parseFloat(input.weight));
                      const reps = parseInt(input.reps, 10);
                      if (isNaN(reps) || reps <= 0) return;
                      if (!isBodyweightExercise && (isNaN(weightLbs) || weightLbs <= 0)) return;
                      onEditSet?.(exercise.id, set.setNumber, weightLbs, reps, input.rpe);
                      setEditingSet(null);
                    }}
                  >
                    <Ionicons name="checkmark" size={16} color={Colors.success} />
                  </TouchableOpacity>
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
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
                      value={
                        isSelfSelectMode
                          ? parseFloat(input.weight) > 0
                            ? input.weight
                            : ''
                          : input.weight
                      }
                      onChangeText={(v) => updateInput(set.setNumber, 'weight', v)}
                      placeholder="lbs"
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
                        returnKeyType="done"
                        onSubmitEditing={() => Keyboard.dismiss()}
                        value={input.reps}
                        onChangeText={(v) => updateInput(set.setNumber, 'reps', v)}
                        placeholder="reps"
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
                    <Ionicons name="checkmark" size={16} color={Colors.success} />
                  </TouchableOpacity>
                </>
              )}
                </>
              )}
            </View>
            {(!logged || editingSet === set.setNumber) &&
              rpeExpandedSet === set.setNumber && (
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
                <TouchableOpacity
                  onPress={() => setShowRpeReference(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                  style={styles.rpeInlineReferenceLink}
                >
                  <Text style={styles.rpeInlineReferenceLinkText}>
                    What is RPE?
                  </Text>
                </TouchableOpacity>
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

      {(() => {
        const hasSkipped = skippedSetNumbers.length > 0;
        const hasUnloggedUnskipped = exercise.sets.some(
          (st) =>
            !loggedSets.some((s) => s.setNumber === st.setNumber) &&
            !skippedSetNumbers.includes(st.setNumber),
        );
        if (hasSkipped) {
          return (
            <TouchableOpacity
              style={styles.skipRemainingBtn}
              activeOpacity={0.7}
              onPress={() => onRestoreSkippedSets?.()}
            >
              <Text style={styles.skipRemainingText}>
                {skippedSetNumbers.length} set{skippedSetNumbers.length === 1 ? '' : 's'} skipped · Restore
              </Text>
            </TouchableOpacity>
          );
        }
        if (hasUnloggedUnskipped && loggedSets.length > 0) {
          return (
            <TouchableOpacity
              style={styles.skipRemainingBtn}
              activeOpacity={0.7}
              onPress={() => onSkipRemainingSets?.()}
            >
              <Text style={styles.skipRemainingText}>Skip remaining sets</Text>
            </TouchableOpacity>
          );
        }
        return null;
      })()}

      <TouchableOpacity
        style={styles.swapButton}
        activeOpacity={0.7}
        onPress={() => {
          setPendingSwapCandidate(null);
          setShowSwapSheet(true);
        }}
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
                <Text style={styles.coachSheetBody}>{stripEmDash(coachingNote)}</Text>
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
        onRequestClose={closeSwapSheet}
      >
        <TouchableWithoutFeedback onPress={closeSwapSheet}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <View style={styles.swapSheet}>
          <View style={styles.sheetDragHandle} />
          <Text style={styles.swapSheetTitle}>Swap Exercise</Text>
          <Text style={styles.swapSheetSubtitle}>
            Choose an alternative for {displayName}
          </Text>
          {displayCandidates.map((candidate, index) => (
            <TouchableOpacity
              key={candidate.name ?? `swap-${index}`}
              style={[
                styles.swapCandidateRow,
                pendingSwapCandidate?.name === candidate.name &&
                  styles.swapCandidateRowSelected,
              ]}
              activeOpacity={0.7}
              onPress={() => setPendingSwapCandidate(candidate)}
            >
              <View style={styles.swapOptionRow}>
                <Text style={styles.swapOptionText}>{candidate.name}</Text>
                {candidate.isMachineEquivalent ? (
                  <View style={styles.swapMachineBadge}>
                    <Ionicons
                      name="cog-outline"
                      size={14}
                      color={Colors.accent}
                    />
                    <Text style={styles.swapMachineBadgeText}>
                      Machine Equivalent
                    </Text>
                  </View>
                ) : null}
                {pendingSwapCandidate?.name === candidate.name ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={Colors.accent}
                  />
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
          <View style={styles.swapActionRow}>
            <TouchableOpacity
              style={styles.swapCancelBtn}
              onPress={closeSwapSheet}
              activeOpacity={0.7}
            >
              <Text style={styles.swapCancelText}>Cancel</Text>
            </TouchableOpacity>

            {pendingSwapCandidate ? (
              <TouchableOpacity
                style={styles.swapConfirmBtn}
                onPress={() => {
                  void (async () => {
                    await applySwap(pendingSwapCandidate);
                    closeSwapSheet();
                  })();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.swapConfirmText}>Swap</Text>
              </TouchableOpacity>
            ) : null}
          </View>
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
              <JordanAvatar size={32} />
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
                        : (firstTarget?.targetRpe ?? '-')
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

      <Modal
        visible={showPyramidInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPyramidInfo(false)}
      >
        <Pressable
          style={styles.pyramidOverlay}
          onPress={() => setShowPyramidInfo(false)}
        >
          <View style={styles.pyramidModal}>
            <Text style={styles.pyramidModalTitle}>Pyramid Sets</Text>
            <Text style={styles.pyramidModalBody}>
              Each set gets heavier as you warm up into{'\n'}
              the movement. Your top set is last.{'\n\n'}
              Example for 5 sets at 300 lbs:{'\n'}
              Set 1: 210 lbs (70%){'\n'}
              Set 2: 240 lbs (80%){'\n'}
              Set 3: 255 lbs (85%){'\n'}
              Set 4: 270 lbs (90%){'\n'}
              Set 5: 300 lbs (100%)
            </Text>
            <TouchableOpacity
              style={styles.pyramidModalClose}
              onPress={() => setShowPyramidInfo(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.pyramidModalCloseText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
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
    </TouchableWithoutFeedback>
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
  pyramidOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  pyramidModal: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    width: '100%',
  },
  pyramidModalTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  pyramidModalBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 24,
    marginBottom: Spacing.xl,
  },
  pyramidModalClose: {
    backgroundColor: Colors.accent,
    height: 48,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pyramidModalCloseText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
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
    fontSize: FontSizes.body,
    fontFamily: Fonts.semiBold,
    color: Colors.accent,
    textDecorationLine: 'underline',
    paddingTop: 1,
    paddingHorizontal: Spacing.xs,
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
    minWidth: 28,
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
  setRowSkipped: {
    opacity: 0.5,
  },
  setSkippedText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    marginLeft: Spacing.sm,
  },
  skipRemainingBtn: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: Spacing.xs,
  },
  skipRemainingText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
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
  rpeInlineReferenceLink: {
    width: '100%',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    alignItems: 'center',
  },
  rpeInlineReferenceLinkText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.semiBold,
    color: Colors.accent,
    textDecorationLine: 'underline',
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
  coachingSkelAbs: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
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
  editSetBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
  swapCandidateRow: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  swapCandidateRowSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
  },
  swapOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  swapOptionText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  swapMachineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgElevated,
  },
  swapMachineBadgeText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  swapActionRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.sm,
  },
  swapCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapCancelText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  swapConfirmBtn: {
    flex: 2,
    height: 48,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapConfirmText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
});

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';
import {
  getRecommendedSplit,
  getSessionStructure,
  getSessionTitle,
  getAdjustOptions,
  getSplitInfoDescription,
  badgeNameForSplit,
  type SplitRecommendation,
  type SessionDay,
  type AdjustMenuOption,
} from '../../utils/splitRecommendation';
import BetaFeedbackModal from '../../components/BetaFeedbackModal';
import { stripEmDash } from '../../utils/jordanText';
import { JordanLabel } from '../../components/JordanLabel';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Experience'>;
type RouteType = RouteProp<RootStackParamList, 'Experience'>;

interface Option {
  id: string;
  label: string;
  detail?: string;
}

const EXPERIENCE_OPTIONS: Option[] = [
  { id: 'beginner', label: 'Beginner', detail: 'Less than 1 year' },
  { id: 'intermediate', label: 'Intermediate', detail: '1–3 years' },
  { id: 'advanced', label: 'Advanced', detail: '3+ years' },
];

const TRAINING_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function sortTrainingDays(days: string[]): string[] {
  const order = TRAINING_DAY_LABELS as readonly string[];
  return [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

const DURATION_OPTIONS: Option[] = [
  { id: '30-45', label: '30–45 mins' },
  { id: '45-60', label: '45–60 mins' },
  { id: '60-90', label: '60–90 mins' },
  { id: '90+', label: '90+ mins' },
];

function formatMuscleLabel(m: string): string {
  return m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Strength training-structure preview: exact muscle chips per day type (PHUL / PPL / upper-lower). */
const STRENGTH_PREVIEW_FOCUS_MUSCLES: Record<string, string[]> = {
  upper_power: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
  lower_power: ['quads', 'hamstrings', 'glutes'],
  upper_hypertrophy: ['chest', 'back', 'shoulders', 'arms'],
  lower_hypertrophy: ['quads', 'hamstrings', 'glutes', 'calves'],
  push_heavy: ['chest', 'shoulders', 'triceps'],
  pull_heavy: ['back', 'biceps', 'rear_delts'],
  legs_quad: ['quads', 'hamstrings', 'glutes', 'calves'],
  push_volume: ['chest', 'shoulders', 'triceps'],
  pull_volume: ['back', 'biceps'],
  legs_posterior: ['hamstrings', 'glutes', 'calves'],
  upper_heavy: ['chest', 'back', 'shoulders'],
  lower_heavy: ['quads', 'hamstrings', 'glutes'],
  upper_moderate: ['chest', 'back', 'shoulders'],
  upper_volume: ['chest', 'back', 'arms'],
  lower_volume: ['hamstrings', 'glutes', 'core'],
  squat_heavy: ['quads', 'hamstrings', 'glutes'],
  squat_volume: ['quads', 'hamstrings', 'glutes', 'calves'],
};

const STRIP_FROM_UPPER_STRENGTH_PREVIEW = new Set([
  'quads',
  'hamstrings',
  'glutes',
  'calves',
]);

const STRIP_FROM_LOWER_STRENGTH_PREVIEW = new Set([
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'rear_delts',
  'arms',
]);

function isLowerBodyFocusStrength(focus: string): boolean {
  if (focus.startsWith('lower_')) return true;
  if (
    focus.startsWith('legs_') ||
    focus === 'legs_full' ||
    focus === 'legs_unilateral' ||
    focus === 'legs_shoulders'
  ) {
    return true;
  }
  return false;
}

function isUpperBodyFocusStrength(focus: string): boolean {
  if (focus.startsWith('upper_')) return true;
  if (focus.startsWith('push_') || focus.startsWith('pull_')) return true;
  if (
    focus.includes('chest_back') ||
    focus.includes('shoulders_arms') ||
    focus === 'arms_core' ||
    focus === 'arms_upper' ||
    focus === 'upper_arms_focus'
  ) {
    return true;
  }
  return false;
}

function filterStrengthPreviewMuscles(focus: string, muscles: string[]): string[] {
  if (isLowerBodyFocusStrength(focus)) {
    return muscles.filter((m) => !STRIP_FROM_LOWER_STRENGTH_PREVIEW.has(m));
  }
  if (isUpperBodyFocusStrength(focus)) {
    return muscles.filter((m) => !STRIP_FROM_UPPER_STRENGTH_PREVIEW.has(m));
  }
  return muscles;
}

function getStrengthTrainingPreviewMuscles(
  session: SessionDay,
  splitId: string,
): string[] {
  if (session.type !== 'workout') return [];
  if (session.focus === 'full_body_a' || session.focus === 'full_body_b') {
    return session.primaryMuscles;
  }
  if (session.focus === 'legs_shoulders') {
    return session.primaryMuscles;
  }
  if (session.focus === 'upper_volume' && splitId === 'ppl_upper') {
    return ['chest', 'back', 'shoulders'];
  }
  if (session.focus === 'arms_upper') {
    return ['biceps', 'triceps', 'shoulders'];
  }
  const mapped = STRENGTH_PREVIEW_FOCUS_MUSCLES[session.focus];
  if (mapped) return mapped;
  return filterStrengthPreviewMuscles(session.focus, session.primaryMuscles);
}

const STRENGTH_TAGLINE_PHUL =
  'Heavy day + volume day for each movement. That is the structure that drives 1RM progress.';

const STRENGTH_TAGLINE_PPL =
  'Push, pull, and legs hit twice a week. Frequency is what builds strength.';

const STRENGTH_TAGLINE_FULL_BODY =
  'Full body three times a week. That is maximum frequency for strength at this volume.';

const STRENGTH_TAGLINE_UPPER_LOWER =
  'Upper and lower split twice each. You get balanced frequency with enough volume per session.';

const STRENGTH_TAGLINE_FALLBACK =
  'Structured for strength, built around your schedule.';

function isStrengthLowerBodyTargetLift(
  targetLift: string | null | undefined,
): boolean {
  if (!targetLift) return false;
  const k = targetLift.toLowerCase();
  return k.includes('squat') || k.includes('deadlift');
}

/** Short display name for strength structure preview titles / taglines (matches app targetLift ids). */
function getStrengthTargetLiftShortLabel(
  targetLift: string | null | undefined,
): string {
  if (!targetLift) return 'Lift';
  const key = targetLift.toLowerCase().trim();
  const labels: Record<string, string> = {
    squat: 'Squat',
    back_squat: 'Squat',
    deadlift: 'Deadlift',
    sumo_deadlift: 'Sumo Deadlift',
    bench_press: 'Bench',
    ohp: 'OHP',
    overhead_press: 'OHP',
    weighted_pullup: 'Weighted Pull-up',
  };
  return labels[key] ?? 'Lift';
}

/** Preview-only rows for strength + lower-body goal lifts (does not alter sessionStructure / plan). */
type StrengthLowerBodyPreviewRow = {
  dayLabel: string;
  title: string;
  muscles: string[];
};

type StrengthLowerBodyStructurePreviewResult = {
  rows: StrengthLowerBodyPreviewRow[];
  tagline: string;
  /** Set when 7 training days are selected — preview caps at 6 sessions. */
  restDayNote?: string;
};

function buildStrengthLowerBodyStructurePreview(
  sortedDayLabels: string[],
  targetLift: string,
): StrengthLowerBodyStructurePreviewResult | null {
  const n = sortedDayLabels.length;
  if (n !== 2 && n !== 3 && n !== 5 && n !== 6) return null;

  const liftLabel = getStrengthTargetLiftShortLabel(targetLift);
  const dayLabelAt = (i: number) => sortedDayLabels[i] ?? `D${i + 1}`;

  if (n === 2) {
    return {
      rows: [
        {
          dayLabel: dayLabelAt(0),
          title: `${liftLabel}: Heavy`,
          muscles: ['quads', 'hamstrings', 'glutes'],
        },
        {
          dayLabel: dayLabelAt(1),
          title: `${liftLabel}: Volume + Upper`,
          muscles: ['hamstrings', 'glutes', 'back', 'core'],
        },
      ],
      tagline:
        'Two days, two sessions. Heavy and volume on your target lift is the minimum to drive progress.',
    };
  }

  if (n === 3) {
    return {
      rows: [
        {
          dayLabel: dayLabelAt(0),
          title: `${liftLabel}: Heavy`,
          muscles: ['quads', 'hamstrings', 'glutes'],
        },
        {
          dayLabel: dayLabelAt(1),
          title: 'Upper Body',
          muscles: ['chest', 'back', 'shoulders', 'arms'],
        },
        {
          dayLabel: dayLabelAt(2),
          title: `${liftLabel}: Volume`,
          muscles: ['quads', 'hamstrings', 'glutes', 'core'],
        },
      ],
      tagline: `${liftLabel} twice, upper once. That is maximum frequency for 1RM progress on a 3-day schedule.`,
    };
  }

  if (n === 5) {
    return {
      rows: [
        {
          dayLabel: dayLabelAt(0),
          title: `${liftLabel}: Heavy`,
          muscles: ['quads', 'hamstrings', 'glutes'],
        },
        {
          dayLabel: dayLabelAt(1),
          title: 'Upper Body: Power',
          muscles: ['chest', 'back', 'shoulders'],
        },
        {
          dayLabel: dayLabelAt(2),
          title: 'Upper Body: Volume',
          muscles: ['chest', 'back', 'arms'],
        },
        {
          dayLabel: dayLabelAt(3),
          title: `${liftLabel}: Volume`,
          muscles: ['quads', 'hamstrings', 'glutes', 'core'],
        },
        {
          dayLabel: dayLabelAt(4),
          title: 'Upper Body: Accessories',
          muscles: ['back', 'arms', 'shoulders'],
        },
      ],
      tagline: `${liftLabel} twice a week with heavy and volume work, plus three upper days to build the supporting structure.`,
    };
  }

  return {
    rows: [
      {
        dayLabel: dayLabelAt(0),
        title: `${liftLabel}: Heavy`,
        muscles: ['quads', 'hamstrings', 'glutes'],
      },
      {
        dayLabel: dayLabelAt(1),
        title: 'Upper Body: Power',
        muscles: ['chest', 'back', 'shoulders'],
      },
      {
        dayLabel: dayLabelAt(2),
        title: 'Upper Body: Volume',
        muscles: ['chest', 'back', 'arms'],
      },
      {
        dayLabel: dayLabelAt(3),
        title: `${liftLabel}: Volume`,
        muscles: ['quads', 'hamstrings', 'glutes', 'core'],
      },
      {
        dayLabel: dayLabelAt(4),
        title: 'Upper Body: Power',
        muscles: ['back', 'shoulders'],
      },
      {
        dayLabel: dayLabelAt(5),
        title: `${liftLabel}: Technique`,
        muscles: ['quads', 'glutes', 'core'],
      },
    ],
    tagline: `Three ${liftLabel} sessions covering heavy, volume, and technique. That is the frequency serious 1RM progress requires.`,
  };
}

/** Bench / close-grip bench / overhead press — preview-only 2d & 3d structures. */
function isStrengthUpperBodyPressTargetLift(
  targetLift: string | null | undefined,
): boolean {
  if (!targetLift) return false;
  const k = targetLift.toLowerCase();
  if (k === 'ohp' || k.includes('overhead')) return true;
  if (k.includes('close_grip') || k.includes('close-grip')) return true;
  if (k.includes('bench')) return true;
  return false;
}

function buildStrengthUpperBodyPressStructurePreview(
  sortedDayLabels: string[],
  targetLift: string,
): StrengthLowerBodyStructurePreviewResult | null {
  const n = sortedDayLabels.length;
  if (n !== 2 && n !== 3) return null;

  const k = targetLift.toLowerCase();
  const isOhp = k === 'ohp' || k.includes('overhead');
  const dayLabelAt = (i: number) => sortedDayLabels[i] ?? `D${i + 1}`;

  if (isOhp) {
    if (n === 2) {
      return {
        rows: [
          {
            dayLabel: dayLabelAt(0),
            title: 'Overhead Press: Heavy',
            muscles: ['shoulders', 'triceps', 'chest'],
          },
          {
            dayLabel: dayLabelAt(1),
            title: 'Overhead Press: Volume + Lower',
            muscles: ['shoulders', 'triceps', 'quads', 'hamstrings'],
          },
        ],
        tagline:
          'Overhead press twice a week in heavy and volume work. That is the minimum frequency to drive 1RM progress.',
      };
    }
    return {
      rows: [
        {
          dayLabel: dayLabelAt(0),
          title: 'Overhead Press: Heavy',
          muscles: ['shoulders', 'triceps', 'chest'],
        },
        {
          dayLabel: dayLabelAt(1),
          title: 'Lower Body + Back',
          muscles: ['quads', 'hamstrings', 'back'],
        },
        {
          dayLabel: dayLabelAt(2),
          title: 'Overhead Press: Volume',
          muscles: ['shoulders', 'triceps', 'chest', 'back'],
        },
      ],
      tagline:
        'Overhead press twice a week plus one lower-body session. Everything is built around your pressing 1RM.',
    };
  }

  if (n === 2) {
    return {
      rows: [
        {
          dayLabel: dayLabelAt(0),
          title: 'Bench: Heavy',
          muscles: ['chest', 'shoulders', 'triceps'],
        },
        {
          dayLabel: dayLabelAt(1),
          title: 'Bench: Volume + Lower',
          muscles: ['chest', 'triceps', 'quads', 'hamstrings'],
        },
      ],
      tagline:
        'Bench twice a week in heavy and volume work. That is the minimum frequency to drive 1RM progress.',
    };
  }

  return {
    rows: [
      {
        dayLabel: dayLabelAt(0),
        title: 'Bench: Heavy',
        muscles: ['chest', 'shoulders', 'triceps'],
      },
      {
        dayLabel: dayLabelAt(1),
        title: 'Lower Body + Back',
        muscles: ['quads', 'hamstrings', 'back'],
      },
      {
        dayLabel: dayLabelAt(2),
        title: 'Bench: Volume',
        muscles: ['chest', 'triceps', 'shoulders', 'back'],
      },
    ],
    tagline:
      'Bench twice a week plus one lower-body session. Everything is built around your pressing 1RM.',
  };
}

function getStrengthStructureTagline(
  splitId: string,
  workouts: SessionDay[],
): string {
  const focuses = workouts.map((w) => w.focus);
  if (splitId === 'phul' || focuses.includes('upper_power')) {
    return STRENGTH_TAGLINE_PHUL;
  }
  if (
    splitId === 'full_body_beginner' ||
    splitId === 'full_body_advanced' ||
    splitId === 'full_body' ||
    focuses.includes('full_body_a') ||
    focuses.includes('full_body_b')
  ) {
    return STRENGTH_TAGLINE_FULL_BODY;
  }
  if (
    splitId === 'ppl' ||
    splitId === 'ppl_upper' ||
    splitId === 'ppl_leg_focus' ||
    focuses.includes('push_heavy')
  ) {
    return STRENGTH_TAGLINE_PPL;
  }
  if (
    splitId === 'upper_lower' ||
    focuses.includes('upper_heavy') ||
    focuses.includes('lower_heavy')
  ) {
    return STRENGTH_TAGLINE_UPPER_LOWER;
  }
  return STRENGTH_TAGLINE_FALLBACK;
}

function getSplitDayNote(splitId: string, workoutDays: number, selectedDays: number): string {
  const restDays = selectedDays - workoutDays;
  const restLabel = restDays === 1 ? 'day' : 'days';
  if (splitId === 'phul') {
    return `PHUL is a ${workoutDays}-day split. Your other ${restDays === 1 ? 'day' : `${restDays} days`} become active recovery.`;
  }
  if (splitId === 'ppl') {
    return `PPL runs ${workoutDays} training days. Your remaining ${restDays} ${restLabel} become rest or active recovery.`;
  }
  return `This split uses ${workoutDays} training days. Your remaining ${restDays} ${restLabel} become rest days.`;
}

const SPLIT_DAY_PRESETS: Record<string, Array<{ label: string; days: string[] }>> = {
  upper_lower: [
    { label: 'Mon / Thu', days: ['Mon', 'Thu'] },
    { label: 'Tue / Fri', days: ['Tue', 'Fri'] },
    { label: 'Mon / Wed / Fri', days: ['Mon', 'Wed', 'Fri'] },
    { label: 'Tue / Thu / Sat', days: ['Tue', 'Thu', 'Sat'] },
    { label: 'Mon / Wed / Fri / Sat', days: ['Mon', 'Wed', 'Fri', 'Sat'] },
    { label: 'Mon / Tue / Thu / Fri', days: ['Mon', 'Tue', 'Thu', 'Fri'] },
    { label: 'Tue / Wed / Fri / Sun', days: ['Tue', 'Wed', 'Fri', 'Sun'] },
  ],
  phul: [
    { label: 'Mon / Tue / Thu / Fri', days: ['Mon', 'Tue', 'Thu', 'Fri'] },
    { label: 'Mon / Wed / Fri / Sat', days: ['Mon', 'Wed', 'Fri', 'Sat'] },
  ],
  leg_focus: [
    { label: 'Mon / Tue / Thu / Fri', days: ['Mon', 'Tue', 'Thu', 'Fri'] },
    { label: 'Mon / Wed / Fri / Sat', days: ['Mon', 'Wed', 'Fri', 'Sat'] },
  ],
  upper_focus: [
    { label: 'Mon / Tue / Thu / Fri', days: ['Mon', 'Tue', 'Thu', 'Fri'] },
    { label: 'Mon / Wed / Fri / Sat', days: ['Mon', 'Wed', 'Fri', 'Sat'] },
  ],
  full_body_beginner: [
    { label: 'Mon / Thu', days: ['Mon', 'Thu'] },
    { label: 'Tue / Fri', days: ['Tue', 'Fri'] },
    { label: 'Mon / Wed / Fri', days: ['Mon', 'Wed', 'Fri'] },
    { label: 'Tue / Thu / Sat', days: ['Tue', 'Thu', 'Sat'] },
  ],
  full_body_advanced: [
    { label: 'Mon / Wed / Fri', days: ['Mon', 'Wed', 'Fri'] },
    { label: 'Tue / Thu / Sat', days: ['Tue', 'Thu', 'Sat'] },
  ],
  full_body: [
    { label: 'Mon / Wed / Fri', days: ['Mon', 'Wed', 'Fri'] },
    { label: 'Tue / Thu / Sat', days: ['Tue', 'Thu', 'Sat'] },
  ],
  ppl: [
    { label: 'Mon / Tue / Wed / Fri / Sat / Sun', days: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat', 'Sun'] },
    { label: 'Mon / Tue / Thu / Fri / Sat / Sun', days: ['Mon', 'Tue', 'Thu', 'Fri', 'Sat', 'Sun'] },
  ],
  ppl_upper: [
    { label: 'Mon / Tue / Wed / Fri / Sat', days: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'] },
    { label: 'Mon / Tue / Thu / Fri / Sat', days: ['Mon', 'Tue', 'Thu', 'Fri', 'Sat'] },
    { label: 'Tue / Wed / Thu / Sat / Sun', days: ['Tue', 'Wed', 'Thu', 'Sat', 'Sun'] },
  ],
  ppl_leg_focus: [
    { label: 'Mon / Tue / Wed / Fri / Sat', days: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'] },
    { label: 'Mon / Tue / Thu / Fri / Sat', days: ['Mon', 'Tue', 'Thu', 'Fri', 'Sat'] },
  ],
  arnold: [
    { label: 'Mon / Tue / Wed / Fri / Sat / Sun', days: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat', 'Sun'] },
  ],
  batman: [
    { label: 'Mon / Tue / Wed / Fri / Sat / Sun', days: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat', 'Sun'] },
  ],
  strength_2x: [
    { label: 'Mon / Thu', days: ['Mon', 'Thu'] },
    { label: 'Tue / Fri', days: ['Tue', 'Fri'] },
    { label: 'Mon / Wed / Fri', days: ['Mon', 'Wed', 'Fri'] },
    { label: 'Tue / Thu / Sat', days: ['Tue', 'Thu', 'Sat'] },
    { label: 'Mon / Wed / Fri / Sat', days: ['Mon', 'Wed', 'Fri', 'Sat'] },
    { label: 'Mon / Tue / Thu / Fri', days: ['Mon', 'Tue', 'Thu', 'Fri'] },
    { label: 'Mon / Tue / Wed / Fri / Sat', days: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'] },
    { label: 'Mon / Tue / Thu / Fri / Sat', days: ['Mon', 'Tue', 'Thu', 'Fri', 'Sat'] },
    { label: 'Mon / Tue / Wed / Fri / Sat / Sun', days: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat', 'Sun'] },
  ],
  strength_3x: [
    { label: 'Mon / Wed / Fri', days: ['Mon', 'Wed', 'Fri'] },
    { label: 'Tue / Thu / Sat', days: ['Tue', 'Thu', 'Sat'] },
    { label: 'Mon / Tue / Thu / Fri', days: ['Mon', 'Tue', 'Thu', 'Fri'] },
    { label: 'Mon / Wed / Fri / Sat', days: ['Mon', 'Wed', 'Fri', 'Sat'] },
    { label: 'Mon / Tue / Wed / Fri / Sat', days: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'] },
    { label: 'Mon / Tue / Thu / Fri / Sat', days: ['Mon', 'Tue', 'Thu', 'Fri', 'Sat'] },
    { label: 'Mon / Tue / Wed / Fri / Sat / Sun', days: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat', 'Sun'] },
  ],
  squat_focused_5: [
    { label: 'Mon / Tue / Thu / Fri / Sat', days: ['Mon', 'Tue', 'Thu', 'Fri', 'Sat'] },
    { label: 'Mon / Wed / Thu / Sat / Sun', days: ['Mon', 'Wed', 'Thu', 'Sat', 'Sun'] },
  ],
};

function getPresetsForSplit(
  splitId: string,
  dayCount: number,
): Array<{ label: string; days: string[] }> {
  const all = SPLIT_DAY_PRESETS[splitId] ?? [];
  const filtered = all.filter((p) => p.days.length === dayCount);
  // If no presets match the day count exactly, fall back to all presets for that split
  return filtered.length > 0 ? filtered : all;
}

function getRecoveryWarning(
  days: string[],
  splitId: string,
): string | null {
  const ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const sorted = [...days].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

  const upperLowerSplits = new Set([
    'upper_lower', 'phul', 'leg_focus', 'upper_focus',
    'strength_2x', 'strength_3x',
  ]);

  if (upperLowerSplits.has(splitId)) {
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = ORDER.indexOf(sorted[i]);
      const b = ORDER.indexOf(sorted[i + 1]);
      if (b - a === 1) {
        if (i === 0) {
          const splitDisplayName = splitId
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
          return `For ${splitDisplayName} splits, back-to-back days don't leave enough recovery time between same-muscle sessions. Jordan recommends at least one rest day between workouts — a pattern like Mon / Wed / Fri / Sat works well.`;
        }
      }
    }
  }
  return null;
}

export default function ExperienceScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const insets = useSafeAreaInsets();
  const {
    goal,
    targetLift,
    current1RM,
    target1RM,
    priorityMuscles,
    targetWeightLbs,
    targetDate,
    targetBodyFatPct,
    currentSplit,
    splitDuration,
    trainingBackground,
    currentSplitOther,
  } = route.params;

  const [experience, setExperience] = useState<string | null>(null);
  const [daysCountSelected, setDaysCountSelected] = useState<number | null>(null);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number | null>(null);
  const [showCustomDayPicker, setShowCustomDayPicker] = useState(false);
  const [recoveryWarning, setRecoveryWarning] = useState<string | null>(null);
  const [sessionLength, setSessionLength] = useState<string | null>(null);
  const [recommendedSplit, setRecommendedSplit] = useState<SplitRecommendation | null>(
    null,
  );
  const [sessionStructure, setSessionStructure] = useState<SessionDay[]>([]);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showSplitInfo, setShowSplitInfo] = useState(false);
  const [structureConfirmed, setStructureConfirmed] = useState(false);
  const [cardHighlight, setCardHighlight] = useState(false);
  const [showConfirmHint, setShowConfirmHint] = useState(false);
  const [enhancedRecovery, setEnhancedRecovery] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const structureLayoutYRef = useRef(0);
  const originalStructureRef = useRef<SessionDay[]>([]);
  const originalRecRef = useRef<SplitRecommendation | null>(null);

  const daysPerWeek = daysCountSelected != null ? String(daysCountSelected) : null;

  useEffect(() => {
    setStructureConfirmed(false);
    setShowConfirmHint(false);
  }, [selectedDays, experience, enhancedRecovery]);

  useEffect(() => {
    if (experience === 'beginner' || experience === null) {
      setEnhancedRecovery(false);
    }
  }, [experience]);

  useEffect(() => {
    setSelectedDays([]);
    setSelectedPresetIndex(null);
    setShowCustomDayPicker(false);
    setRecoveryWarning(null);
  }, [daysCountSelected]);

  useEffect(() => {
    if ((daysCountSelected ?? 0) >= 2 && experience) {
      const rec = getRecommendedSplit(
        goal,
        String(daysCountSelected ?? 0),
        targetLift ?? null,
        experience,
        currentSplit ?? null,
        splitDuration ?? null,
        trainingBackground ?? null,
        [],
        priorityMuscles ?? [],
      );
      const structure = getSessionStructure(
        rec.splitId,
        daysCountSelected ?? 0,
        goal,
        targetLift ?? null,
        priorityMuscles ?? [],
        [],
        sortTrainingDays(selectedDays),
        undefined,
        experience,
      );
      setRecommendedSplit(rec);
      console.log('[split debug]', {
        daysCountSelected,
        splitId: rec.splitId,
        splitName: rec.splitName,
        presetsForSplit: getPresetsForSplit(rec.splitId, daysCountSelected ?? 0),
        allPresetsForSplitId: SPLIT_DAY_PRESETS[rec.splitId] ?? [],
      });
      setSessionStructure(structure);
      originalStructureRef.current = structure;
      originalRecRef.current = rec;
    } else {
      setRecommendedSplit(null);
      setSessionStructure([]);
      originalStructureRef.current = [];
      originalRecRef.current = null;
    }
  }, [
    daysCountSelected,
    selectedDays,
    experience,
    goal,
    targetLift,
    priorityMuscles,
    currentSplit,
    splitDuration,
    trainingBackground,
  ]);

  const baseReady =
    !!experience &&
    (daysCountSelected ?? 0) >= 2 &&
    selectedDays.length >= 2 &&
    !!sessionLength &&
    !!recommendedSplit &&
    sessionStructure.length > 0;

  const handleContinue = () => {
    if (!baseReady || !recommendedSplit || !daysPerWeek) return;
    if (!structureConfirmed) {
      setShowConfirmHint(true);
      scrollRef.current?.scrollTo({
        y: Math.max(0, structureLayoutYRef.current - 24),
        animated: true,
      });
      setCardHighlight(true);
      setTimeout(() => setCardHighlight(false), 300);
      return;
    }
    console.log('[Experience] duration in params:', {
      planDuration: route.params.planDuration,
      recommendedWeeks: route.params.recommendedWeeks,
      targetDate: route.params.targetDate,
    });
    navigation.navigate('RPEEducation', {
      ...route.params,
      experience: experience!,
      daysPerWeek: String(selectedDays.length),
      trainingDays: selectedDays,
      sessionLength: sessionLength!,
      splitId: recommendedSplit.splitId,
      splitName: recommendedSplit.splitName,
      splitRationale: recommendedSplit.reason,
      sessionStructure,
      currentSplitOther: currentSplitOther ?? null,
      enhancedRecovery,
    });
  };

  const toggleTrainingDay = (label: string) => {
    setSelectedDays((prev) => {
      const next = prev.includes(label)
        ? prev.filter((d) => d !== label)
        : [...prev, label];
      return sortTrainingDays(next);
    });
  };

  const handleSelectPreset = useCallback((index: number, days: string[]) => {
    setSelectedPresetIndex(index);
    setSelectedDays(sortTrainingDays(days));
    setShowCustomDayPicker(false);
    setRecoveryWarning(null);
    setStructureConfirmed(false);
  }, []);

  const handleCustomDayToggle = useCallback((label: string) => {
    setSelectedDays((prev) => {
      const next = prev.includes(label)
        ? prev.filter((d) => d !== label)
        : [...prev, label];
      const sorted = sortTrainingDays(next);
      if (recommendedSplit && sorted.length >= 2) {
        setRecoveryWarning(getRecoveryWarning(sorted, recommendedSplit.splitId));
      } else {
        setRecoveryWarning(null);
      }
      return sorted;
    });
    setSelectedPresetIndex(null);
    setStructureConfirmed(false);
  }, [recommendedSplit]);

  const workoutsOrdered = sessionStructure
    .filter((d) => d.type === 'workout')
    .sort((a, b) => a.day - b.day);
  const sortedSelected = sortTrainingDays(selectedDays);

  const strengthLowerBodyStructurePreview = useMemo(() => {
    if (
      goal !== 'strength' ||
      !isStrengthLowerBodyTargetLift(targetLift) ||
      !targetLift
    ) {
      return null;
    }
    const n = selectedDays.length;
    const sorted = sortTrainingDays(selectedDays);
    if (n === 2 || n === 3 || n === 5 || n === 6) {
      return buildStrengthLowerBodyStructurePreview(sorted, targetLift);
    }
    if (n === 7) {
      const built = buildStrengthLowerBodyStructurePreview(
        sorted.slice(0, 6),
        targetLift,
      );
      return built
        ? {
            ...built,
            restDayNote:
              'This split uses 6 training days. Your remaining 1 day becomes a rest day.',
          }
        : null;
    }
    return null;
  }, [goal, targetLift, selectedDays]);

  const strengthUpperBodyPressStructurePreview = useMemo(() => {
    if (
      goal !== 'strength' ||
      !targetLift ||
      !isStrengthUpperBodyPressTargetLift(targetLift) ||
      isStrengthLowerBodyTargetLift(targetLift)
    ) {
      return null;
    }
    const n = selectedDays.length;
    if (n !== 2 && n !== 3) return null;
    return buildStrengthUpperBodyPressStructurePreview(
      sortTrainingDays(selectedDays),
      targetLift,
    );
  }, [goal, targetLift, selectedDays]);

  const strengthSyntheticStructurePreview =
    strengthLowerBodyStructurePreview ?? strengthUpperBodyPressStructurePreview;

  const adjustOptions: AdjustMenuOption[] =
    experience && selectedDays.length >= 2
      ? getAdjustOptions(experience, selectedDays.length)
      : [];

  const handleAdjustOption = (opt: AdjustMenuOption) => {
    if (!recommendedSplit) return;
    if (opt.kind === 'reset') {
      const oRec = originalRecRef.current;
      const oStruct = originalStructureRef.current;
      if (oRec && oStruct.length > 0) {
        setRecommendedSplit(oRec);
        setSessionStructure([...oStruct]);
      }
      setShowAdjust(false);
      setStructureConfirmed(false);
      return;
    }
    if (opt.kind === 'force_split') {
      setSessionStructure(
        getSessionStructure(
          opt.splitId,
          selectedDays.length,
          goal,
          targetLift ?? null,
          priorityMuscles ?? [],
          [],
          sortTrainingDays(selectedDays),
          undefined,
          experience ?? 'intermediate',
        ),
      );
      setRecommendedSplit({
        ...recommendedSplit,
        splitId: opt.splitId,
        splitName: opt.label,
      });
      setShowAdjust(false);
      setStructureConfirmed(false);
      return;
    }
    if (opt.kind === 'hint') {
      if (opt.hint === 'more_full_body') {
        const sid = experience === 'beginner' ? 'full_body_beginner' : 'full_body_advanced';
        setRecommendedSplit({
          ...recommendedSplit,
          splitId: sid,
          splitName: badgeNameForSplit(sid),
          reason:
            recommendedSplit.reason +
            ' Sessions skew full-body for more frequency each week.',
        });
        setSessionStructure(
          getSessionStructure(
            sid,
            selectedDays.length,
            goal,
            targetLift ?? null,
            priorityMuscles ?? [],
            [],
            sortTrainingDays(selectedDays),
            undefined,
            experience ?? 'intermediate',
          ),
        );
      } else {
        setSessionStructure(
          getSessionStructure(
            recommendedSplit.splitId,
            selectedDays.length,
            goal,
            targetLift ?? null,
            priorityMuscles ?? [],
            [],
            sortTrainingDays(selectedDays),
            opt.hint,
            experience ?? 'intermediate',
          ),
        );
      }
      setShowAdjust(false);
      setStructureConfirmed(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backHit}
          activeOpacity={0.7}
        >
          <Text style={styles.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={styles.stepHeaderTrailing}>
          <Text style={styles.stepIndicator}>3 of 8</Text>
          <TouchableOpacity
            onPress={() => setShowFeedback(true)}
            style={styles.feedbackLink}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.feedbackLinkText}>Feedback</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBlock}>
          <Text style={styles.screenTitle}>Training Experience</Text>
          <Text style={styles.screenSubtitle}>
            How long have you been training?
          </Text>
        </View>

        <View style={styles.cardsContainer}>
          {EXPERIENCE_OPTIONS.map((opt) => {
            const selected = experience === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                style={[styles.expCard, selected && styles.expCardSelected]}
                onPress={() => setExperience(opt.id)}
              >
                <Text style={styles.expCardLabel}>{opt.label}</Text>
                {opt.detail ? (
                  <Text style={styles.expCardDetail}>{opt.detail}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {(experience === 'intermediate' || experience === 'advanced') ? (
          <>
            <Text style={styles.sectionHeading}>Recovery</Text>
            <View style={styles.recoveryToggleCard}>
              <Text style={styles.recoveryToggleLabel}>
                I recover quickly between sessions and can handle high training volume.
              </Text>
              <Switch
                value={enhancedRecovery}
                onValueChange={setEnhancedRecovery}
                trackColor={{ false: Colors.border, true: Colors.accentBorder }}
                thumbColor={enhancedRecovery ? Colors.accent : Colors.textTertiary}
                ios_backgroundColor={Colors.border}
              />
            </View>
          </>
        ) : null}

        <Text style={styles.sectionHeading}>Training days</Text>
        <Text style={styles.trainingDaysSubtext}>
          How many days per week do you train?
        </Text>
        <View style={styles.dayCountRow}>
          {[2, 3, 4, 5, 6].map((count) => (
            <TouchableOpacity
              key={count}
              activeOpacity={0.7}
              style={[
                styles.dayCountPill,
                daysCountSelected === count && styles.dayCountPillSelected,
              ]}
              onPress={() => setDaysCountSelected(count)}
            >
              <Text
                style={[
                  styles.dayCountPillText,
                  daysCountSelected === count && styles.dayCountPillTextSelected,
                ]}
              >
                {count}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {recommendedSplit && (daysCountSelected ?? 0) >= 2 ? (
          <>
            <Text style={styles.presetSectionLabel}>Choose your training days</Text>
            <Text style={styles.presetSectionSubtitle}>
              Jordan recommends these schedules for {recommendedSplit.splitName}
            </Text>
            <View style={styles.presetList}>
              {getPresetsForSplit(recommendedSplit.splitId, daysCountSelected ?? 0).map((preset, idx) => (
                <TouchableOpacity
                  key={idx}
                  activeOpacity={0.7}
                  style={[
                    styles.presetRow,
                    selectedPresetIndex === idx && styles.presetRowSelected,
                  ]}
                  onPress={() => handleSelectPreset(idx, preset.days)}
                >
                  <View style={styles.presetRowLeft}>
                    <View
                      style={[
                        styles.presetRadio,
                        selectedPresetIndex === idx && styles.presetRadioSelected,
                      ]}
                    />
                    <Text
                      style={[
                        styles.presetRowLabel,
                        selectedPresetIndex === idx && styles.presetRowLabelSelected,
                      ]}
                    >
                      {preset.label}
                    </Text>
                  </View>
                  {idx === 0 ? (
                    <View style={styles.presetRecommendedBadge}>
                      <Text style={styles.presetRecommendedBadgeText}>Recommended</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                activeOpacity={0.7}
                style={[
                  styles.presetRow,
                  showCustomDayPicker && styles.presetRowSelected,
                ]}
                onPress={() => {
                  setShowCustomDayPicker(true);
                  setSelectedPresetIndex(null);
                  setSelectedDays([]);
                  setRecoveryWarning(null);
                  setStructureConfirmed(false);
                }}
              >
                <View style={styles.presetRowLeft}>
                  <View
                    style={[
                      styles.presetRadio,
                      showCustomDayPicker && styles.presetRadioSelected,
                    ]}
                  />
                  <Text
                    style={[
                      styles.presetRowLabel,
                      showCustomDayPicker && styles.presetRowLabelSelected,
                    ]}
                  >
                    Custom
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {showCustomDayPicker ? (
              <View style={styles.customPickerWrap}>
                <View style={styles.dayPillRow}>
                  {TRAINING_DAY_LABELS.map((label) => {
                    const selected = selectedDays.includes(label);
                    return (
                      <TouchableOpacity
                        key={label}
                        activeOpacity={0.7}
                        style={[styles.dayPill, selected && styles.dayPillSelected]}
                        onPress={() => handleCustomDayToggle(label)}
                      >
                        <Text
                          style={[
                            styles.dayPillText,
                            selected && styles.dayPillTextSelected,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {selectedDays.length > 0 && selectedDays.length < 2 ? (
                  <Text style={styles.trainingDaysValidation}>
                    Select at least 2 training days
                  </Text>
                ) : null}
                {recoveryWarning ? (
                  <View style={styles.recoveryWarningCard}>
                    <Text style={styles.recoveryWarningText}>{recoveryWarning}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}

        <Text style={styles.sectionHeading}>Session length</Text>
        <Text style={styles.sectionSubtitle}>
          How long is a typical session?
        </Text>
        <View style={styles.chipRow}>
          {DURATION_OPTIONS.map((opt) => {
            const selected = sessionLength === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setSessionLength(opt.id)}
              >
                <Text
                  style={[styles.chipText, selected && styles.chipTextSelected]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {goal === 'power_hypertrophy' &&
         (sessionLength === '30-45' || sessionLength === '45-60') ? (
          <View style={styles.sessionLengthWarning}>
            <Text style={styles.sessionLengthWarningText}>
              Strength & Size sessions typically run 75–90 minutes. You'll need time for both the strength and accessory phases. Consider 60–90 mins or more.
            </Text>
          </View>
        ) : null}

        <Text style={styles.structureSectionLabel}>Your training structure</Text>

        {recommendedSplit && sessionStructure.length > 0 ? (
          <View
            onLayout={(e) => {
              structureLayoutYRef.current = e.nativeEvent.layout.y;
            }}
            style={[
              styles.jordanCard,
              cardHighlight && styles.jordanCardHighlight,
            ]}
          >
            <View style={styles.jordanStripe} />
            <View style={styles.jordanCardInner}>
              <JordanLabel style={styles.jordanCardLabel} />

              <View style={styles.splitBadgeRow}>
                <View style={styles.splitNamePill}>
                  <Text style={styles.splitNamePillText}>
                    {recommendedSplit.splitName}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowSplitInfo(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.splitInfoIcon}>ⓘ</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.sessionList}>
                {strengthSyntheticStructurePreview
                  ? strengthSyntheticStructurePreview.rows.map((row, idx) => (
                      <View
                        key={`strength-preview-${row.dayLabel}-${idx}`}
                        style={styles.sessionBlock}
                      >
                        <View style={styles.sessionRow}>
                          <Text style={styles.sessionDayLabel}>{row.dayLabel}</Text>
                          <Text style={styles.sessionTitleText}>{row.title}</Text>
                        </View>
                        <View style={styles.muscleChipRow}>
                          {row.muscles.map((m) => (
                            <View key={m} style={styles.muscleChip}>
                              <Text style={styles.muscleChipText}>
                                {formatMuscleLabel(m)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ))
                  : workoutsOrdered.map((session, idx) => (
                      <View
                        key={`${session.day}-${session.focus}-${idx}`}
                        style={styles.sessionBlock}
                      >
                        <View style={styles.sessionRow}>
                          <Text style={styles.sessionDayLabel}>
                            {session.dayLabel ??
                              sortedSelected[idx] ??
                              `D${session.day}`}
                          </Text>
                          <Text style={styles.sessionTitleText}>
                            {stripEmDash(getSessionTitle(session.focus))}
                          </Text>
                        </View>
                        <View style={styles.muscleChipRow}>
                          {(goal === 'strength'
                            ? getStrengthTrainingPreviewMuscles(
                                session,
                                recommendedSplit.splitId,
                              )
                            : session.primaryMuscles
                          ).map((m) => (
                            <View key={m} style={styles.muscleChip}>
                              <Text style={styles.muscleChipText}>
                                {formatMuscleLabel(m)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ))}
              </View>

              <Text style={styles.jordanRationale}>
                &ldquo;
                {goal === 'strength'
                  ? strengthSyntheticStructurePreview?.tagline ??
                    getStrengthStructureTagline(
                      recommendedSplit.splitId,
                      workoutsOrdered,
                    )
                  : recommendedSplit.reason}
                {enhancedRecovery
                  ? ' Given your recovery rate, I\'ve pushed your volume a bit higher than normal. You can handle it.'
                  : ''}
                &rdquo;
              </Text>

              {strengthSyntheticStructurePreview?.restDayNote ? (
                <Text style={styles.structureDiscrepancyNote}>
                  {strengthSyntheticStructurePreview.restDayNote}
                </Text>
              ) : null}

              {recommendedSplit.workoutDays !== undefined &&
                recommendedSplit.workoutDays < selectedDays.length &&
                !strengthSyntheticStructurePreview?.restDayNote && (
                  <Text style={styles.structureDiscrepancyNote}>
                    {getSplitDayNote(recommendedSplit.splitId, recommendedSplit.workoutDays, selectedDays.length)}
                  </Text>
                )}

              {showAdjust ? (
                <View style={styles.adjustSection}>
                  <View style={styles.adjustChipRow}>
                    {adjustOptions.map((opt, idx) => (
                      <TouchableOpacity
                        key={
                          opt.kind === 'force_split'
                            ? `f-${opt.splitId}-${idx}`
                            : opt.kind === 'hint'
                              ? `h-${opt.hint}-${idx}`
                              : `r-${idx}`
                        }
                        activeOpacity={0.7}
                        style={styles.adjustChip}
                        onPress={() => handleAdjustOption(opt)}
                      >
                        <Text style={styles.adjustChipText}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setShowAdjust(false)}
                    style={styles.adjustBackHit}
                  >
                    <Text style={styles.adjustBackText}>← Back</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.cardButtonColumn}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[
                      styles.looksGoodBtn,
                      structureConfirmed && styles.looksGoodBtnConfirmed,
                    ]}
                    onPress={() => {
                      setStructureConfirmed(true);
                      setShowConfirmHint(false);
                    }}
                    disabled={structureConfirmed}
                  >
                    <Text
                      style={[
                        styles.looksGoodBtnText,
                        structureConfirmed && styles.looksGoodBtnTextConfirmed,
                      ]}
                    >
                      {structureConfirmed ? '✓ Structure confirmed' : 'Looks good →'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.adjustBtn}
                    onPress={() => setShowAdjust(true)}
                  >
                    <Text style={styles.adjustBtnText}>Adjust</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ) : null}
        {recommendedSplit && sessionStructure.length > 0 && baseReady && !structureConfirmed ? (
          <Text
            style={[
              styles.confirmStructureHint,
              showConfirmHint && styles.confirmStructureHintUrgent,
            ]}
          >
            Tap &apos;Looks good&apos; to confirm your training structure
          </Text>
        ) : null}
        {!(recommendedSplit && sessionStructure.length > 0) ? (
          <Text style={styles.structureHint}>
            Select your experience level and at least 2 training days to see
            Jordan&apos;s structure.
          </Text>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Spacing.xxxl + insets.bottom },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.button, !baseReady && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!baseReady}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showSplitInfo && !!recommendedSplit}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSplitInfo(false)}
      >
        <View style={styles.splitInfoBackdrop}>
          <ScrollView
            contentContainerStyle={styles.splitInfoScroll}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            {recommendedSplit ? (
              <View style={styles.splitInfoCard}>
                <Text style={styles.splitInfoTitle}>
                  {recommendedSplit.splitName}
                </Text>
                <Text style={styles.splitInfoBody}>
                  {getSplitInfoDescription(recommendedSplit.splitId)}
                </Text>
                <TouchableOpacity
                  style={styles.splitInfoBtn}
                  activeOpacity={0.85}
                  onPress={() => setShowSplitInfo(false)}
                >
                  <Text style={styles.splitInfoBtnText}>Got it</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
      <BetaFeedbackModal
        visible={showFeedback}
        onClose={() => setShowFeedback(false)}
        defaultArea="onboarding"
        lockArea={true}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  backHit: {
    paddingRight: 8,
  },
  backArrow: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    color: Colors.accent,
  },
  stepIndicator: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },
  stepHeaderTrailing: {
    alignItems: 'flex-end',
  },
  feedbackLink: {
    marginTop: Spacing.xs,
  },
  feedbackLinkText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 160,
  },

  titleBlock: {
    marginTop: 56,
  },
  screenTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
  },
  screenSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginTop: 8,
    marginBottom: 32,
  },

  sectionHeading: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 12,
  },
  sessionLengthWarning: {
    backgroundColor: Colors.warningMuted,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  sessionLengthWarningText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.warning,
  },
  recoveryToggleCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.md,
    marginTop: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recoveryToggleLabel: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    maxWidth: '80%',
  },
  structureSectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginBottom: 12,
    marginTop: 0,
  },
  trainingDaysSubtext: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: 12,
    marginTop: 0,
  },
  dayPillRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: Spacing.xs,
  },
  dayPill: {
    flex: 1,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPillSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
  },
  dayPillText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  dayPillTextSelected: {
    color: Colors.accent,
  },
  trainingDaysValidation: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.danger,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  dayCountRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  dayCountPill: {
    flex: 1,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCountPillSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
  },
  dayCountPillText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textSecondary,
  },
  dayCountPillTextSelected: {
    color: Colors.accent,
  },
  presetSectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: Spacing.lg,
    marginBottom: 4,
  },
  presetSectionSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginBottom: Spacing.md,
  },
  presetList: {
    gap: Spacing.sm,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  presetRowSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
  },
  presetRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  presetRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  presetRadioSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  presetRowLabel: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  presetRowLabelSelected: {
    color: Colors.textPrimary,
    fontFamily: Fonts.semiBold,
  },
  presetRecommendedBadge: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  presetRecommendedBadgeText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.micro,
    color: Colors.accent,
  },
  customPickerWrap: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  recoveryWarningCard: {
    backgroundColor: Colors.warningMuted,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  recoveryWarningText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.warning,
    lineHeight: 18,
  },

  cardsContainer: {
    gap: Spacing.sm,
  },
  expCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
  },
  expCardSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
  },
  expCardLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  expCardDetail: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  chipSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  chipTextSelected: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },

  structureHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },

  jordanCard: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    overflow: 'hidden',
  },
  jordanCardHighlight: {
    borderColor: Colors.accent,
    borderWidth: 2,
  },
  jordanStripe: {
    width: 3,
    backgroundColor: Colors.accent,
  },
  jordanCardInner: {
    flex: 1,
    padding: Spacing.lg,
  },
  jordanCardLabel: {
    marginBottom: Spacing.sm,
  },
  splitBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  splitNamePill: {
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  splitNamePillText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
  },
  splitInfoIcon: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textTertiary,
  },
  splitInfoBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
  },
  splitInfoScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  splitInfoCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
  },
  splitInfoTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },
  splitInfoBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    lineHeight: 22,
  },
  splitInfoBtn: {
    marginTop: Spacing.lg,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitInfoBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  sessionList: {
    gap: Spacing.md,
  },
  sessionBlock: {
    gap: Spacing.xs,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  sessionDayLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    width: 36,
  },
  sessionTitleText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
    flex: 1,
  },
  muscleChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginLeft: 36 + Spacing.sm,
  },
  muscleChip: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  muscleChipText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
  },
  jordanRationale: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: Spacing.lg,
    lineHeight: 22,
  },
  structureDiscrepancyNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    fontStyle: 'italic',
  },
  cardButtonColumn: {
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  looksGoodBtn: {
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  looksGoodBtnConfirmed: {
    backgroundColor: Colors.successMuted,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  looksGoodBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  looksGoodBtnTextConfirmed: {
    color: Colors.success,
    fontFamily: Fonts.semiBold,
  },
  confirmStructureHint: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  confirmStructureHintUrgent: {
    color: Colors.danger,
  },
  adjustBtn: {
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  adjustSection: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  adjustChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  adjustChip: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  adjustChipText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  adjustBackHit: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.xs,
  },
  adjustBackText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.bgPrimary,
  },
  button: {
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
});

import { useState, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';
import { getStrengthProjectionRange } from '../../utils/projections';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'GoalDetails'>;
type RouteType = RouteProp<RootStackParamList, 'GoalDetails'>;

interface Option {
  id: string;
  label: string;
}

const LIFT_OPTIONS: Option[] = [
  { id: 'bench_press', label: 'Bench Press' },
  { id: 'squat', label: 'Back Squat' },
  { id: 'deadlift', label: 'Deadlift' },
  { id: 'ohp', label: 'Overhead Press' },
];

const MUSCLE_OPTIONS: string[] = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
  'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Traps',
];

const SUB_MUSCLE_OPTIONS: Record<string, { label: string; value: string; description: string }[]> = {
  Biceps: [
    { label: 'Balanced', value: 'balanced', description: 'Hits all heads equally — great starting point' },
    { label: 'Short head', value: 'short_head', description: 'Width and peak from the front' },
    { label: 'Long head', value: 'long_head', description: 'Outer thickness and length' },
    { label: 'Brachialis', value: 'brachialis', description: 'Pushes the bicep up — adds side thickness' },
  ],
  Triceps: [
    { label: 'Balanced', value: 'balanced', description: 'Full tricep development' },
    { label: 'Long head', value: 'long_head', description: 'Overhead size — the biggest head by mass' },
    { label: 'Lateral head', value: 'lateral_head', description: 'Horseshoe shape visible from the side' },
  ],
  Chest: [
    { label: 'Balanced', value: 'balanced', description: 'Full chest development across all regions' },
    { label: 'Upper', value: 'upper', description: 'Shelf and fullness at the clavicle' },
    { label: 'Lower', value: 'lower', description: 'Separation and definition below the pec' },
  ],
  Shoulders: [
    { label: 'Balanced', value: 'balanced', description: 'Full shoulder roundness' },
    { label: 'Front', value: 'front', description: 'Pressing power and anterior fullness' },
    { label: 'Lateral', value: 'lateral', description: 'Width — the capped shoulder look' },
    { label: 'Rear', value: 'rear', description: 'Thickness from behind and posture correction' },
  ],
  Back: [
    { label: 'Balanced', value: 'balanced', description: 'Full back development' },
    { label: 'Lats', value: 'lats', description: 'Width and V-taper — the pull-up look' },
    { label: 'Upper back', value: 'upper_back', description: 'Thickness and 3D depth from behind' },
  ],
  Quads: [
    { label: 'Balanced', value: 'balanced', description: 'Full quad development' },
    { label: 'Outer sweep', value: 'outer_sweep', description: 'Width and sweep visible from the side' },
    { label: 'Teardrop', value: 'vmo', description: 'The VMO above your inner knee — a physique standout detail' },
  ],
};

const getDefaultSubMuscle = (muscle: string): string => {
  return SUB_MUSCLE_OPTIONS[muscle] ? 'balanced' : '';
};

const TIMELINE_OPTIONS: Option[] = [
  { id: '8w', label: '8 Weeks' },
  { id: '12w', label: '12 Weeks' },
  { id: '16w', label: '16 Weeks' },
  { id: '24w', label: '24 Weeks' },
];

const TIMELINE_WEEKS: Record<string, number> = {
  '4w': 4,
  '8w': 8,
  '12w': 12,
  '16w': 16,
  '24w': 24,
};

const SECONDARY_LIFT_OPTIONS: Option[] = [
  { id: 'bench_press', label: 'Bench Press' },
  { id: 'squat', label: 'Back Squat' },
  { id: 'deadlift', label: 'Deadlift' },
  { id: 'ohp', label: 'Overhead Press' },
  { id: 'none', label: 'None' },
];

const PLAN_DURATION_OPTIONS: Option[] = [
  { id: '8w', label: '8 Weeks' },
  { id: '12w', label: '12 Weeks' },
  { id: '16w', label: '16 Weeks' },
];

const GENERAL_PLAN_OPTIONS: Option[] = [
  { id: '4w', label: '4 Weeks' },
  { id: '8w', label: '8 Weeks' },
  { id: '12w', label: '12 Weeks' },
];

const RECOMP_FOCUS_OPTIONS: (Option & { detail: string })[] = [
  {
    id: 'lose_fat',
    label: 'Prioritise Fat Loss',
    detail: 'Lose fat while maintaining muscle',
  },
  {
    id: 'gain_muscle',
    label: 'Prioritise Muscle Gain',
    detail: 'Build muscle while minimising fat gain',
  },
];

const GENERAL_FOCUS_OPTIONS: (Option & { detail: string })[] = [
  {
    id: 'habit',
    label: 'Build a consistent habit',
    detail: 'Show up regularly and make fitness part of my life',
  },
  {
    id: 'strength',
    label: 'Get stronger and fitter',
    detail: 'Improve strength, endurance and overall fitness',
  },
  {
    id: 'wellbeing',
    label: 'Feel better and move better',
    detail: 'Improve energy, mobility and daily function',
  },
  {
    id: 'event',
    label: 'Prepare for something specific',
    detail: 'Training for a sport, event or physical challenge',
  },
];

const HYPERTROPHY_EXPECTATIONS: Record<string, string> = {
  '8w': '8 weeks is enough to see visible muscle definition changes. Expect 2–4 lbs of lean muscle gain.',
  '12w': '12 weeks is the sweet spot for hypertrophy. Expect 4–6 lbs of lean mass with good nutrition adherence.',
  '16w': '16 weeks of progressive overload can yield 6–8 lbs of lean muscle. Consistency is the key variable.',
};

const FAT_LOSS_EXPECTATIONS: Record<string, string> = {
  '8w': '8 weeks is an aggressive cut. Expect 8–12 lbs of total weight loss if you hit your calorie targets consistently.',
  '12w': '12 weeks at a moderate deficit is sustainable and effective. Expect 10–16 lbs lost while preserving muscle mass.',
  '16w': '16 weeks gives you the best chance of keeping the weight off long term. Slower loss = more muscle retained.',
  '24w': '24 weeks is a long-term lifestyle change. Expect 20–28 lbs lost at a safe, sustainable rate.',
};

const RECOMP_EXPECTATIONS: Record<string, string> = {
  '8w': 'Body recomp in 8 weeks will show early changes in body composition. Scale weight may stay similar — trust the mirror over the scale.',
  '12w': '12 weeks is the minimum to see meaningful recomp results. Expect noticeable changes in muscle tone and fat distribution.',
  '16w': '16 weeks gives your body time to genuinely recompose. Most users see 3–5% body fat reduction alongside visible muscle gains.',
};

const GENERAL_EXPECTATIONS: Record<string, string> = {
  '4w': "4 weeks builds the habit. By week 4 you'll have a consistent routine and noticeable energy improvements.",
  '8w': '8 weeks of consistent training improves strength, endurance and mobility. Most users feel significantly better by week 6.',
  '12w': '12 weeks transforms your baseline fitness. Expect meaningful strength gains and improved body composition.',
};

const HYPERTROPHY_CURRENT_SPLIT_OPTIONS: string[] = [
  'Not following a program',
  'Full Body',
  'Upper / Lower',
  'Push / Pull / Legs',
  'Bro Split',
  'Other',
];

const HYPERTROPHY_SPLIT_DURATION_OPTIONS: string[] = [
  'Less than 3 months',
  '3–6 months',
  '6+ months',
];

const STRENGTH_TRAINING_BACKGROUND_OPTIONS: string[] = [
  'New to structured training',
  'Following a general program',
  'Already doing a strength-specific program',
  'Running a powerlifting program',
];

function StrengthContent({
  onContinue,
}: {
  onContinue: (params: Record<string, unknown>) => void;
}) {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const [planDurationChipsReady, setPlanDurationChipsReady] = useState(false);
  const [targetLift, setTargetLift] = useState<string | null>(null);
  const [current1RM, setCurrent1RM] = useState('');
  const [target1RM, setTarget1RM] = useState('');
  const [secondaryLift, setSecondaryLift] = useState<string | null>(null);
  const [secondaryLiftError, setSecondaryLiftError] = useState(false);
  const [planDuration, setPlanDuration] = useState('12w');
  const [durationManuallySet, setDurationManuallySet] = useState(false);
  const [focusedField, setFocusedField] = useState<'current' | 'target' | null>(null);
  const [trainingBackground, setTrainingBackground] = useState<string | null>(null);

  const canContinue = !!targetLift && current1RM.trim() !== '' && target1RM.trim() !== '';

  useEffect(() => {
    if (durationManuallySet) return;
    const c = Number(current1RM);
    const t = Number(target1RM);
    if (
      !current1RM.trim() ||
      !target1RM.trim() ||
      !Number.isFinite(c) ||
      !Number.isFinite(t) ||
      t <= c
    ) {
      return;
    }
    const { weeksToTarget } = getStrengthProjectionRange(c, t, 12);
    const chip = weeksToTarget <= 8 ? '8w' : weeksToTarget <= 12 ? '12w' : '16w';
    setPlanDuration(chip);
  }, [current1RM, target1RM, durationManuallySet]);

  const strengthFeasibilityBody = useMemo(() => {
    if (!current1RM.trim() || !target1RM.trim()) return null;
    const c = Number(current1RM);
    const t = Number(target1RM);
    if (!Number.isFinite(c) || !Number.isFinite(t) || t <= c) return null;
    const selectedWeeks = TIMELINE_WEEKS[planDuration] ?? 12;
    const { low, high, weeksToTarget } = getStrengthProjectionRange(
      c,
      t,
      selectedWeeks,
    );
    const gap = t - c;
    const canReachGoal = high >= gap;
    return canReachGoal
      ? `In ${selectedWeeks} weeks, expect +${low}–${high} lbs depending on your experience level. At the right pace, reaching ${t} lbs is within reach.`
      : `Reaching ${t} lbs typically takes around ${weeksToTarget} weeks. In ${selectedWeeks} weeks, expect +${low}–${high} lbs — your exact rate depends on your experience level.`;
  }, [current1RM, target1RM, planDuration]);

  const handleSecondaryLift = (id: string) => {
    if (id !== 'none' && id === targetLift) {
      setSecondaryLiftError(true);
      return;
    }
    setSecondaryLiftError(false);
    setSecondaryLift(id);
  };

  const recommendedWeeks = TIMELINE_WEEKS[planDuration] ?? 12;

  const handleSkipToExperience = () => {
    if (!planDurationChipsReady || !canContinue) return;
    navigation.navigate('Experience', {
      ...route.params,
      priorityMuscles: [],
      currentSplit: undefined,
      splitDuration: undefined,
      recommendedWeeks,
      trainingBackground: trainingBackground ?? null,
      targetLift,
      current1RM: current1RM.trim(),
      target1RM: target1RM.trim(),
      secondaryLift,
      planDuration,
      currentSplitOther: undefined,
    } as RootStackParamList['Experience']);
  };

  return (
    <ScreenShell
      title="Strength Goals"
      subtitle="Tell us your current numbers and where you want to get to."
      canContinue={canContinue}
      buttonLabel="Continue"
      onContinue={() =>
        onContinue({
          targetLift,
          current1RM: current1RM.trim(),
          target1RM: target1RM.trim(),
          secondaryLift,
          planDuration,
          recommendedWeeks,
          currentSplit: null,
          currentSplitOther: null,
          splitDuration: null,
          trainingBackground: trainingBackground ?? null,
        })
      }
    >
      <Text style={styles.sectionHeadingFirst}>Which lift?</Text>
      <View style={styles.cardsContainer}>
        {LIFT_OPTIONS.map((opt) => {
          const selected = targetLift === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.card, selected && styles.cardSelected]}
              onPress={() => {
                setTargetLift(opt.id);
                if (secondaryLift === opt.id) {
                  setSecondaryLift(null);
                  setSecondaryLiftError(false);
                }
              }}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardLabel}>{opt.label}</Text>
              </View>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionHeading}>Current & Target 1RM</Text>
      <View style={styles.inputFieldBlock}>
        <Text style={styles.inputLabel}>Current 1RM (lbs)</Text>
        <TextInput
          style={[
            styles.textInputField,
            focusedField === 'current' && styles.textInputFocused,
          ]}
          placeholder="e.g. 225"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="numeric"
          value={current1RM}
          onChangeText={setCurrent1RM}
          onFocus={() => setFocusedField('current')}
          onBlur={() => setFocusedField(null)}
        />
      </View>
      <View style={[styles.inputFieldBlock, styles.inputFieldStack]}>
        <Text style={styles.inputLabel}>Target 1RM (lbs)</Text>
        <TextInput
          style={[
            styles.textInputField,
            focusedField === 'target' && styles.textInputFocused,
          ]}
          placeholder="e.g. 275"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="numeric"
          value={target1RM}
          onChangeText={setTarget1RM}
          onFocus={() => setFocusedField('target')}
          onBlur={() => setFocusedField(null)}
        />
      </View>

      {strengthFeasibilityBody ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardBody}>{strengthFeasibilityBody}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionHeading}>Plan Duration</Text>
      <Text style={styles.sectionSubtitle}>
        Based on your goal, we recommend:
      </Text>
      <View onLayout={() => setPlanDurationChipsReady(true)}>
        <View style={styles.chipRow}>
          {PLAN_DURATION_OPTIONS.map((opt) => {
            const selected = planDuration === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                style={[
                  styles.chip,
                  styles.chipDuration,
                  selected && styles.chipSelected,
                ]}
                onPress={() => {
                  setDurationManuallySet(true);
                  setPlanDuration(opt.id);
                }}
              >
                <Text
                  style={[
                    styles.chipText,
                    styles.chipTextCentered,
                    selected && styles.chipTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={styles.trainingHistoryBlock}>
        <Text style={styles.trainingSectionHeading}>Your training background</Text>
        <Text style={styles.trainingQuestion}>
          How have you been training recently?
        </Text>
        <View style={styles.chipRow}>
          {STRENGTH_TRAINING_BACKGROUND_OPTIONS.map((label) => {
            const selected = trainingBackground === label;
            return (
              <TouchableOpacity
                key={label}
                activeOpacity={0.7}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setTrainingBackground(label)}
              >
                <Text
                  style={[styles.chipText, selected && styles.chipTextSelected]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {(trainingBackground === 'Already doing a strength-specific program' ||
          trainingBackground === 'Running a powerlifting program') && (
          <View style={styles.jordanInsightCard}>
            <Text style={styles.jordanInsightText}>
              Jordan will build on your existing strength base and focus specifically
              on breaking through your current plateau.
            </Text>
          </View>
        )}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleSkipToExperience}
          disabled={!planDurationChipsReady || !canContinue}
          style={[
            styles.skipLinkHit,
            (!planDurationChipsReady || !canContinue) && styles.skipLinkDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Skip training background"
        >
          <Text
            style={[
              styles.skipLinkText,
              (!planDurationChipsReady || !canContinue) && styles.skipLinkTextDisabled,
            ]}
          >
            Skip — I&apos;ll let Jordan decide
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionHeading}>
        Secondary Lift (Optional)
      </Text>
      <Text style={styles.sectionSubtitle}>
        Want to track progress on another lift too?
      </Text>
      <View style={styles.cardsContainer}>
        {SECONDARY_LIFT_OPTIONS.map((opt) => {
          const selected = secondaryLift === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.card, selected && styles.cardSelected]}
              onPress={() => handleSecondaryLift(opt.id)}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardLabel}>{opt.label}</Text>
              </View>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {secondaryLiftError && (
        <Text style={styles.errorText}>
          Must be different from your primary lift
        </Text>
      )}
    </ScreenShell>
  );
}

function HypertrophyContent({
  onContinue,
}: {
  onContinue: (params: Record<string, unknown>) => void;
}) {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const [planDurationChipsReady, setPlanDurationChipsReady] = useState(false);
  const [priorityMuscles, setPriorityMuscles] = useState<string[]>([]);
  const [subMusclePreferences, setSubMusclePreferences] = useState<
    Record<string, string>
  >({});
  const [planDuration, setPlanDuration] = useState('12w');
  const [currentSplit, setCurrentSplit] = useState<string | null>(null);
  const [splitDuration, setSplitDuration] = useState<string | null>(null);
  const [currentSplitOther, setCurrentSplitOther] = useState('');

  useEffect(() => {
    if (currentSplit === 'Not following a program') {
      setSplitDuration(null);
    }
    if (currentSplit !== 'Other') {
      setCurrentSplitOther('');
    }
  }, [currentSplit]);

  const toggleMuscle = (muscle: string) => {
    if (priorityMuscles.includes(muscle)) {
      setPriorityMuscles((prev) => prev.filter((m) => m !== muscle));
      setSubMusclePreferences((prev) => {
        const next = { ...prev };
        delete next[muscle];
        return next;
      });
      return;
    }
    if (priorityMuscles.length >= 3) return;
    setPriorityMuscles((prev) => [...prev, muscle]);
    if (SUB_MUSCLE_OPTIONS[muscle]) {
      setSubMusclePreferences((prev) => ({
        ...prev,
        [muscle]: getDefaultSubMuscle(muscle),
      }));
    }
  };

  const recommendedWeeks = TIMELINE_WEEKS[planDuration] ?? 12;

  const handleSkipToExperience = () => {
    if (!planDurationChipsReady) return;
    navigation.navigate('Experience', {
      ...route.params,
      priorityMuscles: [],
      subMusclePreferences: {},
      currentSplit: undefined,
      splitDuration: undefined,
      recommendedWeeks,
      trainingBackground: null,
      planDuration,
      currentSplitOther: undefined,
    } as RootStackParamList['Experience']);
  };

  return (
    <ScreenShell
      title="Muscle Priority"
      subtitle="Select up to 3 muscle groups you want to prioritise. Your plan will give these extra volume."
      canContinue
      buttonLabel="Continue"
      onContinue={() => {
        const subMusclePreferencesPayload: Record<string, string> = {};
        for (const m of priorityMuscles) {
          if (!SUB_MUSCLE_OPTIONS[m]) continue;
          const v = subMusclePreferences[m] ?? 'balanced';
          if (v !== '') subMusclePreferencesPayload[m] = v;
        }
        onContinue({
          priorityMuscles,
          subMusclePreferences: subMusclePreferencesPayload,
          planDuration,
          recommendedWeeks,
          currentSplit: currentSplit ?? null,
          currentSplitOther:
            currentSplit === 'Other' && currentSplitOther.trim()
              ? currentSplitOther.trim()
              : null,
          splitDuration: splitDuration ?? null,
          trainingBackground: null,
        });
      }}
    >
      <View style={styles.chipRow}>
        {MUSCLE_OPTIONS.map((muscle) => {
          const selected = priorityMuscles.includes(muscle);
          const maxed = priorityMuscles.length >= 3 && !selected;
          return (
            <TouchableOpacity
              key={muscle}
              activeOpacity={0.7}
              style={[
                styles.chip,
                selected && styles.chipSelected,
                maxed && styles.chipMaxed,
              ]}
              onPress={() => toggleMuscle(muscle)}
              disabled={maxed}
            >
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {muscle}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {priorityMuscles
        .filter((m) => SUB_MUSCLE_OPTIONS[m])
        .map((muscle) => {
          const options = SUB_MUSCLE_OPTIONS[muscle];
          const activeValue = subMusclePreferences[muscle] || 'balanced';
          const activeOption = options.find((o) => o.value === activeValue);

          return (
            <View key={muscle} style={styles.subMuscleSection}>
              <Text style={styles.subMuscleLabel}>
                {muscle.toUpperCase()} FOCUS
              </Text>
              <View style={styles.subMuscleChips}>
                {options.map((option) => {
                  const isSelected = activeValue === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.subMuscleChip,
                        isSelected && styles.subMuscleChipSelected,
                      ]}
                      onPress={() =>
                        setSubMusclePreferences((prev) => ({
                          ...prev,
                          [muscle]: option.value,
                        }))
                      }
                    >
                      <Text
                        style={[
                          styles.subMuscleChipText,
                          isSelected && styles.subMuscleChipTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.subMuscleTooltip}>
                {activeOption?.description ?? ''}
              </Text>
            </View>
          );
        })}
      {priorityMuscles.length > 0 && (
        <Text style={styles.chipHint}>
          These muscles will receive priority volume in your program.
        </Text>
      )}

      <View style={styles.trainingHistoryBlock}>
        <Text style={styles.trainingSectionHeading}>Current training</Text>
        <Text style={styles.trainingHistorySubtext}>
          Helps Jordan recommend a fresh structure if needed
        </Text>
        <Text style={styles.trainingQuestion}>
          What split have you been following?
        </Text>
        <View style={styles.chipRow}>
          {HYPERTROPHY_CURRENT_SPLIT_OPTIONS.map((label) => {
            const selected = currentSplit === label;
            return (
              <TouchableOpacity
                key={label}
                activeOpacity={0.7}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setCurrentSplit(label)}
              >
                <Text
                  style={[styles.chipText, selected && styles.chipTextSelected]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {currentSplit === 'Other' ? (
          <TextInput
            style={styles.splitOtherInput}
            placeholder="Briefly describe your current structure"
            placeholderTextColor={Colors.textTertiary}
            value={currentSplitOther}
            onChangeText={setCurrentSplitOther}
            maxLength={80}
          />
        ) : null}
        {currentSplit != null &&
          currentSplit !== '' &&
          currentSplit !== 'Not following a program' && (
            <>
              <Text style={[styles.trainingQuestion, styles.trainingQuestionFollow]}>
                How long on this structure?
              </Text>
              <View style={styles.chipRow}>
                {HYPERTROPHY_SPLIT_DURATION_OPTIONS.map((label) => {
                  const selected = splitDuration === label;
                  return (
                    <TouchableOpacity
                      key={label}
                      activeOpacity={0.7}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setSplitDuration(label)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.chipTextSelected,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        {splitDuration === '6+ months' && (
          <View style={styles.jordanInsightCard}>
            <Text style={styles.jordanInsightText}>
              Your body has adapted to this structure. Jordan will recommend a
              different approach to reignite your progress.
            </Text>
          </View>
        )}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleSkipToExperience}
          disabled={!planDurationChipsReady}
          style={[
            styles.skipLinkHit,
            !planDurationChipsReady && styles.skipLinkDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Skip current training questions"
        >
          <Text
            style={[
              styles.skipLinkText,
              !planDurationChipsReady && styles.skipLinkTextDisabled,
            ]}
          >
            Skip — I&apos;ll let Jordan decide
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionHeading}>Plan Duration</Text>
      <Text style={styles.sectionSubtitle}>
        How many weeks do you want to commit to?
      </Text>
      <View onLayout={() => setPlanDurationChipsReady(true)}>
        <View style={styles.chipRow}>
          {PLAN_DURATION_OPTIONS.map((opt) => {
            const selected = planDuration === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                style={[
                  styles.chip,
                  styles.chipDuration,
                  selected && styles.chipSelected,
                ]}
                onPress={() => setPlanDuration(opt.id)}
              >
                <Text
                  style={[
                    styles.chipText,
                    styles.chipTextCentered,
                    selected && styles.chipTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {HYPERTROPHY_EXPECTATIONS[planDuration] && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardBody}>
            {HYPERTROPHY_EXPECTATIONS[planDuration]}
          </Text>
        </View>
      )}
    </ScreenShell>
  );
}

function FatLossContent({
  onContinue,
}: {
  onContinue: (params: Record<string, unknown>) => void;
}) {
  const [currentWeightLbs, setCurrentWeightLbs] = useState('');
  const [targetWeightLbs, setTargetWeightLbs] = useState('');
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'current' | 'target' | null>(
    null,
  );

  const canContinue =
    currentWeightLbs.trim() !== '' &&
    targetWeightLbs.trim() !== '' &&
    !!targetDate;

  const rateCheck = useMemo(() => {
    if (!currentWeightLbs.trim() || !targetWeightLbs.trim() || !targetDate) return null;
    const weeks = TIMELINE_WEEKS[targetDate];
    const weeklyRate = (Number(currentWeightLbs) - Number(targetWeightLbs)) / weeks;

    if (weeklyRate <= 0) {
      return {
        message: 'Your target weight is higher than your current weight. Please check your numbers.',
        color: Colors.danger,
      };
    }
    if (weeklyRate <= 1) {
      return {
        message: `~${weeklyRate.toFixed(1)} lbs/week — this is a safe, sustainable rate. Great choice.`,
        color: Colors.success,
      };
    }
    if (weeklyRate <= 1.5) {
      return {
        message: `~${weeklyRate.toFixed(1)} lbs/week — aggressive but achievable with strict adherence.`,
        color: Colors.warning,
      };
    }
    return {
      message: `~${weeklyRate.toFixed(1)} lbs/week — this is very aggressive. Consider a longer timeline.`,
      color: Colors.danger,
    };
  }, [currentWeightLbs, targetWeightLbs, targetDate]);

  return (
    <ScreenShell
      title="Fat Loss Target"
      subtitle="Set a goal weight and timeline so we can build the right deficit for you."
      canContinue={canContinue}
      buttonLabel="Continue"
      onContinue={() =>
        onContinue({
          startingWeightLbs: currentWeightLbs.trim(),
          targetWeightLbs: targetWeightLbs.trim(),
          targetDate,
          planDuration: targetDate ?? '12w',
          recommendedWeeks:
            targetDate != null ? TIMELINE_WEEKS[targetDate] ?? 12 : 12,
        })
      }
    >
      <View style={styles.inputFieldBlock}>
        <Text style={styles.inputLabel}>Current Weight (lbs)</Text>
        <TextInput
          style={[
            styles.textInputField,
            focusedField === 'current' && styles.textInputFocused,
          ]}
          placeholder="e.g. 185"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="numeric"
          value={currentWeightLbs}
          onChangeText={setCurrentWeightLbs}
          onFocus={() => setFocusedField('current')}
          onBlur={() => setFocusedField(null)}
        />
      </View>

      <View style={[styles.inputFieldBlock, styles.inputFieldStack]}>
        <Text style={styles.inputLabel}>Target Weight (lbs)</Text>
        <TextInput
          style={[
            styles.textInputField,
            focusedField === 'target' && styles.textInputFocused,
          ]}
          placeholder="e.g. 160"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="numeric"
          value={targetWeightLbs}
          onChangeText={setTargetWeightLbs}
          onFocus={() => setFocusedField('target')}
          onBlur={() => setFocusedField(null)}
        />
      </View>

      <Text style={styles.sectionHeading}>
        Timeline & Plan Duration
      </Text>
      <View style={styles.chipRow}>
        {TIMELINE_OPTIONS.map((opt) => {
          const selected = targetDate === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[
                styles.chip,
                styles.chipDuration,
                selected && styles.chipSelected,
              ]}
              onPress={() => setTargetDate(opt.id)}
            >
              <Text
                style={[
                  styles.chipText,
                  styles.chipTextCentered,
                  selected && styles.chipTextSelected,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {rateCheck && (
        <View style={styles.infoCard}>
          <Text style={[styles.infoCardBody, { color: rateCheck.color }]}>
            {rateCheck.message}
          </Text>
        </View>
      )}
      {targetDate && FAT_LOSS_EXPECTATIONS[targetDate] && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardBody}>
            {FAT_LOSS_EXPECTATIONS[targetDate]}
          </Text>
        </View>
      )}
    </ScreenShell>
  );
}

function RecompContent({
  onContinue,
}: {
  onContinue: (params: Record<string, unknown>) => void;
}) {
  const [recompFocus, setRecompFocus] = useState<string | null>(null);
  const [planDuration, setPlanDuration] = useState('12w');

  return (
    <ScreenShell
      title="Body Composition"
      subtitle="Help us understand where you're starting from."
      canContinue={recompFocus !== null}
      buttonLabel="Continue"
      onContinue={() =>
        onContinue({
          recompFocus,
          planDuration,
          recommendedWeeks: TIMELINE_WEEKS[planDuration] ?? 12,
        })
      }
    >
      <Text style={styles.sectionHeadingFirst}>What's your main focus?</Text>
      <Text style={styles.sectionSubtitle}>
        We'll adjust your plan balance accordingly.
      </Text>
      <View style={styles.cardsContainer}>
        {RECOMP_FOCUS_OPTIONS.map((opt) => {
          const selected = recompFocus === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.card, selected && styles.cardSelected]}
              onPress={() => setRecompFocus(opt.id)}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardLabel}>{opt.label}</Text>
                <Text style={styles.cardDetail}>{opt.detail}</Text>
              </View>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionHeading}>Plan Duration</Text>
      <Text style={styles.sectionSubtitle}>
        How many weeks do you want to commit to?
      </Text>
      <View style={styles.chipRow}>
        {PLAN_DURATION_OPTIONS.map((opt) => {
          const selected = planDuration === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[
                styles.chip,
                styles.chipDuration,
                selected && styles.chipSelected,
              ]}
              onPress={() => setPlanDuration(opt.id)}
            >
              <Text
                style={[
                  styles.chipText,
                  styles.chipTextCentered,
                  selected && styles.chipTextSelected,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {RECOMP_EXPECTATIONS[planDuration] && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardBody}>
            {RECOMP_EXPECTATIONS[planDuration]}
          </Text>
        </View>
      )}
    </ScreenShell>
  );
}

function GeneralContent({
  onContinue,
}: {
  onContinue: (params: Record<string, unknown>) => void;
}) {
  const [generalFocus, setGeneralFocus] = useState<string | null>(null);
  const [planDuration, setPlanDuration] = useState('8w');

  return (
    <ScreenShell
      title="General Fitness"
      subtitle="No specific targets needed — we'll build a balanced program to improve your overall fitness."
      canContinue
      buttonLabel="Let's Build My Plan"
      onContinue={() =>
        onContinue({
          generalFocus,
          planDuration,
          recommendedWeeks: TIMELINE_WEEKS[planDuration] ?? 12,
        })
      }
    >
      <View style={styles.infoCard}>
        <Text style={styles.infoCardBody}>
          Your plan will cover strength, conditioning, and mobility in a
          balanced weekly structure. Perfect for building a sustainable fitness
          habit.
        </Text>
      </View>

      <Text style={styles.sectionHeading}>
        What does fitness mean to you right now?
      </Text>
      <Text style={styles.sectionSubtitle}>
        This helps us personalise your program.
      </Text>
      <View style={styles.cardsContainer}>
        {GENERAL_FOCUS_OPTIONS.map((opt) => {
          const selected = generalFocus === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.card, selected && styles.cardSelected]}
              onPress={() => setGeneralFocus(opt.id)}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardLabel}>{opt.label}</Text>
                <Text style={styles.cardDetail}>{opt.detail}</Text>
              </View>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionHeading}>Plan Duration</Text>
      <Text style={styles.sectionSubtitle}>
        How many weeks do you want to commit to?
      </Text>
      <View style={styles.chipRow}>
        {GENERAL_PLAN_OPTIONS.map((opt) => {
          const selected = planDuration === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[
                styles.chip,
                styles.chipDuration,
                selected && styles.chipSelected,
              ]}
              onPress={() => setPlanDuration(opt.id)}
            >
              <Text
                style={[
                  styles.chipText,
                  styles.chipTextCentered,
                  selected && styles.chipTextSelected,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {GENERAL_EXPECTATIONS[planDuration] && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardBody}>
            {GENERAL_EXPECTATIONS[planDuration]}
          </Text>
        </View>
      )}
    </ScreenShell>
  );
}

function PowerHypertrophyContent({
  onContinue,
}: {
  onContinue: (params: Record<string, unknown>) => void;
}) {
  const [planDuration, setPlanDuration] = useState('12w');
  const [currentLifts, setCurrentLifts] = useState<{
    benchPress: number | null;
    backSquat: number | null;
    deadlift: number | null;
    overheadPress: number | null;
  }>({
    benchPress: null,
    backSquat: null,
    deadlift: null,
    overheadPress: null,
  });

  const selectedWeeks = TIMELINE_WEEKS[planDuration] ?? 12;

  const projLow = (selectedWeeks * 0.4).toFixed(0);
  const projHigh = (selectedWeeks * 3.0).toFixed(0);
  const leanLow = (selectedWeeks * 0.25).toFixed(1);
  const leanHigh = (selectedWeeks * 0.5).toFixed(1);

  const buildCurrentLifts = () => {
    const hasAny = Object.values(currentLifts).some((v) => v !== null);
    return hasAny ? currentLifts : null;
  };

  return (
    <ScreenShell
      title="Strength & Size"
      subtitle="Build serious strength on the big lifts while adding muscle everywhere else. Heavy compounds first, hypertrophy work second — the best of both."
      canContinue
      buttonLabel="Continue"
      onContinue={() =>
        onContinue({
          planDuration,
          recommendedWeeks: selectedWeeks,
          currentLifts: buildCurrentLifts(),
          currentSplit: null,
          currentSplitOther: null,
          splitDuration: null,
          trainingBackground: null,
        })
      }
    >
      <Text style={styles.sectionHeadingFirst}>CURRENT 1RM ESTIMATES</Text>
      <Text style={styles.phSubLabel}>
        Optional — rough estimates are fine. Jordan will calibrate from your Week 1 lifts.
      </Text>

      <View style={styles.phLiftBlock}>
        <Text style={styles.phLiftLabel}>BENCH PRESS</Text>
        <TextInput
          style={styles.phLiftInput}
          placeholder="Optional"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="numeric"
          value={currentLifts.benchPress?.toString() ?? ''}
          onChangeText={(v) => setCurrentLifts((prev) => ({ ...prev, benchPress: v ? parseInt(v, 10) : null }))}
        />
      </View>

      <View style={styles.phLiftBlock}>
        <Text style={styles.phLiftLabel}>BACK SQUAT</Text>
        <TextInput
          style={styles.phLiftInput}
          placeholder="Optional"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="numeric"
          value={currentLifts.backSquat?.toString() ?? ''}
          onChangeText={(v) => setCurrentLifts((prev) => ({ ...prev, backSquat: v ? parseInt(v, 10) : null }))}
        />
      </View>

      <View style={styles.phLiftBlock}>
        <Text style={styles.phLiftLabel}>DEADLIFT</Text>
        <TextInput
          style={styles.phLiftInput}
          placeholder="Optional"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="numeric"
          value={currentLifts.deadlift?.toString() ?? ''}
          onChangeText={(v) => setCurrentLifts((prev) => ({ ...prev, deadlift: v ? parseInt(v, 10) : null }))}
        />
      </View>

      <View style={styles.phLiftBlock}>
        <Text style={styles.phLiftLabel}>OVERHEAD PRESS</Text>
        <TextInput
          style={styles.phLiftInput}
          placeholder="Optional"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="numeric"
          value={currentLifts.overheadPress?.toString() ?? ''}
          onChangeText={(v) => setCurrentLifts((prev) => ({ ...prev, overheadPress: v ? parseInt(v, 10) : null }))}
        />
      </View>

      <Text style={styles.sectionHeading}>Plan Duration</Text>
      <View style={styles.chipRow}>
        {PLAN_DURATION_OPTIONS.map((opt) => {
          const selected = planDuration === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              activeOpacity={0.7}
              style={[styles.chip, styles.chipDuration, selected && styles.chipSelected]}
              onPress={() => setPlanDuration(opt.id)}
            >
              <Text style={[styles.chipText, styles.chipTextCentered, selected && styles.chipTextSelected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.phProjectionCard}>
        <View style={styles.phProjectionRow}>
          <Text style={styles.phProjectionLabel}>1RM GAIN</Text>
          <View style={styles.phProjectionRight}>
            <Text style={[styles.phProjectionValue, { color: Colors.warning }]}>
              +{projLow}–{projHigh} lbs
            </Text>
            <Text style={styles.phProjectionSub}>across your main lifts</Text>
          </View>
        </View>
        <View style={styles.phProjectionRow}>
          <Text style={styles.phProjectionLabel}>LEAN MASS</Text>
          <View style={styles.phProjectionRight}>
            <Text style={[styles.phProjectionValue, { color: Colors.success }]}>
              +{leanLow}–{leanHigh} lbs
            </Text>
            <Text style={styles.phProjectionSub}>estimated</Text>
          </View>
        </View>
        <Text style={styles.phProjectionDisclaimer}>
          Your exact results depend on your experience level and consistency.
        </Text>
      </View>

      <View style={styles.phJordanCard}>
        <Text style={styles.phJordanLabel}>JORDAN</Text>
        <Text style={styles.phJordanBody}>
          {
            "I'll program your compounds to get progressively heavier each week — both the weights and your technique. The size comes from the accessory work we stack on top."
          }
        </Text>
      </View>
    </ScreenShell>
  );
}

function ScreenShell({
  title,
  subtitle,
  canContinue,
  buttonLabel,
  onContinue,
  children,
}: {
  title: string;
  subtitle: string;
  canContinue: boolean;
  buttonLabel: string;
  onContinue: () => void;
  children: ReactNode;
}) {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();

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
        <Text style={styles.stepIndicator}>2 of 8</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBlock}>
          <Text style={styles.screenTitle}>{title}</Text>
          <Text style={styles.screenSubtitle}>{subtitle}</Text>
        </View>
        {children}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Spacing.xxxl + insets.bottom },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.button, !canContinue && styles.buttonDisabled]}
          onPress={onContinue}
          disabled={!canContinue}
        >
          <Text style={styles.buttonText}>{buttonLabel}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default function GoalDetailsScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { goal } = route.params;

  const handleContinue = (details: Record<string, unknown>) => {
    console.log('[GoalDetails] duration param:', {
      planDuration: details.planDuration,
      recommendedWeeks: details.recommendedWeeks,
      targetDate: details.targetDate,
    });
    navigation.navigate('Experience', { goal, ...details } as RootStackParamList['Experience']);
  };

  switch (goal) {
    case 'strength':
      return <StrengthContent onContinue={handleContinue} />;
    case 'power_hypertrophy':
      return <PowerHypertrophyContent onContinue={handleContinue} />;
    case 'hypertrophy':
      return <HypertrophyContent onContinue={handleContinue} />;
    case 'fat_loss':
      return <FatLossContent onContinue={handleContinue} />; 
    case 'recomp':
      return <RecompContent onContinue={handleContinue} />;
    case 'general':
    default:
      return <GeneralContent onContinue={handleContinue} />;
  }
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

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 200,
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
    marginBottom: 12,
    marginTop: 28,
  },
  sectionHeadingFirst: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 0,
  },
  sectionSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginBottom: 12,
    marginTop: 0,
  },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.danger,
    marginTop: 6,
  },

  cardsContainer: {
    gap: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  cardSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
  },
  cardContent: {
    flex: 1,
  },
  cardLabel: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
  },
  cardDetail: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: Colors.accent,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.accent,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipDuration: {
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
  },
  chipMaxed: {
    opacity: 0.4,
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  chipTextCentered: {
    textAlign: 'center',
  },
  chipTextSelected: {
    color: Colors.accent,
  },
  chipHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },

  subMuscleSection: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    paddingLeft: Spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: Colors.accentBorder,
  },
  subMuscleLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  subMuscleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: 4,
  },
  subMuscleChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  subMuscleChipSelected: {
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentMuted,
  },
  subMuscleChipText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  subMuscleChipTextSelected: {
    color: Colors.accent,
  },
  subMuscleTooltip: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 4,
  },

  trainingHistoryBlock: {
    marginTop: Spacing.xl,
  },
  trainingSectionHeading: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 0,
  },
  trainingHistorySubtext: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  trainingQuestion: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    marginBottom: 12,
    marginTop: 0,
  },
  trainingQuestionFollow: {
    marginTop: Spacing.md,
  },
  jordanInsightCard: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  jordanInsightText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  skipLinkHit: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    alignSelf: 'flex-start',
  },
  skipLinkText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
  },
  skipLinkDisabled: {
    opacity: 0.4,
  },
  skipLinkTextDisabled: {
    textDecorationLine: 'none',
  },
  splitOtherInput: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },

  inputFieldBlock: {
    marginBottom: 0,
  },
  inputFieldStack: {
    marginTop: Spacing.md,
  },
  inputLabel: {
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    fontFamily: Fonts.medium,
    marginBottom: Spacing.sm,
  },
  textInputField: {
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 14,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  textInputFocused: {
    borderColor: Colors.accent,
  },

  infoCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    marginTop: Spacing.md,
  },
  infoCardBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  infoHighlight: {
    color: Colors.accent,
    fontFamily: Fonts.bold,
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

  phSubLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    marginTop: 4,
  },
  phLiftBlock: {
    marginBottom: Spacing.md,
  },
  phLiftLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  phLiftInput: {
    height: 48,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.md,
  },
  phProjectionCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  phProjectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  phProjectionDivider: {
    height: 1,
    backgroundColor: Colors.divider,
  },
  phProjectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
  },
  phProjectionRight: {
    alignItems: 'flex-end',
  },
  phProjectionValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
  },
  phProjectionSub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  phProjectionDisclaimer: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: Spacing.md,
  },
  phJordanCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  phJordanLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  phJordanBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
});

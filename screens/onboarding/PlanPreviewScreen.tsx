import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import Purchases from 'react-native-purchases';
import type { PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { supabase } from '../../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';
import { formatSplitName } from '../../utils/splitRecommendation';
import type { SessionDay } from '../../utils/splitRecommendation';
import type { CaloriePace } from '../../utils/projections';
import {
  getFatLossProjection,
  getHypertrophyProjection,
  getStrengthProjection,
  getStrengthProjectionRange,
  getRecompBfProjection,
} from '../../utils/projections';
import ProjectionChart, {
  type ProjectionChartLine,
} from '../../components/ProjectionChart';

const CHART_ORANGE = '#F97316';
const CHART_GREEN = '#22C55E';
const CHART_AMBER = '#F59E0B';
const COLOR_PROTEIN = Colors.accent;
const COLOR_CARBS = Colors.warning;
const COLOR_FATS = Colors.success;

const MONTHLY_LEAN_MAP: Record<
  CaloriePace,
  Record<string, number>
> = {
  conservative: { beginner: 1.0, intermediate: 0.5, advanced: 0.25 },
  balanced: { beginner: 1.5, intermediate: 0.75, advanced: 0.4 },
  aggressive: { beginner: 2.5, intermediate: 1.25, advanced: 0.6 },
};

function normalizePace(p?: string): CaloriePace {
  if (p === 'conservative' || p === 'balanced' || p === 'aggressive') return p;
  return 'balanced';
}

function expKey(experience: string): string {
  const e = experience.toLowerCase();
  if (e === 'beginner' || e === 'intermediate' || e === 'advanced') return e;
  return 'intermediate';
}

type CalloutTriple = {
  col1: { label: string; value: string; sub?: string };
  col2: { label: string; value: string; sub?: string };
  col3: { label: string; value: string; sub?: string };
};

function buildProjectionBundle(params: RootStackParamList['PlanPreview']): {
  weeks: number;
  lines: ProjectionChartLine[];
  yMin: number;
  yMax: number;
  yLabel: string;
  targetValue?: number;
  callout: CalloutTriple;
  strengthGapAnnotate?: { current1RM: number; target1RM: number };
} {
  const weeks = params.recommendedWeeks ?? 12;
  const goal = params.goal;
  const caloriePace = normalizePace(params.caloriePace);

  if (goal === 'fat_loss') {
    const weightLbs = Number(
      params.weightLbs ?? params.startingWeightLbs ?? 180,
    );
    const active = getFatLossProjection(weightLbs, caloriePace, weeks);
    const endWeight = active[active.length - 1];
    const lines: ProjectionChartLine[] = [
      {
        data: active,
        color: CHART_ORANGE,
        strokeWidth: 2.5,
        animate: true,
      },
    ];
    const yMin = Math.min(...active) - 2;
    const yMax = weightLbs + 2;
    const rateStr =
      caloriePace === 'conservative'
        ? '0.5'
        : caloriePace === 'balanced'
          ? '0.75'
          : '1.1';
    return {
      weeks,
      lines,
      yMin,
      yMax,
      yLabel: 'lbs',
      callout: {
        col1: {
          label: 'End result',
          value: `${endWeight} lbs`,
          sub: `−${(weightLbs - endWeight).toFixed(1)} lbs total`,
        },
        col2: {
          label: 'Rate',
          value: `−${rateStr} lb`,
          sub: 'per week',
        },
        col3: { label: 'Plan length', value: `${weeks} wks` },
      },
    };
  }

  if (goal === 'hypertrophy') {
    const exp = expKey(params.experience ?? 'intermediate');
    const active = getHypertrophyProjection(
      params.experience ?? 'intermediate',
      caloriePace,
      weeks,
    );
    const endGain = active[active.length - 1];
    const lines: ProjectionChartLine[] = [
      {
        data: active,
        color: CHART_GREEN,
        strokeWidth: 2.5,
        animate: true,
      },
    ];
    const monthly = MONTHLY_LEAN_MAP[caloriePace][exp] ?? 0.75;
    const yMax = Math.max(...active, 0.5) * 1.15;
    return {
      weeks,
      lines,
      yMin: 0,
      yMax,
      yLabel: 'lbs',
      callout: {
        col1: {
          label: 'End result',
          value: `+${endGain.toFixed(1)} lbs`,
          sub: 'lean mass (est.)',
        },
        col2: {
          label: 'Rate',
          value: `+${monthly.toFixed(1)} lb`,
          sub: 'per month',
        },
        col3: { label: 'Plan length', value: `${weeks} wks` },
      },
    };
  }

  if (goal === 'strength') {
    const current = Number(params.current1RM ?? 0) || 185;
    const target = Number(params.target1RM ?? current * 1.1);
    const experience = params.experience ?? 'intermediate';
    const data = getStrengthProjection(current, experience, weeks);
    const end = data[data.length - 1];
    const { low, high } = getStrengthProjectionRange(current, target, weeks);
    const lines: ProjectionChartLine[] = [
      {
        data,
        color: CHART_AMBER,
        strokeWidth: 2.5,
        animate: true,
      },
    ];
    const yPadding = Math.max(15, (target - current) * 0.3);
    const yMin = current - yPadding;
    const yMax = target + yPadding;
    return {
      weeks,
      lines,
      yMin,
      yMax,
      yLabel: 'lbs',
      targetValue: target,
      strengthGapAnnotate: { current1RM: current, target1RM: target },
      callout: {
        col1: {
          label: 'End result',
          value: `${end} lbs / ${target} goal`,
          sub: 'projected vs target',
        },
        col2: {
          label: 'Rate',
          value: `+${low}–${high} lbs`,
          sub: 'depending on experience',
        },
        col3: { label: 'Plan length', value: `${weeks} wks` },
      },
    };
  }

  if (goal === 'recomp') {
    const w = Number(params.weightLbs ?? 180);
    const bfStart = Number(
      params.bodyFatPct != null && String(params.bodyFatPct).trim() !== ''
        ? params.bodyFatPct
        : 18,
    );
    const bfLine = getRecompBfProjection(weeks, bfStart);
    const endBf = bfLine[bfLine.length - 1];
    const drop = bfStart - endBf;
    const lines: ProjectionChartLine[] = [
      {
        data: bfLine,
        color: CHART_GREEN,
        strokeWidth: 2.5,
        animate: true,
      },
    ];
    return {
      weeks,
      lines,
      yMin: Math.min(endBf, bfStart) - 0.5,
      yMax: bfStart + 1,
      yLabel: '% BF',
      callout: {
        col1: {
          label: 'End result',
          value: `~${w} lbs`,
          sub: 'weight steady',
        },
        col2: {
          label: 'Rate',
          value: `−${drop.toFixed(1)}%`,
          sub: 'body fat (est.)',
        },
        col3: { label: 'Plan length', value: `${weeks} wks` },
      },
    };
  }

  // general (and fallback)
  const lines: ProjectionChartLine[] = [
    {
      data: Array.from({ length: weeks + 1 }, (_, i) =>
        Math.round(i * 1.2 * 10) / 10,
      ),
      color: CHART_ORANGE,
      strokeWidth: 2.5,
      animate: true,
    },
  ];
  const end = lines[0].data[lines[0].data.length - 1];
  return {
    weeks,
    lines,
    yMin: 0,
    yMax: Math.max(end * 1.2, 5),
    yLabel: 'index',
    callout: {
      col1: {
        label: 'End result',
        value: 'Stronger base',
        sub: 'training capacity',
      },
      col2: {
        label: 'Rate',
        value: `+${end.toFixed(1)}`,
        sub: 'progress index',
      },
      col3: { label: 'Plan length', value: `${weeks} wks` },
    },
  };
}

function formatPaceLabel(
  pace: CaloriePace,
  goal: string,
): string | null {
  if (goal === 'fat_loss') {
    if (pace === 'conservative') return 'Conservative  −250 cal/day';
    if (pace === 'balanced') return 'Balanced  −400 cal/day';
    if (pace === 'aggressive') return 'Aggressive  −600 cal/day';
  }
  if (goal === 'hypertrophy') {
    if (pace === 'conservative') return 'Lean Bulk  +200 cal/day';
    if (pace === 'balanced') return 'Moderate  +300 cal/day';
    if (pace === 'aggressive') return 'Aggressive  +500 cal/day';
  }
  return null;
}

type NavProp = NativeStackNavigationProp<RootStackParamList, 'PlanPreview'>;
type RouteType = RouteProp<RootStackParamList, 'PlanPreview'>;

type PlanOption = 'monthly' | 'annual';

function formatGoal(goal: string): string {
  switch (goal) {
    case 'fat_loss':
      return 'Fat Loss';
    case 'hypertrophy':
      return 'Hypertrophy';
    case 'strength':
      return 'Strength';
    case 'recomp':
      return 'Body Recomp';
    case 'general':
      return 'General Fitness';
    default:
      return goal.charAt(0).toUpperCase() + goal.slice(1);
  }
}

function formatExperience(exp: string): string {
  return exp.charAt(0).toUpperCase() + exp.slice(1);
}

function formatLift(lift: string): string {
  switch (lift) {
    case 'bench_press':
      return 'Bench Press';
    case 'squat':
      return 'Back Squat';
    case 'deadlift':
      return 'Deadlift';
    case 'ohp':
      return 'Overhead Press';
    default:
      return lift.charAt(0).toUpperCase() + lift.slice(1);
  }
}

function formatEquipment(equipment: string): string {
  switch (equipment) {
    case 'full_gym':
      return 'Full Gym';
    case 'home_gym':
      return 'Home Gym';
    case 'dumbbells':
      return 'Dumbbells Only';
    case 'bodyweight':
      return 'Bodyweight';
    default:
      return equipment.charAt(0).toUpperCase() + equipment.slice(1);
  }
}

function formatSessionTitle(session: any): string {
  // Use explicit title if it exists and isn't snake_case
  if (session.title && !session.title.includes('_')) return session.title;

  // Map known focus IDs to display titles
  const focusMap: Record<string, string> = {
    // Full body
    full_body_a: 'Full Body A',
    full_body_b: 'Full Body B',
    full_body: 'Full Body',

    // Upper / Lower
    upper: 'Upper Body',
    lower: 'Lower Body',
    upper_heavy: 'Upper Body — Power',
    upper_volume: 'Upper Body — Volume',
    upper_hypertrophy: 'Upper Body — Hypertrophy',
    lower_heavy: 'Lower Body — Power',
    lower_volume: 'Lower Body — Volume',
    lower_hypertrophy: 'Lower Body — Hypertrophy',

    // PPL
    push: 'Push — Chest & Shoulders',
    pull: 'Pull — Back & Biceps',
    legs: 'Legs',
    push_a: 'Push A — Heavy',
    push_b: 'Push B — Volume',
    pull_a: 'Pull A — Heavy',
    pull_b: 'Pull B — Volume',
    legs_a: 'Legs — Quad Focus',
    legs_b: 'Legs — Posterior Chain',

    // Specialty
    arms: 'Arms & Core',
    arms_core: 'Arms & Core',
    chest_back: 'Chest & Back',
    chest_back_heavy: 'Chest & Back — Heavy',
    chest_back_volume: 'Chest & Back — Volume',
    shoulders_arms: 'Shoulders & Arms',
    legs_shoulders: 'Legs & Shoulders',

    // Strength
    heavy_lift: 'Heavy Lift Day',
    volume_lift: 'Volume Lift Day',
    accessory: 'Accessory Day',
  };

  const key = session.focus?.toLowerCase().replace(/\s+/g, '_') ?? '';
  if (focusMap[key]) return focusMap[key];

  // Fallback: capitalise words and replace underscores
  return key
    .split('_')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function updateSupabaseSubscription(customerInfo: CustomerInfo): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const activeEntitlement = customerInfo.entitlements.active['pro'];
    await supabase
      .from('users')
      .update({
        subscription_status: 'pro',
        subscription_tier: activeEntitlement?.identifier ?? 'pro',
      })
      .eq('id', user.id);
  } catch (e) {
    console.error('updateSupabaseSubscription error:', e);
  }
}

export default function PlanPreviewScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const params = route.params;
  const { sessionStructure, trainingDays, splitName } = params;
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = Math.max(200, windowWidth - Spacing.xl * 2);

  const projection = useMemo(() => buildProjectionBundle(params), [params]);

  const buildingPlanParams = useMemo(
    () => ({ ...params, caloriePace: normalizePace(params.caloriePace) }),
    [params],
  );

  const paceReadOnlyLabel = formatPaceLabel(
    normalizePace(params.caloriePace),
    params.goal,
  );

  const recompBfStartForChart =
    params.goal === 'recomp'
      ? Number(
          params.bodyFatPct != null && String(params.bodyFatPct).trim() !== ''
            ? params.bodyFatPct
            : 18,
        )
      : 22;

  const [selectedPlan, setSelectedPlan] = useState<PlanOption>('annual');

  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [annualPackage, setAnnualPackage] = useState<PurchasesPackage | null>(null);
  const [isLoadingOfferings, setIsLoadingOfferings] = useState(true);
  const [offeringsError, setOfferingsError] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);

  const fetchOfferings = useCallback(async () => {
    setIsLoadingOfferings(true);
    setOfferingsError(false);
    try {
      const offerings = await Purchases.getOfferings();
      if (offerings.current) {
        setMonthlyPackage(offerings.current.monthly ?? null);
        setAnnualPackage(offerings.current.annual ?? null);
      }
    } catch {
      setOfferingsError(true);
    } finally {
      setIsLoadingOfferings(false);
    }
  }, []);

  useEffect(() => {
    fetchOfferings();
  }, [fetchOfferings]);

  const handlePurchase = async () => {
    if (Platform.OS === 'web') {
      console.log('[PlanPreview] duration in params:', {
        planDuration: params.planDuration,
        recommendedWeeks: params.recommendedWeeks,
        targetDate: params.targetDate,
      });
      navigation.navigate('BuildingPlan', buildingPlanParams);
      return;
    }
    const pkg = selectedPlan === 'monthly' ? monthlyPackage : annualPackage;
    if (!pkg) return;
    setIsPurchasing(true);
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (customerInfo.entitlements.active['pro']) {
        await updateSupabaseSubscription(customerInfo);
        console.log('[PlanPreview] duration in params:', {
          planDuration: params.planDuration,
          recommendedWeeks: params.recommendedWeeks,
          targetDate: params.targetDate,
        });
        navigation.navigate('BuildingPlan', buildingPlanParams);
      }
    } catch (e: unknown) {
      const err = e as { userCancelled?: boolean; message?: string };
      if (err.userCancelled) return;
      Alert.alert('Purchase Failed', err.message ?? 'Something went wrong.');
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsPurchasing(true);
    try {
      const customerInfo = await Purchases.restorePurchases();
      if (customerInfo.entitlements.active['pro']) {
        await updateSupabaseSubscription(customerInfo);
        console.log('[PlanPreview] duration in params:', {
          planDuration: params.planDuration,
          recommendedWeeks: params.recommendedWeeks,
          targetDate: params.targetDate,
        });
        navigation.navigate('BuildingPlan', buildingPlanParams);
      } else {
        Alert.alert('No active subscription found');
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert('Restore Failed', err.message ?? 'Something went wrong.');
    } finally {
      setIsPurchasing(false);
    }
  };

  const stats: { label: string; value: string }[] = [
    { label: 'Goal', value: formatGoal(params.goal) },
    { label: 'Experience', value: formatExperience(params.experience) },
    {
      label: 'Training days',
      value:
        params.trainingDays?.length > 0
          ? `${params.daysPerWeek} days/week (${params.trainingDays.join(', ')})`
          : `${params.daysPerWeek} days / week`,
    },
    { label: 'Session length', value: params.sessionLength },
    { label: 'Equipment', value: formatEquipment(params.equipment) },
    {
      label: 'Split',
      value: splitName ?? formatSplitName(params.splitId),
    },
  ];

  if (params.goal === 'strength' && params.targetLift) {
    stats.push({ label: 'Target Lift', value: formatLift(params.targetLift) });
  }
  if (params.goal === 'strength' && params.current1RM && params.target1RM) {
    stats.push({ label: '1RM Goal', value: `${params.current1RM} → ${params.target1RM} lbs` });
  }
  if (params.goal === 'strength') {
    const secondaryLabel =
      !params.secondaryLift || params.secondaryLift === 'none'
        ? 'None'
        : formatLift(params.secondaryLift);
    stats.push({ label: 'Secondary Lift', value: secondaryLabel });
  }
  if (params.goal === 'hypertrophy') {
    stats.push({
      label: 'Priority Muscles',
      value: params.priorityMuscles?.length ? params.priorityMuscles.join(', ') : 'Not specified',
    });
  }
  if (params.goal === 'fat_loss' && params.startingWeightLbs) {
    stats.push({ label: 'Starting Weight', value: `${params.startingWeightLbs} lbs` });
  }
  if (params.goal === 'fat_loss' && params.targetWeightLbs) {
    stats.push({ label: 'Target Weight', value: `${params.targetWeightLbs} lbs` });
  }
  if (params.goal === 'fat_loss' && params.targetDate) {
    stats.push({ label: 'Timeline', value: params.targetDate.replace('w', ' Weeks') });
  }
  if (params.goal === 'recomp' && params.recompFocus) {
    const focusLabel =
      params.recompFocus === 'lose_fat' ? 'Prioritise Fat Loss' :
      params.recompFocus === 'gain_muscle' ? 'Prioritise Muscle Gain' :
      params.recompFocus;
    stats.push({ label: 'Focus', value: focusLabel });
  }
  if (params.goal === 'general' && params.generalFocus) {
    const motivationLabel =
      params.generalFocus === 'habit' ? 'Build Consistency' :
      params.generalFocus === 'strength' ? 'Get Stronger & Fitter' :
      params.generalFocus === 'wellbeing' ? 'Feel Better & Move' :
      params.generalFocus === 'event' ? 'Event Preparation' :
      params.generalFocus;
    stats.push({ label: 'Motivation', value: motivationLabel });
  }

  const PLAN_DURATION_LABELS: Record<string, string> = {
    '4w': '4 Weeks',
    '8w': '8 Weeks',
    '12w': '12 Weeks',
    '16w': '16 Weeks',
    '24w': '24 Weeks',
  };
  stats.push({
    label: 'Plan length',
    value: params.planDuration ? (PLAN_DURATION_LABELS[params.planDuration] ?? '8 Weeks') : '8 Weeks',
  });

  const sampleDays = (sessionStructure ?? [])
    .filter((session: SessionDay) => session.type === 'workout')
    .map((session: SessionDay, index: number) => ({
      dayNumber: index + 1,
      title: formatSessionTitle(session),
      muscles: (session.primaryMuscles ?? []).map(
        (m: string) => m.charAt(0).toUpperCase() + m.slice(1),
      ),
      actualDay: trainingDays?.[index] ?? null,
    }));

  const structureSlots = (sessionStructure ?? []).length;
  const moreDaysCount =
    structureSlots > 0 ? structureSlots - sampleDays.length : 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={[
          styles.backAbsolute,
          { top: insets.top + Spacing.sm },
        ]}
        activeOpacity={0.7}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.backArrow}>{'‹'}</Text>
      </TouchableOpacity>

      <Text
        style={[
          styles.stepIndicatorAbsolute,
          { top: insets.top + Spacing.sm },
        ]}
      >
        8 of 8
      </Text>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + Spacing.sm },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.projectionHeader}>
          <Text style={styles.projectionTitle}>
            Your {projection.weeks}-week projection
          </Text>
          <Text style={styles.screenSubtitle}>
            Here&apos;s what we&apos;ve built for you.
          </Text>
        </View>

        {paceReadOnlyLabel ? (
          <View style={styles.paceReadOnly}>
            <Text style={styles.paceReadOnlyLabel}>PACE</Text>
            <View style={styles.paceReadOnlyBadge}>
              <Text style={styles.paceReadOnlyText}>{paceReadOnlyLabel}</Text>
            </View>
          </View>
        ) : null}

        <ProjectionChart
          width={chartWidth}
          height={200}
          weeks={projection.weeks}
          yMin={projection.yMin}
          yMax={projection.yMax}
          yLabel={projection.yLabel}
          lines={projection.lines}
          targetValue={projection.targetValue}
          chartGoal={
            params.goal === 'fat_loss' ||
            params.goal === 'hypertrophy' ||
            params.goal === 'strength' ||
            params.goal === 'recomp' ||
            params.goal === 'general'
              ? params.goal
              : null
          }
          recompBfStart={recompBfStartForChart}
          strengthGapAnnotate={projection.strengthGapAnnotate}
        />

        <View style={styles.calloutStrip}>
          {(
            [
              projection.callout.col1,
              projection.callout.col2,
              projection.callout.col3,
            ] as const
          ).map((col, idx) => (
            <View key={idx} style={styles.calloutCol}>
              <Text style={styles.calloutColLabel}>{col.label}</Text>
              <Text style={styles.calloutColValue}>{col.value}</Text>
              {col.sub ? (
                <Text style={styles.calloutColSub}>{col.sub}</Text>
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.statsGrid}>
            {stats.map((stat) => (
              <View key={stat.label} style={styles.statCell}>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={styles.statValue}>{stat.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.sectionLabel}>Sample Week</Text>

        {sampleDays.map((item) => (
          <View key={`sample-day-${item.dayNumber}`} style={styles.dayCard}>
            <Text style={styles.sampleDayHeading}>
              DAY {item.dayNumber}
            </Text>
            <Text style={styles.sampleDayTitle}>{item.title}</Text>
            {item.actualDay ? (
              <Text style={styles.sampleDayCalendar}>{item.actualDay}</Text>
            ) : null}
            <View style={styles.muscleChipRow}>
              {item.muscles.map((muscle) => (
                <View key={`${item.dayNumber}-${muscle}`} style={styles.muscleChip}>
                  <Text style={styles.muscleChipText}>{muscle}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {moreDaysCount > 0 ? (
          <Text style={styles.moreDays}>
            + {moreDaysCount} more day{moreDaysCount === 1 ? '' : 's'} visible after
            unlocking
          </Text>
        ) : null}

        <Text style={styles.sectionLabelNutrition}>Your Daily Nutrition</Text>

        <View style={styles.nutritionBlock}>
          <View style={styles.caloriesBlock}>
            <Text style={styles.caloriesNumber}>{params.calories}</Text>
            <Text style={styles.caloriesKcal}> kcal</Text>
          </View>

          <View style={styles.macroRow}>
            <View style={styles.macroCard}>
              <View style={styles.macroAmountRow}>
                <Text style={[styles.macroAmount, { color: COLOR_PROTEIN }]}>
                  {params.proteinG}
                </Text>
                <Text style={[styles.macroGSuffix, { color: COLOR_PROTEIN }]}>
                  g
                </Text>
              </View>
              <Text style={styles.macroName}>Protein</Text>
            </View>
            <View style={styles.macroCard}>
              <View style={styles.macroAmountRow}>
                <Text style={[styles.macroAmount, { color: COLOR_CARBS }]}>
                  {params.carbsG}
                </Text>
                <Text style={[styles.macroGSuffix, { color: COLOR_CARBS }]}>
                  g
                </Text>
              </View>
              <Text style={styles.macroName}>Carbs</Text>
            </View>
            <View style={styles.macroCard}>
              <View style={styles.macroAmountRow}>
                <Text style={[styles.macroAmount, { color: COLOR_FATS }]}>
                  {params.fatsG}
                </Text>
                <Text style={[styles.macroGSuffix, { color: COLOR_FATS }]}>
                  g
                </Text>
              </View>
              <Text style={styles.macroName}>Fats</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: 36 + insets.bottom },
        ]}
      >
        <Text style={styles.socialProof}>
          Join thousands of athletes training smarter
        </Text>

        <View style={styles.pricingRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.planCard,
              styles.planCardFill,
              selectedPlan === 'monthly'
                ? styles.planCardSelected
                : styles.planCardUnselected,
            ]}
            onPress={() => setSelectedPlan('monthly')}
          >
            <Text style={styles.planName}>Monthly</Text>
            <Text style={styles.planPrice}>$14.99</Text>
            <Text style={styles.planSubMicro}>per month</Text>
          </TouchableOpacity>

          <View style={styles.annualWrap}>
            {selectedPlan === 'annual' ? (
              <View style={styles.bestValueBadge}>
                <Text style={styles.bestValueText}>BEST VALUE</Text>
              </View>
            ) : null}
            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.planCard,
                styles.planCardFill,
                selectedPlan === 'annual'
                  ? styles.planCardSelected
                  : styles.planCardUnselected,
              ]}
              onPress={() => setSelectedPlan('annual')}
            >
              <Text style={styles.planName}>Annual</Text>
              <Text style={styles.planPrice}>$99.99</Text>
              <Text style={styles.planSubMicro}>~$8.33 / month</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          style={[
            styles.ctaButton,
            Platform.OS === 'web' && styles.ctaButtonDev,
            Platform.OS !== 'web' && (isPurchasing || isLoadingOfferings) && styles.ctaButtonDisabled,
          ]}
          onPress={Platform.OS !== 'web' && offeringsError ? fetchOfferings : handlePurchase}
          disabled={Platform.OS !== 'web' && (isPurchasing || isLoadingOfferings)}
        >
          {Platform.OS === 'web' ? (
            <Text style={styles.ctaText}>Continue (Dev Mode)</Text>
          ) : isPurchasing ? (
            <ActivityIndicator color={Colors.textPrimary} />
          ) : isLoadingOfferings ? (
            <Text style={styles.ctaText}>Loading...</Text>
          ) : offeringsError ? (
            <Text style={styles.ctaText}>Unable to load — tap to retry</Text>
          ) : (
            <Text style={styles.ctaText}>Start My Plan — Free 7-Day Trial</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.finePrint}>
          Cancel anytime. Billed annually. Recurring subscription.
        </Text>

        <TouchableOpacity onPress={handleRestore} activeOpacity={0.7}>
          <Text style={styles.restoreLink}>Restore purchases</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },

  backAbsolute: {
    position: 'absolute',
    left: Spacing.xl,
    zIndex: 10,
    paddingRight: 8,
  },
  backArrow: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    color: Colors.accent,
  },
  stepIndicatorAbsolute: {
    position: 'absolute',
    right: Spacing.xl,
    zIndex: 10,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },

  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 320,
  },

  projectionHeader: {
    marginTop: 56,
    paddingHorizontal: 0,
  },
  projectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  screenSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginTop: 0,
  },

  paceReadOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing.sm,
  },
  paceReadOnlyLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
  },
  paceReadOnlyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentMuted,
  },
  paceReadOnlyText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },

  calloutStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  calloutCol: {
    flex: 1,
    alignItems: 'center',
  },
  calloutColLabel: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 4,
  },
  calloutColValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  calloutColSub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 14,
  },

  summaryCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 20,
    marginTop: 0,
    marginHorizontal: 0,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statCell: {
    width: '50%',
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  statLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  statValue: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    marginTop: 2,
  },

  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 28,
    marginHorizontal: 0,
    marginBottom: Spacing.sm,
  },
  sectionLabelNutrition: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: Spacing.sm,
  },

  dayCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    marginHorizontal: 0,
    marginBottom: Spacing.sm,
  },
  sampleDayHeading: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sampleDayTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    marginTop: 4,
  },
  sampleDayCalendar: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  muscleChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  muscleChip: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  muscleChipText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  moreDays: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 8,
  },

  nutritionBlock: {
    marginHorizontal: 0,
    marginTop: Spacing.md,
  },
  caloriesBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  caloriesNumber: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.display,
    color: Colors.textPrimary,
  },
  caloriesKcal: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 8,
  },
  macroCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  macroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  macroAmount: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
  },
  macroGSuffix: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    marginLeft: 2,
  },
  macroName: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 4,
  },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  socialProof: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  pricingRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  planCard: {
    flex: 1,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  planCardFill: {
    alignSelf: 'stretch',
  },
  planCardUnselected: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  planCardSelected: {
    backgroundColor: Colors.accentMuted,
    borderWidth: 1.5,
    borderColor: Colors.accentBorder,
  },
  annualWrap: {
    flex: 1,
    position: 'relative',
    alignSelf: 'stretch',
  },
  bestValueBadge: {
    position: 'absolute',
    top: -6,
    right: Spacing.sm,
    zIndex: 2,
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  bestValueText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.textPrimary,
  },
  planName: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  planPrice: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  planSubMicro: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  ctaButton: {
    height: 60,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  ctaButtonDev: {
    opacity: 0.7,
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  finePrint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 10,
  },
  restoreLink: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
});

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
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

const COLOR_PROTEIN = Colors.accent;
const COLOR_CARBS = Colors.warning;
const COLOR_FATS = Colors.success;

type NavProp = NativeStackNavigationProp<RootStackParamList, 'PlanPreview'>;
type RouteType = RouteProp<RootStackParamList, 'PlanPreview'>;

type PlanOption = 'monthly' | 'annual';

interface SampleDay {
  day: string;
  workout: string;
  tags: string[];
}

const SAMPLE_DAYS: SampleDay[] = [
  {
    day: 'Day 1',
    workout: 'Push — Chest & Shoulders',
    tags: ['Chest', 'Shoulders', 'Triceps'],
  },
  {
    day: 'Day 2',
    workout: 'Pull — Back & Biceps',
    tags: ['Back', 'Biceps', 'Rear Delts'],
  },
  {
    day: 'Day 3',
    workout: 'Legs — Quad Focus',
    tags: ['Quads', 'Hamstrings', 'Glutes'],
  },
  {
    day: 'Day 4',
    workout: 'Upper Body — Strength',
    tags: ['Chest', 'Back', 'Shoulders'],
  },
];

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
  const insets = useSafeAreaInsets();

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
      navigation.navigate('BuildingPlan', { ...params });
      return;
    }
    const pkg = selectedPlan === 'monthly' ? monthlyPackage : annualPackage;
    if (!pkg) return;
    setIsPurchasing(true);
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (customerInfo.entitlements.active['pro']) {
        await updateSupabaseSubscription(customerInfo);
        navigation.navigate('BuildingPlan', { ...params });
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
        navigation.navigate('BuildingPlan', { ...params });
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
      value: params.splitName ?? formatSplitName(params.splitId),
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
        <View style={styles.titleBlock}>
          <Text style={styles.screenTitle}>Your Plan is Ready</Text>
          <Text style={styles.screenSubtitle}>
            Here's what we've built for you.
          </Text>
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

        {SAMPLE_DAYS.map((item) => (
          <View key={item.day} style={styles.dayCard}>
            <Text style={styles.dayLabel}>{item.day}</Text>
            <Text style={styles.workoutName}>{item.workout}</Text>
            <View style={styles.tagRow}>
              {item.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.moreDays}>+ 4 more days visible after unlocking</Text>

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

  titleBlock: {
    marginTop: 56,
    paddingHorizontal: 0,
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
  },

  summaryCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 20,
    marginTop: 24,
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
  dayLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textTertiary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  workoutName: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    marginTop: 4,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: Spacing.xs,
  },
  tag: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
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

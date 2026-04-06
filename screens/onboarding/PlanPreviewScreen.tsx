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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import InfoTooltip from '../../components/InfoTooltip';
import Purchases from 'react-native-purchases';
import type { PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { supabase } from '../../Lib/supabase';
import { Colors } from '../../constants/design';

const COLOR_PROTEIN = Colors.accent;
const COLOR_CARBS = Colors.warning;
const COLOR_FATS = '#10B981'; // TODO: map to design token

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

function formatSplit(split: string): string {
  switch (split) {
    case 'ppl':
      return 'Push/Pull/Legs';
    case 'upper_lower':
      return 'Upper/Lower';
    case 'full_body':
      return 'Full Body';
    case 'bro_split':
      return 'Bro Split';
    case 'custom':
      return 'Custom';
    default:
      return split.charAt(0).toUpperCase() + split.slice(1);
  }
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
    { label: 'Training days', value: `${params.daysPerWeek} days / week` },
    { label: 'Session length', value: params.sessionLength },
    { label: 'Equipment', value: formatEquipment(params.equipment) },
    { label: 'Split', value: formatSplit(params.split) },
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
      {/* Header row: back button only (no progress bar) */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Text style={styles.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={styles.title}>Your Plan is Ready</Text>
        <Text style={styles.subtitle}>Here's what we've built for you.</Text>

        {/* Section 1 — Goal Summary Card */}
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

        {/* Section 2 — Sample Weekly Schedule */}
        <View style={styles.headingRow}>
          <Text style={[styles.heading, styles.sectionGap]}>Sample Week</Text>
          <InfoTooltip
            title="Why is this a sample?"
            content="Your actual plan is generated by AI based on your specific goals, equipment and experience level. It adapts every week based on how you perform. The sample shows the structure — the real plan unlocks after subscribing."
          />
        </View>
        <Text style={styles.sectionSubtitle}>
          Your actual plan adapts weekly based on performance.
        </Text>

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

        {/* Section 3 — Macro Summary */}
        <Text style={[styles.heading, styles.sectionGap]}>
          Your Daily Nutrition
        </Text>

        <View style={styles.caloriesRow}>
          <Text style={styles.caloriesNumber}>{params.calories}</Text>
          <Text style={styles.caloriesUnit}> kcal</Text>
        </View>

        <View style={styles.macroRow}>
          <View style={styles.macroCard}>
            <View style={styles.macroNumberRow}>
              <Text style={[styles.macroNumber, { color: COLOR_PROTEIN }]}>
                {params.proteinG}
              </Text>
              <Text style={styles.macroUnit}>g</Text>
            </View>
            <Text style={styles.macroLabel}>Protein</Text>
          </View>
          <View style={styles.macroCard}>
            <View style={styles.macroNumberRow}>
              <Text style={[styles.macroNumber, { color: COLOR_CARBS }]}>
                {params.carbsG}
              </Text>
              <Text style={styles.macroUnit}>g</Text>
            </View>
            <Text style={styles.macroLabel}>Carbs</Text>
          </View>
          <View style={styles.macroCard}>
            <View style={styles.macroNumberRow}>
              <Text style={[styles.macroNumber, { color: COLOR_FATS }]}>
                {params.fatsG}
              </Text>
              <Text style={styles.macroUnit}>g</Text>
            </View>
            <Text style={styles.macroLabel}>Fats</Text>
          </View>
        </View>
      </ScrollView>

      {/* Fixed paywall footer */}
      {/* RevenueCat wired — v1.1 */}
      {/* Entitlement key: 'pro' */}
      {/* Offerings fetched on mount, packages stored in state */}
      <View style={styles.footer}>
        {/* Pricing row */}
        <View style={styles.pricingRow}>
          {/* Monthly option */}
          <View style={styles.monthlyWrapper}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.planCard,
                selectedPlan === 'monthly' && styles.planCardSelected,
              ]}
              onPress={() => setSelectedPlan('monthly')}
            >
              <Text style={styles.planName}>Monthly</Text>
              <Text style={styles.planPrice}>$14.99</Text>
              <Text style={styles.planSub}>per month</Text>
            </TouchableOpacity>
          </View>

          {/* Annual option */}
          <View style={styles.annualWrapper}>
            <View style={styles.bestValueBadge}>
              <Text style={styles.bestValueText}>BEST VALUE</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.planCard,
                selectedPlan === 'annual' && styles.planCardSelected,
              ]}
              onPress={() => setSelectedPlan('annual')}
            >
              <Text style={styles.planName}>Annual</Text>
              <Text style={styles.planPrice}>$99.99</Text>
              <Text style={styles.planSub}>~$8.33 / month</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* CTA button */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={[
            styles.ctaButton,
            Platform.OS !== 'web' && (isPurchasing || isLoadingOfferings) && styles.ctaButtonDisabled,
          ]}
          onPress={Platform.OS !== 'web' && offeringsError ? fetchOfferings : handlePurchase}
          disabled={Platform.OS !== 'web' && (isPurchasing || isLoadingOfferings)}
        >
          {Platform.OS === 'web' ? (
            <Text style={styles.ctaText}>Continue (Dev Mode)</Text>
          ) : isPurchasing ? (
            <ActivityIndicator color="#FFFFFF" /* TODO: map to design token */ />
          ) : isLoadingOfferings ? (
            <Text style={styles.ctaText}>Loading...</Text>
          ) : offeringsError ? (
            <Text style={styles.ctaText}>Unable to load — tap to retry</Text>
          ) : (
            <Text style={styles.ctaText}>Start My Plan — Free 7-Day Trial</Text>
          )}
        </TouchableOpacity>

        {/* Fine print */}
        <Text style={styles.finePrint}>
          Cancel anytime. Billed annually. Recurring subscription.
        </Text>

        {/* Restore purchases */}
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

  /* Header */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 60,
    marginHorizontal: 24,
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
    fontSize: 22,
    color: Colors.textPrimary,
    marginTop: -2,
  },

  /* Scroll */
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 280,
  },

  /* Title */
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 24,
  },

  /* Summary card */
  summaryCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statCell: {
    width: '50%',
    paddingVertical: 8,
    paddingRight: 8,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },

  /* Section headings */
  sectionGap: {
    marginTop: 28,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 14,
  },

  /* Day cards */
  dayCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  workoutName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: Colors.accentMuted,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 11,
    color: Colors.accent,
    fontWeight: '500',
  },
  moreDays: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },

  /* Calories */
  caloriesRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  caloriesNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.textPrimary,
    lineHeight: 36,
  },
  caloriesUnit: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginBottom: 2,
  },

  /* Macro row */
  macroRow: {
    flexDirection: 'row',
    gap: 10,
  },
  macroCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  macroNumberRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  macroNumber: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  macroUnit: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginLeft: 2,
    marginBottom: 2,
  },
  macroLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },

  /* Fixed footer */
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: '#2D3748', // TODO: map to design token
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },

  /* Pricing row */
  pricingRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  monthlyWrapper: {
    flex: 1,
  },
  annualWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  bestValueBadge: {
    backgroundColor: Colors.accent,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  bestValueText: {
    fontSize: 10,
    color: '#FFFFFF', // TODO: map to design token
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  planCard: {
    width: '100%',
    backgroundColor: Colors.bgPrimary,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 90,
  },
  planCardSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentMuted,
  },
  planName: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  planPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  planSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  /* CTA */
  ctaButton: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  finePrint: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  restoreLink: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
});

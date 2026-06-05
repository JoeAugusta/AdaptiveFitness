import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList, SubscriptionPlanId } from '../../navigation/types';
import { BETA_BYPASS } from '../../constants/betaBypass';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';
import { JordanAvatar } from '../../components/JordanAvatar';
import { useEntitlement } from '../../hooks/useEntitlement';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Pricing'>;
type RouteType = RouteProp<RootStackParamList, 'Pricing'>;

const FEATURES = [
  'Weights that adapt to your effort every week',
  'Coaching on every set, not just check-ins',
  'Monthly progress check-ins to keep you on track',
  'Goal tracking with a clear path to get there',
  "Weekly breakdown of what's working and what's next",
] as const;

type PlanCardProps = {
  planId: SubscriptionPlanId;
  label: string;
  price: string;
  period: string;
  badge?: string;
  badgeAccent?: boolean;
  selected: boolean;
  onSelect: () => void;
};

function PlanCard({
  label,
  price,
  period,
  badge,
  badgeAccent,
  selected,
  onSelect,
}: PlanCardProps) {
  return (
    <Pressable
      style={[styles.planCard, selected && styles.planCardSelected]}
      onPress={onSelect}
    >
      <View style={styles.planCardTop}>
        <Text style={styles.planLabel}>{label}</Text>
        {badge ? (
          <View
            style={[
              styles.planBadge,
              badgeAccent ? styles.planBadgeAccent : styles.planBadgeMuted,
            ]}
          >
            <Text
              style={[
                styles.planBadgeText,
                badgeAccent && styles.planBadgeTextAccent,
              ]}
            >
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.planPrice}>{price}</Text>
      <Text style={styles.planPeriod}>{period}</Text>
    </Pressable>
  );
}

export default function PricingScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const params = route.params;
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanId>('annual');
  const { isPro, loading: entitlementLoading } = useEntitlement();
  const skipPaywall = (params as { skipPaywall?: boolean })?.skipPaywall === true;

  useEffect(() => {
    // skipPaywall: returning subscriber starting a new plan — always skip
    if (skipPaywall) {
      navigation.navigate('BuildingPlan', {
        ...params,
        selectedPlan: 'annual',
      });
      return;
    }
    // isPro: only skip if entitlement is confirmed loaded and not
    // a BETA_BYPASS false-positive. New users are never isPro on
    // first load so this only fires for genuine existing subscribers.
    if (!entitlementLoading && isPro && !__DEV__) {
      navigation.navigate('BuildingPlan', {
        ...params,
        selectedPlan: 'annual',
      });
    }
  }, [skipPaywall, isPro, entitlementLoading]);

  const handleContinue = () => {
    const buildingPlanParams = {
      ...params,
      selectedPlan,
    };

    if (BETA_BYPASS) {
      navigation.navigate('BuildingPlan', buildingPlanParams);
      return;
    }

    navigation.navigate('BuildingPlan', buildingPlanParams);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <JordanAvatar size={48} />
          <Text style={styles.jordanLabel}>JORDAN</Text>
        </View>

        <Text style={styles.headline}>Your plan is ready to build.</Text>
        <Text style={styles.subheadline}>
          Week 1 is completely free. No charge until your trial ends — cancel
          anytime before then.
        </Text>

        <View>
          <PlanCard
            planId="monthly"
            label="MONTHLY"
            price="$14.99"
            period="per month"
            selected={selectedPlan === 'monthly'}
            onSelect={() => setSelectedPlan('monthly')}
          />
          <PlanCard
            planId="quarterly"
            label="QUARTERLY"
            price="$34.99"
            period="per 3 months ($11.66/mo)"
            badge="SAVE 22%"
            selected={selectedPlan === 'quarterly'}
            onSelect={() => setSelectedPlan('quarterly')}
          />
          <PlanCard
            planId="annual"
            label="ANNUAL"
            price="$99.99"
            period="per year ($8.33/mo)"
            badge="BEST VALUE — SAVE 44%"
            badgeAccent
            selected={selectedPlan === 'annual'}
            onSelect={() => setSelectedPlan('annual')}
          />
        </View>

        <View style={styles.featureList}>
          {FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <Ionicons
                name="checkmark-circle-outline"
                size={18}
                color={Colors.success}
              />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <View style={styles.trialCallout}>
          <Ionicons
            name="shield-checkmark-outline"
            size={20}
            color={Colors.success}
          />
          <Text style={styles.trialCalloutText}>
            7-day free trial — no charge today
          </Text>
        </View>

        <TouchableOpacity
          style={styles.ctaButton}
          activeOpacity={0.8}
          onPress={handleContinue}
        >
          <Text style={styles.ctaText}>Continue — Start Free Trial →</Text>
        </TouchableOpacity>

        <Text style={styles.finePrint}>
          Subscription auto-renews after trial. Cancel anytime in Settings.
          Prices shown in USD.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
  },
  jordanLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginTop: Spacing.sm,
  },
  headline: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  subheadline: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  planCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.xl,
    marginBottom: Spacing.md,
  },
  planCardSelected: {
    borderColor: Colors.accent,
    borderWidth: 2,
  },
  planCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  planLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
  },
  planBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  planBadgeMuted: {
    backgroundColor: Colors.bgElevated,
  },
  planBadgeAccent: {
    backgroundColor: Colors.accent,
  },
  planBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
  },
  planBadgeTextAccent: {
    color: Colors.bgPrimary,
  },
  planPrice: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.display,
    color: Colors.textPrimary,
  },
  planPeriod: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  featureList: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  featureText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  trialCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  trialCalloutText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.success,
  },
  ctaButton: {
    backgroundColor: Colors.accent,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  finePrint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
});

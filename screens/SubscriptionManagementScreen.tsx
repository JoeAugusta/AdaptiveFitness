import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Purchases, {
  PURCHASES_ERROR_CODE,
  PurchasesError,
  PurchasesPackage,
} from 'react-native-purchases';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { Ionicons } from '@expo/vector-icons';

// ── Date helper ──

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// ── Feature comparison data ──

const FEATURES: [string, boolean, boolean][] = [
  ['Onboarding + goal setup', true, true],
  ['1 plan generation', true, true],
  ['Unlimited plan generation', false, true],
  ['Weekly plan adaptation', false, true],
  ['Real-time coaching feedback', false, true],
  ['Weekly coach summary', false, true],
  ['Nutrition coaching', false, true],
  ['Progress charts', false, true],
];

// ── Skeleton component ──

function SkeletonContent({ pulseAnim }: { pulseAnim: Animated.Value }) {
  return (
    <Animated.View style={[styles.skeletonPulseWrap, { opacity: pulseAnim }]}>
      <View style={styles.skeletonStatus} />
      <View style={styles.skeletonTable} />
      <View style={styles.skeletonBtn} />
    </Animated.View>
  );
}

// ── Main screen ──

export default function SubscriptionManagementScreen() {
  const navigation = useNavigation();

  const [isProActive, setIsProActive] = useState(false);
  const [willRenew, setWillRenew] = useState(false);
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  const [originalPurchaseDate, setOriginalPurchaseDate] = useState<string | null>(null);
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [annualPackage, setAnnualPackage] = useState<PurchasesPackage | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (loading) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.7, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current = loop;
      loop.start();
    } else {
      pulseLoop.current?.stop();
    }
  }, [loading, pulseAnim]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setHasError(false);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) throw authError ?? new Error('Not authenticated');

      const supabaseTask = supabase
        .from('users')
        .select('subscription_status, subscription_tier')
        .eq('id', user.id)
        .single();

      const rcCustomerTask =
        Platform.OS !== 'web'
          ? Purchases.getCustomerInfo().catch(() => null)
          : Promise.resolve(null);

      const rcOfferingsTask =
        Platform.OS !== 'web'
          ? Purchases.getOfferings().catch(() => null)
          : Promise.resolve(null);

      const [supabaseRes, customerInfo, offerings] = await Promise.all([
        supabaseTask,
        rcCustomerTask,
        rcOfferingsTask,
      ]);

      const subscriptionStatus =
        (supabaseRes.data as { subscription_status: string } | null)
          ?.subscription_status ?? 'free';

      const proEntitlement = customerInfo?.entitlements.active['pro'] ?? null;
      const isProFromRC = proEntitlement != null;

      setIsProActive(isProFromRC || subscriptionStatus === 'pro');
      setWillRenew(proEntitlement?.willRenew ?? false);
      setExpirationDate(proEntitlement?.expirationDate ?? null);
      setOriginalPurchaseDate(proEntitlement?.originalPurchaseDate ?? null);
      setMonthlyPackage(offerings?.current?.monthly ?? null);
      setAnnualPackage(offerings?.current?.annual ?? null);
    } catch (e) {
      console.error('SubscriptionManagement load error:', e);
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Action handlers ──

  const handlePurchase = async () => {
    if (Platform.OS === 'web') return;

    const pkg = selectedPlan === 'annual' ? annualPackage : monthlyPackage;
    if (!pkg) {
      Alert.alert('Not Available', 'Packages not yet loaded. Please try again.');
      return;
    }

    try {
      const result = await Purchases.purchasePackage(pkg);
      if (result.customerInfo.entitlements.active['pro']) {
        setIsProActive(true);
        Alert.alert('Welcome to Pro!', 'Your free trial has started. Enjoy full access.');
      }
    } catch (e) {
      const purchaseError = e as PurchasesError;
      if (purchaseError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
        return;
      }
      Alert.alert('Purchase Failed', 'Please try again.');
    }
  };

  const handleManageSubscription = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Manage Subscription',
        'Manage your subscription on the iOS or Android app.',
      );
      return;
    }
    try {
      await Purchases.showManageSubscriptions();
    } catch (e) {
      console.error('showManageSubscriptions error:', e);
    }
  };

  const handleRestore = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Restore Purchases',
        'Restore purchases is available on the iOS or Android app.',
      );
      return;
    }
    try {
      setIsRestoring(true);
      const customerInfo = await Purchases.restorePurchases();
      if (customerInfo.entitlements.active['pro']) {
        setIsProActive(true);
        Alert.alert(
          'Purchases Restored!',
          'Pro access is now active.',
        );
      } else {
        Alert.alert(
          'No Active Subscription',
          'No active Pro subscription found on this account.',
        );
      }
    } catch (e) {
      console.error('restorePurchases error:', e);
      Alert.alert('Restore Failed', 'Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  // ── Error state ──

  if (hasError && !loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.errorScrollPad}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
              <Text style={styles.backChevron}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle} pointerEvents="none">
              Subscription
            </Text>
            <View style={styles.headerSpacer} />
          </View>
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Couldn't load subscription info.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadData} activeOpacity={0.8}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ──

  const showWebStyleCta = Platform.OS === 'web' || __DEV__;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} pointerEvents="none">
            Subscription
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <SkeletonContent pulseAnim={pulseAnim} />
        ) : (
          <>
            <View
              style={[
                styles.statusCard,
                isProActive ? styles.statusCardPro : styles.statusCardFree,
              ]}
            >
              {isProActive ? (
                <>
                  <View style={styles.statusTopRow}>
                    <Ionicons name="flash-outline" size={16} color={Colors.accent} />
                    <Text style={styles.statusPlanName}>Pro Plan</Text>
                    <View style={[styles.statusPill, styles.statusPillPro]}>
                      <Text style={styles.statusPillTextPro}>PRO</Text>
                    </View>
                  </View>

                  <Text style={styles.statusDescription}>
                    Full access to adaptive coaching, unlimited plans, macro tracking, and progress
                    analytics.
                  </Text>

                  {expirationDate !== null && willRenew && (
                    <Text style={styles.renewalText}>
                      Renews {formatDate(expirationDate)}
                    </Text>
                  )}

                  {expirationDate !== null && !willRenew && (
                    <>
                      <Text style={styles.cancelledExpiry}>
                        Access until {formatDate(expirationDate)}
                      </Text>
                      <Text style={styles.cancelledNote}>
                        Subscription cancelled — you retain access until the date above.
                      </Text>
                    </>
                  )}

                  {originalPurchaseDate !== null && (
                    <Text style={styles.memberSince}>
                      Member since {formatDate(originalPurchaseDate)}
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <View style={styles.statusTopRow}>
                    <Ionicons name="lock-open-outline" size={16} color={Colors.accent} />
                    <Text style={styles.statusPlanName}>Free Plan</Text>
                    <View style={[styles.statusPill, styles.statusPillFree]}>
                      <Text style={styles.statusPillTextFree}>FREE</Text>
                    </View>
                  </View>
                  <Text style={styles.statusDescription}>
                    Upgrade to Pro to unlock adaptive coaching, unlimited plans, nutrition targets, and
                    all progress features.
                  </Text>
                </>
              )}
            </View>

            <View style={styles.compCard}>
              <View style={styles.compHeaderRow}>
                <View style={styles.compHeaderFeatureSpacer} />
                <Text style={styles.compHeaderFree}>Free</Text>
                <View style={styles.compHeaderProCol}>
                  <Text style={styles.compHeaderPro}>Pro</Text>
                  <View style={styles.compProUnderline} />
                </View>
              </View>
              {FEATURES.map(([name, freeHas, proHas], idx) => (
                <View
                  key={name}
                  style={[
                    styles.compDataRow,
                    idx === FEATURES.length - 1 && styles.compDataRowLast,
                  ]}
                >
                  <Text style={styles.compFeatureName} numberOfLines={2}>
                    {name}
                  </Text>
                  <Text
                    style={freeHas ? styles.compCellCheckFree : styles.compCellDash}
                    numberOfLines={1}
                  >
                    {freeHas ? <Ionicons name="checkmark" size={14} color={Colors.success} /> : '—'}
                  </Text>
                  <Text
                    style={proHas ? styles.compCellCheckPro : styles.compCellDash}
                    numberOfLines={1}
                  >
                    {proHas ? <Ionicons name="checkmark" size={14} color={Colors.success} /> : '—'}
                  </Text>
                </View>
              ))}
            </View>

            {!isProActive ? (
              <View style={styles.upgradeSection}>
                <Text style={styles.choosePlanHeading}>CHOOSE YOUR PLAN</Text>

                <TouchableOpacity
                  style={[
                    styles.pricingCard,
                    selectedPlan === 'monthly' && styles.pricingCardSelected,
                  ]}
                  onPress={() => setSelectedPlan('monthly')}
                  activeOpacity={0.8}
                >
                  <View style={styles.pricingInfo}>
                    <Text style={styles.pricingTitle}>Monthly</Text>
                    <View style={styles.pricingPriceRow}>
                      <Text style={styles.pricingPriceMain}>$14.99 / month</Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.planRadioOuter,
                      selectedPlan === 'monthly' && styles.planRadioOuterSelected,
                    ]}
                  >
                    {selectedPlan === 'monthly' ? <View style={styles.planRadioInner} /> : null}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.pricingCard,
                    selectedPlan === 'annual' && styles.pricingCardSelected,
                  ]}
                  onPress={() => setSelectedPlan('annual')}
                  activeOpacity={0.8}
                >
                  <View style={styles.pricingInfo}>
                    <Text style={styles.pricingTitle}>Annual</Text>
                    <View style={styles.pricingPriceRow}>
                      <Text style={styles.pricingPriceMain}>$99.99 / year</Text>
                      <Text style={styles.pricingPriceEquiv}>~$8.33/mo</Text>
                    </View>
                  </View>
                  <View style={styles.bestValueBadge}>
                    <Text style={styles.bestValueText}>BEST VALUE</Text>
                  </View>
                </TouchableOpacity>

                {showWebStyleCta ? (
                  <View style={styles.ctaWeb}>
                    <Text style={styles.ctaWebText}>Upgrade available on iOS & Android</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.ctaDevice}
                    onPress={handlePurchase}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.ctaDeviceText}>Start Free 7-Day Trial</Text>
                  </TouchableOpacity>
                )}

                <Text style={styles.finePrintBlock1}>
                  Cancel anytime. 7-day free trial, then billed at the selected rate. Recurring
                  subscription.
                </Text>
                <Text style={styles.finePrintBlock2}>
                  Subscriptions are managed through the App Store or Google Play. hone
                  does not have access to your payment details.
                </Text>
              </View>
            ) : (
              <View style={styles.manageSection}>
                <View style={styles.manageCard}>
                  <TouchableOpacity
                    style={styles.manageRow}
                    onPress={handleManageSubscription}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.manageRowLabel}>Manage Subscription</Text>
                    <Text style={styles.manageChevron}>›</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.manageRow, styles.manageRowLast]}
                    onPress={handleRestore}
                    activeOpacity={0.7}
                    disabled={isRestoring}
                  >
                    <Text style={styles.manageRowLabel}>Restore Purchases</Text>
                    {isRestoring ? (
                      <ActivityIndicator size="small" color={Colors.accent} />
                    ) : (
                      <Text style={styles.manageChevron}>›</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {isProActive ? (
              <Text style={styles.footerManagedNote}>
                Subscriptions are managed through the App Store or Google Play. hone
                does not have access to your payment details.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 56,
    paddingBottom: 40,
  },
  skeletonPulseWrap: {},

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  backChevron: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    paddingRight: 8,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },
  headerSpacer: { width: 28 },

  errorScrollPad: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: 56,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.semiBold,
  },

  statusCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    padding: 20,
    marginTop: Spacing.xl,
  },
  statusCardFree: { borderLeftColor: Colors.textTertiary },
  statusCardPro: { borderLeftColor: Colors.accent },
  statusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusEmoji: {
    fontFamily: Fonts.regular,
    fontSize: 24,
    marginRight: 12,
  },
  statusPlanName: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },
  statusPill: {
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
  },
  statusPillFree: {
    backgroundColor: Colors.bgElevated,
    borderColor: Colors.border,
  },
  statusPillPro: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
  },
  statusPillTextFree: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
  },
  statusPillTextPro: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.accent,
  },
  statusDescription: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginTop: 10,
  },
  renewalText: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.caption,
    marginTop: 12,
  },
  cancelledExpiry: {
    fontFamily: Fonts.regular,
    color: Colors.warning,
    fontSize: FontSizes.caption,
    marginTop: 12,
  },
  cancelledNote: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.caption,
    marginTop: 4,
  },
  memberSince: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.caption,
    marginTop: 4,
  },

  compCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    marginTop: Spacing.lg,
    overflow: 'hidden',
  },
  compHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  compHeaderFeatureSpacer: { flex: 2 },
  compHeaderFree: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  compHeaderProCol: {
    flex: 1,
    alignItems: 'center',
  },
  compHeaderPro: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  compProUnderline: {
    height: 2,
    width: 24,
    backgroundColor: Colors.accent,
    marginTop: 3,
    alignSelf: 'center',
  },
  compDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  compDataRowLast: { borderBottomWidth: 0 },
  compFeatureName: {
    flex: 2,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    paddingRight: 8,
  },
  compCellCheckFree: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.success,
    textAlign: 'center',
  },
  compCellCheckPro: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.accent,
    textAlign: 'center',
  },
  compCellDash: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textTertiary,
    textAlign: 'center',
  },

  upgradeSection: { marginTop: 0 },
  choosePlanHeading: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 32,
    marginBottom: 12,
  },
  pricingCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 20,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pricingCardSelected: {
    backgroundColor: Colors.accentMuted,
    borderWidth: 1.5,
    borderColor: Colors.accentBorder,
  },
  pricingInfo: { flex: 1 },
  pricingTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  pricingPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  pricingPriceMain: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  pricingPriceEquiv: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginLeft: 6,
  },
  bestValueBadge: {
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
  planRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planRadioOuterSelected: { borderColor: Colors.accent },
  planRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
  },

  ctaWeb: {
    marginTop: 20,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.8,
  },
  ctaWebText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  ctaDevice: {
    marginTop: 20,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDeviceText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  finePrintBlock1: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 12,
  },
  finePrintBlock2: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
  },

  manageSection: { marginTop: Spacing.lg },
  manageCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: 'hidden',
  },
  manageRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  manageRowLast: { borderBottomWidth: 0 },
  manageRowLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  manageChevron: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.heading1,
  },

  footerManagedNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 24,
  },

  skeletonStatus: {
    height: 120,
    backgroundColor: Colors.divider,
    borderRadius: Radius.lg,
    marginTop: Spacing.xl,
    opacity: 0.5,
  },
  skeletonTable: {
    height: 340,
    backgroundColor: Colors.divider,
    borderRadius: Radius.lg,
    marginTop: Spacing.lg,
    opacity: 0.5,
  },
  skeletonBtn: {
    height: 56,
    backgroundColor: Colors.divider,
    borderRadius: Radius.lg,
    marginTop: 32,
    opacity: 0.5,
  },
});

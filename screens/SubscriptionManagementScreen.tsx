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
import { Colors, Fonts, FontSizes } from '../constants/design';

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
  ['Macro tracker', false, true],
  ['Progress charts', false, true],
];

// ── Skeleton component ──

function SkeletonContent({ pulseAnim }: { pulseAnim: Animated.Value }) {
  return (
    <Animated.View style={{ opacity: pulseAnim }}>
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
        Alert.alert('Welcome to Pro! 🎉', 'Your free trial has started. Enjoy full access.');
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
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} pointerEvents="none">
            Subscription
          </Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Couldn't load subscription info.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData} activeOpacity={0.8}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ──

  return (
    <SafeAreaView style={styles.safe}>
      {/* Navigation header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">
          Subscription
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <SkeletonContent pulseAnim={pulseAnim} />
        ) : (
          <>
            {/* ── 1. Status Card ── */}
            <View style={styles.statusCard}>
              {isProActive ? (
                <>
                  <View style={styles.statusTopRow}>
                    <View style={styles.statusTitleRow}>
                      <Text style={styles.statusEmoji}>⭐</Text>
                      <Text style={styles.statusTitle}>Pro Member</Text>
                    </View>
                    <View style={styles.activeIndicator}>
                      <View style={styles.activeDot} />
                      <Text style={styles.activeText}>Active</Text>
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
                    <View style={styles.statusTitleRow}>
                      <Text style={styles.statusEmoji}>🔒</Text>
                      <Text style={styles.statusTitle}>Free Plan</Text>
                    </View>
                    <View style={styles.freePill}>
                      <Text style={styles.freePillText}>FREE</Text>
                    </View>
                  </View>
                  <Text style={styles.statusDescription}>
                    Upgrade to Pro to unlock adaptive coaching, unlimited plans, macro tracking, and
                    all progress features.
                  </Text>
                </>
              )}
            </View>

            {/* ── 2. Plan Comparison Card ── */}
            <View style={styles.compCard}>
              {/* Vertical divider at 50% */}
              <View style={styles.compCenterDivider} pointerEvents="none" />

              <View style={styles.compColumns}>
                {/* Free column */}
                <View style={styles.compCol}>
                  <View style={styles.compColHeaderWrap}>
                    <Text style={styles.compColHeaderText}>Free</Text>
                  </View>
                  {FEATURES.map(([name, freeHas], idx) => (
                    <View
                      key={name}
                      style={[styles.compRow, idx % 2 !== 0 && styles.compRowBanded]}
                    >
                      <Text style={styles.compFeatureText} numberOfLines={2}>
                        {name}
                      </Text>
                      <Text style={freeHas ? styles.compCheckmark : styles.compDashText}>
                        {freeHas ? '✓' : '—'}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Pro column */}
                <View style={[styles.compCol, styles.compColPro]}>
                  <View style={styles.compColHeaderWrap}>
                    <Text style={styles.compColHeaderText}>Pro</Text>
                    <View style={styles.proUnderline} />
                  </View>
                  {FEATURES.map(([name, , proHas], idx) => (
                    <View
                      key={name}
                      style={[
                        styles.compRow,
                        styles.compRowProSide,
                        idx % 2 !== 0 && styles.compRowBanded,
                      ]}
                    >
                      <Text style={proHas ? styles.compCheckmark : styles.compDashText}>
                        {proHas ? '✓' : '—'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* ── 3. Upgrade or Manage ── */}
            {!isProActive ? (
              <View style={styles.upgradeSection}>
                {/* Monthly pricing card */}
                <TouchableOpacity
                  style={[
                    styles.pricingCard,
                    selectedPlan === 'monthly' && styles.pricingCardActive,
                  ]}
                  onPress={() => setSelectedPlan('monthly')}
                  activeOpacity={0.8}
                >
                  <View style={styles.pricingInfo}>
                    <Text style={styles.pricingTitle}>Monthly</Text>
                    <Text style={styles.pricingSubtitle}>$14.99 / month</Text>
                  </View>
                  <View style={[
                    styles.radio,
                    selectedPlan === 'monthly' && styles.radioActive,
                  ]}>
                    {selectedPlan === 'monthly' && <View style={styles.radioFill} />}
                  </View>
                </TouchableOpacity>

                {/* Annual pricing card */}
                <TouchableOpacity
                  style={[
                    styles.pricingCard,
                    styles.pricingCardAnnualDefault,
                    selectedPlan === 'annual' && styles.pricingCardActive,
                  ]}
                  onPress={() => setSelectedPlan('annual')}
                  activeOpacity={0.8}
                >
                  <View style={styles.pricingInfo}>
                    <View style={styles.annualTitleRow}>
                      <Text style={styles.pricingTitle}>Annual</Text>
                      <View style={styles.bestValueBadge}>
                        <Text style={styles.bestValueText}>BEST VALUE</Text>
                      </View>
                    </View>
                    <Text style={styles.pricingSubtitle}>$99.99 / year  (~$8.33/mo)</Text>
                  </View>
                  <View style={[
                    styles.radio,
                    selectedPlan === 'annual' && styles.radioActive,
                  ]}>
                    {selectedPlan === 'annual' && <View style={styles.radioFill} />}
                  </View>
                </TouchableOpacity>

                {/* CTA */}
                {Platform.OS !== 'web' ? (
                  <TouchableOpacity
                    style={styles.ctaBtn}
                    onPress={handlePurchase}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.ctaBtnText}>Start Free 7-Day Trial</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.ctaBtnDisabled}>
                    <Text style={styles.ctaBtnDisabledText}>
                      Upgrade available on iOS & Android
                    </Text>
                  </View>
                )}

                <Text style={styles.ctaDisclaimer}>
                  Cancel anytime. 7-day free trial, then billed at the selected rate. Recurring
                  subscription.
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
                  <View style={styles.manageDivider} />
                  <TouchableOpacity
                    style={styles.manageRow}
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

            {/* ── 4. Footer note ── */}
            <Text style={styles.footerNote}>
              Subscriptions are managed through the App Store or Google Play.{'\n'}
              Adaptive Fitness does not have access to your payment details.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 64 },

  // ── Navigation header ──
  header: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backChevron: {
    fontFamily: Fonts.regular,
    color: Colors.accent, fontSize: FontSizes.display, },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: Colors.textPrimary,
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold, 
  },

  // ── Error state ──
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
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: { color: '#FFFFFF', fontSize: FontSizes.caption, fontFamily: Fonts.semiBold, }, // TODO: map to design token

  // ── Status card ──
  statusCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 20,
    marginTop: 24,
  },
  statusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusEmoji: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.heading1, },
  statusTitle: { color: Colors.textPrimary, fontSize: FontSizes.heading2, fontFamily: Fonts.bold, },
  activeIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  activeText: {
    fontFamily: Fonts.regular,
    color: Colors.success, fontSize: FontSizes.caption, },
  statusDescription: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.caption,
    lineHeight: 20,
    marginTop: 8,
  },
  renewalText: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, marginTop: 12 },
  cancelledExpiry: {
    fontFamily: Fonts.regular,
    color: Colors.warning, fontSize: FontSizes.caption, marginTop: 12 },
  cancelledNote: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, marginTop: 4 },
  memberSince: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, marginTop: 4 },
  freePill: {
    backgroundColor: Colors.divider,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  freePillText: { color: Colors.textSecondary, fontSize: FontSizes.label, fontFamily: Fonts.bold, },

  // ── Comparison card ──
  compCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 16,
    overflow: 'hidden',
  },
  compCenterDivider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 1,
    backgroundColor: Colors.divider,
  },
  compColumns: { flexDirection: 'row' },
  compCol: { flex: 1, paddingHorizontal: 16, paddingVertical: 20 },
  compColPro: { alignItems: 'center' },
  compColHeaderWrap: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  compColHeaderText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.body,
    fontFamily: Fonts.bold, 
    textAlign: 'center',
  },
  proUnderline: {
    width: 24,
    height: 2,
    backgroundColor: Colors.accent,
    marginTop: 4,
  },
  compRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 36,
    paddingHorizontal: 2,
  },
  compRowProSide: { justifyContent: 'center' },
  compRowBanded: { backgroundColor: 'rgba(255,255,255,0.02)' }, // TODO: map to design token
  compFeatureText: {
    fontFamily: Fonts.regular,
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSizes.caption,
    paddingRight: 4,
  },
  compCheckmark: {
    color: Colors.accent,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold, 
  },
  compDashText: {
    color: Colors.divider,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold, 
  },

  // ── Upgrade section ──
  upgradeSection: { marginHorizontal: 20, marginTop: 20 },

  pricingCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1.5,
    borderColor: Colors.divider,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  pricingCardAnnualDefault: { borderColor: Colors.accent },
  pricingCardActive: { borderColor: Colors.accent },
  pricingInfo: { flex: 1 },
  pricingTitle: { color: Colors.textPrimary, fontSize: FontSizes.title, fontFamily: Fonts.semiBold, },
  pricingSubtitle: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, marginTop: 2 },
  annualTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bestValueBadge: {
    backgroundColor: Colors.accent,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  bestValueText: { color: '#FFFFFF', fontSize: FontSizes.micro, fontFamily: Fonts.bold, }, // TODO: map to design token

  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: Colors.accent },
  radioFill: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
  },

  ctaBtn: {
    marginTop: 4,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBtnText: { color: '#FFFFFF', fontSize: FontSizes.title, fontFamily: Fonts.bold, }, // TODO: map to design token
  ctaBtnDisabled: {
    marginTop: 4,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBtnDisabledText: { color: Colors.textSecondary, fontSize: FontSizes.title, fontFamily: Fonts.semiBold, },
  ctaDisclaimer: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.label,
    textAlign: 'center',
    marginTop: 10,
  },

  // ── Manage section (Pro) ──
  manageSection: { marginHorizontal: 20, marginTop: 20 },
  manageCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    overflow: 'hidden',
  },
  manageRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manageRowLabel: {
    fontFamily: Fonts.regular,
    color: Colors.textPrimary, fontSize: FontSizes.body, },
  manageChevron: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.heading1, },
  manageDivider: { height: 1, backgroundColor: Colors.divider },

  // ── Footer note ──
  footerNote: {
    fontFamily: Fonts.regular,
    marginHorizontal: 20,
    marginTop: 24,
    color: Colors.textSecondary,
    fontSize: FontSizes.caption,
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── Skeleton ──
  skeletonStatus: {
    height: 110,
    backgroundColor: Colors.divider,
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 24,
    opacity: 0.5,
  },
  skeletonTable: {
    height: 340,
    backgroundColor: Colors.divider,
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 16,
    opacity: 0.5,
  },
  skeletonBtn: {
    height: 56,
    backgroundColor: Colors.divider,
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 20,
    opacity: 0.5,
  },
});

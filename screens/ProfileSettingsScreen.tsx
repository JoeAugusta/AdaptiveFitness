import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  Animated,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import {
  Colors,
  Fonts,
  FontSizes,
  LineHeights,
  Spacing,
  Radius,
  CommonStyles,
} from '../constants/design';
import { deleteUserAccount } from '../utils/deleteAccount';

// ── Label maps ──

const GOAL_LABELS: Record<string, string> = {
  strength: 'Strength Focus',
  hypertrophy: 'Hypertrophy',
  recomp: 'Body Recomp',
  fat_loss: 'Fat Loss',
  general: 'General Fitness',
};

const TRAINING_AGE_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const SPLIT_LABELS: Record<string, string> = {
  ppl: 'Push / Pull / Legs',
  upper_lower: 'Upper / Lower',
  full_body: 'Full Body',
  bro_split: 'Bro Split',
  custom: 'Custom',
};

const EQUIPMENT_LABELS: Record<string, string> = {
  full_gym: 'Full Gym',
  home_gym: 'Home Gym',
  dumbbells: 'Dumbbells Only',
  bodyweight: 'Bodyweight',
};

const SEX_LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Prefer not to say',
};

// ── Types ──

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface UserProfile {
  training_age: string;
  days_per_week: number;
  session_duration_mins: number;
  preferred_split: string;
  equipment: string;
  weight_lbs: number;
  height_ft: number;
  height_in: number;
  age: number;
  sex: string;
}

interface GoalData {
  goal_type: string;
  plan_duration_weeks: number;
  target_lift: string | null;
}

interface PlanData {
  current_week: number;
  total_weeks: number;
  title: string;
  plan_json?: Record<string, unknown> | null;
}

interface ScreenData {
  email: string;
  displayName: string;
  subscriptionStatus: string;
  profile: UserProfile;
  goal: GoalData | null;
  plan: PlanData | null;
}

// ── Helpers ──

function initialLetter(displayName: string): string {
  const t = displayName.trim();
  return (t[0] ?? '?').toUpperCase();
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
}

function mapped(map: Record<string, string>, key: string | undefined): string {
  return key ? (map[key] ?? key) : '—';
}

function formatSessionLengthDisplay(val: unknown): string {
  if (val == null || val === '') return '—';
  if (typeof val === 'number' && Number.isFinite(val)) {
    return `${Math.round(val)} min`;
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return '—';
    if (/^\d+$/.test(s)) return `${s} min`;
    const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) return `${m[1]}–${m[2]} min`;
    const parts = s.split(/[–-]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2 && parts.every((p) => /^\d+$/.test(p))) {
      return `${parts[0]}–${parts[1]} min`;
    }
    return s.toLowerCase().includes('min') ? s : `${s} min`;
  }
  return '—';
}

function trainingPrefsDisplay(
  plan: PlanData | null,
  profile: UserProfile | null | undefined,
): {
  experienceDisplay: string;
  daysDisplay: string;
  sessionDisplay: string;
  splitDisplay: string;
  equipmentDisplay: string;
} {
  const pj = plan?.plan_json ?? null;
  const exp = (pj?.experience ?? profile?.training_age) as string | undefined;
  const daysRaw = pj?.daysPerWeek ?? profile?.days_per_week;
  const sessionRaw = pj?.sessionLength ?? profile?.session_duration_mins;
  const splitKey = (pj?.split ?? pj?.splitId ?? profile?.preferred_split) as
    | string
    | undefined;
  const equipKey = (pj?.equipment ?? profile?.equipment) as string | undefined;

  let daysDisplay = '—';
  if (daysRaw != null && daysRaw !== '') {
    const n = Number(daysRaw);
    if (Number.isFinite(n)) daysDisplay = `${n} days`;
  }

  return {
    experienceDisplay: exp ? mapped(TRAINING_AGE_LABELS, exp) : '—',
    daysDisplay,
    sessionDisplay: formatSessionLengthDisplay(sessionRaw),
    splitDisplay: splitKey ? mapped(SPLIT_LABELS, splitKey) : '—',
    equipmentDisplay: equipKey ? mapped(EQUIPMENT_LABELS, equipKey) : '—',
  };
}

// ── Sub-components ──

function Row({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
  return (
    <View style={[styles.row, isLast && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function SkeletonCard({
  count,
  pulseAnim,
}: {
  count: number;
  pulseAnim: Animated.Value;
}) {
  return (
    <Animated.View style={[styles.sectionCard, { opacity: pulseAnim }]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.row, i === count - 1 && styles.rowLast]}>
          <View style={styles.skeletonPill} />
          <View style={styles.skeletonPillShort} />
        </View>
      ))}
    </Animated.View>
  );
}

// ── Main screen ──

export default function ProfileSettingsScreen() {
  const navigation = useNavigation<NavProp>();

  const [data, setData] = useState<ScreenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const [latestWeightLog, setLatestWeightLog] = useState<{
    weight_lbs: number;
    log_date: string;
  } | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

      // Try getUser() first — makes a network call but guarantees
      // a validated user object, not a potentially stale cached session
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('No authenticated user:', userError);
        setHasError(true);
        return;
      }

      const uid = user.id;
      console.log('ProfileSettings uid:', uid); // confirm uid is valid

      const [profileRes, goalRes, planRes, weightLogRes] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', uid)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('goals')
          .select('goal_type, plan_duration_weeks, target_lift')
          .eq('user_id', uid)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('plans')
          .select('current_week, total_weeks, title, plan_json')
          .eq('user_id', uid)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('weight_logs')
          .select('weight_lbs, log_date')
          .eq('user_id', uid)
          .order('log_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (profileRes.error) {
        console.error('user_profiles error:', profileRes.error);
        throw profileRes.error;
      }

      const weightLog = weightLogRes.data as { weight_lbs: number; log_date: string } | null;
      setLatestWeightLog(weightLog);

      const meta = user.user_metadata as Record<string, unknown> | undefined;
      const fromMeta = (k: string) =>
        typeof meta?.[k] === 'string' ? (meta[k] as string).trim() : '';
      const displayName = fromMeta('full_name') || fromMeta('name') || user.email || '';

      setData({
        email: user.email ?? '',
        displayName,
        subscriptionStatus: 'free',
        profile: profileRes.data as UserProfile,
        goal: (goalRes.data as GoalData | null) ?? null,
        plan: (planRes.data as PlanData | null) ?? null,
      });
    } catch (err) {
      console.error('ProfileSettings load error:', err);
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetToOnboarding = () => {
    const rootNav = navigation.getParent()?.getParent();
    rootNav?.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Onboarding' }],
      }),
    );
  };

  const resetToSplash = () => {
    const rootNav = navigation.getParent()?.getParent();
    rootNav?.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Splash' }],
      }),
    );
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await supabase.auth.signOut();
              resetToOnboarding();
            } catch (error) {
              console.error('Sign out error:', error);
            }
          })();
        },
      },
    ]);
  };

  const handleConfirmDeleteAccount = () => {
    void (async () => {
      try {
        setIsDeleting(true);
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          throw userError ?? new Error('Not authenticated');
        }
        await deleteUserAccount(user.id);
        await supabase.auth.signOut();
        setShowDeleteModal(false);
        resetToSplash();
      } catch (e) {
        console.error('Delete account error:', e);
        Alert.alert('Something went wrong. Please try again.');
      } finally {
        setIsDeleting(false);
      }
    })();
  };

  // ── Error state ──

  if (hasError && !loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            Couldn't load profile. Pull down to refresh.
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData} activeOpacity={0.8}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isPro = data?.subscriptionStatus === 'pro';

  const today = new Date().toISOString().split('T')[0];
  const isToday = latestWeightLog?.log_date === today;

  const trainingPrefs = data
    ? trainingPrefsDisplay(data.plan, data.profile)
    : null;

  // ── Render ──

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Animated.View style={[styles.profileHeaderRow, { opacity: pulseAnim }]}>
            <View style={styles.skeletonAvatar} />
            <View style={styles.skeletonTextBlock}>
              <View style={styles.skeletonLine} />
              <View style={styles.skeletonLineShort} />
            </View>
          </Animated.View>
        ) : (
          <TouchableOpacity
            style={styles.profileHeaderRow}
            onPress={() => navigation.navigate('SubscriptionManagement')}
            activeOpacity={0.8}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {data ? initialLetter(data.displayName) : ''}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {data?.displayName}
              </Text>
              <View style={[styles.subBadge, isPro ? styles.subBadgePro : styles.subBadgeFree]}>
                <Text style={[styles.subBadgeText, isPro ? styles.subBadgeTextPro : styles.subBadgeTextFree]}>
                  {isPro ? 'PRO' : 'FREE'}
                </Text>
              </View>
            </View>
            <Text style={styles.profileChevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* ── 2. My Plan ── */}
        <Text style={styles.sectionHeading}>MY PLAN</Text>
        {loading ? (
          <SkeletonCard count={3} pulseAnim={pulseAnim} />
        ) : (
          <View style={styles.sectionCard}>
            <Row label="Goal" value={mapped(GOAL_LABELS, data?.goal?.goal_type)} />
            <Row
              label="Current Week"
              value={
                data?.plan
                  ? `Week ${data.plan.current_week} of ${data.plan.total_weeks}`
                  : '—'
              }
            />
            <Row
              label="Active Plan"
              value={data?.plan ? truncate(data.plan.title, 20) : '—'}
              isLast
            />
          </View>
        )}

        {/* ── 3. Body Metrics ── */}
        <Text style={styles.sectionHeading}>BODY METRICS</Text>
        {loading ? (
          <SkeletonCard count={4} pulseAnim={pulseAnim} />
        ) : (
          <View style={styles.sectionCard}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Weight</Text>
              <View style={styles.weightValueGroup}>
                <Text style={styles.weightPrimary}>
                  {latestWeightLog
                    ? `${latestWeightLog.weight_lbs} lbs`
                    : `${data?.profile.weight_lbs ?? '—'} lbs`}
                </Text>
                {latestWeightLog ? (
                  <Text style={styles.weightSecondary}>
                    {isToday
                      ? 'Logged today'
                      : `Logged ${new Date(latestWeightLog.log_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  </Text>
                ) : null}
                <Text style={isToday ? styles.weightTertiarySuccess : styles.weightTertiary}>
                  {isToday ? 'Up to date ✓' : 'Log today from Dashboard'}
                </Text>
              </View>
            </View>
            <Row
              label="Height"
              value={`${data?.profile.height_ft ?? '—'}'${data?.profile.height_in ?? '—'}"`}
            />
            <Row
              label="Age"
              value={data?.profile.age != null ? String(data.profile.age) : '—'}
            />
            <Row label="Biological Sex" value={mapped(SEX_LABELS, data?.profile.sex)} isLast />
          </View>
        )}

        {/* ── 4. Training Preferences ── */}
        <Text style={styles.sectionHeading}>TRAINING PREFERENCES</Text>
        {loading ? (
          <SkeletonCard count={5} pulseAnim={pulseAnim} />
        ) : (
          <>
            <View style={styles.sectionCard}>
              <Row
                label="Experience"
                value={trainingPrefs?.experienceDisplay ?? '—'}
              />
              <Row label="Days/Week" value={trainingPrefs?.daysDisplay ?? '—'} />
              <Row
                label="Session Length"
                value={trainingPrefs?.sessionDisplay ?? '—'}
              />
              <Row label="Split" value={trainingPrefs?.splitDisplay ?? '—'} />
              <Row
                label="Equipment"
                value={trainingPrefs?.equipmentDisplay ?? '—'}
                isLast
              />
            </View>
            <Text style={styles.helperText}>
              To change your training setup, start a new plan.
            </Text>
          </>
        )}

        {/* ── 5. App ── */}
        <Text style={styles.sectionHeading}>APP</Text>
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('NotificationsSettings' as never)}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>Workout Reminders</Text>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, styles.rowLast]}
            onPress={() => Linking.openURL('https://apps.apple.com')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>Rate Adaptive Fitness</Text>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── 6. Support ── */}
        <Text style={styles.sectionHeading}>SUPPORT</Text>
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL('https://adaptive.fitness/privacy')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>Privacy Policy</Text>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL('https://adaptive.fitness/terms')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>Terms of Service</Text>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, styles.rowLast]}
            onPress={() => setShowDeleteModal(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.supportRowLabelDanger}>Delete Account</Text>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── 7. Sign Out ── */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {__DEV__ ? (
          <TouchableOpacity
            style={styles.devButton}
            onPress={() => resetToOnboarding()}
            activeOpacity={0.8}
          >
            <Text style={styles.devButtonText}>🛠 DEV: Restart Onboarding</Text>
          </TouchableOpacity>
        ) : null}

        {/* ── 8. Version footer ── */}
        <Text style={styles.versionText}>Adaptive Fitness • v1.0.0</Text>
      </ScrollView>

      <Modal
        transparent
        visible={showDeleteModal}
        animationType="fade"
        onRequestClose={() => {
          if (!isDeleting) setShowDeleteModal(false);
        }}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalCard}>
            <Text style={styles.deleteModalTitle}>Delete Account</Text>
            <Text style={styles.deleteModalBody}>
              This will permanently delete your account, all workout history, and your plan.
              This cannot be undone.
            </Text>
            <TouchableOpacity
              style={[
                CommonStyles.primaryButton,
                styles.deleteModalBtnFullWidth,
                isDeleting && styles.deleteModalBtnDisabled,
              ]}
              onPress={() => setShowDeleteModal(false)}
              disabled={isDeleting}
              activeOpacity={0.85}
            >
              <Text style={CommonStyles.primaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.deleteModalDangerBtn,
                styles.deleteModalBtnFullWidth,
                styles.deleteModalDangerBtnMargin,
                isDeleting && styles.deleteModalBtnDisabled,
              ]}
              onPress={handleConfirmDeleteAccount}
              disabled={isDeleting}
              activeOpacity={0.85}
            >
              {isDeleting ? (
                <ActivityIndicator color={Colors.danger} />
              ) : (
                <Text style={styles.deleteModalDangerBtnText}>Delete My Account</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
  },
  profileInfo: { flex: 1, marginLeft: 16 },
  profileName: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },
  subBadge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 4,
    borderWidth: 1,
  },
  subBadgeFree: {
    backgroundColor: Colors.bgElevated,
    borderColor: Colors.border,
  },
  subBadgePro: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
  },
  subBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
  },
  subBadgeTextFree: { color: Colors.textSecondary },
  subBadgeTextPro: { color: Colors.accent },
  profileChevron: {
    fontFamily: Fonts.regular,
    fontSize: 20,
    color: Colors.textTertiary,
  },

  sectionHeading: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 8,
  },

  sectionCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  rowValue: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  rowChevron: {
    fontFamily: Fonts.regular,
    fontSize: 18,
    color: Colors.textTertiary,
  },
  weightValueGroup: { alignItems: 'flex-end' },
  weightPrimary: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  weightSecondary: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  weightTertiary: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.accent,
    marginTop: 1,
  },
  weightTertiarySuccess: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.success,
    marginTop: 1,
  },

  helperText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    marginTop: 8,
    marginBottom: 4,
  },

  signOutBtn: {
    marginTop: 32,
    height: 52,
    borderRadius: Radius.lg,
    backgroundColor: Colors.dangerMuted,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.danger,
    textAlign: 'center',
  },

  devButton: {
    marginTop: 32,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderStyle: 'dashed',
  },
  devButtonText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },

  versionText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 16,
  },

  skeletonAvatar: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    backgroundColor: Colors.divider,
  },
  skeletonTextBlock: { flex: 1, marginLeft: 16, gap: 8 },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.divider,
    width: '60%',
  },
  skeletonLineShort: {
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.divider,
    width: '30%',
  },
  skeletonPill: {
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.divider,
    width: '35%',
  },
  skeletonPillShort: {
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.divider,
    width: '25%',
  },

  // ── Error ──
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

  supportRowLabelDanger: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.danger,
  },

  deleteModalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  deleteModalCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  deleteModalTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  deleteModalBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginVertical: Spacing.xxxl,
    lineHeight: LineHeights.body,
  },
  deleteModalBtnFullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  deleteModalDangerBtnMargin: {
    marginTop: Spacing.md,
  },
  deleteModalDangerBtn: {
    height: 56,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.danger,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalDangerBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.danger,
  },
  deleteModalBtnDisabled: {
    opacity: 0.5,
  },

});

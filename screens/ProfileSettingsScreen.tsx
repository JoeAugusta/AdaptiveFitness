import { useEffect, useRef, useState, useCallback } from 'react';
import { stripEmDash } from '../utils/jordanText';
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
  Switch,
  Platform,
  TextInput,
  Keyboard,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
} from '../constants/design';
import { useMetric } from '../utils/units';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEntitlement } from '../hooks/useEntitlement';
import { getLocalDateString } from '../utils/dateUtils';
import BetaFeedbackModal from '../components/BetaFeedbackModal';
import { Ionicons } from '@expo/vector-icons';

// ── Label maps ──


function formatGoal(goalId: string): string {
  const id = String(goalId ?? '').trim();
  const map: Record<string, string> = {
    fat_loss: 'Fat Loss',
    hypertrophy: 'Build Muscle',
    strength: 'Get Stronger',
    power_hypertrophy: 'Strength & Size',
    recomp: 'Body Recomposition',
    general: 'General Fitness',
  };
  if (!id) return '—';
  return (
    map[id] ??
    id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}



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
  /** Mon–Sun labels from onboarding — length is days/week */
  training_days?: string[] | null;
  /** If present alongside training_age — prefer onboarding column names per row shape */
  experience?: string | null;
  session_length?: string | number | null;
  weight_lbs: number;
  height_ft: number;
  height_in: number;
  age: number;
  sex: string;
  full_name?: string | null;
  display_name?: string | null;
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

function profileDisplayNameHeader(
  profile: UserProfile | null | undefined,
  fromMeta: (k: string) => string,
  emailFallback: string,
): string {
  const trim = (s: unknown) => (typeof s === 'string' ? s.trim() : '');
  return (
    trim(profile?.full_name) ||
    trim(profile?.display_name) ||
    fromMeta('full_name') ||
    fromMeta('name') ||
    emailFallback ||
    ''
  );
}

/** Avatar initial: display_name → full_name → email (matches HomeScreen fallback chain). */
function profileHeaderInitialLetter(
  profile: UserProfile | null | undefined,
  emailFallback: string,
): string {
  const trim = (s: unknown) => (typeof s === 'string' ? s.trim() : '');
  const parts = [trim(profile?.display_name), trim(profile?.full_name), emailFallback.trim()];
  for (const s of parts) {
    const c = s.charAt(0);
    if (c) return c.toUpperCase();
  }
  return '?';
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
}

function mapped(map: Record<string, string>, key: string | undefined): string {
  return key ? (map[key] ?? key) : '—';
}

function formatHeightFeetInches(
  ft: number | null | undefined,
  inch: number | null | undefined,
): string {
  if (
    ft == null ||
    inch == null ||
    !Number.isFinite(Number(ft)) ||
    !Number.isFinite(Number(inch))
  ) {
    return '—';
  }
  return `${ft}'${inch}"`;
}

function formatSessionLength(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return '—';
  const str = String(val).trim();
  if (!str) return '—';
  if (str.toLowerCase().includes('min')) return str;
  if (str.includes('-') || str.includes('–')) {
    return str.replace(/-/g, '–') + ' min';
  }
  return `${str} min`;
}

/** Split catalogue id → display label (experience suffix stripped for full_body_*). */
function formatSplit(splitId: string): string {
  const id = String(splitId).trim();
  if (id === '' || id === '—') return '—';

  const map: Record<string, string> = {
    full_body: 'Full Body',
    full_body_beginner: 'Full Body',
    full_body_advanced: 'Full Body',
    full_body_intermediate: 'Full Body',
    upper_lower: 'Upper / Lower',
    phul: 'PHUL',
    phat: 'PHAT',
    ppl: 'PPL',
    ppl_upper: 'PPL + Upper',
    ppl_leg_focus: 'PPL + Leg Focus',
    leg_focus: 'Leg Focus',
    upper_focus: 'Upper Focus',
    arnold: 'Arnold Split',
    batman: 'Batman Split',
    strength_2x: 'Strength Focus',
    strength_3x: 'Strength Focus',
    push_pull_legs: 'Push / Pull / Legs',
    bro_split: 'Bro Split',
    custom: 'Custom',
  };

  const key = id.toLowerCase();
  return (
    map[key] ??
    id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function formatExperienceForDisplay(exp: unknown): string {
  if (exp === null || exp === undefined || exp === '') return '—';
  const raw = String(exp).trim().toLowerCase();
  if (raw === 'beginner') return 'Beginner';
  if (raw === 'intermediate') return 'Intermediate';
  if (raw === 'advanced') return 'Advanced';
  return String(exp).trim();
}

function formatEquipmentForDisplay(eq: unknown): string {
  if (eq === null || eq === undefined || eq === '' || eq === '—') return '—';
  const key = String(eq).trim().toLowerCase().replace(/\s+/g, '_');
  if (key === 'full_gym') return 'Full Gym';
  if (key === 'home_gym') return 'Home Gym';
  if (key === 'dumbbells') return 'Dumbbells Only';
  if (key === 'barbell') return 'Barbell Only';
  if (key === 'bodyweight') return 'Bodyweight';
  return String(eq).trim();
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
  const pj = (plan?.plan_json ?? {}) as Record<string, unknown>;

  console.log('[TRAINING PREFS]', {
    experience: pj?.experience,
    split: pj?.split,
    equipment: pj?.equipment,
    sessionLength: pj?.sessionLength,
    daysPerWeek: pj?.daysPerWeek,
    allPlanJsonKeys: Object.keys(pj),
  });

  // plan_json first; profile fallback (DB uses training_age / session_duration_mins).
  const experienceVal =
    pj.experience ??
    profile?.experience ??
    profile?.training_age ??
    '—';

  const equipmentVal =
    pj.equipment ??
    profile?.equipment ??
    '—';

  const sessionLengthVal =
    pj.sessionLength ??
    profile?.session_length ??
    profile?.session_duration_mins ??
    '—';

  const daysPerWeek = pj?.daysPerWeek
    ?? profile?.days_per_week
    ?? profile?.training_days?.length
    ?? null;

  const daysDisplay = daysPerWeek != null
    ? `${daysPerWeek} days / week`
    : '—';

  const splitRaw = pj.split ?? profile?.preferred_split ?? '—';
  const splitDisplay =
    splitRaw !== '—' && splitRaw != null && String(splitRaw).trim() !== ''
      ? formatSplit(String(splitRaw))
      : '—';

  const sessionDisplay =
    sessionLengthVal !== '—' &&
    sessionLengthVal != null &&
    sessionLengthVal !== '' &&
    !(
      typeof sessionLengthVal === 'number' && !Number.isFinite(sessionLengthVal)
    )
      ? formatSessionLength(sessionLengthVal as string | number)
      : '—';

  const experienceDisplay = formatExperienceForDisplay(experienceVal);
  const equipmentDisplay =
    equipmentVal === undefined || equipmentVal === null || equipmentVal === ''
      ? '—'
      : equipmentVal !== '—'
        ? formatEquipmentForDisplay(equipmentVal)
        : '—';

  return {
    experienceDisplay,
    daysDisplay,
    sessionDisplay,
    splitDisplay,
    equipmentDisplay,
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
  const insets = useSafeAreaInsets();
  const {
    isPro: rcIsPro,
    status: entitlementStatus,
    loading: rcEntitlementLoading,
  } = useEntitlement();

  const [data, setData] = useState<ScreenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const [latestWeightLog, setLatestWeightLog] = useState<{
    weight_lbs: number;
    log_date: string;
  } | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);

  const [showHeightSheet, setShowHeightSheet] = useState(false);
  const [showAgeSheet, setShowAgeSheet] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<1 | 2>(1);
  const [showFeedback, setShowFeedback] = useState(false);
  const [heightFtDraft, setHeightFtDraft] = useState('');
  const [heightInDraft, setHeightInDraft] = useState('');
  const [ageDraft, setAgeDraft] = useState('');
  const [bodyMetricsSheetError, setBodyMetricsSheetError] = useState<string | null>(null);
  const [bodyMetricsFlash, setBodyMetricsFlash] = useState<'saved' | null>(null);
  const [bodyMetricsSaving, setBodyMetricsSaving] = useState(false);

  /** BUG-8: DEV-only — dashboard always shows workout card when true */
  const [devBypassDayGate, setDevBypassDayGate] = useState(false);
  /** DEV-only — next WorkoutComplete save treats session as plan-final */
  const [devForcePlanComplete, setDevForcePlanComplete] = useState(false);

  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const { isMetric, setIsMetric, formatBodyWeight } = useMetric();

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

  useEffect(() => {
    if (__DEV__) {
      AsyncStorage.getItem('dev_bypass_day_gate').then((val) => {
        setDevBypassDayGate(val === 'true');
      });
      AsyncStorage.getItem('dev_force_plan_complete').then((v) => {
        setDevForcePlanComplete(v === 'true');
      });
    }
  }, []);

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

      const profile = profileRes.data as (UserProfile & {
        biological_sex?: string | null;
        gender?: string | null;
      }) | null;

      console.log('[PROFILE METRICS]', {
        age: profile?.age,
        height_ft: profile?.height_ft,
        height_in: profile?.height_in,
        sex: profile?.sex ?? profile?.biological_sex ?? profile?.gender,
        allKeys: profile ? Object.keys(profile) : [],
      });

      const weightLog = weightLogRes.data as { weight_lbs: number; log_date: string } | null;
      setLatestWeightLog(weightLog);

      const meta = user.user_metadata as Record<string, unknown> | undefined;
      const fromMeta = (k: string) =>
        typeof meta?.[k] === 'string' ? (meta[k] as string).trim() : '';
      const loadedProfile = profileRes.data as UserProfile | null;
      const displayName = profileDisplayNameHeader(
        loadedProfile,
        fromMeta,
        user.email ?? '',
      );

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

  useEffect(() => {
    if (!bodyMetricsFlash) return;
    const t = setTimeout(() => setBodyMetricsFlash(null), 2000);
    return () => clearTimeout(t);
  }, [bodyMetricsFlash]);

  const openHeightSheet = useCallback(() => {
    const p = data?.profile;
    setHeightFtDraft(p?.height_ft != null ? String(p.height_ft) : '');
    setHeightInDraft(p?.height_in != null ? String(p.height_in) : '');
    setBodyMetricsSheetError(null);
    setShowHeightSheet(true);
  }, [data?.profile]);

  const openAgeSheet = useCallback(() => {
    const p = data?.profile;
    setAgeDraft(p?.age != null ? String(p.age) : '');
    setBodyMetricsSheetError(null);
    setShowAgeSheet(true);
  }, [data?.profile]);

  const saveHeight = useCallback(async () => {
    setBodyMetricsSheetError(null);
    const ft = parseInt(heightFtDraft, 10);
    const inch = parseInt(heightInDraft, 10);
    if (!Number.isFinite(ft) || !Number.isFinite(inch)) {
      setBodyMetricsSheetError('Enter valid numbers for feet and inches.');
      return;
    }
    if (ft < 3 || ft > 8 || inch < 0 || inch > 11) {
      setBodyMetricsSheetError('Height should be roughly 3–8 ft and 0–11 in.');
      return;
    }
    setBodyMetricsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase.from('user_profiles').upsert(
        { user_id: user.id, height_ft: ft, height_in: inch },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      setData((prev) =>
        prev
          ? {
              ...prev,
              profile: { ...prev.profile, height_ft: ft, height_in: inch },
            }
          : prev,
      );
      Keyboard.dismiss();
      setShowHeightSheet(false);
      setBodyMetricsFlash('saved');
    } catch (e) {
      setBodyMetricsSheetError(
        e instanceof Error ? e.message : 'Could not save.',
      );
    } finally {
      setBodyMetricsSaving(false);
    }
  }, [heightFtDraft, heightInDraft]);

  const saveAge = useCallback(async () => {
    setBodyMetricsSheetError(null);
    const age = parseInt(ageDraft, 10);
    if (!Number.isFinite(age) || age < 13 || age > 99) {
      setBodyMetricsSheetError('Age must be between 13 and 99.');
      return;
    }
    setBodyMetricsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase.from('user_profiles').upsert(
        { user_id: user.id, age },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      setData((prev) =>
        prev ? { ...prev, profile: { ...prev.profile, age } } : prev,
      );
      Keyboard.dismiss();
      setShowAgeSheet(false);
      setBodyMetricsFlash('saved');
    } catch (e) {
      setBodyMetricsSheetError(
        e instanceof Error ? e.message : 'Could not save.',
      );
    } finally {
      setBodyMetricsSaving(false);
    }
  }, [ageDraft]);

  const resetToOnboarding = () => {
    const rootNav = navigation.getParent()?.getParent();
    rootNav?.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Onboarding' }],
      }),
    );
  };

  const clearSummaryViewedKeys = () => {
    void (async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const toRemove = keys.filter((k) => k.startsWith('summary_viewed_'));
        if (toRemove.length > 0) {
          await AsyncStorage.multiRemove(toRemove);
        }
        Alert.alert('', 'Summary banner keys cleared — reload dashboard to see banners');
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : String(e));
      }
    })();
  };

  const handleDeleteAccount = () => {
    setDeleteConfirmStep(1);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteAccount = async () => {
    try {
      setIsDeleting(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error('No session');

      const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

      const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.user.id }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Deletion failed');
      }

      await supabase.auth.signOut();
      setShowDeleteConfirm(false);
      navigation.reset({
        index: 0,
        routes: [{ name: 'Auth' as never }],
      });
    } catch (error: unknown) {
      setShowDeleteConfirm(false);
      setIsDeleting(false);
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Something went wrong. Please try again.',
        [{ text: 'OK' }],
      );
    } finally {
      setIsDeleting(false);
    }
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

  const today = getLocalDateString();
  const isToday = latestWeightLog?.log_date === today;

  const trainingPrefs = data
    ? trainingPrefsDisplay(data.plan, data.profile)
    : null;

  const showRateApp = (data?.plan?.current_week ?? 1) > 1;

  const handleGoalRowPress = useCallback(() => {
    const goalKey = data?.goal?.goal_type ?? 'general';
    if (Platform.OS === 'web') {
      navigation.navigate('GoalDetails', { goal: goalKey });
      return;
    }
    if (rcEntitlementLoading) return;
    if (rcIsPro) {
      navigation.navigate('GoalDetails', { goal: goalKey });
      return;
    }
    Alert.alert(
      'Pro Feature',
      'Changing your goal generates a new plan — this is a Pro feature. Upgrade to get unlimited plan generations.',
      [
        { text: 'Not Now', style: 'cancel' },
        {
          text: 'Upgrade',
          onPress: () =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            navigation.navigate('ProfileTab' as any, {
              screen: 'SubscriptionManagement',
            }),
        },
      ],
    );
  }, [navigation, data?.goal?.goal_type, rcIsPro, rcEntitlementLoading]);

  // ── Render ──

  return (
    <>
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
                {data ? profileHeaderInitialLetter(data.profile, data.email) : ''}
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
            <View style={styles.profileHeaderRight}>
              <Text style={styles.profileHeaderLinkText}>Subscription</Text>
              <Text style={styles.profileChevron}>›</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── 2. My Plan ── */}
        <Text style={styles.sectionHeading}>MY PLAN</Text>
        {loading ? (
          <SkeletonCard count={3} pulseAnim={pulseAnim} />
        ) : (
          <View style={styles.sectionCard}>
            <TouchableOpacity
              style={styles.row}
              onPress={handleGoalRowPress}
              activeOpacity={0.7}
              disabled={Platform.OS !== 'web' && rcEntitlementLoading}
            >
              <Text style={styles.rowLabel}>Goal</Text>
              <View style={styles.goalRowRight}>
                <Text style={[styles.rowValue, styles.goalRowValue]} numberOfLines={1}>
                  {formatGoal(
                    String(
                      (data?.plan?.plan_json?.goal ??
                        data?.goal?.goal_type ??
                        '') as string,
                    ),
                  )}
                </Text>
                {Platform.OS !== 'web' && !rcEntitlementLoading && !rcIsPro ? (
                  <Ionicons name="lock-closed-outline" size={16} color={Colors.textSecondary} />
                ) : (
                  <Text style={styles.rowChevron}>›</Text>
                )}
              </View>
            </TouchableOpacity>
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
              value={
                data?.plan
                  ? truncate(
                      stripEmDash(
                        String(
                          data.plan.plan_json?.title ?? data.plan.title ?? '—',
                        ).replace(/_/g, ' '),
                      ),
                      20,
                    )
                  : '—'
              }
              isLast
            />
          </View>
        )}

        {/* ── 3. Body Metrics ── */}
        <Text style={styles.sectionHeading}>BODY METRICS</Text>
        {loading ? (
          <SkeletonCard count={4} pulseAnim={pulseAnim} />
        ) : (
          <>
            <View style={styles.sectionCard}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Weight</Text>
                <View style={styles.weightValueGroup}>
                  <Text style={styles.weightPrimary}>
                    {latestWeightLog
                      ? formatBodyWeight(latestWeightLog.weight_lbs)
                      : data?.profile.weight_lbs != null
                        ? formatBodyWeight(data.profile.weight_lbs)
                        : '—'}
                  </Text>
                  {latestWeightLog ? (
                    <Text style={styles.weightSecondary}>
                      {isToday
                        ? 'Logged today'
                        : `Logged ${new Date(latestWeightLog.log_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </Text>
                  ) : null}
                  {isToday ? (
                    <View style={styles.weightUpToDateRow}>
                      <Text style={styles.weightTertiarySuccess}>Up to date</Text>
                      <Ionicons name="checkmark" size={12} color={Colors.success} />
                    </View>
                  ) : (
                    <Text style={styles.weightTertiary}>Log today from Dashboard</Text>
                  )}
                </View>
              </View>
              <TouchableOpacity
                style={styles.row}
                onPress={openHeightSheet}
                activeOpacity={0.7}
              >
                <Text style={styles.rowLabel}>Height</Text>
                <View style={styles.goalRowRight}>
                  <Text style={[styles.rowValue, styles.goalRowValue]} numberOfLines={1}>
                    {formatHeightFeetInches(
                      data?.profile.height_ft,
                      data?.profile.height_in,
                    )}
                  </Text>
                  <Text style={styles.rowChevron}>›</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.row}
                onPress={openAgeSheet}
                activeOpacity={0.7}
              >
                <Text style={styles.rowLabel}>Age</Text>
                <View style={styles.goalRowRight}>
                  <Text style={[styles.rowValue, styles.goalRowValue]} numberOfLines={1}>
                    {data?.profile.age != null && Number.isFinite(Number(data.profile.age))
                      ? `${data.profile.age} years`
                      : '—'}
                  </Text>
                  <Text style={styles.rowChevron}>›</Text>
                </View>
              </TouchableOpacity>
              <View style={[styles.row, styles.rowLast]}>
                <Text style={styles.rowLabel}>Biological Sex</Text>
                <View style={styles.sexRowRight}>
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {mapped(SEX_LABELS, data?.profile.sex)}
                  </Text>
                  <Text style={styles.notEditableHint}>(not editable)</Text>
                </View>
              </View>
            </View>
            {bodyMetricsFlash ? (
              <Text style={styles.bodyMetricsFlash}>Saved</Text>
            ) : null}
          </>
        )}

        {/* ── 3b. Preferences — units ── */}
        <Text style={styles.sectionHeading}>PREFERENCES</Text>
        <View style={styles.sectionCard}>
          <View style={styles.unitsPrefRow}>
            <Text style={styles.unitsPrefLabel}>Units</Text>
            <View style={styles.unitsPillRow}>
              <TouchableOpacity
                style={[styles.unitsPill, !isMetric ? styles.unitsPillActive : null]}
                onPress={() => void setIsMetric(false)}
                activeOpacity={0.75}
              >
                <Text style={[styles.unitsPillText, !isMetric ? styles.unitsPillTextActive : null]}>
                  lbs
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.unitsPill, isMetric ? styles.unitsPillActive : null]}
                onPress={() => void setIsMetric(true)}
                activeOpacity={0.75}
              >
                <Text style={[styles.unitsPillText, isMetric ? styles.unitsPillTextActive : null]}>
                  kg
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

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

        {/* ── Account ── */}
        <Text style={styles.sectionHeading}>ACCOUNT</Text>
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={[
              styles.row,
              styles.rowLast,
              !rcIsPro && styles.subscriptionRowHighlight,
            ]}
            onPress={() => navigation.navigate('SubscriptionManagement')}
            activeOpacity={0.7}
          >
            <View style={styles.subscriptionRowLeft}>
              <Ionicons
                name="star-outline"
                size={20}
                color={rcIsPro ? Colors.textSecondary : Colors.accent}
              />
              <View style={styles.subscriptionRowText}>
                <Text
                  style={[
                    styles.subscriptionRowTitle,
                    !rcIsPro && styles.subscriptionRowLabelHighlight,
                  ]}
                >
                  {rcIsPro ? 'Manage Subscription' : 'Upgrade to Pro'}
                </Text>
                <Text style={styles.subscriptionRowSublabel}>
                  {rcIsPro
                    ? entitlementStatus === 'trial'
                      ? 'Free trial active'
                      : 'Pro plan active'
                    : 'Unlock adaptive coaching'}
                </Text>
              </View>
            </View>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── 5. App ── */}
        <Text style={styles.sectionHeading}>APP</Text>
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={[styles.row, !showRateApp && styles.rowLast]}
            onPress={() => navigation.navigate('NotificationsSettings' as never)}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>Workout Reminders</Text>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
          {showRateApp ? (
            <TouchableOpacity
              style={[styles.row, styles.rowLast]}
              onPress={() => Linking.openURL('https://apps.apple.com')}
              activeOpacity={0.7}
            >
              <Text style={styles.rowLabel}>Rate Hone</Text>
              <Text style={styles.rowChevron}>›</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── 6. Support ── */}
        <Text style={styles.sectionHeading}>SUPPORT</Text>
        {/* TODO: replace with live URL before public launch */}
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              void (async () => {
                try {
                  await Linking.openURL('https://hone.app/privacy');
                } catch {
                  /* Placeholder URL may be unreachable */
                }
              })();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>Privacy Policy</Text>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              void (async () => {
                try {
                  await Linking.openURL('https://hone.app/terms');
                } catch {
                  /* Placeholder URL may be unreachable */
                }
              })();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>Terms of Service</Text>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={() => setShowFeedback(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.feedbackRowLabel}>Send Feedback</Text>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, styles.rowLast, isDeleting && styles.rowDeleting]}
            onPress={() => {
              void handleDeleteAccount();
            }}
            disabled={isDeleting}
            activeOpacity={0.7}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={Colors.danger} />
            ) : (
              <Text style={styles.deleteAccountText}>Delete Account</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── 7. Sign Out ── */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={() => {
            const confirmed = Platform.OS === 'web'
              ? window.confirm('Are you sure you want to sign out?')
              : true; // On native, skip confirm and sign out directly
                      // OR keep Alert for native only

            if (Platform.OS !== 'web') {
              // Native: use Alert
              Alert.alert(
                'Sign Out',
                'Are you sure you want to sign out?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Sign Out',
                    style: 'destructive',
                    onPress: () => {
                      supabase.auth.signOut()
                        .finally(() => {
                          navigation.reset({
                            index: 0,
                            routes: [{ name: 'Auth' as never }],
                          });
                        });
                    },
                  },
                ]
              );
              return;
            }

            // Web: use window.confirm
            if (window.confirm('Are you sure you want to sign out?')) {
              supabase.auth.signOut()
                .finally(() => {
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'Auth' as never }],
                  });
                });
            }
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {__DEV__ ? (
          <View style={styles.devSection}>
            <TouchableOpacity
              style={styles.devButton}
              onPress={() => resetToOnboarding()}
              activeOpacity={0.8}
            >
              <Text style={styles.devButtonText}>🛠 DEV: Restart Onboarding</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.devButton, styles.devButtonAfter]}
              onPress={clearSummaryViewedKeys}
              activeOpacity={0.8}
            >
              <Text style={styles.devButtonText}>Clear Summary Banners</Text>
            </TouchableOpacity>

            <View style={styles.devToggleRow}>
              <Text style={styles.devToggleLabel}>
                Bypass Day Gate (test any session)
              </Text>
              <Switch
                value={devBypassDayGate}
                onValueChange={async (val) => {
                  setDevBypassDayGate(val);
                  await AsyncStorage.setItem(
                    'dev_bypass_day_gate',
                    val ? 'true' : 'false',
                  );
                }}
                trackColor={{ false: Colors.border, true: Colors.accentBorder }}
                thumbColor={devBypassDayGate ? Colors.accent : Colors.textTertiary}
                ios_backgroundColor={Colors.border}
              />
            </View>

            <Text style={styles.devToggleHint}>
              When ON: dashboard always shows workout card regardless of day. OFF =
              production behaviour.
            </Text>

            <View style={styles.devToggleRow}>
              <Text style={styles.devToggleLabel}>Force Plan Complete (next session save)</Text>
              <Switch
                value={devForcePlanComplete}
                onValueChange={async (val) => {
                  setDevForcePlanComplete(val);
                  await AsyncStorage.setItem(
                    'dev_force_plan_complete',
                    val ? 'true' : 'false',
                  );
                }}
                trackColor={{ false: Colors.border, true: Colors.accentMuted }}
                thumbColor={devForcePlanComplete ? Colors.accent : Colors.textSecondary}
                ios_backgroundColor={Colors.border}
              />
            </View>

            <TouchableOpacity
              style={[styles.devButton, styles.devButtonAfter]}
              activeOpacity={0.8}
              onPress={async () => {
                try {
                  const {
                    data: { session },
                  } = await supabase.auth.getSession();
                  if (!session?.user?.id) {
                    Alert.alert('DEV', 'No user session found.');
                    return;
                  }
                  const { data: plan, error } = await supabase
                    .from('plans')
                    .select('id')
                    .eq('user_id', session.user.id)
                    .in('status', ['active', 'completed'])
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                  if (error) {
                    Alert.alert('DEV', `Supabase error: ${error.message}`);
                    return;
                  }
                  if (!plan?.id) {
                    Alert.alert(
                      'DEV',
                      'No plan found. Complete onboarding first.',
                    );
                    return;
                  }
                  // Root types use Dashboard: undefined; nested tab params are valid at runtime.
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (navigation as any).navigate('Dashboard', {
                    screen: 'WorkoutTab',
                    params: {
                      screen: 'PlanComplete',
                      params: { planId: plan.id },
                    },
                  });
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : String(e);
                  Alert.alert('DEV', `Error: ${msg}`);
                }
              }}
            >
              <Text style={styles.devPlanCompleteJumpText}>
                DEV: Jump to Plan Complete Screen
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.devButton,
                styles.devButtonAfter,
                { zIndex: 999, elevation: 999 },
              ]}
              onPress={() => {
                void AsyncStorage.removeItem('hone_beta_welcome_seen')
                  .then(() => {
                    Alert.alert('Done', 'Beta welcome screen will show on next launch');
                  })
                  .catch((e: unknown) => {
                    Alert.alert('Error', e instanceof Error ? e.message : String(e));
                  });
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.devButtonText}>DEV: Reset Beta Welcome Screen</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── 8. Version footer ── */}
        <Text style={styles.versionText}>Hone • v1.0.0</Text>
      </ScrollView>

      <Modal
        visible={showHeightSheet}
        transparent
        animationType="slide"
        onRequestClose={() => {
          Keyboard.dismiss();
          setShowHeightSheet(false);
        }}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => {
              Keyboard.dismiss();
              setShowHeightSheet(false);
            }}
          />
          <View style={[styles.sheetCard, { paddingBottom: Spacing.lg + insets.bottom }]}>
            <Text style={styles.sheetTitle}>Edit Height</Text>
            <View style={styles.sheetHeightInputs}>
              <TextInput
                style={styles.sheetInputNarrow}
                value={heightFtDraft}
                onChangeText={setHeightFtDraft}
                keyboardType="number-pad"
                placeholder="5"
                placeholderTextColor={Colors.textTertiary}
              />
              <Text style={styles.sheetBetweenLabel}>ft</Text>
              <TextInput
                style={styles.sheetInputNarrow}
                value={heightInDraft}
                onChangeText={setHeightInDraft}
                keyboardType="number-pad"
                placeholder="11"
                placeholderTextColor={Colors.textTertiary}
              />
              <Text style={styles.sheetBetweenLabel}>in</Text>
            </View>
            {bodyMetricsSheetError && showHeightSheet ? (
              <Text style={styles.sheetError}>{bodyMetricsSheetError}</Text>
            ) : null}
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.sheetBtnSecondary}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowHeightSheet(false);
                  setBodyMetricsSheetError(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.sheetBtnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetBtnPrimary, bodyMetricsSaving && styles.sheetBtnDisabled]}
                onPress={() => void saveHeight()}
                disabled={bodyMetricsSaving}
                activeOpacity={0.8}
              >
                {bodyMetricsSaving ? (
                  <ActivityIndicator color={Colors.textPrimary} />
                ) : (
                  <Text style={styles.sheetBtnPrimaryText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAgeSheet}
        transparent
        animationType="slide"
        onRequestClose={() => {
          Keyboard.dismiss();
          setShowAgeSheet(false);
        }}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => {
              Keyboard.dismiss();
              setShowAgeSheet(false);
            }}
          />
          <View style={[styles.sheetCard, { paddingBottom: Spacing.lg + insets.bottom }]}>
            <Text style={styles.sheetTitle}>Edit Age</Text>
            <TextInput
              style={styles.sheetInputFull}
              value={ageDraft}
              onChangeText={setAgeDraft}
              keyboardType="number-pad"
              placeholder="32"
              placeholderTextColor={Colors.textTertiary}
            />
            {bodyMetricsSheetError && showAgeSheet ? (
              <Text style={styles.sheetError}>{bodyMetricsSheetError}</Text>
            ) : null}
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.sheetBtnSecondary}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowAgeSheet(false);
                  setBodyMetricsSheetError(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.sheetBtnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetBtnPrimary, bodyMetricsSaving && styles.sheetBtnDisabled]}
                onPress={() => void saveAge()}
                disabled={bodyMetricsSaving}
                activeOpacity={0.8}
              >
                {bodyMetricsSaving ? (
                  <ActivityIndicator color={Colors.textPrimary} />
                ) : (
                  <Text style={styles.sheetBtnPrimaryText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isDeleting) setShowDeleteConfirm(false);
        }}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalCard}>
            {deleteConfirmStep === 1 ? (
              <>
                <Text style={styles.deleteModalTitle}>Delete Account</Text>
                <Text style={styles.deleteModalBody}>
                  This will permanently delete your account, all workout history, and your plan. This cannot be undone.
                </Text>
                <View style={styles.deleteModalActions}>
                  <TouchableOpacity
                    style={styles.deleteModalBtnSecondary}
                    onPress={() => setShowDeleteConfirm(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.deleteModalBtnSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteModalBtnDanger}
                    onPress={() => setDeleteConfirmStep(2)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.deleteModalBtnDangerText}>Continue</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.deleteModalTitle}>Are you sure?</Text>
                <Text style={styles.deleteModalBody}>
                  Your account and all data will be permanently deleted.
                </Text>
                <View style={styles.deleteModalActions}>
                  <TouchableOpacity
                    style={styles.deleteModalBtnSecondary}
                    onPress={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.deleteModalBtnSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.deleteModalBtnDanger,
                      isDeleting && { opacity: 0.6 },
                    ]}
                    onPress={() => {
                      void confirmDeleteAccount();
                    }}
                    disabled={isDeleting}
                    activeOpacity={0.7}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.deleteModalBtnDangerText}>
                        Delete My Account
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
    <BetaFeedbackModal
      visible={showFeedback}
      onClose={() => setShowFeedback(false)}
    />
    </>
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
    backgroundColor: Colors.bgElevated,
    borderWidth: 1.5,
    borderColor: Colors.border,
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
    backgroundColor: Colors.bgPrimary,
    borderColor: Colors.textTertiary,
  },
  subBadgePro: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
  },
  subBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
  },
  subBadgeTextFree: { color: Colors.textTertiary },
  subBadgeTextPro: { color: Colors.accent },
  profileChevron: {
    fontFamily: Fonts.regular,
    fontSize: 20,
    color: Colors.textTertiary,
  },
  profileHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  profileHeaderLinkText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
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

  unitsPrefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  unitsPrefLabel: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
  },
  unitsPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  unitsPill: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  unitsPillActive: {
    backgroundColor: Colors.accent,
  },
  unitsPillText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.semiBold,
    color: Colors.textSecondary,
  },
  unitsPillTextActive: {
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
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
  subscriptionRowHighlight: {
    backgroundColor: Colors.accentMuted,
  },
  subscriptionRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  subscriptionRowText: {
    flex: 1,
    gap: 2,
  },
  subscriptionRowTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  subscriptionRowLabelHighlight: {
    color: Colors.accent,
  },
  subscriptionRowSublabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
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
  feedbackRowLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.accent,
  },
  goalRowRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginLeft: 12,
    minWidth: 0,
    gap: 6,
  },
  goalRowValue: {
    flexShrink: 1,
    marginLeft: 0,
  },
  goalLockMark: {
    fontSize: FontSizes.body,
  },
  sexRowRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginLeft: 12,
    minWidth: 0,
    gap: 6,
  },
  notEditableHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    flexShrink: 0,
  },
  bodyMetricsFlash: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.success,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
    marginLeft: 4,
  },

  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetBackdrop: {
    flex: 1,
  },
  sheetCard: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.xl,
  },
  sheetTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
  },
  sheetHeightInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sheetInputNarrow: {
    width: 80,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  sheetInputFull: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  sheetBetweenLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  sheetError: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.danger,
    marginBottom: Spacing.md,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  sheetBtnSecondary: {
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
  },
  sheetBtnSecondaryText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  sheetBtnPrimary: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: Spacing.xl,
    minWidth: 100,
    alignItems: 'center',
  },
  sheetBtnPrimaryText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  sheetBtnDisabled: {
    opacity: 0.6,
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
  },
  weightUpToDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
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
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.dangerMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.danger,
    textAlign: 'center',
  },

  devSection: {
    marginTop: 0,
  },
  devToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  devToggleLabel: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    flex: 1,
  },
  devToggleHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 2,
    marginBottom: Spacing.sm,
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
  devButtonAfter: {
    marginTop: 12,
  },
  devPlanCompleteJumpText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.warning,
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
    flex: 1,
    flexShrink: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.danger,
  },
  deleteAccountText: {
    flex: 1,
    flexShrink: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.danger,
  },

  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  deleteModalCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 24,
    width: '100%',
  },
  deleteModalTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  deleteModalBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 24,
  },
  deleteModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  deleteModalBtnSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  deleteModalBtnSecondaryText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  deleteModalBtnDanger: {
    backgroundColor: Colors.danger,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  deleteModalBtnDangerText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: '#FFFFFF',
  },

  rowDeleting: {
    opacity: 0.65,
  },

});

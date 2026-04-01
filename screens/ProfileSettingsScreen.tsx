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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';

// ── Design tokens ──

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CARD_SELECTED_BG = 'rgba(59,130,246,0.12)';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const DISABLED_BG = '#334155';
const DIVIDER_COLOR = '#2D3F55';

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
}

interface ScreenData {
  email: string;
  subscriptionStatus: string;
  profile: UserProfile;
  goal: GoalData | null;
  plan: PlanData | null;
}

// ── Helpers ──

function getInitials(email: string): string {
  return (email.split('@')[0]?.[0] ?? '').toUpperCase();
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
}

function mapped(map: Record<string, string>, key: string | undefined): string {
  return key ? (map[key] ?? key) : '—';
}

// ── Sub-components ──

function Divider() {
  return <View style={styles.divider} />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
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
        <View key={i}>
          {i > 0 && <View style={styles.divider} />}
          <View style={styles.row}>
            <View style={styles.skeletonPill} />
            <View style={styles.skeletonPillShort} />
          </View>
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
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('plans')
          .select('current_week, total_weeks, title')
          .eq('user_id', uid)
          .eq('status', 'active')
          .order('id', { ascending: false })
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

      setData({
        email: user.email ?? '',
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

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          const rootNav = navigation.getParent()?.getParent() as
            | NativeStackNavigationProp<RootStackParamList>
            | undefined;
          rootNav?.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
        },
      },
    ]);
  };

  // ── Error state ──

  if (hasError && !loading) {
    return (
      <SafeAreaView style={styles.safe}>
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

  // ── Render ──

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Profile Header ── */}
        {loading ? (
          <Animated.View style={[styles.profileCard, { opacity: pulseAnim }]}>
            <View style={styles.skeletonAvatar} />
            <View style={styles.skeletonTextBlock}>
              <View style={styles.skeletonLine} />
              <View style={styles.skeletonLineShort} />
            </View>
          </Animated.View>
        ) : (
          <TouchableOpacity
            style={styles.profileCard}
            onPress={() => navigation.navigate('SubscriptionManagement')}
            activeOpacity={0.8}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {data ? getInitials(data.email) : ''}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileEmail} numberOfLines={1}>
                {data?.email}
              </Text>
              <View style={[styles.subBadge, isPro ? styles.subBadgePro : styles.subBadgeFree]}>
                <Text style={[styles.subBadgeText, !isPro && styles.subBadgeTextFree]}>
                  {isPro ? 'PRO' : 'FREE'}
                </Text>
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* ── 2. My Plan ── */}
        <Text style={styles.sectionHeading}>MY PLAN</Text>
        {loading ? (
          <SkeletonCard count={3} pulseAnim={pulseAnim} />
        ) : (
          <View style={styles.sectionCard}>
            <Row label="Goal" value={mapped(GOAL_LABELS, data?.goal?.goal_type)} />
            <Divider />
            <Row
              label="Current Week"
              value={
                data?.plan
                  ? `Week ${data.plan.current_week} of ${data.plan.total_weeks}`
                  : '—'
              }
            />
            <Divider />
            <Row
              label="Active Plan"
              value={data?.plan ? truncate(data.plan.title, 20) : '—'}
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
                <Text style={styles.rowValue}>
                  {latestWeightLog
                    ? `${latestWeightLog.weight_lbs} lbs`
                    : `${data?.profile.weight_lbs ?? '—'} lbs`}
                </Text>
                {latestWeightLog ? (
                  <Text style={styles.weightLogDate}>
                    {`Logged ${new Date(latestWeightLog.log_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  </Text>
                ) : null}
                <Text style={styles.weightLogHint}>Log daily from Dashboard</Text>
              </View>
            </View>
            <Divider />
            <Row
              label="Height"
              value={`${data?.profile.height_ft ?? '—'}'${data?.profile.height_in ?? '—'}"`}
            />
            <Divider />
            <Row
              label="Age"
              value={data?.profile.age != null ? String(data.profile.age) : '—'}
            />
            <Divider />
            <Row label="Biological Sex" value={mapped(SEX_LABELS, data?.profile.sex)} />
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
                value={mapped(TRAINING_AGE_LABELS, data?.profile.training_age)}
              />
              <Divider />
              <Row
                label="Days/Week"
                value={
                  data?.profile.days_per_week != null
                    ? `${data.profile.days_per_week} days`
                    : '—'
                }
              />
              <Divider />
              <Row
                label="Session Length"
                value={
                  data?.profile.session_duration_mins != null
                    ? `${data.profile.session_duration_mins} min`
                    : '—'
                }
              />
              <Divider />
              <Row label="Split" value={mapped(SPLIT_LABELS, data?.profile.preferred_split)} />
              <Divider />
              <Row label="Equipment" value={mapped(EQUIPMENT_LABELS, data?.profile.equipment)} />
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
            <Text style={styles.chevronSmall}>›</Text>
          </TouchableOpacity>
          <Divider />
          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL('https://apps.apple.com')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>Rate Adaptive Fitness</Text>
            <Text style={styles.chevronSmall}>›</Text>
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
            <Text style={styles.chevronSmall}>›</Text>
          </TouchableOpacity>
          <Divider />
          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL('https://adaptive.fitness/terms')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>Terms of Service</Text>
            <Text style={styles.chevronSmall}>›</Text>
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

        {/* ── 8. Version footer ── */}
        <Text style={styles.versionText}>Adaptive Fitness • v1.0.0</Text>
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG_DARK },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 48 },

  // ── Profile header card ──
  profileCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: ACCENT_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  profileInfo: { flex: 1, marginLeft: 14 },
  profileEmail: { color: TEXT_PRIMARY, fontSize: 15, fontWeight: '600' },
  subBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  subBadgePro: { backgroundColor: ACCENT_BLUE },
  subBadgeFree: { backgroundColor: DISABLED_BG },
  subBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  subBadgeTextFree: { color: TEXT_SECONDARY },
  chevron: { color: TEXT_SECONDARY, fontSize: 22, marginLeft: 8 },

  // ── Section heading ──
  sectionHeading: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 24,
  },

  // ── Section card (rows with dividers) ──
  sectionCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    overflow: 'hidden',
  },

  // ── Row ──
  row: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: { color: TEXT_SECONDARY, fontSize: 14 },
  rowValue: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  weightValueGroup: { alignItems: 'flex-end' },
  weightLogDate: { color: TEXT_SECONDARY, fontSize: 11, marginTop: 2 },
  weightLogHint: { color: TEXT_SECONDARY, fontSize: 11, fontStyle: 'italic', marginTop: 2 },

  // ── Divider ──
  divider: { height: 1, backgroundColor: DIVIDER_COLOR },

  // ── Helper text ──
  helperText: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 6,
  },

  // ── App section ──
  chevronSmall: { color: TEXT_SECONDARY, fontSize: 22 },

  // ── Sign Out ──
  signOutBtn: {
    marginTop: 32,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: { color: '#EF4444', fontSize: 16, fontWeight: '600' },

  // ── Version footer ──
  versionText: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },

  // ── Skeleton ──
  skeletonAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: DISABLED_BG,
  },
  skeletonTextBlock: { flex: 1, marginLeft: 14, gap: 8 },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: DISABLED_BG,
    width: '60%',
  },
  skeletonLineShort: {
    height: 14,
    borderRadius: 7,
    backgroundColor: DISABLED_BG,
    width: '30%',
  },
  skeletonPill: {
    height: 14,
    borderRadius: 7,
    backgroundColor: DISABLED_BG,
    width: '35%',
  },
  skeletonPillShort: {
    height: 14,
    borderRadius: 7,
    backgroundColor: DISABLED_BG,
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
    color: TEXT_SECONDARY,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: ACCENT_BLUE,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },

});

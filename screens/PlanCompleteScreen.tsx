import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import {
  Colors,
  Fonts,
  FontSizes,
  Spacing,
  Radius,
  LineHeights,
} from '../constants/design';
import { JordanLabel } from '../components/JordanLabel';
import { Ionicons } from '@expo/vector-icons';
import { stripEmDash } from '../utils/jordanText';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'PlanComplete'>;
type RouteType = RouteProp<RootStackParamList, 'PlanComplete'>;

const GOAL_DISPLAY: Record<string, string> = {
  fat_loss: 'Fat Loss',
  hypertrophy: 'Build Muscle',
  strength: 'Get Stronger',
  power_hypertrophy: 'Strength & Size',
  recomp: 'Body Recomposition',
  general: 'General Fitness',
};

const GOAL_COLOR: Record<string, string> = {
  fat_loss: Colors.accent,
  hypertrophy: Colors.success,
  strength: Colors.warning,
  power_hypertrophy: Colors.warning,
  recomp: Colors.accent,
  general: Colors.accent,
};

type LiftGain = { name: string; from: number; to: number; gainLbs: number };
type ReviewStats = {
  totalWeeks: number;
  completedSessions: number;
  scheduledSessions: number;
  completionRate: number;
  topLiftGains: LiftGain[];
  bodyweightDelta: number | null;
};
type FinalReview = {
  headline: string;
  jordanReview: string;
  highlights: string[];
  nextPlanRationale: string;
  suggestedNextGoal: string;
  stats: ReviewStats;
};

function isFinalReview(value: unknown): value is FinalReview {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.headline === 'string' &&
    typeof o.jordanReview === 'string' &&
    Array.isArray(o.highlights) &&
    typeof o.nextPlanRationale === 'string' &&
    typeof o.suggestedNextGoal === 'string' &&
    typeof o.stats === 'object' &&
    o.stats !== null
  );
}

export default function PlanCompleteScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { planId } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [review, setReview] = useState<FinalReview | null>(null);

  const fetchReview = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('No session');

      const { data, error } = await supabase.functions.invoke('generate-final-review', {
        body: { planId, userId },
      });

      if (error) throw new Error(error.message ?? 'Review generation failed');
      if (!isFinalReview(data)) throw new Error('Invalid response');
      setReview(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    void fetchReview();
  }, [fetchReview]);

  const completedDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const goalKey = review?.suggestedNextGoal ?? 'general';
  const underlineColor = GOAL_COLOR[goalKey] ?? Colors.accent;

  const handleStartNewPlan = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Onboarding', params: { skipPaywall: true } }],
    });
  };

  const handleGoDashboard = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Dashboard' }] });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Jordan is writing your review…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !review) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.errorCard}>
            <Text style={styles.sectionHeading}>JORDAN</Text>
            <Text style={styles.errorTitle}>Could not load your review right now.</Text>
            <Text style={styles.errorBody}>
              Check your connection and try again. Your plan is still on record.
            </Text>
            <TouchableOpacity
              style={styles.outlineBtn}
              activeOpacity={0.85}
              onPress={() => void fetchReview()}
            >
              <Text style={styles.outlineBtnText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.textBtn}
              activeOpacity={0.7}
              onPress={handleGoDashboard}
            >
              <Text style={styles.textBtnLabel}>Go to Dashboard</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const paragraphs = review.jordanReview.split(/\n\n+/).filter(Boolean).map((p) => stripEmDash(p));
  const highlightRows = review.highlights.slice(0, 3);
  const lifts = review.stats.topLiftGains.slice(0, 3);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        scrollIndicatorInsets={{ bottom: Spacing.xxxxl }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionHeading}>PLAN COMPLETE</Text>

        <View style={styles.heroBlock}>
          <Text style={styles.heroHeadline}>{stripEmDash(review.headline)}</Text>
          <View style={[styles.heroUnderline, { backgroundColor: underlineColor }]} />
          <View style={styles.avatarMeta}>
            <JordanLabel />
            <Text style={styles.completedDate}>Completed {completedDate}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <Text style={styles.statPillLabel}>Sessions</Text>
            <Text style={styles.statPillValue}>
              {review.stats.completedSessions} / {review.stats.scheduledSessions}
            </Text>
          </View>
          <View style={styles.statPill}>
            <Text style={styles.statPillLabel}>Completion</Text>
            <Text style={styles.statPillValue}>{review.stats.completionRate}%</Text>
          </View>
          <View style={styles.statPill}>
            <Text style={styles.statPillLabel}>Weeks</Text>
            <Text style={styles.statPillValue}>{review.stats.totalWeeks} wks</Text>
          </View>
        </View>

        <View style={styles.jordanCard}>
          <Text style={styles.sectionHeading}>JORDAN&apos;S REVIEW</Text>
          {paragraphs.map((p, i) => (
            <Text
              key={`p-${i}`}
              style={[
                styles.reviewParagraph,
                i < paragraphs.length - 1 ? styles.reviewParaGap : null,
              ]}
            >
              {p}
            </Text>
          ))}
        </View>

        <Text style={styles.sectionHeading}>WHAT YOU BUILT</Text>
        {highlightRows.map((h, i) => (
          <View key={`h-${i}`}>
            {i > 0 ? <View style={styles.rowDivider} /> : null}
            <View style={styles.highlightRow}>
              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={14} color={Colors.success} />
              </View>
              <Text style={styles.highlightText}>{stripEmDash(h)}</Text>
            </View>
          </View>
        ))}

        {lifts.length > 0 ? (
          <>
            <Text style={[styles.sectionHeading, styles.blockTop]}>TOP GAINS</Text>
            {lifts.map((g) => (
              <View key={g.name} style={styles.liftRow}>
                <Text style={styles.liftName}>{g.name}</Text>
                <Text style={styles.liftRange}>
                  {g.from} → {g.to} lbs (+{g.gainLbs} lbs)
                </Text>
              </View>
            ))}
          </>
        ) : null}

        <View style={styles.whatsNextCard}>
          <Text style={styles.sectionHeading}>WHAT&apos;S NEXT</Text>
          <Text style={styles.nextRationale}>{stripEmDash(review.nextPlanRationale)}</Text>
          <View
            style={[
              styles.goalChip,
              { borderColor: GOAL_COLOR[goalKey] ?? Colors.accent },
            ]}
          >
            <Text
              style={[
                styles.goalChipText,
                { color: GOAL_COLOR[goalKey] ?? Colors.accent },
              ]}
            >
              {GOAL_DISPLAY[goalKey] ?? goalKey}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.primaryCta}
          activeOpacity={0.88}
          onPress={handleStartNewPlan}
        >
          <Text style={styles.primaryCtaText}>Start New Plan →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryTextBtn}
          activeOpacity={0.7}
          onPress={handleGoDashboard}
        >
          <Text style={styles.secondaryTextLabel}>Go to Dashboard</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: 48,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.lg,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  sectionHeading: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },
  heroBlock: {
    marginBottom: Spacing.xxl,
  },
  heroHeadline: {
    fontSize: FontSizes.display,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    lineHeight: LineHeights.display,
  },
  heroUnderline: {
    width: 48,
    height: 2,
    borderRadius: Radius.full,
    marginTop: Spacing.md,
  },
  avatarMeta: {
    marginTop: Spacing.xl,
  },
  completedDate: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xxl,
  },
  statPill: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
  },
  statPillLabel: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  statPillValue: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.monoMedium,
    color: Colors.textPrimary,
  },
  jordanCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xxl,
  },
  reviewParagraph: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    lineHeight: LineHeights.body,
  },
  reviewParaGap: {
    marginBottom: Spacing.md,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(34,197,94,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  highlightText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    lineHeight: LineHeights.body,
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.md,
  },
  blockTop: {
    marginTop: Spacing.lg,
  },
  liftRow: {
    marginBottom: Spacing.md,
  },
  liftName: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  liftRange: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.accent,
  },
  whatsNextCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    marginBottom: Spacing.xxl,
  },
  nextRationale: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: LineHeights.body,
    marginBottom: Spacing.lg,
  },
  goalChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    backgroundColor: Colors.bgElevated,
  },
  goalChipText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
  },
  primaryCta: {
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  primaryCtaText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  secondaryTextBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  secondaryTextLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  errorCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.xl,
  },
  errorTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  errorBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: LineHeights.body,
    marginBottom: Spacing.lg,
  },
  outlineBtn: {
    height: 48,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  outlineBtnText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.accent,
  },
  textBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  textBtnLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
});

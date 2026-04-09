import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'RPEEducation'>;
type RouteType = RouteProp<RootStackParamList, 'RPEEducation'>;

const ANCHORS: { rpe: 6 | 8 | 10; tag: string; description: string }[] = [
  {
    rpe: 6,
    tag: 'Too Easy',
    description:
      'You could do 4 or more extra reps. Weight feels too light. Weights go up next session.',
  },
  {
    rpe: 8,
    tag: 'Working Hard',
    description:
      'You could squeeze out 2 more reps, but it would be tough. This is the sweet spot Jordan is targeting.',
  },
  {
    rpe: 10,
    tag: 'Max Effort',
    description:
      'Absolute maximum. You could not do one more rep. Only for testing your 1RM — not regular training.',
  },
];

export default function RPEEducationScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const insets = useSafeAreaInsets();

  const handleGotIt = () => {
    console.log('[RPEEducation] duration in params:', {
      planDuration: route.params.planDuration,
      recommendedWeeks: route.params.recommendedWeeks,
      targetDate: route.params.targetDate,
    });
    navigation.navigate('Constraints', { ...route.params });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Spacing.xxxl + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backHit}
            activeOpacity={0.7}
          >
            <Text style={styles.backArrow}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.stepIndicator}>4 of 8</Text>
        </View>

        <Text style={styles.screenTitle}>Rate of Perceived Exertion</Text>
        <Text style={styles.screenSubtitle}>How hard are you working?</Text>

        <View style={styles.jordanCard}>
          <View style={styles.jordanStripe} />
          <View style={styles.jordanInner}>
            <View style={styles.jordanHeaderRow}>
              <View style={styles.jordanAvatar}>
                <Text style={styles.jordanAvatarText}>J</Text>
              </View>
              <Text style={styles.jordanName}>Jordan</Text>
            </View>
            <Text style={styles.jordanBody}>
              After each set, I&apos;ll ask you to rate how hard it felt on a 1–10 scale. I use
              these ratings to adjust your weights each week — so be honest.
            </Text>
          </View>
        </View>

        <Text style={styles.anchorsSectionLabel}>THE THREE ANCHORS YOU NEED TO KNOW</Text>

        <View style={styles.anchorCards}>
          {ANCHORS.map((a) => {
            const tier =
              a.rpe === 6 ? tier6Styles : a.rpe === 8 ? tier8Styles : tier10Styles;
            return (
              <View key={a.rpe} style={styles.anchorCard}>
                <View style={styles.anchorRow}>
                  <View style={[styles.anchorBadge, tier.badge]}>
                    <Text style={[styles.anchorBadgeText, tier.badgeText]}>{a.rpe}</Text>
                  </View>
                  <View style={styles.anchorContent}>
                    <View style={styles.anchorTitleRow}>
                      <Text style={styles.anchorRpeLabel}>RPE {a.rpe}</Text>
                      <View style={[styles.anchorTag, tier.tag]}>
                        <Text style={[styles.anchorTagText, tier.tagText]}>{a.tag}</Text>
                      </View>
                    </View>
                    <Text style={styles.anchorDescription}>{a.description}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.sweetSpotCard}>
          <Text style={styles.sweetSpotText}>
            🎯 Most of your working sets should land between RPE 7–8. If you&apos;re consistently
            below 6, the weight goes up. Above 9, it comes down.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.8}
          onPress={handleGotIt}
        >
          <Text style={styles.primaryButtonText}>Got It →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
  },
  backHit: {
    paddingRight: 8,
  },
  backArrow: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    color: Colors.accent,
  },
  stepIndicator: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },
  screenTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
    marginTop: Spacing.xl,
  },
  screenSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  jordanCard: {
    marginTop: Spacing.lg,
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    overflow: 'hidden',
  },
  jordanStripe: {
    width: 3,
    backgroundColor: Colors.accent,
    borderTopLeftRadius: Radius.sm,
    borderBottomLeftRadius: Radius.sm,
  },
  jordanInner: {
    flex: 1,
    padding: Spacing.md,
  },
  jordanHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jordanAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jordanAvatarText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  jordanName: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
    marginLeft: Spacing.sm,
  },
  jordanBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    lineHeight: 22,
  },
  anchorsSectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  anchorCards: {
    gap: Spacing.md,
  },
  anchorCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.md,
  },
  anchorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  anchorBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  anchorBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
  },
  anchorContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  anchorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  anchorRpeLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  anchorTag: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  anchorTagText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.label,
  },
  anchorDescription: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    lineHeight: 22,
  },
  sweetSpotCard: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  sweetSpotText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  primaryButtonText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },

  tier6Badge: {
    backgroundColor: Colors.successMuted,
  },
  tier6BadgeText: {
    color: Colors.success,
  },
  tier6Tag: {
    backgroundColor: Colors.successMuted,
  },
  tier6TagText: {
    color: Colors.success,
  },
  tier8Badge: {
    backgroundColor: Colors.warningMuted,
  },
  tier8BadgeText: {
    color: Colors.warning,
  },
  tier8Tag: {
    backgroundColor: Colors.warningMuted,
  },
  tier8TagText: {
    color: Colors.warning,
  },
  tier10Badge: {
    backgroundColor: Colors.dangerMuted,
  },
  tier10BadgeText: {
    color: Colors.danger,
  },
  tier10Tag: {
    backgroundColor: Colors.dangerMuted,
  },
  tier10TagText: {
    color: Colors.danger,
  },
});

const tier6Styles = {
  badge: styles.tier6Badge,
  badgeText: styles.tier6BadgeText,
  tag: styles.tier6Tag,
  tagText: styles.tier6TagText,
};

const tier8Styles = {
  badge: styles.tier8Badge,
  badgeText: styles.tier8BadgeText,
  tag: styles.tier8Tag,
  tagText: styles.tier8TagText,
};

const tier10Styles = {
  badge: styles.tier10Badge,
  badgeText: styles.tier10BadgeText,
  tag: styles.tier10Tag,
  tagText: styles.tier10TagText,
};

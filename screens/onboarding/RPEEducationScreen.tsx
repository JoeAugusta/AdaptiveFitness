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
import { Ionicons } from '@expo/vector-icons';
import { JordanLabel } from '../../components/JordanLabel';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'RPEEducation'>;
type RouteType = RouteProp<RootStackParamList, 'RPEEducation'>;

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
            <JordanLabel />
            <Text style={styles.jordanBody}>
              After each set, I&apos;ll ask you to rate how hard it felt on a 1 to 10 scale. I use
              these ratings to adjust your weights each week, so be honest.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>THE THREE ANCHORS YOU NEED TO KNOW</Text>

        <View style={styles.anchorCard}>
          <View style={[styles.anchorBubble, styles.bubbleGreen]}>
            <Text style={[styles.anchorBubbleNum, styles.bubbleNumGreen]}>6</Text>
          </View>
          <View style={styles.anchorBody}>
            <View style={styles.anchorHeader}>
              <Text style={styles.anchorTitle}>RPE 6</Text>
              <View style={[styles.anchorBadge, styles.badgeEasy]}>
                <Text style={[styles.anchorBadgeText, styles.badgeTextEasy]}>Too Easy</Text>
              </View>
            </View>
            <Text style={styles.anchorDesc}>
              You could do 4 or more extra reps. Weight feels too light. Weights go up next session.
            </Text>
          </View>
        </View>

        <View style={styles.anchorCard}>
          <View style={[styles.anchorBubble, styles.bubbleOrange]}>
            <Text style={[styles.anchorBubbleNum, styles.bubbleNumOrange]}>8</Text>
          </View>
          <View style={styles.anchorBody}>
            <View style={styles.anchorHeader}>
              <Text style={styles.anchorTitle}>RPE 8</Text>
              <View style={[styles.anchorBadge, styles.badgeTarget]}>
                <Text style={[styles.anchorBadgeText, styles.badgeTextTarget]}>Working Hard</Text>
              </View>
            </View>
            <Text style={styles.anchorDesc}>
              You could squeeze out 2 more reps, but it would be tough. This is the sweet spot Jordan is targeting.
            </Text>
          </View>
        </View>

        <View style={styles.anchorCard}>
          <View style={[styles.anchorBubble, styles.bubbleRed]}>
            <Text style={[styles.anchorBubbleNum, styles.bubbleNumRed]}>10</Text>
          </View>
          <View style={styles.anchorBody}>
            <View style={styles.anchorHeader}>
              <Text style={styles.anchorTitle}>RPE 10</Text>
              <View style={[styles.anchorBadge, styles.badgeMax]}>
                <Text style={[styles.anchorBadgeText, styles.badgeTextMax]}>Max Effort</Text>
              </View>
            </View>
            <Text style={styles.anchorDesc}>
              Absolute maximum. You could not do one more rep. Only for testing your 1RM, not regular training.
            </Text>
          </View>
        </View>

        <View style={styles.footerNote}>
          <Text style={styles.footerNoteText}>
            <Ionicons name="radio-button-on-outline" size={16} color={Colors.accent} />{' '}Most of your working sets should land between RPE 7 to 8. If you&apos;re consistently below 6, the weight goes up. Above 9, it comes down.
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
  jordanBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    lineHeight: 22,
  },
  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  anchorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  anchorBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bubbleGreen: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.4)',
  },
  bubbleOrange: {
    backgroundColor: Colors.emberFaint,
    borderWidth: 1,
    borderColor: Colors.emberBorder,
  },
  bubbleRed: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
  },
  anchorBubbleNum: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
  },
  bubbleNumGreen: { color: '#22C55E' },
  bubbleNumOrange: { color: Colors.accent },
  bubbleNumRed: { color: '#EF4444' },
  anchorBody: { flex: 1 },
  anchorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  anchorTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  anchorBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeEasy: { backgroundColor: 'rgba(34,197,94,0.15)' },
  badgeTarget: { backgroundColor: Colors.emberFaint },
  badgeMax: { backgroundColor: 'rgba(239,68,68,0.15)' },
  anchorBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.label,
  },
  badgeTextEasy: { color: '#22C55E' },
  badgeTextTarget: { color: Colors.accent },
  badgeTextMax: { color: '#EF4444' },
  anchorDesc: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  footerNote: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  footerNoteText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
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
});

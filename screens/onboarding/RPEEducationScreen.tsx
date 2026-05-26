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
import { JordanAvatar } from '../../components/JordanAvatar';

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
            <View style={styles.jordanHeaderRow}>
              <JordanAvatar size={32} />
              <Text style={styles.jordanName}>Jordan</Text>
            </View>
            <Text style={styles.jordanBody}>
              After each set, I&apos;ll ask you to rate how hard it felt on a 1–10 scale. I use
              these ratings to adjust your weights each week, so be honest.
            </Text>
          </View>
        </View>

        <View style={styles.scaleRow}>
          {[6, 7, 8, 9, 10].map((n) => (
            <View
              key={n}
              style={[styles.scalePip, n === 8 ? styles.scalePipTarget : null]}
            >
              <Text
                style={[
                  styles.scalePipNum,
                  n === 8 ? styles.scalePipNumTarget : null,
                ]}
              >
                {n}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.scaleLabels}>
          <Text style={styles.scaleLabelLeft}>Too easy</Text>
          <Text style={styles.scaleLabelCenter}>Target</Text>
          <Text style={styles.scaleLabelRight}>Max effort</Text>
        </View>

        <View style={styles.jordanNote}>
          <Text style={styles.jordanNoteLabel}>JORDAN</Text>
          <Text style={styles.jordanNoteText}>
            Aim for RPE 8. You could do 2 more reps, but it would be tough. If you finish a set
            and could have done 4 more, the weight goes up next session.
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
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  scalePip: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scalePipTarget: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  scalePipNum: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textSecondary,
  },
  scalePipNumTarget: {
    color: Colors.textPrimary,
    fontSize: FontSizes.heading2,
  },
  scaleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  scaleLabelLeft: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },
  scaleLabelCenter: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  scaleLabelRight: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },
  jordanNote: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.lg,
    marginTop: Spacing.md,
  },
  jordanNoteLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  jordanNoteText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
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

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import InfoTooltip from '../../components/InfoTooltip';
import BetaFeedbackModal from '../../components/BetaFeedbackModal';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'BodyMetrics'>;
type RouteType = RouteProp<RootStackParamList, 'BodyMetrics'>;

type FocusField = 'age' | 'heightFt' | 'heightIn' | 'weight' | 'bodyFat' | null;

interface SexOption {
  id: string;
  label: string;
}

const SEX_OPTIONS: SexOption[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export default function BodyMetricsScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const insets = useSafeAreaInsets();

  const [sex, setSex] = useState<string | null>(null);
  const [age, setAge] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [focusedField, setFocusedField] = useState<FocusField>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const canContinue =
    sex !== null &&
    age.trim() !== '' &&
    heightFt.trim() !== '' &&
    heightIn.trim() !== '' &&
    weightLbs.trim() !== '';

  const handleContinue = () => {
    if (!canContinue) return;
    console.log('[BodyMetrics] duration in params:', {
      planDuration: route.params.planDuration,
      recommendedWeeks: route.params.recommendedWeeks,
      targetDate: route.params.targetDate,
    });
    navigation.navigate('MacroSetup', {
      ...route.params,
      age: age.trim(),
      sex: sex!,
      heightFt: heightFt.trim(),
      heightIn: heightIn.trim(),
      weightLbs: weightLbs.trim(),
      bodyFatPct: bodyFatPct.trim() || null,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backHit}
          activeOpacity={0.7}
        >
          <Text style={styles.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={styles.stepHeaderTrailing}>
          <Text style={styles.stepIndicator}>6 of 8</Text>
          <TouchableOpacity
            onPress={() => setShowFeedback(true)}
            style={styles.feedbackLink}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.feedbackLinkText}>Feedback</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleBlock}>
          <Text style={styles.screenTitle}>About You</Text>
          <Text style={styles.screenSubtitle}>
            We'll use this for accurate calorie and macro targets.
          </Text>
        </View>

        <Text style={styles.sectionHeading}>Biological Sex</Text>
        <Text style={styles.sectionLead}>
          Used to calibrate your fitness metrics.
        </Text>
        <View style={styles.cardsContainer}>
          {SEX_OPTIONS.map((opt) => {
            const selected = sex === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                style={[
                  styles.sexCard,
                  selected && styles.sexCardSelected,
                ]}
                onPress={() => setSex(opt.id)}
              >
                <Text style={styles.sexCardLabel}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionHeading}>Age</Text>
        <Text style={styles.sectionLead}>How old are you?</Text>
        <TextInput
          style={[
            styles.textInputField,
            focusedField === 'age' && styles.textInputFocused,
          ]}
          value={age}
          onChangeText={setAge}
          keyboardType="numeric"
          placeholder="e.g. 28"
          placeholderTextColor={Colors.textTertiary}
          maxLength={3}
          returnKeyType="done"
          onFocus={() => setFocusedField('age')}
          onBlur={() => setFocusedField(null)}
        />

        <Text style={styles.sectionHeading}>Height & Weight</Text>
        <Text style={styles.sectionLead}>Enter your measurements.</Text>

        <View style={styles.metricCard}>
          <View style={styles.heightRow}>
            <TextInput
              style={[
                styles.textInputField,
                styles.heightFtInput,
                focusedField === 'heightFt' && styles.textInputFocused,
              ]}
              value={heightFt}
              onChangeText={setHeightFt}
              keyboardType="numeric"
              placeholder="5"
              placeholderTextColor={Colors.textTertiary}
              maxLength={1}
              returnKeyType="done"
              onFocus={() => setFocusedField('heightFt')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={styles.unitLabel}>ft</Text>
            <TextInput
              style={[
                styles.textInputField,
                styles.heightInInput,
                focusedField === 'heightIn' && styles.textInputFocused,
              ]}
              value={heightIn}
              onChangeText={setHeightIn}
              keyboardType="numeric"
              placeholder="11"
              placeholderTextColor={Colors.textTertiary}
              maxLength={2}
              returnKeyType="done"
              onFocus={() => setFocusedField('heightIn')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={styles.unitLabel}>in</Text>
          </View>
        </View>

        <View style={[styles.metricCard, styles.metricCardStack]}>
          <View style={styles.weightRow}>
            <TextInput
              style={[
                styles.textInputField,
                styles.weightInput,
                focusedField === 'weight' && styles.textInputFocused,
              ]}
              value={weightLbs}
              onChangeText={setWeightLbs}
              keyboardType="numeric"
              placeholder="185"
              placeholderTextColor={Colors.textTertiary}
              maxLength={4}
              returnKeyType="done"
              onFocus={() => setFocusedField('weight')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={styles.unitLabel}>lbs</Text>
          </View>
        </View>

        <View style={styles.bodyFatHeadingRow}>
          <View style={styles.bodyFatTitleWrap}>
            <Text style={styles.sectionHeadingLabel}>
              Body Fat %{' '}
              <Text style={styles.sectionHeadingOptional}>(optional)</Text>
            </Text>
          </View>
          <InfoTooltip
            title="How to estimate body fat"
            content="If you're lean with visible abs: 10–15%. Average build with some muscle definition: 15–20%. Soft build with little definition: 20–30%+. Women add approximately 8–10% to each range. Leave blank and we'll estimate from your other stats."
          />
        </View>
        <Text style={styles.sectionLead}>Optional — estimate is fine.</Text>
        <TextInput
          style={[
            styles.textInputField,
            focusedField === 'bodyFat' && styles.textInputFocused,
          ]}
          value={bodyFatPct}
          onChangeText={setBodyFatPct}
          keyboardType="numeric"
          placeholder="e.g. 18"
          placeholderTextColor={Colors.textTertiary}
          maxLength={4}
          returnKeyType="done"
          onFocus={() => setFocusedField('bodyFat')}
          onBlur={() => setFocusedField(null)}
        />
        <Text style={styles.bodyFatHelper}>
          Not sure? Leave blank and we'll estimate.
        </Text>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Spacing.xxxl + insets.bottom },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.button, !canContinue && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
      <BetaFeedbackModal
        visible={showFeedback}
        onClose={() => setShowFeedback(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
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
  stepHeaderTrailing: {
    alignItems: 'flex-end',
  },
  feedbackLink: {
    marginTop: Spacing.xs,
  },
  feedbackLinkText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 120,
  },

  titleBlock: {
    marginTop: 56,
  },
  screenTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
  },
  screenSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginTop: 8,
    marginBottom: 32,
  },

  sectionHeading: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 12,
  },
  bodyFatHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 12,
  },
  bodyFatTitleWrap: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  sectionHeadingLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionHeadingOptional: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 0,
    textTransform: 'none',
  },
  sectionLead: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginBottom: 12,
  },

  cardsContainer: {
    gap: 0,
  },
  sexCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sexCardSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
  },
  sexCardLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },

  textInputField: {
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 14,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  textInputFocused: {
    borderColor: Colors.accent,
  },

  metricCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
  },
  metricCardStack: {
    marginTop: Spacing.sm,
  },
  heightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  heightFtInput: {
    width: 52,
    minWidth: 52,
  },
  heightInInput: {
    width: 56,
    minWidth: 56,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  weightInput: {
    flex: 1,
    minWidth: 0,
  },
  unitLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },

  bodyFatHelper: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: Spacing.sm,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.bgPrimary,
  },
  button: {
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
});

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
import Slider from '@react-native-community/slider';
import type { RootStackParamList } from '../../navigation/types';
import BetaFeedbackModal from '../../components/BetaFeedbackModal';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'BodyMetrics'>;
type RouteType = RouteProp<RootStackParamList, 'BodyMetrics'>;

type FocusField = 'age' | 'heightFt' | 'heightIn' | 'weight' | null;

interface SexOption {
  id: string;
  label: string;
}

const SEX_OPTIONS: SexOption[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'prefer_not_to_say', label: 'Prefer not to say' },
];

function getBfZoneLabel(pct: number): string {
  if (pct <= 10) return 'Very lean';
  if (pct <= 14) return 'Lean';
  if (pct <= 18) return 'Athletic';
  if (pct <= 24) return 'Fit';
  if (pct <= 29) return 'Average';
  if (pct <= 34) return 'Above average';
  return 'High';
}

function getBfZoneDesc(pct: number): string {
  if (pct <= 10) return 'Visible striations and veins. Competition level. Hard to maintain.';
  if (pct <= 14) return 'Six-pack visible, minimal fat. Typical of serious athletes.';
  if (pct <= 18) return 'Defined abs, lean arms and legs. Consistent training shows.';
  if (pct <= 24) return 'Good muscle tone, some definition visible. Active lifestyle.';
  if (pct <= 29) return 'Soft appearance, limited definition. Lightly active.';
  if (pct <= 34) return 'Rounded appearance, minimal muscle definition visible.';
  return 'High body fat. Associated with increased health risk.';
}

export default function BodyMetricsScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const insets = useSafeAreaInsets();

  const [sex, setSex] = useState<string | null>(null);
  const [age, setAge] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState<number | null>(null);
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
      bodyFatPct: bodyFatPct !== null ? String(bodyFatPct) : null,
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

        {/* Body fat slider */}
        <View style={styles.bfSection}>
          <Text style={styles.bfTitle}>Body Fat %</Text>
          <Text style={styles.bfSub}>Optional. Drag to your best estimate.</Text>

          <View style={styles.bfDisplay}>
            <Text style={styles.bfNumber}>
              {bodyFatPct !== null ? String(bodyFatPct) : '—'}
            </Text>
            {bodyFatPct !== null ? <Text style={styles.bfSymbol}>%</Text> : null}
          </View>

          {bodyFatPct !== null ? (
            <>
              <Text style={styles.bfZoneLabel}>{getBfZoneLabel(bodyFatPct)}</Text>
              <Text style={styles.bfZoneDesc}>{getBfZoneDesc(bodyFatPct)}</Text>
            </>
          ) : null}

          <Slider
            style={styles.bfSlider}
            minimumValue={5}
            maximumValue={45}
            step={1}
            value={bodyFatPct ?? 25}
            onValueChange={(val) => setBodyFatPct(Math.round(val))}
            minimumTrackTintColor={Colors.accent}
            maximumTrackTintColor={Colors.border}
            thumbTintColor={Colors.accent}
          />

          <View style={styles.bfAnchors}>
            <Text style={styles.bfAnchor}>Very lean{'\n'}5%</Text>
            <Text style={styles.bfAnchor}>Athletic{'\n'}15%</Text>
            <Text style={styles.bfAnchor}>Average{'\n'}25%</Text>
            <Text style={styles.bfAnchor}>High{'\n'}35%</Text>
          </View>

          <TouchableOpacity
            onPress={() => setBodyFatPct(null)}
            style={styles.bfSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.bfSkipText}>Skip — I don't know my body fat</Text>
          </TouchableOpacity>
        </View>
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
        defaultArea="onboarding"
        lockArea={true}
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
    marginTop: Spacing.lg,
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
    marginTop: Spacing.lg,
    marginBottom: 12,
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

  bfSection: {
    marginTop: Spacing.xl,
  },
  bfTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  bfSub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginBottom: Spacing.lg,
  },
  bfDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 4,
  },
  bfNumber: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.display,
    color: Colors.textPrimary,
  },
  bfSymbol: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    marginLeft: 4,
  },
  bfZoneLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.accent,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  bfZoneDesc: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    lineHeight: 18,
  },
  bfSlider: {
    width: '100%',
    height: 40,
  },
  bfAnchors: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  bfAnchor: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 16,
  },
  bfSkip: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  bfSkipText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
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

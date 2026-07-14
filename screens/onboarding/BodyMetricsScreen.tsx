import { useMemo, useState } from 'react';
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
import { JordanLabel } from '../../components/JordanLabel';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';
import { cmToFtIn, LBS_TO_KG, useMetric } from '../../utils/units';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'BodyMetrics'>;
type RouteType = RouteProp<RootStackParamList, 'BodyMetrics'>;

type FocusField =
  | 'age'
  | 'heightFt'
  | 'heightIn'
  | 'heightCm'
  | 'weight'
  | 'targetWeight'
  | null;

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
  const { isMetric, setIsMetric } = useMetric();

  const [sex, setSex] = useState<string | null>(null);
  const [age, setAge] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [goalTargetWeight, setGoalTargetWeight] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState<number | null>(null);
  const [focusedField, setFocusedField] = useState<FocusField>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const canContinue =
    sex !== null &&
    age.trim() !== '' &&
    weightLbs.trim() !== '' &&
    (isMetric
      ? heightCm.trim() !== ''
      : heightFt.trim() !== '' && heightIn.trim() !== '');

  const currentWeightLbsForDelta = useMemo(() => {
    const raw = weightLbs.trim();
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return isMetric ? Math.round(n / LBS_TO_KG) : n;
  }, [weightLbs, isMetric]);

  const targetWeightJordanNote = useMemo(() => {
    const targetTrimmed = goalTargetWeight.trim();
    if (!targetTrimmed || currentWeightLbsForDelta == null) return null;
    const targetParsed = Number(targetTrimmed);
    if (!Number.isFinite(targetParsed)) return null;
    const targetLbs = isMetric ? Math.round(targetParsed / LBS_TO_KG) : targetParsed;
    const weightDelta = targetLbs - currentWeightLbsForDelta;
    if (Math.abs(weightDelta) <= 2) return null;
    if (weightDelta < 0) {
      return (
        'Slight deficit — enough to lose fat without hurting your performance. ' +
        'Protein stays high to protect muscle.'
      );
    }
    return (
      'Surplus calibrated for muscle building. Enough to fuel growth without excess fat gain.'
    );
  }, [goalTargetWeight, currentWeightLbsForDelta, isMetric]);

  const handleContinue = () => {
    if (!canContinue) return;
    setValidationError(null);

    let heightFtOut = heightFt.trim();
    let heightInOut = heightIn.trim();
    let weightLbsOut = weightLbs.trim();
    let goalTargetWeightOut: string | undefined;

    if (isMetric) {
      const cm = Number(heightCm);
      const kg = Number(weightLbs);
      if (!Number.isFinite(cm) || cm < 100 || cm > 250) {
        setValidationError('Height should be between 100 and 250 cm.');
        return;
      }
      if (!Number.isFinite(kg) || kg < 20 || kg > 320) {
        setValidationError('Weight should be between 20 and 320 kg.');
        return;
      }
      const { ft, inches } = cmToFtIn(cm);
      heightFtOut = String(ft);
      heightInOut = String(inches);
      weightLbsOut = String(Math.round(kg / LBS_TO_KG));
      const targetKg = goalTargetWeight.trim();
      if (targetKg) {
        const kgTarget = Number(targetKg);
        if (Number.isFinite(kgTarget) && kgTarget >= 20 && kgTarget <= 320) {
          goalTargetWeightOut = String(Math.round(kgTarget / LBS_TO_KG));
        }
      }
    } else {
      const ft = Number(heightFt);
      const inch = Number(heightIn);
      const lbs = Number(weightLbs);
      if (!Number.isFinite(ft) || ft < 3 || ft > 8) {
        setValidationError('Height should be between 3 and 8 ft.');
        return;
      }
      if (!Number.isFinite(inch) || inch < 0 || inch > 11) {
        setValidationError('Inches should be between 0 and 11.');
        return;
      }
      if (!Number.isFinite(lbs) || lbs < 50 || lbs > 700) {
        setValidationError('Weight should be between 50 and 700 lbs.');
        return;
      }
      const targetLbsRaw = goalTargetWeight.trim();
      if (targetLbsRaw) {
        const targetLbs = Number(targetLbsRaw);
        if (!Number.isFinite(targetLbs) || targetLbs < 50 || targetLbs > 700) {
          setValidationError('Target weight should be between 50 and 700 lbs.');
          return;
        }
        goalTargetWeightOut = String(Math.round(targetLbs));
      }
    }

    console.log('[BodyMetrics] duration in params:', {
      planDuration: route.params.planDuration,
      recommendedWeeks: route.params.recommendedWeeks,
      targetDate: route.params.targetDate,
    });
    navigation.navigate('MacroSetup', {
      ...route.params,
      age: age.trim(),
      sex: sex!,
      heightFt: heightFtOut,
      heightIn: heightInOut,
      weightLbs: weightLbsOut,
      bodyFatPct: bodyFatPct !== null ? String(bodyFatPct) : null,
      ...(goalTargetWeightOut != null
        ? {
            goalTargetWeight: goalTargetWeightOut,
            targetWeightLbs: goalTargetWeightOut,
          }
        : {}),
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

        <View style={styles.unitToggleRow}>
          <TouchableOpacity
            style={[styles.unitPill, !isMetric && styles.unitPillActive]}
            onPress={() => void setIsMetric(false)}
            activeOpacity={0.75}
          >
            <Text style={[styles.unitPillText, !isMetric && styles.unitPillTextActive]}>
              lbs / ft
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.unitPill, isMetric && styles.unitPillActive]}
            onPress={() => void setIsMetric(true)}
            activeOpacity={0.75}
          >
            <Text style={[styles.unitPillText, isMetric && styles.unitPillTextActive]}>
              kg / cm
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metricCard}>
          {isMetric ? (
            <View style={styles.heightRow}>
              <TextInput
                style={[
                  styles.textInputField,
                  styles.heightCmInput,
                  focusedField === 'heightCm' && styles.textInputFocused,
                ]}
                value={heightCm}
                onChangeText={setHeightCm}
                keyboardType="numeric"
                placeholder="180"
                placeholderTextColor={Colors.textTertiary}
                maxLength={3}
                returnKeyType="done"
                onFocus={() => setFocusedField('heightCm')}
                onBlur={() => setFocusedField(null)}
              />
              <Text style={styles.unitLabel}>cm</Text>
            </View>
          ) : (
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
          )}
        </View>

        <View style={[styles.metricCard, styles.metricCardStack]}>
          <Text style={styles.weightFieldLabel}>Current weight</Text>
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
              placeholder={isMetric ? '80' : '175'}
              placeholderTextColor={Colors.textTertiary}
              maxLength={4}
              returnKeyType="done"
              onFocus={() => setFocusedField('weight')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={styles.unitLabel}>{isMetric ? 'kg' : 'lbs'}</Text>
          </View>

          <Text style={[styles.weightFieldLabel, styles.weightFieldLabelSpaced]}>
            Target weight
          </Text>
          <View style={styles.weightRow}>
            <TextInput
              style={[
                styles.textInputField,
                styles.weightInput,
                focusedField === 'targetWeight' && styles.textInputFocused,
              ]}
              value={goalTargetWeight}
              onChangeText={setGoalTargetWeight}
              keyboardType="numeric"
              placeholder={isMetric ? '75' : '165'}
              placeholderTextColor={Colors.textTertiary}
              maxLength={4}
              returnKeyType="done"
              onFocus={() => setFocusedField('targetWeight')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={styles.unitLabel}>{isMetric ? 'kg' : 'lbs'}</Text>
          </View>
          <Text style={styles.targetWeightHint}>
            Optional — leave blank to maintain current weight
          </Text>

          {targetWeightJordanNote ? (
            <View style={styles.jordanWeightNote}>
              <JordanLabel />
              <Text style={styles.jordanWeightNoteText}>{targetWeightJordanNote}</Text>
            </View>
          ) : null}
        </View>

        {validationError ? (
          <Text style={styles.validationError}>{validationError}</Text>
        ) : null}

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
          {bodyFatPct === null ? (
            <Text style={styles.bfSkipNote}>
              Without body fat %, calorie targets may be 250-300 kcal lower than your
              actual needs. A rough estimate is fine.
            </Text>
          ) : null}
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
    fontFamily: Fonts.monoMedium,
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
  heightCmInput: {
    flex: 1,
    minWidth: 0,
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
  weightFieldLabel: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  weightFieldLabelSpaced: {
    marginTop: Spacing.md,
  },
  targetWeightHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: Spacing.xs,
  },
  jordanWeightNote: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.accentMuted,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accentBorder,
    borderRadius: Radius.md,
    gap: Spacing.xs,
  },
  jordanWeightNoteText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  unitLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },
  unitToggleRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    padding: 3,
    marginBottom: Spacing.xl,
    gap: 3,
  },
  unitPill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  unitPillActive: {
    backgroundColor: Colors.accent,
  },
  unitPillText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  unitPillTextActive: {
    color: Colors.textPrimary,
  },
  validationError: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.danger,
    marginTop: Spacing.sm,
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
    fontFamily: Fonts.monoMedium,
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
  bfSkipNote: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
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

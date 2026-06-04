import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { stripEmDash } from '../utils/jordanText';
import { useMetric } from '../utils/units';
import {
  PHOTO_ANALYSIS_TIPS,
  daysUntilCheckIn,
  formatCheckInDate,
  getNextCheckInDate,
  isPhotoCheckInAvailable,
} from '../utils/progressPhotoCheckIn';
import type { ProgressStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<ProgressStackParamList, 'ProgressPhoto'>;

type PhotoRow = {
  id: string;
  uploaded_at: string;
  estimated_bf_range: string | null;
  lean_mass_lbs: number | null;
  analysis_json: {
    jordanNote?: string;
    visibleChanges?: string;
    estimatedBfRange?: string;
    confidenceLevel?: string;
  } | null;
  macro_adjusted: boolean;
  photo_url_front: string | null;
  photo_url_side: string | null;
};

type HistoryItem = PhotoRow & {
  thumbUrl: string | null;
};

type AnalysisResult = {
  estimatedBfRange?: string;
  estimatedLeanMassLbs?: number;
  jordanNote?: string;
  visibleChanges?: string;
  macroAdjusted?: boolean;
  previousCalories?: number;
  newCalories?: number;
  macroReason?: string;
  nextAvailableAt?: string;
};

type FlowStep = 'intro' | 'capture' | 'confirm' | 'analyzing' | 'results';

const PHOTO_INSTRUCTIONS = {
  front: [
    'Full body head to toe',
    'Arms slightly away from sides',
    'Stand 6-8 ft from camera',
    'Natural lighting preferred',
  ],
  side: [
    '90-degree profile',
    'Full body visible',
    'Arms relaxed',
  ],
  back: [
    'Facing away',
    'Full body visible',
    'Arms relaxed',
  ],
} as const;

async function pickProgressPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      'Permission needed',
      'Allow photo access to upload your progress check-in.',
    );
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [3, 4],
    quality: 0.7,
    base64: true,
  });
  if (result.canceled || !result.assets[0]?.base64) return null;
  return result.assets[0].base64;
}

export default function ProgressPhotoScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { formatBodyWeight } = useMetric();

  const [loading, setLoading] = useState(true);
  const [lastAnalysisAt, setLastAnalysisAt] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [step, setStep] = useState<FlowStep>('intro');
  const [frontBase64, setFrontBase64] = useState<string | null>(null);
  const [sideBase64, setSideBase64] = useState<string | null>(null);
  const [backBase64, setBackBase64] = useState<string | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [sidePreview, setSidePreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [photoWeightInput, setPhotoWeightInput] = useState('');

  const tipTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkInAvailable = isPhotoCheckInAvailable(lastAnalysisAt);
  const nextDate = getNextCheckInDate(lastAnalysisAt);
  const daysLeft = daysUntilCheckIn(lastAnalysisAt);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      const [profileRes, planRes, photosRes] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('last_photo_analysis_at')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('plans')
          .select('id, current_week')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('progress_photos')
          .select(
            'id, uploaded_at, estimated_bf_range, lean_mass_lbs, analysis_json, macro_adjusted, photo_url_front, photo_url_side',
          )
          .eq('user_id', userId)
          .order('uploaded_at', { ascending: false })
          .limit(20),
      ]);

      setLastAnalysisAt(
        (profileRes.data as { last_photo_analysis_at?: string } | null)
          ?.last_photo_analysis_at ?? null,
      );
      setPlanId(planRes.data?.id ?? null);
      setCurrentWeek(
        typeof planRes.data?.current_week === 'number'
          ? planRes.data.current_week
          : 1,
      );

      const rows = (photosRes.data ?? []) as PhotoRow[];
      const withUrls: HistoryItem[] = await Promise.all(
        rows.map(async (row) => {
          let thumbUrl: string | null = null;
          if (row.photo_url_front) {
            const { data: signed } = await supabase.storage
              .from('progress-photos')
              .createSignedUrl(row.photo_url_front, 3600);
            thumbUrl = signed?.signedUrl ?? null;
          }
          return { ...row, thumbUrl };
        }),
      );
      setHistory(withUrls);
    } catch (e) {
      if (__DEV__) console.warn('[ProgressPhoto] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  useEffect(() => {
    if (step !== 'analyzing') {
      if (tipTimer.current) clearInterval(tipTimer.current);
      return;
    }
    tipTimer.current = setInterval(() => {
      setTipIndex((i) => (i + 1) % PHOTO_ANALYSIS_TIPS.length);
    }, 4000);
    return () => {
      if (tipTimer.current) clearInterval(tipTimer.current);
    };
  }, [step]);

  const resetFlow = () => {
    setStep('intro');
    setFrontBase64(null);
    setSideBase64(null);
    setBackBase64(null);
    setFrontPreview(null);
    setSidePreview(null);
    setBackPreview(null);
    setResult(null);
    setAnalyzing(false);
    setPhotoWeightInput('');
  };

  const handlePickFront = async () => {
    const b64 = await pickProgressPhoto();
    if (!b64) return;
    setFrontBase64(b64);
    setFrontPreview(`data:image/jpeg;base64,${b64}`);
  };

  const handlePickSide = async () => {
    const b64 = await pickProgressPhoto();
    if (!b64) return;
    setSideBase64(b64);
    setSidePreview(`data:image/jpeg;base64,${b64}`);
  };

  const handlePickBack = async () => {
    const b64 = await pickProgressPhoto();
    if (!b64) return;
    setBackBase64(b64);
    setBackPreview(`data:image/jpeg;base64,${b64}`);
  };

  const handleAnalyze = async () => {
    if (!frontBase64) return;
    setAnalyzing(true);
    setStep('analyzing');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('Not signed in');

      const trimmedWeight = photoWeightInput.trim();
      const parsedWeight = parseFloat(trimmedWeight);
      const photoWeightLbs =
        trimmedWeight !== '' && Number.isFinite(parsedWeight) && parsedWeight > 0
          ? parsedWeight
          : null;

      const { data, error } = await supabase.functions.invoke(
        'analyze-progress-photo',
        {
          body: {
            userId,
            planId,
            weekNumber: currentWeek,
            photoBase64Front: frontBase64,
            photoBase64Side: sideBase64 ?? undefined,
            photoBase64Back: backBase64 ?? undefined,
            photoWeightLbs,
          },
        },
      );

      if (error) throw error;

      if (data?.status === 'rate_limited') {
        Alert.alert(
          'Check-in unavailable',
          data.nextAvailableAt
            ? `Your next check-in is available ${formatCheckInDate(new Date(data.nextAvailableAt))}.`
            : 'Please try again later.',
        );
        resetFlow();
        await loadData();
        return;
      }

      if (data?.status === 'error') {
        throw new Error(data.error ?? 'Analysis failed');
      }

      setResult(data as AnalysisResult);
      setStep('results');
      await loadData();
    } catch (e) {
      Alert.alert(
        'Analysis failed',
        'Could not complete your check-in. Please try again.',
      );
      setStep('confirm');
    } finally {
      setAnalyzing(false);
    }
  };

  const renderPhotoSlot = (
    label: string,
    required: boolean,
    instructions: readonly string[],
    preview: string | null,
    onPick: () => void,
    onClear: () => void,
  ) => (
    <View style={styles.photoSlot}>
      <Text style={styles.photoSlotLabel}>
        {label}
        {required ? ' (required)' : ' (optional)'}
      </Text>
      <TouchableOpacity
        style={styles.photoThumbWrap}
        onPress={onPick}
        activeOpacity={0.8}
      >
        {preview ? (
          <Image source={{ uri: preview }} style={styles.photoThumb} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Ionicons name="camera-outline" size={28} color={Colors.textTertiary} />
            <Text style={styles.photoPlaceholderText}>Add photo</Text>
          </View>
        )}
      </TouchableOpacity>
      <View style={styles.photoInstructionList}>
        {instructions.map((line) => (
          <Text key={line} style={styles.photoInstruction}>
            • {line}
          </Text>
        ))}
      </View>
      {preview ? (
        <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.retakeText}>Retake</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (step === 'intro' || step === 'results') {
              navigation.goBack();
            } else {
              resetFlow();
            }
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Monthly Check-In</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 80 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loading && step === 'intro' ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
        ) : null}

        {step === 'intro' && !loading ? (
          <>
            {!checkInAvailable && nextDate ? (
              <View style={styles.gateCard}>
                <Text style={styles.gateLabel}>NEXT CHECK-IN</Text>
                <Text style={styles.gateDate}>Available {formatCheckInDate(nextDate)}</Text>
                <Text style={styles.gateSub}>
                  in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
                </Text>
              </View>
            ) : (
              <View style={[styles.gateCard, styles.gateCardActive]}>
                <Text style={[styles.gateLabel, styles.gateLabelActive]}>
                  MONTHLY CHECK-IN
                </Text>
                <Text style={styles.gateBody}>
                  Jordan analyzes your progress photos to track body composition
                  changes and adjust your nutrition targets.
                </Text>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => setStep('capture')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Start Check-In →</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : null}

        {step === 'capture' ? (
          <View style={styles.flowCard}>
            <Text style={styles.flowTitle}>Progress photos</Text>
            <Text style={styles.flowSub}>
              Front photo required. Side and back photos improve accuracy.
            </Text>
            <View style={styles.photoRow}>
              {renderPhotoSlot(
                'Front',
                true,
                PHOTO_INSTRUCTIONS.front,
                frontPreview,
                handlePickFront,
                () => {
                  setFrontBase64(null);
                  setFrontPreview(null);
                },
              )}
              {renderPhotoSlot(
                'Side',
                false,
                PHOTO_INSTRUCTIONS.side,
                sidePreview,
                handlePickSide,
                () => {
                  setSideBase64(null);
                  setSidePreview(null);
                },
              )}
              {renderPhotoSlot(
                'Back',
                false,
                PHOTO_INSTRUCTIONS.back,
                backPreview,
                handlePickBack,
                () => {
                  setBackBase64(null);
                  setBackPreview(null);
                },
              )}
            </View>
            <Text style={styles.photoWeightLabel}>Weight when taken (optional)</Text>
            <TextInput
              style={styles.photoWeightInput}
              value={photoWeightInput}
              onChangeText={(t) => setPhotoWeightInput(t.replace(/[^0-9.]/g, ''))}
              placeholder="lbs — leave blank to use current weight"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="decimal-pad"
            />
            <View style={styles.photoTipsRow}>
              <Ionicons name="bulb-outline" size={14} color={Colors.textTertiary} />
              <Text style={styles.photoTipsText}>
                Natural lighting improves accuracy. Avoid post-workout pump photos.
              </Text>
            </View>
            <View style={styles.privacyRow}>
              <Ionicons name="lock-closed-outline" size={14} color={Colors.textTertiary} />
              <Text style={styles.privacyText}>Encrypted & private</Text>
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, !frontBase64 && styles.primaryBtnDisabled]}
              disabled={!frontBase64}
              onPress={() => setStep('confirm')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Continue →</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {step === 'confirm' ? (
          <View style={styles.flowCard}>
            <Text style={styles.flowTitle}>Ready to analyze</Text>
            <Text style={styles.flowSub}>
              Jordan will analyze your photos to estimate body composition and
              refine your nutrition targets.
            </Text>
            <Text style={styles.privacyNote}>
              Photos are stored securely and only used for your coaching analysis.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => void handleAnalyze()}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Analyze →</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {step === 'analyzing' ? (
          <View style={styles.analyzingCard}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.analyzingTitle}>Jordan is reviewing your check-in...</Text>
            <Text style={styles.analyzingTip}>{PHOTO_ANALYSIS_TIPS[tipIndex]}</Text>
          </View>
        ) : null}

        {step === 'results' && result ? (
          <View style={styles.resultsCard}>
            <Text style={styles.resultsBadge}>MONTHLY CHECK-IN COMPLETE</Text>
            <Text style={styles.resultsSection}>Body Composition</Text>
            {result.estimatedBfRange ? (
              <Text style={styles.resultsLine}>
                Estimated range: {result.estimatedBfRange}
              </Text>
            ) : null}
            {result.estimatedLeanMassLbs != null ? (
              <Text style={styles.resultsLine}>
                Lean mass: ~{formatBodyWeight(result.estimatedLeanMassLbs)}
              </Text>
            ) : null}
            {result.jordanNote ? (
              <Text style={styles.jordanNote}>{stripEmDash(result.jordanNote)}</Text>
            ) : null}
            {result.macroAdjusted &&
            result.previousCalories != null &&
            result.newCalories != null ? (
              <View style={styles.macroUpdateBox}>
                <Text style={styles.resultsSection}>Nutrition Update</Text>
                <Text style={styles.resultsLine}>
                  Calories updated: {result.previousCalories.toLocaleString()} →{' '}
                  {result.newCalories.toLocaleString()}
                </Text>
                <Text style={styles.macroSub}>
                  Based on refined lean mass estimate
                </Text>
              </View>
            ) : null}
            {result.nextAvailableAt ? (
              <Text style={styles.nextCheckIn}>
                Next check-in: {formatCheckInDate(new Date(result.nextAvailableAt))}
              </Text>
            ) : null}
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                resetFlow();
                navigation.goBack();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {step === 'intro' && history.length > 0 ? (
          <>
            <Text style={styles.historyHeading}>Past check-ins</Text>
            {history.map((item) => {
              const expanded = expandedId === item.id;
              const note =
                item.analysis_json?.jordanNote ??
                item.analysis_json?.visibleChanges ??
                '';
              const excerpt = note.split(/[.!?]/)[0]?.trim();
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.historyCard}
                  onPress={() => setExpandedId(expanded ? null : item.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.historyRow}>
                    {item.thumbUrl ? (
                      <Image source={{ uri: item.thumbUrl }} style={styles.historyThumb} />
                    ) : (
                      <View style={[styles.historyThumb, styles.photoPlaceholder]} />
                    )}
                    <View style={styles.historyMeta}>
                      <Text style={styles.historyDate}>
                        {formatCheckInDate(new Date(item.uploaded_at))}
                      </Text>
                      {item.estimated_bf_range ? (
                        <Text style={styles.historyBf}>{item.estimated_bf_range}</Text>
                      ) : null}
                      {excerpt && !expanded ? (
                        <Text style={styles.historyExcerpt} numberOfLines={1}>
                          {stripEmDash(excerpt)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {expanded && note ? (
                    <Text style={styles.historyFullNote}>{stripEmDash(note)}</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const THUMB_W = 80;
const THUMB_H = 107;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  back: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  scroll: { padding: Spacing.md },
  gateCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  gateCardActive: {
    borderColor: Colors.accentBorder,
  },
  gateLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },
  gateLabelActive: { color: Colors.accent },
  gateDate: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textSecondary,
  },
  gateSub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  gateBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  primaryBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  flowCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  flowTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  flowSub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    justifyContent: 'center',
  },
  photoSlot: {
    alignItems: 'center',
    width: THUMB_W + 8,
  },
  photoSlotLabel: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  photoThumbWrap: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  photoThumb: {
    width: THUMB_W,
    height: THUMB_H,
  },
  photoPlaceholder: {
    width: THUMB_W,
    height: THUMB_H,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  photoInstructionList: {
    marginTop: Spacing.xs,
    width: THUMB_W + 24,
    gap: 2,
  },
  photoInstruction: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    textAlign: 'left',
    lineHeight: 14,
  },
  photoWeightLabel: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  photoWeightInput: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
  },
  photoTipsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  photoTipsText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },
  retakeText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
    marginTop: Spacing.xs,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginVertical: Spacing.md,
  },
  privacyText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },
  privacyNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginBottom: Spacing.lg,
    fontStyle: 'italic',
  },
  analyzingCard: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  analyzingTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  analyzingTip: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  resultsCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  resultsBadge: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  resultsSection: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  resultsLine: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  jordanNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    lineHeight: 22,
    marginTop: Spacing.md,
  },
  macroUpdateBox: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  macroSub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  nextCheckIn: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  historyHeading: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  historyCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  historyRow: { flexDirection: 'row', gap: Spacing.md },
  historyThumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: Radius.md,
  },
  historyMeta: { flex: 1 },
  historyDate: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  historyBf: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.accent,
    marginTop: 2,
  },
  historyExcerpt: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  historyFullNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
});

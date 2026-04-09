import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';
import {
  getRecommendedSplit,
  getSessionStructure,
  getSessionTitle,
  getAdjustOptions,
  getSplitInfoDescription,
  badgeNameForSplit,
  type SplitRecommendation,
  type SessionDay,
  type AdjustMenuOption,
} from '../../utils/splitRecommendation';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Experience'>;
type RouteType = RouteProp<RootStackParamList, 'Experience'>;

interface Option {
  id: string;
  label: string;
  detail?: string;
}

const EXPERIENCE_OPTIONS: Option[] = [
  { id: 'beginner', label: 'Beginner', detail: 'Less than 1 year' },
  { id: 'intermediate', label: 'Intermediate', detail: '1–3 years' },
  { id: 'advanced', label: 'Advanced', detail: '3+ years' },
];

const TRAINING_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function sortTrainingDays(days: string[]): string[] {
  const order = TRAINING_DAY_LABELS as readonly string[];
  return [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

const DURATION_OPTIONS: Option[] = [
  { id: '30-45', label: '30–45 mins' },
  { id: '45-60', label: '45–60 mins' },
  { id: '60-90', label: '60–90 mins' },
  { id: '90+', label: '90+ mins' },
];

function formatMuscleLabel(m: string): string {
  return m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ExperienceScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const insets = useSafeAreaInsets();
  const {
    goal,
    targetLift,
    current1RM,
    target1RM,
    priorityMuscles,
    targetWeightLbs,
    targetDate,
    targetBodyFatPct,
    currentSplit,
    splitDuration,
    trainingBackground,
    currentSplitOther,
  } = route.params;

  const [experience, setExperience] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [sessionLength, setSessionLength] = useState<string | null>(null);
  const [recommendedSplit, setRecommendedSplit] = useState<SplitRecommendation | null>(
    null,
  );
  const [sessionStructure, setSessionStructure] = useState<SessionDay[]>([]);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showSplitInfo, setShowSplitInfo] = useState(false);
  const [structureConfirmed, setStructureConfirmed] = useState(false);
  const [cardHighlight, setCardHighlight] = useState(false);
  const [showConfirmHint, setShowConfirmHint] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const structureLayoutYRef = useRef(0);
  const originalStructureRef = useRef<SessionDay[]>([]);
  const originalRecRef = useRef<SplitRecommendation | null>(null);

  const daysPerWeek = selectedDays.length > 0 ? String(selectedDays.length) : null;

  useEffect(() => {
    setStructureConfirmed(false);
    setShowConfirmHint(false);
  }, [selectedDays, experience]);

  useEffect(() => {
    if (selectedDays.length >= 2 && experience) {
      const rec = getRecommendedSplit(
        goal,
        String(selectedDays.length),
        targetLift ?? null,
        experience,
        currentSplit ?? null,
        splitDuration ?? null,
        trainingBackground ?? null,
        [],
        priorityMuscles ?? [],
      );
      const structure = getSessionStructure(
        rec.splitId,
        selectedDays.length,
        goal,
        targetLift ?? null,
        priorityMuscles ?? [],
        [],
        sortTrainingDays(selectedDays),
        undefined,
        experience,
      );
      setRecommendedSplit(rec);
      setSessionStructure(structure);
      originalStructureRef.current = structure;
      originalRecRef.current = rec;
    } else {
      setRecommendedSplit(null);
      setSessionStructure([]);
      originalStructureRef.current = [];
      originalRecRef.current = null;
    }
  }, [
    selectedDays,
    experience,
    goal,
    targetLift,
    priorityMuscles,
    currentSplit,
    splitDuration,
    trainingBackground,
  ]);

  const baseReady =
    !!experience &&
    selectedDays.length >= 2 &&
    !!sessionLength &&
    !!recommendedSplit &&
    sessionStructure.length > 0;

  const handleContinue = () => {
    if (!baseReady || !recommendedSplit || !daysPerWeek) return;
    if (!structureConfirmed) {
      setShowConfirmHint(true);
      scrollRef.current?.scrollTo({
        y: Math.max(0, structureLayoutYRef.current - 24),
        animated: true,
      });
      setCardHighlight(true);
      setTimeout(() => setCardHighlight(false), 300);
      return;
    }
    console.log('[Experience] duration in params:', {
      planDuration: route.params.planDuration,
      recommendedWeeks: route.params.recommendedWeeks,
      targetDate: route.params.targetDate,
    });
    navigation.navigate('RPEEducation', {
      ...route.params,
      experience: experience!,
      daysPerWeek: String(selectedDays.length),
      trainingDays: selectedDays,
      sessionLength: sessionLength!,
      splitId: recommendedSplit.splitId,
      splitName: recommendedSplit.splitName,
      splitRationale: recommendedSplit.reason,
      sessionStructure,
      currentSplitOther: currentSplitOther ?? null,
    });
  };

  const toggleTrainingDay = (label: string) => {
    setSelectedDays((prev) => {
      const next = prev.includes(label)
        ? prev.filter((d) => d !== label)
        : [...prev, label];
      return sortTrainingDays(next);
    });
  };

  const workoutsOrdered = sessionStructure
    .filter((d) => d.type === 'workout')
    .sort((a, b) => a.day - b.day);
  const sortedSelected = sortTrainingDays(selectedDays);

  const adjustOptions: AdjustMenuOption[] =
    experience && selectedDays.length >= 2
      ? getAdjustOptions(experience, selectedDays.length)
      : [];

  const handleAdjustOption = (opt: AdjustMenuOption) => {
    if (!recommendedSplit) return;
    if (opt.kind === 'reset') {
      const oRec = originalRecRef.current;
      const oStruct = originalStructureRef.current;
      if (oRec && oStruct.length > 0) {
        setRecommendedSplit(oRec);
        setSessionStructure([...oStruct]);
      }
      setShowAdjust(false);
      setStructureConfirmed(false);
      return;
    }
    if (opt.kind === 'force_split') {
      setSessionStructure(
        getSessionStructure(
          opt.splitId,
          selectedDays.length,
          goal,
          targetLift ?? null,
          priorityMuscles ?? [],
          [],
          sortTrainingDays(selectedDays),
          undefined,
          experience ?? 'intermediate',
        ),
      );
      setRecommendedSplit({
        ...recommendedSplit,
        splitId: opt.splitId,
        splitName: opt.label,
      });
      setShowAdjust(false);
      setStructureConfirmed(false);
      return;
    }
    if (opt.kind === 'hint') {
      if (opt.hint === 'more_full_body') {
        const sid = experience === 'beginner' ? 'full_body_beginner' : 'full_body_advanced';
        setRecommendedSplit({
          ...recommendedSplit,
          splitId: sid,
          splitName: badgeNameForSplit(sid),
          reason:
            recommendedSplit.reason +
            ' Sessions skew full-body for more frequency each week.',
        });
        setSessionStructure(
          getSessionStructure(
            sid,
            selectedDays.length,
            goal,
            targetLift ?? null,
            priorityMuscles ?? [],
            [],
            sortTrainingDays(selectedDays),
            undefined,
            experience ?? 'intermediate',
          ),
        );
      } else {
        setSessionStructure(
          getSessionStructure(
            recommendedSplit.splitId,
            selectedDays.length,
            goal,
            targetLift ?? null,
            priorityMuscles ?? [],
            [],
            sortTrainingDays(selectedDays),
            opt.hint,
            experience ?? 'intermediate',
          ),
        );
      }
      setShowAdjust(false);
      setStructureConfirmed(false);
    }
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
        <Text style={styles.stepIndicator}>3 of 8</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBlock}>
          <Text style={styles.screenTitle}>Training Experience</Text>
          <Text style={styles.screenSubtitle}>
            How long have you been training?
          </Text>
        </View>

        <View style={styles.cardsContainer}>
          {EXPERIENCE_OPTIONS.map((opt) => {
            const selected = experience === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                style={[styles.expCard, selected && styles.expCardSelected]}
                onPress={() => setExperience(opt.id)}
              >
                <Text style={styles.expCardLabel}>{opt.label}</Text>
                {opt.detail ? (
                  <Text style={styles.expCardDetail}>{opt.detail}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionHeading}>Training days</Text>
        <Text style={styles.trainingDaysSubtext}>
          Tap the days you train each week
        </Text>
        <View style={styles.dayPillRow}>
          {TRAINING_DAY_LABELS.map((label) => {
            const selected = selectedDays.includes(label);
            return (
              <TouchableOpacity
                key={label}
                activeOpacity={0.7}
                style={[styles.dayPill, selected && styles.dayPillSelected]}
                onPress={() => toggleTrainingDay(label)}
              >
                <Text
                  style={[styles.dayPillText, selected && styles.dayPillTextSelected]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {selectedDays.length < 2 ? (
          <Text style={styles.trainingDaysValidation}>
            Select at least 2 training days
          </Text>
        ) : null}

        <Text style={styles.sectionHeading}>Session length</Text>
        <Text style={styles.sectionSubtitle}>
          How long is a typical session?
        </Text>
        <View style={styles.chipRow}>
          {DURATION_OPTIONS.map((opt) => {
            const selected = sessionLength === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setSessionLength(opt.id)}
              >
                <Text
                  style={[styles.chipText, selected && styles.chipTextSelected]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.structureSectionLabel}>Your training structure</Text>

        {recommendedSplit && sessionStructure.length > 0 ? (
          <View
            onLayout={(e) => {
              structureLayoutYRef.current = e.nativeEvent.layout.y;
            }}
            style={[
              styles.jordanCard,
              cardHighlight && styles.jordanCardHighlight,
            ]}
          >
            <View style={styles.jordanStripe} />
            <View style={styles.jordanCardInner}>
              <View style={styles.jordanHeaderRow}>
                <View style={styles.jordanAvatar}>
                  <Text style={styles.jordanAvatarText}>J</Text>
                </View>
                <Text style={styles.jordanName}>Jordan</Text>
              </View>

              <View style={styles.splitBadgeRow}>
                <View style={styles.splitNamePill}>
                  <Text style={styles.splitNamePillText}>
                    {recommendedSplit.splitName}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowSplitInfo(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.splitInfoIcon}>ⓘ</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.sessionList}>
                {workoutsOrdered.map((session, idx) => (
                  <View
                    key={`${session.day}-${session.focus}-${idx}`}
                    style={styles.sessionBlock}
                  >
                    <View style={styles.sessionRow}>
                      <Text style={styles.sessionDayLabel}>
                        {session.dayLabel ??
                          sortedSelected[idx] ??
                          `D${session.day}`}
                      </Text>
                      <Text style={styles.sessionTitleText}>
                        {getSessionTitle(session.focus)}
                      </Text>
                    </View>
                    <View style={styles.muscleChipRow}>
                      {session.primaryMuscles.map((m) => (
                        <View key={m} style={styles.muscleChip}>
                          <Text style={styles.muscleChipText}>
                            {formatMuscleLabel(m)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>

              <Text style={styles.jordanRationale}>
                &ldquo;{recommendedSplit.reason}&rdquo;
              </Text>

              {showAdjust ? (
                <View style={styles.adjustSection}>
                  <View style={styles.adjustChipRow}>
                    {adjustOptions.map((opt, idx) => (
                      <TouchableOpacity
                        key={
                          opt.kind === 'force_split'
                            ? `f-${opt.splitId}-${idx}`
                            : opt.kind === 'hint'
                              ? `h-${opt.hint}-${idx}`
                              : `r-${idx}`
                        }
                        activeOpacity={0.7}
                        style={styles.adjustChip}
                        onPress={() => handleAdjustOption(opt)}
                      >
                        <Text style={styles.adjustChipText}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setShowAdjust(false)}
                    style={styles.adjustBackHit}
                  >
                    <Text style={styles.adjustBackText}>← Back</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.cardButtonColumn}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[
                      styles.looksGoodBtn,
                      structureConfirmed && styles.looksGoodBtnConfirmed,
                    ]}
                    onPress={() => {
                      setStructureConfirmed(true);
                      setShowConfirmHint(false);
                    }}
                    disabled={structureConfirmed}
                  >
                    <Text
                      style={[
                        styles.looksGoodBtnText,
                        structureConfirmed && styles.looksGoodBtnTextConfirmed,
                      ]}
                    >
                      {structureConfirmed ? '✓ Structure confirmed' : 'Looks good →'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.adjustBtn}
                    onPress={() => setShowAdjust(true)}
                  >
                    <Text style={styles.adjustBtnText}>Adjust</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ) : null}
        {recommendedSplit && sessionStructure.length > 0 && baseReady && !structureConfirmed ? (
          <Text
            style={[
              styles.confirmStructureHint,
              showConfirmHint && styles.confirmStructureHintUrgent,
            ]}
          >
            Tap &apos;Looks good&apos; to confirm your training structure
          </Text>
        ) : null}
        {!(recommendedSplit && sessionStructure.length > 0) ? (
          <Text style={styles.structureHint}>
            Select your experience level and at least 2 training days to see
            Jordan&apos;s structure.
          </Text>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Spacing.xxxl + insets.bottom },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.button, !baseReady && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!baseReady}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showSplitInfo && !!recommendedSplit}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSplitInfo(false)}
      >
        <View style={styles.splitInfoBackdrop}>
          <ScrollView
            contentContainerStyle={styles.splitInfoScroll}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            {recommendedSplit ? (
              <View style={styles.splitInfoCard}>
                <Text style={styles.splitInfoTitle}>
                  {recommendedSplit.splitName}
                </Text>
                <Text style={styles.splitInfoBody}>
                  {getSplitInfoDescription(recommendedSplit.splitId)}
                </Text>
                <TouchableOpacity
                  style={styles.splitInfoBtn}
                  activeOpacity={0.85}
                  onPress={() => setShowSplitInfo(false)}
                >
                  <Text style={styles.splitInfoBtnText}>Got it</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
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
  structureSectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginBottom: 12,
    marginTop: 0,
  },
  trainingDaysSubtext: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: 12,
    marginTop: 0,
  },
  dayPillRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: Spacing.xs,
  },
  dayPill: {
    flex: 1,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPillSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
  },
  dayPillText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  dayPillTextSelected: {
    color: Colors.accent,
  },
  trainingDaysValidation: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.danger,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },

  cardsContainer: {
    gap: Spacing.sm,
  },
  expCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
  },
  expCardSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
  },
  expCardLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  expCardDetail: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  chipSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
    borderWidth: 1.5,
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  chipTextSelected: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },

  structureHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },

  jordanCard: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    overflow: 'hidden',
  },
  jordanCardHighlight: {
    borderColor: Colors.accent,
    borderWidth: 2,
  },
  jordanStripe: {
    width: 3,
    backgroundColor: Colors.accent,
  },
  jordanCardInner: {
    flex: 1,
    padding: Spacing.lg,
  },
  jordanHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  splitBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  splitNamePill: {
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  splitNamePillText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
  },
  splitInfoIcon: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textTertiary,
  },
  splitInfoBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
  },
  splitInfoScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  splitInfoCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
  },
  splitInfoTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },
  splitInfoBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    lineHeight: 22,
  },
  splitInfoBtn: {
    marginTop: Spacing.lg,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitInfoBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  jordanAvatar: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jordanAvatarText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  jordanName: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  sessionList: {
    gap: Spacing.md,
  },
  sessionBlock: {
    gap: Spacing.xs,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  sessionDayLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    width: 36,
  },
  sessionTitleText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
    flex: 1,
  },
  muscleChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginLeft: 36 + Spacing.sm,
  },
  muscleChip: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  muscleChipText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
  },
  jordanRationale: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: Spacing.lg,
    lineHeight: 22,
  },
  cardButtonColumn: {
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  looksGoodBtn: {
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  looksGoodBtnConfirmed: {
    backgroundColor: Colors.successMuted,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  looksGoodBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  looksGoodBtnTextConfirmed: {
    color: Colors.success,
    fontFamily: Fonts.semiBold,
  },
  confirmStructureHint: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  confirmStructureHintUrgent: {
    color: Colors.danger,
  },
  adjustBtn: {
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  adjustSection: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  adjustChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  adjustChip: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  adjustChipText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  adjustBackHit: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.xs,
  },
  adjustBackText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
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

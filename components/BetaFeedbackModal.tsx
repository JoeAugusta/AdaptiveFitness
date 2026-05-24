import { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { supabase } from '../Lib/supabase';

export interface BetaFeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

const CATEGORIES: readonly { label: string; value: string }[] = [
  { label: 'Bug Report', value: 'bug' },
  { label: 'Look & Feel', value: 'look_and_feel' },
  { label: 'Feature Request', value: 'feature_request' },
  { label: 'General Feedback', value: 'general' },
] as const;

const FEATURE_AREAS: readonly { label: string; value: string }[] = [
  { label: 'Home', value: 'home' },
  { label: 'Workout', value: 'workout' },
  { label: 'Progress', value: 'progress' },
  { label: 'Nutrition', value: 'nutrition' },
  { label: 'Profile', value: 'profile' },
  { label: 'Onboarding', value: 'onboarding' },
  { label: 'Other', value: 'other' },
] as const;

const SHEET_MAX_HEIGHT = Dimensions.get('window').height * 0.88;
const HEADER_SIDE_MIN_WIDTH = 72;

export default function BetaFeedbackModal({ visible, onClose }: BetaFeedbackModalProps) {
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<string | null>(null);
  const [featureArea, setFeatureArea] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descFocused, setDescFocused] = useState(false);

  const resetForm = () => {
    setCategory(null);
    setFeatureArea(null);
    setRating(null);
    setDescription('');
    setError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    setSubmitted(false);
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!category || !featureArea || description.trim().length < 3) return;
    setSubmitting(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: insertError } = await supabase.from('beta_feedback').insert({
        user_id: user?.id ?? null,
        category,
        feature_area: featureArea,
        rating: rating ?? null,
        description: description.trim(),
        app_version: '1.0.0',
        platform: Platform.OS,
      });
      if (insertError) throw insertError;
      setSubmitted(true);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : 'Could not submit. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    Boolean(category && featureArea && description.trim().length >= 3) && !submitting;

  const renderCategoryChip = (label: string, value: string) => {
    const selected = category === value;
    return (
      <TouchableOpacity
        key={value}
        style={[
          styles.chipBase,
          selected ? styles.chipSelected : styles.chipUnselected,
          styles.categoryChipFlex,
        ]}
        onPress={() => setCategory((c) => (c === value ? null : value))}
        activeOpacity={0.7}
      >
        <Text
          style={[styles.chipTextBase, selected ? styles.chipTextSelected : styles.chipTextSecondary]}
          numberOfLines={2}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderFeatureChip = (label: string, value: string) => {
    const selected = featureArea === value;
    return (
      <TouchableOpacity
        key={value}
        style={[styles.chipBase, selected ? styles.chipSelected : styles.chipUnselected]}
        onPress={() => setFeatureArea((v) => (v === value ? null : value))}
        activeOpacity={0.7}
      >
        <Text
          style={[styles.chipTextBase, selected ? styles.chipTextSelected : styles.chipTextSecondary]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kavInner}
        >
          {!submitted ? (
            <View
              style={[
                styles.sheet,
                {
                  maxHeight: SHEET_MAX_HEIGHT,
                  paddingBottom: Math.max(insets.bottom, Spacing.md),
                },
              ]}
            >
              <View style={styles.headerRow}>
                <View style={styles.headerSide}>
                  <TouchableOpacity onPress={handleClose} disabled={submitting} activeOpacity={0.7}>
                    <Text style={[styles.cancelText, submitting ? styles.cancelDisabled : null]}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.headerTitleWrap}>
                  <Text style={styles.headerTitle} numberOfLines={1}>
                    Beta Feedback
                  </Text>
                </View>
                <View style={styles.headerSide} />
              </View>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={[styles.sectionLabel, styles.sectionFirst]}>WHAT TYPE OF FEEDBACK?</Text>
                <View style={styles.catRow}>
                  {renderCategoryChip(CATEGORIES[0].label, CATEGORIES[0].value)}
                  {renderCategoryChip(CATEGORIES[1].label, CATEGORIES[1].value)}
                </View>
                <View style={styles.catRow}>
                  {renderCategoryChip(CATEGORIES[2].label, CATEGORIES[2].value)}
                  {renderCategoryChip(CATEGORIES[3].label, CATEGORIES[3].value)}
                </View>

                <Text style={styles.sectionLabel}>WHICH AREA?</Text>
                <View style={styles.featureChipWrap}>
                  {FEATURE_AREAS.map(({ label, value }) => renderFeatureChip(label, value))}
                </View>

                <Text style={styles.sectionLabel}>OVERALL FEEL  (optional)</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((star) => {
                    const filled = rating != null && star <= rating;
                    return (
                      <TouchableOpacity
                        key={star}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                        onPress={() =>
                          setRating((r) => (r === star ? null : star))
                        }
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.starGlyph,
                            { color: filled ? Colors.accent : Colors.border },
                          ]}
                        >
                          {filled ? '★' : '☆'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.sectionLabel}>TELL US MORE</Text>
                <TextInput
                  style={[
                    styles.textArea,
                    {
                      borderColor: descFocused ? Colors.accentBorder : Colors.border,
                    },
                  ]}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                  minHeight={120}
                  maxLength={1000}
                  placeholder="Describe what you experienced..."
                  placeholderTextColor={Colors.textTertiary}
                  selectionColor={Colors.accent}
                  onFocus={() => setDescFocused(true)}
                  onBlur={() => setDescFocused(false)}
                />
                <Text style={styles.charCount}>{`${description.length}/1000`}</Text>
                {category && featureArea && description.trim().length < 3 && (
                  <Text style={styles.descHint}>Add a brief description to submit</Text>
                )}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <TouchableOpacity
                  style={[styles.primaryBtn, !canSubmit ? styles.primaryBtnDisabled : null]}
                  onPress={() => void handleSubmit()}
                  disabled={!category || !featureArea || description.trim().length < 3 || submitting}
                  activeOpacity={0.85}
                >
                  {submitting ? (
                    <ActivityIndicator color={Colors.bgPrimary} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Submit Feedback</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          ) : (
            <View style={[styles.sheet, styles.sheetSuccess, { paddingBottom: Math.max(insets.bottom, Spacing.lg) }]}>
              <View style={styles.successContainer}>
                <Text style={styles.successIcon}>✓</Text>
                <Text style={styles.successTitle}>Thanks for the feedback!</Text>
                <Text style={styles.successBody}>
                  It goes directly to the team and helps shape what gets built next.
                </Text>
                <TouchableOpacity
                  style={styles.successBtn}
                  onPress={() => {
                    setSubmitted(false);
                    resetForm();
                    onClose();
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.successBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kavInner: {
    width: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  sheetSuccess: {
    maxHeight: SHEET_MAX_HEIGHT,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  headerSide: {
    width: HEADER_SIDE_MIN_WIDTH,
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  cancelDisabled: {
    opacity: 0.45,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 48,
  },
  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xl,
  },
  sectionFirst: {
    marginTop: Spacing.md,
  },
  catRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  categoryChipFlex: {
    flex: 1,
  },
  featureChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipBase: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  chipUnselected: {
    backgroundColor: Colors.bgElevated,
    borderColor: Colors.border,
  },
  chipSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
  },
  chipTextBase: {
    fontSize: FontSizes.body,
  },
  chipTextSecondary: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  chipTextSelected: {
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
  },
  starsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  starGlyph: {
    fontSize: 28,
  },
  textArea: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: 14,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    minHeight: 120,
  },
  charCount: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'right',
    marginTop: 6,
  },
  descHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  errorText: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.danger,
  },
  primaryBtn: {
    marginTop: Spacing.xl + 12,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.bgPrimary,
  },
  successContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.md,
    minHeight: 280,
  },
  successIcon: {
    fontSize: 48,
    color: Colors.success,
    textAlign: 'center',
  },
  successTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  successBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 22,
  },
  successBtn: {
    marginTop: Spacing.xxxl,
    height: 56,
    alignSelf: 'stretch',
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.bgPrimary,
  },
});

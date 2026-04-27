import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { getExerciseEducation, type ExerciseDifficulty } from '../constants/exerciseEducation';

export interface ExerciseEducationModalProps {
  visible: boolean;
  onClose: () => void;
  exerciseName: string;
}

const DIFFICULTY_BADGE: Record<
  ExerciseDifficulty,
  { bg: string; fg: string; label: string }
> = {
  beginner: {
    bg: Colors.successMuted,
    fg: Colors.success,
    label: 'BEGINNER',
  },
  intermediate: {
    bg: Colors.warningMuted,
    fg: Colors.warning,
    label: 'INTERMEDIATE',
  },
  advanced: {
    bg: Colors.dangerMuted,
    fg: Colors.danger,
    label: 'ADVANCED',
  },
};

export default function ExerciseEducationModal({
  visible,
  onClose,
  exerciseName,
}: ExerciseEducationModalProps) {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const maxSheetH = windowH * 0.8;

  const entry = getExerciseEducation(exerciseName);
  const diffStyle = entry ? DIFFICULTY_BADGE[entry.difficulty] : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { maxHeight: maxSheetH, paddingBottom: Spacing.xl + insets.bottom }]}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle} numberOfLines={2}>
              {exerciseName}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Close"
            >
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {!entry ? (
            <View style={styles.fallbackWrap}>
              <Text style={styles.fallbackText}>Form guide coming soon</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              bounces
            >
              <View style={[styles.diffBadge, { backgroundColor: diffStyle.bg }]}>
                <Text style={[styles.diffBadgeText, { color: diffStyle.fg }]}>
                  {diffStyle.label}
                </Text>
              </View>

              <Text style={styles.sectionLabel}>TARGETS</Text>
              <View style={styles.chipRow}>
                {entry.primaryMuscles.map((m) => (
                  <View key={m} style={styles.muscleChip}>
                    <Text style={styles.muscleChipText}>{m}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.sectionHeading}>FORM CUES</Text>
              {entry.formCues.map((cue, i) => (
                <View key={i} style={styles.cueRow}>
                  <View style={styles.cueNum}>
                    <Text style={styles.cueNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.cueText}>{cue}</Text>
                </View>
              ))}

              <Text style={styles.sectionHeading}>COMMON MISTAKES</Text>
              {entry.commonMistakes.map((mistake, i) => (
                <View key={i} style={styles.mistakeRow}>
                  <Text style={styles.mistakeIcon}>⚠</Text>
                  <Text style={styles.mistakeText}>{mistake}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  sheet: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    marginRight: Spacing.md,
  },
  closeBtn: {
    fontSize: 20,
    color: Colors.textSecondary,
    fontFamily: Fonts.regular,
  },
  diffBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    marginBottom: Spacing.xs,
  },
  diffBadgeText: {
    fontSize: FontSizes.micro,
    fontFamily: Fonts.bold,
    letterSpacing: 1,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    marginTop: Spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  muscleChip: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  muscleChipText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.semiBold,
    color: Colors.accent,
  },
  sectionHeading: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  cueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  cueNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cueNumText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
  cueText: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
  },
  mistakeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  mistakeIcon: {
    fontSize: 16,
    color: Colors.warning,
    fontFamily: Fonts.regular,
  },
  mistakeText: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  fallbackWrap: {
    paddingVertical: Spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});

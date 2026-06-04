import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { getLocalDateString } from '../utils/dateUtils';
import {
  ACTIVITY_OPTIONS,
  estimateCaloriesBurned,
  type ActivityIntensity,
} from '../utils/activityCalories';

export type ActivityLogRow = {
  id: string;
  user_id: string;
  plan_id: string;
  logged_at: string;
  sport_type: string;
  duration_min: number;
  intensity: string;
  calories_burned?: number | null;
  notes?: string | null;
};

const INTENSITY_OPTIONS: { label: string; value: ActivityIntensity }[] = [
  { label: 'Low', value: 'low' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'High', value: 'high' },
];

export interface ActivityLogSheetProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
  planId: string;
  weightLbs: number;
  existingLog?: ActivityLogRow | null;
}

export default function ActivityLogSheet({
  visible,
  onClose,
  onSaved,
  userId,
  planId,
  weightLbs,
  existingLog,
}: ActivityLogSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const maxSheetH = windowH * 0.92;
  const todayDateString = getLocalDateString();

  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);
  const [intensity, setIntensity] = useState<ActivityIntensity | null>(null);
  const [durationText, setDurationText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSaveError(null);
    if (existingLog) {
      setSelectedActivity(existingLog.sport_type);
      setIntensity(
        existingLog.intensity === 'low' ||
          existingLog.intensity === 'moderate' ||
          existingLog.intensity === 'high'
          ? existingLog.intensity
          : null,
      );
      setDurationText(String(existingLog.duration_min));
    } else {
      setSelectedActivity(null);
      setIntensity(null);
      setDurationText('');
    }
  }, [visible, existingLog]);

  const durationMinutes = useMemo(() => {
    const n = parseInt(durationText.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [durationText]);

  const canSave =
    selectedActivity != null && intensity != null && durationMinutes != null;

  const previewCalories = useMemo(() => {
    if (!canSave || !selectedActivity || !intensity || durationMinutes == null) {
      return null;
    }
    const weightKg = weightLbs > 0 ? weightLbs * 0.453592 : 77;
    return estimateCaloriesBurned(
      selectedActivity,
      intensity,
      durationMinutes,
      weightKg,
    );
  }, [canSave, selectedActivity, intensity, durationMinutes, weightLbs]);

  const handleSave = async () => {
    if (!canSave || !selectedActivity || !intensity || durationMinutes == null) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    const weightKg = weightLbs > 0 ? weightLbs * 0.453592 : 77;
    const caloriesBurned = estimateCaloriesBurned(
      selectedActivity,
      intensity,
      durationMinutes,
      weightKg,
    );
    const payload = {
      user_id: userId,
      plan_id: planId,
      logged_at: todayDateString,
      sport_type: selectedActivity,
      duration_min: durationMinutes,
      intensity,
      calories_burned: caloriesBurned,
      notes: null,
    };
    const { error } = await supabase
      .from('sport_logs')
      .upsert(payload, { onConflict: 'user_id,plan_id,logged_at' });
    setSaving(false);
    if (error) {
      setSaveError(error.message || 'Could not save. Try again.');
      return;
    }
    onClose();
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { maxHeight: maxSheetH, paddingBottom: Spacing.xl + insets.bottom },
          ]}
        >
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Log Activity</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.fieldLabel}>Activity</Text>
            <View style={styles.activityList}>
              {ACTIVITY_OPTIONS.map((name) => {
                const selected = selectedActivity === name;
                return (
                  <TouchableOpacity
                    key={name}
                    style={[styles.activityRow, selected && styles.activityRowSelected]}
                    onPress={() => setSelectedActivity(name)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.activityRowText,
                        selected && styles.activityRowTextSelected,
                      ]}
                    >
                      {name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Intensity</Text>
            <View style={styles.pillsRow}>
              {INTENSITY_OPTIONS.map(({ label, value }) => {
                const selected = intensity === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[styles.pill, selected && styles.pillSelected]}
                    onPress={() => setIntensity(value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Duration</Text>
            <View style={styles.durationRow}>
              <TextInput
                style={styles.durationInput}
                value={durationText}
                onChangeText={(t) => setDurationText(t.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 60"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="number-pad"
                maxLength={4}
              />
              <Text style={styles.durationUnit}>minutes</Text>
            </View>

            {previewCalories != null ? (
              <View style={styles.previewBlock}>
                <Text style={styles.previewKcal}>
                  {`Est. +${previewCalories} kcal added to today's target`}
                </Text>
                <Text style={styles.previewHint}>
                  Your daily target adjusts to account for this activity.
                </Text>
              </View>
            ) : null}

            {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}

            <TouchableOpacity
              style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!canSave || saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color={Colors.textPrimary} />
              ) : (
                <Text style={styles.saveBtnText}>Log Activity</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    marginRight: Spacing.md,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: Spacing.lg,
  },
  fieldLabel: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  fieldLabelSpaced: {
    marginTop: Spacing.lg,
  },
  activityList: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  activityRow: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  activityRowSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
  },
  activityRowText: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.medium,
    color: Colors.textPrimary,
  },
  activityRowTextSelected: {
    fontFamily: Fonts.semiBold,
    color: Colors.accent,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  pill: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
  },
  pillText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.semiBold,
    color: Colors.textSecondary,
  },
  pillTextSelected: {
    color: Colors.accent,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.md,
  },
  durationInput: {
    flex: 1,
    maxWidth: 120,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
  },
  durationUnit: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  previewBlock: {
    marginTop: Spacing.lg,
  },
  previewKcal: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.semiBold,
    color: Colors.accent,
  },
  previewHint: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
  },
  errorText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.danger,
  },
  saveBtn: {
    marginTop: Spacing.xl,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: Colors.textTertiary,
  },
  saveBtnText: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
});

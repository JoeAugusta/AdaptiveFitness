import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';

export type ConcurrentSportPlan = {
  type: string[];
  daysPerWeek: number;
};

export type SportLogRow = {
  id: string;
  user_id: string;
  plan_id: string;
  logged_at: string;
  sport_type: string;
  duration_min: number;
  intensity: string;
  notes: string | null;
};

type Intensity = 'low' | 'moderate' | 'high';

const DURATION_OPTIONS: { label: string; minutes: number }[] = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '60 min', minutes: 60 },
  { label: '90 min', minutes: 90 },
  { label: '2h+', minutes: 120 },
];

const INTENSITY_OPTIONS: { label: string; value: Intensity }[] = [
  { label: 'Low', value: 'low' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'High', value: 'high' },
];

const INTENSITY_DESCRIPTOR: Record<Intensity, string> = {
  low: 'Light practice, drills, or skill work',
  moderate: 'Competitive play or hard training',
  high: 'Tournament, match, or max effort session',
};

function formatSportTypeDisplayName(sportType: string): string {
  return sportType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export interface SportSessionModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
  planId: string;
  concurrentSport: ConcurrentSportPlan;
  existingLog: SportLogRow | null;
}

export default function SportSessionModal({
  visible,
  onClose,
  onSaved,
  userId,
  planId,
  concurrentSport,
  existingLog,
}: SportSessionModalProps) {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const maxSheetH = windowH * 0.92;

  const todayDateString = new Date().toISOString().split('T')[0]!;

  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [intensity, setIntensity] = useState<Intensity | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSaveError(null);
    if (existingLog) {
      setDurationMin(existingLog.duration_min);
      setIntensity(
        existingLog.intensity === 'low' ||
          existingLog.intensity === 'moderate' ||
          existingLog.intensity === 'high'
          ? existingLog.intensity
          : null,
      );
      setNotes(existingLog.notes ?? '');
    } else {
      setDurationMin(null);
      setIntensity(null);
      setNotes('');
    }
  }, [visible, existingLog]);

  const canSave = durationMin != null && intensity != null;

  const handleSave = async () => {
    if (!canSave || durationMin == null || intensity == null) return;
    setSaving(true);
    setSaveError(null);
    const sportTypeRaw = concurrentSport.type[0] ?? '';
    const payload = {
      user_id: userId,
      plan_id: planId,
      logged_at: todayDateString,
      sport_type: sportTypeRaw,
      duration_min: durationMin,
      intensity,
      notes: notes.trim() || null,
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

  const sportLabel = formatSportTypeDisplayName(concurrentSport.type[0] ?? '');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { maxHeight: maxSheetH, paddingBottom: Spacing.xl + insets.bottom },
          ]}
        >
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Log Sport Session</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Close"
            >
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.fieldLabel}>Sport</Text>
            <Text style={styles.sportReadonly}>{sportLabel}</Text>

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Duration</Text>
            <View style={styles.pillsRow}>
              {DURATION_OPTIONS.map(({ label, minutes }) => {
                const selected = durationMin === minutes;
                return (
                  <TouchableOpacity
                    key={minutes}
                    style={[styles.pill, selected ? styles.pillSelected : null]}
                    onPress={() => setDurationMin(minutes)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.pillText, selected ? styles.pillTextSelected : null]}>
                      {label}
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
                    style={[styles.pill, selected ? styles.pillSelected : null]}
                    onPress={() => setIntensity(value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.pillText, selected ? styles.pillTextSelected : null]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {intensity ? (
              <Text style={styles.intensityHint}>{INTENSITY_DESCRIPTOR[intensity]}</Text>
            ) : (
              <Text style={styles.intensityHintPlaceholder}> </Text>
            )}

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any notes about today's session..."
              placeholderTextColor={Colors.textSecondary}
              multiline
              maxLength={140}
              textAlignVertical="top"
            />

            {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}

            <TouchableOpacity
              style={[styles.saveBtn, !canSave ? styles.saveBtnDisabled : null]}
              onPress={handleSave}
              disabled={!canSave || saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color={Colors.textPrimary} />
              ) : (
                <Text style={styles.saveBtnText}>Save Session</Text>
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
    alignItems: 'flex-start',
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
  closeBtn: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
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
  sportReadonly: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.body,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  pill: {
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
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
  intensityHint: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
  },
  intensityHintPlaceholder: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.caption,
    height: FontSizes.caption * 1.4,
  },
  notesInput: {
    marginTop: Spacing.sm,
    minHeight: 88,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
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

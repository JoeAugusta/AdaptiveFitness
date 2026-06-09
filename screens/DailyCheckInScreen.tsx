import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { supabase } from '../Lib/supabase';
import { getLocalDateString } from '../utils/dateUtils';
import { useMetric } from '../utils/units';
import ActivityLogSheet, { type ActivityLogRow } from '../components/ActivityLogSheet';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RootStackParamList } from '../navigation/types';

const SLEEP_PILL_OPTIONS = [
  { value: 5, label: '5h' }, { value: 6, label: '6h' }, { value: 7, label: '7h' },
  { value: 8, label: '8h' }, { value: 9, label: '9h' }, { value: 10, label: '10h+' },
];
const READINESS_OPTIONS = [
  { value: 1, label: 'Rough' }, { value: 2, label: 'Tired' }, { value: 3, label: 'OK' },
  { value: 4, label: 'Good' }, { value: 5, label: 'Great' },
];

type CheckInRoute = RouteProp<RootStackParamList, 'DailyCheckIn'>;

export default function DailyCheckInScreen() {
  const navigation = useNavigation();
  const route = useRoute<CheckInRoute>();
  const { userId, planId, weightLbs, existingWeightLog, existingActivityLog } = route.params;

  const { displayToLbs, lbsToDisplay, unitLabel } = useMetric();

  const existingDisplayWeight =
    existingWeightLog?.weight_lbs != null
      ? String(Math.round(lbsToDisplay(existingWeightLog.weight_lbs) * 10) / 10)
      : '';

  const [weightInput, setWeightInput] = useState(existingDisplayWeight);
  const [selectedSleepHours, setSelectedSleepHours] = useState<number | null>(
    existingWeightLog?.sleep_hours ?? null);
  const [selectedReadiness, setSelectedReadiness] = useState<number | null>(
    existingWeightLog?.readiness_score ?? null);
  const [saving, setSaving] = useState(false);
  const [showActivitySubSheet, setShowActivitySubSheet] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityLogRow | null>(existingActivityLog ?? null);

  const handleSave = async () => {
    if (!weightInput && !selectedSleepHours && !selectedReadiness) {
      navigation.goBack();
      return;
    }
    setSaving(true);
    try {
      const displayVal = weightInput ? parseFloat(weightInput) : NaN;
      const valLbs = !isNaN(displayVal) ? displayToLbs(displayVal) : null;
      const validLbs = valLbs != null && valLbs > 50 && valLbs < 500 ? valLbs : null;
      const todayDate = getLocalDateString();
      await supabase.from('weight_logs').upsert(
        {
          user_id: userId,
          log_date: todayDate,
          ...(validLbs != null ? { weight_lbs: validLbs } : {}),
          ...(selectedSleepHours != null ? { sleep_hours: selectedSleepHours } : {}),
          ...(selectedReadiness != null ? { readiness_score: selectedReadiness } : {}),
        },
        { onConflict: 'user_id,log_date' },
      );
      try {
        const weighInId = await AsyncStorage.getItem('weighInNotifId');
        if (weighInId) await Notifications.cancelScheduledNotificationAsync(weighInId);
      } catch { /* non-blocking */ }
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Daily Check-in</Text>
            <Text style={styles.subtitle}>Give Jordan your numbers</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollArea}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={styles.sectionLabel}>WEIGHT</Text>
          <View style={styles.weightRow}>
            <TextInput
              style={styles.weightInput}
              keyboardType="numeric"
              value={weightInput}
              onChangeText={setWeightInput}
              placeholder="—"
              placeholderTextColor={Colors.textTertiary}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            <Text style={styles.unitLabel}>{unitLabel}</Text>
          </View>

          <Text style={styles.sectionLabel}>SLEEP LAST NIGHT</Text>
          <View style={styles.pillRow}>
            {SLEEP_PILL_OPTIONS.map(({ value, label }) => {
              const selected = selectedSleepHours === value;
              return (
                <TouchableOpacity key={value}
                  style={[styles.pill, selected && styles.pillSelected]}
                  onPress={() => setSelectedSleepHours((p) => (p === value ? null : value))}
                  activeOpacity={0.75}>
                  <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>HOW'S YOUR BODY TODAY</Text>
          <View style={styles.pillRow}>
            {READINESS_OPTIONS.map(({ value, label }) => {
              const selected = selectedReadiness === value;
              return (
                <TouchableOpacity key={value}
                  style={[styles.pill, selected && styles.pillSelected]}
                  onPress={() => setSelectedReadiness((p) => (p === value ? null : value))}
                  activeOpacity={0.75}>
                  <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>ADDITIONAL ACTIVITY</Text>
          {activityLog != null ? (
            <TouchableOpacity style={styles.activityRow} onPress={() => setShowActivitySubSheet(true)} activeOpacity={0.75}>
              <View style={styles.activityRowLeft}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <Text style={styles.activityLogged}>
                  {`${activityLog.sport_type} · ${activityLog.duration_min} min · ${activityLog.intensity}`}
                </Text>
              </View>
              <Text style={styles.activityEdit}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.activityRow} onPress={() => setShowActivitySubSheet(true)} activeOpacity={0.75}>
              <Text style={styles.activityPrompt}>Log sport or exercise →</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.saveBtn} onPress={() => void handleSave()} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color={Colors.textPrimary} /> : <Text style={styles.saveBtnText}>Save Check-in</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {showActivitySubSheet ? (
        <ActivityLogSheet
          visible={showActivitySubSheet}
          onClose={() => setShowActivitySubSheet(false)}
          onSaved={() => { setShowActivitySubSheet(false); }}
          userId={userId}
          planId={planId}
          weightLbs={weightLbs}
          existingLog={activityLog}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bgPrimary },
  flex: { flex: 1 },
  scrollArea: {},
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, paddingBottom: Spacing.lg,
  },
  title: { fontFamily: Fonts.bold, fontSize: FontSizes.heading1, color: Colors.textPrimary },
  subtitle: { fontFamily: Fonts.regular, fontSize: FontSizes.caption, color: Colors.textSecondary, marginTop: 2 },
  scrollContent: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl },
  sectionLabel: {
    fontFamily: Fonts.bold, fontSize: FontSizes.label, color: Colors.textSecondary,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: Spacing.sm, marginTop: Spacing.lg,
  },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingRight: Spacing.xs },
  weightInput: {
    flex: 1, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, padding: 14, fontSize: FontSizes.heading1, fontFamily: Fonts.bold,
    textAlign: 'center', color: Colors.textPrimary,
  },
  unitLabel: { fontFamily: Fonts.regular, fontSize: FontSizes.title, color: Colors.textSecondary, minWidth: 32 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  pill: {
    backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  pillSelected: { backgroundColor: Colors.accentMuted, borderColor: Colors.accentBorder },
  pillText: { fontFamily: Fonts.semiBold, fontSize: FontSizes.caption, color: Colors.textSecondary },
  pillTextSelected: { color: Colors.accent },
  activityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, backgroundColor: Colors.bgCard,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.divider,
  },
  activityRowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  activityLogged: { fontFamily: Fonts.medium, fontSize: FontSizes.caption, color: Colors.textPrimary, flex: 1 },
  activityEdit: { fontFamily: Fonts.regular, fontSize: FontSizes.caption, color: Colors.textSecondary },
  activityPrompt: { fontFamily: Fonts.regular, fontSize: FontSizes.body, color: Colors.textSecondary },
  footer: {
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.divider, backgroundColor: Colors.bgPrimary,
  },
  saveBtn: {
    height: 56, backgroundColor: Colors.accent, borderRadius: Radius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { fontFamily: Fonts.bold, fontSize: FontSizes.body, color: Colors.textPrimary },
});

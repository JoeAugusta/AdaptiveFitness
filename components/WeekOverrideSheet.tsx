import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';

type Step = 'pick' | 'confirmDeload' | 'travelEquip';

const EQUIPMENT_OPTIONS: { id: string; label: string }[] = [
  { id: 'dumbbell', label: 'Dumbbell' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'cable', label: 'Cable' },
  { id: 'machine', label: 'Machine' },
  { id: 'bodyweight', label: 'Bodyweight' },
];

export interface WeekOverrideSheetProps {
  visible: boolean;
  onClose: () => void;
  onApplyDeload: () => void;
  onApplyTravel: (equipment: string[]) => void;
}

export default function WeekOverrideSheet({
  visible,
  onClose,
  onApplyDeload,
  onApplyTravel,
}: WeekOverrideSheetProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('pick');
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);

  const handleClose = () => {
    setStep('pick');
    setSelectedEquipment([]);
    onClose();
  };

  const handleBack = () => {
    setStep('pick');
    setSelectedEquipment([]);
  };

  const toggleEquipment = (id: string) => {
    setSelectedEquipment((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Spacing.xl + insets.bottom },
          ]}
        >
          {step === 'pick' ? (
            <>
              <View style={styles.headerRow}>
                <Text style={styles.headerTitle}>This week is different</Text>
                <TouchableOpacity
                  onPress={handleClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.optionCard}
                activeOpacity={0.75}
                onPress={() => setStep('confirmDeload')}
              >
                <View style={styles.optionIconWrap}>
                  <Ionicons
                    name="battery-half-outline"
                    size={24}
                    color={Colors.success}
                  />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Need a deload</Text>
                  <Text style={styles.optionSub}>
                    Run this week lighter. Same sessions, 85% load, one less
                    set. You still log.
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={Colors.textTertiary}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionCard}
                activeOpacity={0.75}
                onPress={() => setStep('travelEquip')}
              >
                <View style={styles.optionIconWrap}>
                  <Ionicons
                    name="airplane-outline"
                    size={24}
                    color={Colors.accent}
                  />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Traveling this week</Text>
                  <Text style={styles.optionSub}>
                    Train with whatever equipment you have. Next week picks up
                    where you left off.
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={Colors.textTertiary}
                />
              </TouchableOpacity>
            </>
          ) : step === 'confirmDeload' ? (
            <>
              <View style={styles.headerRow}>
                <TouchableOpacity
                  onPress={handleBack}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={Colors.accent}
                  />
                </TouchableOpacity>
                <Text style={styles.headerTitleCenter}>Deload</Text>
                <TouchableOpacity
                  onPress={handleClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.jordanCard}>
                <Text style={styles.jordanQuote}>
                  A deload isn't lost time. Pulling load back lets the adaptation
                  from the last few weeks actually land, so you come back
                  stronger. You'll still log every set.
                </Text>
                <Text style={styles.jordanSign}>Jordan</Text>
              </View>

              <TouchableOpacity
                style={styles.primaryBtn}
                activeOpacity={0.85}
                onPress={onApplyDeload}
              >
                <Text style={styles.primaryBtnText}>Apply deload</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.headerRow}>
                <TouchableOpacity
                  onPress={handleBack}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={Colors.accent}
                  />
                </TouchableOpacity>
                <Text style={styles.headerTitleCenter}>Travel mode</Text>
                <TouchableOpacity
                  onPress={handleClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.equipLabel}>
                What equipment will you have access to?
              </Text>

              <ScrollView
                style={styles.equipScroll}
                contentContainerStyle={styles.equipScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {EQUIPMENT_OPTIONS.map((opt) => {
                  const selected = selectedEquipment.includes(opt.id);
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.equipChip,
                        selected && styles.equipChipSelected,
                      ]}
                      activeOpacity={0.75}
                      onPress={() => toggleEquipment(opt.id)}
                    >
                      <Text
                        style={[
                          styles.equipChipText,
                          selected && styles.equipChipTextSelected,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  selectedEquipment.length === 0 && styles.primaryBtnDisabled,
                ]}
                activeOpacity={0.85}
                disabled={selectedEquipment.length === 0}
                onPress={() => onApplyTravel(selectedEquipment)}
              >
                <Text style={styles.primaryBtnText}>Continue</Text>
              </TouchableOpacity>
            </>
          )}
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
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  headerTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  headerTitleCenter: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  optionIconWrap: {
    width: 40,
    alignItems: 'center',
  },
  optionContent: {
    flex: 1,
    marginLeft: Spacing.sm,
    marginRight: Spacing.sm,
  },
  optionTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  optionSub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  jordanCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  jordanQuote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  jordanSign: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
    marginTop: Spacing.sm,
  },
  primaryBtn: {
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
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  equipLabel: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  equipScroll: {
    maxHeight: 220,
  },
  equipScrollContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  equipChip: {
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.xxl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  equipChipSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
  },
  equipChipText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  equipChipTextSelected: {
    color: Colors.accent,
  },
});

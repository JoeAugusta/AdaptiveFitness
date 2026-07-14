import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';

const RPE_LABELS: Record<number, string> = {
  1: 'Very Easy',
  2: 'Very Easy',
  3: 'Easy',
  4: 'Easy',
  5: 'Moderate',
  6: 'Moderate',
  7: 'Hard',
  8: 'Hard',
  9: 'Very Hard',
  10: 'Max',
};

function rpeSelectedStyles(rpe: number) {
  if (rpe >= 1 && rpe <= 4) {
    return {
      btn: styles.rpeBtnTierLow,
      num: styles.rpeNumTierLow,
    };
  }
  if (rpe >= 5 && rpe <= 7) {
    return {
      btn: styles.rpeBtnTierMid,
      num: styles.rpeNumTierMid,
    };
  }
  return {
    btn: styles.rpeBtnTierHigh,
    num: styles.rpeNumTierHigh,
  };
}

interface RPESelectorProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (rpe: number) => void;
  initialValue?: number | null;
}

export default function RPESelector({
  visible,
  onClose,
  onConfirm,
  initialValue,
}: RPESelectorProps) {
  const [selected, setSelected] = useState<number | null>(initialValue ?? null);

  useEffect(() => {
    if (visible) setSelected(initialValue ?? null);
  }, [visible, initialValue]);

  const handleConfirm = () => {
    if (selected !== null) onConfirm(selected);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <View style={styles.sheet}>
        <View style={styles.dragHandle} />
        <Text style={styles.title}>Rate of Perceived Exertion</Text>
        <Text style={styles.subtitle}>How hard was that set?</Text>

        <View style={styles.grid}>
          {[
            [1, 2, 3, 4, 5],
            [6, 7, 8, 9, 10],
          ].map((row, rowIdx) => (
            <View key={rowIdx} style={styles.gridRow}>
              {row.map((rpe) => {
                const isSelected = selected === rpe;
                const tier = isSelected ? rpeSelectedStyles(rpe) : null;
                return (
                  <TouchableOpacity
                    key={rpe}
                    activeOpacity={0.7}
                    style={[
                      styles.rpeButton,
                      isSelected && tier?.btn,
                    ]}
                    onPress={() => setSelected(rpe)}
                  >
                    <Text
                      style={[
                        styles.rpeNumber,
                        isSelected && tier?.num,
                      ]}
                    >
                      {rpe}
                    </Text>
                    <Text style={styles.rpeLabel}>{RPE_LABELS[rpe]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          style={[
            styles.confirmButton,
            selected === null && styles.confirmDisabled,
          ]}
          onPress={handleConfirm}
          disabled={selected === null}
        >
          <Text
            style={[
              styles.confirmText,
              selected === null && styles.confirmTextDisabled,
            ]}
          >
            Confirm
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
  },
  sheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xxl,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.divider,
    alignSelf: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  grid: {
    gap: Spacing.sm,
  },
  gridRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  rpeButton: {
    flex: 1,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rpeBtnTierLow: {
    backgroundColor: Colors.successMuted,
    borderColor: Colors.success,
  },
  rpeBtnTierMid: {
    backgroundColor: Colors.warningMuted,
    borderColor: Colors.warning,
  },
  rpeBtnTierHigh: {
    backgroundColor: Colors.dangerMuted,
    borderColor: Colors.danger,
  },
  rpeNumber: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.monoMedium,
    color: Colors.textPrimary,
  },
  rpeNumTierLow: {
    color: Colors.success,
  },
  rpeNumTierMid: {
    color: Colors.warning,
  },
  rpeNumTierHigh: {
    color: Colors.danger,
  },
  rpeLabel: {
    fontFamily: Fonts.regular,
    fontSize: 9,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  confirmButton: {
    marginTop: Spacing.xl,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDisabled: {
    backgroundColor: Colors.divider,
  },
  confirmText: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
  },
  confirmTextDisabled: {
    color: Colors.textSecondary,
  },
});

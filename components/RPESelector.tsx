import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { Colors, Fonts, FontSizes } from '../constants/design';

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
                return (
                  <TouchableOpacity
                    key={rpe}
                    activeOpacity={0.7}
                    style={[
                      styles.rpeButton,
                      isSelected && styles.rpeButtonSelected,
                    ]}
                    onPress={() => setSelected(rpe)}
                  >
                    <Text
                      style={[
                        styles.rpeNumber,
                        isSelected && styles.rpeNumberSelected,
                      ]}
                    >
                      {rpe}
                    </Text>
                    <Text
                      style={[
                        styles.rpeLabel,
                        isSelected && styles.rpeLabelSelected,
                      ]}
                    >
                      {RPE_LABELS[rpe]}
                    </Text>
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }, // TODO: map to design token
  sheet: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold, 
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  grid: { gap: 10, marginBottom: 24 },
  gridRow: { flexDirection: 'row', gap: 10 },
  rpeButton: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: Colors.bgPrimary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rpeButtonSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentMuted,
  },
  rpeNumber: { fontSize: FontSizes.heading2, fontFamily: Fonts.bold,  color: Colors.textSecondary },
  rpeNumberSelected: { color: Colors.accent },
  rpeLabel: {
    fontFamily: Fonts.regular,
    fontSize: 9, // TODO: map to design token
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  rpeLabelSelected: { color: Colors.textPrimary },
  confirmButton: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmDisabled: { backgroundColor: Colors.divider },
  confirmText: { fontSize: FontSizes.title, fontFamily: Fonts.semiBold,  color: Colors.textPrimary },
  confirmTextDisabled: { color: Colors.textSecondary },
});

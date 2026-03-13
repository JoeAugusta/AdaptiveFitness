import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';

const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const BG_DARK = '#0F172A';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const DISABLED_BG = '#334155';

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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: CARD_BG,
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
    fontSize: 17,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginBottom: 20,
  },
  grid: { gap: 10, marginBottom: 24 },
  gridRow: { flexDirection: 'row', gap: 10 },
  rpeButton: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: BG_DARK,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rpeButtonSelected: {
    borderColor: ACCENT_BLUE,
    backgroundColor: 'rgba(59,130,246,0.12)',
  },
  rpeNumber: { fontSize: 20, fontWeight: '700', color: TEXT_SECONDARY },
  rpeNumberSelected: { color: ACCENT_BLUE },
  rpeLabel: {
    fontSize: 9,
    color: TEXT_SECONDARY,
    marginTop: 2,
    textAlign: 'center',
  },
  rpeLabelSelected: { color: TEXT_PRIMARY },
  confirmButton: {
    backgroundColor: ACCENT_BLUE,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmDisabled: { backgroundColor: DISABLED_BG },
  confirmText: { fontSize: 17, fontWeight: '600', color: TEXT_PRIMARY },
  confirmTextDisabled: { color: TEXT_SECONDARY },
});

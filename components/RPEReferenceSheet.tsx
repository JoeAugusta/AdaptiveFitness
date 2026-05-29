import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';

export interface RPEReferenceSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function RPEReferenceSheet({ visible, onClose }: RPEReferenceSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + Spacing.lg,
            },
          ]}
        >
          <View style={styles.dragHandle} />

          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>RPE SCALE</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>Rate how hard each set felt</Text>

          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={[styles.badge, styles.badgeSuccess]}>
                <Text style={[styles.badgeText, styles.badgeTextSuccess]}>6</Text>
              </View>
              <View style={styles.cardContent}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>RPE 6</Text>
                  <View style={[styles.tag, styles.tagSuccess]}>
                    <Text style={[styles.tagText, styles.tagTextSuccess]}>Too Easy</Text>
                  </View>
                </View>
                <Text style={styles.cardDesc}>
                  4+ reps still in the tank. Weight too light — load goes up next session.
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={[styles.badge, styles.badgeWarning]}>
                <Text style={[styles.badgeText, styles.badgeTextWarning]}>8</Text>
              </View>
              <View style={styles.cardContent}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>RPE 8</Text>
                  <View style={[styles.tag, styles.tagWarning]}>
                    <Text style={[styles.tagText, styles.tagTextWarning]}>Sweet Spot</Text>
                  </View>
                </View>
                <Text style={styles.cardDesc}>
                  2 reps left, but it&apos;d be tough. This is Jordan&apos;s target for most
                  working sets.
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={[styles.badge, styles.badgeDanger]}>
                <Text style={[styles.badgeText, styles.badgeTextDanger]}>10</Text>
              </View>
              <View style={styles.cardContent}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>RPE 10</Text>
                  <View style={[styles.tag, styles.tagDanger]}>
                    <Text style={[styles.tagText, styles.tagTextDanger]}>Max Effort</Text>
                  </View>
                </View>
                <Text style={styles.cardDesc}>
                  Absolute max. Could not do one more rep. Not for regular training.
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.tipBox}>
            <Text style={styles.tipText}>
              <Ionicons name="bulb-outline" size={16} color={Colors.textSecondary} />{' '}Most working sets should land between RPE 7–8. Consistently below 6? Weight goes up. Above 9? It comes down.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const BADGE_SIZE = 40;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  sheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
  },
  closeBtn: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
  },
  subtitle: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
    marginBottom: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSuccess: {
    backgroundColor: Colors.successMuted,
  },
  badgeWarning: {
    backgroundColor: Colors.warningMuted,
  },
  badgeDanger: {
    backgroundColor: Colors.dangerMuted,
  },
  badgeText: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
  },
  badgeTextSuccess: {
    color: Colors.success,
  },
  badgeTextWarning: {
    color: Colors.warning,
  },
  badgeTextDanger: {
    color: Colors.danger,
  },
  cardContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  cardTitle: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  tag: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  tagSuccess: {
    backgroundColor: Colors.successMuted,
  },
  tagWarning: {
    backgroundColor: Colors.warningMuted,
  },
  tagDanger: {
    backgroundColor: Colors.dangerMuted,
  },
  tagText: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.semiBold,
  },
  tagTextSuccess: {
    color: Colors.success,
  },
  tagTextWarning: {
    color: Colors.warning,
  },
  tagTextDanger: {
    color: Colors.danger,
  },
  cardDesc: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  tipBox: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  tipText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
  },
});

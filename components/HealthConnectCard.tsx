/**
 * HealthConnectCard
 *
 * Shown on HomeScreen on first load when HealthKit is available
 * but permission hasn't been granted yet.
 *
 * Dismissable — never blocks the user.
 * Once dismissed, stores flag in AsyncStorage and never shows again
 * unless the user explicitly re-enables from settings.
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';

export const HEALTH_PERMISSION_DISMISSED_KEY = 'hone_health_permission_dismissed';
export const HEALTH_PERMISSION_GRANTED_KEY = 'hone_health_permission_granted';

interface HealthConnectCardProps {
  onRequestPermission: () => Promise<boolean>;
  onDismiss: () => void;
}

export default function HealthConnectCard({
  onRequestPermission,
  onDismiss,
}: HealthConnectCardProps) {
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    console.log('[HealthCard] Connect tapped');
    setLoading(true);
    try {
      console.log('[HealthCard] calling onRequestPermission...');
      const granted = await onRequestPermission();
      console.log('[HealthCard] onRequestPermission returned:', granted);
      if (granted) {
        await AsyncStorage.setItem(HEALTH_PERMISSION_GRANTED_KEY, '1');
      }
      // Whether granted or denied, dismiss the card
      // If denied, user can re-enable from iOS Settings > Health > Hone
      onDismiss();
    } catch {
      onDismiss();
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    await AsyncStorage.setItem(HEALTH_PERMISSION_DISMISSED_KEY, '1');
    onDismiss();
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Ionicons name="heart-outline" size={20} color={Colors.accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Connect Apple Health</Text>
          <Text style={styles.subtitle}>
            Jordan reads your sleep and HRV to adapt your plan automatically.
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={18} color={Colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <View style={styles.pillsRow}>
        <View style={styles.pill}>
          <Ionicons name="moon-outline" size={12} color={Colors.textSecondary} />
          <Text style={styles.pillText}>Sleep</Text>
        </View>
        <View style={styles.pill}>
          <Ionicons name="pulse-outline" size={12} color={Colors.textSecondary} />
          <Text style={styles.pillText}>HRV</Text>
        </View>
        <View style={styles.pill}>
          <Ionicons name="heart-outline" size={12} color={Colors.textSecondary} />
          <Text style={styles.pillText}>Resting HR</Text>
        </View>
        <View style={styles.pill}>
          <Ionicons name="fitness-outline" size={12} color={Colors.textSecondary} />
          <Text style={styles.pillText}>Workout HR</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.connectBtn}
        activeOpacity={0.85}
        onPress={handleConnect}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={Colors.textPrimary} size="small" />
        ) : (
          <Text style={styles.connectBtnText}>Connect Apple Health →</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.privacyNote}>
        Your health data never leaves your device. Hone reads it locally to
        inform Jordan's coaching.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  pillText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
  },
  connectBtn: {
    height: 44,
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  connectBtnText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  privacyNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 16,
  },
});

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import type { HealthData } from '../hooks/useHealthData';

interface HealthRecoveryCardProps {
  healthData: HealthData;
  onOpenSettings?: () => void;
  /** Stored recovery-metric days available for baseline maturation (0 if unknown). */
  historyDayCount?: number;
}

function MetricCell({
  icon,
  label,
  value,
  unit,
  signal,
}: {
  icon: string;
  label: string;
  value: string;
  unit?: string;
  signal?: 'good' | 'warning' | 'bad' | null;
}) {
  const valueColor =
    signal === 'good'
      ? Colors.success
      : signal === 'bad'
      ? Colors.danger
      : signal === 'warning'
      ? Colors.warning
      : Colors.textPrimary;

  return (
    <View style={styles.metricCell}>
      <Ionicons
        name={icon as any}
        size={16}
        color={Colors.textTertiary}
        style={styles.metricIcon}
      />
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}>
        <Text style={[styles.metricValue, { color: valueColor }]}>
          {value}
        </Text>
        {unit && value !== '—' ? (
          <Text style={styles.metricUnit}>{unit}</Text>
        ) : null}
      </View>
    </View>
  );
}

export default function HealthRecoveryCard({
  healthData,
  onOpenSettings,
  historyDayCount = 0,
}: HealthRecoveryCardProps) {
  const isReady = healthData.hasDataToday;
  const isMaturing = !isReady && historyDayCount > 0;
  const maturingDayLabel = Math.min(historyDayCount, 14);

  const hrvSignal = (() => {
    if (!healthData.hrvMs) return null;
    if (healthData.hrvMs < 30) return 'bad' as const;
    if (healthData.hrvMs > 60) return 'good' as const;
    return null;
  })();

  const hrSignal = (() => {
    if (!healthData.restingHeartRate) return null;
    if (healthData.restingHeartRate > 75) return 'warning' as const;
    if (healthData.restingHeartRate < 50) return 'good' as const;
    return null;
  })();

  const sleepSignal = (() => {
    if (!healthData.sleepHours) return null;
    if (healthData.sleepHours >= 7) return 'good' as const;
    if (healthData.sleepHours < 6) return 'bad' as const;
    return 'warning' as const;
  })();

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="heart" size={14} color={Colors.accent} />
          <Text style={styles.headerLabel}>RECOVERY</Text>
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>Apple Health</Text>
          </View>
        </View>
        {onOpenSettings ? (
          <TouchableOpacity
            onPress={onOpenSettings}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="settings-outline"
              size={16}
              color={Colors.textTertiary}
            />
          </TouchableOpacity>
        ) : null}
      </View>

      {isReady ? (
        <View style={styles.metricsRow}>
          <MetricCell
            icon="pulse-outline"
            label="HRV"
            value={healthData.hrvMs ? String(healthData.hrvMs) : '—'}
            unit="ms"
            signal={hrvSignal}
          />
          <View style={styles.metricDivider} />
          <MetricCell
            icon="heart-outline"
            label="Resting HR"
            value={
              healthData.restingHeartRate
                ? String(healthData.restingHeartRate)
                : '—'
            }
            unit="bpm"
            signal={hrSignal}
          />
          <View style={styles.metricDivider} />
          <MetricCell
            icon="moon-outline"
            label="Sleep"
            value={
              healthData.sleepHours ? String(healthData.sleepHours) : '—'
            }
            unit="hrs"
            signal={sleepSignal}
          />
        </View>
      ) : isMaturing ? (
        <View style={styles.noDataRow}>
          <Ionicons
            name="hourglass-outline"
            size={14}
            color={Colors.textTertiary}
          />
          <Text style={styles.noDataText}>
            {`Learning your baseline — ${maturingDayLabel}/14 days of recovery data.`}
          </Text>
        </View>
      ) : (
        <View style={styles.noDataRow}>
          <Ionicons
            name="watch-outline"
            size={14}
            color={Colors.textTertiary}
          />
          <Text style={styles.noDataText}>
            Connect a sleep or HRV wearable to see recovery trends here.
          </Text>
        </View>
      )}
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
    padding: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  headerLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
  },
  sourceBadge: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    marginLeft: Spacing.xs,
  },
  sourceBadgeText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  metricIcon: {
    marginBottom: 2,
  },
  metricLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  metricValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  metricUnit: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
  },
  metricDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.divider,
  },
  noDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  noDataText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    flex: 1,
  },
});

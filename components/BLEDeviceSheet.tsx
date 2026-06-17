/**
 * BLEDeviceSheet — Modal for scanning and pairing BLE heart rate monitors
 *
 * Shows during ActiveWorkoutScreen when no device is paired.
 * Also accessible from Profile → Connected Devices.
 *
 * Displays:
 * - Scan button
 * - List of discovered HR devices
 * - Connection status
 * - Instructions for enabling HR Broadcast on Whoop
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import type { BLEDevice, BLEConnectionState } from '../utils/bleHeartRate';

interface BLEDeviceSheetProps {
  visible: boolean;
  onClose: () => void;
  onConnect: (deviceId: string, deviceName: string) => Promise<boolean>;
  onDisconnect: () => Promise<void>;
  onStartScan: () => Promise<void>;
  onStopScan: () => void;
  devices: BLEDevice[];
  connectionState: BLEConnectionState;
  connectedDeviceName: string | null;
  pairedDevice: { id: string; name: string } | null;
  error: string | null;
}

function SignalBars({ rssi }: { rssi: number | null }) {
  if (rssi === null) return null;
  const strength = rssi > -60 ? 3 : rssi > -75 ? 2 : 1;
  return (
    <View style={styles.signalBars}>
      {[1, 2, 3].map((bar) => (
        <View
          key={bar}
          style={[
            styles.signalBar,
            { height: bar * 5 },
            bar <= strength ? styles.signalBarActive : styles.signalBarInactive,
          ]}
        />
      ))}
    </View>
  );
}

export default function BLEDeviceSheet({
  visible,
  onClose,
  onConnect,
  onDisconnect,
  onStartScan,
  onStopScan,
  devices,
  connectionState,
  connectedDeviceName,
  pairedDevice,
  error,
}: BLEDeviceSheetProps) {
  const [connectingId, setConnectingId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setConnectingId(null);
      onStopScan();
    }
  }, [visible, onStopScan]);

  const handleConnect = async (device: BLEDevice) => {
    setConnectingId(device.id);
    await onConnect(device.id, device.name);
    setConnectingId(null);
  };

  const isScanning = connectionState === 'scanning';
  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>Heart Rate Monitor</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Connected state */}
          {isConnected && connectedDeviceName ? (
            <View style={styles.connectedCard}>
              <View style={styles.connectedLeft}>
                <Ionicons name="bluetooth" size={20} color={Colors.success} />
                <View>
                  <Text style={styles.connectedName}>{connectedDeviceName}</Text>
                  <Text style={styles.connectedStatus}>Connected · streaming HR</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.disconnectBtn}
                onPress={onDisconnect}
                activeOpacity={0.7}
              >
                <Text style={styles.disconnectBtnText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Instructions */}
              <View style={styles.instructionsCard}>
                <Text style={styles.instructionsTitle}>Before scanning:</Text>
                <Text style={styles.instructionsBody}>
                  <Text style={styles.instructionsBold}>Whoop:</Text> More → Device Settings → HR Broadcast ON{'\n'}
                  <Text style={styles.instructionsBold}>Garmin/Polar:</Text> Enable HR broadcast in device settings{'\n'}
                  <Text style={styles.instructionsBold}>Chest strap:</Text> Wet the electrodes and put it on
                </Text>
              </View>

              {/* Scan button */}
              <TouchableOpacity
                style={[styles.scanBtn, isScanning && styles.scanBtnScanning]}
                activeOpacity={0.85}
                onPress={isScanning ? onStopScan : () => void onStartScan()}
                disabled={isConnecting}
              >
                {isScanning ? (
                  <View style={styles.scanBtnInner}>
                    <ActivityIndicator color={Colors.textPrimary} size="small" />
                    <Text style={styles.scanBtnText}>Scanning... tap to stop</Text>
                  </View>
                ) : (
                  <View style={styles.scanBtnInner}>
                    <Ionicons name="bluetooth-outline" size={18} color={Colors.textPrimary} />
                    <Text style={styles.scanBtnText}>
                      {devices.length > 0 ? 'Scan Again' : 'Start Scanning'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Error */}
              {error ? (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* Device list */}
              {devices.length > 0 ? (
                <>
                  <Text style={styles.devicesLabel}>NEARBY DEVICES</Text>
                  <FlatList
                    data={devices}
                    keyExtractor={(item) => item.id}
                    style={styles.deviceList}
                    renderItem={({ item }) => {
                      const isThisConnecting = connectingId === item.id;
                      return (
                        <TouchableOpacity
                          style={styles.deviceRow}
                          activeOpacity={0.75}
                          onPress={() => void handleConnect(item)}
                          disabled={!!connectingId || isConnecting}
                        >
                          <View style={styles.deviceLeft}>
                            <Ionicons
                              name="heart-outline"
                              size={18}
                              color={Colors.accent}
                            />
                            <View>
                              <Text style={styles.deviceName}>{item.name}</Text>
                              <Text style={styles.deviceId} numberOfLines={1}>
                                {item.id}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.deviceRight}>
                            <SignalBars rssi={item.rssi} />
                            {isThisConnecting ? (
                              <ActivityIndicator
                                size="small"
                                color={Colors.accent}
                              />
                            ) : (
                              <Text style={styles.connectText}>Connect</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                  />
                </>
              ) : !isScanning ? (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="bluetooth-outline"
                    size={32}
                    color={Colors.textTertiary}
                  />
                  <Text style={styles.emptyStateTitle}>No devices found</Text>
                  <Text style={styles.emptyStateBody}>
                    Make sure HR broadcast is enabled on your device and tap Scan.
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: 48,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  connectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.successMuted,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.success,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  connectedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  connectedName: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  connectedStatus: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.success,
    marginTop: 2,
  },
  disconnectBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  disconnectBtnText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  instructionsCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  instructionsTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    letterSpacing: 0.5,
  },
  instructionsBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  instructionsBold: {
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  scanBtn: {
    height: 52,
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  scanBtnScanning: {
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  scanBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  scanBtnText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.danger,
    flex: 1,
  },
  devicesLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  deviceList: {
    maxHeight: 280,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  deviceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
    marginRight: Spacing.md,
  },
  deviceName: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  deviceId: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
    marginTop: 2,
    maxWidth: 180,
  },
  deviceRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  connectText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  signalBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 16,
  },
  signalBar: {
    width: 4,
    borderRadius: 1,
  },
  signalBarActive: {
    backgroundColor: Colors.accent,
  },
  signalBarInactive: {
    backgroundColor: Colors.divider,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.sm,
  },
  emptyStateTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  emptyStateBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Spacing.xl,
  },
});

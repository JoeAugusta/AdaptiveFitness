/**
 * bleHeartRate.ts — BLE Heart Rate Monitor integration
 *
 * Scans for devices advertising Heart Rate Service (UUID 0x180D).
 * Connects and subscribes to Heart Rate Measurement characteristic (UUID 0x2A37).
 * Parses the BLE HR packet format per Bluetooth spec.
 * Persists paired device ID in AsyncStorage for auto-reconnect.
 *
 * Works with: Whoop (HR Broadcast mode), Garmin, Polar, any BLE HR device.
 */

import { BleManager, type Device, type Subscription, State } from 'react-native-ble-plx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ── BLE UUIDs ────────────────────────────────────────────────────────────────
export const HR_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
export const HR_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';
const HR_SERVICE_SHORT = '180d';

// ── Storage keys ─────────────────────────────────────────────────────────────
export const BLE_PAIRED_DEVICE_ID_KEY = 'hone_ble_paired_device_id';
export const BLE_PAIRED_DEVICE_NAME_KEY = 'hone_ble_paired_device_name';

// ── Singleton BLE manager ────────────────────────────────────────────────────
let _bleManager: BleManager | null = null;

function getBleManager(): BleManager {
  if (!_bleManager) {
    _bleManager = new BleManager();
  }
  return _bleManager;
}

// ── HR packet parser ─────────────────────────────────────────────────────────
/**
 * Parse Bluetooth Heart Rate Measurement characteristic value (base64).
 * Byte 0 flags: bit 0 = HR format (0=UINT8, 1=UINT16)
 * Byte 1 (or 1-2): HR value in bpm
 */
export function parseHRPacket(base64Value: string): number | null {
  try {
    const binary = atob(base64Value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (bytes.length < 2) return null;
    const flags = bytes[0]!;
    const isUint16 = (flags & 0x01) !== 0;
    const hr = isUint16
      ? (bytes[1]! | ((bytes[2] ?? 0) << 8))
      : bytes[1]!;
    if (!hr || hr <= 0 || hr > 300) return null;
    return hr;
  } catch {
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type BLEDevice = {
  id: string;
  name: string;
  rssi: number | null;
};

export type BLEConnectionState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

// ── BLE Heart Rate Manager ────────────────────────────────────────────────────
export class BLEHeartRateManager {
  private hrSubscription: Subscription | null = null;
  private connectedDevice: Device | null = null;
  private intentionalDisconnect = false;
  private isReconnecting = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly RECONNECT_DELAYS_MS = [2000, 5000, 10000];

  onDeviceFound: ((device: BLEDevice) => void) | null = null;
  onHRUpdate: ((bpm: number) => void) | null = null;
  onStateChange: ((state: BLEConnectionState) => void) | null = null;
  onError: ((message: string) => void) | null = null;

  private setState(state: BLEConnectionState) {
    this.onStateChange?.(state);
  }

  async isBluetoothReady(): Promise<boolean> {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
    try {
      const state = await getBleManager().state();
      return state === State.PoweredOn;
    } catch {
      return false;
    }
  }

  async startScan(): Promise<void> {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    try {
      const ready = await this.isBluetoothReady();
      if (!ready) {
        this.onError?.('Bluetooth is not enabled. Please turn on Bluetooth and try again.');
        return;
      }
      this.stopScan();
      this.setState('scanning');

      getBleManager().startDeviceScan(
        [HR_SERVICE_UUID],
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            console.warn('[BLE] scan error:', error);
            this.setState('error');
            this.onError?.(error.message ?? 'Scan failed');
            return;
          }
          if (device && (device.name || device.localName)) {
            this.onDeviceFound?.({
              id: device.id,
              name: device.name ?? device.localName ?? device.id,
              rssi: device.rssi ?? null,
            });
          }
        },
      );

      // Auto-stop after 15 seconds
      setTimeout(() => this.stopScan(), 15000);
    } catch (err) {
      console.warn('[BLE] startScan error:', err);
      this.setState('idle');
    }
  }

  stopScan() {
    try {
      getBleManager().stopDeviceScan();
    } catch {
      // silent
    }
  }

  async connect(deviceId: string, deviceName: string): Promise<boolean> {
    try {
      this.stopScan();
      this.setState('connecting');

      const device = await getBleManager().connectToDevice(deviceId, {
        autoConnect: false,
        requestMTU: 23,
      });

      await device.discoverAllServicesAndCharacteristics();

      // Find HR service
      const services = await device.services();
      const hrService = services.find(
        (s) => s.uuid.toLowerCase().includes(HR_SERVICE_SHORT),
      );

      if (!hrService) {
        this.onError?.(`${deviceName} doesn't support standard heart rate monitoring.`);
        this.setState('error');
        await device.cancelConnection().catch(() => {});
        return false;
      }

      // Find HR measurement characteristic
      const characteristics = await hrService.characteristics();
      const hrChar = characteristics.find(
        (c) => c.uuid.toLowerCase().includes('2a37'),
      );

      if (!hrChar) {
        this.onError?.(`Could not find HR measurement on ${deviceName}.`);
        this.setState('error');
        await device.cancelConnection().catch(() => {});
        return false;
      }

      this.connectedDevice = device;

      // Subscribe to HR notifications
      this.hrSubscription = hrChar.monitor((error, characteristic) => {
        if (error) {
          if (error.errorCode === 201) {
            this.handleDisconnect();
          }
          return;
        }
        if (characteristic?.value) {
          const bpm = parseHRPacket(characteristic.value);
          if (bpm !== null) this.onHRUpdate?.(bpm);
        }
      });

      // Handle disconnection
      device.onDisconnected(() => this.handleDisconnect());

      // Persist pairing
      await AsyncStorage.setItem(BLE_PAIRED_DEVICE_ID_KEY, deviceId);
      await AsyncStorage.setItem(BLE_PAIRED_DEVICE_NAME_KEY, deviceName);

      this.intentionalDisconnect = false;
      this.reconnectAttempt = 0;
      this.setState('connected');
      return true;
    } catch (err) {
      console.warn('[BLE] connect error:', err);
      const msg = err instanceof Error ? err.message : 'Connection failed';
      this.onError?.(msg);
      this.setState('error');
      return false;
    }
  }

  private handleDisconnect() {
    this.hrSubscription?.remove();
    this.hrSubscription = null;
    this.connectedDevice = null;
    this.setState('disconnected');

    // Auto-reconnect only if the drop was unexpected (not a user-initiated disconnect)
    if (!this.intentionalDisconnect) {
      this.scheduleReconnect();
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /** Re-arm the reconnect budget — call when a set is logged so we try again at moments that matter. */
  rearmReconnect() {
    if (this.intentionalDisconnect) return;
    // Only re-arm if we are not currently connected and not mid-attempt
    if (this.connectedDevice || this.isReconnecting) return;
    this.reconnectAttempt = 0;
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.isReconnecting) return;
    if (this.reconnectAttempt >= this.RECONNECT_DELAYS_MS.length) return; // budget exhausted
    const delay = this.RECONNECT_DELAYS_MS[this.reconnectAttempt] ?? 10000;
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      void this.attemptReconnect();
    }, delay);
  }

  private async attemptReconnect() {
    if (this.intentionalDisconnect) return;
    if (this.connectedDevice) return; // already back
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    this.reconnectAttempt += 1;
    try {
      const ok = await this.reconnectPaired();
      if (!ok && !this.intentionalDisconnect && !this.connectedDevice) {
        // Schedule the next attempt if budget remains
        this.isReconnecting = false;
        this.scheduleReconnect();
        return;
      }
    } catch {
      this.isReconnecting = false;
      if (!this.intentionalDisconnect && !this.connectedDevice) {
        this.scheduleReconnect();
      }
      return;
    }
    this.isReconnecting = false;
  }

  async disconnect(): Promise<void> {
    try {
      this.intentionalDisconnect = true;
      this.clearReconnectTimer();
      this.hrSubscription?.remove();
      this.hrSubscription = null;
      if (this.connectedDevice) {
        await this.connectedDevice.cancelConnection().catch(() => {});
        this.connectedDevice = null;
      }
      await AsyncStorage.removeItem(BLE_PAIRED_DEVICE_ID_KEY);
      await AsyncStorage.removeItem(BLE_PAIRED_DEVICE_NAME_KEY);
      this.setState('idle');
    } catch (err) {
      console.warn('[BLE] disconnect error:', err);
    }
  }

  async reconnectPaired(): Promise<boolean> {
    try {
      this.intentionalDisconnect = false;
      const deviceId = await AsyncStorage.getItem(BLE_PAIRED_DEVICE_ID_KEY);
      const deviceName = await AsyncStorage.getItem(BLE_PAIRED_DEVICE_NAME_KEY);
      if (!deviceId || !deviceName) return false;
      const ready = await this.isBluetoothReady();
      if (!ready) return false;
      return await this.connect(deviceId, deviceName);
    } catch {
      return false;
    }
  }

  async getPairedDevice(): Promise<{ id: string; name: string } | null> {
    try {
      const id = await AsyncStorage.getItem(BLE_PAIRED_DEVICE_ID_KEY);
      const name = await AsyncStorage.getItem(BLE_PAIRED_DEVICE_NAME_KEY);
      if (id && name) return { id, name };
      return null;
    } catch {
      return null;
    }
  }

  getConnectedDeviceName(): string | null {
    return this.connectedDevice?.name ?? this.connectedDevice?.localName ?? null;
  }

  getCurrentHRFromLastSample(): number | null {
    // HR is delivered via callback — stored externally by the hook
    return null;
  }

  destroy() {
    this.stopScan();
    this.clearReconnectTimer();
    this.hrSubscription?.remove();
    this.connectedDevice = null;
  }
}

// Singleton
let _hrManager: BLEHeartRateManager | null = null;

export function getBLEHeartRateManager(): BLEHeartRateManager {
  if (!_hrManager) {
    _hrManager = new BLEHeartRateManager();
  }
  return _hrManager;
}

/**
 * useBLEHeartRate — React hook for BLE heart rate monitor
 *
 * Manages BLE connection state, device scanning, and live HR stream.
 * Uses singleton BLEHeartRateManager — safe to use in multiple components.
 *
 * USAGE in ActiveWorkoutScreen:
 *   const ble = useBLEHeartRate();
 *
 *   // On mount — try auto-reconnect
 *   useEffect(() => { ble.tryReconnect(); }, []);
 *
 *   // After logging a set
 *   const bpm = ble.currentHR; // latest HR reading
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  getBLEHeartRateManager,
  type BLEDevice,
  type BLEConnectionState,
} from '../utils/bleHeartRate';

export type UseBLEHeartRateReturn = {
  /** Current live HR in bpm — null if not connected or no reading yet */
  currentHR: number | null;
  /** BLE connection state */
  connectionState: BLEConnectionState;
  /** True when connected and streaming */
  isConnected: boolean;
  /** Devices found during scan */
  devices: BLEDevice[];
  /** Error message if connection failed */
  error: string | null;
  /** Previously paired device info */
  pairedDevice: { id: string; name: string } | null;
  /** Start scanning for HR devices */
  startScan: () => Promise<void>;
  /** Stop scanning */
  stopScan: () => void;
  /** Connect to a specific device */
  connect: (deviceId: string, deviceName: string) => Promise<boolean>;
  /** Disconnect current device and unpair */
  disconnect: () => Promise<void>;
  /** Try to reconnect to previously paired device */
  tryReconnect: () => Promise<boolean>;
  /** Get average HR over the last N seconds (for post-set query) */
  getRecentHRAverage: (lookbackSeconds: number) => { avgBpm: number | null; peakBpm: number | null; sampleCount: number };
};

type HRSample = { bpm: number; timestamp: number };

export function useBLEHeartRate(): UseBLEHeartRateReturn {
  const [currentHR, setCurrentHR] = useState<number | null>(null);
  const [connectionState, setConnectionState] = useState<BLEConnectionState>('idle');
  const [devices, setDevices] = useState<BLEDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pairedDevice, setPairedDevice] = useState<{ id: string; name: string } | null>(null);

  // Rolling buffer of HR samples for averaging
  const hrSamplesRef = useRef<HRSample[]>([]);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

    const mgr = getBLEHeartRateManager();

    mgr.onHRUpdate = (bpm) => {
      if (!isMountedRef.current) return;
      setCurrentHR(bpm);
      hrSamplesRef.current.push({ bpm, timestamp: Date.now() });
      // Keep only last 10 minutes of samples
      const cutoff = Date.now() - 10 * 60 * 1000;
      hrSamplesRef.current = hrSamplesRef.current.filter((s) => s.timestamp > cutoff);
    };

    mgr.onStateChange = (state) => {
      if (!isMountedRef.current) return;
      setConnectionState(state);
      if (state === 'disconnected' || state === 'idle') {
        setCurrentHR(null);
      }
    };

    mgr.onDeviceFound = (device) => {
      if (!isMountedRef.current) return;
      setDevices((prev) => {
        const exists = prev.find((d) => d.id === device.id);
        if (exists) return prev;
        return [...prev, device];
      });
    };

    mgr.onError = (message) => {
      if (!isMountedRef.current) return;
      setError(message);
    };

    // Load paired device info on mount
    void mgr.getPairedDevice().then((device) => {
      if (isMountedRef.current) setPairedDevice(device);
    });

    return () => {
      isMountedRef.current = false;
      // Don't destroy manager — it persists across component unmounts
      // to maintain connection during navigation
      mgr.onHRUpdate = null;
      mgr.onStateChange = null;
      mgr.onDeviceFound = null;
      mgr.onError = null;
    };
  }, []);

  const startScan = useCallback(async () => {
    setDevices([]);
    setError(null);
    await getBLEHeartRateManager().startScan();
  }, []);

  const stopScan = useCallback(() => {
    getBLEHeartRateManager().stopScan();
    if (connectionState === 'scanning') {
      setConnectionState('idle');
    }
  }, [connectionState]);

  const connect = useCallback(async (deviceId: string, deviceName: string): Promise<boolean> => {
    setError(null);
    const success = await getBLEHeartRateManager().connect(deviceId, deviceName);
    if (success) {
      setPairedDevice({ id: deviceId, name: deviceName });
    }
    return success;
  }, []);

  const disconnect = useCallback(async () => {
    await getBLEHeartRateManager().disconnect();
    setPairedDevice(null);
    setCurrentHR(null);
    hrSamplesRef.current = [];
  }, []);

  const tryReconnect = useCallback(async (): Promise<boolean> => {
    const device = await getBLEHeartRateManager().getPairedDevice();
    if (!device) return false;
    setPairedDevice(device);
    return await getBLEHeartRateManager().reconnectPaired();
  }, []);

  const getRecentHRAverage = useCallback((lookbackSeconds: number) => {
    const cutoff = Date.now() - lookbackSeconds * 1000;
    const recent = hrSamplesRef.current.filter((s) => s.timestamp > cutoff);
    if (recent.length === 0) return { avgBpm: null, peakBpm: null, sampleCount: 0 };
    const bpms = recent.map((s) => s.bpm);
    const avg = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
    const peak = Math.round(Math.max(...bpms));
    return { avgBpm: avg, peakBpm: peak, sampleCount: recent.length };
  }, []);

  return {
    currentHR,
    connectionState,
    isConnected: connectionState === 'connected',
    devices,
    error,
    pairedDevice,
    startScan,
    stopScan,
    connect,
    disconnect,
    tryReconnect,
    getRecentHRAverage,
  };
}

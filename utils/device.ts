import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';

/** Installation-scoped ID (vendor / Android ID) — resets on reinstall. */
export async function getDeviceId(): Promise<string | null> {
  try {
    if (Platform.OS === 'ios') {
      const iosId = await Application.getIosIdForVendorAsync();
      if (iosId) return iosId;
    }
    if (Platform.OS === 'android' && Application.androidId) {
      return Application.androidId;
    }
    return Device.modelId ?? null;
  } catch {
    return Device.modelId ?? null;
  }
}

/** Hardware/OS fingerprint — stable across reinstalls on the same device. */
export async function getDeviceFingerprint(): Promise<string | null> {
  try {
    const components = [
      Device.modelName ?? '',
      Device.modelId ?? '',
      Device.osName ?? '',
      Device.osVersion ?? '',
      Device.osBuildId ?? '',
      String(Device.totalMemory ?? ''),
      String(Device.deviceYearClass ?? ''),
      Platform.OS,
    ].join('|');

    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      components,
    );

    return hash;
  } catch {
    return null;
  }
}

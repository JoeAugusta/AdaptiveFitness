import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import { BETA_BYPASS } from '../constants/betaBypass';

let rcConfigured = false;

export function markRevenueCatConfigured(): void {
  rcConfigured = true;
}

function isRevenueCatIdentityEnabled(): boolean {
  if (BETA_BYPASS || Platform.OS === 'web' || !rcConfigured) return false;
  const apiKey =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? ''
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';
  return !!apiKey && apiKey !== 'placeholder';
}

export async function syncRevenueCatLogin(userId: string): Promise<void> {
  if (!isRevenueCatIdentityEnabled() || !userId) return;
  try {
    await Purchases.logIn(userId);
  } catch (e) {
    console.warn('[RevenueCat] logIn failed', e);
  }
}

export async function syncRevenueCatLogout(): Promise<void> {
  if (!isRevenueCatIdentityEnabled()) return;
  try {
    await Purchases.logOut();
  } catch (e) {
    console.warn('[RevenueCat] logOut failed', e);
  }
}

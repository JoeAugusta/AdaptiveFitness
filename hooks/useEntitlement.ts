import Purchases from 'react-native-purchases';
import { Platform } from 'react-native';
import { useState, useEffect } from 'react';
import { BETA_BYPASS } from '../constants/betaBypass';

export type EntitlementStatus = 'loading' | 'trial' | 'paid' | 'free';

export function useEntitlement(): {
  isPro: boolean;
  status: EntitlementStatus;
  loading: boolean;
  trialEndsAt: Date | null;
} {
  const [isPro, setIsPro] = useState<boolean>(
    BETA_BYPASS || Platform.OS === 'web',
  );
  const [status, setStatus] = useState<EntitlementStatus>(
    BETA_BYPASS || Platform.OS === 'web' ? 'paid' : 'loading',
  );
  const [loading, setLoading] = useState(
    !BETA_BYPASS && Platform.OS !== 'web',
  );
  const [trialEndsAt, setTrialEndsAt] = useState<Date | null>(null);

  useEffect(() => {
    if (BETA_BYPASS) {
      setIsPro(true);
      setStatus('paid');
      setLoading(false);
      setTrialEndsAt(null);
      return;
    }
    if (Platform.OS === 'web') {
      setIsPro(true);
      setStatus('paid');
      setLoading(false);
      setTrialEndsAt(null);
      return;
    }

    async function check() {
      try {
        const info = await Purchases.getCustomerInfo();
        const entitlement = info.entitlements.active['pro'];

        if (!entitlement) {
          setIsPro(false);
          setStatus('free');
          setTrialEndsAt(null);
          return;
        }

        const isInTrial = entitlement.periodType === 'TRIAL';
        const endsAt =
          isInTrial && entitlement.expirationDate
            ? new Date(entitlement.expirationDate)
            : null;

        setIsPro(true);
        setStatus(isInTrial ? 'trial' : 'paid');
        setTrialEndsAt(endsAt);
      } catch {
        setIsPro(false);
        setStatus('free');
        setTrialEndsAt(null);
      } finally {
        setLoading(false);
      }
    }

    check();
  }, []);

  return { isPro, status, loading, trialEndsAt };
}

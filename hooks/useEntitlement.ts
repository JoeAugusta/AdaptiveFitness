import Purchases, { type CustomerInfo } from 'react-native-purchases';
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
    if (BETA_BYPASS || Platform.OS === 'web') {
      setIsPro(true);
      setStatus('paid');
      setLoading(false);
      setTrialEndsAt(null);
      return;
    }

    const applyInfo = (info: CustomerInfo) => {
      const entitlement = info.entitlements.active['pro'];
      if (!entitlement) {
        setIsPro(false);
        setStatus('free');
        setTrialEndsAt(null);
        return;
      }
      const isInTrial = entitlement.periodType === 'TRIAL';
      setIsPro(true);
      setStatus(isInTrial ? 'trial' : 'paid');
      setTrialEndsAt(
        isInTrial && entitlement.expirationDate
          ? new Date(entitlement.expirationDate)
          : null,
      );
    };

    let mounted = true;

    Purchases.getCustomerInfo()
      .then((info) => {
        if (mounted) applyInfo(info);
      })
      .catch(() => {
        if (mounted) {
          setIsPro(false);
          setStatus('free');
          setTrialEndsAt(null);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const listener = (info: CustomerInfo) => {
      if (mounted) applyInfo(info);
    };
    Purchases.addCustomerInfoUpdateListener(listener);

    return () => {
      mounted = false;
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  return { isPro, status, loading, trialEndsAt };
}

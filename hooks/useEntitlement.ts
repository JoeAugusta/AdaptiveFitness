import Purchases from 'react-native-purchases';
import { Platform } from 'react-native';
import { useState, useEffect } from 'react';

const BETA_BYPASS = true;

export function useEntitlement() {
  const [isPro, setIsPro] = useState<boolean>(
    BETA_BYPASS || Platform.OS === 'web',
  );
  const [loading, setLoading] = useState(
    !BETA_BYPASS && Platform.OS !== 'web',
  );

  useEffect(() => {
    if (BETA_BYPASS) return;
    if (Platform.OS === 'web') return;

    async function check() {
      try {
        const info = await Purchases.getCustomerInfo();
        setIsPro(
          typeof info.entitlements.active['pro'] !== 'undefined',
        );
      } catch {
        setIsPro(false);
      } finally {
        setLoading(false);
      }
    }

    check();
  }, []);

  return { isPro, loading };
}

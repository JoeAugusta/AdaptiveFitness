import Purchases from 'react-native-purchases';
import { Platform } from 'react-native';
import { useState, useEffect } from 'react';

export function useEntitlement() {
  const [isPro, setIsPro] = useState<boolean>(
    Platform.OS === 'web', // web dev bypass — always Pro on web
  );
  const [loading, setLoading] = useState(Platform.OS !== 'web');

  useEffect(() => {
    if (Platform.OS === 'web') return; // skip on web

    async function check() {
      try {
        const info = await Purchases.getCustomerInfo();
        setIsPro(
          typeof info.entitlements.active['pro'] !== 'undefined',
        );
      } catch {
        setIsPro(false); // fail closed — no entitlement on error
      } finally {
        setLoading(false);
      }
    }

    check();
  }, []);

  return { isPro, loading };
}

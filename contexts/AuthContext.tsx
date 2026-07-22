import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../Lib/supabase';
import {
  syncRevenueCatLogin,
  syncRevenueCatLogout,
} from '../utils/revenueCatIdentity';

type AuthContextValue = {
  session: Session | null;
  authReady: boolean;
  hasPlans: boolean;
  refreshPlans: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchHasPlans(userId: string): Promise<boolean> {
  const { data: planData } = await supabase
    .from('plans')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['active', 'completed'])
    .limit(1)
    .maybeSingle();
  return !!planData;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [hasPlans, setHasPlans] = useState(false);

  const refreshPlans = useCallback(async (): Promise<boolean> => {
    const {
      data: { session: s },
    } = await supabase.auth.getSession();
    const uid = s?.user?.id;
    if (!uid) {
      setHasPlans(false);
      return false;
    }
    const hp = await fetchHasPlans(uid);
    setHasPlans(hp);
    return hp;
  }, []);

  useEffect(() => {
    // `settled` is set synchronously (before any await) so concurrent callers bail out.
    let settled = false;

    // Resolves authReady exactly once — whichever path fires first wins.
    // hasPlans is awaited before setAuthReady so SplashScreen navigates
    // with the correct value on the first render.
    const settle = async (s: Session | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      setSession(s);
      if (s?.user) {
        const hp = await fetchHasPlans(s.user.id);
        setHasPlans(hp);
      } else {
        setHasPlans(false);
      }
      setAuthReady(true);
    };

    // Fallback: force authReady after 3 s regardless — prevents infinite hang
    // on cold start if Supabase AsyncStorage read stalls or network is absent.
    const timeoutId = setTimeout(() => {
      void settle(null);
    }, 3000);

    // Primary path: getSession() reads from AsyncStorage and resolves reliably
    // on cold start. Do not wait for onAuthStateChange's INITIAL_SESSION event —
    // that event is not guaranteed to fire before the timeout on all devices.
    supabase.auth.getSession()
      .then(({ data: { session: s } }) => settle(s))
      .catch(() => settle(null));

    // Secondary path: onAuthStateChange handles post-settlement events
    // (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED).
    // If INITIAL_SESSION fires before getSession() resolves we use it too —
    // the `settled` guard ensures only the first caller wins.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!settled) {
          void settle(newSession ?? null);
          return;
        }
        // Post-settlement: keep session state in sync for sign-in/out/refresh.
        const s = newSession ?? null;
        setSession(s);
        if (s?.user) {
          void fetchHasPlans(s.user.id).then(setHasPlans);
        } else {
          setHasPlans(false);
        }

        if (event === 'SIGNED_OUT') {
          void syncRevenueCatLogout();
        } else if (
          (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') &&
          s?.user?.id
        ) {
          void syncRevenueCatLogin(s.user.id);
        }
      },
    );

    return () => {
      clearTimeout(timeoutId);
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      authReady,
      hasPlans,
      refreshPlans,
    }),
    [session, authReady, hasPlans, refreshPlans],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

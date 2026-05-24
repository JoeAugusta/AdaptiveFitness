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
    let initialEventReceived = false;

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        const s = newSession ?? null;
        setSession(s);

        if (s?.user) {
          const hp = await fetchHasPlans(s.user.id);
          setHasPlans(hp);
        } else {
          setHasPlans(false);
        }

        // Only mark ready after INITIAL_SESSION fires.
        // This is always the first event on cold launch —
        // it confirms Supabase has finished reading AsyncStorage.
        // TOKEN_REFRESHED, SIGNED_IN etc. may fire afterward
        // but authReady stays true once set.
        if (!initialEventReceived) {
          initialEventReceived = true;
          setAuthReady(true);
        }
      },
    );

    return () => {
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

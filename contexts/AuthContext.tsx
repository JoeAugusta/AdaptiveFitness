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
  const { data } = await supabase.from('plans').select('id').eq('user_id', userId).limit(1);
  return (data?.length ?? 0) > 0;
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
    let cancelled = false;

    void (async () => {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(initialSession ?? null);
      const uid = initialSession?.user?.id;
      if (!uid) {
        setHasPlans(false);
        setAuthReady(true);
        return;
      }
      const hp = await fetchHasPlans(uid);
      if (!cancelled) {
        setHasPlans(hp);
        setAuthReady(true);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
      const uid = newSession?.user?.id;
      if (!uid) {
        setHasPlans(false);
        setAuthReady(true);
        return;
      }
      void (async () => {
        const hp = await fetchHasPlans(uid);
        if (!cancelled) {
          setHasPlans(hp);
          setAuthReady(true);
        }
      })();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
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

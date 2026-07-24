import { supabase } from '../Lib/supabase';

type DeleteResponse = { success?: boolean; error?: string } | null;

/** Resolve a fresh access token, refreshing the session first. */
async function getFreshAccessToken(): Promise<string> {
  // refreshSession mints a new token rather than reusing a cached one that may
  // be expired or mid-rotation (the observed JWT verification failure).
  const { data: refreshed } = await supabase.auth.refreshSession();
  const token =
    refreshed?.session?.access_token ??
    (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Not signed in');
  return token;
}

function isAuthFailure(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err ?? '')
    .toLowerCase();
  return (
    msg.includes('jwt') ||
    msg.includes('unauthorized') ||
    msg.includes('401') ||
    msg.includes('non-2xx')
  );
}

async function invokeDelete(token: string): Promise<DeleteResponse> {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: {},
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) throw error;
  return data as DeleteResponse;
}

/**
 * Deletes all user-owned rows and the auth user via Edge Function (service role).
 * Refreshes the session first, and retries once on an auth-shaped failure.
 */
export async function deleteUserAccount(): Promise<void> {
  let json: DeleteResponse = null;

  try {
    json = await invokeDelete(await getFreshAccessToken());
  } catch (err) {
    if (!isAuthFailure(err)) {
      throw new Error(
        (err as { message?: string })?.message ?? 'Delete failed',
      );
    }
    // One retry with a newly refreshed token — mirrors the manual retry that
    // was observed to succeed.
    console.warn('[deleteAccount] auth failure, retrying with fresh token', err);
    json = await invokeDelete(await getFreshAccessToken());
  }

  if (!json || json.success !== true) {
    throw new Error(json?.error ?? 'Delete failed');
  }
}

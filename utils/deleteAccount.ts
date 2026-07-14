import { supabase } from '../Lib/supabase';

/**
 * Deletes all user-owned rows and auth user via Edge Function (service role).
 */
export async function deleteUserAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: {},
  });

  if (error) {
    throw new Error(error.message ?? 'Delete failed');
  }

  const json = data as { success?: boolean; error?: string } | null;
  if (!json || json.success !== true) {
    throw new Error(json?.error ?? 'Delete failed');
  }
}

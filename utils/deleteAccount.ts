const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

/**
 * Deletes all user-owned rows and auth user via Edge Function (service role).
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });

  let json: { success?: boolean; error?: string };
  try {
    json = (await res.json()) as { success?: boolean; error?: string };
  } catch {
    throw new Error('Invalid response from server');
  }

  if (!res.ok || json.success !== true) {
    throw new Error(json.error ?? `Delete failed (${res.status})`);
  }
}

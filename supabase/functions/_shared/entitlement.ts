import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function requireProUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('user_profiles')
    .select('subscription_status')
    .eq('user_id', userId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { subscription_status?: string } | null)
    ?.subscription_status === 'pro';
}

/** Returns true if the user is OVER the limit for this event type in the last hour. */
export async function isOverPerUserHourlyLimit(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  eventType: string,
  maxPerHour: number,
): Promise<boolean> {
  try {
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabase
      .from('rate_limit_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', eventType)
      .gte('created_at', hourAgo);
    return (count ?? 0) >= maxPerHour;
  } catch {
    // On a counting error, fail OPEN (allow) — never block a legitimate user due to
    // a transient DB issue. The Pro gate is the primary protection; this is secondary.
    return false;
  }
}

/** Log a successful call so the window counter accumulates. */
export async function logUsageEvent(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  eventType: string,
): Promise<void> {
  try {
    await supabase.from('rate_limit_events').insert({
      user_id: userId,
      event_type: eventType,
      reason: 'usage',
    });
  } catch (e) {
    console.error('[rate-limit] usage log insert failed:', e);
  }
}

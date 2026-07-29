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

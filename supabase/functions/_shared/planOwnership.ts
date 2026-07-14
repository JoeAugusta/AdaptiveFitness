import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type PlanOwnershipFailure = { errorResponse: Response };

export async function requirePlanOwnership(
  supabase: SupabaseClient,
  planId: string,
  userId: string,
  corsHeaders: Record<string, string>,
  select = 'id, user_id, plan_json',
): Promise<{ plan: Record<string, unknown> } | PlanOwnershipFailure> {
  const { data: plan, error } = await supabase
    .from('plans')
    .select(select)
    .eq('id', planId)
    .single();

  if (error || !plan) {
    return {
      errorResponse: new Response(JSON.stringify({ error: 'Plan not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  if ((plan as { user_id: string }).user_id !== userId) {
    return {
      errorResponse: new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  return { plan: plan as Record<string, unknown> };
}

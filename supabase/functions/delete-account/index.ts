// supabase functions deploy delete-account

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authResult = await requireAuth(req, { corsHeaders });
  if ('errorResponse' in authResult) return authResult.errorResponse;
  const userId = authResult.user!.id;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const adminClient = supabase;

    type PgLikeError = { message?: string; code?: string };

    const recoverableMissingTableOrRelation = (error: PgLikeError | null): boolean => {
      if (!error) return false;
      const msg = (error.message ?? '').toLowerCase();
      const code = error.code ?? '';
      return (
        code === 'PGRST205' ||
        code === '42P01' ||
        msg.includes('could not find the table') ||
        (msg.includes('does not exist') && (msg.includes('relation') || msg.includes('table')))
      );
    };

    const deleteByUserIdOrSkipMissing = async (table: string): Promise<void> => {
      try {
        const { error } = await adminClient.from(table).delete().eq('user_id', userId);
        if (!error) return;
        if (recoverableMissingTableOrRelation(error)) {
          console.warn(`[delete-account] ${table}: skip (${error.message})`);
          return;
        }
        throw new Error(`${table}: ${error.message}`);
      } catch (e: unknown) {
        if (
          recoverableMissingTableOrRelation({
            message: e instanceof Error ? e.message : String(e),
          })
        ) {
          console.warn(`[delete-account] ${table}: skip (${e instanceof Error ? e.message : e})`);
          return;
        }
        throw e instanceof Error ? e : new Error(String(e));
      }
    };

    const deleteWorkoutLogsForUser = async (): Promise<void> => {
      try {
        const first = await adminClient.from('workout_logs').delete().eq('user_id', userId);
        if (!first.error) return;

        if (recoverableMissingTableOrRelation(first.error)) {
          console.warn(`[delete-account] workout_logs: skip (${first.error.message})`);
          return;
        }

        const em = first.error.message?.toLowerCase() ?? '';
        const unknownUserIdColumn =
          first.error.code === 'PGRST204' ||
          (em.includes('user_id') &&
            (em.includes('schema cache') || em.includes('column') || em.includes('could not find')));

        if (!unknownUserIdColumn) throw new Error(`workout_logs: ${first.error.message}`);

        const { data: userPlans } = await adminClient.from('plans').select('id').eq('user_id', userId);
        const planIds = userPlans?.map((p: { id: string }) => p.id) ?? [];
        if (planIds.length === 0) return;

        const second = await adminClient.from('workout_logs').delete().in('plan_id', planIds);
        if (!second.error) return;
        if (recoverableMissingTableOrRelation(second.error)) {
          console.warn(`[delete-account] workout_logs (by plan_id): skip (${second.error.message})`);
          return;
        }
        throw new Error(`workout_logs: ${second.error.message}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (recoverableMissingTableOrRelation({ message: msg })) {
          console.warn(`[delete-account] workout_logs: skip (${msg})`);
          return;
        }
        throw e instanceof Error ? e : new Error(String(e));
      }
    };

    // FK-safe order — child/user-scoped rows before auth.admin.deleteUser
    await deleteByUserIdOrSkipMissing('macro_logs');
    await deleteByUserIdOrSkipMissing('meal_suggestions');
    await deleteByUserIdOrSkipMissing('weight_logs');
    await deleteByUserIdOrSkipMissing('body_measurements');
    await deleteByUserIdOrSkipMissing('sport_logs');
    await deleteByUserIdOrSkipMissing('free_sessions');

    await deleteWorkoutLogsForUser();

    await deleteByUserIdOrSkipMissing('weekly_summaries');
    await deleteByUserIdOrSkipMissing('macro_plans');
    await deleteByUserIdOrSkipMissing('plans');
    await deleteByUserIdOrSkipMissing('goals');
    await deleteByUserIdOrSkipMissing('user_profiles');

    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[delete-account] FATAL:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

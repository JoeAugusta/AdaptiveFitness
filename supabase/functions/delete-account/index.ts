// supabase functions deploy delete-account --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let body: { userId?: string };
    try {
      body = (await req.json()) as { userId?: string };
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = body.userId;
    if (typeof userId !== 'string' || userId.trim() === '') {
      return new Response(JSON.stringify({ error: 'Missing userId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const steps: Array<{ label: string; run: () => Promise<{ error: { message: string } | null }> }> = [
      { label: 'macro_logs', run: () => supabase.from('macro_logs').delete().eq('user_id', userId) },
      {
        label: 'meal_suggestions',
        run: () => supabase.from('meal_suggestions').delete().eq('user_id', userId),
      },
      { label: 'weight_logs', run: () => supabase.from('weight_logs').delete().eq('user_id', userId) },
      {
        label: 'body_measurements',
        run: () => supabase.from('body_measurements').delete().eq('user_id', userId),
      },
      { label: 'sport_logs', run: () => supabase.from('sport_logs').delete().eq('user_id', userId) },
      { label: 'free_sessions', run: () => supabase.from('free_sessions').delete().eq('user_id', userId) },
      {
        label: 'workout_logs',
        run: () => supabase.from('workout_logs').delete().eq('user_id', userId),
      },
      {
        label: 'weekly_summaries',
        run: () => supabase.from('weekly_summaries').delete().eq('user_id', userId),
      },
      { label: 'macro_plans', run: () => supabase.from('macro_plans').delete().eq('user_id', userId) },
      { label: 'plans', run: () => supabase.from('plans').delete().eq('user_id', userId) },
      { label: 'goals', run: () => supabase.from('goals').delete().eq('user_id', userId) },
      {
        label: 'user_profiles',
        run: () => supabase.from('user_profiles').delete().eq('user_id', userId),
      },
    ];

    for (const { label, run } of steps) {
      const { error } = await run();
      if (error) {
        console.error(`[delete-account] ${label}:`, error.message);
        return new Response(
          JSON.stringify({ error: `${label}: ${error.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
    if (authErr) {
      console.error('[delete-account] auth.admin.deleteUser:', authErr.message);
      return new Response(JSON.stringify({ error: authErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

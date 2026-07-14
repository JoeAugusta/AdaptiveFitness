import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { requirePlanOwnership } from '../_shared/planOwnership.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function weekNum(w: Record<string, unknown>): number | undefined {
  const n = w.weekNumber ?? w.week_number;
  return typeof n === 'number' && !Number.isNaN(n) ? n : undefined;
}

function dayNum(d: Record<string, unknown>): number | undefined {
  const n = d.dayNumber ?? d.day_number;
  return typeof n === 'number' && !Number.isNaN(n) ? n : undefined;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authResult = await requireAuth(req, { corsHeaders });
  if ('errorResponse' in authResult) return authResult.errorResponse;
  const userId = authResult.user!.id;

  try {
    const body = await req.json();
    const planId = body.planId as string | undefined;
    const weekNumber = body.weekNumber as number | undefined;
    const signal = body.signal as string | undefined;

    if (!planId || weekNumber == null || !signal) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (signal !== 'high_fatigue' && signal !== 'low_fatigue' && signal !== 'on_target') {
      return new Response(JSON.stringify({ error: 'Invalid signal' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const ownership = await requirePlanOwnership(
      supabase,
      planId,
      userId,
      corsHeaders,
      'id, user_id, plan_json',
    );
    if ('errorResponse' in ownership) return ownership.errorResponse;

    const plan = ownership.plan;
    const planJson = JSON.parse(JSON.stringify(plan.plan_json)) as {
      weeks?: Array<Record<string, unknown>>;
    };

    const weeks = planJson.weeks ?? [];
    const currentWeekObj = weeks.find((w) => weekNum(w) === weekNumber) as
      | Record<string, unknown>
      | undefined;

    if (!currentWeekObj) {
      return new Response(JSON.stringify({ error: 'Week not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: loggedSessions } = await supabase
      .from('workout_logs')
      .select('day_number')
      .eq('plan_id', planId)
      .eq('user_id', userId)
      .eq('week_number', weekNumber);

    const loggedDayNumbers = new Set(
      (loggedSessions ?? [])
        .map((l: { day_number?: number }) => l.day_number)
        .filter((n: unknown): n is number => typeof n === 'number'),
    );

    const days = (currentWeekObj.days as Record<string, unknown>[] | undefined) ?? [];
    const nextDay = days.find((d) => {
      if (d.type !== 'workout') return false;
      const dn = dayNum(d);
      return typeof dn === 'number' && !loggedDayNumbers.has(dn);
    }) as Record<string, unknown> | undefined;

    if (!nextDay) {
      return new Response(JSON.stringify({ message: 'No remaining sessions to adjust' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const RPE_DELTA = signal === 'high_fatigue' ? -0.5 : signal === 'low_fatigue' ? 0.5 : 0;

    if (RPE_DELTA === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No RPE delta for on_target', signal }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const HIGH_FATIGUE_NOTE =
      'Load pulled back — recovery is the priority today. Hit clean reps, not heavy ones.';
    const LOW_FATIGUE_NOTE =
      'Extra capacity in the tank — push the top end of your rep ranges today.';

    const PRIMARY_TIERS = new Set(['primary_compound', 'secondary_compound']);

    const exercises = (nextDay.exercises as Record<string, unknown>[] | undefined) ?? [];
    nextDay.exercises = exercises.map((ex) => {
      const tier = String(ex.compoundTier ?? ex.category ?? '');
      const setCount = typeof ex.sets === 'number' ? ex.sets : Number(ex.sets ?? 0);
      const isPrimary = PRIMARY_TIERS.has(tier) || setCount >= 4;

      if (!ex.targetWeight || ex.targetWeight === 0) return ex;

      if (!isPrimary) return ex;

      const prevRpe = typeof ex.targetRpe === 'number' ? ex.targetRpe : Number(ex.targetRpe ?? 8);
      const newRpe = Math.min(10, Math.max(5, prevRpe + RPE_DELTA));
      const note = signal === 'high_fatigue' ? HIGH_FATIGUE_NOTE : LOW_FATIGUE_NOTE;

      return {
        ...ex,
        targetRpe: newRpe,
        coachingNote: note,
        adjustedBySignal: signal,
      };
    });

    const updatedWeeks = weeks.map((w) =>
      weekNum(w) === weekNumber ? currentWeekObj : w,
    );

    const { error: updateError } = await supabase
      .from('plans')
      .update({ plan_json: { ...planJson, weeks: updatedWeeks } })
      .eq('id', planId)
      .eq('user_id', userId);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        success: true,
        adjustedDay: nextDay.title ?? 'Workout',
        signal,
        rpeDelta: RPE_DELTA,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

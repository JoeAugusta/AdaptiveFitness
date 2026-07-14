import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { requirePlanOwnership } from '../_shared/planOwnership.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TARGET_RATES: Record<string, number> = {
  fat_loss: -0.75,
  hypertrophy: 0.25,
  strength: 0.25,
  recomp: 0.0,
  general: 0.0,
};

function roundTo50(n: number): number {
  return Math.round(n / 50) * 50;
}

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

type AdjustmentType = 'increase' | 'decrease' | 'adherence_check';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authResult = await requireAuth(req, { corsHeaders });
  if ('errorResponse' in authResult) return authResult.errorResponse;
  const userId = authResult.user!.id;

  try {
    const { planId, weekNumber } = await req.json();

    if (!planId || weekNumber == null) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: planId, weekNumber' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const ownership = await requirePlanOwnership(supabase, planId, userId, corsHeaders, 'id, user_id');
    if ('errorResponse' in ownership) return ownership.errorResponse;

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const sinceDate = fourteenDaysAgo.toISOString().split('T')[0];

    const [weightLogsRes, macroPlanRes, goalRes, profileRes, macroLogsRes] = await Promise.all([
      supabase
        .from('weight_logs')
        .select('weight_lbs, log_date')
        .eq('user_id', userId)
        .gte('log_date', sinceDate)
        .order('log_date', { ascending: true }),
      supabase
        .from('macro_plans')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('goals')
        .select('goal_type, starting_weight_lbs, target_weight_lbs, plan_duration_weeks, target_lift')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('user_profiles')
        .select('weight_lbs')
        .eq('user_id', userId)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('macro_logs')
        .select('log_date, calories')
        .eq('user_id', userId)
        .gte('log_date', sinceDate),
    ]);

    const weightLogs: { weight_lbs: number; log_date: string }[] = weightLogsRes.data ?? [];
    const macroPlan = macroPlanRes.data;
    const goal = goalRes.data;
    const profile = profileRes.data;

    if (weightLogs.length < 5) {
      return new Response(
        JSON.stringify({
          status: 'insufficient_data',
          message: 'Need at least 5 weigh-ins in the last 14 days',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!macroPlan) {
      return new Response(
        JSON.stringify({ status: 'no_macro_plan', message: 'No macro plan found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const midpoint = Math.floor(weightLogs.length / 2);
    const earlierHalf = weightLogs.slice(0, midpoint);
    const recentHalf = weightLogs.slice(midpoint);

    const avg = (arr: { weight_lbs: number }[]) =>
      arr.reduce((sum, l) => sum + l.weight_lbs, 0) / arr.length;

    const earlierAvg = avg(earlierHalf);
    const recentAvg = avg(recentHalf);

    const earlierMidDate = new Date(earlierHalf[Math.floor(earlierHalf.length / 2)].log_date);
    const recentMidDate = new Date(recentHalf[Math.floor(recentHalf.length / 2)].log_date);
    const daysBetween = Math.max(
      (recentMidDate.getTime() - earlierMidDate.getTime()) / (1000 * 60 * 60 * 24),
      1,
    );

    const weeklyChange = Math.round(((recentAvg - earlierAvg) / (daysBetween / 7)) * 10) / 10;

    const goalType: string = goal?.goal_type ?? 'general';
    const targetRate = TARGET_RATES[goalType] ?? 0.0;
    const delta = weeklyChange - targetRate;

    if (Math.abs(delta) > 1.5) {
      return new Response(
        JSON.stringify({
          status: 'anomaly',
          weeklyChange,
          targetRate,
          message: 'Weight change is unusually large — skipping adjustment',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (Math.abs(delta) < 0.3) {
      return new Response(
        JSON.stringify({
          status: 'on_track',
          weeklyChange,
          targetRate,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const currentCalories = Number(macroPlan.calories_target ?? 2000);
    const currentProtein = Number(macroPlan.protein_g ?? 150);
    const currentCarbs = Number(macroPlan.carbs_g ?? 200);
    const currentFats = Number(macroPlan.fats_g ?? 60);
    const currentWeight = weightLogs[weightLogs.length - 1].weight_lbs;
    const baselineWeight = profile?.weight_lbs ?? currentWeight;

    const goalWeightRaw = goal?.target_weight_lbs;
    const goalWeight =
      goalWeightRaw != null && Number.isFinite(Number(goalWeightRaw)) && Number(goalWeightRaw) > 0
        ? Number(goalWeightRaw)
        : null;
    const proteinBasis = Math.min(currentWeight, goalWeight ?? currentWeight);
    const minProtein = Math.round(proteinBasis * 0.8);

    const dailyTotals = new Map<string, number>();
    for (const row of macroLogsRes.data ?? []) {
      const date = String(row.log_date ?? '');
      const cals = Number(row.calories ?? 0);
      if (!date || !Number.isFinite(cals) || cals <= 0) continue;
      dailyTotals.set(date, (dailyTotals.get(date) ?? 0) + cals);
    }
    const daysWithLogs = dailyTotals.size;
    const totalLoggedCalories = [...dailyTotals.values()].reduce((s, v) => s + v, 0);
    const avgDailyCalories = daysWithLogs > 0
      ? Math.round(totalLoggedCalories / daysWithLogs)
      : 0;

    let intakeContextLine = '';
    if (daysWithLogs >= 4) {
      intakeContextLine =
        `\nLogged intake: avg ${avgDailyCalories} kcal/day across ${daysWithLogs} of 14 days`;
      console.log('[adjust-macros] intake context:', {
        avgDailyCalories,
        daysWithLogs,
        windowDays: 14,
      });
    } else {
      console.log('[adjust-macros] intake context omitted:', {
        daysWithLogs,
        reason: 'fewer than 4 days with meal logs',
      });
    }

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: `You are Jordan, an expert nutrition coach. A user's weight trend data shows they need a macro adjustment. Recommend a specific calorie and macro change. Be conservative — never recommend more than 200 calories change in a single week. Always explain the reasoning in Jordan's direct, data-driven voice.

Rules:
- Calorie adjustment must be between -200 and +200
- Protein must never go below ${minProtein}g (0.8g per lb bodyweight, goal-aware basis)
- Round calories to the nearest 50
- Round all macro grams to the nearest 5
- If logged intake is meaningfully below the current calorie target and progress is slower than target, do NOT reduce calories. Keep targets unchanged and set adjustmentType to "adherence_check" with reasoning that addresses consistency.
- Never use em-dashes in reasoning

Return ONLY valid JSON:
{
  "calorieAdjustment": number,
  "newCaloriesTarget": number,
  "newProteinG": number,
  "newCarbsG": number,
  "newFatsG": number,
  "reasoning": "2-3 sentences",
  "adjustmentType": "increase" | "decrease" | "adherence_check"
}`,
        messages: [
          {
            role: 'user',
            content: `Recommend a macro adjustment based on this data:

Current macros:
- Calories: ${currentCalories}
- Protein: ${currentProtein}g
- Carbs: ${currentCarbs}g
- Fats: ${currentFats}g

Weight trend:
- Weekly change: ${weeklyChange} lbs/week
- Target rate: ${targetRate} lbs/week (goal: ${goalType})
- Delta: ${delta} lbs/week
- Current weight: ${currentWeight} lbs
- Baseline weight: ${baselineWeight} lbs${intakeContextLine}

Return ONLY the JSON object.`,
          },
        ],
      }),
    });

    const claudeData = await claudeResponse.json();

    if (!claudeResponse.ok) {
      throw new Error(`Claude API error: ${claudeData.error?.message ?? 'unknown'}`);
    }

    const text: string = claudeData.content?.[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    let adjustment: {
      calorieAdjustment: number;
      newCaloriesTarget: number;
      newProteinG: number;
      newCarbsG: number;
      newFatsG: number;
      reasoning: string;
      adjustmentType: AdjustmentType;
    };

    try {
      adjustment = JSON.parse(jsonMatch[0]);
    } catch (e) {
      throw new Error('JSON parse failed: ' + String(e));
    }

    if (adjustment.adjustmentType === 'adherence_check') {
      return new Response(
        JSON.stringify({
          status: 'adherence_check',
          weeklyChange,
          targetRate,
          delta,
          adjustmentType: 'adherence_check',
          reasoning: adjustment.reasoning,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const clampedAdjustment = Math.max(-200, Math.min(200, adjustment.calorieAdjustment));
    const safeProtein = Math.max(adjustment.newProteinG, minProtein);

    const finalCalories = roundTo50(currentCalories + clampedAdjustment);
    const finalProtein = roundTo5(safeProtein);
    const finalFats = roundTo5(Math.max(adjustment.newFatsG, 0));
    const finalCarbs = roundTo5(
      Math.max(0, (finalCalories - finalProtein * 4 - finalFats * 9) / 4),
    );

    const { error: upsertError } = await supabase.from('macro_plans').upsert(
      {
        user_id: userId,
        plan_id: planId,
        week_number: weekNumber,
        calories_target: finalCalories,
        protein_g: finalProtein,
        carbs_g: finalCarbs,
        fats_g: finalFats,
        adjusted_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,plan_id,week_number' },
    );

    if (upsertError) {
      console.error('macro_plans upsert error:', upsertError);
    }

    return new Response(
      JSON.stringify({
        status: 'adjusted',
        weeklyChange,
        targetRate,
        delta,
        calorieAdjustment: clampedAdjustment,
        newCaloriesTarget: finalCalories,
        newProteinG: finalProtein,
        newCarbsG: finalCarbs,
        newFatsG: finalFats,
        adjustmentType: adjustment.adjustmentType,
        reasoning: adjustment.reasoning,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('adjust-macros error:', String(error));
    return new Response(
      JSON.stringify({ status: 'error', error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});

// DEPLOY:
// supabase functions deploy adjust-macros

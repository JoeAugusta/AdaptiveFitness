import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logAiUsageFromAnthropicBody } from '../_shared/aiUsage.ts';
import { requireAuth } from '../_shared/auth.ts';
import { requireProUser } from '../_shared/entitlement.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type MealName = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
type CalorieDirection = 'deficit' | 'surplus' | 'maintenance';

interface MealItem {
  name: MealName;
  title: string;
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
}

interface MealSuggestionsPayload {
  meals: MealItem[];
  dailyTotals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
  };
  jordanNote: string;
}

interface WeightGoalContext {
  calorieDirection: CalorieDirection;
  targetWeightLbs: number | null;
  currentWeightLbs: number;
  weightDeltaLbs: number;
}

const EXPECTED_MEAL_NAMES: MealName[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

function isMealName(s: string): s is MealName {
  return EXPECTED_MEAL_NAMES.includes(s as MealName);
}

function validateSuggestions(
  parsed: unknown,
  caloriesTarget: number,
): parsed is MealSuggestionsPayload {
  if (!parsed || typeof parsed !== 'object') return false;
  const o = parsed as Record<string, unknown>;
  if (!Array.isArray(o.meals) || o.meals.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const m = o.meals[i];
    if (!m || typeof m !== 'object') return false;
    const row = m as Record<string, unknown>;
    if (typeof row.name !== 'string' || !isMealName(row.name)) return false;
    if (row.name !== EXPECTED_MEAL_NAMES[i]) return false;
    if (typeof row.title !== 'string' || typeof row.description !== 'string') return false;
    if (typeof row.calories !== 'number' || typeof row.protein_g !== 'number') return false;
    if (typeof row.carbs_g !== 'number' || typeof row.fats_g !== 'number') return false;
  }
  const dt = o.dailyTotals;
  if (!dt || typeof dt !== 'object') return false;
  const d = dt as Record<string, unknown>;
  if (typeof d.calories !== 'number' || typeof d.protein_g !== 'number') return false;
  if (typeof d.carbs_g !== 'number' || typeof d.fats_g !== 'number') return false;
  if (Math.abs(d.calories - caloriesTarget) > 100) return false;
  if (typeof o.jordanNote !== 'string') return false;
  return true;
}

function parseCalorieDirectionFromPlan(
  planJson: Record<string, unknown> | null,
): CalorieDirection | null {
  const v = planJson?.calorieDirection;
  if (v === 'deficit' || v === 'surplus' || v === 'maintenance') return v;
  return null;
}

function parsePositiveNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveTargetWeightLbs(
  macroPlan: { target_weight_lbs?: number | null },
  goal: {
    target_weight_lbs?: number | null;
    starting_weight_lbs?: number | null;
  } | null,
  planJson: Record<string, unknown> | null,
): number | null {
  const fromMacro = parsePositiveNumber(macroPlan.target_weight_lbs);
  if (fromMacro != null) return fromMacro;

  const fromGoal = parsePositiveNumber(goal?.target_weight_lbs);
  if (fromGoal != null) return fromGoal;

  if (planJson) {
    for (const key of ['goalTargetWeight', 'targetWeightLbs', 'target_weight_lbs']) {
      const n = parsePositiveNumber(planJson[key]);
      if (n != null) return n;
    }
  }

  return null;
}

function buildWeightGoalContext(
  currentWeightLbs: number,
  targetWeightLbs: number | null,
  planJson: Record<string, unknown> | null,
): WeightGoalContext {
  const effectiveTarget = targetWeightLbs ?? currentWeightLbs;
  const weightDeltaLbs = effectiveTarget - currentWeightLbs;
  const calorieDirection =
    parseCalorieDirectionFromPlan(planJson) ??
    (weightDeltaLbs < -2
      ? 'deficit'
      : weightDeltaLbs > 2
      ? 'surplus'
      : 'maintenance');

  return {
    calorieDirection,
    targetWeightLbs: targetWeightLbs,
    currentWeightLbs,
    weightDeltaLbs,
  };
}

function buildCalorieDirectionSystemBlock(
  calorieDirection: CalorieDirection,
): string {
  const directionGuidance =
    calorieDirection === 'deficit'
      ? 'Prioritize protein in every meal to protect lean mass. Keep meals satisfying despite the calorie restriction. Never suggest meals that dramatically undercut the daily target.'
      : calorieDirection === 'surplus'
      ? 'Meals should support muscle building. Include carbohydrates around training windows. Do not suggest low-calorie meals that undercut the surplus target.'
      : 'Focus on food quality and consistency. Protein remains the priority at every meal.';

  return `The user is currently in a calorie ${calorieDirection}.

${directionGuidance}

IMPORTANT: The daily calorie target shown is the BASE target from lifting days only. On days when the user logs additional sport activity, their target increases automatically. Meals are planned to the base target. Additional sport calories are handled separately.`;
}

function buildWeightGoalSystemBlock(ctx: WeightGoalContext): string {
  const { currentWeightLbs, targetWeightLbs, weightDeltaLbs } = ctx;
  const targetLine =
    targetWeightLbs != null &&
    Math.abs(targetWeightLbs - currentWeightLbs) > 0.5
      ? `Target weight: ${targetWeightLbs} lbs (${weightDeltaLbs > 0 ? 'gaining' : 'losing'} ${Math.abs(Math.round(weightDeltaLbs))} lbs).`
      : 'Maintaining current weight.';

  return `Current weight: ${currentWeightLbs} lbs.
${targetLine}`;
}

function buildMealSystemPrompt(
  weightCtx: WeightGoalContext,
): string {
  return `You are Jordan, a nutrition coach. Generate a set of daily meal suggestions calibrated exactly to the user's macro targets.
The four meals (Breakfast, Lunch, Dinner, Snack) must sum to within 50 calories of the daily target and within 10g of the protein target. Be specific — real food names, real portions.
Never suggest anything containing the user's allergens.
Respect their dietary style strictly.

${buildCalorieDirectionSystemBlock(weightCtx.calorieDirection)}

${buildWeightGoalSystemBlock(weightCtx)}

jordanNote rules (strict — follow precisely):
- Maximum 2 sentences. Hard limit.
- Voice: first person as Jordan, coach not chatbot.
  Never "AI", never "crush it", never "Keep it up",
  never "You've got this", never "Great choice".
- ALWAYS reference at least one specific number from
  the user's actual macro targets or meal data.
  Bad: "Protein is prioritised to support your training."
  Good: "I've anchored each meal around protein — you
  need 175g today and this plan hits it exactly."
- Lead with the coaching reason, not the number.
  Bad: "Protein is 175g today."
  Good: "Training day nutrition — I've kept carbs higher
  to fuel your session, which puts them at 380g today."
- If meals hit all targets cleanly: explain the food
  philosophy in 1-2 sentences. What does this meal
  pattern actually do for the user's specific goal?
  Reference their goal (strength/fat_loss/hypertrophy etc)
  if it influences the food choices.
- Align meal philosophy with their calorie ${weightCtx.calorieDirection} and weight goal context above.
- If meals deviate from targets: lead with the coaching
  reason FIRST, then the number.
- Never use em-dashes (—). Use periods or commas instead.
- Never mention specific gram amounts that differ from
  the user's stated targets unless the coaching reason
  comes first.
- If day_type is "training day": mention carb timing
  around the training session in jordanNote.
- If day_type is "rest day": mention that carbs are
  lower today and protein stays the same.

Return ONLY valid JSON — no markdown, no prose:
{
  "meals": [
    {
      "name": "Breakfast" | "Lunch" | "Dinner" | "Snack",
      "title": string,
      "description": string,
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fats_g": number
    }
  ],
  "dailyTotals": {
    "calories": number,
    "protein_g": number,
    "carbs_g": number,
    "fats_g": number
  },
  "jordanNote": string
}

The meals array must contain exactly four items in this order: Breakfast, Lunch, Dinner, Snack.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authResult = await requireAuth(req, { corsHeaders });
  if ('errorResponse' in authResult) return authResult.errorResponse;
  const userId = authResult.user!.id;

  try {
    const { goalType: goalTypeBody, isTrainingDay: isTrainingDayBody } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const isPro = await requireProUser(supabase, userId);
    if (!isPro) {
      return new Response(
        JSON.stringify({ status: 'pro_required', message: 'Subscribe to use coaching features' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const [macroRes, profileRes, goalRes, planRes] = await Promise.all([
      supabase
        .from('macro_plans')
        .select('calories_target, protein_g, carbs_g, fats_g, target_weight_lbs')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('user_profiles')
        .select('dietary_style, food_allergies, weight_lbs')
        .eq('user_id', userId)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('goals')
        .select('goal_type, target_weight_lbs, starting_weight_lbs')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('plans')
        .select('plan_json')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const macroPlan = macroRes.data;
    if (!macroPlan) {
      return new Response(
        JSON.stringify({ error: 'No macro plan found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const dailyCalories = Number(macroPlan.calories_target);
    console.log('[MEALS CALORIE SOURCE]', {
      macroPlansTarget: macroPlan?.calories_target,
      usingValue: dailyCalories,
    });

    if (!Number.isFinite(dailyCalories) || dailyCalories <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid macro plan calorie target' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const proteinG = Number(macroPlan.protein_g);
    const carbsG = Number(macroPlan.carbs_g);
    const fatsG = Number(macroPlan.fats_g);

    const profile = profileRes.data;
    const dietaryStyle = profile?.dietary_style ?? 'omnivore';
    const foodAllergies = Array.isArray(profile?.food_allergies)
      ? (profile!.food_allergies as string[])
      : [];

    const currentWeightLbs =
      profile?.weight_lbs != null && Number(profile.weight_lbs) > 0
        ? Number(profile.weight_lbs)
        : goalRes.data?.starting_weight_lbs != null
        ? Number(goalRes.data.starting_weight_lbs)
        : 0;

    const planJson =
      planRes.data?.plan_json && typeof planRes.data.plan_json === 'object'
        ? (planRes.data.plan_json as Record<string, unknown>)
        : null;

    const targetWeightLbs = resolveTargetWeightLbs(
      macroPlan,
      goalRes.data,
      planJson,
    );

    const weightCtx = buildWeightGoalContext(
      currentWeightLbs > 0 ? currentWeightLbs : 170,
      targetWeightLbs,
      planJson,
    );

    const goalType =
      (typeof goalTypeBody === 'string' && goalTypeBody.trim() !== ''
        ? goalTypeBody.trim()
        : null) ??
      (goalRes.data?.goal_type as string | undefined) ??
      'general fitness';
    const isTrainingDay = isTrainingDayBody === true;
    const dayType = isTrainingDay ? 'training day' : 'rest day';

    const systemPrompt = buildMealSystemPrompt(weightCtx);

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Generate today's meal plan for this athlete.

Macro targets:
- calories_target: ${dailyCalories}
- protein_g: ${proteinG}
- carbs_g: ${carbsG}
- fats_g: ${fatsG}

Weight goal context:
- calorieDirection: ${weightCtx.calorieDirection}
- currentWeightLbs: ${weightCtx.currentWeightLbs}
- targetWeightLbs: ${weightCtx.targetWeightLbs ?? 'null (maintaining)'}
- weightDeltaLbs: ${weightCtx.weightDeltaLbs}

Profile:
- dietary_style: ${dietaryStyle}
- food_allergies: ${JSON.stringify(foodAllergies)}
- weight_lbs: ${currentWeightLbs > 0 ? currentWeightLbs : 'unknown'}
- goal: ${goalType}
- day_type: ${dayType}

Return ONLY the JSON object.`,
          },
        ],
      }),
    });

    const claudeData = await claudeResponse.json();

    if (!claudeResponse.ok) {
      console.error('Claude API error:', claudeData);
      return new Response(
        JSON.stringify({ error: 'Generation failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      );
    }

    await logAiUsageFromAnthropicBody(supabase, {
      userId,
      functionName: 'generate-meals',
      model: 'claude-sonnet-4-6',
      body: claudeData,
    });

    const text: string = claudeData.content?.[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ error: 'Generation failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Generation failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      );
    }

    if (!validateSuggestions(parsed, dailyCalories)) {
      return new Response(
        JSON.stringify({ error: 'Generation failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      );
    }

    const suggestions = parsed as MealSuggestionsPayload;

    const { error: upsertError } = await supabase.from('meal_suggestions').upsert(
      {
        user_id: userId,
        suggestions_json: suggestions,
        calories_target: dailyCalories,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (upsertError) {
      console.error('meal_suggestions upsert error:', upsertError);
      return new Response(
        JSON.stringify({ error: 'Generation failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      );
    }

    return new Response(
      JSON.stringify({ status: 'success', suggestions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('generate-meals error:', String(error));
    return new Response(
      JSON.stringify({ error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});

// DEPLOY:
// supabase functions deploy generate-meals --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type MealName = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: userId' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const [macroRes, profileRes] = await Promise.all([
      supabase
        .from('macro_plans')
        .select('calories_target, protein_g, carbs_g, fats_g')
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
    ]);

    const macroPlan = macroRes.data;
    if (!macroPlan) {
      return new Response(
        JSON.stringify({ error: 'No macro plan found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const caloriesTarget = Number(macroPlan.calories_target);
    const proteinG = Number(macroPlan.protein_g);
    const carbsG = Number(macroPlan.carbs_g);
    const fatsG = Number(macroPlan.fats_g);

    const profile = profileRes.data;
    const dietaryStyle = profile?.dietary_style ?? 'omnivore';
    const foodAllergies = Array.isArray(profile?.food_allergies)
      ? (profile!.food_allergies as string[])
      : [];
    const weightLbs = profile?.weight_lbs != null ? Number(profile.weight_lbs) : null;

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
        system: `You are Jordan, a nutrition coach. Generate a set of daily meal suggestions calibrated exactly to the user's macro targets.
The four meals (Breakfast, Lunch, Dinner, Snack) must sum to within 50 calories of the daily target and within 10g of the protein target. Be specific — real food names, real portions.
Never suggest anything containing the user's allergens.
Respect their dietary style strictly.

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

The meals array must contain exactly four items in this order: Breakfast, Lunch, Dinner, Snack.`,
        messages: [
          {
            role: 'user',
            content: `Generate today's meal plan for this athlete.

Macro targets:
- calories_target: ${caloriesTarget}
- protein_g: ${proteinG}
- carbs_g: ${carbsG}
- fats_g: ${fatsG}

Profile:
- dietary_style: ${dietaryStyle}
- food_allergies: ${JSON.stringify(foodAllergies)}
- weight_lbs: ${weightLbs ?? 'unknown'}

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

    if (!validateSuggestions(parsed, caloriesTarget)) {
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
        calories_target: caloriesTarget,
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
// supabase functions deploy generate-meals
// JWT verification: DISABLED in Supabase Dashboard

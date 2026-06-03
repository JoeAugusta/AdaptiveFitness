// SETUP: supabase secrets set ANTHROPIC_API_KEY=your_key_here
// DEPLOY: supabase functions deploy analyze-progress-photo --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchAnthropicMessagesWithRetry } from '../_shared/anthropicRetry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATE_DAYS = 28;
const MIN_CALORIES = 1200;
const MAX_CALORIES = 5500;

const PACE_ADJUSTMENTS: Record<string, Record<string, number>> = {
  fat_loss: { conservative: -250, balanced: -400, aggressive: -600 },
  hypertrophy: { conservative: 200, balanced: 300, aggressive: 500 },
};

const VISION_SYSTEM = `You are Jordan, a professional fitness coach analyzing a client's
monthly progress photo for body composition assessment.
Your role is to estimate lean mass and body composition to calibrate
nutrition targets — not to judge appearance.

CRITICAL RULES:
- Frame everything as progress vs their previous self, never vs an
  external standard or ideal body type
- Never use phrases like "you need to lose" or "you should be"
- Never estimate an exact body fat percentage — always give a range
  (e.g. "15-18%")
- Assess each of the following when visible in the photos:
UPPER BODY: shoulder development and roundness, arm size
(bicep/tricep), chest thickness and definition, back
width and thickness (from side/back photos)
MIDSECTION: waist taper, abdominal visibility, oblique
definition
LOWER BODY: quad sweep and separation, hamstring
development, glute fullness and shape, calf development
OVERALL: symmetry between left/right, upper/lower
body balance, postural alignment

When a body region is not visible in any photo, do not
comment on it. When it is visible, be specific about
what training adaptations are apparent.
- Never comment negatively on any body part
- Keep coaching note to 3 sentences maximum
- Never use em-dashes. Never use "AI". Never say "crush it".
- If you cannot make a reliable estimate from the photo quality,
  say so honestly and do not guess

When comparing photos:
- Be specific about visible changes (fuller shoulders, more defined arms, leaner midsection)
- Note which muscle groups show the most development
- Keep observations objective and coaching-focused
- Reference the time period between photos when known
- If changes are subtle or not clearly visible, say so honestly

Return ONLY valid JSON:
{
  "estimatedBfRange": "14-17%",
  "estimatedBfMidpoint": 15.5,
  "estimatedLeanMassLbs": 148,
  "visibleChanges": "Brief description of what's visible",
  "jordanNote": "Coaching note max 3 sentences",
  "confidenceLevel": "high" | "medium" | "low",
  "macroRecommendation": {
    "adjust": true | false,
    "reason": "Why adjustment is recommended",
    "suggestedCalories": 3200
  }
}`;

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:image\/[a-z+]+;base64,/i, '').trim();
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getActivityMultiplier(daysPerWeek: number): number {
  if (daysPerWeek <= 2) return 1.375;
  if (daysPerWeek <= 4) return 1.55;
  if (daysPerWeek <= 6) return 1.725;
  return 1.9;
}

function getGoalAdjustment(goal: string): number {
  switch (goal) {
    case 'strength':
    case 'power_hypertrophy':
      return 200;
    case 'hypertrophy':
      return 300;
    case 'fat_loss':
      return -400;
    default:
      return 0;
  }
}

function getPaceAdjustment(goal: string, caloriePace: string): number {
  const paceMap = PACE_ADJUSTMENTS[goal];
  if (paceMap) {
    return paceMap[caloriePace] ?? getGoalAdjustment(goal);
  }
  return getGoalAdjustment(goal);
}

function roundTo50(n: number): number {
  return Math.round(n / 50) * 50;
}

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

function calcMacrosFromCalories(
  calories: number,
  weightLbs: number,
  goal: string,
): { proteinG: number; carbsG: number; fatsG: number } {
  const proteinMultiplier = goal === 'fat_loss' ? 0.8 : 1.0;
  const proteinG = roundTo5(weightLbs * proteinMultiplier);
  const fatsG = Math.max(50, roundTo5((calories * 0.25) / 9));
  const remainingCals = calories - proteinG * 4 - fatsG * 9;
  const carbsG = roundTo5(remainingCals / 4);
  return { proteinG, carbsG, fatsG };
}

function caloriesFromLeanMass(
  leanMassLbs: number,
  daysPerWeek: number,
  goal: string,
  caloriePace: string,
): number {
  const leanMassKg = leanMassLbs * 0.453592;
  const bmr = 370 + 21.6 * leanMassKg;
  const tdee = bmr * getActivityMultiplier(daysPerWeek);
  const adjusted = tdee + getPaceAdjustment(goal, caloriePace);
  return Math.max(MIN_CALORIES, Math.min(MAX_CALORIES, roundTo50(adjusted)));
}

function parseVisionJson(text: string): Record<string, unknown> {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in vision response');
  return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
}

function addGateDays(iso: string | null): string {
  const base = iso ? new Date(iso) : new Date();
  const next = new Date(base.getTime());
  next.setDate(next.getDate() + GATE_DAYS);
  return next.toISOString();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      userId,
      planId,
      weekNumber,
      photoBase64Front,
      photoBase64Side,
      photoBase64Back,
    } = body as {
      userId?: string;
      planId?: string;
      weekNumber?: number;
      photoBase64Front?: string;
      photoBase64Side?: string;
      photoBase64Back?: string;
    };

    if (!userId || !photoBase64Front) {
      return new Response(
        JSON.stringify({ error: 'Missing userId or photoBase64Front' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const [profileRes, goalRes, macroRes, baselineRes] = await Promise.all([
      supabase
        .from('user_profiles')
        .select(
          'weight_lbs, height_ft, height_in, age, sex, body_fat_pct, last_photo_analysis_at, training_days',
        )
        .eq('user_id', userId)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('goals')
        .select('goal_type')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('macro_plans')
        .select('id, goal_id, calories_target, protein_g, carbs_g, fats_g, calorie_pace')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('progress_photos')
        .select('id')
        .eq('user_id', userId)
        .limit(1),
    ]);

    const profile = profileRes.data;
    const goalType = (goalRes.data?.goal_type as string) ?? 'general';
    const macroPlan = macroRes.data;
    const hasBaseline = (baselineRes.data?.length ?? 0) > 0;

    // Fetch most recent prior photo for comparison
    const priorPhotoRes = hasBaseline
      ? await supabase
          .from('progress_photos')
          .select('photo_url_front, analyzed_at, estimated_bf_range')
          .eq('user_id', userId)
          .order('analyzed_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    const priorPhoto = priorPhotoRes.data;

    let priorPhotoBase64: string | null = null;
    if (priorPhoto?.photo_url_front) {
      const { data: priorBytes } = await supabase.storage
        .from('progress-photos')
        .download(priorPhoto.photo_url_front);
      if (priorBytes) {
        const arrayBuffer = await priorBytes.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        let binary = '';
        uint8.forEach((b) => {
          binary += String.fromCharCode(b);
        });
        priorPhotoBase64 = btoa(binary);
      }
    }

    const lastAt = profile?.last_photo_analysis_at as string | null;
    if (lastAt) {
      const last = new Date(lastAt);
      const gateEnd = new Date(last.getTime());
      gateEnd.setDate(gateEnd.getDate() + GATE_DAYS);
      if (Date.now() < gateEnd.getTime()) {
        return new Response(
          JSON.stringify({
            status: 'rate_limited',
            nextAvailableAt: gateEnd.toISOString(),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const weightLbs = Number(profile?.weight_lbs ?? 0);
    const heightFt = Number(profile?.height_ft ?? 5);
    const heightIn = Number(profile?.height_in ?? 10);
    const age = Number(profile?.age ?? 30);
    const sex = String(profile?.sex ?? 'male');
    const trainingDays = Array.isArray(profile?.training_days)
      ? (profile.training_days as string[]).length
      : 4;
    const daysPerWeek = Math.max(1, Math.min(7, trainingDays));
    const onboardingBfPct = profile?.body_fat_pct;

    const userContent: Array<Record<string, unknown>> = [];

    // Add prior photo first if available (baseline for comparison)
    if (priorPhotoBase64 && priorPhoto) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: priorPhotoBase64,
        },
      });
      userContent.push({
        type: 'text',
        text: `BASELINE PHOTO (taken ${new Date(priorPhoto.analyzed_at).toLocaleDateString()}, estimated ${priorPhoto.estimated_bf_range ?? 'unknown'} body fat):`,
      });
    }

    // Current photo
    userContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: photoBase64Front.replace(/^data:image\/[a-z+]+;base64,/i, ''),
      },
    });

    if (photoBase64Side) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: photoBase64Side.replace(/^data:image\/[a-z+]+;base64,/i, ''),
        },
      });
    }

    if (photoBase64Back) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: photoBase64Back.replace(/^data:image\/[a-z+]+;base64,/i, ''),
        },
      });
      userContent.push({
        type: 'text',
        text:
          'BACK VIEW PHOTO (shows posterior chain, glutes, hamstrings, back development):',
      });
    }

    const comparisonNote = priorPhotoBase64
      ? `This is a progress check-in. The FIRST image is their baseline photo from ${new Date(priorPhoto!.analyzed_at).toLocaleDateString()}. The following images are their current check-in (front${photoBase64Side ? ', side' : ''}${photoBase64Back ? ', back' : ''}). Compare baseline to current and note specific visible changes across all visible body regions. Be specific (e.g. shoulders look fuller, quads show more separation, midsection appears leaner).`
      : 'This is their baseline photo. Assess current composition only across all visible body regions.';

    const backPhotoNote = photoBase64Back
      ? ' A back-view photo is included — use it to assess lat width, rear delts, glutes, and hamstrings.'
      : '';

    userContent.push({
      type: 'text',
      text: `Analyze this client's body composition for nutrition calibration.

Client stats:
- Weight: ${weightLbs} lbs
- Height: ${heightFt}'${heightIn}"
- Sex: ${sex}
- Age: ${age}
- Goal: ${goalType}
- Training: ${daysPerWeek} days/week
- Current estimated body fat (self-reported at onboarding): ${onboardingBfPct ?? 'not provided'}%

${comparisonNote}${backPhotoNote}

Return ONLY the JSON object.`,
    });

    const visionResponse = await fetchAnthropicMessagesWithRetry(() =>
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 800,
          system: VISION_SYSTEM,
          messages: [{ role: 'user', content: userContent }],
        }),
      }),
    );

    const visionData = await visionResponse.json();
    if (!visionResponse.ok) {
      throw new Error(
        `Vision API error: ${(visionData as { error?: { message?: string } }).error?.message ?? visionResponse.status}`,
      );
    }

    const visionText: string = visionData.content?.[0]?.text ?? '';
    const analysis = parseVisionJson(visionText) as {
      estimatedBfRange?: string;
      estimatedBfMidpoint?: number;
      estimatedLeanMassLbs?: number;
      visibleChanges?: string;
      jordanNote?: string;
      confidenceLevel?: string;
      macroRecommendation?: {
        adjust?: boolean;
        reason?: string;
        suggestedCalories?: number;
      };
    };

    const ts = Date.now();
    const frontPath = `${userId}/${ts}_front.jpg`;
    const frontBytes = base64ToBytes(photoBase64Front);
    const { error: frontUploadErr } = await supabase.storage
      .from('progress-photos')
      .upload(frontPath, frontBytes, {
        contentType: 'image/jpeg',
        upsert: false,
      });
    if (frontUploadErr) {
      throw new Error(`Front upload failed: ${frontUploadErr.message}`);
    }

    let sidePath: string | null = null;
    if (photoBase64Side) {
      sidePath = `${userId}/${ts}_side.jpg`;
      const sideBytes = base64ToBytes(photoBase64Side);
      const { error: sideUploadErr } = await supabase.storage
        .from('progress-photos')
        .upload(sidePath, sideBytes, {
          contentType: 'image/jpeg',
          upsert: false,
        });
      if (sideUploadErr) {
        console.warn('Side upload failed:', sideUploadErr.message);
        sidePath = null;
      }
    }

    let backPath: string | null = null;
    if (photoBase64Back) {
      backPath = `${userId}/${ts}_back.jpg`;
      const backBytes = base64ToBytes(photoBase64Back);
      const { error: backUploadErr } = await supabase.storage
        .from('progress-photos')
        .upload(backPath, backBytes, {
          contentType: 'image/jpeg',
          upsert: false,
        });
      if (backUploadErr) {
        console.warn('Back upload failed:', backUploadErr.message);
        backPath = null;
      }
    }

    const leanMassLbs = Number(analysis.estimatedLeanMassLbs ?? 0);
    const bfMid = Number(analysis.estimatedBfMidpoint ?? 0);
    const nowIso = new Date().toISOString();

    let macroAdjusted = false;
    let previousCalories: number | null = null;
    let newCalories: number | null = null;
    let newProteinG: number | null = null;
    let newCarbsG: number | null = null;
    let newFatsG: number | null = null;

    const macroRec = analysis.macroRecommendation;
    const currentCalories = Number(macroPlan?.calories_target ?? 0);
    const caloriePace = String(macroPlan?.calorie_pace ?? 'balanced');

    if (macroRec?.adjust === true && leanMassLbs > 0 && macroPlan?.id) {
      const katchCalories = caloriesFromLeanMass(
        leanMassLbs,
        daysPerWeek,
        goalType,
        caloriePace,
      );
      const targetCalories = katchCalories;

      if (Math.abs(targetCalories - currentCalories) > 100) {
        const macros = calcMacrosFromCalories(
          targetCalories,
          weightLbs,
          goalType,
        );
        const { error: macroInsertErr } = await supabase.from('macro_plans').insert({
          user_id: userId,
          goal_id: macroPlan.goal_id ?? null,
          calories_target: targetCalories,
          protein_g: macros.proteinG,
          carbs_g: macros.carbsG,
          fats_g: macros.fatsG,
          calorie_pace: caloriePace,
        });
        if (!macroInsertErr) {
          macroAdjusted = true;
          previousCalories = currentCalories;
          newCalories = targetCalories;
          newProteinG = macros.proteinG;
          newCarbsG = macros.carbsG;
          newFatsG = macros.fatsG;
        }
      }
    }

    const { data: photoRow, error: photoInsertErr } = await supabase
      .from('progress_photos')
      .insert({
        user_id: userId,
        plan_id: planId ?? null,
        week_number: weekNumber ?? null,
        photo_url_front: frontPath,
        photo_url_side: sidePath,
        analyzed_at: nowIso,
        estimated_bf_pct: bfMid > 0 ? bfMid : null,
        estimated_bf_range: analysis.estimatedBfRange ?? null,
        lean_mass_lbs: leanMassLbs > 0 ? leanMassLbs : null,
        analysis_json: {
          ...analysis,
          photoUrls: {
            front: frontPath,
            side: sidePath ?? null,
            back: backPath ?? null,
          },
        },
        macro_adjusted: macroAdjusted,
      })
      .select('id')
      .single();

    if (photoInsertErr) {
      throw new Error(`progress_photos insert failed: ${photoInsertErr.message}`);
    }

    await supabase
      .from('user_profiles')
      .update({ last_photo_analysis_at: nowIso })
      .eq('user_id', userId);

    const nextAvailableAt = addGateDays(nowIso);

    return new Response(
      JSON.stringify({
        status: 'success',
        photoId: photoRow?.id,
        estimatedBfRange: analysis.estimatedBfRange,
        estimatedBfMidpoint: bfMid > 0 ? bfMid : null,
        estimatedLeanMassLbs: leanMassLbs > 0 ? leanMassLbs : null,
        visibleChanges: analysis.visibleChanges,
        jordanNote: analysis.jordanNote,
        confidenceLevel: analysis.confidenceLevel,
        macroAdjusted,
        previousCalories,
        newCalories,
        newProteinG,
        newCarbsG,
        newFatsG,
        macroReason: macroRec?.reason ?? null,
        nextAvailableAt,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('analyze-progress-photo error:', String(error));
    return new Response(
      JSON.stringify({ status: 'error', error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});

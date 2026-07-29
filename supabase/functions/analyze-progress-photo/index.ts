// SETUP: supabase secrets set ANTHROPIC_API_KEY=your_key_here
// DEPLOY: supabase functions deploy analyze-progress-photo --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchAnthropicMessagesWithRetry } from '../_shared/anthropicRetry.ts';
import { logAiUsageFromAnthropicBody } from '../_shared/aiUsage.ts';
import { requireAuth } from '../_shared/auth.ts';
import { requireProUser } from '../_shared/entitlement.ts';
import { requirePlanOwnership } from '../_shared/planOwnership.ts';

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
- Always communicate body fat estimates as visual approximations with
  inherent uncertainty of ±2-3%. Never present estimates as measurements.
  When stating a range, use: "Estimated range: X-Y% (visual estimate, ±2-3%)"
- In estimatedBfRange, jordanNote, and visibleChanges, never use
  definitive body fat language — always include the visual-estimate caveat
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

Each photo is labeled with its view angle and what body
regions are visible. Trust the labels — if a photo is
labeled as a full body front view, assess all visible
regions including lower body (quads, hamstrings, calves).
Only skip a body region if it is genuinely obscured or
cropped out of frame. Do not assume a region is not
visible without clear evidence it is absent from the image.
When it is visible, be specific about
what training adaptations are apparent.
- Never comment negatively on any body part
- Keep coaching note to 3 sentences maximum
- Never use em-dashes. Never use "AI". Never say "crush it".
- If you cannot make a reliable estimate from the photo quality,
  say so honestly and do not guess

CRITICAL ANALYSIS ORDER — follow exactly:

Step 1: Analyze ONLY the current photo(s).
Estimate body fat percentage based solely on what you see in the image.
Do NOT reference prior check-in estimates yet. Do not anchor to previous values.

Key indicators to weight heavily:
- Waist circumference relative to shoulders
- Abdominal fat accumulation and definition
- Love handle presence and thickness
- Chest softness vs muscle definition
- Overall torso shape and fat distribution

Do NOT overweight:
- Arm size (muscular arms exist at high BF%)
- Shoulder width (frame-based, not BF indicator)
- Overall muscularity (muscular ≠ lean)

Step 2: AFTER locking the BF estimate from Step 1, calculate lean mass using the weight provided.

Step 3: ONLY THEN compare to prior check-ins to assess progress direction.

The historical context must NEVER change the BF estimate from Step 1.
It can only inform the progress narrative.

When comparing photos:
- First classify the PRIMARY visual change as one of:
  A) Fat loss dominant (>60% of change is fat loss)
  B) Muscle gain dominant (>60% of change is muscle)
  C) True recomposition (roughly equal fat/muscle)
  D) Maintenance (minimal change)
- Then write the analysis narrative around the dominant change category.
  Do not default to assuming recomposition — most users are either cutting
  or bulking, not doing both equally.
- Be specific about visible changes (fuller shoulders, more defined arms, leaner midsection)
- Note which muscle groups show the most development
- Keep observations objective and coaching-focused
- Reference the time period between photos when known
- If changes are subtle or not clearly visible, say so honestly
- When comparing two photos, explicitly distinguish between fat loss and
  muscle gain signals. Do not conflate "looking better" with "losing fat."
  If the user appears more muscular but at similar body fat, state that
  directly: "The primary change appears to be increased muscle fullness
  rather than fat loss, which is a positive recomposition signal."

Before returning results, validate internally:
lean_mass = weight × (1 - bf_pct / 100)

Check: does your BF% estimate produce the lean mass you stated?

If lean_mass_stated does NOT match weight × (1 - bf_midpoint / 100) within 5 lbs,
revise the BF% estimate until they are internally consistent.

Example:
Weight: 200 lbs, stated lean mass: 143 lbs
Implied BF: (200-143)/200 = 28.5%
If you wrote 16-20% BF, that is inconsistent. Revise to 26-30% BF.

Coaching tone:
- Never guarantee outcomes or timelines. Replace certainty phrasing like
  "expect X within 8-12 weeks" with hedged but actionable language:
  "If training and nutrition consistency hold, noticeable changes in X
  are likely within 8-12 weeks."

Return ONLY valid JSON:
{
  "estimatedBfRange": "14-17% (visual estimate, ±2-3%)",
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

function recalibrateCaloriesPreservingDirection(opts: {
  leanMassLbs: number;
  daysPerWeek: number;
  caloriePace: string;
  currentCalories: number;
  currentWeightLbs: number;
  goalTargetWeightLbs: number | null;
}): number {
  const {
    leanMassLbs,
    daysPerWeek,
    caloriePace,
    currentCalories,
    currentWeightLbs,
    goalTargetWeightLbs,
  } = opts;

  const leanMassKg = leanMassLbs * 0.453592;
  const bmr = 370 + 21.6 * leanMassKg;
  const newTdee = bmr * getActivityMultiplier(daysPerWeek);

  // Determine intended direction from weight goal when available
  const weightDelta =
    goalTargetWeightLbs != null && currentWeightLbs > 0
      ? goalTargetWeightLbs - currentWeightLbs
      : null;

  const intendedDeficit =
    weightDelta != null
      ? weightDelta < -2
      : currentCalories < newTdee - 50;

  const intendedSurplus =
    weightDelta != null
      ? weightDelta > 2
      : currentCalories > newTdee + 50;

  let adjustment: number;
  if (intendedDeficit) {
    const deficitMap: Record<string, number> = {
      conservative: -200,
      balanced: -300,
      aggressive: -500,
    };
    adjustment = deficitMap[caloriePace] ?? -300;
  } else if (intendedSurplus) {
    const surplusMap: Record<string, number> = {
      conservative: 150,
      balanced: 250,
      aggressive: 400,
    };
    adjustment = surplusMap[caloriePace] ?? 250;
  } else {
    adjustment = 0;
  }

  return Math.max(MIN_CALORIES, Math.min(MAX_CALORIES, roundTo50(newTdee + adjustment)));
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

  const authResult = await requireAuth(req, { corsHeaders });
  if ('errorResponse' in authResult) return authResult.errorResponse;
  const userId = authResult.user!.id;

  try {
    const body = await req.json();
    const {
      planId,
      weekNumber,
      photoBase64Front,
      photoBase64Side,
      photoBase64Back,
      photoWeightLbs,
    } = body as {
      planId?: string;
      weekNumber?: number;
      photoBase64Front?: string;
      photoBase64Side?: string;
      photoBase64Back?: string;
      photoWeightLbs?: number;
    };

    if (!photoBase64Front) {
      return new Response(
        JSON.stringify({ error: 'Missing photoBase64Front' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

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

    if (planId) {
      const ownership = await requirePlanOwnership(supabase, planId, userId, corsHeaders, 'id, user_id');
      if ('errorResponse' in ownership) return ownership.errorResponse;
    }

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
        .select('goal_type, target_weight_lbs')
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
    const goalTargetWeightLbs = goalRes.data?.target_weight_lbs != null
      ? Number(goalRes.data.target_weight_lbs)
      : null;
    // currentWeightLbs for direction check comes from profile (already loaded above)
    // weightLbs = Number(profile?.weight_lbs ?? 0) — already declared below
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
    const photoWeight =
      photoWeightLbs != null && Number.isFinite(Number(photoWeightLbs)) &&
        Number(photoWeightLbs) > 0
        ? Number(photoWeightLbs)
        : null;
    const weightForLeanMass = photoWeight ?? weightLbs;
    const weightNote =
      photoWeight != null && photoWeight !== weightLbs
        ? `(Note: current weight is ${weightLbs} lbs — use photo weight for lean mass calculation)`
        : photoWeight == null
        ? '(Note: weight at time of photo was not provided — using current profile weight for lean mass calculation)'
        : '';
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

    // Current photo — label first so Claude knows what to expect
    userContent.push({
      type: 'text',
      text: priorPhotoBase64
        ? 'CURRENT CHECK-IN PHOTO — FRONT VIEW (full body visible including legs, quads, and lower body):'
        : 'CURRENT PHOTO — FRONT VIEW (full body visible including legs, quads, and lower body):',
    });
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
        type: 'text',
        text: 'CURRENT CHECK-IN PHOTO — SIDE VIEW (lateral profile, useful for assessing depth, posture, and midsection):',
      });
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
        type: 'text',
        text: 'CURRENT CHECK-IN PHOTO — BACK VIEW (posterior chain, glutes, hamstrings, back development):',
      });
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: photoBase64Back.replace(/^data:image\/[a-z+]+;base64,/i, ''),
        },
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
- Weight at time of photo: ${weightForLeanMass} lbs
  ${weightNote}
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

    await logAiUsageFromAnthropicBody(supabase, {
      userId,
      functionName: 'analyze-progress-photo',
      model: 'claude-sonnet-4-6',
      body: visionData,
    });

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
      const targetCalories = recalibrateCaloriesPreservingDirection({
        leanMassLbs,
        daysPerWeek,
        caloriePace,
        currentCalories,
        currentWeightLbs: weightLbs,
        goalTargetWeightLbs,
      });

      // Hard direction guard — backstop against any drift in the
      // recalibration math or unexpected Claude recommendations.
      const weightDelta =
        goalTargetWeightLbs != null && weightLbs > 0
          ? goalTargetWeightLbs - weightLbs
          : null;
      const wantsToLose = weightDelta != null && weightDelta < -2;
      const wantsToGain = weightDelta != null && weightDelta > 2;
      const caloricDelta = targetCalories - currentCalories;
      const directionViolation =
        (wantsToLose && caloricDelta > 0) ||
        (wantsToGain && caloricDelta < 0);

      if (Math.abs(targetCalories - currentCalories) > 100 && !directionViolation) {
        const macros = calcMacrosFromCalories(
          targetCalories,
          weightForLeanMass > 0 ? weightForLeanMass : weightLbs,
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

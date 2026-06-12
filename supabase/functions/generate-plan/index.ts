import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchAnthropicMessagesWithRetry } from '../_shared/anthropicRetry.ts';
import {
  enforceSetStructureExercise,
  finalizeStrengthGoalTargetLift,
} from '../_shared/setStructure.ts';
import {
  finalizeStrengthTargetLiftPeriodisationOnDays,
} from '../_shared/strengthTargetLiftPeriodisation.ts';
import { stampWeek1PyramidSetTargets } from '../_shared/week1PyramidSetTargets.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Match app `constants/betaBypass.ts` — flip both to false before launch. */
const BETA_BYPASS = true;
const RATE_LIMIT_ENABLED = !BETA_BYPASS;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type CalorieDirection = 'deficit' | 'surplus' | 'maintenance';

function calculateBMR(params: {
  weightLbs: number;
  heightFt: number;
  heightIn: number;
  age: number;
  sex: 'male' | 'female' | 'other';
  bodyFatPct?: number | null;
}): number {
  const weightKg = params.weightLbs * 0.453592;
  const heightCm = (params.heightFt * 12 + params.heightIn) * 2.54;

  if (
    params.bodyFatPct != null &&
    params.bodyFatPct > 0 &&
    params.bodyFatPct < 100
  ) {
    const leanMassKg = weightKg * (1 - params.bodyFatPct / 100);
    return 370 + 21.6 * leanMassKg;
  }

  const base = 10 * weightKg + 6.25 * heightCm - 5 * params.age;
  if (params.sex === 'male') return base + 5;
  if (params.sex === 'female') return base - 161;
  return base - 78;
}

function getActivityMultiplier(daysPerWeek: number): number {
  if (daysPerWeek <= 2) return 1.375;
  if (daysPerWeek <= 4) return 1.55;
  if (daysPerWeek <= 6) return 1.725;
  return 1.9;
}

function deriveCalorieDirection(
  calorieTarget: number,
  tdee: number,
): CalorieDirection {
  if (calorieTarget < tdee - 50) return 'deficit';
  if (calorieTarget > tdee + 50) return 'surplus';
  return 'maintenance';
}

function resolveGoalTargetWeightLbs(body: GeneratePlanBody): number | null {
  const candidates: unknown[] = [body.goalTargetWeight, body.targetWeightLbs];
  for (const c of candidates) {
    const n = typeof c === 'string' ? parseFloat(c) : Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function computeNutritionContext(
  body: GeneratePlanBody,
  daysPerWeek: number,
): {
  calorieDirection: CalorieDirection;
  targetWeightLbs: number | null;
  currentWeightLbs: number;
  weightDeltaLbs: number;
  tdee: number;
} {
  const weightRaw = body.weightLbs;
  const startRaw = body.startingWeightLbs;
  const currentWeightLbs = (() => {
    const w = typeof weightRaw === 'string' ? parseFloat(weightRaw) : Number(weightRaw);
    if (Number.isFinite(w) && w > 0) return w;
    const s = typeof startRaw === 'string' ? parseFloat(startRaw) : Number(startRaw);
    if (Number.isFinite(s) && s > 0) return s;
    return 170;
  })();

  const targetWeightLbs = resolveGoalTargetWeightLbs(body);
  const effectiveTarget = targetWeightLbs ?? currentWeightLbs;
  const weightDeltaLbs = effectiveTarget - currentWeightLbs;

  const bfRaw = body.bodyFatPct;
  const bodyFatPct =
    bfRaw != null && bfRaw !== ''
      ? Number(bfRaw)
      : null;
  const sex =
    body.sex === 'male' || body.sex === 'female' || body.sex === 'other'
      ? body.sex
      : body.biologicalSex === 'female'
      ? 'female'
      : body.biologicalSex === 'male'
      ? 'male'
      : 'other';

  const liftingDaysOnly = Math.min(7, Math.max(1, daysPerWeek));

  const tdee = computeTdeeFromProfile({
    weightLbs: currentWeightLbs,
    heightFt: Number(body.heightFt ?? 5),
    heightIn: Number(body.heightIn ?? 10),
    age: Number(body.age ?? 30),
    sex,
    bodyFatPct:
      bodyFatPct != null && Number.isFinite(bodyFatPct) ? bodyFatPct : null,
    effectiveDays: liftingDaysOnly,
  });

  const caloriesTarget = Number(body.calories);
  const calorieDirection =
    Number.isFinite(caloriesTarget) && caloriesTarget > 0
      ? deriveCalorieDirection(caloriesTarget, tdee)
      : weightDeltaLbs < -2
      ? 'deficit'
      : weightDeltaLbs > 2
      ? 'surplus'
      : 'maintenance';

  return {
    calorieDirection,
    targetWeightLbs,
    currentWeightLbs,
    weightDeltaLbs,
    tdee,
  };
}

function computeTdeeFromProfile(input: {
  weightLbs: number;
  heightFt: number;
  heightIn: number;
  age: number;
  sex: 'male' | 'female' | 'other';
  bodyFatPct?: number | null;
  effectiveDays: number;
}): number {
  const bmr = calculateBMR({
    weightLbs: input.weightLbs,
    heightFt: input.heightFt,
    heightIn: input.heightIn,
    age: input.age,
    sex: input.sex,
    bodyFatPct: input.bodyFatPct,
  });
  return bmr * getActivityMultiplier(input.effectiveDays);
}

function buildNutritionContextBlock(calorieDirection: CalorieDirection): string {
  const deficitNote =
    calorieDirection === 'deficit'
      ? `This user is training for performance while in a calorie deficit. Coaching notes should acknowledge that recovery may be slightly slower and progression more conservative than a surplus phase. This is normal and expected — do not treat it as underperformance.`
      : '';
  return `Nutrition context: the user is in a calorie ${calorieDirection}.

${deficitNote}`.trim();
}

const PREVIEW_SYSTEM_PROMPT = `Generate a 2-session preview workout plan for this athlete.
Show enough to demonstrate the coaching quality — real exercises,
real weights, Jordan's voice. This is a preview only.
Return Week 1, Day 1 and Day 2 only.
Follow all existing exercise selection and coaching note rules.

STYLE RULE: Never use em-dashes (—) in any response. Use periods or commas instead.
Never use the word "AI" — Jordan is a coach, not an AI system.

coachingNote: 1–2 sentences on WHY this exercise is in the plan for this user.
sessionFocus: one sentence, max 12 words, for workout days; "" on rest days.
Week 1 phase MUST be "baseline".`;

function rateLimitJsonResponse(payload: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function logRateLimitEvent(
  supabase: ReturnType<typeof createClient>,
  userId: string | null,
  deviceId: string | null,
  reason: string,
): Promise<void> {
  try {
    await supabase.from('rate_limit_events').insert({
      user_id: userId,
      device_id: deviceId,
      event_type: 'plan_generation_blocked',
      reason,
    });
  } catch (e) {
    console.error('[generate-plan] rate_limit_events insert failed:', e);
  }
}

async function isUserPro(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('user_profiles')
    .select('subscription_status')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { subscription_status?: string } | null)?.subscription_status === 'pro';
}

async function checkRateLimits(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  deviceId: string | null,
  isPreview: boolean,
): Promise<Response | null> {
  const isPro = await isUserPro(supabase, userId);
  if (isPro) return null;

  if (!isPreview) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('full_plan_generations_used')
      .eq('user_id', userId)
      .maybeSingle();
    const used = Number(
      (profile as { full_plan_generations_used?: number } | null)?.full_plan_generations_used ?? 0,
    );
    if (used >= 1) {
      await logRateLimitEvent(supabase, userId, deviceId, 'generation_limit_reached');
      return rateLimitJsonResponse({
        status: 'generation_limit_reached',
        message: 'Subscribe to generate additional plans',
      });
    }

    const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
    const { data: recentPlans } = await supabase
      .from('plans')
      .select('id, created_at, is_preview')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    const hasRecentFull = (recentPlans ?? []).some(
      (p) => !(p as { is_preview?: boolean }).is_preview,
    );
    if (hasRecentFull) {
      await logRateLimitEvent(supabase, userId, deviceId, 'plan_cooldown');
      return rateLimitJsonResponse({
        status: 'rate_limited',
        reason: 'plan_cooldown',
        message: 'Subscribe to generate a new plan',
      });
    }

    if (deviceId) {
      const { data: deviceProfiles } = await supabase
        .from('user_profiles')
        .select('user_id')
        .eq('device_id', deviceId)
        .neq('user_id', userId);

      const otherIds = (deviceProfiles ?? [])
        .map((r) => (r as { user_id: string }).user_id)
        .filter(Boolean);

      if (otherIds.length > 0) {
        const { data: otherFull } = await supabase
          .from('plans')
          .select('id')
          .in('user_id', otherIds)
          .eq('is_preview', false)
          .gte('created_at', since)
          .limit(1);

        if ((otherFull ?? []).length > 0) {
          await logRateLimitEvent(supabase, userId, deviceId, 'plan_cooldown_device');
          return rateLimitJsonResponse({
            status: 'rate_limited',
            reason: 'plan_cooldown',
            message: 'Subscribe to generate a new plan',
          });
        }
      }
    }
  }

  return null;
}

function trimPreviewWeekDays(planJson: Record<string, unknown>): void {
  const weeks = planJson.weeks as { days?: { type?: string }[] }[] | undefined;
  if (!Array.isArray(weeks) || !weeks[0]?.days) return;
  let workoutCount = 0;
  const trimmed: { type?: string }[] = [];
  for (const day of weeks[0].days) {
    if (day?.type === 'workout') {
      if (workoutCount >= 2) continue;
      workoutCount++;
    }
    trimmed.push(day);
  }
  weeks[0].days = trimmed;
}

/** GAP-7: name → muscleEmphasis lookup. Keys are lowercase-trimmed exercise names. */
const MUSCLE_EMPHASIS_MAP: Record<string, string> = {
  // Chest
  'barbell bench press': 'mid_chest',
  'dumbbell bench press': 'mid_chest',
  'machine chest press': 'mid_chest',
  'push-up': 'mid_chest',
  'cable chest fly': 'mid_chest',
  'dumbbell chest fly': 'mid_chest',
  'incline barbell bench press': 'upper_chest',
  'incline dumbbell press': 'upper_chest',
  'decline bench press': 'lower_chest',
  // Back
  'barbell row': 'mid_back',
  'seated cable row': 'mid_back',
  'machine row': 'mid_back',
  't-bar row': 'mid_back',
  'barbell shrug': 'mid_back',
  'dumbbell shrug': 'mid_back',
  'cable shrug': 'mid_back',
  'kettlebell shrug': 'mid_back',
  'farmer carry': 'mid_back',
  'plate pinch hold': 'mid_back',
  deadlift: 'lats',
  'pull-up': 'lats',
  'lat pulldown': 'lats',
  'dumbbell row': 'lats',
  'chin-up': 'lats',
  'face pull': 'rear_delt',
  'reverse dumbbell fly': 'rear_delt',
  // Shoulders
  'overhead press': 'front_delt',
  'dumbbell shoulder press': 'front_delt',
  'arnold press': 'front_delt',
  'machine shoulder press': 'front_delt',
  'dumbbell lateral raise': 'lateral_delt',
  'cable lateral raise': 'lateral_delt',
  'upright row': 'lateral_delt',
  // Biceps
  'barbell curl': 'short_head_bicep',
  'preacher curl': 'short_head_bicep',
  'dumbbell curl': 'long_head_bicep',
  'hammer curl': 'long_head_bicep',
  'cable curl': 'long_head_bicep',
  'incline dumbbell curl': 'long_head_bicep',
  // Triceps
  'tricep pushdown': 'lateral_head_tricep',
  'close-grip bench press': 'lateral_head_tricep',
  'dumbbell tricep kickback': 'lateral_head_tricep',
  dips: 'lateral_head_tricep',
  'overhead tricep extension': 'long_head_tricep',
  'skull crushers': 'long_head_tricep',
  // Legs
  'back squat': 'quads',
  'front squat': 'quads',
  'leg press': 'quads',
  'leg extension': 'quads',
  'hack squat': 'quads',
  'goblet squat': 'quads',
  'walking lunge': 'quads',
  'bulgarian split squat': 'glutes',
  'romanian deadlift': 'hamstrings',
  'stiff-leg deadlift': 'hamstrings',
  'stiff leg deadlift': 'hamstrings',
  'dumbbell romanian deadlift': 'hamstrings',
  'leg curl': 'hamstrings',
  'nordic hamstring curl': 'hamstrings',
  'hip thrust': 'glutes',
  'glute bridge': 'glutes',
  'sumo deadlift': 'glutes',
  'cable kickback': 'glutes',
  'banded hip thrust': 'glutes',
  'kettlebell swing': 'glutes',
  'cable pull-through': 'glutes',
  'standing calf raise': 'gastrocnemius',
  'dumbbell calf raise': 'gastrocnemius',
  'leg press calf raise': 'gastrocnemius',
  'bodyweight calf raise': 'gastrocnemius',
  'smith machine calf raise': 'gastrocnemius',
  'seated calf raise': 'soleus',
  // Core
  plank: 'transverse_abs',
  'ab wheel rollout': 'transverse_abs',
  'pallof press': 'transverse_abs',
  'dead bug': 'transverse_abs',
  'hanging leg raise': 'rectus_abdominis',
  'cable crunch': 'rectus_abdominis',
  'russian twist': 'obliques',
  // Chest additions
  'incline barbell press': 'upper_chest',
  'incline machine press': 'upper_chest',
  'smith machine incline press': 'upper_chest',
  'bench press (wide grip)': 'mid_chest',
  'bench press (reverse grip)': 'upper_chest',
  'decline dumbbell press': 'lower_chest',
  'cable fly (high to low)': 'lower_chest',
  'cable fly (low to high)': 'upper_chest',
  'cable fly (mid cable)': 'mid_chest',
  'low cable fly': 'upper_chest',
  'incline cable fly': 'upper_chest',
  'dumbbell fly': 'mid_chest',
  'machine fly': 'mid_chest',
  'pec deck': 'mid_chest',
  'smith machine bench press': 'mid_chest',
  'dumbbell pullover': 'mid_chest',
  // Back additions
  'barbell row (overhand wide)': 'mid_back',
  'barbell row (overhand narrow)': 'mid_back',
  'barbell row (underhand)': 'lats',
  'cable row (close grip)': 'mid_back',
  'cable row (wide grip)': 'upper_back',
  'cable row (reverse grip)': 'lats',
  'cable row (single arm)': 'lats',
  'dumbbell row (pronated grip)': 'mid_back',
  'chest supported row': 'mid_back',
  'assisted pull-up machine': 'lats',
  'lat pulldown (wide grip)': 'lats',
  'lat pulldown (close grip)': 'lats',
  'lat pulldown (reverse grip)': 'lats',
  'trap bar deadlift': 'lats',
  'rack pull': 'mid_back',
  'straight arm pulldown': 'lats',
  'meadows row': 'mid_back',
  'seal row': 'mid_back',
  // Shoulder additions
  'face pulls': 'rear_delt',
  'rear delt fly': 'rear_delt',
  'seated rear delt fly': 'rear_delt',
  'cable rear delt fly': 'rear_delt',
  'reverse pec deck': 'rear_delt',
  'band pull-apart': 'rear_delt',
  'cable front raise': 'front_delt',
  'dumbbell front raise': 'front_delt',
  'barbell front raise': 'front_delt',
  'plate front raise': 'front_delt',
  'machine lateral raise': 'lateral_delt',
  'leaning cable lateral raise': 'lateral_delt',
  'smith machine press': 'front_delt',
  // Biceps additions
  'dumbbell curl (supinated)': 'short_head_bicep',
  'dumbbell curl (pronated)': 'long_head_bicep',
  'cross body hammer curl': 'long_head_bicep',
  'rope hammer curl': 'long_head_bicep',
  'concentration curl': 'short_head_bicep',
  'machine bicep curl': 'short_head_bicep',
  'preacher curl machine': 'short_head_bicep',
  'bayesian curl': 'long_head_bicep',
  'ez bar curl': 'short_head_bicep',
  'ez bar curl (wide grip)': 'long_head_bicep',
  'cable curl (rope)': 'long_head_bicep',
  'spider curl': 'short_head_bicep',
  // Triceps additions
  'tricep pushdown (rope)': 'lateral_head_tricep',
  'tricep pushdown (straight bar)': 'lateral_head_tricep',
  'tricep pushdown (v-bar)': 'lateral_head_tricep',
  'tricep pushdown (reverse grip)': 'long_head_tricep',
  'overhead tricep extension (rope)': 'long_head_tricep',
  'overhead tricep extension (single arm)': 'long_head_tricep',
  'skull crusher': 'long_head_tricep',
  'ez bar skull crusher': 'long_head_tricep',
  'dumbbell skull crusher': 'long_head_tricep',
  'cable overhead tricep extension': 'long_head_tricep',
  'machine tricep extension': 'long_head_tricep',
  'tricep press machine': 'lateral_head_tricep',
  'close grip bench press': 'lateral_head_tricep',
  'smith machine close grip': 'lateral_head_tricep',
  'machine dip': 'lateral_head_tricep',
  'assisted dip machine': 'lateral_head_tricep',
  dip: 'lateral_head_tricep',
  'diamond push-up': 'lateral_head_tricep',
  // Legs additions
  'leg press (single leg)': 'quads',
  'leg extension (single leg)': 'quads',
  'cable leg extension': 'quads',
  'smith machine squat': 'quads',
  'reverse lunge': 'glutes',
  'step up': 'glutes',
  'good morning': 'hamstrings',
  'single leg rdl': 'hamstrings',
  'lying leg curl': 'hamstrings',
  'seated leg curl': 'hamstrings',
  'standing leg curl': 'hamstrings',
  'nordic curl': 'hamstrings',
  'swiss ball leg curl': 'hamstrings',
  'hip thrust machine': 'glutes',
  'glute drive machine': 'glutes',
  'donkey kick': 'glutes',
  'abduction machine': 'glutes',
  'barbell calf raise': 'gastrocnemius',
  'single-leg calf raise': 'gastrocnemius',
  // Core additions
  'weighted crunch': 'rectus_abdominis',
  'sit-up': 'rectus_abdominis',
  'leg raise': 'rectus_abdominis',
  'bicycle crunch': 'obliques',
  'side plank': 'obliques',
  'cable woodchop': 'obliques',
  // Traps additions
  shrugs: 'mid_back',
  'smith machine shrug': 'mid_back',
  'upright row': 'mid_back',
};

/** GAP-7: Alias map — catches common Claude name variants that differ from library keys. */
const MUSCLE_EMPHASIS_ALIASES: Record<string, string> = {
  // Chest variants
  'incline barbell press': 'upper_chest',
  'incline press': 'upper_chest',
  'decline press': 'lower_chest',
  'weighted push-up': 'mid_chest',
  'cable fly': 'mid_chest',
  'pec deck': 'mid_chest',
  // Back variants
  'face pulls': 'rear_delt',
  'bent-over row': 'mid_back',
  'bent over row': 'mid_back',
  'pendlay row': 'mid_back',
  'chest-supported row': 'mid_back',
  'chest supported row': 'mid_back',
  'seated cable row (close grip)': 'mid_back',
  'seated cable row (wide grip)': 'upper_back',
  'seated cable row (reverse grip)': 'lats',
  'seated cable row (single arm)': 'lats',
  'single arm row': 'lats',
  'straight-arm pulldown': 'lats',
  'straight arm pulldown': 'lats',
  'pull up': 'lats',
  'chin up': 'lats',
  // Shoulder variants
  'lateral raise': 'lateral_delt',
  'lateral raises': 'lateral_delt',
  'side lateral raise': 'lateral_delt',
  'front raise': 'front_delt',
  'military press': 'front_delt',
  'seated overhead press': 'front_delt',
  'seated dumbbell press': 'front_delt',
  'reverse fly': 'rear_delt',
  'reverse pec deck': 'rear_delt',
  // Tricep variants
  'close grip bench press': 'lateral_head_tricep', // without hyphen
  'weighted dips': 'lateral_head_tricep',
  'tricep dips': 'lateral_head_tricep',
  'rope pushdown': 'lateral_head_tricep',
  'tricep rope pushdown': 'lateral_head_tricep',
  'cable overhead extension': 'long_head_tricep',
  'overhead cable extension': 'long_head_tricep',
  'ez bar skull crusher': 'long_head_tricep',
  'ez-bar skull crusher': 'long_head_tricep',
  // Bicep variants
  'ez bar curl': 'short_head_bicep',
  'ez-bar curl': 'short_head_bicep',
  'wide grip curl': 'short_head_bicep',
  'concentration curl': 'short_head_bicep',
  'narrow grip curl': 'long_head_bicep',
  'cross-body curl': 'long_head_bicep',
  // Leg variants
  'goblet squat': 'quads',
  'sumo squat': 'adductors',
  'walking lunges': 'quads',
  'reverse lunge': 'glutes',
  'step up': 'quads',
  'step-up': 'quads',
  'nordic curl': 'hamstrings',
  'glute ham raise': 'hamstrings',
  'good morning': 'hamstrings',
  'good mornings': 'hamstrings',
  'banded glute bridge': 'glutes',
  'single-leg hip thrust': 'glutes',
  'single leg hip thrust': 'glutes',
  // Calf variants
  'calf raise': 'gastrocnemius',
  'calf raises': 'gastrocnemius',
  // Core variants
  'side plank': 'obliques',
  'woodchop': 'obliques',
  'wood chop': 'obliques',
  'hollow hold': 'transverse_abs',
  'hollow body hold': 'transverse_abs',
  'v-up': 'rectus_abdominis',
  'v up': 'rectus_abdominis',
  'sit-up': 'rectus_abdominis',
  'sit up': 'rectus_abdominis',
  'leg raise': 'rectus_abdominis',
  'leg raises': 'rectus_abdominis',
};

/** GAP-7b: Exercise name → equipment type for weight rounding in generate-next-week. */
const EQUIPMENT_MAP: Record<string, string> = {
  // Barbell
  'barbell bench press': 'barbell',
  'incline barbell bench press': 'barbell',
  'incline barbell press': 'barbell',
  'decline bench press': 'barbell',
  'close-grip bench press': 'barbell',
  'close grip bench press': 'barbell',
  'barbell row': 'barbell',
  'bent-over row': 'barbell',
  'bent over row': 'barbell',
  'pendlay row': 'barbell',
  't-bar row': 'barbell',
  'barbell curl': 'barbell',
  'ez bar curl': 'barbell',
  'ez-bar curl': 'barbell',
  'preacher curl': 'barbell',
  'skull crushers': 'barbell',
  'overhead press': 'barbell',
  'back squat': 'barbell',
  'front squat': 'barbell',
  'deadlift': 'barbell',
  'romanian deadlift': 'barbell',
  'stiff-leg deadlift': 'barbell',
  'sumo deadlift': 'barbell',
  'good morning': 'barbell',
  'good mornings': 'barbell',
  'barbell shrug': 'barbell',
  'upright row': 'barbell',
  'reverse curl': 'barbell',
  'wrist curl': 'barbell',
  'reverse wrist curl': 'barbell',
  'hip thrust': 'barbell',
  // Dumbbell
  'dumbbell bench press': 'dumbbell',
  'incline dumbbell press': 'dumbbell',
  'dumbbell chest fly': 'dumbbell',
  'dumbbell row': 'dumbbell',
  'dumbbell shoulder press': 'dumbbell',
  'arnold press': 'dumbbell',
  'dumbbell lateral raise': 'dumbbell',
  'lateral raise': 'dumbbell',
  'lateral raises': 'dumbbell',
  'reverse dumbbell fly': 'dumbbell',
  'dumbbell curl': 'dumbbell',
  'hammer curl': 'dumbbell',
  'incline dumbbell curl': 'dumbbell',
  'dumbbell tricep kickback': 'dumbbell',
  'dumbbell romanian deadlift': 'dumbbell',
  'bulgarian split squat': 'dumbbell',
  'walking lunge': 'dumbbell',
  'walking lunges': 'dumbbell',
  'goblet squat': 'dumbbell',
  'dumbbell shrug': 'dumbbell',
  'dumbbell calf raise': 'dumbbell',
  'dumbbell wrist curl': 'dumbbell',
  'farmer carry': 'dumbbell',
  // Cable
  'cable chest fly': 'cable',
  'cable fly': 'cable',
  'cable lateral raises': 'cable',
  'cable lateral raise': 'cable',
  'face pull': 'cable',
  'face pulls': 'cable',
  'seated cable row': 'cable',
  'cable row': 'cable',
  'lat pulldown': 'cable',
  'straight-arm pulldown': 'cable',
  'straight arm pulldown': 'cable',
  'tricep pushdown': 'cable',
  'rope pushdown': 'cable',
  'overhead tricep extension': 'cable',
  'cable overhead extension': 'cable',
  'cable curl': 'cable',
  'cable kickback': 'cable',
  'cable pull-through': 'cable',
  'cable shrug': 'cable',
  'pallof press': 'cable',
  'cable crunch': 'cable',
  // Machine
  'machine chest press': 'machine',
  'machine row': 'machine',
  'machine shoulder press': 'machine',
  'leg press': 'machine',
  'leg extension': 'machine',
  'leg curl': 'machine',
  'lying leg curl': 'machine',
  'hack squat': 'machine',
  'calf raises': 'machine',
  'calf raise': 'machine',
  'standing calf raises': 'machine',
  'seated calf raises': 'machine',
  'standing calf raise': 'machine',
  'seated calf raise': 'machine',
  'leg press calf raise': 'machine',
  'smith machine calf raise': 'machine',
  // Bodyweight
  'pull-up': 'bodyweight',
  'pull up': 'bodyweight',
  'chin-up': 'bodyweight',
  'chin up': 'bodyweight',
  'push-up': 'bodyweight',
  'dips': 'bodyweight',
  'plank': 'bodyweight',
  'hanging leg raise': 'bodyweight',
  'ab wheel rollout': 'bodyweight',
  'dead bug': 'bodyweight',
  'russian twist': 'bodyweight',
  'glute bridge': 'bodyweight',
  'nordic hamstring curl': 'bodyweight',
  // Kettlebell
  'kettlebell swing': 'kettlebell',
  'goblet squat (kb)': 'kettlebell',
  'kettlebell shrug': 'kettlebell',
  // Bodyweight conditioning — explicitly map to prevent barbell fallback
  'plank': 'bodyweight',
  'mountain climber': 'bodyweight',
  'mountain climbers': 'bodyweight',
  'burpee': 'bodyweight',
  'burpees': 'bodyweight',
  'push-up': 'bodyweight',
  'push-ups': 'bodyweight',
  'push up': 'bodyweight',
  'close grip push-up': 'bodyweight',
  'close grip push-ups': 'bodyweight',
  'dead bug': 'bodyweight',
  'hollow hold': 'bodyweight',
  'hollow body hold': 'bodyweight',
  'v-up': 'bodyweight',
  'sit-up': 'bodyweight',
  'leg raise': 'bodyweight',
  'hanging leg raise': 'bodyweight',
  'ab wheel rollout': 'bodyweight',
  'glute bridge': 'bodyweight',
  'bodyweight squat': 'bodyweight',
  'bodyweight lunge': 'bodyweight',
  'bear crawl': 'bodyweight',
  'inchworm': 'bodyweight',
  'thruster': 'barbell',
  'farmer carry': 'dumbbell',
  'farmers walk': 'dumbbell',
  "farmer's walk": 'dumbbell',
  // Cable movements — must not fall through to barbell default
  'cable front raise': 'cable',
  'cable front raises': 'cable',
  'cable lateral raise': 'cable',
  'cable lateral raises': 'cable',
  'cable fly': 'cable',
  'cable flys': 'cable',
  'cable flies': 'cable',
  'cable fly (high to low)': 'cable',
  'cable fly (low to high)': 'cable',
  'cable fly (mid cable)': 'cable',
  'cable chest fly': 'cable',
  'cable row': 'cable',
  'cable row (close grip)': 'cable',
  'cable row (wide grip)': 'cable',
  'cable curl': 'cable',
  'cable hammer curl': 'cable',
  'cable reverse fly': 'cable',
  'cable reverse flys': 'cable',
  'cable face pull': 'cable',
  'cable face pulls': 'cable',
  'cable crunch': 'cable',
  'cable tricep extension': 'cable',
  'overhead cable tricep extension': 'cable',
  'cable rear delt fly': 'cable',
  // Dumbbell movements that sometimes fall through
  'dumbbell fly': 'dumbbell',
  'dumbbell flys': 'dumbbell',
  'dumbbell flies': 'dumbbell',
  'incline dumbbell fly': 'dumbbell',
  'incline dumbbell flys': 'dumbbell',
  'dumbbell rear delt fly': 'dumbbell',
  'dumbbell chest press': 'dumbbell',
  'dumbbell press': 'dumbbell',
  'dumbbell row': 'dumbbell',
  'single arm dumbbell row': 'dumbbell',
  'dumbbell bicep curl': 'dumbbell',
  'dumbbell bicep curls': 'dumbbell',
  'dumbbell curl': 'dumbbell',
  'dumbbell curls': 'dumbbell',
  'dumbbell lateral raise': 'dumbbell',
  'dumbbell lateral raises': 'dumbbell',
  'dumbbell shoulder press': 'dumbbell',
  'dumbbell bench press': 'dumbbell',
  'dumbbell incline press': 'dumbbell',
  'incline dumbbell press': 'dumbbell',
  'decline dumbbell press': 'dumbbell',
  'hammer curl': 'dumbbell',
  'hammer curls': 'dumbbell',
  'incline dumbbell curl': 'dumbbell',
  'preacher curl': 'barbell',
  // Barbell additions
  'barbell front raise': 'barbell',
  'barbell row (overhand wide)': 'barbell',
  'barbell row (overhand narrow)': 'barbell',
  'barbell row (underhand)': 'barbell',
  'ez bar curl (wide grip)': 'barbell',
  'ez bar skull crusher': 'barbell',
  'skull crusher': 'barbell',
  'rack pull': 'barbell',
  'trap bar deadlift': 'barbell',
  'bench press (wide grip)': 'barbell',
  'bench press (reverse grip)': 'barbell',
  'barbell calf raise': 'barbell',
  'meadows row': 'barbell',
  'seal row': 'barbell',
  'spider curl': 'barbell',
  // Dumbbell additions
  'dumbbell front raise': 'dumbbell',
  'dumbbell skull crusher': 'dumbbell',
  'dumbbell curl (supinated)': 'dumbbell',
  'dumbbell curl (pronated)': 'dumbbell',
  'cross body hammer curl': 'dumbbell',
  'concentration curl': 'dumbbell',
  'dumbbell row (pronated grip)': 'dumbbell',
  'rear delt fly': 'dumbbell',
  'seated rear delt fly': 'dumbbell',
  'dumbbell pullover': 'dumbbell',
  'donkey kick': 'bodyweight',
  // Cable additions
  'cable curl (rope)': 'cable',
  'rope hammer curl': 'cable',
  'cable row (reverse grip)': 'cable',
  'cable row (single arm)': 'cable',
  'tricep pushdown (rope)': 'cable',
  'tricep pushdown (straight bar)': 'cable',
  'tricep pushdown (v-bar)': 'cable',
  'tricep pushdown (reverse grip)': 'cable',
  'overhead tricep extension (rope)': 'cable',
  'overhead tricep extension (single arm)': 'cable',
  'cable overhead tricep extension': 'cable',
  'bayesian curl': 'cable',
  'straight arm pulldown': 'cable',
  'incline cable fly': 'cable',
  'low cable fly': 'cable',
  'cable woodchop': 'cable',
  // Machine additions
  'machine tricep extension': 'machine',
  'tricep press machine': 'machine',
  'machine dip': 'machine',
  'assisted dip machine': 'machine',
  'smith machine close grip': 'machine',
  'machine lateral raise': 'machine',
  'machine fly': 'machine',
  'pec deck': 'machine',
  'incline machine press': 'machine',
  'smith machine incline press': 'machine',
  'smith machine bench press': 'machine',
  'smith machine press': 'machine',
  'preacher curl machine': 'machine',
  'machine bicep curl': 'machine',
  'hip thrust machine': 'machine',
  'glute drive machine': 'machine',
  'abduction machine': 'machine',
  'chest supported row': 'machine',
  'assisted pull-up machine': 'machine',
  'leg press (single leg)': 'machine',
  'leg extension (single leg)': 'machine',
  'seated leg curl': 'machine',
  'lying leg curl': 'machine',
  'standing leg curl': 'machine',
  // Bodyweight additions
  'diamond push-up': 'bodyweight',
  'bicycle crunch': 'bodyweight',
  'side plank': 'bodyweight',
  'weighted crunch': 'bodyweight',
  'swiss ball leg curl': 'bodyweight',
  'nordic curl': 'bodyweight',
  'bodyweight calf raise': 'bodyweight',
};

const EQUIPMENT_ALIASES: Record<string, string> = {};

/**
 * Maps exercise names (lowercase) to their compoundTier.
 * Covers exercises used in plans; longest key first in lookup prevents partial match conflicts.
 */
const COMPOUND_TIER_MAP: Record<string, 'primary_compound' | 'secondary_compound' | 'isolation'> = {
  'barbell bench press': 'primary_compound',
  'back squat': 'primary_compound',
  'front squat': 'primary_compound',
  'deadlift': 'primary_compound',
  'sumo deadlift': 'primary_compound',
  'overhead press': 'primary_compound',
  'barbell row': 'primary_compound',
  'barbell bent-over row': 'primary_compound',
  'bent-over row': 'primary_compound',
  'pull-up': 'primary_compound',
  'pull-ups': 'primary_compound',
  'chin-up': 'primary_compound',
  'chin-ups': 'primary_compound',
  't-bar row': 'primary_compound',
  'incline barbell bench press': 'secondary_compound',
  'incline dumbbell press': 'secondary_compound',
  'dumbbell bench press': 'secondary_compound',
  'close grip bench press': 'secondary_compound',
  'close-grip bench press': 'secondary_compound',
  'dips': 'secondary_compound',
  'dumbbell row': 'secondary_compound',
  'dumbbell shoulder press': 'secondary_compound',
  'arnold press': 'secondary_compound',
  'machine shoulder press': 'secondary_compound',
  'machine chest press': 'secondary_compound',
  'machine row': 'secondary_compound',
  'seated cable row': 'secondary_compound',
  'lat pulldown': 'secondary_compound',
  'leg press': 'secondary_compound',
  'hack squat': 'secondary_compound',
  'bulgarian split squat': 'secondary_compound',
  'walking lunge': 'secondary_compound',
  'walking lunges': 'secondary_compound',
  'goblet squat': 'secondary_compound',
  'romanian deadlift': 'secondary_compound',
  'stiff-leg deadlift': 'secondary_compound',
  'stiff leg deadlift': 'secondary_compound',
  'dumbbell romanian deadlift': 'secondary_compound',
  'hip thrust': 'secondary_compound',
  'banded hip thrust': 'secondary_compound',
  'cable pull-through': 'secondary_compound',
  'glute bridge': 'secondary_compound',
  'push-up': 'secondary_compound',
  'push-ups': 'secondary_compound',
  'upright row': 'secondary_compound',
  'farmer carry': 'secondary_compound',
  'kettlebell swing': 'secondary_compound',
  'ab wheel rollout': 'secondary_compound',
  'plank': 'secondary_compound',
  'pallof press': 'secondary_compound',
  // Short-name variants Claude commonly uses (exact match before partial)
  'barbell curl': 'isolation',
  'barbell hip thrust': 'secondary_compound',
  'barbell shrug': 'isolation',
  'barbell squat': 'primary_compound',
  'barbell bent over row': 'primary_compound',
  'bench press': 'primary_compound',
  'bent over row': 'primary_compound',
  'cable rows': 'secondary_compound',
  'calf raises': 'isolation',
  'chinups': 'primary_compound',
  'conventional deadlift': 'primary_compound',
  'face pull': 'isolation',
  'face pulls': 'isolation',
  'hammer curls': 'isolation',
  'hip thrusts': 'secondary_compound',
  'lateral raise': 'isolation',
  'lateral raises': 'isolation',
  'lat pulldowns': 'secondary_compound',
  'leg curls': 'isolation',
  'leg extensions': 'isolation',
  'military press': 'primary_compound',
  'ohp': 'primary_compound',
  'pullups': 'primary_compound',
  'russian twists': 'isolation',
  'squat': 'primary_compound',
  'tricep dips': 'secondary_compound',
};

function getCompoundTierFromName(
  name: string,
): 'primary_compound' | 'secondary_compound' | 'isolation' {
  const lower = name.toLowerCase().trim();

  if (COMPOUND_TIER_MAP[lower]) return COMPOUND_TIER_MAP[lower];

  const stripped = lower
    .replace(
      /^(barbell|dumbbell|cable|machine|kettlebell|banded|smith machine|incline|decline|flat|sumo|conventional|close grip|close-grip|wide grip|wide-grip|narrow grip|paused|tempo)\s+/g,
      '',
    )
    .trim();
  if (stripped !== lower && COMPOUND_TIER_MAP[stripped]) {
    return COMPOUND_TIER_MAP[stripped];
  }

  const keys = Object.keys(COMPOUND_TIER_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (lower.includes(key) || key.includes(lower)) {
      return COMPOUND_TIER_MAP[key];
    }
  }

  return 'isolation';
}

// deno-lint-ignore no-explicit-any
function stampEquipment(exercises: any[]): any[] {
  // Sort entries by key length descending — longer keys are more specific
  const sortedEntries = [
    ...Object.entries(EQUIPMENT_MAP),
    ...Object.entries(EQUIPMENT_ALIASES ?? {}),
  ].sort((a, b) => b[0].length - a[0].length);

  return exercises.map((ex) => {
    const key = String(ex.name ?? '').toLowerCase().trim();

    // 1. Exact match
    if (EQUIPMENT_MAP[key]) return { ...ex, equipment: EQUIPMENT_MAP[key] };

    // 2. Partial match — longer keys first prevents "lateral raise" (dumbbell)
    //    from matching before "cable lateral raise" (cable)
    for (const [mapKey, equip] of sortedEntries) {
      if (key.includes(mapKey) || mapKey.includes(key)) {
        return { ...ex, equipment: equip };
      }
    }

    // 3. Fallback — keep existing or default to barbell
    return { ...ex, equipment: ex.equipment ?? 'barbell' };
  });
}

/** Normalise exercise name spelling variants */
const NAME_CORRECTIONS: Record<string, string> = {
  flye: 'Fly',
  flyes: 'Flys',
};

function normaliseExerciseName(name: string): string {
  return name.replace(/\bflye(s)?\b/gi, (_match, s) =>
    s ? NAME_CORRECTIONS.flyes : NAME_CORRECTIONS.flye,
  );
}

// deno-lint-ignore no-explicit-any
function stampMuscleEmphasis(exercises: any[]): any[] {
  return exercises.map((ex) => {
    const key = String(ex.name ?? '').toLowerCase().trim();

    // 1. Exact match against primary map
    if (MUSCLE_EMPHASIS_MAP[key]) {
      return {
        ...ex,
        name: normaliseExerciseName(String(ex.name ?? '')),
        muscleEmphasis: MUSCLE_EMPHASIS_MAP[key],
      };
    }

    // 2. Exact match against alias map
    if (MUSCLE_EMPHASIS_ALIASES[key]) {
      return {
        ...ex,
        name: normaliseExerciseName(String(ex.name ?? '')),
        muscleEmphasis: MUSCLE_EMPHASIS_ALIASES[key],
      };
    }

    // 3. Partial match — check if any map key is contained in the exercise name
    //    Catches "Weighted Dips" matching "dips", "Incline Barbell Press" matching "incline barbell bench press"
    const allEntries = { ...MUSCLE_EMPHASIS_MAP, ...MUSCLE_EMPHASIS_ALIASES };
    for (const [mapKey, emphasis] of Object.entries(allEntries)) {
      if (key.includes(mapKey) || mapKey.includes(key)) {
        return {
          ...ex,
          name: normaliseExerciseName(String(ex.name ?? '')),
          muscleEmphasis: emphasis,
        };
      }
    }

    // 4. Fallback — keep Claude's value if it's in the valid taxonomy, else 'mid_chest'
    const VALID_TAXONOMY = new Set([
      'upper_chest', 'mid_chest', 'lower_chest',
      'upper_back', 'mid_back', 'lats',
      'front_delt', 'lateral_delt', 'rear_delt',
      'long_head_tricep', 'lateral_head_tricep',
      'short_head_bicep', 'long_head_bicep',
      'quads', 'hamstrings', 'glutes', 'adductors',
      'gastrocnemius', 'soleus',
      'rectus_abdominis', 'obliques', 'transverse_abs', 'spinal_erectors',
    ]);
    const claudeValue = ex.muscleEmphasis ?? '';
    if (VALID_TAXONOMY.has(claudeValue)) {
      return {
        ...ex,
        name: normaliseExerciseName(String(ex.name ?? '')),
        muscleEmphasis: claudeValue,
      };
    }

    const MUSCLE_GROUP_DEFAULTS: Record<string, string> = {
      // Chest
      'Chest': 'mid_chest',

      // Back — cable rows were getting 'mid_chest' due to wrong lookup
      'Back': 'lats',
      'Lats': 'lats',
      'Rhomboids': 'mid_back',
      'Rear Delts': 'rear_delt',
      'Traps': 'mid_back',
      'Forearms': 'mid_back',

      // Shoulders
      'Shoulders': 'lateral_delt',

      // Arms
      'Biceps': 'long_head_bicep',
      'Triceps': 'lateral_head_tricep',
      'Arms': 'long_head_bicep',

      // Legs — hamstrings were getting 'lats' in some edge cases
      'Quadriceps': 'quads',
      'Quads': 'quads',
      'Hamstrings': 'hamstrings',
      'Glutes': 'glutes',
      'Calves': 'gastrocnemius',
      'Legs': 'quads',

      // Core
      'Core': 'transverse_abs',
      'Abs': 'transverse_abs',

      // Full body
      'Full Body': 'quads',
    };

    const muscleGroupKey = String(ex.muscleGroup ?? '').trim();
    const groupDefault = MUSCLE_GROUP_DEFAULTS[muscleGroupKey] ?? 'mid_chest';

    return {
      ...ex,
      name: normaliseExerciseName(String(ex.name ?? '')),
      muscleEmphasis: groupDefault,
    };
  });
}

// deno-lint-ignore no-explicit-any
function enforceWeek1Rpe(exercises: any[]): any[] {
  return exercises.map((ex) => {
    // Use rep range low end as compound/isolation proxy.
    // plan_json does not store compoundTier — rep range is the reliable signal.
    // "3-5", "4-6", "6-8" → compound (cap 8)
    // "8-10", "10-12", "12-15" → isolation (cap 7)
    const repsStr = String(ex.reps ?? '');
    const lowEnd = parseInt(repsStr.split('-')[0], 10);

    // If rep range starts at 9 or higher → isolation cap, otherwise compound cap
    const cap = (!isNaN(lowEnd) && lowEnd >= 9) ? 7 : 8;
    const currentRpe = ex.targetRpe ?? 8;

    if (currentRpe <= cap) return ex;
    return { ...ex, targetRpe: cap };
  });
}

/** Sequential setStructure stamping — strength goal target lift first (shared helper). */
// deno-lint-ignore no-explicit-any
function enforceSetStructure(
  exercises: any[],
  goal: string,
  strengthGoalLift?: string | null,
): any[] {
  return exercises.map((ex) => {
    const compoundTier = getCompoundTierFromName(String(ex.name ?? ''));
    const equipment = String(ex.equipment ?? 'barbell');

    return enforceSetStructureExercise(
      { ...ex, compoundTier, equipment },
      goal,
      strengthGoalLift,
    );
  });
}

/** Sub-muscle (muscleEmphasis) → display muscleGroup. Single source of truth so the two fields cannot contradict. */
const EMPHASIS_TO_MUSCLE_GROUP: Record<string, string> = {
  upper_chest: 'Chest', mid_chest: 'Chest', lower_chest: 'Chest',
  upper_back: 'Back', mid_back: 'Back', lats: 'Back',
  front_delt: 'Shoulders', lateral_delt: 'Shoulders', rear_delt: 'Shoulders',
  long_head_tricep: 'Triceps', lateral_head_tricep: 'Triceps',
  short_head_bicep: 'Biceps', long_head_bicep: 'Biceps',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', adductors: 'Glutes',
  gastrocnemius: 'Calves', soleus: 'Calves',
  rectus_abdominis: 'Core', obliques: 'Core', transverse_abs: 'Core', spinal_erectors: 'Core',
};

const EMPHASIS_ALTERNATIVES: Record<string, { name: string; equipment: string; tier: string }[]> = {
  // Biceps — long head (arm behind body, neutral grip)
  long_head_bicep: [
    { name: 'Hammer Curl', equipment: 'dumbbell', tier: 'isolation' },
    { name: 'Incline Dumbbell Curl', equipment: 'dumbbell', tier: 'isolation' },
    { name: 'Bayesian Curl', equipment: 'cable', tier: 'isolation' },
    { name: 'Cable Curl (Rope)', equipment: 'cable', tier: 'isolation' },
    { name: 'Cross Body Hammer Curl', equipment: 'dumbbell', tier: 'isolation' },
    { name: 'EZ Bar Curl (Wide Grip)', equipment: 'barbell', tier: 'isolation' },
  ],
  // Biceps — short head (arm in front, supinated grip)
  short_head_bicep: [
    { name: 'Barbell Curl', equipment: 'barbell', tier: 'isolation' },
    { name: 'Preacher Curl', equipment: 'barbell', tier: 'isolation' },
    { name: 'Concentration Curl', equipment: 'dumbbell', tier: 'isolation' },
    { name: 'Spider Curl', equipment: 'barbell', tier: 'isolation' },
    { name: 'EZ Bar Curl', equipment: 'barbell', tier: 'isolation' },
    { name: 'Machine Bicep Curl', equipment: 'machine', tier: 'isolation' },
  ],
  // Triceps — long head (overhead, bulk of mass)
  long_head_tricep: [
    { name: 'Overhead Tricep Extension', equipment: 'cable', tier: 'isolation' },
    { name: 'EZ Bar Skull Crusher', equipment: 'barbell', tier: 'isolation' },
    { name: 'Skull Crusher', equipment: 'barbell', tier: 'isolation' },
    { name: 'Dumbbell Skull Crusher', equipment: 'dumbbell', tier: 'isolation' },
    { name: 'Cable Overhead Tricep Extension', equipment: 'cable', tier: 'isolation' },
    { name: 'Overhead Tricep Extension (Rope)', equipment: 'cable', tier: 'isolation' },
  ],
  // Triceps — lateral head (horseshoe shape)
  lateral_head_tricep: [
    { name: 'Tricep Pushdown', equipment: 'cable', tier: 'isolation' },
    { name: 'Tricep Pushdown (Rope)', equipment: 'cable', tier: 'isolation' },
    { name: 'Tricep Pushdown (V-Bar)', equipment: 'cable', tier: 'isolation' },
    { name: 'Machine Tricep Extension', equipment: 'machine', tier: 'isolation' },
    { name: 'Tricep Press Machine', equipment: 'machine', tier: 'isolation' },
    { name: 'Dumbbell Tricep Kickback', equipment: 'dumbbell', tier: 'isolation' },
  ],
};

// Exercises that must never be swapped by enforcement
const PROTECTED_EXERCISES = new Set([
  'back squat', 'front squat', 'deadlift', 'sumo deadlift',
  'trap bar deadlift', 'overhead press', 'barbell bench press',
  'incline barbell press', 'incline barbell bench press',
  'romanian deadlift', 'hip thrust', 'pull-up', 'chin-up',
  'barbell row', 'barbell row (overhand wide)',
]);

// deno-lint-ignore no-explicit-any
function stampMuscleGroup(exercises: any[]): any[] {
  return exercises.map((ex) => {
    const emphasis = String(ex.muscleEmphasis ?? '').trim();
    const derived = EMPHASIS_TO_MUSCLE_GROUP[emphasis];
    return derived ? { ...ex, muscleGroup: derived } : ex;
  });
}

// deno-lint-ignore no-explicit-any
function stampMuscleEmphasisOnPlan(
  planJson: any,
  goal: string,
  strengthTargetLift?: string | null,
): any {
  return {
    ...planJson,
    weeks: (planJson.weeks ?? []).map((week: any) => ({
      ...week,
      days: (week.days ?? []).map((day: any) => {
        if (day.type === 'cardio') {
          return { ...day, exercises: [] };
        }
        if (!Array.isArray(day.exercises) || !day.exercises.length) {
          return day;
        }
        let exercises = stampMuscleEmphasis(day.exercises);
        exercises = stampMuscleGroup(exercises);
        exercises = stampEquipment(exercises);
        if (week.weekNumber === 1) {
          exercises = enforceWeek1Rpe(exercises);
        }
        exercises = enforceSetStructure(exercises, goal, strengthTargetLift);
        return { ...day, exercises };
      }),
    })),
  };
}

// deno-lint-ignore no-explicit-any
function enforceEmphasisVariety(planJson: any): any {
  const weeks = (planJson.weeks ?? []) as any[];

  const updatedWeeks = weeks.map((week: any) => {
    const days = (week.days ?? []) as any[];
    const workoutDays = days.filter(
      (d: any) => d.type === 'workout' && Array.isArray(d.exercises),
    );

    // ── PASS 1: Within-day isolation+isolation duplicate emphasis ──
    const daysAfterPass1 = days.map((day: any) => {
      if (day.type !== 'workout' || !Array.isArray(day.exercises)) return day;

      const exercises = [...day.exercises] as any[];
      const seenEmphasis: Record<string, number[]> = {};

      // Index isolation exercises by emphasis
      exercises.forEach((ex: any, idx: number) => {
        const emphasis = String(ex.muscleEmphasis ?? '');
        const tier = String(ex.compoundTier ?? ex.setStructure ?? '');
        const isIsolation = tier === 'isolation' ||
          (!tier && !['primary_compound', 'secondary_compound'].includes(tier));
        if (!emphasis || !isIsolation) return;
        if (!seenEmphasis[emphasis]) seenEmphasis[emphasis] = [];
        seenEmphasis[emphasis].push(idx);
      });

      // For each emphasis with 2+ isolation exercises, swap the second
      for (const [emphasis, indices] of Object.entries(seenEmphasis)) {
        if (indices.length < 2) continue;

        // Find the opposite emphasis to swap toward
        let targetEmphasis: string | null = null;
        if (emphasis === 'long_head_bicep') targetEmphasis = 'short_head_bicep';
        else if (emphasis === 'short_head_bicep') targetEmphasis = 'long_head_bicep';
        else if (emphasis === 'long_head_tricep') targetEmphasis = 'lateral_head_tricep';
        else if (emphasis === 'lateral_head_tricep') targetEmphasis = 'long_head_tricep';
        else continue; // only enforce bicep/tricep within-day for now

        if (!targetEmphasis || !EMPHASIS_ALTERNATIVES[targetEmphasis]) continue;

        // Swap the second duplicate (keep the first)
        const swapIdx = indices[1];
        const current = exercises[swapIdx];
        const currentName = String(current.name ?? '').toLowerCase().trim();

        if (PROTECTED_EXERCISES.has(currentName)) continue;

        // Pick best replacement — prefer same equipment
        const currentEquip = String(current.equipment ?? '');
        const alternatives = EMPHASIS_ALTERNATIVES[targetEmphasis];
        const preferred = alternatives.find((a) => a.equipment === currentEquip)
          ?? alternatives[0];

        if (!preferred) continue;

        exercises[swapIdx] = {
          ...current,
          name: preferred.name,
          muscleEmphasis: targetEmphasis,
          equipment: preferred.equipment,
        };
      }

      return { ...day, exercises };
    });

    // ── PASS 2: Cross-week bicep/tricep head balance ──
    // Collect all emphasis values across all workout days after pass 1
    const weekEmphasisCounts: Record<string, number> = {};
    daysAfterPass1.forEach((day: any) => {
      if (day.type !== 'workout' || !Array.isArray(day.exercises)) return;
      day.exercises.forEach((ex: any) => {
        const emphasis = String(ex.muscleEmphasis ?? '');
        if (!emphasis) return;
        weekEmphasisCounts[emphasis] = (weekEmphasisCounts[emphasis] ?? 0) + 1;
      });
    });

    const checkPairs: [string, string][] = [
      ['long_head_bicep', 'short_head_bicep'],
      ['long_head_tricep', 'lateral_head_tricep'],
    ];

    let daysAfterPass2 = [...daysAfterPass1];

    for (const [emphasisA, emphasisB] of checkPairs) {
      const countA = weekEmphasisCounts[emphasisA] ?? 0;
      const countB = weekEmphasisCounts[emphasisB] ?? 0;

      // Both present — no fix needed
      if (countA > 0 && countB > 0) continue;
      // Neither present — no exercises for this muscle group this week
      if (countA === 0 && countB === 0) continue;

      // One missing — find a day that has the dominant emphasis
      // and swap its lowest-priority isolation exercise
      const dominantEmphasis = countA > 0 ? emphasisA : emphasisB;
      const missingEmphasis = countA === 0 ? emphasisA : emphasisB;
      const alternatives = EMPHASIS_ALTERNATIVES[missingEmphasis];
      if (!alternatives?.length) continue;

      // Find day with most exercises of the dominant emphasis
      // (most likely dedicated arm/pull day)
      let bestDayIdx = -1;
      let bestCount = 0;
      daysAfterPass2.forEach((day: any, idx: number) => {
        if (day.type !== 'workout' || !Array.isArray(day.exercises)) return;
        const count = day.exercises.filter(
          (ex: any) => String(ex.muscleEmphasis ?? '') === dominantEmphasis,
        ).length;
        if (count > bestCount) {
          bestCount = count;
          bestDayIdx = idx;
        }
      });

      if (bestDayIdx < 0 || bestCount < 1) continue;

      const targetDay = daysAfterPass2[bestDayIdx];
      const exercises = [...targetDay.exercises] as any[];

      // Find the last isolation exercise with dominant emphasis
      // (last = lowest priority position in session)
      let swapIdx = -1;
      for (let i = exercises.length - 1; i >= 0; i--) {
        const ex = exercises[i];
        const exEmphasis = String(ex.muscleEmphasis ?? '');
        const exName = String(ex.name ?? '').toLowerCase().trim();
        const tier = String(ex.compoundTier ?? '');
        const isIsolation = tier === 'isolation' ||
          !['primary_compound', 'secondary_compound'].includes(tier);
        if (
          exEmphasis === dominantEmphasis &&
          isIsolation &&
          !PROTECTED_EXERCISES.has(exName)
        ) {
          swapIdx = i;
          break;
        }
      }

      if (swapIdx < 0) continue;

      const current = exercises[swapIdx];
      const currentEquip = String(current.equipment ?? '');
      const preferred = alternatives.find((a) => a.equipment === currentEquip)
        ?? alternatives[0];

      if (!preferred) continue;

      exercises[swapIdx] = {
        ...current,
        name: preferred.name,
        muscleEmphasis: missingEmphasis,
        equipment: preferred.equipment,
      };

      daysAfterPass2 = daysAfterPass2.map((day: any, idx: number) =>
        idx === bestDayIdx ? { ...day, exercises } : day,
      );

      // Update counts for subsequent pair checks
      weekEmphasisCounts[dominantEmphasis] = Math.max(
        0, (weekEmphasisCounts[dominantEmphasis] ?? 1) - 1,
      );
      weekEmphasisCounts[missingEmphasis] =
        (weekEmphasisCounts[missingEmphasis] ?? 0) + 1;
    }

    return { ...week, days: daysAfterPass2 };
  });

  return { ...planJson, weeks: updatedWeeks };
}

// deno-lint-ignore no-explicit-any
function replaceKneeUnsafeExercises(plan: any, injuries: string[] | undefined): any {
  if (!injuries?.some((i) => i.toLowerCase().includes('knee'))) return plan;

  const kneeUnsafe = [
    'squat',
    'lunge',
    'split squat',
    'step-up',
    'box jump',
    'jump',
    'sled sprint',
    'sled push',
    'leg extension',
  ];

  const replacementPool = {
    quads: [
      {
        name: 'Leg Press',
        equipment: 'machine',
        compoundTier: 'secondary_compound',
        coachingNote:
          'Machine-supported quad development — allows high volume without knee impact stress.',
        muscleEmphasis: 'quads',
        muscleGroup: 'Quads',
      },
      {
        name: 'Hack Squat',
        equipment: 'machine',
        compoundTier: 'secondary_compound',
        coachingNote:
          'Machine squat pattern — builds quad strength with controlled range and reduced knee stress.',
        muscleEmphasis: 'quads',
        muscleGroup: 'Quads',
      },
      {
        name: 'Goblet Squat',
        equipment: 'dumbbell',
        compoundTier: 'secondary_compound',
        coachingNote:
          'Front-loaded squat with controlled depth — builds quad and glute strength safely.',
        muscleEmphasis: 'quads',
        muscleGroup: 'Quads',
      },
    ],
    glutes: [
      {
        name: 'Hip Thrust',
        equipment: 'barbell',
        compoundTier: 'secondary_compound',
        coachingNote:
          'Horizontal hip extension that maximally activates the glutes — builds posterior power without knee stress.',
        muscleEmphasis: 'glutes',
        muscleGroup: 'Glutes',
      },
      {
        name: 'Glute Bridge',
        equipment: 'bodyweight',
        compoundTier: 'secondary_compound',
        coachingNote:
          'Hip extension isolation — direct glute activation without loading the knee joint.',
        muscleEmphasis: 'glutes',
        muscleGroup: 'Glutes',
      },
      {
        name: 'Cable Pull-Through',
        equipment: 'cable',
        compoundTier: 'secondary_compound',
        coachingNote:
          'Hip hinge that develops glute and hamstring strength — keeps the knee in a safe neutral position.',
        muscleEmphasis: 'glutes',
        muscleGroup: 'Glutes',
      },
    ],
    hamstrings: [
      {
        name: 'Lying Leg Curl',
        equipment: 'machine',
        compoundTier: 'isolation',
        coachingNote:
          'Hamstring isolation in a supported position — safe posterior chain work with no knee impact.',
        muscleEmphasis: 'hamstrings',
        muscleGroup: 'Hamstrings',
      },
      {
        name: 'Seated Leg Curl',
        equipment: 'machine',
        compoundTier: 'isolation',
        coachingNote:
          'Seated hamstring isolation — builds the posterior chain without hip hinge spinal loading.',
        muscleEmphasis: 'hamstrings',
        muscleGroup: 'Hamstrings',
      },
      {
        name: 'Glute Ham Raise',
        equipment: 'machine',
        compoundTier: 'secondary_compound',
        coachingNote:
          'Eccentric hamstring strength through the full range — builds posterior chain without knee impact.',
        muscleEmphasis: 'hamstrings',
        muscleGroup: 'Hamstrings',
      },
    ],
  };

  for (const week of plan.weeks ?? []) {
    for (const day of week.days ?? []) {
      if (day.type !== 'workout') continue;

      const usedReplacements = new Set<string>();

      // deno-lint-ignore no-explicit-any
      day.exercises = (day.exercises ?? []).map((ex: any) => {
        const name = ex.name?.toLowerCase() ?? '';
        if (!kneeUnsafe.some((u) => name.includes(u))) return ex;

        const mg = (ex.muscleGroup ?? '').toLowerCase();
        let pool: typeof replacementPool.quads;
        if (mg.includes('glute')) pool = replacementPool.glutes;
        else if (mg.includes('hamstring')) pool = replacementPool.hamstrings;
        else pool = replacementPool.quads;

        const replacement =
          pool.find((r) => !usedReplacements.has(r.name)) ?? pool[pool.length - 1];
        usedReplacements.add(replacement.name);

        return {
          ...ex,
          name: replacement.name,
          muscleGroup: replacement.muscleGroup,
          equipment: replacement.equipment,
          compoundTier: replacement.compoundTier,
          coachingNote: replacement.coachingNote,
          muscleEmphasis: replacement.muscleEmphasis,
          setTargets: undefined,
          setStructure: 'straight',
        };
      });
    }
  }
  return plan;
}

// deno-lint-ignore no-explicit-any
function enforceTier1LowerLimit(plan: any): any {
  const tier1Lower = [
    'back squat',
    'front squat',
    'safety bar squat',
    'conventional deadlift',
    'sumo deadlift',
    'trap bar deadlift',
    'deadlift',
  ];

  const exemptSplits = ['strength_focused'];
  if (exemptSplits.includes(plan.split)) return plan;

  const tier2Replacements = [
    {
      name: 'Leg Press',
      equipment: 'machine',
      compoundTier: 'secondary_compound',
      coachingNote:
        'Quad volume without spinal loading — lets you push leg intensity after your primary compound.',
      muscleEmphasis: 'quads',
      muscleGroup: 'Quads',
    },
    {
      name: 'Romanian Deadlift',
      equipment: 'barbell',
      compoundTier: 'secondary_compound',
      coachingNote:
        'Hip hinge that builds hamstring and glute strength through their full range of motion.',
      muscleEmphasis: 'hamstrings',
      muscleGroup: 'Hamstrings',
    },
    {
      name: 'Bulgarian Split Squat',
      equipment: 'dumbbell',
      compoundTier: 'secondary_compound',
      coachingNote:
        'Unilateral leg strength — addresses imbalances that bilateral movements miss.',
      muscleEmphasis: 'glutes',
      muscleGroup: 'Glutes',
    },
  ];

  function isTier1Lower(exerciseName: string | undefined): boolean {
    const n = exerciseName?.toLowerCase() ?? '';
    return tier1Lower.some((t) => n === t || n.includes(t));
  }

  for (const week of plan.weeks ?? []) {
    for (const day of week.days ?? []) {
      if (day.type !== 'workout') continue;

      const exercises = day.exercises ?? [];
      let tier1Count = 0;
      let replacementIndex = 0;

      // deno-lint-ignore no-explicit-any
      day.exercises = exercises.map((ex: any) => {
        if (!isTier1Lower(ex.name)) return ex;
        tier1Count++;

        if (tier1Count === 1) return ex;

        const replacement =
          tier2Replacements[replacementIndex % tier2Replacements.length];
        replacementIndex++;

        return {
          ...ex,
          name: replacement.name,
          muscleGroup: replacement.muscleGroup,
          equipment: replacement.equipment,
          compoundTier: replacement.compoundTier,
          coachingNote: replacement.coachingNote,
          muscleEmphasis: replacement.muscleEmphasis,
          setTargets: undefined,
          setStructure: 'straight',
        };
      });
    }
  }
  return plan;
}

// deno-lint-ignore no-explicit-any
function deduplicateExercises(plan: any): any {
  for (const week of plan.weeks ?? []) {
    for (const day of week.days ?? []) {
      if (day.type !== 'workout') continue;
      const seen = new Set<string>();
      const deduped: unknown[] = [];
      for (const ex of day.exercises ?? []) {
        if (seen.has(ex.name)) continue;
        seen.add(ex.name);
        deduped.push(ex);
      }
      day.exercises = deduped;
    }
  }
  return plan;
}

interface SessionDay {
  day: number;
  dayLabel?: string;
  type: 'workout' | 'rest' | 'cardio';
  focus: string;
  /** Matches onboarding / splitRecommendation when set */
  label?: string;
  targetLiftDay?: boolean;
  /** Canonical catalogue id — same as goalLift */
  primaryLift?: string;
  primaryMuscles: string[];
  sessionIntensity: 'heavy' | 'volume' | 'moderate';
  liftDay?: 'heavy' | 'volume';
}

/**
 * Strength volume days: target lift is exercise #1 (PRD). Stamp 8 reps on first barbell compound
 * after plan_json is fully assembled (title includes "volume"; no goalLift name matching).
 */
// deno-lint-ignore no-explicit-any
function applyStrengthVolumeDayFirstExerciseEightReps(
  planJson: any,
  goal: string,
  goalLift: string | null | undefined,
): void {
  console.log('[POST-PROCESSOR ENTRY]', {
    goal,
    goalLift,
    hasWeeks: !!(planJson?.weeks),
    weeksCount: planJson?.weeks?.length ?? 0,
  });

  if (goal !== 'strength') return;

  for (const week of planJson?.weeks ?? []) {
    for (const day of week?.days ?? []) {
      if (day.type !== 'workout') continue;

      const title = (day.title ?? '').toLowerCase();
      if (!title.includes('volume')) continue;

      const firstExercise = day.exercises?.[0];
      if (!firstExercise) continue;

      const equip = String(firstExercise.equipment ?? '').toLowerCase();
      const isBarbell = equip === 'barbell';
      const compoundTierEffective =
        (firstExercise.compoundTier ??
          getCompoundTierFromName(String(firstExercise.name ?? ''))) as string;
      const isCompound = ['primary_compound', 'secondary_compound'].includes(compoundTierEffective);

      if (!isBarbell || !isCompound) continue;

      firstExercise.reps = '8';
      firstExercise.repsMin = 8;
      firstExercise.repsMax = 8;
      firstExercise.setStructure = 'straight';
      delete firstExercise.setTargets;

      console.log('[PLAN GEN VOLUME REPS]', {
        week: week.weekNumber,
        day: day.title,
        exercise: firstExercise.name,
        volumeReps: 8,
      });
    }
  }
}

interface GeneratePlanBody {
  goal?: string;
  experience?: string;
  daysPerWeek?: number | string;
  /** User's lifting days (Mon–Sun chips); preferred alias for scheduledDays */
  trainingDays?: string[];
  /** BUG-8: Same as trainingDays — persisted on plan_json root for dashboard */
  scheduledDays?: string[];
  sessionLength?: string;
  equipment?: string;
  injuries?: string[];
  excludedExercises?: string[];
  splitId?: string;
  splitName?: string;
  splitRationale?: string;
  sessionStructure?: SessionDay[];
  /** Alias / snake_case catalogue id — takes precedence over `targetLift` when both sent */
  goalLift?: string;
  targetLift?: string;
  current1RM?: number | string;
  target1RM?: number | string;
  liftFrequency?: number;
  priorityMuscles?: string[];
  /** S02b sub-muscle focus — biases exercise selection for priority muscles */
  subMusclePreferences?: Record<string, string> | null;
  currentSplit?: string | null;
  currentSplitOther?: string | null;
  splitDuration?: string | null;
  trainingBackground?: string | null;
  /** Legacy / extra fields not in the primary contract */
  planDuration?: number | string;
  /** Numeric weeks from client (preferred over parsing planDuration chips) */
  recommendedWeeks?: number | string;
  totalWeeks?: number | string;
  weeks?: number | string;
  plan_duration_weeks?: number | string;
  /** Fat-loss timeline chip id (8w, 12w, …) */
  targetDate?: string | null;
  split?: string;
  targetWeightLbs?: number | string;
  goalTargetWeight?: number | string;
  startingWeightLbs?: number | string;
  calories?: number;
  weightLbs?: number | string;
  heightFt?: number | string;
  heightIn?: number | string;
  age?: number | string;
  bodyFatPct?: number | string | null;
  caloriePace?: string;
  /** GAP-5: Power-hypertrophy optional multi-lift current 1RM estimates */
  currentLifts?: {
    benchPress: number | null;
    backSquat: number | null;
    deadlift: number | null;
    overheadPress: number | null;
  } | null;
  /** GAP-2: Enhanced recovery flag — user indicates exceptional recovery capacity */
  enhancedRecovery?: boolean;
  /** GAP-1: Concurrent sport training context */
  concurrentSport?: { type: string[]; daysPerWeek: number } | null;
  /** GAP-8: Biological sex for sex-aware rep range and volume adjustments */
  biologicalSex?: 'male' | 'female' | 'prefer_not_to_say' | null;
  sex?: string;
  /** Layer A: lite 2-session preview (onboarding) */
  isPreview?: boolean;
  planGenerationMode?: 'preview' | 'full';
  userId?: string;
  deviceId?: string;
}

interface ProgrammingParams {
  sets: number;
  reps: string;
  restSeconds: number;
  targetRpe: number;
  weeklySetMin: number;
  weeklySetMax: number;
  prioritySetMin: number;
  prioritySetMax: number;
}

/** Weekly set bands derived from training frequency + experience (replaces flat per-experience landmarks in prompts). */
function getVolumeTargets(
  daysPerWeek: number,
  experience: string,
  _sessionLength: string,
): {
  weeklySetMin: number;
  weeklySetMax: number;
  prioritySetMin: number;
  prioritySetMax: number;
} {
  const d = Math.min(7, Math.max(2, Math.round(daysPerWeek)));
  const byDays: Record<number, { min: number; max: number }> = {
    2: { min: 8, max: 14 },
    3: { min: 10, max: 16 },
    4: { min: 12, max: 18 },
    5: { min: 14, max: 20 },
    6: { min: 16, max: 22 },
    7: { min: 16, max: 22 },
  };
  const base = byDays[d] ?? byDays[4];

  const expMultiplier =
    {
      beginner: 0.7,
      intermediate: 0.85,
      advanced: 1.0,
    }[experience] ?? 0.85;

  const targetSets = Math.round(
    base.min + (base.max - base.min) * expMultiplier,
  );

  return {
    weeklySetMin: base.min,
    weeklySetMax: base.max,
    prioritySetMin: Math.round(targetSets),
    prioritySetMax: Math.min(base.max, Math.round(targetSets) + 2),
  };
}

const GOAL_PROGRAMMING: Record<string, Record<string, ProgrammingParams>> = {
  strength: {
    beginner: {
      sets: 3,
      reps: '3-5',
      restSeconds: 240,
      targetRpe: 7,
      weeklySetMin: 8,
      weeklySetMax: 10,
      prioritySetMin: 10,
      prioritySetMax: 12,
    },
    intermediate: {
      sets: 5,
      reps: '3-5',
      restSeconds: 240,
      targetRpe: 8,
      weeklySetMin: 10,
      weeklySetMax: 16,
      prioritySetMin: 14,
      prioritySetMax: 18,
    },
    advanced: {
      sets: 6,
      reps: '1-5',
      restSeconds: 300,
      targetRpe: 9,
      weeklySetMin: 12,
      weeklySetMax: 20,
      prioritySetMin: 16,
      prioritySetMax: 22,
    },
  },
  hypertrophy: {
    beginner: {
      sets: 3,
      reps: '8-12',
      restSeconds: 90,
      targetRpe: 7,
      weeklySetMin: 8,
      weeklySetMax: 10,
      prioritySetMin: 10,
      prioritySetMax: 12,
    },
    intermediate: {
      sets: 4,
      reps: '6-12',
      restSeconds: 90,
      targetRpe: 8,
      weeklySetMin: 10,
      weeklySetMax: 16,
      prioritySetMin: 14,
      prioritySetMax: 18,
    },
    advanced: {
      sets: 5,
      reps: '6-15',
      restSeconds: 75,
      targetRpe: 9,
      weeklySetMin: 14,
      weeklySetMax: 20,
      prioritySetMin: 18,
      prioritySetMax: 22,
    },
  },
  // GAP-5: Power-Hypertrophy uses strength params for Phase 1 and hypertrophy params
  // for Phase 2. The prompt handles the two-phase split; these are the Phase 2 defaults.
  power_hypertrophy: {
    beginner: {
      sets: 3,
      reps: '6-12',
      restSeconds: 90,
      targetRpe: 7,
      weeklySetMin: 10,
      weeklySetMax: 14,
      prioritySetMin: 12,
      prioritySetMax: 16,
    },
    intermediate: {
      sets: 4,
      reps: '6-12',
      restSeconds: 90,
      targetRpe: 8,
      weeklySetMin: 12,
      weeklySetMax: 18,
      prioritySetMin: 14,
      prioritySetMax: 20,
    },
    advanced: {
      sets: 5,
      reps: '6-12',
      restSeconds: 90,
      targetRpe: 8,
      weeklySetMin: 14,
      weeklySetMax: 22,
      prioritySetMin: 18,
      prioritySetMax: 24,
    },
  },
  recomp: {
    beginner: {
      sets: 2,
      reps: '10-15',
      restSeconds: 60,
      targetRpe: 6,
      weeklySetMin: 6,
      weeklySetMax: 10,
      prioritySetMin: 8,
      prioritySetMax: 12,
    },
    intermediate: {
      sets: 3,
      reps: '8-15',
      restSeconds: 75,
      targetRpe: 7,
      weeklySetMin: 10,
      weeklySetMax: 14,
      prioritySetMin: 12,
      prioritySetMax: 16,
    },
    advanced: {
      sets: 4,
      reps: '8-12',
      restSeconds: 75,
      targetRpe: 8,
      weeklySetMin: 12,
      weeklySetMax: 16,
      prioritySetMin: 14,
      prioritySetMax: 18,
    },
  },
  fat_loss: {
    beginner: {
      sets: 2,
      reps: '12-15',
      restSeconds: 45,
      targetRpe: 6,
      weeklySetMin: 6,
      weeklySetMax: 8,
      prioritySetMin: 8,
      prioritySetMax: 10,
    },
    intermediate: {
      sets: 3,
      reps: '10-20',
      restSeconds: 60,
      targetRpe: 7,
      weeklySetMin: 8,
      weeklySetMax: 12,
      prioritySetMin: 10,
      prioritySetMax: 14,
    },
    advanced: {
      sets: 4,
      reps: '10-20',
      restSeconds: 60,
      targetRpe: 8,
      weeklySetMin: 10,
      weeklySetMax: 14,
      prioritySetMin: 12,
      prioritySetMax: 16,
    },
  },
  general: {
    beginner: {
      sets: 2,
      reps: '8-12',
      restSeconds: 90,
      targetRpe: 6,
      weeklySetMin: 6,
      weeklySetMax: 8,
      prioritySetMin: 8,
      prioritySetMax: 10,
    },
    intermediate: {
      sets: 3,
      reps: '8-12',
      restSeconds: 90,
      targetRpe: 7,
      weeklySetMin: 8,
      weeklySetMax: 12,
      prioritySetMin: 10,
      prioritySetMax: 14,
    },
    advanced: {
      sets: 4,
      reps: '8-12',
      restSeconds: 90,
      targetRpe: 8,
      weeklySetMin: 10,
      weeklySetMax: 16,
      prioritySetMin: 12,
      prioritySetMax: 18,
    },
  },
};

const HYPERTROPHY_REP_GUIDANCE = {
  advanced: {
    compounds: '6-10',
    secondaryCompounds: '8-12',
    isolations: '10-15',
  },
};

const FEMALE_REP_MAP: Record<string, string> = {
  '3-5': '5-7',
  '3-6': '5-8',
  '4-6': '6-8',
  '5-8': '7-10',
  '6-8': '8-10',
  '6-10': '8-12',
  '8-10': '10-12',
  '8-12': '10-14',
  '10-12': '12-14',
  '10-14': '12-16',
  '10-15': '12-17',
  '12-15': '14-17',
  '12-16': '14-18',
  '15-20': '17-22',
};

function adjustRepRange(repRange: string, biologicalSex: string): string {
  if (biologicalSex !== 'female') return repRange;

  // Strip suffix for lookup (e.g. " each side")
  const match = repRange.match(/^([\d]+-[\d]+)(.*)/);
  if (!match) return repRange;

  const baseRange = match[1];
  const suffix = match[2] ?? '';

  // Use lookup table first
  if (FEMALE_REP_MAP[baseRange]) {
    return `${FEMALE_REP_MAP[baseRange]}${suffix}`;
  }

  // Fallback: parse and add +2 to both ends
  const parts = baseRange.split('-');
  if (parts.length === 2) {
    const low = parseInt(parts[0], 10);
    const high = parseInt(parts[1], 10);
    if (!isNaN(low) && !isNaN(high)) {
      return `${low + 2}-${high + 2}${suffix}`;
    }
  }

  return repRange;
}

console.log('[adjustRepRange] tests:',
  adjustRepRange('3-6', 'female'),   // 5-8
  adjustRepRange('5-8', 'female'),   // 7-10 (if Claude drifts on Phase 1)
  adjustRepRange('8-12', 'female'),  // 10-14
  adjustRepRange('10-12', 'female'), // 12-14 (if Claude uses 10-12)
  adjustRepRange('6-8', 'female'),   // 8-10
  adjustRepRange('8-12', 'male'),    // 8-12
);

// GAP-8: Post-processing enforcement — Claude is non-compliant for certain exercises
// (e.g. Bench Press, Barbell Row revert to standard ranges). Female: rep buckets + lookup.
// Male power_hypertrophy: Phase 2 minimum rep floor (hypertrophy tag must not use strength ranges).
// deno-lint-ignore no-explicit-any
function enforceRepRanges(planJson: any, bSex: string): any {
  return {
    ...planJson,
    // deno-lint-ignore no-explicit-any
    weeks: (planJson.weeks ?? []).map((week: any) => ({
      ...week,
      // deno-lint-ignore no-explicit-any
      days: (week.days ?? []).map((day: any) => {
        if (day.type === 'cardio') {
          return { ...day, exercises: [] };
        }
        return {
          ...day,
          // deno-lint-ignore no-explicit-any
          exercises: (day.exercises ?? []).map((exercise: any) => {
          let adjustedReps = exercise.reps;

          if (bSex === 'female') {
            if (exercise.phase === 'strength') {
              // Phase 1: always force 5-8 regardless of Claude output
              adjustedReps = '5-8';
            } else if (exercise.phase === 'hypertrophy') {
              // Phase 2: bucket by the LOW end of Claude's range
              const raw = String(exercise.reps ?? '');
              const lowEnd = parseInt(raw.split('-')[0] ?? '', 10);
              const suffix = raw.includes('each') ? ' each side' : '';

              if (Number.isNaN(lowEnd)) {
                adjustedReps = adjustRepRange(raw, bSex);
              } else if (lowEnd <= 9) {
                adjustedReps = `10-14${suffix}`; // ≤9 → 10-14 (was 8-12 for ≤6; pull-ups etc.)
              } else if (lowEnd <= 11) {
                adjustedReps = `12-16${suffix}`; // 10-12, 10-15 → 12-16
              } else if (lowEnd <= 13) {
                adjustedReps = `14-18${suffix}`; // 12-15, 12-16 → 14-18
              } else {
                adjustedReps = `17-22${suffix}`; // 15-20 → 17-22
              }
            } else {
              // Non-phase exercises (non power_hypertrophy plans)
              adjustedReps = adjustRepRange(exercise.reps ?? '', bSex);
            }
          } else if (bSex === 'male' || !bSex) {
            // Male PH: enforce minimum 8 reps on Phase 2 (Claude sometimes outputs 6-8)
            if (planJson.goal === 'power_hypertrophy' && exercise.phase === 'hypertrophy') {
              const raw = String(exercise.reps ?? '');
              const lowEnd = parseInt(raw.split('-')[0] ?? '', 10);
              if (!Number.isNaN(lowEnd) && lowEnd < 8) {
                adjustedReps = '8-12';
                console.log(
                  `[enforce] Male Phase 2 rep correction: ${exercise.name} ${exercise.reps} → 8-12`,
                );
              }
            }
          }

          return { ...exercise, reps: adjustedReps };
        })
        };
      }),
    })),
  };
}

// Calculate starting weight from 1RM percentage
function week1Factor(experience: string): number {
  switch (experience?.toLowerCase()) {
    case 'beginner':
      return 0.7;
    case 'intermediate':
      return 0.75;
    case 'advanced':
      return 0.82;
    default:
      return 0.75;
  }
}

function calculateStartingWeight(oneRM: number, percentage: number): number {
  return Math.round((oneRM * percentage) / 2.5) * 2.5;
}

function buildSessionBreakdown(sessionStructure: SessionDay[]): string {
  return sessionStructure
    .map((day) => {
      const dow = day.dayLabel ? ` (${day.dayLabel})` : '';
      if (day.type === 'rest') {
        return `Day ${day.day}${dow}: Rest day`;
      }
      if (day.type === 'cardio') {
        return `Day ${day.day}${dow}: Cardio day`;
      }
      const muscles = Array.isArray(day.primaryMuscles) ? day.primaryMuscles.join(', ') : '';
      const intensity = day.sessionIntensity;
      const label =
        typeof day.label === 'string' && day.label.trim() !== ''
          ? day.label.trim()
          : day.focus;
      const liftNote = day.liftDay
        ? ` — this is the ${day.liftDay} day for the target lift`
        : '';
      return `Day ${day.day}${dow}: ${label} (${day.focus}) — primary muscles: ${muscles}, intensity: ${intensity}${liftNote}`;
    })
    .join('\n');
}

const LIFT_ACCESSORIES: Record<
  string,
  { direct: string[]; tricepLockout: string[]; stability: string[]; upperBack: string[] }
> = {
  'bench press': {
    direct: ['Close Grip Bench Press', 'Incline Barbell Press', 'Incline Dumbbell Press'],
    tricepLockout: ['Tricep Pushdown', 'Skull Crushers', 'Weighted Dips', 'Close Grip Bench Press'],
    stability: ['Face Pulls', 'Rear Delt Fly', 'Band Pull-Aparts', 'Cable External Rotation'],
    upperBack: ['Barbell Row', 'Seated Cable Row', 'Chest-Supported Row'],
  },
  'back squat': {
    direct: ['Pause Squat', 'Box Squat', 'Front Squat'],
    tricepLockout: [],
    stability: ['Glute Bridge', 'Clamshells', 'Hip Abduction'],
    upperBack: ['Romanian Deadlift', 'Good Morning', 'Glute Ham Raise'],
  },
  deadlift: {
    direct: ['Romanian Deadlift', 'Rack Pull', 'Deficit Deadlift'],
    tricepLockout: [],
    stability: ['Glute Ham Raise', 'Back Extension', 'Bird Dog'],
    upperBack: ['Barbell Row', 'Weighted Pull-up', 'Farmer Carry'],
  },
  'overhead press': {
    direct: ['Push Press', 'Seated DB Press', 'Arnold Press'],
    tricepLockout: ['Tricep Pushdown', 'Skull Crushers', 'Dips'],
    stability: ['Face Pulls', 'Band Pull-Aparts', 'Y-T-W Raises'],
    upperBack: ['Barbell Row', 'Lat Pulldown', 'Rear Delt Row'],
  },
  'barbell row': {
    direct: ['Lat Pulldown', 'Cable Row', 'Chest-Supported Row'],
    tricepLockout: [],
    stability: ['Face Pull', 'Band Pull-Aparts', 'Reverse Fly'],
    upperBack: ['Straight-Arm Pulldown', 'Single-Arm Row', 'Seated Cable Row'],
  },
  'pull-up': {
    direct: ['Lat Pulldown', 'Chin-up', 'Straight-Arm Pulldown'],
    tricepLockout: [],
    stability: ['Face Pull', 'Dead Hang', 'Scap Pull-up'],
    upperBack: ['Barbell Row', 'Cable Row', 'Chest-Supported Row'],
  },
};

function resolveStrengthTargetLiftKey(targetLift: string): string {
  const k = targetLift.replace(/_/g, ' ').toLowerCase().trim();
  if (k.includes('bench')) return 'bench press';
  if (k.includes('front squat') || k === 'squat' || k.includes('back squat')) {
    return 'back squat';
  }
  if (k.includes('sumo') && k.includes('deadlift')) return 'deadlift';
  if (k.includes('romanian')) return 'deadlift';
  if (k.includes('deadlift')) return 'deadlift';
  if (k.includes('overhead') || k === 'ohp') return 'overhead press';
  if (k.includes('row')) return 'barbell row';
  if (k.includes('pull')) return 'pull-up';
  return 'bench press';
}

const MOVEMENT_PATTERN_BLOCK = `MOVEMENT PATTERN REQUIREMENTS — every weekly plan must include at least one exercise from each of these patterns:
- Horizontal push: Bench Press, DB Press, Push-up variants
- Horizontal pull: Barbell Row, Cable Row, DB Row, Machine Row
- Squat pattern: Back Squat, Front Squat, Goblet Squat, Hack Squat
- Hinge pattern: Deadlift, Romanian Deadlift, Hip Thrust, Good Morning
- Core: Plank, Ab Wheel, Pallof Press, Cable Crunch, Hanging Leg Raise
- Vertical push (min every other week): Overhead Press, Arnold Press
- Vertical pull (min every other week): Pull-up, Lat Pulldown, Cable Pulldown
- Single leg (min every other week): Lunge, Bulgarian Split Squat, Step-up

For a 3-day PPL: horizontal push + horizontal pull + squat + hinge + core MUST all appear in Week 1. Vertical push/pull can be distributed across days.`;

const SESSION_LENGTH_RULES: Record<string, { note: string }> = {
  '30-45': {
    note:
      'Use shorter rest periods. ' +
      'Prioritise compound movements only — no isolation work ' +
      'unless there is time after the main lifts. ' +
      'Supersets acceptable for antagonist pairs (e.g. bench + row).',
  },
  '45-60': {
    note:
      'Normal rest periods. ' +
      'Include 1–2 isolation exercises after main compounds.',
  },
  '60-90': {
    note:
      'Full exercise selection where time allows. ' +
      'Standard rest periods. Include 2–3 isolation exercises.',
  },
  '90+': {
    note:
      'Full volume programming when time allows. ' +
      'Full rest periods for strength work. ' +
      'Include complete isolation work for all target muscles. ' +
      'Strength goal: include longer pause/technique sets.',
  },
};

const TIMELINE_CHIP_WEEKS: Record<string, number> = {
  '4w': 4,
  '8w': 8,
  '12w': 12,
  '16w': 16,
  '24w': 24,
};

function resolveTotalWeeks(body: GeneratePlanBody): number {
  const tryNum = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) {
      const r = Math.round(v);
      return r >= 1 && r <= 104 ? r : null;
    }
    const s = String(v).trim();
    const lead = s.match(/^\d+/);
    if (lead) {
      const n = parseInt(lead[0], 10);
      return n >= 1 && n <= 104 ? n : null;
    }
    return null;
  };

  const fromFields =
    tryNum(body.recommendedWeeks) ??
    tryNum(body.totalWeeks) ??
    tryNum(body.planDuration) ??
    tryNum(body.weeks) ??
    tryNum(body.plan_duration_weeks);

  if (fromFields != null) return fromFields;

  const td = body.targetDate;
  if (typeof td === 'string' && TIMELINE_CHIP_WEEKS[td] != null) {
    return TIMELINE_CHIP_WEEKS[td];
  }

  return 12;
}

function getMaxExercises(sessionLength: string, experience: string): number {
  const base: Record<string, number> = {
    '30-45': 4,
    '45-60': 5,
    '60-90': 6,
    '90+': 7,
  };
  const expBonus: Record<string, number> = {
    beginner: -1,
    intermediate: 0,
    advanced: 1,
  };
  const baseCount = base[sessionLength] ?? 5;
  const bonus = expBonus[experience] ?? 0;
  return Math.min(Math.max(1, baseCount + bonus), 8);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as GeneratePlanBody;
    const isPreview =
      body.isPreview === true || body.planGenerationMode === 'preview';
    const userId =
      typeof body.userId === 'string' && body.userId.trim() !== '' ? body.userId.trim() : null;
    const deviceId =
      typeof body.deviceId === 'string' && body.deviceId.trim() !== ''
        ? body.deviceId.trim()
        : null;

    if (RATE_LIMIT_ENABLED && userId) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );
      const blocked = await checkRateLimits(supabaseAdmin, userId, deviceId, isPreview);
      if (blocked) return blocked;
    }

    const {
      goal: goalIn = 'general',
      experience: experienceIn = 'intermediate',
      daysPerWeek: daysPerWeekIn = 4,
      trainingDays: trainingDaysIn = [],
      scheduledDays: scheduledDaysBody,
      equipment = '',
      injuries: injuriesIn = [],
      excludedExercises: excludedExercisesIn = [],
      splitId: splitIdIn,
      splitName: splitNameIn,
      splitRationale = '',
      sessionStructure,
      targetLift,
      goalLift: goalLiftIn,
      current1RM,
      target1RM,
      liftFrequency,
      priorityMuscles,
      subMusclePreferences: subMusclePreferencesIn,
    } = body;

    const workoutDayCount = (sessionStructure ?? []).filter(
      (d: SessionDay) => d.type === 'workout',
    ).length;

    const sessionLength: string = body.sessionLength ?? '45-60';

    const currentSplit: string | null = body.currentSplit ?? null;
    const currentSplitOther: string | null = body.currentSplitOther ?? null;
    const splitDuration: string | null = body.splitDuration ?? null;
    const trainingBackground: string | null = body.trainingBackground ?? null;
    const currentLifts = body.currentLifts ?? null;
    const enhancedRecovery = body.enhancedRecovery === true;
    const concurrentSport = body.concurrentSport ?? null;
    // GAP-8: Sex-aware programming — read from body (collected at S05 BodyMetrics as 'sex')
    const biologicalSex: string = body.biologicalSex ?? body.sex ?? 'male';
    const subMusclePreferences: Record<string, string> =
      subMusclePreferencesIn &&
      typeof subMusclePreferencesIn === 'object' &&
      !Array.isArray(subMusclePreferencesIn)
        ? (subMusclePreferencesIn as Record<string, string>)
        : {};

    // GAP-8: Prompt always uses base (male-equivalent) rep ranges; enforceRepRanges()
    // post-processes female +2 after Claude — single source of truth, no double application.

    const goal = goalIn ?? 'general';

    /** Primary key for strength 1RM lift — `goalLift` aliases catalogue ids; falls back to `targetLift`. */
    const strengthProgramLiftId =
      typeof goalLiftIn === 'string' && goalLiftIn.trim() !== ''
        ? goalLiftIn.trim()
        : targetLift != null && String(targetLift).trim() !== ''
          ? String(targetLift).trim()
          : null;

    const trainingDays: string[] = (() => {
      if (Array.isArray(scheduledDaysBody) && scheduledDaysBody.length > 0) {
        return scheduledDaysBody.filter((d): d is string => typeof d === 'string' && d.length > 0);
      }
      if (Array.isArray(trainingDaysIn) && trainingDaysIn.length > 0) {
        return trainingDaysIn.filter((d): d is string => typeof d === 'string' && d.length > 0);
      }
      return [];
    })();
    const daysPerWeekParsed = parseInt(String(daysPerWeekIn ?? '4'), 10);
    const expRaw = String(experienceIn ?? 'intermediate').toLowerCase();
    const experience =
      expRaw === 'beginner' || expRaw === 'intermediate' || expRaw === 'advanced'
        ? expRaw
        : 'intermediate';
    const params =
      GOAL_PROGRAMMING[goal]?.[experience] ??
      GOAL_PROGRAMMING[goal]?.['intermediate'] ??
      GOAL_PROGRAMMING.general['intermediate'];

    const totalWeeks = resolveTotalWeeks(body);
    console.log('[generate-plan] params received:', {
      goal: body.goal,
      experience: body.experience,
      workoutDayCount: (sessionStructure ?? []).filter(
        (d: SessionDay) => d.type === 'workout',
      ).length,
      totalWeeks,
      splitId: body.splitId,
      caloriePace: body.caloriePace,
      sessionStructureLength: body.sessionStructure?.length,
      bodyKeys: Object.keys(body),
    });

    const sessionRules =
      SESSION_LENGTH_RULES[sessionLength] ?? SESSION_LENGTH_RULES['45-60'];
    const maxExercises = getMaxExercises(sessionLength, experience);

    const injuries = Array.isArray(injuriesIn) ? injuriesIn : [];
    const excludedExercises = Array.isArray(excludedExercisesIn) ? excludedExercisesIn : [];

    const exclusions = [...injuries, ...excludedExercises].join(', ') || 'none';

    const hasStructure = Array.isArray(sessionStructure) && sessionStructure.length > 0;
    const structureArr = hasStructure ? (sessionStructure as SessionDay[]) : [];
    const workoutDaysInStructure = structureArr.filter((d) => d.type === 'workout').length;
    const actualDaysPerWeek =
      workoutDaysInStructure > 0
        ? workoutDaysInStructure
        : trainingDays.length > 0
          ? trainingDays.length
          : daysPerWeekParsed;

    const nutritionContext = computeNutritionContext(body, actualDaysPerWeek);
    const nutritionContextBlock = buildNutritionContextBlock(
      nutritionContext.calorieDirection,
    );

    const volumeTargets = getVolumeTargets(
      actualDaysPerWeek,
      experience,
      sessionLength,
    );

    const absoluteRuleDayCount = workoutDayCount > 0 ? workoutDayCount : actualDaysPerWeek;

    const absoluteRuleBlock = `
ABSOLUTE RULE — SESSION COUNT:
The user trains ${absoluteRuleDayCount} days per week.
You must generate EXACTLY ${absoluteRuleDayCount} workout days in every week of the plan.
Generating more or fewer workout days than ${absoluteRuleDayCount} is a critical error.
Do not use the split name to determine how many days to generate.
The split name describes the training philosophy only.
The sessionStructure array below defines the exact sessions — use it.
`;

    const sessionStructureFollowBlock = `Session structure (follow exactly — do not add sessions):
${JSON.stringify(sessionStructure ?? [], null, 2)}

Each object with type === 'workout' maps to exactly one DayObject.
The title, focus, and primaryMuscles from each session object are your starting
point — fill in the exercises using goal, experience, equipment, and volume targets.`;

    let effectiveSplit = body.split ?? 'ppl';
    let splitOverrideNote = '';

    if (!hasStructure) {
      if (goal === 'strength') {
        const d = daysPerWeekParsed;
        const chosenSplit = body.split ?? 'ppl';

        if (chosenSplit === 'ppl' && d <= 3) {
          effectiveSplit = 'upper_lower';
          splitOverrideNote = `Note: The athlete selected PPL with ${d} days, but I've switched to Upper/Lower so ${targetLift?.replace(/_/g, ' ') ?? 'the target lift'} appears twice per week. Mention this in your plan title or first coaching note.`;
        } else if (chosenSplit === 'bro_split') {
          effectiveSplit = 'upper_lower';
          splitOverrideNote = `Note: The athlete selected Bro Split which doesn't suit 1RM progression. I've switched to Upper/Lower for better frequency on the target lift. Mention this briefly.`;
        } else if (chosenSplit === 'full_body' && d >= 4) {
          effectiveSplit = 'upper_lower';
          splitOverrideNote = `Note: Switched from Full Body to Upper/Lower at ${d} days — better recovery between sessions at this frequency.`;
        }
      }
    }

    const splitId = hasStructure ? (splitIdIn ?? body.split ?? 'ppl') : effectiveSplit;
    const splitName = hasStructure ? (splitNameIn ?? splitId) : effectiveSplit;
    const sessionBreakdown = hasStructure ? buildSessionBreakdown(sessionStructure as SessionDay[]) : '';

    const hasTargetLiftDays =
      hasStructure &&
      structureArr.some((d) => d.type === 'workout' && d.targetLiftDay === true);

    const strengthTargetLiftStructuredBlock =
      goal === 'strength' && hasTargetLiftDays && sessionStructure
        ? (() => {
            const workouts = structureArr.filter((d) => d.type === 'workout');
            const workoutLines = workouts
              .map((d) => {
                const title =
                  typeof d.label === 'string' && d.label.trim() !== ''
                    ? d.label.trim()
                    : d.focus;
                const plRaw = d.primaryLift ?? strengthProgramLiftId ?? '';
                const pl = String(plRaw).replace(/_/g, ' ');
                return `- "${title}": ${d.focus} day. The target lift (${pl}) is exercise #1. Nothing fatiguing before it.`;
              })
              .join('\n');
            const anyUpper = workouts.some(
              (d) => d.focus === 'heavy_upper' || d.focus === 'volume_upper',
            );
            const anyLower = workouts.some(
              (d) => d.focus === 'heavy_lower' || d.focus === 'volume_lower',
            );

            let bodyConstraint = '';
            if (anyUpper) {
              bodyConstraint +=
                '\n\nUPPER BODY DAYS (heavy_upper, volume_upper):\n' +
                '  ONLY upper body exercises. NEVER program squats, deadlifts, leg press,\n' +
                '  lunges, RDL, leg curl, calf raises, or any lower body movement.';
            }
            if (anyLower) {
              bodyConstraint +=
                '\n\nLOWER BODY DAYS (heavy_lower, volume_lower):\n' +
                '  ONLY lower body exercises. NEVER program bench press, rows,\n' +
                '  overhead press, pull-ups, curls, or any upper body movement.';
            }

            return `

CRITICAL SESSION STRUCTURE — do not deviate:
${workoutLines}

For "Heavy Upper" or "Heavy Lower" days:
  Target lift: W1 5×5 @ RPE 7. Accessories: 2–3 exercises.
For "Volume Upper" or "Volume Lower" days:
  Target lift Week 1: follow VOLUME DAY rules in RULE 3 (heavy load × 0.85 rounded 2.5 lb; target-lift reps = 8 per set on every volume day; same set count).
${bodyConstraint}
`;
          })()
        : '';

    const weeklyStructureBlock = hasStructure
      ? `
WEEKLY STRUCTURE (do not deviate from this):
${sessionBreakdown}
${strengthTargetLiftStructuredBlock}

Split (philosophy / exercise selection only — not a template for how many days to generate): ${splitName}
Rationale: ${splitRationale || '—'}

For each workout day, generate exercises that match the stated primary muscles and session intensity.

sessionIntensity rules:
- 'heavy': lower rep range (strength end), higher load, longer rest
- 'volume': higher rep range, moderate load, standard rest
- 'moderate': middle of the rep range, standard load and rest

Do NOT add additional workout days or combine rest days with training.
`
      : '';

    const splitForNormalized = hasStructure ? splitId : effectiveSplit;

    // Build goal-specific context for the prompt
    let goalContext = '';
    let weightAnchor = '';
    let exerciseSelectionSection = '';

    if (goal === 'strength' && current1RM != null && String(current1RM) !== '' && targetLift) {
      const current1RMNum = parseFloat(String(current1RM ?? '0'));
      const target1RMNum = parseFloat(String(target1RM ?? current1RM ?? '0'));
      const strengthW1Factor = week1Factor(experience);
      const week1Weight = calculateStartingWeight(current1RMNum, strengthW1Factor);
      const heavyDayWeight = Math.round((current1RMNum * strengthW1Factor) / 2.5) * 2.5;
      const volumeDayWeight = Math.round((heavyDayWeight * 0.85) / 2.5) * 2.5;
      const heavyTargetSets = 5;
      const heavyTargetRepsPerSet = 5;
      const volumeDayRepsPerSet = 8;
      const liftName = targetLift.replace(/_/g, ' ');
      const liftKeyResolved = resolveStrengthTargetLiftKey(targetLift);
      const accessories = LIFT_ACCESSORIES[liftKeyResolved] ?? LIFT_ACCESSORIES['bench press'];

      goalContext = `Primary lift: ${liftName}. Current 1RM: ${current1RMNum} lbs. Target 1RM: ${target1RMNum} lbs over ${totalWeeks} weeks.`;
      weightAnchor = `
STRENGTH GOAL — TARGET LIFT PROGRAMMING RULES:

When goal === 'strength' and a targetLift is specified:

RULE 1 — FREQUENCY: The target lift MUST appear in each workout session that sessionStructure designates for it (typically two sessions per week: one heavy-oriented, one volume-oriented). Week 1 target-lift rep/load prescriptions are pinned below — do NOT substitute generic "4×6 vs 5×5" templates that contradict RULE 6 + RULE 3 + the FIXED ATHLETE WEEK 1 block.

RULE 2 — HEAVY DAY: The target lift is the FIRST exercise of the heavy session. Nothing fatiguing precedes it. If it's a squat-pattern lift (Back Squat, Front Squat), no deadlifts or heavy RDLs earlier in that session.

RULE 3 — VOLUME DAY (focus: volume_upper or volume_lower):

VOLUME DAY target lift: always 8 reps regardless of week.
The volume day is hypertrophy-focused — higher reps, lower intensity than the heavy day.

VOLUME DAY rules (focus: volume_upper or volume_lower):
 - Target lift weight: heavy day weight × 0.85, rounded to nearest 2.5 lbs
   Example: heavy day = 275 lbs → volume day = 235 lbs
 - Target lift reps: 8 per set on the target lift (fixed; not tied to heavy-day rep prescription)
   Example: heavy day = 5×5 → volume day = 5×8 at the volume-day weight above
 - Target lift sets: same as heavy day
 - sessionFocus text MUST match the exercise prescription exactly — for volume_upper use the pattern:
   'Volume upper — {sets}×{reps} bench at {weight}lbs.' (adapt "bench" to the actual lift noun: press, squat, deadlift, etc.)
   For volume_lower use the parallel pattern 'Volume lower — {sets}×{reps} … at {weight}lbs.'
   where {sets}, {reps}, {weight} match the FIRST target lift exercise JSON for that day, and {weight} = Math.round((heavyDayWeight * 0.85) / 2.5) * 2.5
 - Accessories: higher rep ranges (3×8–12), same upper body muscles


FIXED ATHLETE WEEK 1 TARGET-LIFT SESSION LOADS (for this athlete only — JSON must match):

Heavy day W1: ${heavyDayWeight} lbs × ${heavyTargetRepsPerSet} reps (${heavyTargetSets}×${heavyTargetRepsPerSet})
Volume day W1: ${volumeDayWeight} lbs × ${volumeDayRepsPerSet} reps (${heavyTargetSets}×${volumeDayRepsPerSet})

These numbers are fixed — do not change them.

On any day with focus volume_upper or volume_lower, the FIRST target-lift exercise must use: targetWeight = ${volumeDayWeight}, sets = ${heavyTargetSets}, reps = "${volumeDayRepsPerSet}" (straight sets — same wording in reps field across sets). sessionFocus for that workout day MUST state exactly ${heavyTargetSets}×${volumeDayRepsPerSet} and ${volumeDayWeight} lbs for the primary lift description (same lift name spelling as elsewhere in JSON). Do NOT program 5×5 on volume day.



RULE 4 — ACCESSORIES: Program 2-3 accessory exercises that directly support the target lift:
  Back Squat:    Romanian Deadlift, Leg Press, Bulgarian Split Squat
  Deadlift:      Romanian Deadlift, Good Morning, Barbell Row
  Bench Press:   Dumbbell Press, Tricep Extension, Cable Fly
  Overhead Press: Lateral Raise, Dumbbell Shoulder Press, Tricep Extension
  Barbell Row:   Lat Pulldown, Cable Row, Face Pull

RULE 5 — WEEK STRUCTURE by split:

  Full Body (3-day):
    All 3 sessions include the target lift.
    Session A: Heavy (4-6 reps)
    Session B: Volume (6-8 reps)
    Session C: Technique (8-10 reps, 70% of heavy weight)

  Upper/Lower or PHUL (4-day):
    Heavy day: target lift first, 4-6 reps
    Volume day (3-4 days later): target lift first, 6-8 reps
    Upper days: no target lift if lower body, and vice versa

  5-day Squat-Focused (lower body target lift):
    Day 1 (Mon): Heavy Squat day — target lift first
    Day 2 (Tue): Upper body
    Day 3 (Wed): REST or light conditioning — NOT legs
    Day 4 (Thu): Volume Squat day — target lift first
    Day 5 (Fri): Upper body
    This is NOT PPL. Do not generate PPL for squat goals on 5-day splits.

  5-day PPL (upper body target lift only):
    Push Heavy: target lift first
    Push Volume: target lift included (volume prescription)

RULE 6 — PROGRESSION MODEL: Strength plans use weekly periodization, not RPE-based auto-regulation alone:
  Week 1: 5×5 @ RPE 7 (establish baseline)
  Week 2: 4×4 @ RPE 8 (increase intensity)
  Week 3: 3×3 @ RPE 8.5 (peak intensity)
  Week 4: DELOAD — 3×5 @ RPE 6
  Repeat with higher baseline.

This rep scheme applies to the TARGET LIFT only. Accessories use standard hypertrophy rep ranges (8-12).

RULE 7 — NEVER do this on a strength plan:
  - Never put the target lift as exercise 2 or later on heavy day
  - Never program the target lift only once per week
  - Never use PPL for a squat or deadlift goal
  - Never use 8-12 rep ranges on the heavy day of the target lift
  - Never write sessionFocus copy (e.g. "4×6") that does not match the target lift exercise JSON (sets, reps, targetWeight) on that day

Reconcile prescribed targetWeight in JSON with the athlete's 1RM: Week 1 target lift loads should align with RULE 6 (5×5 @ RPE 7 baseline) while respecting the 1RM anchor from CRITICAL WEIGHT RULES below.

CRITICAL WEIGHT RULES for strength goal:
- ${liftName} Week 1 working sets MUST start at ${week1Weight} lbs (${Math.round(strengthW1Factor * 100)}% of ${current1RMNum} lb 1RM).
- All other compound lifts: estimate based on the athlete's ${liftName} strength (they are ${experience} level).
- Week 1 is a baseline week. Do NOT start at their max. ${Math.round(strengthW1Factor * 100)}% 1RM is the starting point.
- Use straight sets (same weight across all sets) for the primary lift.
- Secondary lifts should be calibrated proportionally to their strength level.

STRENGTH FREQUENCY RULES — Week 1 target lift ONLY (percentage bands below DO NOT replace FIXED ATHLETE WEEK 1 + RULE 3):
- Heavy session (heavy / heavy_*): ${heavyTargetSets}×${heavyTargetRepsPerSet} @ ~${Math.round(strengthW1Factor * 100)}% current 1RM → targetWeight = ${heavyDayWeight} lbs fixed for JSON
- Volume session (volume_*): same set count ${heavyTargetSets}, reps per set = ${volumeDayRepsPerSet}, targetWeight = ${volumeDayWeight} lbs fixed (= ${heavyDayWeight} × 0.85, 2.5 lb plate rounding)
  Do NOT use ~70–75% 1RM guesses on volume day; use ${volumeDayWeight} exactly.
- This gives the athlete 2 exposures per week to the target movement
- If only 3 days/week (PPL): Day 1 = heavy push, Day 2 = pull, Day 3 = legs
  The following week would rotate: Day 1 = volume push, etc.
- If 4+ days/week: dedicate separate heavy and volume push days
- If sessionStructure defines fewer workout days than above, follow it exactly (e.g. 2-day upper/lower = one upper day + one lower day only). Do not expand to more days because of split name or these frequency examples.

1RM PROGRESSION PATH over ${totalWeeks} weeks:
- Week 1: ${calculateStartingWeight(current1RMNum, strengthW1Factor)} lbs (${Math.round(strengthW1Factor * 100)}% of ${current1RMNum} 1RM) — baseline
- Week ${Math.round(totalWeeks * 0.25)}: ~${calculateStartingWeight(current1RMNum, 0.8)} lbs (80%) — accumulation
- Week ${Math.round(totalWeeks * 0.5)}: ~${calculateStartingWeight(current1RMNum, 0.85)} lbs (85%) — intensification
- Week ${Math.round(totalWeeks * 0.75)}: ~${calculateStartingWeight(current1RMNum, 0.9)} lbs (90%) — peak
- Week ${totalWeeks}: ~${calculateStartingWeight(target1RMNum, 1.0)} lbs — target 1RM attempt
Build Week 1 with this arc in mind. The weights should feel manageable now so there is room to add load each week.`;

      exerciseSelectionSection = `STRENGTH SPECIALISATION RULES for ${liftName.toUpperCase()} goal:
Every exercise must have a clear reason tied to the target lift.
Use these categories as your exercise pool:

Direct variations (choose 1-2 per push session):
${accessories.direct.join(', ')}

Lockout/assistance work (choose 1-2):
${accessories.tricepLockout.length > 0 ? accessories.tricepLockout.join(', ') : 'N/A for this lift'}

Shoulder/joint stability — MANDATORY at least 1 per week:
${accessories.stability.join(', ')}

Upper back / antagonist work — MANDATORY at least 1 per session:
${accessories.upperBack.join(', ')}

${
        hasStructure
          ? `Using sessionStructure + WEEKLY STRUCTURE (focus, primary muscles, and liftDay when present) for ${liftName} — output only the workout days in sessionStructure; do not add Push/Pull/Legs template days beyond that count:
- Push / upper sessions that train chest, shoulders, or triceps: primary lift + 1-2 direct variations + lockout work when applicable
- Pull sessions: upper back work + vertical pull + biceps
- Leg sessions: full lower body — do NOT skip legs when a leg day appears in sessionStructure`
          : `For a PPL split targeting ${liftName}:
- Push days: primary lift + 1-2 direct variations + lockout work
- Pull days: upper back work + vertical pull + biceps
- Leg days: full lower body — do NOT skip legs even on a bench specialisation program`
      }

${MOVEMENT_PATTERN_BLOCK}`;
    } else if (goal === 'power_hypertrophy') {
      goalContext = `Goal: power_hypertrophy — build compound strength AND muscle size simultaneously.`;

      // Pre-calculate Week 1 target weights from currentLifts (week1Factor(experience) × 1RM, rounded to 5 lbs)
      const liftTargets: { name: string; provided: boolean; week1Weight: number }[] = [];
      const phWeek1Factor = week1Factor(experience);
      const current1RMNum = parseFloat(String(current1RM ?? '0'));
      const phWeek1Weight =
        current1RMNum > 0
          ? Math.round((current1RMNum * week1Factor(experience)) / 5) * 5
          : 0;
      const clMap: Record<string, string> = {
        benchPress: 'Barbell Bench Press',
        backSquat: 'Back Squat',
        deadlift: 'Conventional Deadlift',
        overheadPress: 'Overhead Press',
      };
      for (const [key, name] of Object.entries(clMap)) {
        const rm = currentLifts ? (currentLifts as Record<string, number | null>)[key] : null;
        if (rm != null && Number.isFinite(rm) && rm > 0) {
          liftTargets.push({ name, provided: true, week1Weight: Math.round(rm * phWeek1Factor / 5) * 5 });
        } else {
          liftTargets.push({ name, provided: false, week1Weight: 0 });
        }
      }
      const currentLiftsBlock = liftTargets.map((lt) =>
        lt.provided
          ? `- ${lt.name}: 1RM provided → Phase 1 Week 1 targetWeight = ${lt.week1Weight}`
          : `- ${lt.name}: not provided → targetWeight = 0`
      ).join('\n');

      weightAnchor = `
POWER-HYPERTROPHY REQUIRED OUTPUT FIELDS:
Every day object with workout type MUST include:
  "sessionPhase": "power_hypertrophy"
Every exercise object MUST include a "phase" field:
  Phase 1 exercises (heavy compounds, 3-6 reps): "phase": "strength"
  Phase 2 exercises (accessories, 8-12 reps):    "phase": "hypertrophy"
Every exercise object MUST include "setStructure":
  Phase 1: "setStructure": "pyramid"
  Phase 2: "setStructure": "straight"

EXERCISE COUNT BY SESSION LENGTH (Intermediate):
  30-45 mins: 4 exercises total (1-2 Phase 1 + 2-3 Phase 2)
  45-60 mins: 5 exercises total (1-2 Phase 1 + 3-4 Phase 2)
  60-90 mins: 6 exercises total (2 Phase 1 + 4 Phase 2)
  90+ mins:   7-8 exercises total (2 Phase 1 + 5-6 Phase 2)
User selected session length: ${sessionLength}
Generate the appropriate exercise count for this session length.
Do NOT generate fewer exercises than the minimum for the selected session length.

PHASE 1 RULES (tag these first in each session):
- Count: exactly 1-2 exercises per session (see EXERCISE COUNT above)
- Exercises: barbell/compound only (Bench Press, Squat, Deadlift, Row, OHP, Pull-up)
- Reps: 3-6
- Sets: 4-5
- targetRpe: 8-9 (NOT 7 — this is heavy work)
- restSeconds: 240 (4 minutes)
- setStructure: "pyramid"
- phase: "strength"
- coachingNote: selection reasoning per system message (why this heavy compound for Phase 1 — tie to their 1RM data where applicable)

PHASE 2 RULES (list after Phase 1 in each session):
- Count: 3-5 exercises per session
- Exercises: machines, cables, dumbbells (accessory movements)
- Reps: 8-12 (isolation), 6-10 (secondary compounds)
- Sets: 3-4
- targetRpe: 7-8
- restSeconds: 90-120
- setStructure: "straight"
- phase: "hypertrophy"
- coachingNote: selection reasoning per system message (why this accessory slot builds the hypertrophy phase for this session)

FAILURE MODES TO AVOID:
- Do NOT output exercises without a "phase" field
- Do NOT output day objects without "sessionPhase"
- Do NOT set targetRpe: 7 on Phase 1 — minimum is 8
- Do NOT mix phase tags (a 3-6 rep compound must be "strength", an 8-12 rep accessory must be "hypertrophy")
- Do NOT output more than 2 Phase 1 exercises per session

CURRENT 1RM DATA (use for Phase 1 Week 1 targetWeight):
${currentLiftsBlock}${phWeek1Weight > 0 ? `

Phase 1 (strength phase) exercises: targetWeight for the primary compound = ${phWeek1Weight} lbs (${Math.round(week1Factor(experience) * 100)}% of ${current1RMNum} lb 1RM). This is the anchor weight for stampWeek1PyramidSetTargets — do not deviate.` : ''}
INSTRUCTION: Use these exact targetWeight values for the corresponding Phase 1 exercises in Week 1. Do not use 0 for lifts where a value is provided. Round to nearest 5 lbs. For Phase 2 exercises: targetWeight = 0 — the athlete self-selects loads in the app.

SESSION COUNT CONTRACT: workoutDayCount must equal exactly sessionStructure.filter(d => d.type === 'workout').length. This is non-negotiable.

Each ExerciseObject must include: "phase": "strength" | "hypertrophy"
Each DayObject with type "workout" must include: "sessionPhase": "power_hypertrophy"`;

    } else if (goal === 'hypertrophy' && priorityMuscles && priorityMuscles.length > 0) {
      goalContext = `Priority muscle groups: ${priorityMuscles.join(', ')}. Give these groups extra volume (1 additional exercise).`;
      weightAnchor = `Rep and RPE targets follow PROGRAMMING PARAMETERS and exercise-type rules below. Week 1 prescribed load policy is in WEEK 1 STARTING WEIGHTS — targetWeight must be 0 for every exercise.`;
    } else if (goal === 'hypertrophy') {
      weightAnchor = `Week 1 load policy: WEEK 1 STARTING WEIGHTS — targetWeight 0 for every exercise; coachingNote per system message (selection reasoning).`;
    } else if (goal === 'fat_loss') {
      goalContext = body.targetWeightLbs
        ? `Target weight: ${body.targetWeightLbs} lbs. Plan duration: ${totalWeeks} weeks.`
        : '';
      weightAnchor = `Week 1 load policy: WEEK 1 STARTING WEIGHTS — targetWeight 0; rep schemes, rest, and density as programmed below.`;
    } else {
      weightAnchor = `Week 1 load policy: WEEK 1 STARTING WEIGHTS — targetWeight 0 for all exercises.`;
    }

    const isNonStrengthGoal =
      goal === 'hypertrophy' ||
      goal === 'recomp' ||
      goal === 'fat_loss' ||
      goal === 'general';

    if (isNonStrengthGoal) {
      weightAnchor += `

WEEK 1 STARTING WEIGHTS — NON-STRENGTH GOALS:

Do NOT prescribe specific weights for Week 1 exercises.
Set targetWeight to 0 for ALL exercises in Week 1.

Every exercise coachingNote in Week 1 must follow the coachingNote specification in the system message: selection reasoning (why this exercise, in this slot, for this user). Do not use generic load-calibration copy that restates reps or RPE targets — the UI already shows them.

Week 2+ onwards: program weights normally based on what the user logged in the previous week.

EXCEPTION — STRENGTH GOAL: unchanged — use current1RM × ${week1Factor(experience)} and prescribed targetWeights as in the strength section above.`;
    }

    const beginnerRpeBlock =
      experience === 'beginner'
        ? `
BEGINNER RPE (movement quality):
Target RPE is ${params.targetRpe}. For beginners, this ceiling exists to protect movement quality under fatigue — do not write coachingNotes that push for failure or max effort.
`
        : '';

    const hypertrophyAdvancedBlock =
      goal === 'hypertrophy' && experience === 'advanced'
        ? `
Rep ranges vary by exercise type within this session:
- Primary and secondary compounds: ${HYPERTROPHY_REP_GUIDANCE.advanced.compounds} reps
- Isolation exercises: ${HYPERTROPHY_REP_GUIDANCE.advanced.isolations} reps
Do NOT apply a single rep range to every exercise.

ADVANCED HYPERTROPHY SETS:
Total sets per exercise: ${params.sets}. For advanced users, the final set of isolation exercises may include a technique note (e.g. rest-pause or slow eccentric) but only on isolation exercises — never on compounds.
`
        : '';

    const advancedLongSessionNote =
      experience === 'advanced' && sessionLength === '90+'
        ? `
For advanced lifters with 90+ minute sessions: prioritise hitting the weekly volume landmarks for each muscle group (${volumeTargets.weeklySetMin}–${volumeTargets.weeklySetMax} sets/muscle/week).
Do not sacrifice volume for brevity at this experience level.`
        : '';

    const advancedVolumePriorityBlock =
      experience === 'advanced'
        ? `
ADVANCED VOLUME PRIORITY:
Weekly sets per muscle group must reach the development range (${volumeTargets.prioritySetMin}–${volumeTargets.prioritySetMax} sets for priority muscles).
Do not leave muscles at 5 sets/week for an advanced lifter — this is maintenance volume, not growth stimulus.
Distribute exercises to ensure all target muscle groups reach minimum development volume.`
        : '';

    const splitDescriptor = hasStructure ? splitName : effectiveSplit;

    if (!exerciseSelectionSection) {
      exerciseSelectionSection = `EXERCISE SELECTION RULES:
- Max ${maxExercises} exercises per session (${sessionLength} min band — see SESSION LENGTH CONSTRAINTS)
- For ${hasStructure ? `the sessionStructure-defined week (follow WEEKLY STRUCTURE day-by-day; never use split name to add or remove workout days)` : `the ${splitDescriptor} split`}, ensure logical muscle group distribution across days
- Use exercises appropriate for ${equipment}
- Week 1: focus on foundational movements. Save advanced variations for later weeks.
- NEVER programme conventional deadlift or sumo deadlift as a hypertrophy
  accessory on a pull day. Deadlifts are primary strength compounds — they carry
  disproportionate systemic fatigue relative to their hypertrophy stimulus and
  will compromise recovery between sessions. On pull days for hypertrophy goals,
  use row variations, lat pulldowns, cable rows, or machine rows instead.
  Deadlifts only appear when the plan goal is 'strength' and the targetLift is
  'deadlift', or on dedicated strength/lower days in power_hypertrophy splits.
- On 6-day splits (Arnold, batman, bro_split), conventional deadlift or sumo
  deadlift must appear NO MORE THAN ONCE per week. If the split has two leg days
  or two back days, programme heavy deadlift on one of them only. The second
  session must use Romanian deadlift, stiff-leg deadlift, or good morning as the
  primary hinge — never a second session of heavy conventional or sumo deadlift.
  Two maximal deadlift sessions per week is excessive fatigue even for advanced
  lifters.
- TIER-1 LOWER COMPOUND RULE (hard rule, no exceptions):
  Never place two Tier-1 lower-body compounds in the same session.

  Tier-1 lower compounds are:
    back squat, front squat, safety bar squat, conventional deadlift,
    sumo deadlift, trap bar deadlift

  This means ALL of the following combinations are forbidden:
    - back squat + front squat
    - back squat + conventional deadlift
    - back squat + sumo deadlift
    - front squat + conventional deadlift
    - front squat + sumo deadlift
    - any squat variant + any deadlift variant

  Tier-2 movements (RDL, leg press, hack squat, Bulgarian split squat,
  leg curl, hip thrust) are NOT Tier-1 and may follow a Tier-1 compound.

  Exception: powerlifting-specific strength_focused splits where a
  dedicated squat + deadlift session is the explicit purpose. Even
  then, limit to ONE squat movement and ONE deadlift movement only.
- On strength goal VOLUME days for squat specialization (back squat or front squat
  as the targetLift), the target lift appears first as the primary compound.
  The second exercise MUST be a non-squat-pattern movement — leg press, hack squat,
  Bulgarian split squat, or hip thrust. NEVER programme a second squat variation
  (front squat, goblet squat, box squat, pause squat) as exercise #2 on a volume
  squat day. Two primary squat-pattern compounds back to back after near-maximal
  volume produces fatigue without additional adaptation stimulus.
- SESSION SEQUENCING: Never open a session with a hip hinge movement (Romanian
  deadlift, stiff-leg deadlift, good morning, hip thrust) as the first exercise
  for beginner experience level. Beginners need a primer compound (squat pattern
  or horizontal push/pull) before hinging. For beginner full-body sessions, the
  hinge movement must appear as exercise 2 or later, after at least one
  squat-pattern or upper body compound.
- Vary exercise selection — do not repeat the same exercises on back-to-back days for the same muscle group

GRIP AND ATTACHMENT VARIATION:
For cable exercises, always specify the attachment or grip variant in the exercise name using parentheses.
Examples:
- 'Tricep Pushdown (Rope)' not 'Tricep Pushdown'
- 'Cable Row (Close Grip)' not 'Seated Cable Row'
- 'Lat Pulldown (Wide Grip)' not 'Lat Pulldown'
- 'Cable Fly (High to Low)' not 'Cable Chest Fly'

For barbell rows, specify grip:
- 'Barbell Row (Overhand Wide)' for upper back emphasis
- 'Barbell Row (Underhand)' for lat and bicep emphasis

Vary grip/attachment across workout days and weeks to distribute stimulus across all portions of the target muscle. Do not use the same grip variant twice in the same week for the same exercise category.

Valid cable tricep attachments: Rope, Straight Bar, V-Bar, Reverse Grip, Single Arm.
Valid cable row grips: Close Grip, Wide Grip, Reverse Grip, Single Arm.
Valid lat pulldown grips: Wide Grip, Close Grip, Reverse Grip.
Valid cable fly positions: High to Low, Low to High, Mid Cable.
Valid barbell row grips: Overhand Wide, Overhand Narrow, Underhand.

${MOVEMENT_PATTERN_BLOCK}`;
    }

    const athleteSplitLine = hasStructure
      ? `- Split: ${splitName} (${splitId})`
      : `- Split: ${effectiveSplit}${splitOverrideNote ? ` (overridden from ${body.split ?? 'unknown'})` : ''}`;

    const priorityMusclesProfileLine =
      Array.isArray(priorityMuscles) && priorityMuscles.length > 0
        ? `\n- Priority muscles (from onboarding): ${priorityMuscles.join(', ')}`
        : '';

    const subMuscleBlock =
      subMusclePreferences && Object.keys(subMusclePreferences).length > 0
        ? (() => {
            const focusDescriptions: Record<string, string> = {
              short_head: 'short head bicep — barbell curls, wide-grip curls, preacher curls',
              long_head: 'long head bicep — incline dumbbell curls, narrow-grip curls',
              brachialis: 'brachialis — hammer curls, cross-body curls, reverse curls',
              long_head_tricep: 'long head tricep — overhead extensions, skull crushers',
              lateral_head_tricep:
                'lateral head tricep — pushdowns, close-grip bench, dips',
              upper: 'upper chest — incline press and incline fly variations',
              lower: 'lower chest — decline press, dips, low-to-high cable fly',
              front: 'front delt — overhead press variations, front raises',
              lateral: 'lateral delt — lateral raises, upright rows, cable laterals',
              rear: 'rear delt — face pulls, reverse fly, bent-over lateral raises',
              lats: 'lats — vertical pulls (pull-ups, lat pulldowns, straight-arm pulldowns)',
              upper_back:
                'upper back — horizontal pulls (rows, face pulls, chest-supported rows)',
              outer_sweep:
                'vastus lateralis — hack squats, wide-stance leg press, leg extensions',
              vmo:
                'VMO/teardrop — close-stance squats, sissy squats, terminal knee extensions, leg press with feet low and close',
            };
            const resolveDesc = (muscle: string, focus: string): string => {
              if (muscle === 'Triceps' && focus === 'long_head') {
                return focusDescriptions.long_head_tricep;
              }
              if (muscle === 'Triceps' && focus === 'lateral_head') {
                return focusDescriptions.lateral_head_tricep;
              }
              return focusDescriptions[focus] ?? focus;
            };
            const specific = Object.entries(subMusclePreferences)
              .filter(([, v]) => v && v !== 'balanced')
              .map(([muscle, focus]) => {
                const desc = resolveDesc(muscle, focus);
                return `- ${muscle}: bias toward ${desc}. At least 60% of this muscle's exercises must target this sub-muscle. The remaining 40% may be balanced.`;
              });

            if (specific.length === 0) {
              return '\nSUB-MUSCLE FOCUS: All priority muscles set to balanced — distribute exercises evenly across sub-muscles.';
            }
            return `\nSUB-MUSCLE FOCUS (user-selected, treat as authoritative):\n${specific.join('\n')}\nFor muscles not listed above, program balanced sub-muscle distribution.`;
          })()
        : '\nSUB-MUSCLE FOCUS: No preferences set — program balanced development for all priority muscles.';

    const liftFrequencyLine =
      goal === 'strength' && liftFrequency != null && (liftFrequency === 2 || liftFrequency === 3)
        ? `\n- Target lift frequency: ${liftFrequency}x per week`
        : '';

    const structureTailInstructions = hasStructure
      ? `Follow the WEEKLY STRUCTURE exactly: ${(sessionStructure as SessionDay[]).length} calendar day entries with the day numbers shown. Each workout day must match its focus, primary muscles, and session intensity.`
      : `Generate exactly ${actualDaysPerWeek} workout days plus rest days to fill all 7 days.`;

    const splitHistoryOtherLine =
      currentSplit === 'Other' && currentSplitOther
        ? `
TRAINING HISTORY: The user describes their current training structure as: "${currentSplitOther}".
`
        : '';

    const structuralNoveltyBlock =
      goal === 'hypertrophy' &&
      splitDuration === '6+ months' &&
      currentSplit != null &&
      currentSplit !== '' &&
      currentSplit !== 'Other'
        ? `
TRAINING HISTORY (hypertrophy):
The user has been following ${currentSplit} for 6+ months. Jordan's sessionStructure already accounts for structural novelty. Reinforce this in the jordanWelcome message — mention that a structural change is intentional and will drive new adaptation.
`
        : '';

    const current1RMLabel =
      current1RM != null && String(current1RM).trim() !== ''
        ? `${String(current1RM).trim()} lbs`
        : null;

    const strengthExperienceBlock =
      goal === 'strength' &&
      trainingBackground != null &&
      (trainingBackground === 'Already doing a strength-specific program' ||
        trainingBackground === 'Running a powerlifting program')
        ? `
TRAINING BACKGROUND (strength):
This user is already strength-training. Week 1 baseline weights should reflect their current 1RM${current1RMLabel ? ` (${current1RMLabel})` : ''} × ${week1Factor(experience)} as normal, but the jordanWelcome should acknowledge their existing base and frame this plan as a focused specialisation block (still within the 4-sentence jordanWelcome structure — fold this into Sentence 2).
`
        : '';

    const liftNameForWelcome =
      targetLift != null && String(targetLift).trim() !== ''
        ? String(targetLift).replace(/_/g, ' ')
        : null;
    const target1RMNumWelcome = parseFloat(String(target1RM ?? current1RM ?? '0'));
    const priorityMusclesList =
      Array.isArray(priorityMuscles) && priorityMuscles.length > 0
        ? priorityMuscles.join(', ')
        : '';
    const targetWeightLbsWelcome =
      body.targetWeightLbs != null && String(body.targetWeightLbs).trim() !== ''
        ? String(body.targetWeightLbs).trim()
        : null;

    let jordanWelcomeSentence2Instruction = '';
    if (goal === 'power_hypertrophy') {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (power_hypertrophy). Use this line (keep meaning; fix grammar only if needed):\n` +
        `"You want strength and size — every session starts heavy on the big compounds, then we shift into accessory work to build muscle on top."`;
    } else if (goal === 'strength' && liftNameForWelcome && target1RMNumWelcome > 0) {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (strength). Use this line (keep meaning; fix grammar only if needed):\n` +
        `"You came in with a ${target1RMNumWelcome}lb ${liftNameForWelcome} target — I've built the entire program around getting you there."`;
    } else if (goal === 'strength') {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (strength): Use their target 1RM and lift from the athlete profile. Pattern:\n` +
        `"You came in with a [N]lb [lift name] target — I've built the entire program around getting you there."`;
    } else if (goal === 'hypertrophy' && priorityMusclesList !== '') {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (hypertrophy + priority muscles). Use this line:\n` +
        `"You want to bring up your ${priorityMusclesList} — I've structured your week so those muscles get trained fresh and with full focus, not as an afterthought."`;
    } else if (goal === 'hypertrophy') {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (hypertrophy, no priority muscles). Use this line:\n` +
        `"Your goal is building size — I've programmed ${actualDaysPerWeek} days with the volume and frequency that actually drives hypertrophy."`;
    } else if (goal === 'fat_loss' && targetWeightLbsWelcome != null) {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (fat loss). Use this line:\n` +
        `"You want to drop to ${targetWeightLbsWelcome}lbs — I've set your training and macros to get you there at a rate that preserves your muscle."`;
    } else if (goal === 'fat_loss') {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (fat loss): Use their target weight in lbs from the profile. Pattern:\n` +
        `"You want to drop to [N]lbs — I've set your training and macros to get you there at a rate that preserves your muscle."`;
    } else if (goal === 'recomp') {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (recomp). Use this line:\n` +
        `"Body recomp is the hardest goal to program — you're asking your body to lose fat and build muscle at the same time. I've built this specifically to make that happen."`;
    } else {
      jordanWelcomeSentence2Instruction =
        `Sentence 2 — Goal acknowledgement (general / other). Use this line:\n` +
        `"You want to build a consistent fitness base — I've kept the program structured but manageable so you can build the habit first."`;
    }

    const jordanWelcomeSentence3Block = isNonStrengthGoal
      ? `Sentence 3 — Week 1 baseline (non-strength — user-selected loads):
  "Week 1 is your calibration week — pick loads that match your effort targets and record them after each set; that data is how I tune what comes next."`
      : `Sentence 3 — Explain Week 1 baseline (prescribed loads):
  "Week 1 is your calibration week — the weights are set conservatively so you can focus on form and give me honest effort ratings after each set."`;

    const jordanWelcomeNonStrengthSentence2Addon = isNonStrengthGoal
      ? `
Non-strength — Sentence 2 (required addition): After or woven into the goal acknowledgement above, you MUST convey that Week 1 working weights are user-selected in the app (targetWeight 0 — Jordan does not prescribe lbs for Week 1).
Example (adapt RPE band to match programming template, default target RPE ${params.targetRpe}): "Week 1 you set your own starting weights — aim for something that feels like RPE 7-8 on each exercise. Honest effort ratings after your sets are how I tune what comes next."
This replaces any implication that Jordan has already set conservative working loads for you.`
      : '';

    const jordanWelcomeRpeRuleLine = isNonStrengthGoal
      ? `- In Sentence 2 only, you may reference target RPE as a range (e.g. "RPE 7-8") when explaining self-selected loads. In Sentences 3–4 prefer "effort ratings" except the fixed Sentence 4 template may say "RPE data".`
      : `- Never mention RPE as a number in the welcome (e.g. do not say "RPE 7") — the user just learned about RPE in onboarding; prefer "effort ratings" where it fits (Sentences 3–4 may use the phrase "RPE data" as in the template above, without numeric RPE)`;

    const jordanWelcomeFieldSpec = `JORDAN WELCOME FIELD (top-level JSON key "jordanWelcome"):
jordanWelcome is the user's FIRST introduction to Jordan, their coach. It must follow this exact structure:

Sentence 1 — Self introduction:
  Always start with "I'm Jordan, your coach for the next ${totalWeeks} weeks."
  Never skip this. This is the user's first time meeting Jordan.

Sentence 2 — Goal acknowledgement (specific to their inputs):
${jordanWelcomeSentence2Instruction}
${jordanWelcomeNonStrengthSentence2Addon}
  If other TRAINING HISTORY instructions in this prompt ask you to mention structural change or an existing strength base, fold that into Sentence 2 without adding sentences or breaking the templates above.

${jordanWelcomeSentence3Block}

Sentence 4 — Forward looking (what Jordan will do with data):
  "I'll use your RPE data from this week to tune what comes next specifically to you — the more honest you are, the better your plan gets."

CONTEXT FOR jordanWelcome (silent — apply when writing the welcome; do not mention in jordanWelcome text):
Session length: ${sessionLength} minutes — program accordingly and do not reference this constraint explicitly in the jordanWelcome message.

RULES:
- Do not use em-dashes anywhere in jordanWelcome.
- Maximum 4 sentences total
- Always starts with "I'm Jordan"
- Always references at least one specific number or detail from the user's inputs (use the athlete profile and goal details in this prompt)
- Always explains Week 1 as calibration (Sentence 3)
- Never uses: "Great!", "Excited to", "Let's crush", "Let's go", "Amazing"
- Tone: direct, knowledgeable, like a real coach talking to a new client for the first time — not a chatbot greeting
${jordanWelcomeRpeRuleLine}
- Do not end with a separate "call to action" sentence beyond Sentence 4; Sentence 4 is the close
- CRITICAL: Never use the word "AI" anywhere in jordanWelcome or any coaching copy. Jordan is a coach, not an AI system. Never write "I'm Jordan, your AI coach" or any variation. Always write "I'm Jordan, your coach" — first person, no qualifiers. Write in first person as Jordan — use "I" or "your coach" only. Never "AI coach", "AI system", "artificial intelligence", or any variation.
- Good opening (pattern): "I'm Jordan, your coach for the next ${totalWeeks} weeks..."
- Bad opening (never — never output text like this): "I'm Jordan, your AI coach for the next ${totalWeeks} weeks..."
- Apply the same CRITICAL rule (no "AI"; first person as Jordan; "I" or "your coach" only) to every sessionFocus line, every exercise coachingNote, and any motivationalNote field in this response.`;

    const previewWorkoutSessions = structureArr
      .filter((d) => d.type === 'workout')
      .slice(0, 2);

    const cardioInstruction =
      goal === 'fat_loss' || goal === 'recomp'
        ? `
CARDIO DAYS:
Include 1–2 cardio days per week for this ${goal} plan. Cardio days
use type: 'cardio' (not 'workout' or 'rest'). They count toward
daysPerWeek only if they replace a rest day — never add cardio on
top of a workout day.

Cardio day structure:
{
  "dayNumber": N,
  "type": "cardio",
  "title": "[Cardio Type] Cardio",
  "sessionFocus": "Low-impact conditioning — keep heart rate moderate",
  "cardioType": "light" | "medium",
  "suggestedDurationMinutes": <integer minutes, typically 20–45>,
  "muscleGroups": [],
  "exercises": []
}

CARDIO TYPE RULES:
- "light": Walking, cycling, elliptical. HR zone 2 (comfortable conversation pace).
  Duration: 30–45 minutes. Use for fat_loss recovery days and all recomp.
- "medium": Steady-state cardio (treadmill jog, rowing, stair climber).
  HR zone 3 (breathing harder, can speak short sentences).
  Duration: 20–30 minutes. Use for fat_loss plans only when daysPerWeek >= 4.

SCHEDULING RULES:
- Never schedule cardio the day after a heavy leg workout.
- Prefer cardio on rest days adjacent to upper body days.
- For fat_loss with 3 days/week: 1 light cardio day.
- For fat_loss with 4+ days/week: 1 light + 1 medium cardio day.
- For recomp: always 1 light cardio day only.
- Cardio days have empty exercises array — never add strength exercises.
`
        : '';

    const previewPrompt = `Generate a 2-session preview for Week 1 of a ${totalWeeks}-week ${goal} plan.

ATHLETE PROFILE:
- Experience: ${experience}
- Equipment: ${equipment}
- Session length: ${sessionLength}
- Exercises to avoid: ${exclusions}
${goalContext ? `- Goal details: ${goalContext}` : ''}
${weightAnchor}

PREVIEW SESSIONS (Day 1 and Day 2 only — match these focuses):
${previewWorkoutSessions.map((s, i) => `Day ${i + 1}: ${s.title ?? s.focus ?? 'Workout'} — muscles: ${(s.primaryMuscles ?? []).join(', ')}`).join('\n')}

PROGRAMMING (${experience}):
- Sets: ${params.sets}, reps: ${params.reps}, rest: ${params.restSeconds}s, RPE: ${params.targetRpe}
- Max ${maxExercises} exercises per session

${exerciseSelectionSection}

Respond with ONLY this JSON:
{
  "title": "descriptive plan name",
  "jordanWelcome": "2 sentences max — preview tone, Jordan's voice.",
  "totalWeeks": ${totalWeeks},
  "daysPerWeek": ${actualDaysPerWeek},
  "scheduledDays": ${JSON.stringify(trainingDays)},
  "week": {
    "weekNumber": 1,
    "phase": "baseline",
    "days": [
      {
        "dayNumber": 1,
        "type": "workout",
        "title": "session name",
        "sessionFocus": "max 12 words",
        "muscleGroups": [],
        "exercises": [{ "id": "e1", "name": "Exercise", "muscleGroup": "Chest", "sets": ${params.sets}, "reps": "${params.reps}", "targetWeight": 0, "restSeconds": ${params.restSeconds}, "targetRpe": ${params.targetRpe}, "coachingNote": "why this exercise" }]
      },
      {
        "dayNumber": 2,
        "type": "workout",
        "title": "session name",
        "sessionFocus": "max 12 words",
        "muscleGroups": [],
        "exercises": []
      }
    ]
  }
}
Return exactly 2 workout days in week.days — no rest days, no cardio days, no extra sessions.`;

    const fullPrompt = `${absoluteRuleBlock}
${sessionStructureFollowBlock}

Create Week 1 of a ${totalWeeks}-week ${goal} training plan.

ATHLETE PROFILE:
- Experience: ${experience}
${athleteSplitLine}
- Equipment: ${equipment}
- Session length: ${sessionLength} (minutes per session, from onboarding)
- Total plan duration: ${totalWeeks} weeks
- Days per week: ${actualDaysPerWeek}
- Exercises to avoid: ${exclusions}
- Injury movement pattern rules: when injuries or exclusions reference overhead
  pressing (shoulder impingement, rotator cuff, AC joint), exclude ALL vertical
  push movements regardless of equipment — barbell overhead press, dumbbell
  shoulder press, Arnold press, push press, landmine press to overhead, and any
  other movement that takes the load above shoulder height. Do not include any of
  these as substitutes. For shoulder-restricted athletes, anterior delt volume
  must come from cable front raises or low-angle incline movements only.
  When injuries reference lower back (disc, sprain, hyperextension), exclude
  Romanian deadlift, stiff-leg deadlift, good morning, and back extension in
  addition to any explicitly named exercises. These movements share the same
  spinal loading pattern as the named exercises.${priorityMusclesProfileLine}${subMuscleBlock}${liftFrequencyLine}
${goalContext ? `- Goal details: ${goalContext}` : ''}
${weeklyStructureBlock}
${splitHistoryOtherLine}${structuralNoveltyBlock}${strengthExperienceBlock}
PROGRAMMING PARAMETERS for ${goal.toUpperCase()} (${experience}):
- Rep range (default template): ${params.reps}
- Sets per exercise: ${params.sets}
- Rest between sets: ${params.restSeconds} seconds
- Target RPE: ${params.targetRpe}

SESSION LENGTH CONSTRAINTS:
The user has ${sessionLength} minutes per session (onboarding band).
Experience: ${experience}.
Maximum exercises per workout day: ${maxExercises} (experience-adjusted cap for this session length).
${sessionRules.note}
${advancedLongSessionNote}

Do NOT exceed ${maxExercises} exercises per day regardless of split type or goal. If a day would normally have more exercises, prioritise compound movements and drop the lowest-priority isolations.

WARMUP / WORKING WEIGHT (app behavior):
Do NOT include warmup sets in the sets count or targetWeight. targetWeight is the WORKING weight only — the app generates warmup progressions automatically when a working weight is known.
Example: 5 sets × 3-5 reps @ 265 lbs means 5 working sets at 265 lbs. The app will show warmup sets at 40/60/80% automatically before those working sets.
${isNonStrengthGoal ? `Non-strength Week 1: targetWeight is 0 — the athlete enters their chosen load in the app; warmups appear once they have a working weight for that session.` : ''}
Avoid coachingNote lines that tell the athlete to "start light and build up" — the UI handles warmup display.

${beginnerRpeBlock}${hypertrophyAdvancedBlock}
${weightAnchor}

${exerciseSelectionSection}
${!hasStructure && splitOverrideNote ? `\nSPLIT OVERRIDE:\n${splitOverrideNote}\n` : ''}

VOLUME TARGETS (derived from ${actualDaysPerWeek} training days):
Weekly sets per muscle: ${volumeTargets.weeklySetMin}–${volumeTargets.weeklySetMax}
Priority muscles: ${volumeTargets.prioritySetMin}–${volumeTargets.prioritySetMax} sets/week

⚠️ Do NOT attempt to hit 6-day volume targets on a ${actualDaysPerWeek}-day program. Physical constraint: max ~6–10 quality sets per muscle per session.

For ${actualDaysPerWeek} days: distribute volume realistically across available sessions. Isolation exercises for smaller muscles (biceps, triceps) will naturally be lower — this is correct, not a flaw.

- Experience level: ${experience}
- Do NOT exceed the weekly max above — overdosing a muscle group causes excessive fatigue
- Do NOT go below the weekly min for major muscle groups — underdosing produces no adaptation
- Count total sets across ALL workout days when distributing volume
${advancedVolumePriorityBlock}
${enhancedRecovery ? `
ENHANCED RECOVERY — USER HAS INDICATED EXCEPTIONAL RECOVERY:
- Apply volume at the upper end of range + 30-40% above standard advanced ceiling
- MRV ceiling: 28-36 sets per muscle group per week (standard advanced: 16-22 sets)
- Deload frequency: every 5th week instead of every 4th week
- Progression: apply 0.9× multiplier to training age cap — allows slightly faster progression
- coachingNotes may reference recovery capacity where relevant: example: "Given your recovery rate, I've pushed your volume higher than I normally would here — keep an eye on joint fatigue."
- IMPORTANT: Never reference medical protocols, TRT, or any pharmacological context. Frame purely as a training characteristic.
` : ''}
${concurrentSport ? `
CONCURRENT SPORT TRAINING:
User also trains ${concurrentSport.type.join(', ')} ${concurrentSport.daysPerWeek} days per week alongside lifting.
Scheduling rules:
- Do NOT schedule heavy leg days adjacent to high-intensity sport training days (martial arts, running, team sports)
- Reduce leg volume on weeks with 3+ sport sessions per week
- Swimming and cycling have lower leg impact — standard leg scheduling applies unless daysPerWeek >= 4
- Jordan notes in sessionFocus or coachingNotes may reference sport training where relevant to recovery context
- TDEE note: Calories already adjusted for sport load — no additional calorie modification needed in prompt.
` : ''}
${biologicalSex === 'female' ? `
SEX-AWARE PROGRAMMING — FEMALE:
Volume ceiling: 10-15% above the male equivalent for this experience level. Do not reference biological sex in any coachingNote or Jordan copy — adjustments are invisible to the user.
` : ''}
${structureTailInstructions}
Training days: ${trainingDays.length > 0 ? trainingDays.join(', ') : 'not specified'}
Each workout day must include sessionFocus (one sentence, max 12 words — see system prompt). Rest days must have sessionFocus: "".

Week 1 phase MUST be "baseline". Weeks 2 onward (when generated later) follow accumulation → intensification → deload periodisation. For this response, the week object's phase field MUST be exactly "baseline".

${jordanWelcomeFieldSpec}

${cardioInstruction}

Respond with ONLY this JSON, no other text:
{
  "title": "descriptive plan name",
  "jordanWelcome": "Exactly 4 sentences per JORDAN WELCOME FIELD spec above.",
  "totalWeeks": ${totalWeeks},
  "daysPerWeek": ${actualDaysPerWeek},
  "scheduledDays": ${JSON.stringify(trainingDays)},
  "week": {
    "weekNumber": 1,
    "phase": "baseline",
    "days": [
      {
        "dayNumber": 1,
        "type": "workout",
        "title": "workout name e.g. Push A",${goal === 'power_hypertrophy' ? '\n        "sessionPhase": "power_hypertrophy",' : ''}
        "sessionFocus": "Baseline push — feel the weights out.",
        "muscleGroups": ["Chest", "Shoulders", "Triceps"],
        "exercises": [
          {
            "id": "e1",
            "name": "Exercise Name",
            "muscleGroup": "Chest",
            "sets": ${params.sets},
            "reps": "${params.reps}",
            "targetWeight": ${isNonStrengthGoal ? 0 : 135},
            "restSeconds": ${params.restSeconds},
            "targetRpe": ${params.targetRpe},
            "coachingNote": "${isNonStrengthGoal ? `Your upper chest priority anchors this session — incline angle shifts the stimulus to the clavicular head where you need growth.` : `Week 1 calibration at ${Math.round(week1Factor(experience) * 100)}% of your 1RM — log your honest RPE so I can dial in Week 2 specifically to you.`}"${goal === 'power_hypertrophy' ? ',\n            "phase": "strength",\n            "setStructure": "pyramid"' : ''}
          }
        ]
      },
      {
        "dayNumber": 2,
        "type": "rest",
        "title": "Rest Day",
        "sessionFocus": "",
        "muscleGroups": [],
        "exercises": []
      }
    ]
  }
}
Include all 7 days. Workout days have exercises. Rest days have empty exercises array and type "rest".${goal === 'fat_loss' || goal === 'recomp' ? ' For fat_loss and recomp, also include cardio days per CARDIO DAYS above: type "cardio", empty exercises array, cardioType and suggestedDurationMinutes — never on a workout day.' : ''}${goal === 'power_hypertrophy' ? ' Each exercise MUST include "phase": "strength" or "hypertrophy" AND "setStructure": "pyramid" or "straight". Each workout day MUST include "sessionPhase": "power_hypertrophy". Missing any of these fields is a critical error.' : ''}`;

    const prompt = isPreview ? previewPrompt : fullPrompt;

    const fullSystemPrompt = `You are Jordan, an expert personal coach building Week 1 of a training plan. 

Your job: create a properly structured, goal-appropriate training week.${
  isNonStrengthGoal
    ? ' For non-strength goals (hypertrophy, recomp, fat_loss, general), Week 1 targetWeight MUST be 0 on every exercise — the athlete self-selects loads in the app; follow WEEK 1 STARTING WEIGHTS in the user message.'
    : ' Use realistic prescribed starting weights (especially strength: 1RM-based).'
}

${nutritionContextBlock}

When writing coachingNote and sessionFocus: do not suggest aggressive weight or load increases when the user is in a calorie deficit. Progression language should match their nutrition phase (deficit, surplus, or maintenance).

STYLE RULE: Never use em-dashes (—) in any response.
Use periods or commas instead. This applies to all
coaching copy, Jordan's voice, and any explanatory text.

KNEE INJURY PROGRAMMING RULE (ONLY applies when injuries
array contains 'knee' — ignore entirely if no knee injury):
When the injuries array contains 'knee', you must not generate
any exercise involving significant knee flexion or knee loading.

Prohibited movement patterns for knee injury:
  - Any squat variation (back squat, front squat, goblet squat,
    hack squat, safety bar squat, pistol squat, box squat,
    zercher squat, overhead squat)
  - Any lunge variation (walking lunge, reverse lunge, lateral
    lunge, curtsy lunge, Bulgarian split squat, split squat)
  - Any jumping or plyometric movement (box jump, jump squat,
    broad jump, depth jump)
  - Step-ups
  - Sled sprints, sled push

Use these instead for lower body sessions:
  - Leg Press (primary quad movement)
  - Hip Thrust or Glute Bridge (primary glute movement)
  - Romanian Deadlift or Stiff Leg Deadlift (primary hamstring
    hinge movement)
  - Lying Leg Curl or Seated Leg Curl (hamstring isolation)
  - Calf Raise (calf isolation)
  - Cable Pull-Through (glute/hamstring accessory)
  - Abduction Machine (glute accessory)

Do not include Leg Extension — it is contraindicated for many
knee conditions and should not be a default substitution.

If injuries does NOT contain 'knee', program lower body
sessions normally including squats and lunges as appropriate.

For coachingNote fields:
coachingNote: A 1–2 sentence explanation of WHY this exercise is in this plan for this specific user. This is selection reasoning — not form cues, not generic motivation. Answer the implicit question: "Why this exercise, in this position, for my goal?"

COACHING NOTE RULES:
A coaching note explains the exercise itself — the muscle trained,
the adaptation being developed, and why this exercise exists in
this session. That is the only job.

Structure each note around:
1. The primary muscle or movement being trained
2. The main adaptation (strength, hypertrophy, stability, technique)
3. Why this exercise was selected for this session

Reference the target lift ONLY when carryover is direct and
universally accepted (e.g. close grip bench → bench lockout,
barbell row → bench lat engagement, RDL → squat posterior chain).
For everything else, explain the exercise.

Good examples:
- Back Squat: "Develops lower body strength through the quads,
  glutes, and core — your primary bilateral leg strength movement."
- Romanian Deadlift: "Hip hinge that builds hamstring and glute
  strength through their full range of motion."
- Calf Raise: "Direct plantar flexion work — builds lower leg mass
  and ankle stability."
- Lateral Raise: "Isolates the medial delt for shoulder width —
  compound pressing alone won't develop this head."
- Face Pulls: "Rear delt and external rotator work — balances
  horizontal pressing volume and keeps shoulders healthy."
- Close Grip Bench Press: "Tricep strength through the full press
  range — direct carryover to bench lockout."

When in doubt, explain the exercise. Do not search for a connection
to the goal lift.

EXERCISE SELECTION — ALLOWED NAMES AND SUB-MUSCLE TARGETING:
You MUST only use exercise names from the lists below.
Do not invent names, do not abbreviate, do not use
plural forms unless listed. Copy exact capitalisation.

When selecting exercises, match the sub-muscle emphasis
to the intended training stimulus. Examples:
- Bicep peak / long head → Bayesian Curl, Hammer Curl,
  Incline Dumbbell Curl, EZ Bar Curl (Wide Grip), Cable Curl (Rope)
- Bicep thickness / short head → Barbell Curl, Preacher Curl,
  Concentration Curl, Spider Curl, EZ Bar Curl
- Tricep mass / long head → Skull Crusher, EZ Bar Skull Crusher,
  Overhead Tricep Extension, Cable Overhead Tricep Extension
- Tricep shape / lateral head → Tricep Pushdown, Tricep Pushdown (Rope),
  Machine Dip, Close Grip Bench Press, Dips
- Front delt → Overhead Press, Cable Front Raise, Dumbbell Front Raise,
  Plate Front Raise
- Lateral delt → Lateral Raise, Dumbbell Lateral Raise,
  Cable Lateral Raise, Machine Lateral Raise
- Rear delt → Face Pull, Reverse Dumbbell Fly, Cable Rear Delt Fly,
  Rear Delt Fly, Reverse Pec Deck
- Upper chest → Incline Barbell Press, Incline Dumbbell Press,
  Incline Cable Fly, Cable Fly (Low to High)
- Mid chest → Barbell Bench Press, Dumbbell Bench Press,
  Cable Chest Fly, Pec Deck, Dumbbell Fly
- Lower chest → Decline Bench Press, Cable Fly (High to Low)
- Lats / width → Pull-Up, Lat Pulldown (Wide Grip),
  Lat Pulldown (Reverse Grip), Straight Arm Pulldown
- Mid back / thickness → Barbell Row, T-Bar Row, Seated Cable Row,
  Machine Row, Meadows Row, Seal Row
- Hamstring hinge → Romanian Deadlift, Stiff Leg Deadlift,
  Good Morning, Single Leg RDL
- Hamstring curl → Lying Leg Curl, Seated Leg Curl, Nordic Curl
- Glute dominant → Hip Thrust, Hip Thrust Machine, Glute Drive Machine,
  Banded Hip Thrust, Cable Pull-Through
- Glute isolation → Cable Kickback, Donkey Kick, Abduction Machine

ALLOWED EXERCISE NAMES BY MUSCLE GROUP:

CHEST: Barbell Bench Press, Bench Press (Wide Grip),
Bench Press (Reverse Grip), Dumbbell Bench Press,
Incline Barbell Press, Incline Barbell Bench Press,
Incline Dumbbell Press, Incline Machine Press,
Smith Machine Incline Press, Decline Bench Press,
Decline Dumbbell Press, Machine Chest Press,
Smith Machine Bench Press, Push-Up, Cable Chest Fly,
Cable Fly (High to Low), Cable Fly (Low to High),
Cable Fly (Mid Cable), Low Cable Fly, Incline Cable Fly,
Dumbbell Fly, Dumbbell Chest Fly, Pec Deck, Machine Fly,
Dumbbell Pullover

BACK: Barbell Row, Barbell Row (Overhand Wide),
Barbell Row (Overhand Narrow), Barbell Row (Underhand),
T-Bar Row, Deadlift, Trap Bar Deadlift, Rack Pull,
Pull-Up, Chin-Up, Assisted Pull-up Machine,
Lat Pulldown, Lat Pulldown (Wide Grip),
Lat Pulldown (Close Grip), Lat Pulldown (Reverse Grip),
Seated Cable Row, Cable Row (Close Grip),
Cable Row (Wide Grip), Cable Row (Reverse Grip),
Cable Row (Single Arm), Dumbbell Row,
Dumbbell Row (Pronated Grip), Machine Row,
Chest Supported Row, Straight Arm Pulldown,
Meadows Row, Seal Row

SHOULDERS: Overhead Press, Dumbbell Shoulder Press,
Arnold Press, Machine Shoulder Press, Smith Machine Press,
Dumbbell Lateral Raise, Lateral Raise, Cable Lateral Raise,
Machine Lateral Raise, Leaning Cable Lateral Raise,
Face Pull, Face Pulls, Reverse Dumbbell Fly,
Rear Delt Fly, Seated Rear Delt Fly, Cable Rear Delt Fly,
Band Pull-Apart, Reverse Pec Deck, Cable Front Raise,
Dumbbell Front Raise, Barbell Front Raise, Plate Front Raise

BICEPS: Barbell Curl, EZ Bar Curl, EZ Bar Curl (Wide Grip),
Dumbbell Curl, Dumbbell Curl (Supinated),
Dumbbell Curl (Pronated), Hammer Curl, Preacher Curl,
Preacher Curl Machine, Cable Curl, Cable Curl (Rope),
Incline Dumbbell Curl, Machine Bicep Curl,
Cross Body Hammer Curl, Rope Hammer Curl,
Concentration Curl, Bayesian Curl, Spider Curl

TRICEPS: Tricep Pushdown, Tricep Pushdown (Rope),
Tricep Pushdown (Straight Bar), Tricep Pushdown (V-Bar),
Tricep Pushdown (Reverse Grip), Overhead Tricep Extension,
Overhead Tricep Extension (Rope),
Overhead Tricep Extension (Single Arm), Skull Crusher,
EZ Bar Skull Crusher, Dumbbell Skull Crusher,
Close Grip Bench Press, Smith Machine Close Grip,
Machine Tricep Extension, Tricep Press Machine,
Cable Overhead Tricep Extension, Dumbbell Tricep Kickback,
Dips, Dip, Machine Dip, Assisted Dip Machine,
Diamond Push-Up

QUADS: Back Squat, Front Squat, Hack Squat,
Smith Machine Squat, Leg Press, Leg Press (Single Leg),
Goblet Squat, Bulgarian Split Squat, Walking Lunge,
Reverse Lunge, Step Up, Leg Extension,
Leg Extension (Single Leg), Cable Leg Extension

HAMSTRINGS: Romanian Deadlift, Stiff Leg Deadlift,
Dumbbell Romanian Deadlift, Single Leg RDL, Good Morning,
Kettlebell Swing, Lying Leg Curl, Seated Leg Curl,
Standing Leg Curl, Nordic Curl, Nordic Hamstring Curl,
Swiss Ball Leg Curl, Leg Curl

GLUTES: Hip Thrust, Hip Thrust Machine, Glute Drive Machine,
Banded Hip Thrust, Glute Bridge, Sumo Deadlift,
Cable Pull-Through, Cable Kickback, Donkey Kick,
Abduction Machine

CALVES: Standing Calf Raise, Seated Calf Raise,
Dumbbell Calf Raise, Barbell Calf Raise,
Smith Machine Calf Raise, Leg Press Calf Raise,
Bodyweight Calf Raise, Single-Leg Calf Raise, Calf Raise

CORE: Plank, Ab Wheel Rollout, Dead Bug, Hanging Leg Raise,
Leg Raise, Cable Crunch, Weighted Crunch, Sit-Up,
Bicycle Crunch, Russian Twist, Side Plank,
Cable Woodchop, Pallof Press

TRAPS: Barbell Shrug, Dumbbell Shrug, Cable Shrug,
Kettlebell Shrug, Smith Machine Shrug, Shrugs,
Upright Row, Farmer Carry

FOREARMS: Wrist Curl, Reverse Wrist Curl, Dumbbell Wrist Curl,
Reverse Curl, Plate Pinch Hold, Band Wrist Extension

GOAL LIFT TRANSFER — APPROVED EXERCISES ONLY:
When the goal lift is deadlift, only mention deadlift carryover
for exercises with direct, biomechanically obvious transfer:

APPROVED deadlift transfer mentions:
  - Romanian Deadlift, Stiff Leg Deadlift, Good Morning
  - Barbell Row, T-Bar Row, Dumbbell Row
  - Lat Pulldown, Pull-up
  - Back Extension, Glute Ham Raise
  - Farmer's Carry, Rack Pull, Hex Bar Deadlift
  - Plank (core stability for bracing only)

NOT approved — never mention deadlift carryover for:
  - Bench Press, Incline Press, any chest exercise
  - Lateral Raise, any shoulder isolation
  - Bicep Curl, Hammer Curl, any arm isolation
  - Calf Raise, Leg Extension, any calf or isolated quad work

For non-approved exercises, explain the exercise itself:
"Builds upper chest mass through the incline pressing pattern."
Not: "Balances the lat volume in your deadlift program."

${
  isNonStrengthGoal
    ? `Operational — Week 1 non-strength JSON: targetWeight MUST be 0 on every exercise — never prescribe pounds in JSON.`
    : `Operational — Week 1 strength JSON: follow prescribed targetWeights in the user message; coachingNote is still selection reasoning (why this lift), not form cues.`
}

For each workout day, include sessionFocus: one sentence (max 12 words) that tells the athlete exactly what today is about.
This appears on the athlete's Dashboard before they start the workout. Week 1 has no prior performance data — anchor on goals and session intent${
  isNonStrengthGoal ? ' (reference sets, reps, or RPE targets when weights are self-selected)' : ' (and starting loads where prescribed)'
}.

sessionFocus rules (Week 1):
- Week 1 sessionFocus lines should reference calibration (e.g. "Baseline push — feel the weights out" or "Calibration lower — log your effort honestly").
- Reference at least one specific number (sets, reps, RPE, or prescribed weight when applicable) when it fits within 12 words
- Reference the most important exercise of the day when possible
- Never use filler like 'Great session ahead' or 'You've got this'
- CRITICAL: Never use the word "AI" in sessionFocus. Jordan is a coach. First person as Jordan — "I" or "your coach" only; never "AI coach", "AI system", "artificial intelligence", or any variation.

Rest days: sessionFocus must be an empty string "".

motivationalNote (if present in any coaching copy you write):
- CRITICAL: Same rule as above — never "AI" or AI-framing; Jordan is a human coach voice; "I" or "your coach" only.

jordanWelcome (top-level JSON):
Follow the JORDAN WELCOME FIELD specification in the user message exactly — 4 sentences, fixed intro, goal-specific Sentence 2 as given there, then calibration + how you'll use their data.${
  isNonStrengthGoal
    ? ' Non-strength: Sentence 2 may include numeric RPE bands per that spec.'
    : ' In the welcome text, say "effort ratings" not numeric RPE except where the user-message spec allows.'
} Never use chatbot openers or banned hype phrases from that spec.
Do not use em-dashes anywhere in jordanWelcome.
- CRITICAL for jordanWelcome: Never use the word "AI" in the welcome or any coaching copy. Jordan is a coach, not an AI system. Never "I'm Jordan, your AI coach" or any variation. Always "I'm Jordan, your coach" — first person, no qualifiers. Good: "I'm Jordan, your coach for the next ${totalWeeks} weeks..." Bad (never output): "I'm Jordan, your AI coach for the next ${totalWeeks} weeks..."

${
  isNonStrengthGoal
    ? 'For non-strength Week 1, targetWeight 0 everywhere — trust the user message.'
    : 'Weight selection is CRITICAL. Under-programming (weights too light) destroys trust. Follow the weight rules in the prompt exactly.'
}

ACCESSORY REP RANGES AND REST PERIODS (non-negotiable):
The primary lift follows goal-specific rep and rest prescriptions.
Every other exercise in the session — all accessories, secondary compounds,
and isolation movements — MUST use hypertrophy rep ranges and standard rest
regardless of the plan goal:
- Accessories and isolations: 8–15 reps, 60–90 seconds rest
- Secondary compounds: 6–10 reps, 90–120 seconds rest
A strength goal does NOT mean every exercise uses 3–5 reps and 4-minute rest.
Only the target lift (exercise #1 on the relevant day) uses strength rep ranges
and extended rest. Everything after it uses hypertrophy ranges.
This applies universally — strength, power_hypertrophy, every goal type.
Never programme face pulls, cable flyes, lateral raises, curls, calf raises,
planks, or any isolation movement for sets of 3–5 reps. This is a critical error.`;

    const systemPrompt = isPreview ? PREVIEW_SYSTEM_PROMPT : fullSystemPrompt;
    const maxTokens = isPreview ? 4000 : 12000;

    const response = await fetchAnthropicMessagesWithRetry(() =>
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        }),
      }),
    );

    if (response.status === 503) {
      return new Response(await response.text(), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();

    if (!response.ok) {
      console.error('Claude API error:', JSON.stringify(data));
      throw new Error(`Claude API error: ${data.error?.message ?? 'unknown'}`);
    }

    const responseText = data.content?.[0]?.text ?? '';
    console.log('[generate-plan] Claude response length:', responseText.length);

    if (data.stop_reason === 'max_tokens') {
      console.error('[generate-plan] TRUNCATED — increase max_tokens');
      throw new Error('Plan generation was cut short. Please try again.');
    }

    const trimmed = responseText.trimEnd();
    if (!trimmed.endsWith('}') && !trimmed.endsWith('}```')) {
      console.error('[generate-plan] WARNING: Response may be truncated. Last 50 chars:', trimmed.slice(-50));
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response:', responseText);
      throw new Error('No JSON found in Claude response');
    }

    let plan;
    try {
      plan = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Parse error. Raw text:', responseText);
      throw new Error('JSON parse failed: ' + String(e));
    }

    const week1Data = plan.week ?? plan.weeks?.[0] ?? { weekNumber: 1, days: [] };
    // Week 1 is always baseline (legacy plans used accumulation)
    week1Data.phase = 'baseline';

    const scheduledFromClaude = Array.isArray((plan as { scheduledDays?: unknown }).scheduledDays)
      ? (plan as { scheduledDays: unknown[] }).scheduledDays.filter(
        (d): d is string => typeof d === 'string' && d.length > 0,
      )
      : [];
    const scheduledDaysResolved =
      scheduledFromClaude.length > 0 ? scheduledFromClaude : trainingDays;

    const normalized = {
      title: plan.title ?? 'Training Plan',
      jordanWelcome: plan.jordanWelcome ?? null,
      totalWeeks: plan.totalWeeks ?? totalWeeks,
      daysPerWeek: plan.daysPerWeek ?? actualDaysPerWeek,
      scheduledDays: scheduledDaysResolved,
      sessionLength: body.sessionLength ?? null,
      /** Persist onboarding choices — Profile + downstream read plan_json as source of truth */
      experience: body.experience ?? null,
      equipment: body.equipment ?? null,
      goal: goal,
      targetWeightLbs: nutritionContext.targetWeightLbs,
      calorieDirection: nutritionContext.calorieDirection,
      currentWeightLbs: nutritionContext.currentWeightLbs,
      weightDeltaLbs: nutritionContext.weightDeltaLbs,
      targetLift: strengthProgramLiftId,
      goalLift: strengthProgramLiftId,
      split: splitForNormalized,
      enhancedRecovery,
      concurrentSport,
      biologicalSex,
      subMusclePreferences,
      currentWeek: 1,
      weeks: [week1Data],
      deloadCycle: (() => {
        const v = Number((body as { deloadCycle?: unknown }).deloadCycle);
        return Number.isFinite(v) && v >= 2 ? v : 4;
      })(),
    };

    if (normalized.weeks[0] && !normalized.weeks[0].weekNumber) {
      normalized.weeks[0].weekNumber = 1;
    }

    // deno-lint-ignore no-explicit-any
    if (goal === 'power_hypertrophy' && normalized.weeks[0]?.days) {
      // deno-lint-ignore no-explicit-any
      const workoutDays = (normalized.weeks[0].days as any[]).filter((d: any) => d.type === 'workout');
      for (const day of workoutDays) {
        if (!day.sessionPhase) {
          console.error('[generate-plan] Missing sessionPhase on day:', day.title);
        }
        // deno-lint-ignore no-explicit-any
        const missingPhase = (day.exercises ?? []).filter((e: any) => !e.phase);
        if (missingPhase.length > 0) {
          // deno-lint-ignore no-explicit-any
          console.error('[generate-plan] Exercises missing phase tag:', missingPhase.map((e: any) => e.name));
        }
        // deno-lint-ignore no-explicit-any
        const phase1 = (day.exercises ?? []).filter((e: any) => e.phase === 'strength');
        // deno-lint-ignore no-explicit-any
        const phase2 = (day.exercises ?? []).filter((e: any) => e.phase === 'hypertrophy');
        console.log(`[generate-plan] ${day.title}: Phase1=${phase1.length}, Phase2=${phase2.length}`);
      }
    }

    // GAP-8: Enforce female rep range adjustments post-Claude — Claude reverts some exercises
    // GAP-7: Stamp muscleEmphasis from embedded lookup (same pattern as enforceRepRanges)
    const processedPlanJson = finalizeStrengthGoalTargetLift(
      stampWeek1PyramidSetTargets(
        enforceEmphasisVariety(
          stampMuscleEmphasisOnPlan(
            enforceRepRanges(normalized, biologicalSex),
            goal,
            strengthProgramLiftId,
          ),
        ),
      ),
      goal,
      strengthProgramLiftId,
    );

    const dc =
      typeof (processedPlanJson as { deloadCycle?: number }).deloadCycle === 'number' &&
      Number.isFinite((processedPlanJson as { deloadCycle: number }).deloadCycle)
        ? (processedPlanJson as { deloadCycle: number }).deloadCycle
        : 4;

    const planJsonWithStrengthLift = {
      ...processedPlanJson,
      weeks: (processedPlanJson.weeks ?? []).map((week: any) => ({
        ...week,
        days: finalizeStrengthTargetLiftPeriodisationOnDays(
          week.days,
          goal,
          strengthProgramLiftId,
          Number(week.weekNumber) || 1,
          dc,
        ),
      })),
    };

    applyStrengthVolumeDayFirstExerciseEightReps(planJsonWithStrengthLift, goal, strengthProgramLiftId);

    replaceKneeUnsafeExercises(planJsonWithStrengthLift, injuries);
    enforceTier1LowerLimit(planJsonWithStrengthLift);
    deduplicateExercises(planJsonWithStrengthLift);

    if (biologicalSex === 'female') {
      // deno-lint-ignore no-explicit-any
      const sampleExercises = processedPlanJson.weeks[0]?.days
        // deno-lint-ignore no-explicit-any
        ?.filter((d: any) => d.type === 'workout')
        ?.slice(0, 2)
        // deno-lint-ignore no-explicit-any
        ?.flatMap((d: any) => d.exercises?.slice(0, 3))
        // deno-lint-ignore no-explicit-any
        ?.map((e: any) => `${e.name}: ${e.reps}`);
      console.log('[generate-plan] Female rep range check:', JSON.stringify(sampleExercises));
    }

    const week1BaselineWeight =
      goal === 'strength' &&
      current1RM != null &&
      String(current1RM).trim() !== ''
        ? calculateStartingWeight(parseFloat(String(current1RM)), week1Factor(experience))
        : undefined;

    const planOut = {
      ...planJsonWithStrengthLift,
      ...(typeof week1BaselineWeight === 'number' ? { week1BaselineWeight } : {}),
      ...(isPreview ? { isPreview: true } : {}),
    };

    if (isPreview) {
      trimPreviewWeekDays(planOut as Record<string, unknown>);
    }

    if (!isPreview && userId && RATE_LIMIT_ENABLED) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );
      const isPro = await isUserPro(supabaseAdmin, userId);
      if (!isPro) {
        const { data: profile } = await supabaseAdmin
          .from('user_profiles')
          .select('full_plan_generations_used')
          .eq('user_id', userId)
          .maybeSingle();
        const used = Number(
          (profile as { full_plan_generations_used?: number } | null)?.full_plan_generations_used ?? 0,
        );
        await supabaseAdmin
          .from('user_profiles')
          .update({ full_plan_generations_used: used + 1 })
          .eq('user_id', userId);
      }
    }

    return new Response(JSON.stringify({
      plan: planOut,
      ...(isPreview ? { isPreview: true } : {}),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[generate-plan] FATAL ERROR:', error);
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[generate-plan] Error message:', msg);
    console.error('[generate-plan] Stack:', stack);
    return new Response(
      JSON.stringify({
        error: msg || 'Unknown error',
        detail: error instanceof Error ? error.stack : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
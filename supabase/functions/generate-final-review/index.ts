// Deploy: supabase functions deploy generate-final-review --no-verify-jwt
// Secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const anthropic = new Anthropic({ apiKey: anthropicApiKey });

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type PlanJson = Record<string, unknown> & {
  goal?: string;
  experience?: string;
  split?: string;
  weeks?: unknown[];
};

type WorkoutLogRow = {
  week_number: number;
  day_number: number;
  sets_json: unknown;
  skipped: boolean | null;
  logged_at: string | null;
};

type SetJsonLike = {
  exerciseName?: string;
  name?: string;
  exerciseId?: string;
  weightLbs?: number;
  weight?: number;
};

type LiftEntry = { name: string; week: number; maxWeight: number };

type FinalReviewParsed = {
  headline: string;
  jordanReview: string;
  highlights: string[];
  nextPlanRationale: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as { planId?: string; userId?: string };
    const planId = body.planId;
    const userId = body.userId;

    if (!planId || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing planId or userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 1. Fetch plan ──────────────────────────────────────────────────────
    const { data: plan, error: planErr } = await supabase
      .from('plans')
      .select('id, goal_id, plan_json, total_weeks, created_at, user_id')
      .eq('id', planId)
      .eq('user_id', userId)
      .single();

    if (planErr || !plan) throw new Error('Plan not found');

    const planJson = plan.plan_json as PlanJson;
    const goal = typeof planJson.goal === 'string' ? planJson.goal : '';
    const experience = typeof planJson.experience === 'string' ? planJson.experience : '';
    const totalWeeks =
      typeof plan.total_weeks === 'number' && plan.total_weeks > 0
        ? plan.total_weeks
        : typeof planJson.totalWeeks === 'number'
          ? planJson.totalWeeks
          : 12;
    const splitName = typeof planJson.split === 'string' ? planJson.split : '';
    const SPLIT_DISPLAY: Record<string, string> = {
      arnold: 'Arnold Split',
      ppl: 'Push/Pull/Legs',
      upper_lower: 'Upper/Lower',
      full_body: 'Full Body',
      bro_split: 'Bro Split',
      strength_focused: 'Strength Focused',
      athletic: 'Athletic Performance',
      batman: 'Batman Split',
    };
    const splitDisplayName = SPLIT_DISPLAY[splitName] ?? splitName;

    // ── 2. Fetch workout logs for this plan ────────────────────────────────
    const { data: logs } = await supabase
      .from('workout_logs')
      .select('week_number, day_number, session_fatigue_rating, sets_json, skipped, logged_at')
      .eq('plan_id', planId)
      .eq('user_id', userId)
      .order('logged_at', { ascending: true });

    const completedLogs = (logs ?? []).filter(
      (l: WorkoutLogRow) => !l.skipped,
    );
    const totalCompletedSessions = completedLogs.length;

    // Derive daysPerWeek from the first generated week only — planJson.weeks is
    // built incrementally and may not contain all weeks at plan-complete time.
    const firstWeek = Array.isArray(planJson.weeks) && planJson.weeks.length > 0
      ? planJson.weeks[0]
      : null;
    const daysPerWeek =
      isRecord(firstWeek) && Array.isArray(firstWeek.days)
        ? (firstWeek.days as unknown[]).filter(
            (d: unknown) => isRecord(d) && (d as Record<string, unknown>).type === 'workout',
          ).length
        : 0;
    const totalScheduledSessions =
      daysPerWeek > 0 ? totalWeeks * daysPerWeek : totalCompletedSessions;

    const completionRate =
      totalScheduledSessions > 0 ? totalCompletedSessions / totalScheduledSessions : 1;

    // ── 3. Key lift gains (Week 1 vs final week) ───────────────────────────
    const liftMap: Record<string, LiftEntry[]> = {};

    for (const log of completedLogs) {
      const sets = (log.sets_json ?? []) as unknown[];
      if (!Array.isArray(sets)) continue;
      for (const raw of sets) {
        const s = raw as SetJsonLike;
        const name = String(
          s.exerciseName ?? s.name ?? s.exerciseId ?? 'Unknown',
        );
        const weight = Number(s.weightLbs ?? s.weight ?? 0);
        if (weight <= 0) continue;
        if (!liftMap[name]) liftMap[name] = [];
        const existing = liftMap[name].find((e) => e.week === log.week_number);
        if (existing) {
          if (weight > existing.maxWeight) existing.maxWeight = weight;
        } else {
          liftMap[name].push({ name, week: log.week_number, maxWeight: weight });
        }
      }
    }

    const keyLiftGains: { name: string; from: number; to: number; gainLbs: number }[] = [];
    for (const entries of Object.values(liftMap)) {
      const sorted = entries.sort((a, b) => a.week - b.week);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      if (first && last && last.week > first.week && last.maxWeight > first.maxWeight) {
        keyLiftGains.push({
          name: first.name,
          from: first.maxWeight,
          to: last.maxWeight,
          gainLbs: Math.round(last.maxWeight - first.maxWeight),
        });
      }
    }
    keyLiftGains.sort((a, b) => b.gainLbs - a.gainLbs);
    const topGains = keyLiftGains.slice(0, 3);

    // ── 4. Bodyweight delta ────────────────────────────────────────────────
    const planCreatedAt = plan.created_at;
    const createdDateStr =
      typeof planCreatedAt === 'string' && planCreatedAt.length > 0
        ? planCreatedAt.split('T')[0]
        : new Date().toISOString().split('T')[0];

    const { data: weightLogs } = await supabase
      .from('weight_logs')
      .select('weight_lbs, log_date')
      .eq('user_id', userId)
      .gte('log_date', createdDateStr)
      .order('log_date', { ascending: true });

    let bodyweightDelta: number | null = null;
    if (weightLogs && weightLogs.length >= 2) {
      const first = weightLogs[0].weight_lbs as number;
      const last = weightLogs[weightLogs.length - 1].weight_lbs as number;
      bodyweightDelta = Math.round((last - first) * 10) / 10;
    }

    // ── 5. Jordan tone tier ────────────────────────────────────────────────
    function getJordanToneTier(completedWeeks: number): string {
      if (completedWeeks <= 1) return 'newcomer';
      if (completedWeeks <= 4) return 'building';
      if (completedWeeks <= 8) return 'established';
      return 'veteran';
    }
    const toneTier = getJordanToneTier(totalWeeks);

    // ── 6. Suggest next goal ───────────────────────────────────────────────
    const nextGoalMap: Record<string, string> = {
      fat_loss: 'recomp',
      hypertrophy: 'hypertrophy',
      strength: 'strength',
      power_hypertrophy: 'power_hypertrophy',
      recomp: 'hypertrophy',
      general: 'hypertrophy',
    };
    const suggestedNextGoal = nextGoalMap[goal] ?? goal;

    // ── 7. Call Claude ─────────────────────────────────────────────────────
    const toneInstructions: Record<string, string> = {
      newcomer:
        'Warm and encouraging. Acknowledge this was their first complete program. Reference specific numbers they hit. Build confidence for what comes next.',
      building:
        'Proud and direct. Reference real numbers. Show you noticed their consistency and what it produced.',
      established:
        'Peer-level. Lead with data. Specific about what changed and why. Brief congratulations, forward-focused.',
      veteran:
        'Terse. Data-first. One sentence of acknowledgment, then straight into what the numbers mean for the next block.',
    };

    const goalDisplayNames: Record<string, string> = {
      fat_loss: 'Fat Loss',
      hypertrophy: 'Build Muscle',
      strength: 'Get Stronger',
      power_hypertrophy: 'Strength & Size',
      recomp: 'Body Recomposition',
      general: 'General Fitness',
    };

    const gainsText =
      topGains.length > 0
        ? topGains.map((g) => `${g.name}: ${g.from}→${g.to} lbs (+${g.gainLbs} lbs)`).join(', ')
        : 'weight data not available';

    const bwText =
      bodyweightDelta !== null
        ? `Bodyweight change: ${bodyweightDelta > 0 ? '+' : ''}${bodyweightDelta} lbs`
        : 'No bodyweight data';

    const prompt = `You are Jordan, the user's personal coach in the Hone app.

The user has just completed their full ${totalWeeks}-week ${goalDisplayNames[goal] ?? goal} plan (${splitDisplayName}).

PLAN SUMMARY:
- Goal: ${goalDisplayNames[goal] ?? goal}
- Split: ${splitDisplayName}
- Total weeks: ${totalWeeks}
- Experience level: ${experience}
- Sessions completed: ${totalCompletedSessions} / ${totalScheduledSessions} (${Math.round(completionRate * 100)}%)
- Top lift gains: ${gainsText}
- ${bwText}

TONE: ${toneInstructions[toneTier] ?? toneInstructions.newcomer}

RULES:
- Never say "AI", "algorithm", "program" (use "plan" instead)
- Never write "programme" — always "plan"
- First person, Jordan voice
- Never generic — reference actual numbers where available
- Max 3 paragraphs for jordanReview, each max 3 sentences
- highlights must be 3 specific, concrete achievements
- nextPlanRationale must be 1 sentence explaining why this goal is the logical next step
- Always refer to the training split by its exact name: "${splitDisplayName}" — never infer or describe the structure from session data

Respond ONLY with valid JSON, no markdown fences, no preamble:
{
  "headline": "short punchy plan-complete statement, max 6 words, no punctuation",
  "jordanReview": "2-3 paragraph string separated by \\n\\n",
  "highlights": ["achievement 1", "achievement 2", "achievement 3"],
  "nextPlanRationale": "one sentence why ${suggestedNextGoal} is the next step"
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    const raw =
      block.type === 'text' ? block.text : '';

    let parsed: FinalReviewParsed;
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsedJson = JSON.parse(cleaned) as unknown;
      if (
        isRecord(parsedJson) &&
        typeof parsedJson.headline === 'string' &&
        typeof parsedJson.jordanReview === 'string' &&
        Array.isArray(parsedJson.highlights) &&
        typeof parsedJson.nextPlanRationale === 'string'
      ) {
        parsed = {
          headline: parsedJson.headline,
          jordanReview: parsedJson.jordanReview,
          highlights: parsedJson.highlights.map((h) => String(h)),
          nextPlanRationale: parsedJson.nextPlanRationale,
        };
      } else {
        throw new Error('Invalid shape');
      }
    } catch {
      parsed = {
        headline: `${totalWeeks} weeks. Done.`,
        jordanReview:
          `You completed the full ${totalWeeks}-week plan.\n\nThe numbers speak for themselves — ${Math.round(completionRate * 100)}% completion rate, real progress logged. That's the foundation for what comes next.`,
        highlights: [
          `${Math.round(completionRate * 100)}% session completion rate`,
          topGains[0] ? `${topGains[0].name} up ${topGains[0].gainLbs} lbs` : 'Full program completed',
          `${totalWeeks} weeks of consistent training`,
        ],
        nextPlanRationale: 'Build on this foundation with your next block.',
      };
    }

    // ── 8. Cross-plan memory (stored in plan_json for next generate-plan) ─
    const crossPlanMemory = {
      completedGoal: goal,
      totalWeeks,
      completionRate: Math.round(completionRate * 100),
      topLiftGains: topGains,
      bodyweightDelta,
      experience,
      suggestedNextGoal,
      coachNotes: parsed.nextPlanRationale ?? '',
    };

    // ── 9. Update plan_json with finalReview + crossPlanMemory ────────────
    const updatedPlanJson = {
      ...planJson,
      finalReview: {
        ...parsed,
        crossPlanMemory,
        generatedAt: new Date().toISOString(),
      },
    };

    await supabase
      .from('plans')
      .update({ status: 'completed', plan_json: updatedPlanJson })
      .eq('id', planId);

    if (plan.goal_id) {
      await supabase
        .from('goals')
        .update({ status: 'completed' })
        .eq('id', plan.goal_id);
    }

    return new Response(
      JSON.stringify({
        headline: parsed.headline,
        jordanReview: parsed.jordanReview,
        highlights: parsed.highlights,
        nextPlanRationale: parsed.nextPlanRationale,
        suggestedNextGoal,
        crossPlanMemory,
        stats: {
          totalWeeks,
          completedSessions: totalCompletedSessions,
          scheduledSessions: totalScheduledSessions,
          completionRate: Math.round(completionRate * 100),
          topLiftGains: topGains,
          bodyweightDelta,
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate-final-review] error:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});

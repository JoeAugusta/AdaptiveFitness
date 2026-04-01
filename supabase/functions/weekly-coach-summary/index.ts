// SETUP REQUIRED:
// Run this once in your terminal to set the API key as a Supabase secret:
//   supabase secrets set ANTHROPIC_API_KEY=your_key_here
// Never commit your API key. Never put it in .env for client use.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function parseMidReps(reps: string): number {
  const parts = reps.split('-');
  if (parts.length === 2) {
    return (parseInt(parts[0]) + parseInt(parts[1])) / 2;
  }
  return parseInt(reps) || 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, planId, weekNumber } = await req.json();

    if (!userId || !planId || weekNumber == null) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, planId, weekNumber' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    // Step 1 — Fetch plan row and workout_logs from Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const [planResult, logsResult] = await Promise.all([
      supabase.from('plans').select('plan_json').eq('id', planId).single(),
      supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_id', planId)
        .eq('week_number', weekNumber),
    ]);

    if (planResult.error) throw new Error(`Failed to fetch plan: ${planResult.error.message}`);
    if (logsResult.error) throw new Error(`Failed to fetch workout logs: ${logsResult.error.message}`);

    const planJson = planResult.data.plan_json;
    const logs = logsResult.data ?? [];

    const exerciseMap: Record<string, string> = {};
    for (const week of planJson.weeks ?? []) {
      for (const day of week.days ?? []) {
        for (const ex of day.exercises ?? []) {
          if (ex.id && ex.name) {
            exerciseMap[ex.id] = ex.name;
          }
        }
      }
    }

    // Step 2 — Find the matching week in plan_json and extract workout day targets
    const weekData = (planJson.weeks ?? []).find((w: any) => w.weekNumber === weekNumber);
    const workoutDays = (weekData?.days ?? []).filter((d: any) => d.type === 'workout');
    const daysPerWeek: number = planJson.daysPerWeek ?? workoutDays.length;
    const goalType: string = planJson.goal ?? 'general';

    type ExerciseTarget = { targetWeight: number; targetRpe: number; targetReps: number };
    const prescribedMap: Record<string, ExerciseTarget> = {};
    for (const day of workoutDays) {
      for (const ex of day.exercises ?? []) {
        prescribedMap[ex.name] = {
          targetWeight: ex.targetWeight ?? 0,
          targetRpe: ex.targetRpe ?? 0,
          targetReps: parseMidReps(ex.reps ?? '0'),
        };
      }
    }

    // Step 3 — Compute performance metrics
    const sessionsCompleted = new Set(logs.map((l: any) => l.day_number)).size;
    const sessionsPlanned = daysPerWeek;
    const completionRate = sessionsPlanned > 0 ? sessionsCompleted / sessionsPlanned : 0;

    const fatigueRatings = logs
      .map((l: any) => l.session_fatigue_rating)
      .filter((r: any) => r != null && !isNaN(Number(r)))
      .map(Number);
    const avgFatigueRating =
      fatigueRatings.length > 0
        ? fatigueRatings.reduce((a: number, b: number) => a + b, 0) / fatigueRatings.length
        : 0;

    const exercisesOverPerformed: string[] = [];
    const exercisesUnderPerformed: string[] = [];
    const prsHit: string[] = [];
    const rpeDeltas: number[] = [];

    type ActualData = {
      totalWeight: number;
      totalReps: number;
      totalRpe: number;
      count: number;
      maxWeight: number;
    };
    const actualMap: Record<string, ActualData> = {};

    for (const log of logs) {
      const setsJson: any[] = log.sets_json ?? [];
      for (const set of setsJson) {
        const name: string =
          exerciseMap[set.exerciseId] ??
          set.exerciseName ??
          set.name ??
          '';
        if (!name) continue;
        if (!actualMap[name]) {
          actualMap[name] = { totalWeight: 0, totalReps: 0, totalRpe: 0, count: 0, maxWeight: 0 };
        }
        const weight = Number(set.weightLbs ?? set.weight ?? set.loggedWeight ?? 0);
        const reps = Number(set.reps ?? set.loggedReps ?? 0);
        const rpe = Number(set.rpe ?? set.loggedRpe ?? 0);
        actualMap[name].totalWeight += weight;
        actualMap[name].totalReps += reps;
        actualMap[name].totalRpe += rpe;
        actualMap[name].count += 1;
        if (weight > actualMap[name].maxWeight) actualMap[name].maxWeight = weight;
      }
    }

    for (const [name, actual] of Object.entries(actualMap)) {
      const prescribed = prescribedMap[name];
      if (!prescribed) continue;

      const avgReps = actual.count > 0 ? actual.totalReps / actual.count : 0;
      const avgWeight = actual.count > 0 ? actual.totalWeight / actual.count : 0;
      const avgRpe = actual.count > 0 ? actual.totalRpe / actual.count : 0;

      if (avgReps > prescribed.targetReps * 1.1 || avgWeight > prescribed.targetWeight * 1.05) {
        exercisesOverPerformed.push(name);
      } else if (
        avgReps < prescribed.targetReps * 0.85 ||
        avgWeight < prescribed.targetWeight * 0.9
      ) {
        exercisesUnderPerformed.push(name);
      }

      if (actual.maxWeight > prescribed.targetWeight * 1.05) {
        prsHit.push(name);
      }

      if (prescribed.targetRpe > 0) {
        rpeDeltas.push(avgRpe - prescribed.targetRpe);
      }
    }

    const avgRpeVsTarget =
      rpeDeltas.length > 0
        ? rpeDeltas.reduce((a, b) => a + b, 0) / rpeDeltas.length
        : 0;

    const metrics = {
      sessionsCompleted,
      sessionsPlanned,
      completionRate: Math.round(completionRate * 100) / 100,
      avgFatigueRating: Math.round(avgFatigueRating * 10) / 10,
      exercisesOverPerformed,
      exercisesUnderPerformed,
      prsHit,
      avgRpeVsTarget: Math.round(avgRpeVsTarget * 10) / 10,
    };

    // Step 4 — Call Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: `You are Jordan, the athlete's personal coach. You have their full week of training data. Write their weekly debrief.

Your response must be a JSON object with these exact fields:
{
  "headline": "One punchy sentence summarising the week. No filler.",
  "performanceRating": "strong | on-track | tough-week",
  "highlights": ["Array of 2-3 strings. Each is a specific win with real numbers. No generic statements."],
  "performanceSummary": "2-3 sentences. Jordan's honest read of the week. Reference specific exercises and numbers. If it was a tough week, say so clearly.",
  "nextWeekChanges": "2-3 sentences. What Jordan is changing and exactly why. Reference the performance data that drove the decision.",
  "nutritionCheckin": "1-2 sentences on macro targets. Keep brief.",
  "motivationalNote": "1-2 sentences. Specific to the user's goal. Forward-looking. End with '— Jordan'."
}

Tone rules:
- Write as Jordan in first person throughout
- Reference actual weights, reps, and RPE from the data
- The motivationalNote must reference the user's specific goal (e.g. their target 1RM, their target weight loss, their muscle goals)
- Never use filler praise like 'Great job!', 'Keep it up!', 'Well done!', or 'Fantastic work!'
- The sign-off '— Jordan' appears only at the end of motivationalNote, nowhere else
- Return only valid JSON, no markdown, no prose outside the JSON`,
        messages: [
          {
            role: 'user',
            content: `Generate a weekly coach debrief for Week ${weekNumber}.
Goal type: ${goalType}
Performance metrics:
${JSON.stringify(metrics, null, 2)}

Return ONLY this exact JSON structure with no other text:
{
  "weekNumber": ${weekNumber},
  "performanceRating": "strong" | "on-track" | "tough-week",
  "headline": string,
  "highlights": string[],
  "performanceSummary": string,
  "nextWeekChanges": string,
  "nutritionCheckin": string,
  "motivationalNote": string
}`,
          },
        ],
      }),
    });

    const claudeData = await claudeResponse.json();

    if (!claudeResponse.ok) {
      throw new Error(`Claude API error: ${claudeData.error?.message ?? 'unknown'}`);
    }

    const text: string = claudeData.content?.[0]?.text ?? '';

    // Step 5 — Parse Claude JSON and return
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Claude response');

    let summary: unknown;
    try {
      summary = JSON.parse(jsonMatch[0]);
    } catch (e) {
      throw new Error('JSON parse failed: ' + String(e));
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('weekly-coach-summary error:', String(error));
    return new Response(JSON.stringify({ error: String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

// DEPLOY:
// supabase functions deploy weekly-coach-summary

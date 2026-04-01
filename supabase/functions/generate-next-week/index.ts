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

const COMPOUND_KEYWORDS = ['squat', 'deadlift', 'bench press', 'row', 'press', 'lunge', 'hip thrust'];

function isCompound(name: string): boolean {
  const lower = name.toLowerCase();
  return COMPOUND_KEYWORDS.some((kw) => lower.includes(kw));
}

function parseMidReps(reps: string): number {
  const parts = reps.split('-');
  if (parts.length === 2) {
    return (parseInt(parts[0]) + parseInt(parts[1])) / 2;
  }
  return parseInt(reps) || 0;
}

function roundTo2_5(value: number): number {
  return Math.round(value / 2.5) * 2.5;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, planId, completedWeekNumber } = await req.json();

    if (!userId || !planId || completedWeekNumber == null) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, planId, completedWeekNumber' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Step 1 — Fetch all required data in parallel
    const [planResult, logsResult, profileResult] = await Promise.all([
      supabase
        .from('plans')
        .select('id, plan_json, current_week, total_weeks, goal_id')
        .eq('id', planId)
        .single(),
      supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_id', planId)
        .eq('week_number', completedWeekNumber),
      supabase
        .from('user_profiles')
        .select('training_age, weight_lbs, equipment')
        .eq('user_id', userId)
        .single(),
    ]);

    if (planResult.error) throw new Error(`Failed to fetch plan: ${planResult.error.message}`);
    if (logsResult.error) throw new Error(`Failed to fetch logs: ${logsResult.error.message}`);

    const plan = planResult.data;
    const planJson = plan.plan_json;
    const logs = logsResult.data ?? [];
    const profile = profileResult.data;

    // Fetch goal type via goal_id
    let goalType = 'general';
    if (plan.goal_id) {
      const { data: goalRow } = await supabase
        .from('goals')
        .select('goal_type')
        .eq('id', plan.goal_id)
        .single();
      if (goalRow?.goal_type) goalType = goalRow.goal_type;
    }

    const totalWeeks: number = plan.total_weeks ?? planJson.totalWeeks ?? 12;

    // Step 2 — Guard checks
    if (completedWeekNumber >= totalWeeks) {
      return new Response(
        JSON.stringify({ status: 'plan_complete' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (plan.current_week !== completedWeekNumber) {
      return new Response(
        JSON.stringify({ status: 'already_advanced' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Step 3 — Extract completed week data from plan_json
    const weekData = (planJson.weeks ?? []).find((w: any) => w.weekNumber === completedWeekNumber);
    const workoutDays = (weekData?.days ?? []).filter((d: any) => d.type === 'workout');
    const daysPerWeek: number = planJson.daysPerWeek ?? workoutDays.length;

    type PrescribedEx = {
      targetWeight: number;
      targetRpe: number;
      targetReps: number;
      sets: number;
      reps: string;
    };
    const prescribedMap: Record<string, PrescribedEx> = {};
    for (const day of workoutDays) {
      for (const ex of day.exercises ?? []) {
        prescribedMap[ex.name] = {
          targetWeight: ex.targetWeight ?? 0,
          targetRpe: ex.targetRpe ?? 0,
          targetReps: parseMidReps(ex.reps ?? '0'),
          sets: ex.sets ?? 3,
          reps: ex.reps ?? '8-10',
        };
      }
    }

    // Step 4 — Compute performance metrics
    const distinctDays = new Set(logs.map((l: any) => l.day_number)).size;
    const sessionsCompleted = distinctDays;
    const sessionsPlanned = daysPerWeek;
    const completionRate = sessionsPlanned > 0 ? sessionsCompleted / sessionsPlanned : 0;

    let completionTier: 'full' | 'partial' | 'low';
    if (completionRate >= 0.8) completionTier = 'full';
    else if (completionRate >= 0.6) completionTier = 'partial';
    else completionTier = 'low';

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
        const name: string = set.exerciseName ?? set.name ?? '';
        if (!name) continue;
        if (!actualMap[name]) {
          actualMap[name] = { totalWeight: 0, totalReps: 0, totalRpe: 0, count: 0, maxWeight: 0 };
        }
        const weight = Number(set.weight ?? set.loggedWeight ?? 0);
        const reps = Number(set.reps ?? set.loggedReps ?? 0);
        const rpe = Number(set.rpe ?? set.loggedRpe ?? 0);
        actualMap[name].totalWeight += weight;
        actualMap[name].totalReps += reps;
        actualMap[name].totalRpe += rpe;
        actualMap[name].count += 1;
        if (weight > actualMap[name].maxWeight) actualMap[name].maxWeight = weight;
      }
    }

    // Build exercise adaptations
    const exerciseAdaptations: any[] = [];

    for (const [name, prescribed] of Object.entries(prescribedMap)) {
      const actual = actualMap[name];
      const avgReps = actual ? actual.totalReps / actual.count : 0;
      const avgRpe = actual ? actual.totalRpe / actual.count : 0;
      const compound = isCompound(name);

      let weightAction: 'increase' | 'decrease' | 'hold';
      let weightDelta: number;

      if (completionTier === 'full') {
        if (avgRpe <= 7 && avgReps >= prescribed.targetReps * 1.05) {
          weightAction = 'increase';
          weightDelta = compound ? 2.5 : 1;
        } else if (avgRpe >= 9 || avgReps < prescribed.targetReps * 0.85) {
          weightAction = 'decrease';
          weightDelta = -2.5;
        } else {
          weightAction = 'hold';
          weightDelta = 0;
        }
      } else if (completionTier === 'partial') {
        weightAction = 'hold';
        weightDelta = 0;
      } else {
        weightAction = 'decrease';
        weightDelta = -2.5;
      }

      const newTargetWeight = Math.max(0, prescribed.targetWeight + weightDelta);

      exerciseAdaptations.push({
        name,
        oldWeight: prescribed.targetWeight,
        newTargetWeight,
        weightAction,
        oldReps: prescribed.reps,
        sets: prescribed.sets,
        targetRpe: prescribed.targetRpe,
      });
    }

    // Step 5 — Determine next week phase
    const nextWeekNumber = completedWeekNumber + 1;
    const weekInCycle = nextWeekNumber % 4;
    let phase: string;
    if (weekInCycle === 0) {
      phase = 'deload';
    } else if (nextWeekNumber <= totalWeeks / 2) {
      phase = 'accumulation';
    } else {
      phase = 'intensification';
    }

    // Deload overrides
    if (phase === 'deload') {
      for (const ex of exerciseAdaptations) {
        ex.newTargetWeight = roundTo2_5(ex.oldWeight * 0.8);
        ex.sets = Math.max(2, ex.sets - 1);
        ex.weightAction = 'deload';
      }
    }

    // Step 6 — Call Claude API
    const split = planJson.split ?? weekData?.title ?? 'mixed';
    const equipment = profile?.equipment ?? 'full gym';
    const trainingAge = profile?.training_age ?? 'unknown';

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: `You are Jordan, the athlete's personal coach. You have their last week of performance data and you are writing their next week plan. Generate the training plan as structured JSON with varied exercise selection, smart ordering, and coaching notes that reference the user's actual performance.

For each exercise coachingNote:
- Speak as Jordan directly to the athlete
- If weight increased: tell them why ('You hit 185 at RPE 7 last week — I'm moving you to 190 this week, you have more in the tank')
- If weight held: tell them why ('RPE was high last week — same weight this week, focus on cleaner reps')
- If weight decreased or it's a deload: be honest and frame it positively ('Backing off this week is intentional — your body needs it to come back stronger')
- Keep each note to 1-2 sentences
- Reference the actual numbers from last week where available
- Never use generic form cues like 'Focus on good form'
- Never use filler praise like 'Great job!' or 'Keep it up!'

Return ONLY valid JSON with no prose, preamble, or markdown.`,
        messages: [
          {
            role: 'user',
            content: `Generate Week ${nextWeekNumber} of a ${totalWeeks}-week ${goalType} training plan.

Phase: ${phase}
Training split: ${split}
Days per week: ${daysPerWeek}
Equipment: ${equipment}
Training age: ${trainingAge}
Completion tier last week: ${completionTier} (${sessionsCompleted}/${sessionsPlanned} sessions)

Exercise adaptations for next week:
${JSON.stringify(exerciseAdaptations, null, 2)}

Rules:
- Use the newTargetWeight for each exercise listed above
- Maintain the same core exercise selection unless weightAction is 'decrease' for 3+ consecutive sets (in that case, suggest a regression)
- If phase is 'deload': reduce sets by 1, keep reps in lower range, add coaching notes about recovery
- If completionTier is 'low': add a coaching note suggesting the user review their schedule
- Each exercise must have: id (uuid), name, muscleGroup, sets, reps (string range e.g. '8-10'), targetWeight (number), restSeconds, targetRpe, coachingNote (1 sentence referencing their performance)
- Include all 7 days. Workout days have exercises, rest days have empty exercises array and type 'rest'.

Return ONLY this exact JSON structure with no other text:
{
  "weekNumber": ${nextWeekNumber},
  "phase": "${phase}",
  "days": [
    {
      "dayNumber": number,
      "type": "workout" | "rest",
      "title": string,
      "muscleGroups": string[],
      "exercises": [
        {
          "id": string,
          "name": string,
          "muscleGroup": string,
          "sets": number,
          "reps": string,
          "targetWeight": number,
          "restSeconds": number,
          "targetRpe": number,
          "coachingNote": string
        }
      ]
    }
  ]
}`,
          },
        ],
      }),
    });

    const claudeData = await claudeResponse.json();

    if (!claudeResponse.ok) {
      console.error('Claude API error:', JSON.stringify(claudeData));
      throw new Error(`Claude API error: ${claudeData.error?.message ?? 'unknown'}`);
    }

    const text: string = claudeData.content?.[0]?.text ?? '';

    // Step 7 — Parse Claude response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response:', text.substring(0, 300));
      throw new Error('No JSON found in Claude response');
    }

    let nextWeekData: any;
    try {
      nextWeekData = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Parse error. Raw text:', text.substring(0, 500));
      throw new Error('JSON parse failed: ' + String(e));
    }

    // Ensure weekNumber and phase are set
    nextWeekData.weekNumber = nextWeekNumber;
    nextWeekData.phase = phase;

    // Step 8 — Save to Supabase atomically (fresh read to avoid race)
    const { data: freshPlan, error: freshErr } = await supabase
      .from('plans')
      .select('plan_json')
      .eq('id', planId)
      .single();

    if (freshErr) throw new Error(`Failed to re-fetch plan: ${freshErr.message}`);

    const updatedPlanJson = { ...freshPlan.plan_json };
    if (!Array.isArray(updatedPlanJson.weeks)) updatedPlanJson.weeks = [];
    updatedPlanJson.weeks.push(nextWeekData);
    updatedPlanJson.currentWeek = nextWeekNumber;

    const { error: updateErr } = await supabase
      .from('plans')
      .update({ plan_json: updatedPlanJson, current_week: nextWeekNumber })
      .eq('id', planId);

    if (updateErr) throw new Error(`Failed to update plan: ${updateErr.message}`);

    // Step 9 — Return success
    return new Response(
      JSON.stringify({ status: 'success', nextWeekNumber, phase, completionTier }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('generate-next-week error:', String(error));
    return new Response(
      JSON.stringify({ error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});

// DEPLOY:
// supabase functions deploy generate-next-week

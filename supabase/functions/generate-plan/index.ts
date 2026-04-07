import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Goal-specific programming parameters
const GOAL_PROGRAMMING: Record<string, {
  repRange: string;
  sets: number;
  restSeconds: number;
  targetRpe: number;
  intensity: string;
  notes: string;
}> = {
  strength: {
    repRange: '3-5',
    sets: 5,
    restSeconds: 240,
    targetRpe: 8,
    intensity: 'heavy',
    notes: 'Prioritise compound lifts. Linear progression. Work up to a heavy top set.',
  },
  hypertrophy: {
    repRange: '8-12',
    sets: 4,
    restSeconds: 90,
    targetRpe: 7,
    intensity: 'moderate-heavy',
    notes: 'Volume-focused. Include compound + isolation work. Progressive overload via reps then weight.',
  },
  recomp: {
    repRange: '8-12',
    sets: 3,
    restSeconds: 75,
    targetRpe: 7,
    intensity: 'moderate',
    notes: 'Balanced compound and isolation. Maintain muscle while in slight deficit.',
  },
  fat_loss: {
    repRange: '10-15',
    sets: 3,
    restSeconds: 60,
    targetRpe: 7,
    intensity: 'moderate',
    notes: 'Higher rep ranges, shorter rest. Preserve muscle through caloric deficit.',
  },
  general: {
    repRange: '8-12',
    sets: 3,
    restSeconds: 90,
    targetRpe: 6,
    intensity: 'moderate',
    notes: 'Full body focus. Balanced across all movement patterns.',
  },
};

// Calculate starting weight from 1RM percentage
function calculateStartingWeight(oneRM: number, percentage: number): number {
  return Math.round((oneRM * percentage) / 2.5) * 2.5;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const profile = await req.json();

    const daysPerWeek = parseInt(profile.daysPerWeek ?? '4');
    const totalWeeks = parseInt(profile.planDuration ?? '12');
    const goal = profile.goal ?? 'general';
    const programming = GOAL_PROGRAMMING[goal] ?? GOAL_PROGRAMMING.general;

    const exclusions = [
      ...(profile.injuries ?? []),
      ...(profile.excludedExercises ?? []),
    ].join(', ') || 'none';

    // Build goal-specific context for the prompt
    let goalContext = '';
    let weightAnchor = '';

    if (goal === 'strength' && profile.current1RM && profile.targetLift) {
      const current1RM = parseFloat(profile.current1RM);
      const target1RM = parseFloat(profile.target1RM ?? profile.current1RM);
      const week1Weight = calculateStartingWeight(current1RM, 0.75);
      const liftName = profile.targetLift.replace(/_/g, ' ');

      goalContext = `Primary lift: ${liftName}. Current 1RM: ${current1RM} lbs. Target 1RM: ${target1RM} lbs over ${totalWeeks} weeks.`;
      weightAnchor = `
CRITICAL WEIGHT RULES for strength goal:
- ${liftName} Week 1 working sets MUST start at ${week1Weight} lbs (75% of ${current1RM} lb 1RM).
- All other compound lifts: estimate based on the athlete's ${liftName} strength (they are ${profile.experience} level).
- Week 1 is a baseline week. Do NOT start at their max. 75% 1RM is the starting point.
- Use straight sets (same weight across all sets) for the primary lift.
- Secondary lifts should be calibrated proportionally to their strength level.`;
    } else if (goal === 'hypertrophy' && profile.priorityMuscles?.length > 0) {
      goalContext = `Priority muscle groups: ${profile.priorityMuscles.join(', ')}. Give these groups extra volume (1 additional exercise).`;
      weightAnchor = `
WEIGHT RULES for hypertrophy goal:
- Choose weights the athlete can complete ${programming.repRange} reps at RPE ${programming.targetRpe} given their ${profile.experience} level and ${profile.equipment} access.
- ${profile.experience === 'beginner' ? 'Use conservative weights — beginners need to learn movement patterns first.' : ''}
- ${profile.experience === 'intermediate' ? 'Use moderate-challenging weights. Rep targets should be achievable but require effort.' : ''}
- ${profile.experience === 'advanced' ? 'Use challenging weights. Top of rep range should be near failure at target RPE.' : ''}`;
    } else if (goal === 'fat_loss') {
      goalContext = profile.targetWeightLbs
        ? `Target weight: ${profile.targetWeightLbs} lbs. Plan duration: ${totalWeeks} weeks.`
        : '';
      weightAnchor = `Weight selection: Choose weights that allow completion of ${programming.repRange} reps with ${programming.restSeconds}s rest. Slightly lighter than hypertrophy — density is the goal.`;
    } else {
      weightAnchor = `Weight selection: Choose appropriate starting weights for a ${profile.experience} level athlete with access to ${profile.equipment}. Use standard percentage-based estimates.`;
    }

    const prompt = `Create Week 1 of a ${totalWeeks}-week ${goal} training plan.

ATHLETE PROFILE:
- Experience: ${profile.experience}
- Split: ${profile.split}
- Equipment: ${profile.equipment}
- Session length: ${profile.sessionLength} minutes
- Days per week: ${daysPerWeek}
- Exercises to avoid: ${exclusions}
${goalContext ? `- Goal details: ${goalContext}` : ''}

PROGRAMMING PARAMETERS for ${goal.toUpperCase()}:
- Rep range: ${programming.repRange}
- Sets per exercise: ${programming.sets}
- Rest between sets: ${programming.restSeconds} seconds
- Target RPE: ${programming.targetRpe}
- Intensity: ${programming.intensity}
- Notes: ${programming.notes}

${weightAnchor}

EXERCISE SELECTION RULES:
- Max 5 exercises per session for ${profile.sessionLength} minute sessions
- For ${profile.split} split, ensure logical muscle group distribution across days
- Use exercises appropriate for ${profile.equipment}
- Week 1: focus on foundational movements. Save advanced variations for later weeks.
- Vary exercise selection — do not repeat the same exercises on back-to-back days for the same muscle group

Generate exactly ${daysPerWeek} workout days plus rest days to fill all 7 days.
Each workout day must include sessionFocus (one sentence, max 12 words — see system prompt). Rest days must have sessionFocus: "".
Respond with ONLY this JSON, no other text:
{
  "title": "descriptive plan name",
  "totalWeeks": ${totalWeeks},
  "daysPerWeek": ${daysPerWeek},
  "week": {
    "weekNumber": 1,
    "days": [
      {
        "dayNumber": 1,
        "type": "workout",
        "title": "workout name e.g. Push A",
        "sessionFocus": "Bench starts at 275 — 75% of your 1RM, building baseline.",
        "muscleGroups": ["Chest", "Shoulders", "Triceps"],
        "exercises": [
          {
            "id": "e1",
            "name": "Exercise Name",
            "muscleGroup": "Chest",
            "sets": ${programming.sets},
            "reps": "${programming.repRange}",
            "targetWeight": 135,
            "restSeconds": ${programming.restSeconds},
            "targetRpe": ${programming.targetRpe},
            "coachingNote": "Jordan's specific note for this exercise referencing the athlete's goal and starting weight"
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
Include all 7 days. Workout days have exercises. Rest days have empty exercises array and type "rest".`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: `You are Jordan, an expert personal coach building Week 1 of a training plan. 

Your job: create a properly structured, goal-appropriate training week with realistic starting weights.

For coachingNote fields:
- Speak directly to the athlete as Jordan
- Reference their goal and why this exercise/weight is appropriate
- For strength athletes: explain the weight selection in context of their 1RM
- Keep each note to 1-2 sentences
- Never write generic form cues ("focus on good form")
- Never use filler praise ("Great choice!", "This is perfect!")

For each workout day, include sessionFocus: one sentence (max 12 words) that tells the athlete exactly what today is about.
This appears on the athlete's Dashboard before they start the workout. Week 1 has no prior performance data — anchor on starting loads, goals, and session intent (not last week's RPE).

sessionFocus rules (Week 1):
- Always reference at least one specific number (weight, RPE, or sets) from that day's plan
- Reference the most important exercise of the day
- Never use filler like 'Great session ahead' or 'You've got this'
- Examples:
  'Bench starts at 275 — 75% of your 1RM, building your baseline.'
  'First pull day — deadlift at 405, establishing your starting point.'
  'Leg day: Back Squat at 315, focus on depth and control.'

Rest days: sessionFocus must be an empty string "".

Weight selection is CRITICAL. Under-programming (weights too light) destroys trust. Follow the weight rules in the prompt exactly.`,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Claude API error:', JSON.stringify(data));
      throw new Error(`Claude API error: ${data.error?.message ?? 'unknown'}`);
    }

    const text = data.content?.[0]?.text ?? '';
    console.log('Claude response length:', text.length);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response:', text);
      throw new Error('No JSON found in Claude response');
    }

    let plan;
    try {
      plan = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Parse error. Raw text:', text);
      throw new Error('JSON parse failed: ' + String(e));
    }

    const normalized = {
      title: plan.title ?? 'Training Plan',
      totalWeeks: plan.totalWeeks ?? totalWeeks,
      daysPerWeek: plan.daysPerWeek ?? daysPerWeek,
      goal: goal,
      split: profile.split,
      currentWeek: 1,
      weeks: [plan.week ?? plan.weeks?.[0] ?? { weekNumber: 1, days: [] }],
    };

    if (normalized.weeks[0] && !normalized.weeks[0].weekNumber) {
      normalized.weeks[0].weekNumber = 1;
    }

    return new Response(JSON.stringify({ plan: normalized }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('generate-plan error:', String(error));
    return new Response(
      JSON.stringify({ error: 'Plan generation failed', detail: String(error) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
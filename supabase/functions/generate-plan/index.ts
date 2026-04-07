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

const VOLUME_LANDMARKS: Record<
  string,
  { minSets: number; maxSets: number; priorityMin: number; priorityMax: number }
> = {
  beginner: { minSets: 8, maxSets: 10, priorityMin: 10, priorityMax: 12 },
  intermediate: { minSets: 10, maxSets: 16, priorityMin: 14, priorityMax: 18 },
  advanced: { minSets: 12, maxSets: 20, priorityMin: 16, priorityMax: 20 },
};

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
};

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
    let exerciseSelectionSection = '';

    if (goal === 'strength' && profile.current1RM && profile.targetLift) {
      const current1RM = parseFloat(profile.current1RM ?? '0');
      const target1RM = parseFloat(profile.target1RM ?? profile.current1RM ?? '0');
      const week1Weight = calculateStartingWeight(current1RM, 0.75);
      const liftName = profile.targetLift.replace(/_/g, ' ');
      const liftKey = profile.targetLift?.replace(/_/g, ' ').toLowerCase() ?? '';
      const accessories = LIFT_ACCESSORIES[liftKey] ?? LIFT_ACCESSORIES['bench press'];

      goalContext = `Primary lift: ${liftName}. Current 1RM: ${current1RM} lbs. Target 1RM: ${target1RM} lbs over ${totalWeeks} weeks.`;
      weightAnchor = `
CRITICAL WEIGHT RULES for strength goal:
- ${liftName} Week 1 working sets MUST start at ${week1Weight} lbs (75% of ${current1RM} lb 1RM).
- All other compound lifts: estimate based on the athlete's ${liftName} strength (they are ${profile.experience} level).
- Week 1 is a baseline week. Do NOT start at their max. 75% 1RM is the starting point.
- Use straight sets (same weight across all sets) for the primary lift.
- Secondary lifts should be calibrated proportionally to their strength level.

STRENGTH FREQUENCY RULES:
- The primary lift (${liftName}) should appear on BOTH push/upper days at different intensities:
  - Heavy day: 5 sets × 3-5 reps @ 75-85% 1RM (Week 1 = 75%)
  - Volume day: 4 sets × 4-6 reps @ 70-75% 1RM (Week 1 = 70%)
- This gives the athlete 2 exposures per week to the target movement
- If only 3 days/week (PPL): Day 1 = heavy push, Day 2 = pull, Day 3 = legs
  The following week would rotate: Day 1 = volume push, etc.
- If 4+ days/week: dedicate separate heavy and volume push days

1RM PROGRESSION PATH over ${totalWeeks} weeks:
- Week 1: ${calculateStartingWeight(current1RM, 0.75)} lbs (75% of ${current1RM} 1RM) — baseline
- Week ${Math.round(totalWeeks * 0.25)}: ~${calculateStartingWeight(current1RM, 0.8)} lbs (80%) — accumulation
- Week ${Math.round(totalWeeks * 0.5)}: ~${calculateStartingWeight(current1RM, 0.85)} lbs (85%) — intensification
- Week ${Math.round(totalWeeks * 0.75)}: ~${calculateStartingWeight(current1RM, 0.9)} lbs (90%) — peak
- Week ${totalWeeks}: ~${calculateStartingWeight(target1RM, 1.0)} lbs — target 1RM attempt
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

For a PPL split targeting ${liftName}:
- Push days: primary lift + 1-2 direct variations + lockout work
- Pull days: upper back work + vertical pull + biceps
- Leg days: full lower body — do NOT skip legs even on a bench specialisation program

${MOVEMENT_PATTERN_BLOCK}`;
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

    if (!exerciseSelectionSection) {
      exerciseSelectionSection = `EXERCISE SELECTION RULES:
- Max 5 exercises per session for ${profile.sessionLength} minute sessions
- For ${profile.split} split, ensure logical muscle group distribution across days
- Use exercises appropriate for ${profile.equipment}
- Week 1: focus on foundational movements. Save advanced variations for later weeks.
- Vary exercise selection — do not repeat the same exercises on back-to-back days for the same muscle group

${MOVEMENT_PATTERN_BLOCK}`;
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

${exerciseSelectionSection}

VOLUME RULES (weekly sets per muscle group):
- Experience level: ${profile.experience}
- Each muscle group should receive ${VOLUME_LANDMARKS[profile.experience]?.minSets ?? 10}–${VOLUME_LANDMARKS[profile.experience]?.maxSets ?? 16} sets per week
- Priority muscles (if any) should receive ${VOLUME_LANDMARKS[profile.experience]?.priorityMin ?? 14}–${VOLUME_LANDMARKS[profile.experience]?.priorityMax ?? 18} sets per week
- Do NOT exceed the max — overdosing a muscle group causes excessive fatigue
- Do NOT go below the min — underdosing produces no adaptation
- Count total sets across ALL workout days when distributing volume

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
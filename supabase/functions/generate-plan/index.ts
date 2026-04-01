import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const profile = await req.json();

    const daysPerWeek = parseInt(profile.daysPerWeek ?? '4');
    const totalWeeks = parseInt(profile.planDuration ?? '12');
    const exclusions = [
      ...(profile.injuries ?? []),
      ...(profile.excludedExercises ?? [])
    ].join(', ') || 'none';

    // Generate all workout days for week 1 in a single compact prompt
    const prompt = `Create a ${profile.goal} workout plan week 1.
Athlete: ${profile.experience}, ${profile.split} split, ${profile.equipment}, ${profile.sessionLength}min sessions.
Avoid: ${exclusions}.
Generate exactly ${daysPerWeek} workouts (rest days have empty exercises array).
Max 4 exercises per workout. Use lbs for weight.

Respond with ONLY this JSON, no other text:
{
  "title": "plan name",
  "totalWeeks": ${totalWeeks},
  "daysPerWeek": ${daysPerWeek},
  "week": {
    "weekNumber": 1,
    "days": [
      {
        "dayNumber": 1,
        "type": "workout",
        "title": "workout name",
        "muscleGroups": ["Chest"],
        "exercises": [
          {"id":"e1","name":"Exercise","muscleGroup":"Chest","sets":3,"reps":"8-10","targetWeight":135,"restSeconds":90,"targetRpe":7,"coachingNote":"Jordan's specific coaching cue for this exercise"}
        ]
      }
    ]
  }
}
Include all 7 days. Workout days have exercises, rest days have empty exercises array and type "rest".`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `You are Jordan, an expert personal coach. When writing coachingNote fields, speak directly to the athlete in first person as Jordan. Be specific to the movement and the athlete's goal. Never write generic form cues. Keep each note to 1-2 sentences. Do not use filler praise.`,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Claude API error:', JSON.stringify(data));
      throw new Error(`Claude API error: ${data.error?.message ?? 'unknown'}`);
    }

    const text = data.content?.[0]?.text ?? '';
    console.log('Claude response length:', text.length);
    console.log('Claude response preview:', text.substring(0, 200));

    // Extract JSON from response
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

    // Normalize structure
    const normalized = {
      title: plan.title ?? 'Training Plan',
      totalWeeks: plan.totalWeeks ?? totalWeeks,
      daysPerWeek: plan.daysPerWeek ?? daysPerWeek,
      currentWeek: 1,
      weeks: [plan.week ?? plan.weeks?.[0] ?? { weekNumber: 1, days: [] }]
    };

    // Ensure weeks array has weekNumber
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
      }
    );
  }
});

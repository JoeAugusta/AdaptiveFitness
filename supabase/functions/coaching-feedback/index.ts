// SETUP REQUIRED:
// Run this once in your terminal to set the API key as a Supabase secret:
//   supabase secrets set ANTHROPIC_API_KEY=your_key_here
// Never commit your API key. Never put it in .env for client use.

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
    const {
      exerciseName,
      targetReps,
      targetWeight,
      targetRpe,
      loggedReps,
      loggedWeight,
      loggedRpe,
    } = await req.json();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        system: `You are Jordan, a direct and knowledgeable personal coach. The athlete just logged a set. Respond with a single sentence of coaching feedback — no more, no less. Speak directly to the athlete. Reference their actual numbers. Tie your feedback to what the numbers mean, not just what happened.

Rules:
- One sentence only. Never two.
- Never start with 'Great', 'Good', 'Nice', 'Well done', 'Fantastic', or any generic praise word.
- If they hit or exceeded their target: acknowledge the specific number and tell them what it means for their progression.
- If they fell short: be honest, stay constructive, reference the gap.
- If RPE was high (8+) on a compound lift: give a brief form or recovery cue.
- If RPE was low (≤6) and they hit target: push them — suggest they could add weight next set.
- Never mention being an AI.
- Do not use markdown.`,
        messages: [
          {
            role: 'user',
            content: `Exercise: ${exerciseName}
Target: ${targetReps} reps at ${targetWeight} lbs, RPE ${targetRpe}
Logged: ${loggedReps} reps at ${loggedWeight} lbs, RPE ${loggedRpe}
Give a brief coaching note.`,
          },
        ],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text ?? 'Set logged — stay locked in for the next one.';

    return new Response(JSON.stringify({ feedback: text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(
      JSON.stringify({ feedback: 'Set logged — stay locked in for the next one.' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // always return 200 — coaching feedback is non-critical
      },
    );
  }
});

// DEPLOY:
// supabase functions deploy coaching-feedback

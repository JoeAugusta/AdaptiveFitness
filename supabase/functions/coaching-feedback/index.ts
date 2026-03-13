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
        system: `You are a concise, encouraging personal trainer giving
real-time feedback after a logged gym set. Keep responses under 20 words.
Be specific to the performance data. Do not use markdown.`,
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
    const text = data.content?.[0]?.text ?? 'Good work — keep it up.';

    return new Response(JSON.stringify({ feedback: text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(
      JSON.stringify({ feedback: 'Good work — keep it up.' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // always return 200 — coaching feedback is non-critical
      },
    );
  }
});

// DEPLOY:
// supabase functions deploy coaching-feedback

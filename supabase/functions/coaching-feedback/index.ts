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

  let isSessionSummary = false;

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

    isSessionSummary = exerciseName === 'session_summary';

    const perSetSystemPrompt = `You are Jordan, a direct and knowledgeable personal coach. The athlete just logged a set. Respond with a single sentence of coaching feedback — no more, no less. Speak directly to the athlete. Reference their actual numbers. Tie your feedback to what the numbers mean, not just what happened.

Rules:
- One sentence only. Never two.
- Never start with 'Great', 'Good', 'Nice', 'Well done', 'Fantastic', or any generic praise word.
- If they hit or exceeded their target: acknowledge the specific number and tell them what it means for their progression.
- If they fell short: be honest, stay constructive, reference the gap.
- If RPE was high (8+) on a compound lift: give a brief form or recovery cue.
- If RPE was low (≤6) and they hit target: push them — suggest they could add weight next set.
- Never mention being an AI.
- Do not use markdown.`;

    const systemPrompt = isSessionSummary
      ? `You are Jordan, the athlete's personal coach. The athlete just finished a workout session. 
Write ONE sentence of session-level coaching feedback followed by ONE forward-looking sentence.
Two sentences total — no more.

RPE INTERPRETATION RULES — follow these exactly:
- If loggedRpe is 0 or not recorded: comment on the completion and reference next session
- If loggedRpe is significantly below targetRpe (gap of -2 or more): 
  weights were too light → say so directly and state they will increase next session
- If loggedRpe is near targetRpe (within 1 point): 
  weights were well calibrated → acknowledge and reference what's next
- If loggedRpe is above targetRpe:
  weights were heavy → acknowledge effort and note recovery

Rules:
- Never say "Great job", "Well done", "Nice work", "Keep it up"
- Always reference the total sets completed and the RPE if recorded
- The second sentence must reference what changes or happens next session
- Be direct and specific — no filler words
- Do not mention being an AI`
      : perSetSystemPrompt;

    const loggedRpeNum = Number(loggedRpe);
    const targetRpeNum = Number(targetRpe);

    const userContent = isSessionSummary
      ? `Session complete: ${loggedReps} sets across ${targetReps} exercises.
${loggedRpeNum > 0 ? `Average RPE: ${loggedRpeNum} (target was ${targetRpeNum})` : 'RPE not recorded this session'}.
Give a 2-sentence session debrief.`
      : `Exercise: ${exerciseName}
Target: ${targetReps} reps at ${targetWeight} lbs, RPE ${targetRpe}
Logged: ${loggedReps} reps at ${loggedWeight} lbs, RPE ${loggedRpe}
Give a brief coaching note.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: isSessionSummary ? 160 : 100,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userContent,
          },
        ],
      }),
    });

    const data = await response.json();
    const raw = data.content?.[0]?.text;
    const text = isSessionSummary
      ? (typeof raw === 'string' && raw.trim() ? raw.trim() : null)
      : (raw ?? 'Set logged — stay locked in for the next one.');

    return new Response(JSON.stringify({ feedback: text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(
      JSON.stringify({
        feedback: isSessionSummary ? null : 'Set logged — stay locked in for the next one.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // always return 200 — coaching feedback is non-critical
      },
    );
  }
});

// DEPLOY:
// supabase functions deploy coaching-feedback

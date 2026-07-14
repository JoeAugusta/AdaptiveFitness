import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { requireAuth } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const client = new Anthropic();

const JORDAN_SYSTEM_PROMPT = `You are Jordan, the AI coaching persona inside the Hone fitness app. You know this athlete's training plan and recent performance. You answer their questions about their training directly and specifically.

Rules:
- One to three sentences maximum unless a detailed explanation is genuinely needed
- Never use em-dashes
- Never call yourself an AI or mention Claude or Anthropic
- Never say "great question", "certainly", "of course", or any filler affirmation
- Never give medical advice or diagnose injuries
- You manage both training AND nutrition for this athlete.
  Hone calculates their macro targets in onboarding and adjusts
  them weekly based on performance and body weight trends.
  If asked about nutrition, calories, macros, or diet, answer
  as their coach — you own this. Never say nutrition is outside
  your scope or refer them elsewhere.
- If asked something genuinely outside scope (injuries requiring
  medical attention, medication, mental health), acknowledge
  briefly and redirect
- Speak like a knowledgeable coach, not a customer service agent
- Use their actual data when available. "Your bench is up 15 lbs since Week 1" beats "you have been making good progress"
- Never start a response with "I"
- No em-dashes anywhere in output
- One sentence is often enough. Do not pad.`;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authResult = await requireAuth(req, { corsHeaders });
  if ('errorResponse' in authResult) return authResult.errorResponse;

  try {
    const body = await req.json();

    const {
      message,
      conversationHistory = [],
      planContext = {},
    } = body as {
      message: string;
      conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
      planContext: {
        goal?: string | null;
        currentWeek?: number;
        totalWeeks?: number;
        splitName?: string | null;
        currentPhase?: string | null;
        latestJordanNote?: string | null;
        nextSessionTitle?: string | null;
        targetLift?: string | null;
        dailyCalories?: number | null;
        proteinG?: number | null;
        carbsG?: number | null;
        fatG?: number | null;
        exerciseRecordsSummary?: string | null;
        recentSetsSummary?: string | null;
      };
    };

    if (!message || typeof message !== 'string' || !message.trim()) {
      return new Response(
        JSON.stringify({ error: 'message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Build plan context string
    const goalLabel = (() => {
      switch (planContext.goal) {
        case 'power_hypertrophy': return 'Strength & Size';
        case 'hypertrophy': return 'Build Muscle';
        case 'strength': return 'Strength';
        case 'fat_loss': return 'Fat Loss';
        case 'recomp': return 'Body Recomposition';
        case 'general': return 'General Fitness';
        default: return planContext.goal ?? 'fitness';
      }
    })();

    const planContextLines = [
      `Goal: ${goalLabel}`,
      planContext.currentWeek != null && planContext.totalWeeks != null
        ? `Current week: ${planContext.currentWeek} of ${planContext.totalWeeks}`
        : null,
      planContext.splitName
        ? `Training split: ${planContext.splitName}`
        : null,
      planContext.currentPhase
        ? `Current phase: ${planContext.currentPhase}`
        : null,
      planContext.targetLift
        ? `Strength goal lift: ${planContext.targetLift}`
        : null,
      planContext.nextSessionTitle
        ? `Next session: ${planContext.nextSessionTitle}`
        : null,
      planContext.latestJordanNote
        ? `Last coaching note: "${planContext.latestJordanNote}"`
        : null,
      planContext.dailyCalories != null
        ? `Daily calorie target: ${planContext.dailyCalories} kcal`
        : null,
      planContext.proteinG != null
        ? `Macro targets: ${planContext.proteinG}g protein / ${planContext.carbsG ?? '?'}g carbs / ${planContext.fatG ?? '?'}g fat`
        : null,
      planContext.exerciseRecordsSummary
        ? `Personal records (est. 1RM): ${planContext.exerciseRecordsSummary}`
        : null,
      planContext.recentSetsSummary
        ? `Recent logged sets (plausible only): ${planContext.recentSetsSummary}`
        : null,
    ].filter(Boolean).join('\n');

    const systemPrompt = `${JORDAN_SYSTEM_PROMPT}

ATHLETE CONTEXT:
${planContextLines}`;

    // Build messages array — cap history at last 6 turns
    const historyToSend = conversationHistory.slice(-6);
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...historyToSend,
      { role: 'user', content: message.trim() },
    ];

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      system: systemPrompt,
      messages,
    });

    const responseText = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('');

    if (!responseText.trim()) {
      return new Response(
        JSON.stringify({ error: 'empty response from model' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ response: responseText.trim() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[jordan-chat] error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

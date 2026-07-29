import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Current API rates per token (verified July 2026). Update if Anthropic changes them.
const RATES: Record<string, { in: number; out: number }> = {
  'claude-sonnet-4-6': { in: 3.0 / 1e6, out: 15.0 / 1e6 },
  'claude-haiku-4-5': { in: 1.0 / 1e6, out: 5.0 / 1e6 },
  'claude-haiku-4-5-20251001': { in: 1.0 / 1e6, out: 5.0 / 1e6 },
};
const DEFAULT_RATE = { in: 3.0 / 1e6, out: 15.0 / 1e6 }; // fall back to Sonnet

export function computeCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const r = RATES[model] ?? DEFAULT_RATE;
  return inputTokens * r.in + outputTokens * r.out;
}

type AnthropicUsageBody = {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };
};

export async function logAiUsage(
  supabase: ReturnType<typeof createClient>,
  params: {
    userId: string | null;
    functionName: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
  },
): Promise<void> {
  try {
    const cost = computeCostUsd(params.model, params.inputTokens, params.outputTokens);
    await supabase.from('ai_usage_events').insert({
      user_id: params.userId,
      function_name: params.functionName,
      model: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      cache_read_tokens: params.cacheReadTokens ?? 0,
      cost_usd: Number(cost.toFixed(6)),
    });
  } catch (e) {
    // Never let logging failure break a real request.
    console.error('[aiUsage] log failed:', e);
  }
}

export async function logAiUsageFromAnthropicBody(
  supabase: ReturnType<typeof createClient>,
  params: {
    userId: string | null;
    functionName: string;
    model: string;
    body: unknown;
  },
): Promise<void> {
  const usage = (params.body as AnthropicUsageBody).usage;
  await logAiUsage(supabase, {
    userId: params.userId,
    functionName: params.functionName,
    model: params.model,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
  });
}

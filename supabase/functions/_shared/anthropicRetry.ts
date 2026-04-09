/** Anthropic Messages API: retry on 529 / overloaded, then return 503 JSON body. */

const OVERLOADED_JSON = JSON.stringify({
  error: 'overloaded',
  message: 'Our coaching engine is busy — please try again in a moment.',
});

export function isAnthropicOverloaded(status: number, body: unknown): boolean {
  if (status === 529) return true;
  if (typeof body !== 'object' || body === null) return false;
  const o = body as Record<string, unknown>;
  const inner = o.error;
  if (typeof inner === 'object' && inner !== null) {
    if ((inner as Record<string, unknown>).type === 'overloaded_error') return true;
  }
  const msg =
    (typeof o.message === 'string' ? o.message : '') +
    (typeof inner === 'object' &&
    inner !== null &&
    typeof (inner as Record<string, unknown>).message === 'string'
      ? String((inner as Record<string, unknown>).message)
      : '');
  if (msg.toLowerCase().includes('overloaded')) return true;
  return false;
}

/**
 * Calls fn() up to `retries` times. On overloaded responses, backs off and retries.
 * After final overloaded failure, returns 503 + { error: 'overloaded', message }.
 * On other !ok responses, returns the response as-is (caller handles).
 */
export async function fetchAnthropicMessagesWithRetry(
  fn: () => Promise<Response>,
  retries = 3,
  delayMs = 1000,
): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fn();
    if (response.ok) return response;

    let body: unknown = {};
    try {
      body = await response.json();
    } catch {
      /* non-JSON error body */
    }

    const overloaded = isAnthropicOverloaded(response.status, body);

    if (overloaded && attempt < retries - 1) {
      const wait = delayMs * Math.pow(2, attempt);
      console.log(
        `Anthropic overloaded — retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`,
      );
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    if (overloaded) {
      return new Response(OVERLOADED_JSON, {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Body consumed by json() — return a fresh Response for the caller
    return new Response(JSON.stringify(body), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(OVERLOADED_JSON, {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// RevenueCat webhook -> sync user_profiles.subscription_status.
// This is the ONLY path that can DOWNGRADE a user (expiration, billing failure),
// which clients can't do because the app isn't open when a sub lapses.

const PRO_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE', // promotional grants (beta testers, demo account)
]);

// EXPIRATION = access actually ends now -> downgrade.
// CANCELLATION is deliberately NOT here: user keeps access until EXPIRATION.
const FREE_EVENTS = new Set([
  'EXPIRATION',
  'SUBSCRIPTION_PAUSED',
]);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // 1) Verify the shared auth header RevenueCat sends. Reject forgeries.
  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';
  const got = req.headers.get('Authorization') ?? '';
  if (!expected || got !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: { event?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const event = payload.event ?? {};
  const type = String(event.type ?? '');
  const appUserId = String(event.app_user_id ?? ''); // = Supabase user_id (logIn fix)

  if (!appUserId) {
    // Nothing to map (e.g. anonymous). Ack so RC doesn't retry forever.
    return new Response(JSON.stringify({ ok: true, skipped: 'no app_user_id' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Ignore RC's anonymous IDs defensively — we only sync real Supabase UUIDs.
  if (appUserId.startsWith('$RCAnonymousID')) {
    return new Response(JSON.stringify({ ok: true, skipped: 'anonymous' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let nextStatus: 'pro' | 'free' | null = null;
  if (PRO_EVENTS.has(type)) nextStatus = 'pro';
  else if (FREE_EVENTS.has(type)) nextStatus = 'free';
  // CANCELLATION, BILLING_ISSUE (warning), TEST, TRANSFER, etc. -> no change.
  // (BILLING_ISSUE is a warning; the eventual EXPIRATION downgrades if unresolved.)

  if (nextStatus === null) {
    return new Response(JSON.stringify({ ok: true, noop: type }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const tier =
    nextStatus === 'pro'
      ? String(
          (event.entitlement_ids as string[] | undefined)?.[0] ??
            event.product_id ??
            'pro',
        )
      : null;

  const { error } = await supabaseAdmin
    .from('user_profiles')
    .update({ subscription_status: nextStatus, subscription_tier: tier })
    .eq('user_id', appUserId);

  if (error) {
    console.error('[revenuecat-webhook] update failed', type, appUserId, error.message);
    // 500 -> RevenueCat retries. Good for transient DB errors.
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, type, appUserId, status: nextStatus }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
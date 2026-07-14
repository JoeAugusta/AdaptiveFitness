/**
 * IDOR verification probes for edge functions.
 * Usage: node scripts/verify-idor.mjs
 */
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const BASE = `${env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const FAKE_USER_A = '00000000-0000-4000-8000-000000000001';
const FAKE_USER_B = '00000000-0000-4000-8000-000000000002';
const FAKE_PLAN = '00000000-0000-4000-8000-000000000099';

async function probe(name, path, body, headers = {}) {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { name, status: res.status, json };
}

const results = [];

results.push(
  await probe('adjust-macros no auth', 'adjust-macros', {
    userId: FAKE_USER_B,
    planId: FAKE_PLAN,
    weekNumber: 1,
  }),
);

results.push(
  await probe('delete-account no auth', 'delete-account', {
    userId: FAKE_USER_B,
  }),
);

results.push(
  await probe('adjust-macros anon only (body user B)', 'adjust-macros', {
    userId: FAKE_USER_B,
    planId: FAKE_PLAN,
    weekNumber: 1,
  }, { Authorization: `Bearer ${ANON}` }),
);

console.log('=== IDOR probe results (deployed API) ===\n');
for (const r of results) {
  console.log(`${r.name}: HTTP ${r.status}`);
  console.log(JSON.stringify(r.json, null, 2));
  console.log('');
}

console.log('Expected after fix deploy:');
console.log('- no auth → 401 Unauthorized');
console.log('- valid JWT as user A + body userId B → acts on A only (never B data)');
console.log('- delete-account with JWT → deletes only authenticated user');

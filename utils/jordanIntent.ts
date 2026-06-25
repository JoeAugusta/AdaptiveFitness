// ── FAQ keyword map ───────────────────────────────────────

const FAQ_KEYWORDS: Record<string, string[]> = {
  rpe: [
    'rpe', 'perceived exertion', 'effort scale',
    'what is rpe', 'how does rpe', '1-10', 'rate of',
  ],
  progression: [
    'progression', 'how does progress', 'weight change',
    'why did my weight', 'went up', 'went down', 'increase',
    'decrease', 'how do you decide', 'how do weights',
    'why did you change', 'weight went',
  ],
  pyramid: [
    'pyramid', 'build sets', 'ramping sets', 'warm up sets',
    'what are pyramid', 'why does weight build',
  ],
  weight_change: [
    'why did my weight change', 'why did weights change',
    'why is my weight different', 'load changed',
  ],
  deload: [
    'deload', 'deload week', 'recovery week',
    'back off week', 'what is a deload', 'why deload',
  ],
  rest: [
    'rest time', 'rest period', 'rest timer', 'rest between',
    'why so long', 'why 4 minutes', 'why are rest',
    'how long to rest', 'rest times',
  ],
  sets: [
    'set structure', 'straight sets', 'how are my sets',
    'how sets work', 'why straight', 'what type of sets',
  ],
  tracking: [
    'what do you track', 'what does jordan track',
    'what are you tracking', 'what data', 'how do you know',
    'what do you use', 'what do you measure',
  ],
};

/**
 * Returns the FAQ key if the input matches a known topic,
 * or null if no match — meaning the live API should fire.
 */
export function matchFAQIntent(input: string): string | null {
  const lower = input.toLowerCase().trim();
  for (const [key, keywords] of Object.entries(FAQ_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return key;
  }
  return null;
}

// ── Rate limiting ─────────────────────────────────────────

const RATE_COUNT_KEY = 'hone_jordan_chat_count';
const RATE_DATE_KEY = 'hone_jordan_chat_date';

export const JORDAN_FREE_LIMIT = 10;
export const JORDAN_PRO_LIMIT = 30;

/**
 * Returns { allowed, used, limit }.
 * Resets count automatically at midnight.
 */
export async function checkJordanRateLimit(
  isPro: boolean,
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const AsyncStorage = (
    await import('@react-native-async-storage/async-storage')
  ).default;

  const limit = isPro ? JORDAN_PRO_LIMIT : JORDAN_FREE_LIMIT;
  const today = new Date().toDateString();

  const [storedDate, storedCount] = await Promise.all([
    AsyncStorage.getItem(RATE_DATE_KEY),
    AsyncStorage.getItem(RATE_COUNT_KEY),
  ]);

  // New day — reset
  if (storedDate !== today) {
    await Promise.all([
      AsyncStorage.setItem(RATE_DATE_KEY, today),
      AsyncStorage.setItem(RATE_COUNT_KEY, '0'),
    ]);
    return { allowed: true, used: 0, limit };
  }

  const used = parseInt(storedCount ?? '0', 10);
  return { allowed: used < limit, used, limit };
}

/**
 * Increments the daily counter after a successful API call.
 */
export async function incrementJordanRateCount(): Promise<void> {
  const AsyncStorage = (
    await import('@react-native-async-storage/async-storage')
  ).default;

  const stored = await AsyncStorage.getItem(RATE_COUNT_KEY);
  const current = parseInt(stored ?? '0', 10);
  await AsyncStorage.setItem(RATE_COUNT_KEY, String(current + 1));
}

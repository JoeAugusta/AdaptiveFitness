export const JORDAN_FALLBACK = 'Set logged. Lock in the next one.';

const META_LEAK_PATTERN =
  /\b(wait|let me|i need to|actually|on second thought|the rule|per the (rules|instructions)|my (instructions|parameters|guidelines)|as an ai)\b/i;

const BANNED_PRAISE_OPENER = /^(great|good|nice|well done)\b/i;

function extractCompleteSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+/g);
  if (!matches) return [];
  return matches.map((s) => s.trim()).filter(Boolean);
}

export function sanitizeJordanOutput(text: string, maxSentences: number): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (META_LEAK_PATTERN.test(trimmed)) return null;
  if (BANNED_PRAISE_OPENER.test(trimmed)) return null;

  const sentences = extractCompleteSentences(trimmed);
  if (sentences.length === 0) return null;

  const limited = sentences.slice(0, maxSentences).join(' ').trim();
  return limited || null;
}

export function appendJordanWeightLine(feedback: string, suggestedWeight: number): string {
  const base = feedback.replace(/\s+$/, '');
  if (/[.!?]$/.test(base)) {
    return `${base} Try ${suggestedWeight} lbs next set.`;
  }
  return `${base}. Try ${suggestedWeight} lbs next set.`;
}

export function sanitizeExerciseName(exerciseName: unknown): string {
  return String(exerciseName ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 80);
}

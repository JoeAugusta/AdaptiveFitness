/**
 * Shared text-cleaning utilities for Jordan coaching copy.
 * Import from here rather than defining locally in each screen.
 */

/**
 * Strips em-dashes and en-dashes from AI-generated coaching copy.
 * Spaced em-dash → period+space. Bare em-dash → period.
 * Spaced en-dash → single space. Bare en-dash → hyphen.
 */
export function stripEmDash(text: string): string {
  return text
    .replace(/ — /g, '. ')
    .replace(/—/g, '.')
    .replace(/ – /g, ' ')
    .replace(/–/g, '-')
    .trim();
}

/**
 * Strips common AI preamble patterns from Jordan welcome messages
 * (e.g. "I'm Jordan, your coach for…" intro that BuildingPlanScreen
 * renders separately).
 */
export function cleanJordanMessage(msg: string | null): string | null {
  if (!msg) return null;
  const cleaned = msg
    .replace(/^I'm Jordan[^.]*\.\s*/i, '')
    .replace(/^[^.]*\bcoach\b[^.]*\.\s*/i, '')
    .trim();
  return cleaned || msg;
}

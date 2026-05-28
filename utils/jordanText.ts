/**
 * Shared text-cleaning utilities for Jordan coaching copy.
 * Import from here rather than defining locally in each screen.
 */

/**
 * Strips em-dashes from AI-generated coaching copy.
 * Replaces spaced em-dashes with a period+space and bare em-dashes with a period.
 */
export function stripEmDash(text: string): string {
  return text
    .replace(/ — /g, '. ')
    .replace(/—/g, '.')
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

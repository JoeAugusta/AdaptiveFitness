/** Positive = logged easier than target (increase). Negative = harder (decrease). */
export function computeRpeGap(avgLoggedRpe: number, targetRpe: number): number {
  return targetRpe - avgLoggedRpe;
}

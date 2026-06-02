/** Monthly progress photo check-in gate (28 days between analyses). */

export const PHOTO_CHECKIN_GATE_DAYS = 28;

export function getNextCheckInDate(
  lastPhotoAnalysisAt: string | null | undefined,
): Date | null {
  if (!lastPhotoAnalysisAt) return null;
  const last = new Date(lastPhotoAnalysisAt);
  if (Number.isNaN(last.getTime())) return null;
  const next = new Date(last.getTime());
  next.setDate(next.getDate() + PHOTO_CHECKIN_GATE_DAYS);
  if (Date.now() >= next.getTime()) return null;
  return next;
}

export function isPhotoCheckInAvailable(
  lastPhotoAnalysisAt: string | null | undefined,
): boolean {
  return getNextCheckInDate(lastPhotoAnalysisAt) === null;
}

export function daysUntilCheckIn(
  lastPhotoAnalysisAt: string | null | undefined,
): number {
  const next = getNextCheckInDate(lastPhotoAnalysisAt);
  if (!next) return 0;
  return Math.max(0, Math.ceil((next.getTime() - Date.now()) / 86400000));
}

export function formatCheckInDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export const PHOTO_ANALYSIS_TIPS = [
  'Consistent lighting helps Jordan read composition changes more accurately.',
  'Front and side angles together improve lean mass estimates.',
  'Your photos are private and only used for your coaching analysis.',
  'Monthly check-ins calibrate nutrition to your actual body composition.',
  'Progress is measured against your starting point, not an ideal standard.',
];

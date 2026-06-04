export type ActivityIntensity = 'low' | 'moderate' | 'high';

export const ACTIVITY_OPTIONS = [
  'Muay Thai / Kickboxing',
  'Running',
  'Cycling',
  'Hiking',
  'Swimming',
  'Basketball / Sports',
  'Yoga / Stretching',
  'General Cardio',
  'Other',
] as const;

export type ActivityOption = (typeof ACTIVITY_OPTIONS)[number];

export const MET_VALUES: Record<string, Record<ActivityIntensity, number>> = {
  'Muay Thai / Kickboxing': { low: 5, moderate: 6, high: 8 },
  Running: { low: 6, moderate: 8, high: 10 },
  Cycling: { low: 4, moderate: 6, high: 9 },
  Hiking: { low: 4, moderate: 5, high: 7 },
  Swimming: { low: 4, moderate: 6, high: 8 },
  'Basketball / Sports': { low: 4, moderate: 6, high: 8 },
  'Yoga / Stretching': { low: 2, moderate: 3, high: 4 },
  'General Cardio': { low: 4, moderate: 5, high: 7 },
  Other: { low: 3, moderate: 5, high: 7 },
};

export function estimateCaloriesBurned(
  activity: string,
  intensity: ActivityIntensity,
  durationMinutes: number,
  weightKg: number,
): number {
  const met = MET_VALUES[activity]?.[intensity] ?? 6;
  return Math.round(met * weightKg * (durationMinutes / 60));
}

export function formatIntensityLabel(intensity: string): string {
  const base =
    intensity === 'low' || intensity === 'moderate' || intensity === 'high'
      ? intensity.charAt(0).toUpperCase() + intensity.slice(1)
      : intensity;
  return `${base} intensity`;
}

export function resolveActivityCaloriesBurned(
  log: {
    sport_type: string;
    intensity: string;
    duration_min: number;
    calories_burned?: number | null;
  },
  weightLbs: number,
): number {
  if (
    log.calories_burned != null &&
    Number.isFinite(log.calories_burned) &&
    log.calories_burned > 0
  ) {
    return log.calories_burned;
  }
  const weightKg = weightLbs * 0.453592;
  const intensity =
    log.intensity === 'low' ||
    log.intensity === 'moderate' ||
    log.intensity === 'high'
      ? log.intensity
      : 'moderate';
  return estimateCaloriesBurned(
    log.sport_type,
    intensity,
    log.duration_min,
    weightKg > 0 ? weightKg : 77,
  );
}

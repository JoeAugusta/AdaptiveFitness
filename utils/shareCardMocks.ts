import type { ShareCardProps } from '../components/ShareCard';

/** Mock session from sharecard_workout_mock.png */
export const MOCK_WORKOUT_SHARE_CARD: ShareCardProps = {
  sessionTitle: 'Shoulders & Arms',
  weekNumber: 4,
  dayNumber: 2,
  totalSets: 26,
  totalWeeks: 8,
  avgRpe: 6.9,
  durationMinutes: 69,
  prsHit: 1,
  jordanNote: '',
  topLifts: [
    { exerciseName: 'Machine Shoulder Press', weightLbs: 305, reps: 3 },
    { exerciseName: 'Face Pull', weightLbs: 140, reps: 15, isPr: true },
    { exerciseName: 'Tricep Pushdown (Rope)', weightLbs: 130, reps: 10 },
  ],
};

/** Stress case: 4-digit weight + long exercise name + 2-digit reps */
export const MOCK_PR_STRESS = {
  exerciseName: 'Incline Dumbbell Press (Pronated Grip)',
  bestWeightLbs: 1000,
  bestReps: 12,
  isMetric: false,
  rank: 1,
};

export const MOCK_PR_FACE_PULL = {
  exerciseName: 'Face Pull',
  bestWeightLbs: 140,
  bestReps: 15,
  isMetric: false,
  rank: 1,
};

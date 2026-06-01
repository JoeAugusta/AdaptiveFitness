// Hone — Plan Generation Audit Script
// Usage: node audit-plans.mjs
// Output: audit-results.json (paste back into Claude for review)

import { writeFileSync } from 'fs';

const BASE_URL = 'https://vpjbsovstlctgkvpqqal.supabase.co/functions/v1/generate-plan';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwamJzb3ZzdGxjdGdrdnBxcWFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzY0MjcsImV4cCI6MjA4ODIxMjQyN30.kckEPkdsxXG-5np5gQkHawDMzCfoGgt3ysST3jH0TNk';

const PROFILES = [
  {
    id: 1, label: 'Strength — Bench (Intermediate M, 4d Upper/Lower)',
    payload: {
      goal: 'strength', experience: 'intermediate', daysPerWeek: 4,
      biologicalSex: 'male', split: 'upper_lower',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      targetLift: 'bench_press', goalLift: 'bench_press',
      current1RM: 225, target1RM: 275,
      injuries: [], excludedExercises: [],
    },
  },
  {
   id: 2, label: 'Strength — Squat (Advanced M, 5d Strength Focused)',
    payload: {
      goal: 'strength', experience: 'advanced', daysPerWeek: 5,
      biologicalSex: 'male', split: 'strength_focused',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      targetLift: 'back_squat', goalLift: 'back_squat',
      current1RM: 315, target1RM: 365,
      injuries: [], excludedExercises: [],
    },
  },
  {
    id: 3, label: 'Hypertrophy — Beginner F, 3d Full Body',
    payload: {
      goal: 'hypertrophy', experience: 'beginner', daysPerWeek: 3,
      biologicalSex: 'female', split: 'full_body',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 8, recommendedWeeks: 8,
      injuries: [], excludedExercises: [],
    },
  },
  {
    id: 4, label: 'Hypertrophy — Intermediate M, 5d PPL',
    payload: {
      goal: 'hypertrophy', experience: 'intermediate', daysPerWeek: 5,
      biologicalSex: 'male', split: 'ppl',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      injuries: [], excludedExercises: [],
    },
  },
  {
    id: 5, label: 'Strength & Size — Advanced M, 6d Arnold Split',
    payload: {
      goal: 'power_hypertrophy', experience: 'advanced', daysPerWeek: 6,
      biologicalSex: 'male', split: 'arnold',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 8, recommendedWeeks: 8,
      currentLifts: { benchPress: 275, backSquat: 315, deadlift: 365, overheadPress: 155 },
      injuries: [], excludedExercises: [],
    },
  },
  {
    id: 6, label: 'Fat Loss — Beginner F, 3d Full Body',
    payload: {
      goal: 'fat_loss', experience: 'beginner', daysPerWeek: 3,
      biologicalSex: 'female', split: 'full_body',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      targetWeightLbs: 140,
      injuries: [], excludedExercises: [],
    },
  },
  {
    id: 7, label: 'Fat Loss — Intermediate M, 4d Upper/Lower',
    payload: {
      goal: 'fat_loss', experience: 'intermediate', daysPerWeek: 4,
      biologicalSex: 'male', split: 'upper_lower',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      targetWeightLbs: 185,
      injuries: [], excludedExercises: [],
    },
  },
  {
    id: 8, label: 'Body Recomp — Intermediate F, 4d PPL',
    payload: {
      goal: 'recomp', experience: 'intermediate', daysPerWeek: 4,
      biologicalSex: 'female', split: 'ppl',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      injuries: [], excludedExercises: [],
    },
  },
  {
    id: 9, label: 'General Fitness — Beginner M, 2d Full Body',
    payload: {
      goal: 'general', experience: 'beginner', daysPerWeek: 2,
      biologicalSex: 'male', split: 'full_body',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 8, recommendedWeeks: 8,
      injuries: [], excludedExercises: [],
    },
  },
  {
    id: 10, label: 'General Fitness — Intermediate F, 5d Athletic',
    payload: {
      goal: 'general', experience: 'intermediate', daysPerWeek: 5,
      biologicalSex: 'female', split: 'athletic',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      injuries: [], excludedExercises: [],
    },
  },
  {
    id: 11, label: 'Hypertrophy — No Barbell (Home Gym, Intermediate M)',
    payload: {
      goal: 'hypertrophy', experience: 'intermediate', daysPerWeek: 4,
      biologicalSex: 'male', split: 'ppl',
      equipment: 'Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      excludedExercises: [
        'barbell bench press', 'barbell row', 'back squat',
        'deadlift', 'overhead press', 'barbell curl',
      ],
      injuries: [],
    },
  },
  {
    id: 12, label: 'Strength — Deadlift + Lower Back Injury (Advanced M)',
    payload: {
      goal: 'strength', experience: 'advanced', daysPerWeek: 5,
      biologicalSex: 'male', split: 'strength_focused',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      targetLift: 'deadlift', goalLift: 'deadlift',
      current1RM: 405, target1RM: 455,
      injuries: ['lower back injury — avoid Romanian deadlift, stiff-leg deadlift, good morning, any hyperextension movement'],
      excludedExercises: [],
    },
  },
  {
    id: 13, label: 'Fat Loss — Knee Injury, No Impact (Beginner F)',
    payload: {
      goal: 'fat_loss', experience: 'beginner', daysPerWeek: 3,
      biologicalSex: 'female', split: 'full_body',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      targetWeightLbs: 150,
      injuries: ['knee injury — no jumping, no running, no box jumps, no lunges, no high-impact cardio'],
      excludedExercises: [],
    },
  },
  {
    id: 14, label: 'Strength & Size — No OHP, Shoulder Impingement (Intermediate M)',
    payload: {
      goal: 'power_hypertrophy', experience: 'intermediate', daysPerWeek: 4,
      biologicalSex: 'male', split: 'upper_lower',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 8, recommendedWeeks: 8,
      currentLifts: { benchPress: 185, backSquat: 225, deadlift: 275, overheadPress: null },
      injuries: ['shoulder impingement — no overhead pressing of any kind, no military press, no Arnold press, no push press'],
      excludedExercises: ['overhead press', 'military press', 'arnold press', 'push press', 'seated dumbbell press'],
    },
  },
];

async function generatePlan(profile) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
    },
    body: JSON.stringify(profile.payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function run() {
  console.log(`\nHone Plan Audit — generating ${PROFILES.length} plans\n${'─'.repeat(50)}`);

  const results = [];

  for (const profile of PROFILES) {
    process.stdout.write(`[${profile.id.toString().padStart(2, '0')}/${PROFILES.length}] ${profile.label}... `);
    const start = Date.now();

    try {
      const data = await generatePlan(profile);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`✓ ${elapsed}s`);
      results.push({ id: profile.id, label: profile.label, status: 'ok', plan: data.plan, elapsed });
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`✗ ${err.message}`);
      results.push({ id: profile.id, label: profile.label, status: 'error', error: err.message, elapsed });
    }

    // Small delay between calls to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'error').length;

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Done: ${ok} succeeded, ${failed} failed`);

  writeFileSync('audit-results.json', JSON.stringify(results, null, 2));
  console.log(`Results saved to audit-results.json\n`);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

// Hone — Fresh 5-Profile Audit Script (Post Coaching Note Fix)
// Usage: node audit-plans-fresh.mjs
// Output: audit-results-fresh.json

import { writeFileSync } from 'fs';

const BASE_URL = 'https://vpjbsovstlctgkvpqqal.supabase.co/functions/v1/generate-plan';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwamJzb3ZzdGxjdGdrdnBxcWFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzY0MjcsImV4cCI6MjA4ODIxMjQyN30.kckEPkdsxXG-5np5gQkHawDMzCfoGgt3ysST3jH0TNk';

const PROFILES = [
  {
    id: 1,
    label: 'Strength — Overhead Press, Intermediate M, 4d Upper/Lower',
    payload: {
      goal: 'strength', experience: 'intermediate', daysPerWeek: 4,
      biologicalSex: 'male', split: 'upper_lower',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      targetLift: 'overhead_press', goalLift: 'overhead_press',
      current1RM: 135, target1RM: 175,
      injuries: [], excludedExercises: [],
    },
  },
  {
    id: 2,
    label: 'Hypertrophy — Advanced F, 5d PPL',
    payload: {
      goal: 'hypertrophy', experience: 'advanced', daysPerWeek: 5,
      biologicalSex: 'female', split: 'ppl',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      injuries: [], excludedExercises: [],
    },
  },
  {
    id: 3,
    label: 'Fat Loss — No Barbell, Beginner M, 3d Full Body',
    payload: {
      goal: 'fat_loss', experience: 'beginner', daysPerWeek: 3,
      biologicalSex: 'male', split: 'full_body',
      equipment: 'Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      targetWeightLbs: 185,
      injuries: [], excludedExercises: [],
    },
  },
  {
    id: 4,
    label: 'Body Recomp — Knee Injury, Intermediate F, 4d Upper/Lower',
    payload: {
      goal: 'recomp', experience: 'intermediate', daysPerWeek: 4,
      biologicalSex: 'female', split: 'upper_lower',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      injuries: ['knee'],
      excludedExercises: [],
    },
  },
  {
    id: 5,
    label: 'Strength & Size — Deadlift, Advanced M, 6d Arnold Split',
    payload: {
      goal: 'power_hypertrophy', experience: 'advanced', daysPerWeek: 6,
      biologicalSex: 'male', split: 'arnold',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 8, recommendedWeeks: 8,
      targetLift: 'deadlift', goalLift: 'deadlift',
      current1RM: 405, target1RM: 455,
      currentLifts: { benchPress: 275, backSquat: 315, deadlift: 405, overheadPress: 155 },
      injuries: [], excludedExercises: [],
    },
  },
];

async function generatePlan(profile) {
  const start = Date.now();
  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify(profile.payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return { id: profile.id, label: profile.label, status: 'error', error: text, elapsed: ((Date.now() - start) / 1000).toFixed(1) };
    }

    const plan = await res.json();
    return { id: profile.id, label: profile.label, status: 'ok', plan, elapsed: ((Date.now() - start) / 1000).toFixed(1) };
  } catch (err) {
    return { id: profile.id, label: profile.label, status: 'error', error: err.message, elapsed: ((Date.now() - start) / 1000).toFixed(1) };
  }
}

async function run() {
  console.log(`Running ${PROFILES.length} fresh profiles sequentially...\n`);
  const results = [];

  for (const profile of PROFILES) {
    console.log(`[${profile.id}/${PROFILES.length}] ${profile.label}...`);
    const result = await generatePlan(profile);
    results.push(result);

    if (result.status === 'ok') {
      const days = result.plan.weeks?.[0]?.days ?? [];
      const workoutDays = days.filter(d => d.type === 'workout');
      console.log(`  ✓ ${result.elapsed}s — ${workoutDays.length} workout days generated`);

      // Quick checks
      for (const day of workoutDays) {
        const exercises = day.exercises ?? [];
        const primaryLower = exercises.filter(e =>
          ['back_squat', 'back squat', 'front squat', 'conventional deadlift',
           'sumo deadlift', 'trap bar deadlift', 'deadlift'].some(name =>
            e.name?.toLowerCase().includes(name.toLowerCase()) ||
            ['back squat', 'front squat', 'conventional deadlift', 'deadlift'].some(n =>
              e.name?.toLowerCase() === n.toLowerCase()
            )
          ) && ['primary_compound'].includes(e.compoundTier)
        );
        if (primaryLower.length > 1) {
          console.log(`  ⚠️  DUAL PRIMARY LOWER on "${day.title}": ${primaryLower.map(e => e.name).join(' + ')}`);
        }

        // Check isolation rep ranges
        const badReps = exercises.filter(e => {
          if (e.compoundTier !== 'isolation') return false;
          const repsStr = String(e.reps ?? '');
          const match = repsStr.match(/^(\d+)/);
          if (!match) return false;
          return parseInt(match[1]) < 8;
        });
        if (badReps.length > 0) {
          console.log(`  ⚠️  LOW REPS on isolation in "${day.title}": ${badReps.map(e => `${e.name} (${e.reps})`).join(', ')}`);
        }
      }
    } else {
      console.log(`  ✗ ERROR: ${result.error}`);
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 1000));
  }

  writeFileSync('audit-results-fresh.json', JSON.stringify(results, null, 2));
  console.log('\nDone. Results saved to audit-results-fresh.json');

  // Summary
  const ok = results.filter(r => r.status === 'ok').length;
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`\nSummary: ${ok} ok, ${errors} errors`);
}

run().catch(console.error);

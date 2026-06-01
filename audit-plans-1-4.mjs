// Hone — Targeted Audit: Profiles 1 and 4 only
// Usage: node audit-plans-1-4.mjs
// Output: audit-results-1-4.json

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
  console.log(`Running ${PROFILES.length} profiles...\n`);
  const results = [];

  for (const profile of PROFILES) {
    console.log(`[${profile.id}] ${profile.label}...`);
    const result = await generatePlan(profile);
    results.push(result);

    if (result.status === 'ok') {
      // Handle nested plan structure
      const planData = result.plan.plan ?? result.plan;
      const days = planData.weeks?.[0]?.days ?? [];
      const workoutDays = days.filter(d => d.type === 'workout');
      console.log(`  ✓ ${result.elapsed}s — ${workoutDays.length} workout days`);

      const tier1Lower = ['back squat','front squat','safety bar squat','conventional deadlift','sumo deadlift','trap bar deadlift'];

      for (const day of workoutDays) {
        const exercises = day.exercises ?? [];

        // Check Tier-1 lower stacking
        const t1 = exercises.filter(e => tier1Lower.some(n => e.name?.toLowerCase().includes(n)));
        if (t1.length > 1) {
          console.log(`  ⚠️  TIER-1 LOWER STACK in "${day.title}": ${t1.map(e => e.name).join(' + ')}`);
        } else {
          const t1Names = t1.map(e => e.name).join(', ');
          if (t1.length > 0) console.log(`  ✓ Single Tier-1 in "${day.title}": ${t1Names}`);
        }

        // Check knee safety for profile 4
        if (profile.id === 4) {
          const kneeUnsafe = ['squat','lunge','split squat','step-up','box jump'];
          const unsafe = exercises.filter(e => kneeUnsafe.some(u => e.name?.toLowerCase().includes(u)));
          if (unsafe.length > 0) {
            console.log(`  ⚠️  KNEE UNSAFE in "${day.title}": ${unsafe.map(e => e.name).join(', ')}`);
          } else {
            console.log(`  ✓ Knee-safe "${day.title}": ${exercises.map(e => e.name).join(', ')}`);
          }

          // Check for duplicate exercise names
          const names = exercises.map(e => e.name);
          const dupes = names.filter((n, i) => names.indexOf(n) !== i);
          if (dupes.length > 0) {
            console.log(`  ⚠️  DUPLICATE EXERCISES in "${day.title}": ${dupes.join(', ')}`);
          }
        }
      }
    } else {
      console.log(`  ✗ ERROR: ${result.error}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  writeFileSync('audit-results-1-4.json', JSON.stringify(results, null, 2));
  console.log('\nDone. Results saved to audit-results-1-4.json');
}

run().catch(console.error);

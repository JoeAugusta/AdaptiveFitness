// Hone — Targeted Plan Audit (Plans #1, #4, #5, #14)
// Usage: node audit-plans-targeted.mjs
// Output: audit-results-targeted.json

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

function isPowerHypertrophy(goal) {
  return goal === 'power_hypertrophy';
}

function isStrengthPhaseExercise(ex) {
  // power_hypertrophy plans tag each exercise with phase: 'strength' | 'hypertrophy'
  // strength-phase exercises are primary compounds — exempt from accessory rep check
  return ex.phase === 'strength';
}

function checkRepRanges(plan, goal) {
  const warnings = [];
  const week1 = plan?.weeks?.[0];
  const workoutDays = (week1?.days || []).filter(d => d.type === 'workout');

  for (const day of workoutDays) {
    const exs = day.exercises || [];

    for (let i = 0; i < exs.length; i++) {
      const e = exs[i];

      // Determine if this exercise is a primary/strength compound
      // For power_hypertrophy: use the phase tag (strength = exempt)
      // For strength goal: only index 0 per day is the primary lift
      // For all other goals: no strength-range exceptions
      const isPrimary = isPowerHypertrophy(goal)
        ? isStrengthPhaseExercise(e)
        : (goal === 'strength' && i === 0);

      if (isPrimary) continue; // primary compounds are exempt

      const repsStr = String(e.reps || '');
      const low = parseInt(repsStr.split('-')[0], 10);

      if (!isNaN(low) && low < 6) {
        warnings.push(`  Day ${day.dayNumber} ex#${i + 1} "${e.name}": ${e.reps} reps — accessory should be 6+ reps`);
      }

      if (e.restSeconds > 180) {
        warnings.push(`  Day ${day.dayNumber} ex#${i + 1} "${e.name}": ${e.restSeconds}s rest — accessory should be ≤180s`);
      }
    }
  }

  return warnings;
}

function checkDeadliftOnPullDay(plan, goal) {
  const warnings = [];
  if (goal !== 'hypertrophy' && goal !== 'recomp' && goal !== 'general') return warnings;

  const week1 = plan?.weeks?.[0];
  const workoutDays = (week1?.days || []).filter(d => d.type === 'workout');

  for (const day of workoutDays) {
    const title = (day.title || '').toLowerCase();
    const isPullDay = title.includes('pull') || title.includes('back');
    if (!isPullDay) continue;

    for (const e of (day.exercises || [])) {
      const name = (e.name || '').toLowerCase();
      if (name.includes('conventional deadlift') || name === 'deadlift' || name.includes('sumo deadlift')) {
        warnings.push(`  Day ${day.dayNumber} "${day.title}": "${e.name}" — conventional deadlift should not appear on a hypertrophy pull day`);
      }
    }
  }

  return warnings;
}

function checkDoubleDeadlift(plan, goal) {
  const warnings = [];
  const week1 = plan?.weeks?.[0];
  const workoutDays = (week1?.days || []).filter(d => d.type === 'workout');

  let heavyDeadliftCount = 0;
  const deadliftDays = [];

  for (const day of workoutDays) {
    for (const e of (day.exercises || [])) {
      const name = (e.name || '').toLowerCase();
      if ((name === 'deadlift' || name.includes('conventional deadlift') || name.includes('sumo deadlift')) && e.sets >= 4) {
        heavyDeadliftCount++;
        deadliftDays.push(`Day ${day.dayNumber} "${day.title}"`);
      }
    }
  }

  if (heavyDeadliftCount > 1) {
    warnings.push(`  Heavy deadlift appears ${heavyDeadliftCount}x this week: ${deadliftDays.join(', ')} — max 1x per week on 6-day splits`);
  }

  return warnings;
}

function checkOHPInjury(plan, injuries) {
  const warnings = [];
  const hasOHPRestriction = injuries.some(inj =>
    inj.toLowerCase().includes('overhead') || inj.toLowerCase().includes('impingement')
  );
  if (!hasOHPRestriction) return warnings;

  const OHP_MOVEMENTS = ['overhead press', 'military press', 'arnold press', 'push press',
    'dumbbell shoulder press', 'seated dumbbell press', 'landmine press to overhead'];

  const week1 = plan?.weeks?.[0];
  const workoutDays = (week1?.days || []).filter(d => d.type === 'workout');

  for (const day of workoutDays) {
    for (const e of (day.exercises || [])) {
      const name = (e.name || '').toLowerCase();
      if (OHP_MOVEMENTS.some(m => name.includes(m))) {
        warnings.push(`  Day ${day.dayNumber} "${day.title}": "${e.name}" — overhead movement included despite shoulder impingement restriction`);
      }
    }
  }

  return warnings;
}

async function generatePlan(profile) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
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
  console.log(`\nHone Targeted Audit — Plans #1, #4, #5, #14\n${'─'.repeat(50)}`);

  const results = [];

  for (const profile of PROFILES) {
    process.stdout.write(`[#${profile.id}] ${profile.label}... `);
    const start = Date.now();

    try {
      const data = await generatePlan(profile);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`✓ ${elapsed}s`);

      const goal = profile.payload.goal;
      const injuries = profile.payload.injuries || [];

      const repWarnings = checkRepRanges(data.plan, goal);
      const deadliftWarnings = checkDeadliftOnPullDay(data.plan, goal);
      const doubleDeadliftWarnings = checkDoubleDeadlift(data.plan, goal);
      const ohpWarnings = checkOHPInjury(data.plan, injuries);

      const allWarnings = [...repWarnings, ...deadliftWarnings, ...doubleDeadliftWarnings, ...ohpWarnings];

      if (allWarnings.length > 0) {
        console.log(`  ⚠ Warnings (${allWarnings.length}):`);
        allWarnings.forEach(w => console.log(w));
      } else {
        console.log(`  ✓ All checks passed`);
      }

      results.push({ id: profile.id, label: profile.label, status: 'ok', plan: data.plan, elapsed, warnings: allWarnings });
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`✗ ${err.message}`);
      results.push({ id: profile.id, label: profile.label, status: 'error', error: err.message, elapsed });
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'error').length;
  const withWarnings = results.filter(r => (r.warnings || []).length > 0).length;

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Done: ${ok} succeeded, ${failed} failed, ${withWarnings} with warnings`);
  console.log(withWarnings === 0 ? '✓ All fixes confirmed working' : '⚠ Warnings remain — check output above');
  console.log(`\nResults saved to audit-results-targeted.json\n`);

  writeFileSync('audit-results-targeted.json', JSON.stringify(results, null, 2));
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });

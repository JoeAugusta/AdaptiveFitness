// Hone — 4-Week Progression Simulation (with pre-populated W1 weights)
// Usage: $env:SUPABASE_SERVICE_KEY="your_key" && node audit-progression.mjs

import { writeFileSync } from 'fs';

const BASE_URL = 'https://vpjbsovstlctgkvpqqal.supabase.co/functions/v1';
const SUPABASE_URL = 'https://vpjbsovstlctgkvpqqal.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwamJzb3ZzdGxjdGdrdnBxcWFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzY0MjcsImV4cCI6MjA4ODIxMjQyN30.kckEPkdsxXG-5np5gQkHawDMzCfoGgt3ysST3jH0TNk';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const REAL_USER_ID = '1f82bad0-7af8-4857-b00e-80830200f6bc';

if (!SERVICE_KEY) {
  console.error('ERROR: Set SUPABASE_SERVICE_KEY environment variable first.');
  process.exit(1);
}

// ─── PROFILES ────────────────────────────────────────────────────────────────

const PROFILES = [
  {
    id: 'sim_1',
    label: 'Strength — OHP, Intermediate M, 4d Upper/Lower',
    payload: {
      goal: 'strength', experience: 'intermediate', daysPerWeek: 4,
      biologicalSex: 'male', split: 'upper_lower',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      targetLift: 'overhead_press', goalLift: 'overhead_press',
      current1RM: 135, target1RM: 175,
      injuries: [], excludedExercises: [],
    },
    w1Weights: {
      'Overhead Press': 100, 'Barbell Row': 115, 'Bench Press': 155,
      'Incline Dumbbell Press': 50, 'Dumbbell Bench Press': 55,
      'Lat Pulldown': 120, 'Cable Row': 110, 'Seated Cable Row': 110,
      'Close Grip Bench Press': 95, 'Tricep Pushdown': 70,
      'Skull Crusher': 55, 'Skull Crushers': 55,
      'Barbell Curl': 65, 'Hammer Curl': 35, 'Hammer Curls': 35,
      'Face Pull': 45, 'Face Pulls': 45, 'Lateral Raise': 20, 'Lateral Raises': 20,
      'Back Squat': 185, 'Front Squat': 135, 'Leg Press': 270,
      'Romanian Deadlift': 155, 'Stiff Leg Deadlift': 135, 'Good Morning': 95,
      'Bulgarian Split Squat': 30, 'Bulgarian Split Squats': 30,
      'Walking Lunge': 30, 'Walking Lunges': 30,
      'Hip Thrust': 185, 'Hip Thrusts': 185,
      'Leg Curl': 80, 'Lying Leg Curl': 75, 'Leg Curls': 80,
      'Leg Extension': 90, 'Goblet Squat': 50,
      'Calf Raise': 135, 'Calf Raises': 135, 'Standing Calf Raises': 135,
      'Dumbbell Shoulder Press': 40, 'Seated Dumbbell Press': 40,
    },
  },
  {
    id: 'sim_2',
    label: 'Hypertrophy — Advanced F, 5d PPL',
    payload: {
      goal: 'hypertrophy', experience: 'advanced', daysPerWeek: 5,
      biologicalSex: 'female', split: 'ppl',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      injuries: [], excludedExercises: [],
    },
    w1Weights: {
      'Barbell Bench Press': 95, 'Incline Barbell Press': 85,
      'Dumbbell Bench Press': 35, 'Incline Dumbbell Press': 30,
      'Dumbbell Shoulder Press': 25, 'Arnold Press': 20,
      'Overhead Press': 65,
      'Lateral Raise': 12, 'Lateral Raises': 12, 'Cable Lateral Raises': 12,
      'Rear Delt Fly': 12, 'Reverse Fly': 12,
      'Tricep Pushdown (Rope)': 45, 'Tricep Pushdown (V-Bar)': 40,
      'Close Grip Bench Press': 75, 'Overhead Tricep Extension': 35,
      'Cable Fly (High to Low)': 20, 'Cable Fly (Low to High)': 20,
      'Barbell Row (Overhand Wide)': 85, 'Barbell Row (Underhand)': 80,
      'T-Bar Row': 55, 'Dumbbell Row': 35,
      'Lat Pulldown (Wide Grip)': 90, 'Lat Pulldown (Close Grip)': 85,
      'Cable Row (Close Grip)': 80, 'Pull-Up': 0, 'Pull-ups': 0,
      'Face Pulls': 30, 'Face Pull': 30, 'Shrugs': 65, 'Shrug': 65,
      'Barbell Curl': 45, 'Hammer Curl': 20, 'Hammer Curls': 20,
      'Preacher Curl': 30, 'Cable Curl': 25, 'Reverse Curl': 25,
      'Back Squat': 115, 'Leg Press': 180, 'Walking Lunge': 20, 'Walking Lunges': 20,
      'Romanian Deadlift': 95, 'Lying Leg Curl': 55, 'Leg Curl': 55,
      'Calf Raise': 90, 'Hip Thrust': 115, 'Bulgarian Split Squat': 25,
    },
  },
  {
    id: 'sim_3',
    label: 'Body Recomp — Knee Injury, Intermediate F, 4d Upper/Lower',
    payload: {
      goal: 'recomp', experience: 'intermediate', daysPerWeek: 4,
      biologicalSex: 'female', split: 'upper_lower',
      equipment: 'Barbell, Dumbbells, Cables, Machines',
      sessionLength: '60-90', totalWeeks: 12, recommendedWeeks: 12,
      injuries: ['knee'], excludedExercises: [],
    },
    w1Weights: {
      'Barbell Bench Press': 75, 'Dumbbell Bench Press': 30,
      'Incline Dumbbell Press': 25, 'Dumbbell Incline Press': 25,
      'Dumbbell Shoulder Press': 20, 'Overhead Press': 55,
      'Lateral Raise': 12, 'Dumbbell Lateral Raise': 12,
      'Cable Fly (High to Low)': 15, 'Cable Lateral Raise': 10,
      'Tricep Pushdown (Rope)': 35, 'Close Grip Bench Press': 55,
      'Overhead Tricep Extension': 25,
      'Barbell Row (Overhand Wide)': 65, 'Barbell Row': 65,
      'Lat Pulldown (Wide Grip)': 75, 'Lat Pulldown (Close Grip)': 70,
      'Cable Row (Close Grip)': 65, 'Pull-up': 0,
      'Face Pulls': 25, 'Face Pull': 25,
      'Dumbbell Bicep Curl': 20, 'Barbell Curl': 35,
      'Hammer Curl': 15, 'Hammer Curls': 15,
      'Leg Press': 160, 'Hip Thrust': 95, 'Glute Bridge': 45,
      'Romanian Deadlift': 85, 'Stiff Leg Deadlift': 75,
      'Lying Leg Curl': 45, 'Seated Leg Curl': 40, 'Leg Curl': 45,
      'Calf Raise': 80, 'Seated Calf Raise': 60, 'Calf Raise (Standing)': 80,
      'Cable Pull-Through': 50, 'Abduction Machine': 50, 'Hip Abduction': 50,
    },
  },
  {
    id: 'sim_4',
    label: 'Power Hypertrophy — Deadlift, Advanced M, 6d Arnold Split',
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
    // Advanced male powerlifter — heavy compound weights
    w1Weights: {
      // Push
      'Barbell Bench Press': 225, 'Incline Barbell Press': 185,
      'Dumbbell Bench Press': 85, 'Incline Dumbbell Press': 70,
      'Overhead Press': 155, 'Dumbbell Shoulder Press': 60, 'Arnold Press': 50,
      'Lateral Raise': 25, 'Rear Delt Fly': 20,
      'Tricep Pushdown (Rope)': 80, 'Tricep Pushdown (V-Bar)': 75,
      'Close Grip Bench Press': 185, 'Overhead Tricep Extension': 60,
      'Cable Fly (High to Low)': 35, 'Cable Fly (Low to High)': 30,
      // Pull
      'Conventional Deadlift': 335, 'Deadlift': 335, 'Sumo Deadlift': 315,
      'Barbell Row (Overhand Wide)': 185, 'Barbell Row (Underhand)': 175,
      'T-Bar Row': 135, 'Dumbbell Row': 90,
      'Lat Pulldown (Wide Grip)': 160, 'Lat Pulldown (Close Grip)': 150,
      'Cable Row (Close Grip)': 150, 'Pull-up': 0, 'Pull-ups': 0,
      'Face Pulls': 55, 'Face Pull': 55, 'Shrugs': 225, 'Shrug': 225,
      'Barbell Curl': 95, 'Hammer Curl': 50, 'Preacher Curl': 75,
      'Cable Curl': 55,
      // Legs
      'Back Squat': 260, 'Front Squat': 205, 'Safety Bar Squat': 225,
      'Leg Press': 450, 'Romanian Deadlift': 275, 'Stiff Leg Deadlift': 255,
      'Bulgarian Split Squat': 65, 'Walking Lunge': 65,
      'Leg Curl': 120, 'Lying Leg Curl': 115, 'Leg Extension': 150,
      'Calf Raise': 225, 'Seated Calf Raise': 135, 'Hip Thrust': 315,
      'Good Morning': 135, 'Back Extension': 45,
    },
  },
  {
    id: 'sim_5',
    label: 'Fat Loss — Beginner M, 3d Full Body, No Barbell',
    payload: {
      goal: 'fat_loss', experience: 'beginner', daysPerWeek: 3,
      biologicalSex: 'male', split: 'full_body',
      equipment: 'Dumbbells, Cables, Machines',
      sessionLength: '45-60', totalWeeks: 12, recommendedWeeks: 12,
      targetWeightLbs: 185,
      injuries: [], excludedExercises: [],
    },
    // Beginner — light weights, machine/dumbbell only
    w1Weights: {
      'Dumbbell Bench Press': 30, 'Incline Dumbbell Press': 25,
      'Dumbbell Shoulder Press': 20, 'Dumbbell Row': 35,
      'Lat Pulldown': 70, 'Lat Pulldown (Wide Grip)': 70,
      'Cable Row': 55, 'Cable Row (Close Grip)': 55,
      'Goblet Squat': 25, 'Dumbbell Goblet Squat': 25,
      'Leg Press': 120, 'Romanian Deadlift': 45,
      'Dumbbell Romanian Deadlift': 40,
      'Lying Leg Curl': 40, 'Leg Curl': 40, 'Leg Extension': 60,
      'Tricep Pushdown': 35, 'Tricep Pushdown (Rope)': 35,
      'Dumbbell Bicep Curl': 20, 'Hammer Curl': 20,
      'Lateral Raise': 10, 'Dumbbell Lateral Raise': 10,
      'Calf Raise': 70, 'Machine Row': 55,
      'Dumbbell Step-Up': 20, 'Step-Up': 20,
      'Face Pulls': 30, 'Face Pull': 30,
      'Cable Crunch': 40, 'Plank': 0,
    },
  },
];

// ─── RPE PATTERNS ─────────────────────────────────────────────────────────────
// Mixed: some easy, some hard, some on target

const RPE_PATTERNS = [
  [6, 7, 8, 7],   // starts easy, normalises
  [8, 9, 8, 9],   // consistently hard
  [7, 7, 7, 7],   // on target throughout
  [6, 6, 7, 8],   // easy early, builds
  [9, 8, 7, 6],   // hard early, eases
  [7, 6, 7, 6],   // alternating easy/target
];

function simulatedRpe(exerciseIndex, weekIndex) {
  return RPE_PATTERNS[exerciseIndex % RPE_PATTERNS.length][weekIndex % 4];
}

// ─── DB HELPERS ───────────────────────────────────────────────────────────────

async function dbInsert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`DB insert ${table} failed: ${await res.text()}`);
  return res.json();
}

async function dbDelete(table, filter) {
  const params = new URLSearchParams(filter);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY },
  });
  if (!res.ok) console.warn(`DB delete ${table} warning: ${await res.text()}`);
}

async function dbPatch(table, filter, body) {
  const params = new URLSearchParams(filter);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.warn(`DB patch ${table} warning: ${await res.text()}`);
}

async function dbSelect(table, filter) {
  const params = new URLSearchParams({ ...filter, select: '*' });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY },
  });
  if (!res.ok) throw new Error(`DB select ${table} failed: ${await res.text()}`);
  return res.json();
}

// ─── EDGE FUNCTION CALLERS ────────────────────────────────────────────────────

async function callGeneratePlan(payload) {
  const res = await fetch(`${BASE_URL}/generate-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`generate-plan failed: ${await res.text()}`);
  return res.json();
}

async function callGenerateNextWeek(planId, completedWeekNumber) {
  const res = await fetch(`${BASE_URL}/generate-next-week`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ userId: REAL_USER_ID, planId, completedWeekNumber }),
  });
  if (!res.ok) throw new Error(`generate-next-week failed: ${await res.text()}`);
  return res.json();
}

// ─── LOG BUILDER ──────────────────────────────────────────────────────────────

// Looks up a realistic weight for an exercise by name
function lookupW1Weight(exerciseName, w1Weights) {
  // Exact match first
  if (w1Weights[exerciseName] != null) return w1Weights[exerciseName];
  // Case-insensitive partial match
  const lower = exerciseName.toLowerCase();
  for (const [key, val] of Object.entries(w1Weights)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return val;
    }
  }
  return null;
}

function buildSetsJson(exercises, weekIndex, w1Weights, isWeek1) {
  const sets = [];
  exercises.forEach((ex, exIdx) => {
    if (!ex.name) return;
    const rpe = simulatedRpe(exIdx, weekIndex);
    const setCount = ex.sets ?? 3;

    // Determine working weight
    let workingWeight;
    if (isWeek1 && w1Weights) {
      // Use pre-populated realistic W1 weight
      const looked = lookupW1Weight(ex.name, w1Weights);
      workingWeight = looked ?? (ex.targetWeight > 0 ? ex.targetWeight : 50);
    } else {
      // Weeks 2+: use the plan's targetWeight (engine already calculated it)
      workingWeight = ex.targetWeight > 0 ? ex.targetWeight : 0;
      if (workingWeight === 0 && ex.setTargets?.length) {
        workingWeight = Math.max(...ex.setTargets.map(s => s.targetWeight ?? 0));
      }
      // If plan still has 0 (non-strength self-select), fall back to w1Weights
      // so the engine has a real signal to progress from
      if (workingWeight === 0 && w1Weights) {
        const looked = lookupW1Weight(ex.name, w1Weights);
        if (looked != null) workingWeight = looked;
      }
    }

    for (let s = 0; s < setCount; s++) {
      const isWarmup = ex.setStructure === 'pyramid' && s < setCount - 1;
      const loggedWeight = isWarmup
        ? Math.round((workingWeight * 0.85) / 5) * 5
        : workingWeight;

      sets.push({
        exerciseId: ex.id ?? `e${exIdx + 1}`,
        exerciseName: ex.name,
        setNumber: s + 1,
        weightLbs: loggedWeight,
        reps: parseInt(String(ex.reps ?? '8').split('-')[0]) || 8,
        rpe,
        completed: true,
        isWarmup,
      });
    }
  });
  return sets;
}

// ─── PROGRESSION REPORTER ─────────────────────────────────────────────────────

function extractWeights(planJson, weekNumber, w1WeightsOverride) {
  const week = planJson.weeks?.find(w => w.weekNumber === weekNumber);
  if (!week) return {};
  const weights = {};
  for (const day of week.days ?? []) {
    if (day.type !== 'workout') continue;
    for (const ex of day.exercises ?? []) {
      if (!ex.name) continue;
      const key = `${day.title} | ${ex.name}`;
      let weight = ex.setStructure === 'pyramid' && ex.setTargets?.length
        ? Math.max(...ex.setTargets.map(s => s.targetWeight ?? 0))
        : (ex.targetWeight ?? 0);
      // For W1 on self-select plans, use the pre-populated weight if plan has 0
      if (weight === 0 && weekNumber === 1 && w1WeightsOverride) {
        const looked = lookupW1Weight(ex.name, w1WeightsOverride);
        if (looked != null) weight = looked;
      }
      weights[key] = weight;
    }
  }
  return weights;
}

function printProgressionTable(label, weeklyWeights) {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`PROFILE: ${label}`);
  console.log('─'.repeat(72));

  const allKeys = [...new Set(weeklyWeights.flatMap(ww => Object.keys(ww)))];
  console.log(`${'Exercise'.padEnd(44)} W1      W2      W3      W4`);
  console.log('─'.repeat(72));

  for (const key of allKeys) {
    const vals = weeklyWeights.map(ww => {
      const w = ww[key];
      if (w == null) return '—     ';
      if (w === 0) return 'BW    ';
      return String(w).padEnd(6);
    });

    const weights = weeklyWeights.map(ww => ww[key]).filter(w => w != null && w > 0);
    const changed = weights.length > 1 && weights.some(w => w !== weights[0]);

    // Flag suspicious UPWARD jumps only (>15 lbs in one week, not deload drops)
    let jumpFlag = '';
    for (let i = 1; i < weeklyWeights.length; i++) {
      const prev = weeklyWeights[i-1][key];
      const curr = weeklyWeights[i][key];
      if (prev && curr && (curr - prev) > 15) {  // positive only — deload drops are expected
        jumpFlag = ' ⚠️';
        break;
      }
    }

    const name = key.length > 43 ? key.slice(0, 40) + '...' : key;
    console.log(`${name.padEnd(44)} ${vals.join('  ')}${changed ? ' ↑' : ''}${jumpFlag}`);
  }

  console.log('\n↑ = weight changed  ⚠️ = unexpected upward jump >15 lbs');
}

// ─── MAIN SIMULATION ──────────────────────────────────────────────────────────

async function simulateProfile(profile) {
  const cleanupIds = { planId: null, goalId: null, logIds: [] };

  try {
    console.log(`\n${'═'.repeat(72)}`);
    console.log(`SIMULATING: ${profile.label}`);
    console.log('═'.repeat(72));

    // Pause existing active plans
    await dbPatch('plans', { user_id: `eq.${REAL_USER_ID}`, status: 'eq.active' }, { status: 'paused' });

    // Create goal
    console.log('  Creating sim goal...');
    const goalRows = await dbInsert('goals', {
      user_id: REAL_USER_ID,
      goal_type: profile.payload.goal,
      target_lift: profile.payload.targetLift ?? null,
      current_1rm: profile.payload.current1RM ?? null,
      target_1rm: profile.payload.target1RM ?? null,
      plan_duration_weeks: 12,
      status: 'active',
      created_at: new Date().toISOString(),
      target_date: new Date(Date.now() + 84 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
    cleanupIds.goalId = goalRows[0]?.id;

    // Generate Week 1
    console.log('  Generating Week 1 plan...');
    const planResponse = await callGeneratePlan(profile.payload);
    const _raw = planResponse.plan ?? planResponse;
    const planJson = _raw.plan ?? _raw;

    const planRows = await dbInsert('plans', {
      user_id: REAL_USER_ID,
      goal_id: cleanupIds.goalId,
      title: `[SIM] ${planJson.title ?? profile.label}`,
      plan_json: planJson,
      current_week: 1,
      total_weeks: 12,
      status: 'active',
      created_at: new Date().toISOString(),
    });
    const planId = planRows[0]?.id;
    cleanupIds.planId = planId;
    console.log(`  Plan created (id: ${planId})`);

    const weeklyWeights = [];
    let currentPlanJson = planJson;

    for (let weekNum = 1; weekNum <= 4; weekNum++) {
      console.log(`\n  ── Week ${weekNum} ──`);

      const weights = extractWeights(currentPlanJson, weekNum, weekNum === 1 ? profile.w1Weights : null);
      weeklyWeights.push(weights);

      const nonZero = Object.values(weights).filter(w => w > 0).length;
      const zero = Object.values(weights).filter(w => w === 0).length;
      console.log(`    ${nonZero} exercises with weights, ${zero} bodyweight/self-select`);

      if (weekNum === 4) break;

      const week = currentPlanJson.weeks?.find(w => w.weekNumber === weekNum);
      if (!week) { console.log('    WARNING: week not found'); break; }

      const workoutDays = week.days.filter(d => d.type === 'workout');
      console.log(`    Logging ${workoutDays.length} sessions (week ${weekNum === 1 ? 'using pre-populated W1 weights' : 'using plan weights + RPE'})...`);

      for (const day of workoutDays) {
        const isWeek1 = weekNum === 1;
        const setsJson = buildSetsJson(day.exercises ?? [], weekNum - 1, profile.w1Weights, weekNum === 1);
        const logRows = await dbInsert('workout_logs', {
          user_id: REAL_USER_ID,
          plan_id: planId,
          week_number: weekNum,
          day_number: day.dayNumber,
          sets_json: setsJson,
          session_fatigue_rating: 3 + (weekNum % 3),
          logged_at: new Date().toISOString(),
        });
        if (logRows[0]?.id) cleanupIds.logIds.push(logRows[0].id);
      }

      console.log(`    Generating Week ${weekNum + 1}...`);
      const gnwResult = await callGenerateNextWeek(planId, weekNum);
      console.log(`    → ${JSON.stringify(gnwResult)}`);
      await new Promise(r => setTimeout(r, 1500));

      const plans = await dbSelect('plans', { id: `eq.${planId}` });
      currentPlanJson = plans[0]?.plan_json ?? currentPlanJson;

      const nextWeek = currentPlanJson.weeks?.find(w => w.weekNumber === weekNum + 1);
      if (nextWeek) {
        console.log(`    ✓ Week ${weekNum + 1} ready — phase: ${nextWeek.phase}`);
      } else {
        console.log(`    ⚠️  Week ${weekNum + 1} not found`);
      }
    }

    printProgressionTable(profile.label, weeklyWeights);
    return { profile: profile.label, weeklyWeights, status: 'ok' };

  } catch (err) {
    console.error(`  ✗ ERROR: ${err.message}`);
    return { profile: profile.label, status: 'error', error: err.message };
  } finally {
    console.log(`\n  Cleaning up...`);
    for (const logId of cleanupIds.logIds) {
      if (logId) await dbDelete('workout_logs', { id: `eq.${logId}` });
    }
    if (cleanupIds.planId) await dbDelete('plans', { id: `eq.${cleanupIds.planId}` });
    if (cleanupIds.goalId) await dbDelete('goals', { id: `eq.${cleanupIds.goalId}` });
    await dbPatch('plans', { user_id: `eq.${REAL_USER_ID}`, status: 'eq.paused' }, { status: 'active' });
    console.log('  Done.');
  }
}

async function run() {
  console.log('Hone — 4-Week Progression Simulation (pre-populated W1 weights)');
  console.log('3 profiles × 4 weeks × mixed RPE\n');

  const results = [];
  for (const profile of PROFILES) {
    const result = await simulateProfile(profile);
    results.push(result);
    await new Promise(r => setTimeout(r, 2000));
  }

  writeFileSync('audit-progression.json', JSON.stringify(results, null, 2));
  console.log('\n\nDone. Full data saved to audit-progression.json');
  const ok = results.filter(r => r.status === 'ok').length;
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`Summary: ${ok} ok, ${errors} errors`);
}

run().catch(console.error);

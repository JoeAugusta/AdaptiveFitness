// Hone — Macro Calculation Audit
// Replicates MacroSetupScreen.tsx computeTdee() + computeTargetCalories()
// Usage: node audit-macros.mjs

// ─── EXACT COPY of MacroSetupScreen logic ────────────────────────────────────

const PACE_CONFIG = {
  fat_loss: [
    { id: 'conservative', adjustment: -250 },
    { id: 'balanced',     adjustment: -400 },
    { id: 'aggressive',   adjustment: -600 },
  ],
  hypertrophy: [
    { id: 'conservative', adjustment: 200 },
    { id: 'balanced',     adjustment: 300 },
    { id: 'aggressive',   adjustment: 500 },
  ],
};

function computeTdee(p) {
  const heightCm = (Number(p.heightFt) * 12 + Number(p.heightIn)) * 2.54;
  const weightKg = Number(p.weightLbs) * 0.453592;
  const age = Number(p.age);

  const bmrMale   = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  const bmrFemale = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  let bmr;
  if (p.sex === 'male')        bmr = bmrMale;
  else if (p.sex === 'female') bmr = bmrFemale;
  else                         bmr = (bmrMale + bmrFemale) / 2;

  const days = Number(p.daysPerWeek);
  let mult;
  if      (days <= 2) mult = 1.375;
  else if (days <= 4) mult = 1.55;
  else if (days <= 6) mult = 1.725;
  else                mult = 1.9;

  let tdee = bmr * mult;

  if (p.concurrentSport) {
    const intensityCal = {
      martial_arts: 150, team_sports: 150,
      running: 120, cycling: 120, swimming: 130, other: 100,
    };
    const avg = p.concurrentSport.type.reduce(
      (sum, t) => sum + (intensityCal[t] ?? 100), 0
    ) / p.concurrentSport.type.length;
    tdee += avg * p.concurrentSport.daysPerWeek;
  }

  return tdee;
}

function getGoalAdjustment(goal) {
  switch (goal) {
    case 'strength':
    case 'power_hypertrophy': return 200;
    case 'hypertrophy':       return 300;
    case 'fat_loss':          return -400;
    case 'recomp':
    case 'general':
    default:                  return 0;
  }
}

function computeTargetCalories(p, caloriePace = 'balanced') {
  const tdee = computeTdee(p);
  const goalAdj = getGoalAdjustment(p.goal);
  const paceAdj = (() => {
    const paces = PACE_CONFIG[p.goal];
    if (!paces) return goalAdj;
    return paces.find(pc => pc.id === caloriePace)?.adjustment ?? goalAdj;
  })();
  const cal = Math.round((tdee + paceAdj) / 50) * 50;
  return Math.max(1200, Math.min(5500, cal));
}

function calcMacros(calories, weightLbs) {
  const round5 = n => Math.round(n / 5) * 5;
  const proteinG = round5(weightLbs * 1.0);
  const fatsG    = round5((calories * 0.25) / 9);
  const carbsG   = round5((calories - proteinG * 4 - fatsG * 9) / 4);
  return { proteinG, carbsG, fatsG };
}

// ─── AUDIT PROFILES ──────────────────────────────────────────────────────────

const PROFILES = [
  {
    label: 'Joe — Power Hypertrophy, Advanced M, 6d, Muay Thai 2x',
    heightFt: 5, heightIn: 4, weightLbs: 175, age: 30, sex: 'male',
    daysPerWeek: 6, goal: 'power_hypertrophy', caloriePace: 'balanced',
    concurrentSport: { type: ['martial_arts'], daysPerWeek: 2 },
  },
  {
    label: 'Brother — Recomp, M, 5d, no sport',
    heightFt: 5, heightIn: 5, weightLbs: 220, age: 36, sex: 'male',
    daysPerWeek: 5, goal: 'recomp', caloriePace: 'balanced',
    concurrentSport: null,
  },
  {
    label: 'Fat Loss — Beginner F, 3d, no sport',
    heightFt: 5, heightIn: 6, weightLbs: 160, age: 28, sex: 'female',
    daysPerWeek: 3, goal: 'fat_loss', caloriePace: 'balanced',
    concurrentSport: null,
  },
  {
    label: 'Fat Loss Aggressive — F, 3d, no sport',
    heightFt: 5, heightIn: 6, weightLbs: 160, age: 28, sex: 'female',
    daysPerWeek: 3, goal: 'fat_loss', caloriePace: 'aggressive',
    concurrentSport: null,
  },
  {
    label: 'Hypertrophy — Intermediate M, 4d, no sport',
    heightFt: 5, heightIn: 10, weightLbs: 180, age: 25, sex: 'male',
    daysPerWeek: 4, goal: 'hypertrophy', caloriePace: 'balanced',
    concurrentSport: null,
  },
  {
    label: 'Strength — Advanced M, 4d, no sport',
    heightFt: 6, heightIn: 1, weightLbs: 210, age: 32, sex: 'male',
    daysPerWeek: 4, goal: 'strength', caloriePace: 'balanced',
    concurrentSport: null,
  },
  {
    label: 'Recomp — Intermediate F, 4d, running 3x',
    heightFt: 5, heightIn: 4, weightLbs: 140, age: 30, sex: 'female',
    daysPerWeek: 4, goal: 'recomp', caloriePace: 'balanced',
    concurrentSport: { type: ['running'], daysPerWeek: 3 },
  },
  {
    label: 'General Fitness — Beginner M, 3d, no sport',
    heightFt: 5, heightIn: 9, weightLbs: 195, age: 40, sex: 'male',
    daysPerWeek: 3, goal: 'general', caloriePace: 'balanced',
    concurrentSport: null,
  },
  {
    label: 'Fat Loss — Heavier F, 4d, no sport',
    heightFt: 5, heightIn: 3, weightLbs: 250, age: 35, sex: 'female',
    daysPerWeek: 4, goal: 'fat_loss', caloriePace: 'balanced',
    concurrentSport: null,
  },
  {
    label: 'Power Hypertrophy — Lighter M, 6d, no sport',
    heightFt: 5, heightIn: 7, weightLbs: 155, age: 22, sex: 'male',
    daysPerWeek: 6, goal: 'power_hypertrophy', caloriePace: 'balanced',
    concurrentSport: null,
  },
];

// ─── SANITY CHECK ─────────────────────────────────────────────────────────────
// For each goal, flag if calories seem outside expected range

function sanityCheck(goal, calories, weightLbs, sex) {
  const flags = [];

  // Absolute floor/ceiling
  if (calories < 1400) flags.push('⚠️  Below safe minimum (1400)');
  if (calories > 4500) flags.push('⚠️  Unusually high (>4500)');

  // Goal-specific
  if (goal === 'fat_loss' && calories > 2800) flags.push('⚠️  Fat loss target seems high');
  if (goal === 'fat_loss' && calories < 1200) flags.push('⚠️  Fat loss target too low');
  if (goal === 'recomp' && calories > 3500)   flags.push('⚠️  Recomp target seems high');
  if (goal === 'hypertrophy' && calories < 2000) flags.push('⚠️  Hypertrophy target seems low');
  if (goal === 'power_hypertrophy' && calories < 2500 && weightLbs > 150) flags.push('⚠️  Power hypertrophy target seems low for bodyweight');

  // Protein per lb sanity (1g/lb)
  const expectedProtein = weightLbs;
  return flags;
}

// ─── RUN AUDIT ───────────────────────────────────────────────────────────────

console.log('Hone — Macro Calculation Audit');
console.log('═'.repeat(80));

const results = [];

for (const p of PROFILES) {
  const tdee      = computeTdee(p);
  const calories  = computeTargetCalories(p, p.caloriePace);
  const goalAdj   = getGoalAdjustment(p.goal);
  const { proteinG, carbsG, fatsG } = calcMacros(calories, p.weightLbs);
  const flags     = sanityCheck(p.goal, calories, p.weightLbs, p.sex);

  // BMR breakdown
  const weightKg  = p.weightLbs * 0.453592;
  const heightCm  = (p.heightFt * 12 + p.heightIn) * 2.54;
  const bmr       = p.sex === 'male'
    ? 10 * weightKg + 6.25 * heightCm - 5 * p.age + 5
    : 10 * weightKg + 6.25 * heightCm - 5 * p.age - 161;
  const days      = p.daysPerWeek;
  const mult      = days <= 2 ? 1.375 : days <= 4 ? 1.55 : days <= 6 ? 1.725 : 1.9;
  const sportCal  = p.concurrentSport
    ? (() => {
        const map = { martial_arts:150, team_sports:150, running:120, cycling:120, swimming:130, other:100 };
        const avg = p.concurrentSport.type.reduce((s,t) => s+(map[t]??100),0)/p.concurrentSport.type.length;
        return avg * p.concurrentSport.daysPerWeek;
      })()
    : 0;

  console.log(`\n${'─'.repeat(80)}`);
  console.log(`PROFILE: ${p.label}`);
  console.log(`${'─'.repeat(80)}`);
  console.log(`  Stats:     ${p.sex}, ${p.heightFt}'${p.heightIn}", ${p.weightLbs} lbs, age ${p.age}`);
  console.log(`  Training:  ${p.daysPerWeek}d/week${p.concurrentSport ? `, + ${p.concurrentSport.type.join('/')} ${p.concurrentSport.daysPerWeek}x/week` : ''}`);
  console.log(`  Goal:      ${p.goal} (${p.caloriePace} pace)`);
  console.log('');
  console.log(`  BMR:       ${Math.round(bmr)} kcal  (weight ${weightKg.toFixed(1)}kg, height ${heightCm.toFixed(1)}cm)`);
  console.log(`  × Activity: ${mult} (${p.daysPerWeek} days/week)`);
  console.log(`  = TDEE:    ${Math.round(bmr * mult)} kcal`);
  if (sportCal > 0) console.log(`  + Sport:   +${Math.round(sportCal)} kcal`);
  console.log(`  + Goal adj: ${goalAdj >= 0 ? '+' : ''}${goalAdj} kcal (${p.goal})`);
  console.log('');
  console.log(`  ▶ CALORIES: ${calories} kcal`);
  console.log(`  ▶ PROTEIN:  ${proteinG}g  (${p.weightLbs}g × 1.0)`);
  console.log(`  ▶ CARBS:    ${carbsG}g`);
  console.log(`  ▶ FATS:     ${fatsG}g`);
  console.log('');

  if (flags.length > 0) {
    for (const f of flags) console.log(`  ${f}`);
  } else {
    console.log('  ✓ Looks reasonable');
  }

  results.push({ label: p.label, calories, proteinG, carbsG, fatsG, tdee: Math.round(tdee), bmr: Math.round(bmr), flags });
}

console.log('\n\n' + '═'.repeat(80));
console.log('SUMMARY TABLE');
console.log('═'.repeat(80));
console.log(`${'Profile'.padEnd(45)} ${'Cal'.padStart(5)} ${'Pro'.padStart(5)} ${'Carb'.padStart(5)} ${'Fat'.padStart(5)}  Flags`);
console.log('─'.repeat(80));
for (const r of results) {
  const name = r.label.length > 44 ? r.label.slice(0,41)+'...' : r.label;
  const flagStr = r.flags.length > 0 ? r.flags.join(', ') : '✓';
  console.log(`${name.padEnd(45)} ${String(r.calories).padStart(5)} ${String(r.proteinG).padStart(5)} ${String(r.carbsG).padStart(5)} ${String(r.fatsG).padStart(5)}  ${flagStr}`);
}

console.log('\nDone.');

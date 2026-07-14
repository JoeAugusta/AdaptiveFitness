/**
 * Verify strength load rounding for bench 345 → 405 test case.
 * Usage: node scripts/verify-strength-loads.mjs
 */

function week1Factor(experience) {
  switch (String(experience ?? '').toLowerCase()) {
    case 'beginner': return 0.72;
    case 'intermediate': return 0.78;
    case 'advanced': return 0.88;
    default: return 0.78;
  }
}

function calculateStartingWeight(oneRM, percentage) {
  return Math.round((oneRM * percentage) / 5) * 5;
}

function strengthW1Weights(current1RM, experience) {
  const factor = week1Factor(experience);
  const heavyDayWeight = calculateStartingWeight(current1RM, factor);
  const volumeDayWeight = Math.round((heavyDayWeight * 0.85) / 5) * 5;
  return { factor, heavyDayWeight, volumeDayWeight };
}

function roundLoadToFive(weight) {
  if (!Number.isFinite(weight) || weight <= 0) return weight;
  return Math.round(weight / 5) * 5;
}

function normalizeLoads(plan) {
  const changes = [];
  const weeks = plan?.weeks;
  if (!Array.isArray(weeks)) return { plan, changes };

  const newWeeks = weeks.map((week, wi) => {
    if (!week?.days || !Array.isArray(week.days)) return week;
    return {
      ...week,
      days: week.days.map((day, di) => {
        if (!Array.isArray(day.exercises)) return day;
        return {
          ...day,
          exercises: day.exercises.map((ex, ei) => {
            const exOut = { ...ex };
            const tw = Number(ex.targetWeight ?? 0);
            if (tw > 0) {
              const rounded = roundLoadToFive(tw);
              if (rounded !== tw) {
                changes.push({
                  path: `weeks[${wi}].days[${di}].exercises[${ei}].targetWeight`,
                  from: tw,
                  to: rounded,
                });
                exOut.targetWeight = rounded;
              }
            }
            if (Array.isArray(ex.setTargets) && ex.setTargets.length > 0) {
              exOut.setTargets = ex.setTargets.map((st, si) => {
                const stw = Number(st.targetWeight ?? 0);
                if (stw <= 0) return st;
                const rounded = roundLoadToFive(stw);
                if (rounded !== stw) {
                  changes.push({
                    path: `weeks[${wi}].days[${di}].exercises[${ei}].setTargets[${si}].targetWeight`,
                    from: stw,
                    to: rounded,
                  });
                  return { ...st, targetWeight: rounded };
                }
                return st;
              });
            }
            return exOut;
          }),
        };
      }),
    };
  });

  return { plan: { ...plan, weeks: newWeeks }, changes };
}

function collectPositiveWeights(plan) {
  const weights = [];
  for (const week of plan?.weeks ?? []) {
    for (const day of week?.days ?? []) {
      for (const ex of day?.exercises ?? []) {
        const tw = Number(ex.targetWeight ?? 0);
        if (tw > 0) weights.push({ path: `${ex.name ?? ex.exerciseName}:targetWeight`, value: tw });
        for (const st of ex.setTargets ?? []) {
          const stw = Number(st.targetWeight ?? 0);
          if (stw > 0) weights.push({ path: `${ex.name ?? ex.exerciseName}:set${st.setNumber}`, value: stw });
        }
      }
    }
  }
  return weights;
}

function checkMod5(plan) {
  const weights = collectPositiveWeights(plan);
  const bad = weights.filter((w) => w.value % 5 !== 0);
  return { weights, bad, allOk: bad.length === 0 };
}

const current1RM = 345;
const target1RM = 405;

console.log('=== Deterministic W1 weight math (post-fix) ===\n');
for (const exp of ['beginner', 'intermediate', 'advanced']) {
  const r = strengthW1Weights(current1RM, exp);
  console.log(`${exp}: factor=${r.factor}, heavy=${r.heavyDayWeight}, volume=${r.volumeDayWeight}`);
}

console.log('\n=== 312.5 investigation (report only) ===\n');
const impliedFactor = 312.5 / current1RM;
console.log(`312.5 / ${current1RM} = ${impliedFactor.toFixed(4)} (~${(impliedFactor * 100).toFixed(1)}% 1RM)`);
console.log('week1Factor values in code: beginner=0.72, intermediate=0.78, advanced=0.88');
console.log('trainingBackground does NOT modify week1Factor — only affects jordanWelcome copy.');
for (const exp of ['beginner', 'intermediate', 'advanced']) {
  const f = week1Factor(exp);
  const raw = current1RM * f;
  const oldHeavy = Math.round(raw / 2.5) * 2.5;
  const newHeavy = calculateStartingWeight(current1RM, f);
  console.log(
    `${exp}: ${current1RM}×${f}=${raw.toFixed(1)} → old 2.5-round=${oldHeavy}, new 5-round=${newHeavy}`,
  );
}
console.log(
  '\n312.5 with 2.5-lb rounding requires raw product ≈311.25–313.75.',
);
console.log(
  `Advanced (0.88): ${current1RM}×0.88=${(current1RM * 0.88).toFixed(1)} → 302.5 (heavy day), NOT 312.5.`,
);
console.log(
  `To get 312.5 via 2.5-round: need 1RM×factor ≈312.5 → factor≈0.906, OR 1RM≈355 with advanced 0.88 (355×0.88=312.4→312.5).`,
);
console.log(
  'Conclusion: 312.5 is NOT produced by week1Factor(experience) with current1RM=345. Likely Claude JSON deviation or different submitted 1RM.',
);

console.log('\n=== normalizeLoads chokepoint smoke test ===\n');
const dirtyPlan = {
  weeks: [{
    days: [{
      exercises: [
        { name: 'Bench Press', targetWeight: 312.5, setTargets: [{ setNumber: 1, targetWeight: 310 }] },
        { name: 'Row', targetWeight: 0, setTargets: [{ setNumber: 1, targetWeight: 0 }] },
      ],
    }],
  }],
};
const { plan: cleaned, changes } = normalizeLoads(dirtyPlan);
console.log('changes:', changes.length, changes);
const mod5 = checkMod5(cleaned);
console.log('all weights mod 5:', mod5.allOk, mod5.weights);

console.log('\n=== Expected W1 for test case (bench, 345→405) ===');
console.log('Assuming experience=advanced (typical for 345 bench):');
const adv = strengthW1Weights(current1RM, 'advanced');
console.log(`  heavy day: ${adv.heavyDayWeight} lbs`);
console.log(`  volume day: ${adv.volumeDayWeight} lbs`);
console.log('Assuming experience=intermediate:');
const int = strengthW1Weights(current1RM, 'intermediate');
console.log(`  heavy day: ${int.heavyDayWeight} lbs`);
console.log(`  volume day: ${int.volumeDayWeight} lbs`);

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

function roundLoadToFive(weight: number): number {
  if (!Number.isFinite(weight) || weight <= 0) return weight;
  return Math.round(weight / 5) * 5;
}

function normalizeLoads(plan: Record<string, unknown>): {
  plan: Record<string, unknown>;
  changes: Array<{ path: string; from: number; to: number }>;
} {
  const changes: Array<{ path: string; from: number; to: number }> = [];
  const weeks = plan.weeks as unknown[];
  if (!Array.isArray(weeks)) return { plan, changes };

  const newWeeks = weeks.map((week: any, wi: number) => {
    if (!week?.days || !Array.isArray(week.days)) return week;
    return {
      ...week,
      days: week.days.map((day: any, di: number) => {
        if (!Array.isArray(day.exercises)) return day;
        return {
          ...day,
          exercises: day.exercises.map((ex: any, ei: number) => {
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
              exOut.setTargets = ex.setTargets.map((st: any, si: number) => {
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

function week1Factor(experience: string): number {
  switch (experience.toLowerCase()) {
    case 'beginner': return 0.72;
    case 'intermediate': return 0.78;
    case 'advanced': return 0.88;
    default: return 0.78;
  }
}

function calculateStartingWeight(oneRM: number, percentage: number): number {
  return Math.round((oneRM * percentage) / 5) * 5;
}

describe('strength W1 load rounding', () => {
  it('bench 345 advanced → heavy 305, volume 260', () => {
    const factor = week1Factor('advanced');
    const heavy = calculateStartingWeight(345, factor);
    const volume = Math.round((heavy * 0.85) / 5) * 5;
    assert.equal(factor, 0.88);
    assert.equal(heavy, 305);
    assert.equal(volume, 260);
    assert.equal(heavy % 5, 0);
    assert.equal(volume % 5, 0);
  });
});

describe('normalizeLoads', () => {
  it('leaves self-select 0 untouched', () => {
    const { plan, changes } = normalizeLoads({
      weeks: [{
        days: [{
          exercises: [{ targetWeight: 0, setTargets: [{ setNumber: 1, targetWeight: 0 }] }],
        }],
      }],
    });
    assert.equal(changes.length, 0);
    const ex = (plan.weeks as any[])[0].days[0].exercises[0];
    assert.equal(ex.targetWeight, 0);
  });

  it('fixes 312.5 to 315', () => {
    const { plan, changes } = normalizeLoads({
      weeks: [{
        days: [{
          exercises: [{ targetWeight: 312.5 }],
        }],
      }],
    });
    assert.equal(changes.length, 1);
    assert.equal((plan.weeks as any[])[0].days[0].exercises[0].targetWeight, 315);
  });

  it('already-clean plan produces zero changes', () => {
    const { changes } = normalizeLoads({
      weeks: [{
        days: [{
          exercises: [
            { targetWeight: 305, setTargets: [{ setNumber: 1, targetWeight: 260 }] },
          ],
        }],
      }],
    });
    assert.equal(changes.length, 0);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

function roundTo50(n: number): number {
  return Math.round(n / 50) * 50;
}

function proteinFloor(currentWeight: number, goalWeight: number | null): number {
  const basis = Math.min(currentWeight, goalWeight ?? currentWeight);
  return Math.round(basis * 0.8);
}

function recomputeCarbs(finalCalories: number, finalProtein: number, finalFats: number): number {
  return roundTo5(Math.max(0, (finalCalories - finalProtein * 4 - finalFats * 9) / 4));
}

function intakeLine(daysWithLogs: number, avgDailyCalories: number): string | null {
  if (daysWithLogs < 4) return null;
  return `Logged intake: avg ${avgDailyCalories} kcal/day across ${daysWithLogs} of 14 days`;
}

describe('adjust-macros helpers', () => {
  it('protein floor uses min(current, goal)', () => {
    assert.equal(proteinFloor(200, 170), Math.round(170 * 0.8));
    assert.equal(proteinFloor(150, null), Math.round(150 * 0.8));
  });

  it('carbs are calorie remainder after protein and fats', () => {
    const cals = 2000;
    const protein = 160;
    const fats = 60;
    const carbs = recomputeCarbs(cals, protein, fats);
    assert.equal(carbs, roundTo5((cals - protein * 4 - fats * 9) / 4));
    assert.equal(protein * 4 + carbs * 4 + fats * 9, cals);
  });

  it('omits intake line when fewer than 4 logged days', () => {
    assert.equal(intakeLine(3, 1400), null);
    assert.equal(intakeLine(4, 1400), 'Logged intake: avg 1400 kcal/day across 4 of 14 days');
  });
});

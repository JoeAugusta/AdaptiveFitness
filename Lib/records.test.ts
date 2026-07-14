import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeExerciseRecordFromQualifyingSets,
  confirmSetInParsedSets,
  estimateE1RM,
  plausibilityStatusForLoad,
  resolveExerciseKey,
  shouldExcludeSetFromRecords,
  updateSetInParsedSets,
} from './recordsCore';

describe('estimateE1RM', () => {
  it('300×3 @ RPE 8 → e1rm 350', () => {
    const result = estimateE1RM({ load: 300, reps: 3, rpe: 8 });
    assert.equal(result, 350);
  });

  it('225×8 with no RPE → e1rm 285', () => {
    const result = estimateE1RM({ load: 225, reps: 8, rpe: null });
    assert.equal(result, 285);
  });

  it('100×10 @ RPE 7 caps effective reps at 12 → e1rm 140', () => {
    const result = estimateE1RM({ load: 100, reps: 10, rpe: 7 });
    assert.equal(result, 140);
  });

  it('returns null for zero load or reps', () => {
    assert.equal(estimateE1RM({ load: 0, reps: 5, rpe: 8 }), null);
    assert.equal(estimateE1RM({ load: 100, reps: 0, rpe: 8 }), null);
  });

  it('reps 1 @ RPE 10 → e1rm equals load', () => {
    assert.equal(estimateE1RM({ load: 275, reps: 1, rpe: 10 }), 275);
  });
});

describe('resolveExerciseKey', () => {
  it('Skull Crusher → tr03', () => {
    assert.deepEqual(resolveExerciseKey('Skull Crusher'), {
      key: 'tr03',
      libraryId: 'tr03',
    });
  });

  it('Barbell Bench Press → c01', () => {
    assert.deepEqual(resolveExerciseKey('Barbell Bench Press'), {
      key: 'c01',
      libraryId: 'c01',
    });
  });

  it('CABLE FLY (LOW TO HIGH) → c05b', () => {
    assert.deepEqual(resolveExerciseKey('CABLE FLY (LOW TO HIGH) '), {
      key: 'c05b',
      libraryId: 'c05b',
    });
  });

  it('unknown exercise → name slug', () => {
    assert.deepEqual(resolveExerciseKey('Cossack Squat Iso Hold'), {
      key: 'name:cossack_squat_iso_hold',
      libraryId: null,
    });
  });
});

describe('plausibility exclusion at recompute', () => {
  const lateralRaiseRow = {
    workout_log_id: 'log-1',
    source: 'workout' as const,
    set_number: 1,
    exercise_name: 'Dumbbell Lateral Raise',
    weight_lbs: 150,
    reps: 10,
    rpe: 8,
    is_timed: false,
    logged_at: '2026-01-01T10:00:00.000Z',
  };

  it('historical set with no status over ceiling → excluded', () => {
    assert.equal(
      shouldExcludeSetFromRecords({
        ...lateralRaiseRow,
        plausibility_status: 'ok',
      }),
      true,
    );
  });

  it('same set over ceiling with confirmed status → included', () => {
    assert.equal(
      shouldExcludeSetFromRecords({
        ...lateralRaiseRow,
        plausibility_status: 'confirmed',
      }),
      false,
    );
  });

  it('unresolved name over any weight → included (no ceiling)', () => {
    assert.equal(
      shouldExcludeSetFromRecords({
        ...lateralRaiseRow,
        exercise_name: 'Cossack Squat Iso Hold',
        weight_lbs: 9999,
        plausibility_status: 'ok',
      }),
      false,
    );
  });
});

describe('recompute exclusion + aggregation rules', () => {
  const baseRow = {
    workout_log_id: 'log-1',
    source: 'workout' as const,
    set_number: 1,
    exercise_name: 'Barbell Bench Press',
    weight_lbs: 225,
    reps: 5,
    rpe: 8,
    plausibility_status: 'ok',
    is_timed: false,
    logged_at: '2026-01-01T10:00:00.000Z',
  };

  it('excludes flagged and isTimed sets', () => {
    assert.equal(
      shouldExcludeSetFromRecords({ ...baseRow, plausibility_status: 'flagged' }),
      true,
    );
    assert.equal(
      shouldExcludeSetFromRecords({ ...baseRow, is_timed: true }),
      true,
    );
    assert.equal(shouldExcludeSetFromRecords(baseRow), false);
  });

  it('uses earliest qualifying set as baseline and highest e1RM as best', () => {
    const record = computeExerciseRecordFromQualifyingSets('user-1', 'c01', [
      {
        ...baseRow,
        workout_log_id: 'log-early',
        set_number: 1,
        weight_lbs: 200,
        reps: 5,
        rpe: 8,
        logged_at: '2026-01-01T10:00:00.000Z',
      },
      {
        ...baseRow,
        workout_log_id: 'log-flagged',
        set_number: 1,
        weight_lbs: 500,
        reps: 1,
        plausibility_status: 'flagged',
        logged_at: '2026-01-03T10:00:00.000Z',
      },
      {
        ...baseRow,
        workout_log_id: 'log-heavy',
        set_number: 1,
        weight_lbs: 255,
        reps: 3,
        rpe: 10,
        logged_at: '2026-01-05T10:00:00.000Z',
      },
      {
        ...baseRow,
        workout_log_id: 'log-best',
        set_number: 2,
        weight_lbs: 225,
        reps: 8,
        rpe: null,
        logged_at: '2026-01-06T10:00:00.000Z',
      },
    ]);

    assert.ok(record);
    assert.equal(record!.best_workout_log_id, 'log-best');
    assert.equal(record!.best_set_number, 2);
    assert.equal(record!.best_source, 'workout');
    assert.equal(record!.best_load, 225);
    assert.equal(record!.best_reps, 8);
    assert.equal(record!.best_e1rm, 285);
    assert.equal(record!.baseline_e1rm, estimateE1RM({ load: 200, reps: 5, rpe: 8 }));
    assert.equal(record!.baseline_date, '2026-01-01');
    assert.equal(record!.display_name, 'Barbell Bench Press');
  });

  it('breaks baseline ties by lowest setNumber on the same log date', () => {
    const record = computeExerciseRecordFromQualifyingSets('user-1', 'c01', [
      {
        ...baseRow,
        workout_log_id: 'log-1',
        set_number: 3,
        weight_lbs: 185,
        reps: 8,
        logged_at: '2026-01-01T10:00:00.000Z',
      },
      {
        ...baseRow,
        workout_log_id: 'log-1',
        set_number: 1,
        weight_lbs: 135,
        reps: 10,
        logged_at: '2026-01-01T10:00:00.000Z',
      },
    ]);

    assert.ok(record);
    assert.equal(record!.baseline_e1rm, estimateE1RM({ load: 135, reps: 10, rpe: 8 }));
    assert.equal(record!.best_set_number, 3);
  });

  it('baseline spans workout_logs and free_sessions by earliest logged_at', () => {
    const record = computeExerciseRecordFromQualifyingSets('user-1', 'c01', [
      {
        ...baseRow,
        workout_log_id: 'free-1',
        source: 'free_session',
        set_number: 1,
        weight_lbs: 135,
        reps: 10,
        logged_at: '2025-12-01T10:00:00.000Z',
      },
      {
        ...baseRow,
        workout_log_id: 'log-1',
        set_number: 1,
        weight_lbs: 200,
        reps: 5,
        logged_at: '2026-01-01T10:00:00.000Z',
      },
    ]);

    assert.ok(record);
    assert.equal(record!.baseline_e1rm, estimateE1RM({ load: 135, reps: 10, rpe: 8 }));
    assert.equal(record!.baseline_date, '2025-12-01');
  });

  it('sets best_source from the table the best set came from', () => {
    const record = computeExerciseRecordFromQualifyingSets('user-1', 'c01', [
      {
        ...baseRow,
        workout_log_id: 'log-1',
        source: 'workout',
        weight_lbs: 200,
        reps: 5,
        logged_at: '2026-01-01T10:00:00.000Z',
      },
      {
        ...baseRow,
        workout_log_id: 'free-1',
        source: 'free_session',
        weight_lbs: 225,
        reps: 8,
        rpe: null,
        logged_at: '2026-01-02T10:00:00.000Z',
      },
    ]);

    assert.ok(record);
    assert.equal(record!.best_workout_log_id, 'free-1');
    assert.equal(record!.best_source, 'free_session');
  });

  it('returns null when no qualifying sets remain', () => {
    const record = computeExerciseRecordFromQualifyingSets('user-1', 'c01', [
      {
        ...baseRow,
        plausibility_status: 'flagged',
      },
    ]);
    assert.equal(record, null);
  });
});

describe('confirmSetInParsedSets', () => {
  it('flips flagged set to confirmed in parsed sets', () => {
    const sets = [
      {
        exerciseId: 'ex-1',
        exerciseName: 'Dumbbell Lateral Raise',
        setNumber: 1,
        weightLbs: 315,
        reps: 10,
        plausibility_status: 'flagged',
      },
    ];
    const { sets: nextSets, updated } = confirmSetInParsedSets(sets, 'ex-1', 1);
    assert.equal(updated.plausibility_status, 'confirmed');
    assert.equal(nextSets[0]?.plausibility_status, 'confirmed');
  });

  it('confirmed set over ceiling participates in records', () => {
    const lateralRaiseRow = {
      workout_log_id: 'log-1',
      source: 'workout' as const,
      set_number: 1,
      exercise_name: 'Dumbbell Lateral Raise',
      weight_lbs: 315,
      reps: 10,
      rpe: 8,
      is_timed: false,
      logged_at: '2026-01-01T10:00:00.000Z',
      plausibility_status: 'confirmed',
    };
    assert.equal(shouldExcludeSetFromRecords(lateralRaiseRow), false);
    const record = computeExerciseRecordFromQualifyingSets('user-1', 's03', [
      lateralRaiseRow,
    ]);
    assert.ok(record);
    assert.equal(record!.best_load, 315);
    assert.equal(record!.exercise_key, 's03');
  });
});

describe('updateSetInParsedSets', () => {
  it('re-evaluates plausibility when weight is corrected under ceiling', () => {
    const sets = [
      {
        exerciseId: 'ex-leg',
        exerciseName: 'Leg Extension',
        setNumber: 1,
        weightLbs: 700,
        reps: 10,
        plausibility_status: 'flagged',
      },
    ];
    const { updated } = updateSetInParsedSets(sets, 'ex-leg', 1, {
      weightLbs: 100,
      reps: 10,
    });
    assert.equal(updated.plausibility_status, 'ok');
    assert.equal(updated.weightLbs, 100);
  });

  it('corrected leg extension set participates in q04 records', () => {
    const record = computeExerciseRecordFromQualifyingSets('user-1', 'q04', [
      {
        workout_log_id: 'log-1',
        source: 'workout' as const,
        set_number: 1,
        exercise_name: 'Leg Extension',
        weight_lbs: 100,
        reps: 10,
        rpe: 8,
        is_timed: false,
        logged_at: '2026-01-01T10:00:00.000Z',
        plausibility_status: 'ok',
      },
    ]);
    assert.ok(record);
    assert.equal(record!.exercise_key, 'q04');
    assert.equal(record!.best_load, 100);
    assert.equal(record!.best_e1rm, estimateE1RM({ load: 100, reps: 10, rpe: 8 }));
  });
});

describe('plausibilityStatusForLoad on edit', () => {
  const exerciseName = 'Dumbbell Lateral Raise';

  it('ok × edit under ceiling → ok', () => {
    assert.equal(plausibilityStatusForLoad(exerciseName, 50), 'ok');
  });

  it('ok × edit over ceiling → flagged', () => {
    assert.equal(plausibilityStatusForLoad(exerciseName, 315), 'flagged');
  });

  it('flagged × edit under ceiling → ok', () => {
    assert.equal(plausibilityStatusForLoad(exerciseName, 50), 'ok');
  });

  it('flagged × edit over ceiling → flagged', () => {
    assert.equal(plausibilityStatusForLoad(exerciseName, 315), 'flagged');
  });

  it('confirmed × edit under ceiling → ok', () => {
    assert.equal(plausibilityStatusForLoad(exerciseName, 50), 'ok');
  });

  it('confirmed × edit over ceiling → flagged', () => {
    assert.equal(plausibilityStatusForLoad(exerciseName, 315), 'flagged');
  });
});

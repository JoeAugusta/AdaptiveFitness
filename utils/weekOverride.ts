import { supabase } from '../Lib/supabase';
import { getLocalDateString } from './dateUtils';
import { buildExerciseSwapCandidates } from './exerciseSwap';

export type WeekOverride = {
  type: 'travel' | 'deload';
  triggeredAt: string;
  appliedAt: 'manual';
  equipment?: string[];
  affectedDayNumbers: number[];
  snapshot: any[];
};

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

function findWeekInPlanJson(
  weeks: any[] | undefined,
  weekNumber: number,
): any | undefined {
  if (!Array.isArray(weeks) || weeks.length === 0) return undefined;
  const wn = Number(weekNumber);
  const match = weeks.find((w: any) => Number(w.weekNumber) === wn);
  if (match) return match;
  const idx = wn - 1;
  if (idx >= 0 && idx < weeks.length) return weeks[idx];
  return weeks[0];
}

export async function applyWeekOverride(params: {
  userId: string;
  planId: string;
  currentWeekNumber: number;
  type: 'deload' | 'travel';
  equipment?: string[];
}): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { data: planRow, error: readErr } = await supabase
      .from('plans')
      .select('plan_json')
      .eq('id', params.planId)
      .maybeSingle();

    if (readErr || !planRow?.plan_json) {
      return { ok: false, reason: readErr?.message ?? 'plan not found' };
    }

    const planJson = planRow.plan_json as Record<string, any>;
    const week = findWeekInPlanJson(planJson.weeks, params.currentWeekNumber);
    if (!week) return { ok: false, reason: 'week not found' };

    if (!week.weekNumber) week.weekNumber = params.currentWeekNumber;

    if (week.weekOverride) return { ok: false, reason: 'already_overridden' };

    const { data: logRows } = await supabase
      .from('workout_logs')
      .select('day_number')
      .eq('user_id', params.userId)
      .eq('plan_id', params.planId)
      .eq('week_number', params.currentWeekNumber);

    const loggedDayNumbers = new Set(
      (logRows ?? []).map((r: { day_number: number }) => r.day_number),
    );

    const workoutDays: any[] = (week.days ?? []).filter(
      (d: any) => d.type === 'workout',
    );
    const affectedDayNumbers = workoutDays
      .filter((d: any) => !loggedDayNumbers.has(d.dayNumber))
      .map((d: any) => d.dayNumber as number);

    if (affectedDayNumbers.length === 0) {
      return { ok: false, reason: 'no_unlogged_workouts' };
    }

    // Snapshot is taken from week.days directly so it captures the live objects.
    const snapshotSource = (week.days as any[]).filter((d: any) =>
      affectedDayNumbers.includes(d.dayNumber),
    );
    const snapshot = structuredClone(snapshotSource);

    if (params.type === 'deload') {
      // Mutate in place on week.days so the changes are visible in planJson
      // when it is serialised and written to Supabase.
      for (const day of week.days as any[]) {
        if (!affectedDayNumbers.includes(day.dayNumber)) continue;
        if (day.type !== 'workout') continue;
        for (const ex of day.exercises ?? []) {
          const tw = Number(ex.targetWeight ?? 0);
          if (tw > 0) ex.preDeloadTargetWeight = tw;
          ex.preDeloadSetTargets =
            Array.isArray(ex.setTargets) ? structuredClone(ex.setTargets) : null;
          ex.preDeloadSets = ex.sets ?? 3;

          if (Array.isArray(ex.setTargets) && ex.setTargets.length > 0) {
            ex.setTargets = ex.setTargets.map((st: any) => ({
              ...st,
              targetWeight: roundTo5(Number(st.targetWeight ?? 0) * 0.85),
            }));
            ex.targetWeight = Math.max(
              ...ex.setTargets.map((st: any) => Number(st.targetWeight ?? 0)),
            );
          } else if (tw > 0) {
            ex.targetWeight = roundTo5(tw * 0.85);
          }

          ex.sets = Math.max(2, (ex.sets ?? 3) - 1);
        }
      }
    } else {
      // Travel mode: attempt equipment-legal swap for each affected exercise.
      const equipment = params.equipment ?? [];
      for (const day of week.days as any[]) {
        if (!affectedDayNumbers.includes(day.dayNumber)) continue;
        if (day.type !== 'workout') continue;
        for (const ex of day.exercises ?? []) {
          // Already compatible — no swap needed
          if (equipment.includes(ex.equipment ?? '')) continue;

          const candidates = buildExerciseSwapCandidates(
            ex.name,
            ex.muscleGroup ?? '',
          );
          const legalCandidate = candidates.find(
            (c) =>
              equipment.includes(c.equipmentType) ||
              (c.isBodyweight && equipment.includes('bodyweight')),
          );
          if (legalCandidate) {
            ex.travelSwap = {
              originalName: ex.name,
              originalEquipment: ex.equipment,
            };
            ex.name = legalCandidate.name;
            ex.equipment = legalCandidate.equipmentType;
            ex.targetWeight = 0;
            ex.setTargets = undefined;
            ex.coachingNote = `Travel swap: no prior weight on file. Choose a weight that lands at RPE ${ex.targetRpe ?? 7}.`;
          } else {
            ex.travelFlag = 'no_equipment_match';
            console.log('[TRAVEL SWAP MISS]', { name: ex.name, equipment });
          }
        }
      }
    }

    week.weekOverride = {
      type: params.type,
      triggeredAt: getLocalDateString(),
      appliedAt: 'manual' as const,
      ...(params.type === 'travel' && params.equipment
        ? { equipment: params.equipment }
        : {}),
      affectedDayNumbers,
      snapshot,
    };

    const { error: writeErr } = await supabase
      .from('plans')
      .update({ plan_json: planJson })
      .eq('id', params.planId);

    if (writeErr) return { ok: false, reason: writeErr.message };

    console.log('[WEEKOVERRIDE]', {
      type: params.type,
      affectedDayNumbers,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? String(e) };
  }
}

export async function clearWeekOverride(params: {
  planId: string;
  currentWeekNumber: number;
}): Promise<{ ok: boolean }> {
  try {
    const { data: planRow, error: readErr } = await supabase
      .from('plans')
      .select('plan_json')
      .eq('id', params.planId)
      .maybeSingle();

    if (readErr || !planRow?.plan_json) return { ok: false };

    const planJson = planRow.plan_json as Record<string, any>;
    const week = findWeekInPlanJson(planJson.weeks, params.currentWeekNumber);
    if (!week?.weekOverride) return { ok: false };

    const override = week.weekOverride as WeekOverride;
    const snapshotByDay = new Map<number, any>();
    for (const daySnap of override.snapshot ?? []) {
      snapshotByDay.set(daySnap.dayNumber, daySnap);
    }

    const days = week.days as any[];
    for (let i = 0; i < days.length; i++) {
      const restored = snapshotByDay.get(days[i].dayNumber);
      if (restored) days[i] = restored;
    }

    delete week.weekOverride;

    const { error: writeErr } = await supabase
      .from('plans')
      .update({ plan_json: planJson })
      .eq('id', params.planId);

    if (writeErr) return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

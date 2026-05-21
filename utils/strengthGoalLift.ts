/** Client-side duplicate of `_shared/setStructure` — avoids bundling Supabase Edge paths. */

function normalizeGoalLiftId(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === '') return '';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_');
}

function goalLiftDisplaySubstring(goalLift: string): string {
  const k = normalizeGoalLiftId(goalLift);
  const map: Record<string, string> = {
    barbell_bench_press: 'bench press',
    bench_press: 'bench press',
    barbell_squat: 'squat',
    squat: 'squat',
    back_squat: 'squat',
    deadlift: 'deadlift',
    sumo_deadlift: 'sumo deadlift',
    overhead_press: 'overhead press',
    ohp: 'overhead press',
    weighted_pull_up: 'pull-up',
    weighted_pullup: 'pull-up',
    barbell_row: 'barbell row',
  };
  if (map[k]) return map[k];
  return k.replace(/_/g, ' ').toLowerCase();
}

/** Matches server `isStrengthGoalTargetLift` for adaptation copy routing. */
export function isStrengthProgramTargetLiftExercise(
  exercise: { id?: string; name?: string; exerciseName?: string },
  goalLiftRaw: string | null | undefined,
): boolean {
  const goalLift = normalizeGoalLiftId(goalLiftRaw);
  if (!goalLift) return false;

  const exId =
    normalizeGoalLiftId(exercise?.id ?? '') ||
    normalizeGoalLiftId((exercise as { exercise_id?: string }).exercise_id ?? '');
  if (exId && (exId === goalLift || exId.endsWith(goalLift) || goalLift.endsWith(exId))) {
    return true;
  }

  const n = String(exercise?.name ?? exercise?.exerciseName ?? '').toLowerCase();
  const key = goalLift;

  if (key.includes('bench') || goalLiftDisplaySubstring(goalLiftRaw ?? '') === 'bench press') {
    return (
      n.includes('bench') &&
      n.includes('press') &&
      !n.includes('incline') &&
      !n.includes('decline')
    );
  }
  if (key === 'ohp' || key.includes('overhead') || key === 'overhead_press') {
    return n.includes('overhead') || n.includes('ohp') || n.includes('military');
  }
  if (
    key === 'weighted_pullup' ||
    key === 'weighted_pull_up' ||
    (key.includes('pull') && key.includes('up'))
  ) {
    return (
      n.includes('pull-up') ||
      n.includes('pullup') ||
      n.includes('chin-up') ||
      n.includes('chinup')
    );
  }
  if (key.includes('squat')) {
    if (key.includes('front')) return n.includes('front') && n.includes('squat');
    return (
      (n.includes('squat') || n.includes('back squat')) &&
      !n.includes('front squat') &&
      !n.includes('goblet') &&
      !n.includes('bulgarian') &&
      !n.includes('split') &&
      !n.includes('hack')
    );
  }
  if (key.includes('sumo') && key.includes('deadlift')) {
    return n.includes('sumo') && (n.includes('deadlift') || n.includes('dead lift'));
  }
  if (key === 'deadlift' || key.includes('deadlift')) {
    if (key.includes('sumo')) {
      return n.includes('sumo') && (n.includes('deadlift') || n.includes('dead lift'));
    }
    return (
      (n.includes('deadlift') || n.includes('dead lift')) &&
      !n.includes('sumo') &&
      !n.includes('romanian') &&
      !n.includes('rdl')
    );
  }

  const needle = goalLiftDisplaySubstring(goalLiftRaw ?? '');
  return needle.length >= 3 && n.includes(needle);
}

/** Round positive prescribed loads to nearest 5 lb; 0 = self-select, untouched. */
export function roundLoadToFive(weight: number): number {
  if (!Number.isFinite(weight) || weight <= 0) return weight;
  return Math.round(weight / 5) * 5;
}

type LoadChange = { path: string; from: number; to: number };

// deno-lint-ignore no-explicit-any
export function normalizeLoads(plan: any): any {
  const changes: LoadChange[] = [];
  const weeks = plan?.weeks;
  if (!Array.isArray(weeks)) return plan;

  const newWeeks = weeks.map((week: any, wi: number) => {
    if (!week?.days || !Array.isArray(week.days)) return week;
    return {
      ...week,
      days: week.days.map((day: any, di: number) => {
        if (!Array.isArray(day.exercises)) return day;
        return {
          ...day,
          exercises: day.exercises.map((ex: any, ei: number) => {
            let exOut = { ...ex };
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

  if (changes.length > 0) {
    console.warn('[load-normalize]', {
      count: changes.length,
      examples: changes.slice(0, 5),
    });
  }

  return { ...plan, weeks: newWeeks };
}

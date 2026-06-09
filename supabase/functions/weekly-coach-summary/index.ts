// SETUP REQUIRED:
// Run this once in your terminal to set the API key as a Supabase secret:
//   supabase secrets set ANTHROPIC_API_KEY=your_key_here
// Never commit your API key. Never put it in .env for client use.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchAnthropicMessagesWithRetry } from '../_shared/anthropicRetry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getJordanToneTier(weeks: number): 'newcomer' | 'building' | 'established' | 'veteran' {
  if (weeks <= 1) return 'newcomer';
  if (weeks <= 4) return 'building';
  if (weeks <= 8) return 'established';
  return 'veteran';
}

function parseMidReps(reps: string): number {
  const parts = reps.split('-');
  if (parts.length === 2) {
    return (parseInt(parts[0]) + parseInt(parts[1])) / 2;
  }
  return parseInt(reps) || 0;
}

function formatSportUnderscoreTitle(s: string): string {
  return s
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function metForSportIntensity(intensity: string): number {
  const i = String(intensity).toLowerCase();
  if (i === 'low') return 4.0;
  if (i === 'moderate') return 7.0;
  if (i === 'high') return 10.0;
  return 7.0;
}

function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Monday (UTC) of the ISO week containing `d`. */
function startOfIsoWeekMondayUtc(d: Date): Date {
  const x = utcDateOnly(d);
  const dow = x.getUTCDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  x.setUTCDate(x.getUTCDate() - daysFromMonday);
  return x;
}

function endOfIsoWeekSundayUtc(mondayUtc: Date): Date {
  const x = new Date(mondayUtc);
  x.setUTCDate(x.getUTCDate() + 6);
  return x;
}

function dateStrYmdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Calendar span covering all workout log dates (Monday–Sunday weeks, UTC). */
function sportWeekBoundsFromWorkoutLogs(logs: any[]): { weekStartDate: string; weekEndDate: string } {
  const logTimes = logs
    .map((l: any) => (l.logged_at ? new Date(l.logged_at as string).getTime() : NaN))
    .filter((t: number) => !Number.isNaN(t));
  const times = logTimes.length > 0 ? logTimes : [Date.now()];
  const minD = new Date(Math.min(...times));
  const maxD = new Date(Math.max(...times));
  const start = startOfIsoWeekMondayUtc(minD);
  const end = endOfIsoWeekSundayUtc(startOfIsoWeekMondayUtc(maxD));
  return { weekStartDate: dateStrYmdUtc(start), weekEndDate: dateStrYmdUtc(end) };
}

function primarySportDisplayName(planJson: any, sportLogs: { sport_type?: string }[]): string {
  const cs = planJson?.concurrentSport;
  if (cs && typeof cs === 'object' && Array.isArray(cs.type) && cs.type[0]) {
    return formatSportUnderscoreTitle(String(cs.type[0]));
  }
  const st = sportLogs[0]?.sport_type;
  if (st) {
    try {
      const o = JSON.parse(String(st)) as { type?: string[] };
      if (Array.isArray(o.type) && o.type[0]) {
        return formatSportUnderscoreTitle(String(o.type[0]));
      }
    } catch {
      /* raw key */
    }
    return formatSportUnderscoreTitle(String(st));
  }
  return 'Sport';
}

function intensityBreakdownSummary(sportLogs: { intensity?: string }[]): string {
  let low = 0;
  let moderate = 0;
  let high = 0;
  for (const row of sportLogs) {
    const i = String(row.intensity ?? '').toLowerCase();
    if (i === 'low') low++;
    else if (i === 'moderate') moderate++;
    else if (i === 'high') high++;
  }
  const parts: string[] = [];
  if (low) parts.push(`${low} × Low`);
  if (moderate) parts.push(`${moderate} × Moderate`);
  if (high) parts.push(`${high} × High`);
  return parts.length > 0 ? parts.join(', ') : '—';
}

/** Session-wide average RPE from all logged sets (for deload interpretation). */
function calculateAvgRpeFromLogs(logs: any[]): number {
  let sum = 0;
  let n = 0;
  for (const log of logs) {
    const setsJson = log.sets_json ?? [];
    if (!Array.isArray(setsJson)) continue;
    for (const set of setsJson) {
      const r = Number(set.rpe ?? set.loggedRpe ?? 0);
      if (r > 0) {
        sum += r;
        n++;
      }
    }
  }
  return n > 0 ? sum / n : 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, planId, weekNumber } = await req.json();

    if (!userId || !planId || weekNumber == null) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, planId, weekNumber' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    // Step 1 — Fetch plan row and workout_logs from Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const [planResult, logsResult, profileResult] = await Promise.all([
      supabase.from('plans').select('plan_json, goal_id, start_date').eq('id', planId).single(),
      supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_id', planId)
        .eq('week_number', weekNumber),
      supabase.from('user_profiles').select('weight_lbs').eq('user_id', userId).maybeSingle(),
    ]);

    if (planResult.error) throw new Error(`Failed to fetch plan: ${planResult.error.message}`);
    if (logsResult.error) throw new Error(`Failed to fetch workout logs: ${logsResult.error.message}`);

    const planJson = planResult.data.plan_json;
    const logs = logsResult.data ?? [];

    // Session notes typed by athlete in post-workout fatigue modal
    // These are passed to Jordan so injuries, soreness, or context can inform the summary
    const sessionNotesThisWeek: string[] = (logsResult.data ?? [])
      .map((l: any) => String(l.notes ?? '').trim())
      .filter((n: string) => n.length > 0);

    // Fetch goal type
    let goalType = planJson.goal ?? 'general';
    if (planResult.data.goal_id) {
      const { data: goalRow } = await supabase
        .from('goals')
        .select('goal_type')
        .eq('id', planResult.data.goal_id)
        .single();
      if (goalRow?.goal_type) goalType = goalRow.goal_type;
    }

    const { weekStartDate, weekEndDate } = sportWeekBoundsFromWorkoutLogs(logs);
    const profileRow = profileResult.error ? null : profileResult.data;
    const weightLbsNum = Number(profileRow?.weight_lbs ?? 0);
    const weightKgForSport = (weightLbsNum > 0 ? weightLbsNum : 175) / 2.20462;

    const readinessLogs = await supabase
      .from('weight_logs')
      .select('readiness_score, log_date')
      .eq('user_id', userId)
      .gte('log_date', weekStartDate)
      .lte('log_date', weekEndDate)
      .not('readiness_score', 'is', null);

    const readinessScores = (readinessLogs.data ?? [])
      .map((r: any) => Number(r.readiness_score))
      .filter((n: number) => n >= 1 && n <= 5);

    const avgReadinessScore =
      readinessScores.length > 0
        ? Math.round((readinessScores.reduce((a: number, b: number) => a + b, 0) / readinessScores.length) * 10) / 10
        : null;

    const readinessDaysLogged = readinessScores.length;

    const { data: sportLogsRaw, error: sportLogsError } = await supabase
      .from('sport_logs')
      .select('duration_min, intensity, sport_type')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .gte('logged_at', weekStartDate)
      .lte('logged_at', weekEndDate);
    if (sportLogsError) console.error('sport_logs fetch error:', sportLogsError.message);
    const sportLogs = sportLogsRaw ?? [];

    let totalSportCalsRaw = 0;
    for (const row of sportLogs) {
      const dur = Number((row as { duration_min?: number }).duration_min ?? 0);
      if (dur <= 0) continue;
      const met = metForSportIntensity(String((row as { intensity?: string }).intensity ?? ''));
      totalSportCalsRaw += met * weightKgForSport * (dur / 60);
    }
    const totalSportCalsBurned = Math.round(totalSportCalsRaw / 50) * 50;

    const sportDisplayName = primarySportDisplayName(planJson, sportLogs);
    const intensitySummary = intensityBreakdownSummary(sportLogs);

    let adjustmentCopy = '';
    let sportCalorieNudge: string | null = null;
    const goalKey = String(goalType).toLowerCase();
    const isFatLoss = goalKey === 'fat_loss';
    const isHypertrophyGroup =
      goalKey === 'hypertrophy' || goalKey === 'strength' || goalKey === 'power_hypertrophy';
    const isRecompGeneral = goalKey === 'recomp' || goalKey === 'general';

    if (sportLogs.length > 0 && totalSportCalsBurned >= 300) {
      if (isFatLoss) {
        if (totalSportCalsBurned >= 600) {
          adjustmentCopy =
            `Your sport sessions burned an estimated ${totalSportCalsBurned} calories this week. Consider adding 150 calories on your hardest training day to support recovery without disrupting your deficit.`;
          sportCalorieNudge = adjustmentCopy;
        } else {
          adjustmentCopy =
            'Sport volume this week fits your deficit focus; no daily calorie increase recommended.';
        }
      } else if (isHypertrophyGroup) {
        const addCals =
          totalSportCalsBurned >= 900 ? 500 : totalSportCalsBurned >= 600 ? 350 : 200;
        adjustmentCopy =
          `Your ${sportDisplayName} sessions added ~${totalSportCalsBurned} calories of burn this week. I'd add ${addCals} calories to your daily target this week to protect your muscle-building surplus.`;
        sportCalorieNudge = adjustmentCopy;
      } else if (isRecompGeneral) {
        const addCals = totalSportCalsBurned >= 600 ? 250 : 150;
        adjustmentCopy =
          `Your ${sportDisplayName} sessions burned ~${totalSportCalsBurned} calories. Adding ${addCals} calories this week keeps you close to maintenance and supports recovery.`;
        sportCalorieNudge = adjustmentCopy;
      } else {
        const addCals = totalSportCalsBurned >= 600 ? 250 : 150;
        adjustmentCopy =
          `Your ${sportDisplayName} sessions burned ~${totalSportCalsBurned} calories. Adding ${addCals} calories this week keeps you close to maintenance and supports recovery.`;
        sportCalorieNudge = adjustmentCopy;
      }
    }

    if (isFatLoss && totalSportCalsBurned < 600) {
      sportCalorieNudge = null;
    }

    const sportContext =
      sportLogs.length === 0
        ? 'No sport sessions logged this week.'
        : `Sport sessions this week: ${sportLogs.length} session(s) of ${sportDisplayName}.
Total estimated burn: ${totalSportCalsBurned} calories.
Intensity breakdown: ${intensitySummary}.
${adjustmentCopy}`.trim();

    const sessionNotesContext =
      sessionNotesThisWeek.length > 0
        ? `ATHLETE SESSION NOTES THIS WEEK:\n${sessionNotesThisWeek.map((n, i) => `Session ${i + 1}: "${n}"`).join('\n')}\nJordan must reference relevant notes in the summary — especially any mention of pain, injury, discomfort, or unusual fatigue. If a note mentions an injury or physical issue, it must appear in nextWeekChanges with a specific adjustment.`
        : '';

    // Build exercise id → name map from all weeks in plan_json
    const exerciseMap: Record<string, string> = {};
    for (const week of planJson.weeks ?? []) {
      for (const day of week.days ?? []) {
        for (const ex of day.exercises ?? []) {
          if (ex.id && ex.name) {
            exerciseMap[ex.id] = ex.name;
          }
        }
      }
    }

    // Step 2 — Find the matching week and extract workout day targets
    const weekData = (planJson.weeks ?? []).find((w: any) => w.weekNumber === weekNumber);
    const workoutDays = (weekData?.days ?? []).filter((d: any) => d.type === 'workout');
    const daysPerWeek: number = planJson.daysPerWeek ?? workoutDays.length;

    type ExerciseTarget = { targetWeight: number; targetRpe: number; targetReps: number };
    const prescribedMap: Record<string, ExerciseTarget> = {};
    for (const day of workoutDays) {
      for (const ex of day.exercises ?? []) {
        prescribedMap[ex.name] = {
          targetWeight: ex.targetWeight ?? 0,
          targetRpe: ex.targetRpe ?? 0,
          targetReps: parseMidReps(ex.reps ?? '0'),
        };
      }
    }

    // Step 3 — Compute performance metrics
    const sessionsCompleted = new Set(logs.map((l: any) => l.day_number)).size;

    // Late-start W1 detection: if the plan started mid-week, count only the
    // scheduled training days that fell on or after the plan start_date.
    // This prevents a Friday starter from being flagged as "Tough Week" for 1/3.
    let sessionsPlanned = daysPerWeek;
    if (weekNumber === 1 && planResult.data.start_date && planJson.scheduledDays && Array.isArray(planJson.scheduledDays)) {
      const startDate = new Date(planResult.data.start_date + 'T12:00:00');
      const startDayLabel = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][startDate.getDay()];
      const normalized = (planJson.scheduledDays as string[]).map((d: string) => d.trim().slice(0, 3));
      const startIndex = normalized.indexOf(startDayLabel);
      if (startIndex > 0) {
        // User started after the first scheduled day — only count days from startIndex onward
        sessionsPlanned = normalized.length - startIndex;
      }
    }

    const completionRate = sessionsPlanned > 0 ? sessionsCompleted / sessionsPlanned : 0;

    const fatigueRatings = logs
      .map((l: any) => l.session_fatigue_rating)
      .filter((r: any) => r != null && !isNaN(Number(r)))
      .map(Number);
    const avgFatigueRating =
      fatigueRatings.length > 0
        ? fatigueRatings.reduce((a: number, b: number) => a + b, 0) / fatigueRatings.length
        : 0;

    const exercisesOverPerformed: string[] = [];
    const exercisesUnderPerformed: string[] = [];
    const exercisesTooLight: string[] = []; // completed with very low RPE
    const prsHit: string[] = [];
    const rpeDeltas: number[] = [];

    type ActualData = {
      totalWeight: number;
      totalReps: number;
      totalRpe: number;
      count: number;
      maxWeight: number;
    };
    const actualMap: Record<string, ActualData> = {};

    for (const log of logs) {
      const setsJson: any[] = log.sets_json ?? [];
      for (const set of setsJson) {
        // FIX: resolve name via exerciseId map first, then fallbacks
        const name: string =
          (set.exerciseId ? exerciseMap[set.exerciseId] : null) ??
          set.exerciseName ??
          set.name ??
          '';
        if (!name) continue;
        if (!actualMap[name]) {
          actualMap[name] = { totalWeight: 0, totalReps: 0, totalRpe: 0, count: 0, maxWeight: 0 };
        }
        // FIX: use weightLbs (the actual field name in sets_json), not weight
        const weight = Number(set.weightLbs ?? set.weight ?? set.loggedWeight ?? 0);
        const reps = Number(set.reps ?? set.loggedReps ?? 0);
        const rpe = Number(set.rpe ?? set.loggedRpe ?? 0);
        actualMap[name].totalWeight += weight;
        actualMap[name].totalReps += reps;
        actualMap[name].totalRpe += rpe;
        actualMap[name].count += 1;
        if (weight > actualMap[name].maxWeight) actualMap[name].maxWeight = weight;
      }
    }

    for (const [name, actual] of Object.entries(actualMap)) {
      const prescribed = prescribedMap[name];
      if (!prescribed) continue;

      const avgReps = actual.count > 0 ? actual.totalReps / actual.count : 0;
      const avgWeight = actual.count > 0 ? actual.totalWeight / actual.count : 0;
      const avgRpe = actual.count > 0 ? actual.totalRpe / actual.count : 0;

      // Over-performed: exceeded reps or weight targets
      if (avgReps > prescribed.targetReps * 1.1 || avgWeight > prescribed.targetWeight * 1.05) {
        exercisesOverPerformed.push(name);
      }

      // Under-performed: fell short on reps or weight
      if (
        avgReps < prescribed.targetReps * 0.85 ||
        avgWeight < prescribed.targetWeight * 0.9
      ) {
        exercisesUnderPerformed.push(name);
      }

      // Too light: completed sets but RPE was well below target
      // This means the weight needs to go UP, NOT that it was a bad week
      if (prescribed.targetRpe > 0 && avgRpe > 0 && avgRpe <= prescribed.targetRpe - 2) {
        exercisesTooLight.push(name);
      }

      if (actual.maxWeight > prescribed.targetWeight * 1.05) {
        prsHit.push(name);
      }

      // RPE delta: positive = harder than target, negative = easier than target
      if (prescribed.targetRpe > 0 && avgRpe > 0) {
        rpeDeltas.push(avgRpe - prescribed.targetRpe);
      }
    }

    const stagnantExercises = Object.entries(actualMap)
      .filter(([name, actual]) => {
        const prescribed = prescribedMap[name];
        if (!prescribed || actual.count === 0) return false;
        const avgWeight = actual.totalWeight / actual.count;
        const rpeOnTarget = actual.totalRpe / actual.count;
        return (
          avgWeight === prescribed.targetWeight &&
          rpeOnTarget >= prescribed.targetRpe - 1 &&
          rpeOnTarget <= prescribed.targetRpe + 1
        );
      })
      .map(([name]) => name);

    const avgRpeVsTarget =
      rpeDeltas.length > 0
        ? rpeDeltas.reduce((a, b) => a + b, 0) / rpeDeltas.length
        : 0;

    const rpeDataRecorded = rpeDeltas.length > 0;
    const isDeloadWeek =
      String(weekData?.phase ?? '').toLowerCase() === 'deload';
    const avgLoggedRpe = calculateAvgRpeFromLogs(logs);

    // Determine performance rating correctly
    // Negative avgRpeVsTarget = weights were too light = NOT a tough week
    let derivedRating: 'strong' | 'on-track' | 'tough-week';
    if (completionRate < 0.6) {
      derivedRating = 'tough-week'; // missed too many sessions
    } else if (avgRpeVsTarget > 1.5 && exercisesUnderPerformed.length > 2) {
      derivedRating = 'tough-week'; // genuinely struggled
    } else if (avgRpeVsTarget < -1 || exercisesTooLight.length > 2) {
      derivedRating = 'on-track'; // easy week — weights need adjustment, not a failure
    } else if (completionRate >= 0.8 && avgRpeVsTarget >= -1 && avgRpeVsTarget <= 1.5) {
      derivedRating = 'strong'; // completed sessions, RPE on target
    } else {
      derivedRating = 'on-track';
    }

    const metrics = {
      sessionsCompleted,
      sessionsPlanned,
      completionRate: Math.round(completionRate * 100) / 100,
      avgFatigueRating: Math.round(avgFatigueRating * 10) / 10,
      exercisesOverPerformed,
      exercisesUnderPerformed,
      exercisesTooLight,
      stagnantExercises,
      prsHit,
      avgRpeVsTarget: Math.round(avgRpeVsTarget * 10) / 10,
      rpeDataRecorded, // true = user logged RPE, false = no RPE data
      isDeloadWeek,
      avgLoggedRpe: Math.round(avgLoggedRpe * 10) / 10,
      derivedRating, // pre-calculated — Claude should use this as the basis
      avgReadinessScore,        // null if not logged, 1.0–5.0 if logged
      readinessDaysLogged,      // how many days this week the user checked in
    };

    const completedWeeks =
      (planJson as { currentWeek?: number }).currentWeek ?? weekNumber ?? 1;
    const toneTier = getJordanToneTier(completedWeeks);
    const summaryToneInstructionMap: Record<string, string> = {
      newcomer: `JORDAN SUMMARY TONE — NEW:
This is one of the athlete's first weekly reviews. Be clear and encouraging.
- Explain what the data means in plain terms (what does avg RPE 7.2 tell us?)
- Acknowledge that Week 1-2 is calibration — variability is expected
- End with a specific, concrete forward action for next week
- Warm tone. This is the review that determines whether they trust the system.`,

      building: `JORDAN SUMMARY TONE — BUILDING:
The athlete is starting to see results. Reference their actual numbers freely.
- Compare this week to last week with specific figures
- Acknowledge momentum if it exists — or name the stall if it doesn't
- Less explanation, more observation
- End with a specific adaptation and why it's happening`,

      established: `JORDAN SUMMARY TONE — ESTABLISHED:
The athlete has enough history to see patterns. Reference them.
- Lead with the most significant data point of the week
- Reference multi-week trends where they exist
- No boilerplate — every sentence should contain information specific to this athlete
- Tone: a coach who knows their athlete well and respects their time`,

      veteran: `JORDAN SUMMARY TONE — VETERAN:
Data-first, peer-level review. This athlete doesn't need hand-holding.
- Open with the most important number of the week, no preamble
- Reference the full arc of their training where relevant
- Observations over encouragement — they've earned directness
- If something went wrong, say it plainly and say what changes
- Maximum density. Every sentence earns its place.`,
    };
    const summaryToneInstruction =
      summaryToneInstructionMap[toneTier] ?? summaryToneInstructionMap.newcomer;

    const deloadPerformanceOverrideBlock = isDeloadWeek
      ? `

DELOAD WEEK PERFORMANCE OVERRIDE:
THIS WAS A DELOAD WEEK (phase on plan). Override all normal completion-based performance rating logic for deload weeks.

Rate deload execution using avgLoggedRpe from the metrics (average RPE across all logged sets this week):
- avgLoggedRpe <= 7: Deload executed well — recovery is on track for next week. Appropriate headline and performanceRating.
- avgLoggedRpe > 7: Deload ran too hot — effort was higher than intended. The point of a deload is to let the body recover. High RPE in a deload week means the recovery benefit is reduced. performanceSummary must reflect this honestly; do NOT praise "consistency" or completion if sets were crushed at RPE 9.

Do NOT reference session completion rate as a positive when avgLoggedRpe > 7 in a deload week. Completing every set at RPE 9 in a deload is poor execution, not good consistency.
`
      : '';

    // Step 4 — Call Claude API
    const claudeResponse = await fetchAnthropicMessagesWithRetry(() =>
      fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: `${summaryToneInstruction}

You are Jordan, the athlete's personal coach. You have their full week of training data. Write their weekly debrief.

Your response must be a JSON object with these exact fields:
{
  "headline": "Max 8 words. Punchy. No filler. No em-dashes. Examples: 'Six PRs. Baseline locked.' or 'Missed sessions — back to it.' or 'Clean week. Loads go up.'",
  "performanceRating": "strong | on-track | tough-week",
  "highlights": ["Array of 2-3 strings. Each is ONE short sentence. Lead with a number or metric. Do not list exercise names — summarise the pattern instead. Examples: '6 personal bests across all tracked exercises.' or '5 of 5 sessions completed.' or 'Average RPE 6.8, sitting 0.4 below target.'"],
  "performanceSummary": "2 sentences maximum. Jordan's honest read of the week. One observation, one implication. No more.",
  "nextWeekChanges": "2 sentences maximum. What is changing and the single most important reason why. Be specific but brief.",
  "nutritionCheckin": "1-2 sentences on macro targets. Keep brief.",
  "motivationalNote": "1 sentence max. Specific to this week's data. Forward-looking. No sign-off — the UI already shows the Jordan label.",
  "prCount": <integer — number of exercises where athlete hit a personal best this week. Use prsHit.length from metrics>,
  "sessionsCompleted": <integer — sessions the athlete completed. Use metrics.sessionsCompleted>,
  "sessionsPlanned": <integer — sessions planned for the week. Use metrics.sessionsPlanned>,
  "avgRpe": <number rounded to 1 decimal — average logged RPE across all sets this week. Use metrics.avgLoggedRpe. Set to 0 if rpeDataRecorded is false>
}

Tone rules:
- STYLE RULE: Never use em-dashes (—) in any response. Use periods or commas instead. This applies to all coaching copy, Jordan's voice, and any explanatory text.
- Never use double periods (..). End sentences with a single period only.
- Write as Jordan in first person throughout
- Reference actual weights, reps, and RPE from the data
- Never use filler praise like 'Great job!', 'Keep it up!', 'Well done!', or 'Fantastic work!'
- Never add a sign-off or '— Jordan' anywhere — the UI renders the Jordan label separately
- Return only valid JSON, no markdown, no prose outside the JSON`,
        messages: [
          {
            role: 'user',
            content: `Generate a weekly coach debrief for Week ${weekNumber}.
Goal type: ${goalType}
Performance metrics:
${JSON.stringify(metrics, null, 2)}
${weekNumber === 1 && planResult.data.start_date && planJson.scheduledDays ? `Late-start context: This user started their plan on ${planResult.data.start_date}. Scheduled training days are ${(planJson.scheduledDays as string[]).join(', ')}. Sessions planned this week reflects only the days available since their start date (${sessionsPlanned} of ${daysPerWeek} total weekly sessions). Do NOT frame this as a missed session week. The user completed every available session. Frame Week 1 as a calibration start, not a tough week.` : ''}
${deloadPerformanceOverrideBlock}
CRITICAL INTERPRETATION RULES — you must follow this exactly:

RPE deltas (only when rpeDataRecorded is true):
- avgRpeVsTarget = (actual RPE) minus (target RPE)
  - NEGATIVE value means weights were TOO LIGHT — the athlete found it easy. 
    This means weights need to go UP next week. This is NOT a tough week.
    A negative avgRpeVsTarget with all sessions completed should be "on-track" or "strong".
  - POSITIVE value means the athlete worked harder than planned.
    If reps were still hit: weights are appropriate or slightly heavy — "strong" or "on-track".
    If reps were missed AND RPE was high: weights were too heavy — "tough-week".
  - Near zero: perfectly calibrated.

- exercisesTooLight = exercises where RPE was 2+ points below target.
  These INCREASE in weight next week. Do NOT treat this as underperformance.

- derivedRating is pre-calculated from the data. Use it as the basis for performanceRating
  unless your analysis of the full data clearly contradicts it.

- NEVER use "tough-week" just because RPE was low. Low RPE = easy = good compliance.
  "tough-week" is reserved for: missed sessions, missed rep targets with HIGH RPE, or injury.

TOUGH WEEK COPY RULES (when metrics.derivedRating === 'tough-week' — align performanceSummary, headline, highlights, and nextWeekChanges with this; performanceRating must be "tough-week" unless deload override contradicts):

Jordan's tone for a tough week is: direct, non-judgmental, forward-focused. Like a coach who has seen bad weeks before and knows they happen.

STRUCTURE for the opening paragraph (performanceSummary):
  Sentence 1: Acknowledge the week plainly. Name what happened. Do NOT soften or spin it.
  Sentence 2: One sentence of context — life happens, weeks get derailed, this is normal. One sentence only.
  Sentence 3: The forward action. What happens next week. Specific, not vague.
  Sentence 4: Optional — one reinforcing line if needed.

DISTINGUISH between two tough-week causes (use metrics: completionRate, avgRpeVsTarget, exercisesUnderPerformed.length, rpeDataRecorded):

CAUSE A — Low completion (< 60% sessions):
  User missed most of their sessions. The physical state is fine — they just didn't show up.
  Jordan's focus: Re-commitment, not sympathy.
  Tone: Honest and matter-of-fact. Not harsh. Not coddling.
  Example opening: "You got one session in this week — the plan called for three. Life gets in the way sometimes; that's not the issue. What matters is what you do when you come back, and you're back now. I've kept your Week ${weekNumber + 1} targets where they were — walk in and execute."

CAUSE B — High RPE overexertion (avgRpeVsTarget > +1.5 AND 3+ exercises underperformed; only when rpeDataRecorded is true):
  User showed up but pushed too hard and underperformed.
  Jordan's focus: Recovery and execution quality next week.
  Tone: Coaches the pattern, not the person. Empathetic but clear.
  Example opening: "You pushed hard this week — harder than the targets called for — and the RPE data shows it caught up with you by the end. That's useful information. Week ${weekNumber + 1} I've pulled the intensity targets back slightly; hit clean reps at the prescribed RPE rather than chasing the top end."

NEVER DO these on a tough week:
  - Never open with "It happens to everyone" as the FIRST sentence (it can appear later)
  - Never use: Keep it up / Bounce back / You've got this / Don't worry / Every champion / Trust the process
  - Never lecture about consistency for more than one sentence
  - Never end with a generic motivational sign-off
  - Never pretend the week went fine
  - Never use exclamation marks on a tough week

HEADLINES for tough-week (headline field when derivedRating === 'tough-week'):
  Low completion: "Missed sessions — back to it" or "One session — reset and go" or "Light week — ${weekNumber + 1} is what counts"
  High RPE: "Pushed too hard — dialling it back" or "Overreached — recovery week ahead" or "RPE ran hot — adjusting Week ${weekNumber + 1}"
  Headlines should be factual, not dramatic. Never "Tough week 💪".

WINS section on a tough week (highlights array):
  If there are genuine wins (a PR, a well-executed set, good nutrition adherence) — include them. Do not manufacture wins from nothing. If there are no wins, use an empty highlights array or a single honest line such as "Nothing to highlight this week — fresh start next session."

WHAT'S CHANGING section on a tough week (nextWeekChanges):
  Be specific about what Jordan has actually adjusted (weights held, intensity pulled back, volume maintained). If nothing changed because the missed sessions left no adaptation data — say that plainly: "With limited data from this week, I've held your Week ${weekNumber + 1} targets where they were."

- rpeDataRecorded: if false, the user did NOT log RPE this week.
  Do NOT say "RPE was on target" or reference RPE performance.
  Instead acknowledge that RPE data was not captured and note that
  logging RPE each set will improve the accuracy of next week's plan.
  Base the rating on completion rate and fatigue only.

- avgReadinessScore: average daily readiness rating (1=Rough, 2=Tired, 3=OK, 4=Good, 5=Great) from daily check-ins this week. null means the user did not log readiness.
  - If null: do not reference readiness at all
  - If readinessDaysLogged < 3: treat as insufficient data — do not draw conclusions from a partial picture
  - If 1.0–2.5: low readiness week. Reference in performanceSummary if RPE also ran high — it explains overexertion. Example: "Your readiness scores averaged 2.1 this week — the body was running on empty before sessions started."
  - If 2.6–3.5: moderate readiness. Only reference if it contextualises an underperformance.
  - If 3.6–5.0: good readiness. Only reference if it makes a strong week even more notable. Example: "High readiness scores and strong RPE data — this was a clean, well-executed week."
  - Never mention readiness unless it adds meaning to the performance narrative. If the week was unremarkable and readiness was average, omit it entirely.

- isDeloadWeek: if true, this was a planned deload week (see plan phase).
  Follow DELOAD WEEK PERFORMANCE OVERRIDE above when present — it takes
  precedence over this bullet and over derivedRating for how to judge the week.
  When avgLoggedRpe <= 7: acknowledge reduced loads were intentional and
  recovery is on track; nextWeekChanges can reference full loads resuming.
  When avgLoggedRpe > 7: do not treat completion rate or "showing up" as the win.

- stagnantExercises: exercises where weight matched target exactly
  and RPE was on target. If this list has 3+ exercises, mention in
  nextWeekChanges that exercise variations may be introduced to
  provide fresh stimulus.

Sport / recovery context:
${sportContext}
${sessionNotesContext ? `\n${sessionNotesContext}\n` : ''}
SPORT CONTEXT RULE FOR SUMMARY:
If sport sessions were logged this week (see sportContext above — i.e. not the single line "No sport sessions logged this week"), include ONE sentence in the weekly summary body acknowledging the sport volume and the calorie recommendation. Keep it brief and actionable. Do not mention MET values or formulas. Write in Jordan's voice. If no sport sessions were logged, omit this entirely.

SESSION NOTES RULE:
If sessionNotesThisWeek contains notes, Jordan must acknowledge at least one relevant note in the summary.
- Pain, injury, or discomfort mentions: reference in nextWeekChanges with a specific programming adjustment. Example: "You noted knee discomfort on squats — I've reduced squat volume next week and substituted leg press for the second lower session."
- General fatigue or life context: acknowledge briefly in performanceSummary. One sentence only.
- Positive notes ("felt strong", "energy was great"): can reinforce a strong rating if metrics support it.
- Never ignore a note that mentions physical symptoms. This is the primary way the athlete communicates injury risk.

Return ONLY this exact JSON structure with no other text:
{
  "weekNumber": ${weekNumber},
  "performanceRating": "strong" | "on-track" | "tough-week",
  "headline": string,
  "highlights": string[],
  "performanceSummary": string,
  "nextWeekChanges": string,
  "nutritionCheckin": string,
  "motivationalNote": string,
  "prCount": number,
  "sessionsCompleted": number,
  "sessionsPlanned": number,
  "avgRpe": number
}`,
          },
        ],
      }),
    })
    );

    if (claudeResponse.status === 503) {
      return new Response(await claudeResponse.text(), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const claudeData = await claudeResponse.json();

    if (!claudeResponse.ok) {
      throw new Error(`Claude API error: ${claudeData.error?.message ?? 'unknown'}`);
    }

    const text: string = claudeData.content?.[0]?.text ?? '';

    // Step 5 — Parse Claude JSON and return
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Claude response');

    let summary: unknown;
    try {
      summary = JSON.parse(jsonMatch[0]);
    } catch (e) {
      throw new Error('JSON parse failed: ' + String(e));
    }

    // Save summary to weekly_summaries using service role
    const { error: saveError } = await supabase
      .from('weekly_summaries')
      .upsert(
        {
          user_id: userId,
          plan_id: planId,
          week_number: weekNumber,
          summary_json: summary,
          generated_at: new Date().toISOString(),
          sport_calorie_nudge: sportCalorieNudge,
        },
        { onConflict: 'user_id,plan_id,week_number' },
      );

    if (saveError) {
      console.error('weekly_summaries upsert error:', saveError);
      // Non-critical — still return the summary to the client
    }

    // Write in-app notification — non-blocking, never throws
    try {
      const summaryTyped = summary as {
        headline?: string;
        performanceRating?: string;
      };
      const headline = summaryTyped?.headline ?? `Week ${weekNumber} review ready`;
      const rating = summaryTyped?.performanceRating ?? 'on-track';
      const ratingLabel =
        rating === 'strong' ? 'Strong week.' :
        rating === 'tough-week' ? 'Tough week.' :
        'On track.';

      await supabase.from('notifications').insert({
        user_id: userId,
        type: 'weekly_review_ready',
        title: `Week ${weekNumber} review`,
        body: `${ratingLabel} ${headline}`,
        metadata: {
          plan_id: planId,
          week_number: weekNumber,
          performance_rating: rating,
        },
      });
    } catch (notifErr) {
      console.error('[notifications] weekly_review_ready write failed:', notifErr);
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('weekly-coach-summary error:', String(error));
    return new Response(JSON.stringify({ error: String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

// DEPLOY:
// supabase db push   # applies sport_calorie_nudge migration
// supabase functions deploy weekly-coach-summary --no-verify-jwt
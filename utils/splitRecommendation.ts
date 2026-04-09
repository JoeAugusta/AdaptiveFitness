/**
 * Jordan split recommendation + weekly session templates for plan generation.
 */

export interface SessionDay {
  day: number;
  /** Mon–Sun label when structure is mapped to user-selected training days */
  dayLabel?: string;
  type: 'workout' | 'rest';
  focus: string;
  primaryMuscles: string[];
  sessionIntensity: 'heavy' | 'volume' | 'moderate';
  liftDay?: 'heavy' | 'volume';
}

export interface SplitRecommendation {
  splitId: string;
  /** Short label for UI badge (e.g. "PHUL", "PPL") */
  splitName: string;
  reason: string;
  warning?: string;
}

/** Optional layout tweak from Experience "Adjust" — does not change recommended splitId in all cases */
export type SessionStructureHint = 'more_upper' | 'more_lower' | 'more_full_body';

/** Single source of truth for split display names (badge, modal title, adjust chips, warnings). */
export function getSplitLabel(splitId: string): string {
  const labels: Record<string, string> = {
    upper_lower: 'Upper / Lower',
    phul: 'PHUL',
    ppl: 'PPL',
    ppl_upper: 'PPL + Upper',
    ppl_leg_focus: 'PPL + Leg Focus',
    leg_focus: 'Leg Focus',
    upper_focus: 'Upper Focus',
    arnold: 'Arnold Split',
    batman: 'Batman Split',
    full_body_beginner: 'Full Body',
    full_body_advanced: 'Full Body',
    full_body: 'Full Body',
    strength_2x: 'Strength Focus',
    strength_3x: 'Strength Focus',
    bro_split: 'Bro Split',
    custom: 'Custom',
  };
  return labels[splitId] ?? splitId;
}

export function formatSplitName(splitId: string): string {
  return getSplitLabel(splitId);
}

export function badgeNameForSplit(splitId: string): string {
  return getSplitLabel(splitId);
}

export type AdjustMenuOption =
  | { kind: 'force_split'; label: string; splitId: string }
  | { kind: 'hint'; label: string; hint: SessionStructureHint }
  | { kind: 'reset'; label: string };

export function getAdjustOptions(experience: string, daysPerWeek: number): AdjustMenuOption[] {
  const exp = experience.toLowerCase();
  const d = daysPerWeek;

  const genericHints: AdjustMenuOption[] = [
    { kind: 'hint', label: 'More upper', hint: 'more_upper' },
    { kind: 'hint', label: 'More lower', hint: 'more_lower' },
    { kind: 'hint', label: 'More full body', hint: 'more_full_body' },
    { kind: 'reset', label: 'Let Jordan decide' },
  ];

  if (exp === 'beginner') {
    return genericHints;
  }

  if (exp === 'intermediate' && d >= 6) {
    return [
      { kind: 'force_split', label: getSplitLabel('ppl'), splitId: 'ppl' },
      { kind: 'force_split', label: getSplitLabel('upper_lower'), splitId: 'upper_lower' },
      { kind: 'reset', label: 'Let Jordan decide' },
    ];
  }

  if (exp === 'advanced' && d >= 6) {
    return [
      { kind: 'force_split', label: getSplitLabel('ppl'), splitId: 'ppl' },
      { kind: 'force_split', label: getSplitLabel('arnold'), splitId: 'arnold' },
      { kind: 'force_split', label: getSplitLabel('batman'), splitId: 'batman' },
      { kind: 'reset', label: 'Let Jordan decide' },
    ];
  }

  if (exp === 'advanced' && d === 4) {
    return [
      { kind: 'force_split', label: getSplitLabel('phul'), splitId: 'phul' },
      { kind: 'force_split', label: getSplitLabel('upper_lower'), splitId: 'upper_lower' },
      { kind: 'reset', label: 'Let Jordan decide' },
    ];
  }

  if (exp === 'advanced' && d === 5) {
    return [
      { kind: 'force_split', label: getSplitLabel('ppl_upper'), splitId: 'ppl_upper' },
      { kind: 'force_split', label: getSplitLabel('upper_lower'), splitId: 'upper_lower' },
      { kind: 'reset', label: 'Let Jordan decide' },
    ];
  }

  return genericHints;
}

export function getSplitInfoDescription(splitId: string): string {
  switch (splitId) {
    case 'upper_lower':
      return (
        'Upper/Lower splits train your upper and lower body on alternating days. Each muscle group gets hit twice a week — once heavy, once for volume. The most versatile split for intermediate lifters.'
      );
    case 'phul':
      return (
        'Power Hypertrophy Upper Lower. Two power days (low reps, heavy load) paired with two hypertrophy days (moderate reps, higher volume). Builds strength and size simultaneously — the most effective 4-day structure for advanced intermediate lifters.'
      );
    case 'ppl':
      return (
        'Push/Pull/Legs divides sessions by movement pattern. Push = chest, shoulders, triceps. Pull = back, biceps. Legs = quads, hamstrings, glutes. At 6 days, every muscle hits twice a week at different intensities.'
      );
    case 'ppl_upper':
      return (
        'A 5-day extension of Push/Pull/Legs. The fourth session adds an upper body day at moderate intensity — extra frequency for chest and back without maxing out recovery.'
      );
    case 'arnold':
      return (
        'The Arnold Split pairs antagonist muscles — chest with back, shoulders with arms. Training antagonists together allows more total volume per session because one muscle rests while the other works. Both pairings train twice per week.'
      );
    case 'batman':
      return (
        'Similar to the Arnold Split but with a dedicated Arms + Core day. If arms are a weak point, this structure trains them fresh — not fatigued from chest or back work. Chest and back still pair together twice per week.'
      );
    case 'full_body_beginner':
    case 'full_body':
    case 'full_body_advanced':
      return (
        'Full body sessions train every major muscle group each workout. At 3 days, this gives your muscles the highest weekly frequency — critical for learning movement patterns and building your base in the first 6–12 months.'
      );
    case 'strength_2x':
      return (
        'Your plan is built around your target lift — not a named split. Your primary lift appears 2 times per week at different intensities. Everything else is programmed to support that lift.'
      );
    case 'strength_3x':
      return (
        'Your plan is built around your target lift — not a named split. Your primary lift appears 3 times per week at different intensities. Everything else is programmed to support that lift.'
      );
    case 'ppl_leg_focus':
      return (
        'Push, pull, and two leg-focused days: one quad-heavy and one posterior-chain. Upper body still trains with a dedicated moderate upper session so nothing gets left behind.'
      );
    case 'leg_focus':
      return (
        'Two upper and two leg sessions per week, with legs split into quad-focused and posterior-chain days so you can drive leg priority without losing upper balance.'
      );
    case 'upper_focus':
      return (
        'Three upper sessions and one lower day: extra frequency for chest, back, and shoulders while legs are maintained in a single weekly lower session.'
      );
    default:
      return (
        'This weekly layout groups exercises so each muscle gets the right frequency and recovery for your goal. Tap a session to see focus areas and muscle balance for that day.'
      );
  }
}

export function formatGoalName(goalType: string): string {
  switch (goalType) {
    case 'hypertrophy':
      return 'muscle building';
    case 'fat_loss':
      return 'fat loss';
    case 'recomp':
      return 'body recomposition';
    case 'general':
      return 'general fitness';
    default:
      return goalType.replace(/_/g, ' ');
  }
}

export function getWarningMessage(
  selectedSplit: string,
  recommendedSplit: string,
  goalType: string,
  _daysCount: number,
  recommendationReason: string,
): string {
  if (selectedSplit === 'bro_split') {
    if (goalType === 'strength') {
      return (
        `Bro Split trains each muscle once per week. For strength, ` +
        `your target lift needs to appear twice weekly — ${formatSplitName(recommendedSplit)} gives you that.`
      );
    }
    return (
      `Bro Split trains each muscle once per week. ${formatSplitName(recommendedSplit)} hits each muscle ` +
      `group more frequently, which is better for ${formatGoalName(goalType)}.`
    );
  }

  return (
    `Both work, but ${formatSplitName(recommendedSplit)} is better matched to your goal and schedule. ` +
    `Here's why I picked it: ${recommendationReason}`
  );
}

type ExpLevel = 'beginner' | 'intermediate' | 'advanced';

function normExp(experience: string): ExpLevel {
  const x = experience.toLowerCase();
  if (x === 'beginner') return 'beginner';
  if (x === 'advanced') return 'advanced';
  return 'intermediate';
}

function normMuscle(m: string): string {
  return m.toLowerCase().replace(/\s+/g, '_');
}

export type MuscleFocusFlags = {
  legCount: number;
  armCount: number;
  upperCount: number;
  isLegDominant: boolean;
  isArmDominant: boolean;
  isUpperDominant: boolean;
  /** Display string for leg-priority rationale */
  legPriorityLabel: string;
};

/** Priority + weak points → leg/arm/upper dominance (recommendations + session layout). */
export function getMuscleFocusFlags(
  priorityMuscles: string[],
  weakPoints: string[],
): MuscleFocusFlags {
  const combined = [...(priorityMuscles ?? []), ...(weakPoints ?? [])];
  const normalised = combined.map((m) => m.toLowerCase().trim().replace(/_/g, ' '));

  console.log('[getMuscleFocusFlags] input:', { priorityMuscles, weakPoints });
  console.log('[getMuscleFocusFlags] normalised:', normalised);

  const LEG_MUSCLES = new Set([
    'quads',
    'quadriceps',
    'hamstrings',
    'glutes',
    'calves',
    'legs',
    'hip flexors',
    'adductors',
    'abductors',
  ]);
  const ARM_MUSCLES = new Set(['biceps', 'triceps', 'forearms', 'arms']);
  const UPPER_MUSCLES = new Set([
    'chest',
    'back',
    'shoulders',
    'biceps',
    'triceps',
    'traps',
    'lats',
    'rear delts',
    'front delts',
    'upper back',
  ]);

  const legMatches = normalised.filter((m) => LEG_MUSCLES.has(m));
  const armMatches = normalised.filter((m) => ARM_MUSCLES.has(m));
  const upperMatches = normalised.filter((m) => UPPER_MUSCLES.has(m));

  console.log('[getMuscleFocusFlags] matches:', { legMatches, armMatches, upperMatches });

  const legCount = legMatches.length;
  const armCount = armMatches.length;
  const upperCount = upperMatches.length;

  const isLegDominant = legCount >= 2;
  const isArmDominant = armCount >= 2;
  const isUpperDominant = upperCount >= 3 && !isLegDominant && !isArmDominant;

  const seenLeg = new Set<string>();
  const legLabelParts: string[] = [];
  for (const m of legMatches) {
    if (seenLeg.has(m)) continue;
    seenLeg.add(m);
    legLabelParts.push(m.charAt(0).toUpperCase() + m.slice(1));
  }
  const legPriorityLabel = legLabelParts.join(', ') || 'legs';

  console.log('[getMuscleFocusFlags] flags:', {
    isLegDominant,
    isArmDominant,
    isUpperDominant,
    legPriorityLabel,
  });

  return {
    isLegDominant,
    isArmDominant,
    isUpperDominant,
    legPriorityLabel,
    legCount,
    armCount,
    upperCount,
  };
}

/** Map S02b chip label → canonical split id for novelty matching */
export function splitHistoryLabelToId(label: string | null): string | null {
  if (!label) return null;
  if (label === 'Upper / Lower') return 'upper_lower';
  if (label === 'Push / Pull / Legs') return 'ppl';
  if (label === 'Full Body') return 'full_body_beginner';
  if (label === 'Bro Split') return 'bro_split';
  if (label === 'Not following a program') return 'not_following';
  if (label === 'Other') return 'other';
  return null;
}

export function getRecommendedSplit(
  goal: string,
  daysPerWeek: string,
  targetLift: string | null,
  experience: string,
  currentSplit: string | null,
  splitDuration: string | null,
  trainingBackground: string | null,
  weakPoints: string[],
  priorityMuscles: string[],
): SplitRecommendation {
  const days = parseInt(daysPerWeek, 10);
  const d = Number.isFinite(days) ? days : 0;
  const expLower = experience.toLowerCase();
  const isAdvanced = expLower === 'advanced';

  console.log('[getRecommendedSplit] START', {
    goal,
    days: d,
    experience,
    priorityMuscles,
    weakPoints,
    currentSplit,
    splitDuration,
  });

  if (goal === 'strength') {
    const isBeginnerStrength =
      expLower === 'beginner' || trainingBackground === 'New to structured training';
    const freq = isBeginnerStrength ? 'strength_3x' : 'strength_2x';
    const liftName = (targetLift ?? 'your target lift').replace(/_/g, ' ');
    console.log('[getRecommendedSplit] → STRENGTH early return:', freq);
    return {
      splitId: freq,
      splitName: getSplitLabel(freq),
      reason: isBeginnerStrength
        ? `Hitting ${liftName} three times per week builds the movement pattern fastest at this stage.`
        : `Heavy day + volume day for ${liftName} — the structure that drives 1RM progress.`,
    };
  }

  if (expLower === 'beginner') {
    const splitId = d <= 3 ? 'full_body_beginner' : 'upper_lower';
    console.log('[getRecommendedSplit] → BEGINNER early return:', splitId);
    return {
      splitId,
      splitName: getSplitLabel(splitId),
      reason:
        d <= 3
          ? 'Full body training hits every muscle three times a week — the frequency that builds movement patterns fastest at this stage.'
          : 'Upper/Lower hits every muscle twice a week — the frequency you need to build movement patterns and muscle simultaneously.',
    };
  }

  const flags = getMuscleFocusFlags(priorityMuscles ?? [], weakPoints ?? []);
  const { isLegDominant, isArmDominant, isUpperDominant, legPriorityLabel } = flags;

  console.log('[getRecommendedSplit] flags:', flags);

  let splitId: string;
  let reason: string;

  if (isAdvanced) {
    if (d >= 6) {
      splitId = 'arnold';
      reason =
        'Arnold Split — chest and back train together twice a week, shoulders and arms twice a week. Antagonist pairing means more volume per session without extra fatigue. At your level with 6 days, this is the right structure.';
    } else if (d === 5) {
      splitId = 'ppl_upper';
      reason =
        '5 days and advanced — PPL + Upper gives you the volume and frequency your body needs to keep progressing.';
    } else if (d === 4) {
      splitId = 'phul';
      reason =
        'PHUL combines power and hypertrophy days — the most effective 4-day structure for advanced muscle building.';
    } else {
      splitId = 'upper_lower';
      reason =
        'Upper/Lower gives each muscle twice-weekly frequency — the right choice at 3 days.';
    }
  } else {
    if (d >= 6) {
      splitId = 'ppl';
      reason =
        'PPL at 6 days hits every muscle twice weekly — the frequency sweet spot for intermediate hypertrophy.';
    } else if (d === 5) {
      splitId = 'ppl_upper';
      reason = 'PPL + Upper gives high volume and frequency across 5 days.';
    } else if (d === 4) {
      splitId = 'upper_lower';
      reason =
        'Upper/Lower gives each muscle 2x weekly frequency — the sweet spot for hypertrophy at 4 days.';
    } else {
      splitId = 'full_body_advanced';
      reason = 'Full body training at 3 days maximises frequency per session.';
    }
  }

  console.log('[getRecommendedSplit] STEP C base:', { splitId, reason });

  if (isArmDominant && d >= 6 && isAdvanced) {
    console.log('[getRecommendedSplit] OVERRIDE → batman (arm dominant, 6d, advanced)');
    splitId = 'batman';
    reason =
      "Your arms are a stated priority. Batman Split gives them their own dedicated session — trained fresh, not after chest or back work. That's the frequency gap they need.";
  } else if (isArmDominant && d === 5) {
    console.log('[getRecommendedSplit] OVERRIDE → ppl_upper arm focus (arm dominant, 5d)');
    splitId = 'ppl_upper';
    reason =
      'With arms as a priority, your fifth day focuses specifically on biceps, triceps, and shoulders — trained fresh at the end of the week.';
  } else if (isArmDominant && d === 4) {
    console.log('[getRecommendedSplit] OVERRIDE → upper_lower arm focus (arm dominant, 4d)');
    splitId = 'upper_lower';
    reason =
      'One of your upper days dedicates extra volume to arms — your stated priority area.';
  } else if (isLegDominant && d === 5) {
    console.log('[getRecommendedSplit] OVERRIDE → ppl_leg_focus (leg dominant, 5d)');
    splitId = 'ppl_leg_focus';
    reason = `You've prioritised ${legPriorityLabel} — your plan gives legs two dedicated sessions. Push and Pull each get one day, legs get two.`;
  } else if (isLegDominant && d === 4) {
    console.log('[getRecommendedSplit] OVERRIDE → leg_focus (leg dominant, 4d)');
    splitId = 'leg_focus';
    reason = `With ${legPriorityLabel} as your priority, you get two dedicated leg sessions — one quad-focused, one posterior chain.`;
  } else if (isLegDominant && d >= 6) {
    console.log('[getRecommendedSplit] OVERRIDE → leg note appended (leg dominant, 6d)');
    reason =
      reason +
      ' Legs appear twice in your weekly structure to match your stated priority.';
  } else if (isUpperDominant && d === 4) {
    console.log('[getRecommendedSplit] OVERRIDE → upper_focus (upper dominant, 4d)');
    splitId = 'upper_focus';
    reason =
      'With upper body as your focus, you get three upper sessions and one lower — legs maintain while upper body drives.';
  } else if (isUpperDominant && d === 5) {
    console.log('[getRecommendedSplit] OVERRIDE → ppl_upper upper note (upper dominant, 5d)');
    splitId = 'ppl_upper';
    reason =
      'PPL + Upper gives your chest and back twice-weekly frequency — exactly what upper-dominant programming needs.';
  } else {
    console.log('[getRecommendedSplit] NO OVERRIDE applied — using base recommendation');
  }

  console.log('[getRecommendedSplit] after STEP D:', { splitId });

  if (goal === 'hypertrophy' && !isAdvanced && d >= 6 && isArmDominant) {
    console.log('[getRecommendedSplit] NOTE → intermediate 6d arm priority (append to reason)');
    reason =
      reason +
      ' Arms are a stated priority — session volume leans toward biceps and triceps within this PPL week.';
  }

  if (splitDuration === '6+ months' && currentSplit) {
    const norm = currentSplit.toLowerCase();
    const isSameStructure =
      (splitId === 'upper_lower' && norm.includes('upper')) ||
      (splitId === 'ppl' && norm.includes('push')) ||
      (splitId === 'ppl_upper' && norm.includes('push')) ||
      (splitId === 'ppl_leg_focus' && norm.includes('push'));

    if (isSameStructure) {
      console.log('[getRecommendedSplit] NOVELTY override — switching from:', splitId);
      if (splitId === 'upper_lower') {
        splitId = isAdvanced ? 'phul' : 'ppl';
      } else if (['ppl', 'ppl_upper', 'ppl_leg_focus'].includes(splitId)) {
        splitId = 'upper_lower';
      }
      reason =
        reason +
        ` Since you've been on ${currentSplit} for 6+ months, a structural change will reignite adaptation.`;
      console.log('[getRecommendedSplit] NOVELTY switched to:', splitId);
    }
  }

  const splitName = getSplitLabel(splitId);
  console.log('[getRecommendedSplit] FINAL:', { splitId, splitName });

  return { splitId, splitName, reason };
}

function uniqMuscles(muscles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of muscles) {
    const k = m.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(m.toLowerCase());
    }
  }
  return out;
}

function W(
  day: number,
  focus: string,
  muscles: string[],
  intensity: 'heavy' | 'volume' | 'moderate',
  liftDay?: 'heavy' | 'volume',
): SessionDay {
  return {
    day,
    type: 'workout',
    focus,
    primaryMuscles: uniqMuscles(muscles),
    sessionIntensity: intensity,
    ...(liftDay ? { liftDay } : {}),
  };
}

function R(day: number): SessionDay {
  return {
    day,
    type: 'rest',
    focus: 'rest',
    primaryMuscles: [],
    sessionIntensity: 'moderate',
  };
}

function upperLower4(): SessionDay[] {
  return [
    W(1, 'upper_heavy', ['chest', 'back', 'shoulders'], 'heavy'),
    W(2, 'lower_heavy', ['quads', 'hamstrings', 'glutes'], 'heavy'),
    R(3),
    W(4, 'upper_volume', ['chest', 'back', 'arms'], 'volume'),
    W(5, 'lower_volume', ['hamstrings', 'glutes', 'core'], 'volume'),
    R(6),
    R(7),
  ];
}

/** Adjust hint: 3 upper, 1 lower in a 4-workout week */
function upperUpperFocus4(): SessionDay[] {
  return [
    W(1, 'upper_heavy', ['chest', 'back', 'shoulders'], 'heavy'),
    W(2, 'lower_heavy', ['quads', 'hamstrings', 'glutes'], 'heavy'),
    R(3),
    W(4, 'upper_moderate', ['chest', 'back', 'shoulders'], 'moderate'),
    W(5, 'upper_volume', ['chest', 'back', 'arms'], 'volume'),
    R(6),
    R(7),
  ];
}

/** Adjust hint: 2 lower-focused days (quad + posterior) */
function legFocusUpperLower4(): SessionDay[] {
  return [
    W(1, 'upper_heavy', ['chest', 'back', 'shoulders'], 'heavy'),
    W(2, 'lower_heavy', ['quads', 'glutes', 'calves'], 'heavy'),
    R(3),
    W(4, 'upper_volume', ['chest', 'back', 'arms'], 'volume'),
    W(5, 'lower_volume', ['hamstrings', 'glutes', 'core'], 'volume'),
    R(6),
    R(7),
  ];
}

/** Leg-priority 5-day: 2 leg days + push + pull + upper */
function pplLegFocus5(): SessionDay[] {
  return [
    W(1, 'push_heavy', ['chest', 'shoulders', 'triceps'], 'heavy'),
    W(2, 'legs_quad', ['quads', 'glutes', 'calves'], 'heavy'),
    W(3, 'pull_heavy', ['back', 'biceps', 'rear_delts'], 'heavy'),
    W(4, 'upper_moderate', ['chest', 'back', 'shoulders'], 'moderate'),
    W(5, 'legs_posterior', ['hamstrings', 'glutes', 'calves'], 'volume'),
    R(6),
    R(7),
  ];
}

/** Leg-priority 4-day: upper / legs quad / upper / legs posterior */
function legFocusSplit4(): SessionDay[] {
  return [
    W(1, 'upper_heavy', ['chest', 'back', 'shoulders'], 'heavy'),
    W(2, 'legs_quad', ['quads', 'glutes', 'calves'], 'heavy'),
    R(3),
    W(4, 'upper_volume', ['chest', 'back', 'arms'], 'volume'),
    W(5, 'legs_posterior', ['hamstrings', 'glutes', 'calves'], 'volume'),
    R(6),
    R(7),
  ];
}

/** Upper-priority 4-day: 3 upper + 1 lower */
function upperFocus4(): SessionDay[] {
  return [
    W(1, 'upper_heavy', ['chest', 'back', 'shoulders'], 'heavy'),
    W(2, 'lower_full', ['quads', 'hamstrings', 'glutes'], 'moderate'),
    R(3),
    W(4, 'upper_moderate', ['chest', 'back', 'shoulders'], 'moderate'),
    W(5, 'upper_volume', ['chest', 'back', 'arms'], 'volume'),
    R(6),
    R(7),
  ];
}

/** Arm-priority 5-day PPL+Upper: fifth day arms + shoulders */
function pplUpper5Arms(): SessionDay[] {
  return [
    W(1, 'push_heavy', ['chest', 'shoulders', 'triceps'], 'heavy'),
    W(2, 'pull_heavy', ['back', 'biceps', 'rear_delts'], 'heavy'),
    W(3, 'legs_quad', ['quads', 'glutes', 'calves'], 'heavy'),
    W(4, 'push_volume', ['chest', 'shoulders', 'triceps'], 'volume'),
    W(5, 'arms_upper', ['biceps', 'triceps', 'shoulders'], 'volume'),
    R(6),
    R(7),
  ];
}

/** Arm-priority 4-day upper/lower: one upper day emphasises arms */
function upperLower4ArmFocus(): SessionDay[] {
  return [
    W(1, 'upper_heavy', ['chest', 'back', 'shoulders'], 'heavy'),
    W(2, 'lower_heavy', ['quads', 'hamstrings', 'glutes'], 'heavy'),
    R(3),
    W(4, 'upper_arms_focus', ['biceps', 'triceps', 'chest', 'shoulders'], 'volume'),
    W(5, 'lower_volume', ['hamstrings', 'glutes', 'core'], 'volume'),
    R(6),
    R(7),
  ];
}

/** Batman 6-day with a dedicated quad day when legs are a stated priority */
function batman6LegPriority(): SessionDay[] {
  return [
    W(1, 'chest_back_heavy', ['chest', 'back'], 'heavy'),
    W(2, 'legs_quad', ['quads', 'glutes', 'calves'], 'heavy'),
    R(3),
    W(4, 'chest_back_volume', ['chest', 'back', 'shoulders'], 'volume'),
    W(5, 'arms_core', ['biceps', 'triceps', 'core'], 'moderate'),
    W(6, 'legs_posterior', ['hamstrings', 'glutes', 'calves'], 'volume'),
    R(7),
  ];
}

function upperLower5(priorityMuscles: string[], weakPoints: string[]): SessionDay[] {
  const pri = priorityMuscles.map(normMuscle);
  const weak = weakPoints.map(normMuscle);
  const upperVolMuscles = uniqMuscles([...pri, ...weak, 'chest', 'back', 'arms']);
  return [
    W(1, 'upper_heavy', ['chest', 'back', 'shoulders'], 'heavy'),
    W(2, 'lower_heavy', ['quads', 'hamstrings', 'glutes'], 'heavy'),
    W(3, 'upper_moderate', uniqMuscles([...weak, 'chest', 'back', 'shoulders']), 'moderate'),
    W(4, 'lower_volume', ['hamstrings', 'glutes', 'core'], 'volume'),
    W(5, 'upper_volume', upperVolMuscles, 'volume'),
    R(6),
    R(7),
  ];
}

function phul4(): SessionDay[] {
  return [
    W(1, 'upper_power', ['chest', 'back', 'shoulders'], 'heavy'),
    W(2, 'lower_power', ['quads', 'hamstrings', 'glutes'], 'heavy'),
    R(3),
    W(4, 'upper_hypertrophy', ['chest', 'back', 'arms', 'shoulders'], 'volume'),
    W(5, 'lower_hypertrophy', ['quads', 'hamstrings', 'glutes', 'calves'], 'volume'),
    R(6),
    R(7),
  ];
}

function ppl5(): SessionDay[] {
  return [
    W(1, 'push_heavy', ['chest', 'shoulders', 'triceps'], 'heavy'),
    W(2, 'pull_heavy', ['back', 'biceps', 'rear_delts'], 'heavy'),
    W(3, 'legs_quad', ['quads', 'glutes', 'calves'], 'heavy'),
    W(4, 'push_volume', ['chest', 'shoulders', 'triceps'], 'volume'),
    W(5, 'pull_volume', ['back', 'biceps'], 'volume'),
    R(6),
    R(7),
  ];
}

function ppl6(): SessionDay[] {
  return [
    W(1, 'push_heavy', ['chest', 'shoulders', 'triceps'], 'heavy'),
    W(2, 'pull_heavy', ['back', 'biceps', 'rear_delts'], 'heavy'),
    W(3, 'legs_quad', ['quads', 'glutes', 'calves'], 'heavy'),
    W(4, 'push_volume', ['chest', 'shoulders', 'triceps'], 'volume'),
    W(5, 'pull_volume', ['back', 'biceps'], 'volume'),
    W(6, 'legs_posterior', ['hamstrings', 'glutes', 'core'], 'volume'),
    R(7),
  ];
}

/** Advanced 5-day: PPL + extra upper */
function pplUpper5(): SessionDay[] {
  return [
    W(1, 'push_heavy', ['chest', 'shoulders', 'triceps'], 'heavy'),
    W(2, 'pull_heavy', ['back', 'biceps', 'rear_delts'], 'heavy'),
    W(3, 'legs_quad', ['quads', 'glutes', 'calves'], 'heavy'),
    W(4, 'push_volume', ['chest', 'shoulders', 'triceps'], 'volume'),
    W(5, 'upper_volume', ['chest', 'back', 'shoulders'], 'volume'),
    R(6),
    R(7),
  ];
}

function batman6(): SessionDay[] {
  return [
    W(1, 'chest_back_heavy', ['chest', 'back'], 'heavy'),
    W(2, 'legs_shoulders', ['quads', 'hamstrings', 'shoulders'], 'moderate'),
    R(3),
    W(4, 'chest_back_volume', ['chest', 'back'], 'volume'),
    W(5, 'arms_core', ['biceps', 'triceps', 'core'], 'moderate'),
    W(6, 'legs_unilateral', ['hamstrings', 'glutes', 'quads'], 'volume'),
    R(7),
  ];
}

function arnold6(): SessionDay[] {
  return [
    W(1, 'chest_back_heavy', ['chest', 'back'], 'heavy'),
    W(2, 'shoulders_arms', ['shoulders', 'biceps', 'triceps'], 'moderate'),
    W(3, 'legs_full', ['quads', 'hamstrings', 'glutes'], 'heavy'),
    W(4, 'chest_back_volume', ['chest', 'back'], 'volume'),
    W(5, 'shoulders_arms_volume', ['shoulders', 'biceps', 'triceps'], 'volume'),
    W(6, 'legs_posterior', ['hamstrings', 'glutes', 'calves'], 'volume'),
    R(7),
  ];
}

function fullBodyBeginner3(): SessionDay[] {
  return [
    W(1, 'full_body_a', ['chest', 'back', 'quads', 'core'], 'moderate'),
    R(2),
    R(3),
    W(4, 'full_body_b', ['shoulders', 'back', 'hamstrings', 'core'], 'moderate'),
    R(5),
    R(6),
    W(7, 'full_body_a', ['chest', 'back', 'quads', 'core'], 'moderate'),
  ];
}

function fullBody4(): SessionDay[] {
  return [
    W(1, 'full_body_a', ['chest', 'back', 'quads', 'core'], 'moderate'),
    W(2, 'full_body_b', ['shoulders', 'back', 'hamstrings', 'core'], 'moderate'),
    R(3),
    W(4, 'full_body_a', ['chest', 'back', 'quads', 'core'], 'moderate'),
    W(5, 'full_body_b', ['shoulders', 'back', 'hamstrings', 'core'], 'moderate'),
    R(6),
    R(7),
  ];
}

function fullBodyAdvanced(): SessionDay[] {
  return [
    W(1, 'full_body_a', ['chest', 'back', 'quads', 'shoulders', 'core'], 'moderate'),
    W(2, 'full_body_b', ['back', 'hamstrings', 'glutes', 'core'], 'moderate'),
    R(3),
    W(4, 'full_body_a', ['chest', 'back', 'quads', 'shoulders', 'core'], 'moderate'),
    W(5, 'full_body_b', ['back', 'hamstrings', 'glutes', 'core'], 'moderate'),
    R(6),
    R(7),
  ];
}

/** 3 upper exposures for target lift (beginner 3×) */
function strengthThreeX4(): SessionDay[] {
  return [
    W(1, 'upper_heavy', ['chest', 'back', 'shoulders'], 'heavy'),
    W(2, 'lower_heavy', ['quads', 'hamstrings', 'glutes'], 'heavy'),
    R(3),
    W(4, 'upper_moderate', ['chest', 'back', 'shoulders'], 'moderate'),
    W(5, 'upper_volume', ['chest', 'back', 'arms'], 'volume'),
    R(6),
    R(7),
  ];
}

function liftMuscles(targetLift: string | null): string[] {
  if (!targetLift) return ['chest', 'shoulders', 'triceps'];
  const k = targetLift.toLowerCase().replace(/\s+/g, '_');
  if (k.includes('bench')) return ['chest', 'shoulders', 'triceps'];
  if (k.includes('squat')) return ['quads', 'hamstrings', 'glutes'];
  if (k.includes('deadlift')) return ['hamstrings', 'glutes', 'back'];
  if (k.includes('ohp') || k.includes('overhead')) return ['shoulders', 'triceps', 'chest'];
  return ['chest', 'shoulders', 'triceps'];
}

function applyStrengthLiftDays(
  days: SessionDay[],
  goal: string,
  targetLift: string | null,
  splitId: string,
): SessionDay[] {
  if (goal !== 'strength' || !targetLift) return days;

  const muscles = liftMuscles(targetLift);
  const out = days.map((d) => ({ ...d }));

  const tagUpperPair = (heavyFocus: string, volFocus: string) => {
    for (const s of out) {
      if (s.type !== 'workout') continue;
      if (s.focus === heavyFocus) {
        s.liftDay = 'heavy';
        s.primaryMuscles = uniqMuscles([...muscles, ...s.primaryMuscles]);
      } else if (s.focus === volFocus) {
        s.liftDay = 'volume';
        s.primaryMuscles = uniqMuscles([...muscles, ...s.primaryMuscles]);
      }
    }
  };

  if (splitId === 'upper_lower' || splitId === 'strength_2x') {
    tagUpperPair('upper_heavy', 'upper_volume');
    return out;
  }
  if (splitId === 'strength_3x') {
    tagUpperPair('upper_heavy', 'upper_volume');
    for (const s of out) {
      if (s.type === 'workout' && s.focus === 'upper_moderate') {
        s.primaryMuscles = uniqMuscles([...muscles, ...s.primaryMuscles]);
      }
    }
    return out;
  }
  if (splitId === 'ppl') {
    tagUpperPair('push_heavy', 'push_volume');
    return out;
  }
  if (splitId === 'phul') {
    tagUpperPair('upper_power', 'upper_hypertrophy');
    return out;
  }
  if (splitId === 'batman' || splitId === 'arnold') {
    tagUpperPair('chest_back_heavy', 'chest_back_volume');
    return out;
  }

  return out;
}

function fallbackStructure(daysPerWeek: number, priorityMuscles: string[], weakPoints: string[]): SessionDay[] {
  if (daysPerWeek <= 3) return fullBodyBeginner3();
  if (daysPerWeek === 4) return upperLower4();
  if (daysPerWeek === 5) return upperLower5(priorityMuscles, weakPoints);
  if (daysPerWeek === 6) return ppl6();
  return upperLower4();
}

const CALENDAR_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Map UI / long names to Mon–Sun */
function normalizeSelectedDayLabels(selectedDays: string[]): string[] {
  const alias: Record<string, string> = {
    monday: 'Mon',
    tuesday: 'Tue',
    wednesday: 'Wed',
    thursday: 'Thu',
    friday: 'Fri',
    saturday: 'Sat',
    sunday: 'Sun',
    mon: 'Mon',
    tue: 'Tue',
    wed: 'Wed',
    thu: 'Thu',
    fri: 'Fri',
    sat: 'Sat',
    sun: 'Sun',
  };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of selectedDays ?? []) {
    const k = String(raw).trim();
    if (!k) continue;
    const lower = k.toLowerCase();
    const label = alias[lower] ?? (k.length === 3 ? k[0].toUpperCase() + k.slice(1).toLowerCase() : k);
    if (!CALENDAR_DAY_LABELS.includes(label as (typeof CALENDAR_DAY_LABELS)[number])) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

/**
 * Places template workout sessions onto the user's chosen weekdays (Mon–Sun).
 * Uses at most one workout per selected day, in calendar order, up to selectedDays.length.
 */
export function mapSessionsToDays(
  sessions: SessionDay[],
  selectedDays: string[],
): SessionDay[] {
  const labels = normalizeSelectedDayLabels(selectedDays);
  if (labels.length === 0) return sessions;

  const workoutSessions = sessions
    .filter((s) => s.type === 'workout')
    .slice(0, labels.length);

  const result: SessionDay[] = [];
  let sessionIndex = 0;

  for (let i = 0; i < 7; i++) {
    const dayLabel = CALENDAR_DAY_LABELS[i];
    const isTrainingDay = labels.includes(dayLabel);

    if (isTrainingDay && sessionIndex < workoutSessions.length) {
      const w = workoutSessions[sessionIndex];
      sessionIndex += 1;
      result.push({
        ...w,
        day: i + 1,
        dayLabel,
        type: 'workout',
      });
    } else {
      result.push({
        day: i + 1,
        dayLabel,
        type: 'rest',
        focus: 'rest',
        primaryMuscles: [],
        sessionIntensity: 'moderate',
      });
    }
  }

  return result;
}

export function getSessionStructure(
  splitId: string,
  daysPerWeek: number,
  goal: string,
  targetLift: string | null,
  priorityMuscles: string[],
  weakPoints: string[],
  selectedDays: string[],
  hint?: SessionStructureHint,
  experienceLevel?: string,
): SessionDay[] {
  let structure: SessionDay[];

  const exp = normExp(experienceLevel ?? 'intermediate');
  const muscleFocus = getMuscleFocusFlags(priorityMuscles, weakPoints);

  const finish = (raw: SessionDay[], liftSplitId: string = splitId): SessionDay[] => {
    const lifted = applyStrengthLiftDays(raw, goal, targetLift, liftSplitId);
    if (!selectedDays?.length) return lifted;
    return mapSessionsToDays(lifted, selectedDays);
  };

  if (hint === 'more_upper' && (splitId === 'upper_lower' || splitId === 'strength_3x')) {
    return finish(upperUpperFocus4());
  }
  if (hint === 'more_upper' && splitId === 'ppl') {
    return finish(daysPerWeek >= 6 ? ppl6() : pplUpper5());
  }
  if (
    hint === 'more_lower' &&
    (splitId === 'upper_lower' || splitId === 'strength_2x' || splitId === 'strength_3x')
  ) {
    return finish(legFocusUpperLower4());
  }
  if (hint === 'more_lower' && splitId === 'ppl') {
    return finish(ppl6());
  }
  if (hint === 'more_full_body') {
    return finish(
      exp === 'beginner' ? fullBodyBeginner3() : fullBodyAdvanced(),
      'full_body_advanced',
    );
  }

  switch (splitId) {
    case 'ppl_leg_focus':
      structure = pplLegFocus5();
      break;
    case 'leg_focus':
      structure = legFocusSplit4();
      break;
    case 'upper_focus':
      structure = upperFocus4();
      break;
    case 'strength_2x':
      if (daysPerWeek >= 6) structure = ppl6();
      else if (daysPerWeek === 5) structure = ppl5();
      else if (daysPerWeek >= 4) structure = upperLower4();
      else structure = upperLower4();
      break;
    case 'strength_3x':
      if (daysPerWeek >= 4) structure = strengthThreeX4();
      else structure = upperLower4();
      break;
    case 'upper_lower':
      if (
        daysPerWeek === 4 &&
        goal !== 'strength' &&
        muscleFocus.isArmDominant
      ) {
        structure = upperLower4ArmFocus();
      } else if (daysPerWeek >= 5) {
        structure = upperLower5(priorityMuscles, weakPoints);
      } else {
        structure = upperLower4();
      }
      break;
    case 'phul':
      structure = phul4();
      break;
    case 'ppl_upper': {
      const useArmsUpper =
        daysPerWeek === 5 && goal !== 'strength' && muscleFocus.isArmDominant;
      structure = useArmsUpper ? pplUpper5Arms() : pplUpper5();
      break;
    }
    case 'ppl':
      if (daysPerWeek >= 6) structure = ppl6();
      else if (daysPerWeek === 5) structure = ppl5();
      else structure = upperLower4();
      break;
    case 'batman':
      if (
        daysPerWeek === 6 &&
        goal === 'hypertrophy' &&
        exp === 'advanced' &&
        muscleFocus.isLegDominant
      ) {
        structure = batman6LegPriority();
      } else {
        structure = batman6();
      }
      break;
    case 'arnold':
      structure = arnold6();
      break;
    case 'full_body_beginner':
      structure = fullBodyBeginner3();
      break;
    case 'full_body_advanced':
      structure = fullBodyAdvanced();
      break;
    case 'full_body':
      structure = daysPerWeek >= 4 ? fullBody4() : fullBodyBeginner3();
      break;
    default:
      structure = fallbackStructure(daysPerWeek, priorityMuscles, weakPoints);
      break;
  }

  return finish(structure);
}

const SESSION_TITLES: Record<string, string> = {
  upper_heavy: 'Upper Body — Power',
  upper_volume: 'Upper Body — Volume',
  upper_moderate: 'Upper Body',
  upper_hypertrophy: 'Upper Body — Hypertrophy',
  upper_power: 'Upper Body — Power',
  lower_heavy: 'Lower Body — Power',
  lower_volume: 'Lower Body — Volume',
  lower_hypertrophy: 'Lower Body — Hypertrophy',
  lower_power: 'Lower Body — Power',
  push_heavy: 'Push — Heavy',
  push_volume: 'Push — Volume',
  pull_heavy: 'Pull — Heavy',
  pull_volume: 'Pull — Volume',
  legs_quad: 'Legs — Quad Focus',
  legs_posterior: 'Legs — Posterior Chain',
  legs_full: 'Legs',
  legs_shoulders: 'Legs + Shoulders',
  legs_unilateral: 'Legs — Unilateral',
  chest_back_heavy: 'Chest + Back — Heavy',
  chest_back_volume: 'Chest + Back — Volume',
  shoulders_arms: 'Shoulders + Arms',
  shoulders_arms_volume: 'Shoulders + Arms — Volume',
  arms_core: 'Arms + Core',
  arms_upper: 'Arms + Shoulders — Volume',
  upper_arms_focus: 'Upper — Arm emphasis',
  lower_full: 'Lower Body',
  full_body_a: 'Full Body A',
  full_body_b: 'Full Body B',
  rest: 'Rest',
};

export function getSessionTitle(focus: string): string {
  if (SESSION_TITLES[focus]) return SESSION_TITLES[focus];
  return focus
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

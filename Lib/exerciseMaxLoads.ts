/**
 * exerciseMaxLoads.ts — plausibility ceilings + PR-system metadata for lib/records.ts
 *
 * PHILOSOPHY: ceilings are absurdity detectors, not performance caps. Each value sits
 * above any real-world performance for that movement so legitimate lifters never trip
 * one, while data-entry errors (315 lb lateral raise, 2255 bench) trip instantly.
 * A tripped ceiling FLAGS the set (plausibility_status = 'flagged') — it never blocks
 * logging. Flagged sets are excluded from records and from Jordan's context until the
 * user confirms them.
 *
 * UNITS: lbs. If the user logs in kg, convert to lbs before comparing.
 * UNILATERAL / DUMBBELL: values are per-implement as logged (per dumbbell, per hand).
 *
 * null = no ceiling because the exercise is EXCLUDED from the e1RM/PR system entirely
 * (bodyweight, band, assisted machines, timed core work). recomputeExerciseRecords
 * must skip these ids; see PR_EXCLUSION_REASON.
 */

/** Aliases: duplicate library entries that are the same movement under different ids.
 *  ALL records reads/writes must resolve through canonicalExerciseId() first, or PR
 *  history fragments across duplicate ids. */
export const CANONICAL_EXERCISE_ID: Record<string, string> = {
  c02b: 'c02',   // Incline Barbell Press → Incline Barbell Bench Press
  c05d: 'c05b',  // Low Cable Fly → Cable Fly (Low to High)
  c06a: 'c06',   // Dumbbell Fly → Dumbbell Chest Fly
  s03b: 's03',   // Lateral Raise → Dumbbell Lateral Raise
  s19: 's05',    // Face Pulls → Face Pull
  tr03b: 'tr03', // Skull Crusher → Skull Crushers
  tr04b: 'tr04', // Close Grip Bench Press → Close-Grip Bench Press
  tr06b: 'tr06', // Dip → Dips
  h03b: 'h03',   // Stiff Leg Deadlift → Stiff-Leg Deadlift
  h05b: 'h05',   // Nordic Curl → Nordic Hamstring Curl
  tp07: 'tp01',  // Shrugs → Barbell Shrug
  cv08: 'cv01',  // Calf Raise → Standing Calf Raise
};

export function canonicalExerciseId(id: string): string {
  return CANONICAL_EXERCISE_ID[id] ?? id;
}

/** Why an exercise is excluded from the e1RM/PR system (ceiling = null). */
export const PR_EXCLUSION_REASON: Record<string, 'bodyweight' | 'band' | 'assisted' | 'timed'> = {
  // bodyweight — no external load, e1RM undefined (v2: rep-PR track)
  c08: 'bodyweight',  // Push-Up
  b03: 'bodyweight',  // Pull-Up
  b08: 'bodyweight',  // Chin-Up
  tr06: 'bodyweight', // Dips
  tr06b: 'bodyweight',
  tr15: 'bodyweight', // Diamond Push-Up
  h05: 'bodyweight',  // Nordic Hamstring Curl
  h05b: 'bodyweight',
  h09: 'bodyweight',  // Swiss Ball Leg Curl
  g02: 'bodyweight',  // Glute Bridge
  g09: 'bodyweight',  // Donkey Kick
  cv05: 'bodyweight', // Bodyweight Calf Raise
  co05: 'bodyweight', // Russian Twist
  co07: 'bodyweight', // Dead Bug
  co09: 'bodyweight', // Sit-Up
  co10: 'bodyweight', // Leg Raise
  co11: 'bodyweight', // Bicycle Crunch
  co02: 'bodyweight', // Hanging Leg Raise
  co04: 'bodyweight', // Ab Wheel Rollout
  // timed holds — duration-logged, no e1RM
  co01: 'timed',      // Plank
  co12: 'timed',      // Side Plank
  f04: 'timed',       // Plate Pinch Hold
  // band — load not a comparable number
  s11: 'band',        // Band Pull-Apart
  g06: 'band',        // Banded Hip Thrust
  f06: 'band',        // Band Wrist Extension
  co06: 'band',       // Pallof Press (usesWeight false)
  // assisted machines — logged weight is ASSISTANCE; more weight = easier.
  // e1RM on these rewards regression. Hard exclude.
  b11: 'assisted',    // Assisted Pull-up Machine
  tr08: 'assisted',   // Assisted Dip Machine
};

/** Max plausible load (lbs) per exercise id. null = excluded (see PR_EXCLUSION_REASON). */
export const MAX_PLAUSIBLE_LOAD_LBS: Record<string, number | null> = {
  // ── Chest ─────────────────────────────────────────────
  c01: 700,   // Barbell Bench Press
  c01a: 700,  // Bench Press (Wide Grip)
  c01b: 600,  // Bench Press (Reverse Grip)
  c02: 600,   // Incline Barbell Bench Press
  c02b: 600,  // (alias → c02)
  c03: 220,   // Dumbbell Bench Press (per hand)
  c04: 200,   // Incline Dumbbell Press (per hand)
  c05: 200,   // Cable Chest Fly (per side)
  c05a: 200,  // Cable Fly (High to Low)
  c05b: 200,  // Cable Fly (Low to High)
  c05c: 200,  // Cable Fly (Mid Cable)
  c05d: 200,  // (alias → c05b)
  c06: 120,   // Dumbbell Chest Fly (per hand)
  c06a: 120,  // (alias → c06)
  c07: 600,   // Machine Chest Press
  c08: null,  // Push-Up (bodyweight)
  c09: 700,   // Decline Bench Press
  c10: 700,   // Smith Machine Bench Press
  c11: 600,   // Incline Machine Press
  c12: 600,   // Smith Machine Incline Press
  c13: 400,   // Pec Deck
  c14: 400,   // Machine Fly
  c15: 200,   // Incline Cable Fly
  c16: 220,   // Decline Dumbbell Press (per hand)
  c17: 150,   // Dumbbell Pullover

  // ── Back ──────────────────────────────────────────────
  b01: 500,   // Barbell Row
  b01a: 500,  // Barbell Row (Overhand Wide)
  b01b: 500,  // Barbell Row (Overhand Narrow)
  b01c: 500,  // Barbell Row (Underhand)
  b02: 1000,  // Deadlift
  b12: 1000,  // Trap Bar Deadlift
  b13: 1100,  // Rack Pull (supra-max by design)
  b03: null,  // Pull-Up (bodyweight)
  b04: 400,   // Lat Pulldown
  b04a: 400,  // Lat Pulldown (Wide Grip)
  b04b: 400,  // Lat Pulldown (Close Grip)
  b04c: 400,  // Lat Pulldown (Reverse Grip)
  b05: 400,   // Seated Cable Row
  b05a: 400,  // Cable Row (Close Grip)
  b05b: 400,  // Cable Row (Wide Grip)
  b05c: 400,  // Cable Row (Reverse Grip)
  b05d: 250,  // Cable Row (Single Arm)
  b06: 220,   // Dumbbell Row (per hand)
  b06a: 220,  // Dumbbell Row (Pronated Grip)
  b07: 500,   // T-Bar Row
  b08: null,  // Chin-Up (bodyweight)
  b09: 450,   // Machine Row
  b10: 450,   // Chest Supported Row
  b11: null,  // Assisted Pull-up Machine (assisted — excluded)
  b14: 200,   // Straight Arm Pulldown
  b15: 315,   // Meadows Row
  b16: 405,   // Seal Row

  // ── Shoulders ─────────────────────────────────────────
  s01: 450,   // Overhead Press
  s02: 180,   // Dumbbell Shoulder Press (per hand)
  s03: 100,   // Dumbbell Lateral Raise (per hand)
  s03b: 100,  // (alias → s03)
  s04: 100,   // Cable Lateral Raise (single arm)
  s05: 250,   // Face Pull
  s06: 100,   // Reverse Dumbbell Fly (per hand)
  s07: 150,   // Arnold Press (per hand)
  s08: 500,   // Machine Shoulder Press
  s09: 250,   // Machine Lateral Raise
  s10: 100,   // Leaning Cable Lateral Raise
  s10a: 100,  // Cable Rear Delt Fly
  s11: null,  // Band Pull-Apart (band)
  s12: 300,   // Reverse Pec Deck
  s13: 500,   // Smith Machine Press
  s14: 120,   // Cable Front Raise
  s15: 100,   // Dumbbell Front Raise (per hand)
  s16: 185,   // Barbell Front Raise
  s17: 100,   // Plate Front Raise
  s18: 100,   // Rear Delt Fly (per hand)
  s19: 250,   // (alias → s05)
  s20: 100,   // Seated Rear Delt Fly (per hand)

  // ── Biceps ────────────────────────────────────────────
  bi01: 275,  // Barbell Curl
  bi02: 120,  // Dumbbell Curl (per hand)
  bi02a: 120, // Dumbbell Curl (Supinated)
  bi02b: 120, // Dumbbell Curl (Pronated)
  bi03: 120,  // Hammer Curl (per hand)
  bi04: 200,  // Preacher Curl
  bi05: 200,  // Cable Curl
  bi06: 100,  // Incline Dumbbell Curl (per hand)
  bi07: 250,  // Machine Bicep Curl
  bi08: 250,  // Preacher Curl Machine
  bi09: 120,  // Cross Body Hammer Curl (per hand)
  bi10: 200,  // Rope Hammer Curl
  bi11: 100,  // Concentration Curl (per hand)
  bi12: 150,  // Bayesian Curl
  bi13: 275,  // EZ Bar Curl
  bi14: 275,  // EZ Bar Curl (Wide Grip)
  bi15: 200,  // Cable Curl (Rope)
  bi16: 185,  // Spider Curl

  // ── Triceps ───────────────────────────────────────────
  tr01: 300,  // Tricep Pushdown
  tr01a: 300, // Tricep Pushdown (Rope)
  tr01b: 300, // Tricep Pushdown (Straight Bar)
  tr01c: 300, // Tricep Pushdown (V-Bar)
  tr01d: 300, // Tricep Pushdown (Reverse Grip)
  tr02: 200,  // Overhead Tricep Extension
  tr02a: 200, // Overhead Tricep Extension (Rope)
  tr02b: 100, // Overhead Tricep Extension (Single Arm)
  tr03: 250,  // Skull Crushers
  tr03b: 250, // (alias → tr03)
  tr04: 600,  // Close-Grip Bench Press
  tr04b: 600, // (alias → tr04)
  tr05: 60,   // Dumbbell Tricep Kickback (per hand)
  tr06: null, // Dips (bodyweight)
  tr06b: null,
  tr07: 500,  // Machine Dip
  tr08: null, // Assisted Dip Machine (assisted — excluded)
  tr09: 400,  // Tricep Press Machine
  tr10: 300,  // Machine Tricep Extension
  tr11: 600,  // Smith Machine Close Grip
  tr12: 200,  // Cable Overhead Tricep Extension
  tr13: 250,  // EZ Bar Skull Crusher
  tr14: 100,  // Dumbbell Skull Crusher (per hand)
  tr15: null, // Diamond Push-Up (bodyweight)

  // ── Quads ─────────────────────────────────────────────
  q01: 1000,  // Back Squat
  q02: 700,   // Front Squat
  q03: 1500,  // Leg Press (sled + plates get absurd legitimately)
  q04: 400,   // Leg Extension
  q05: 1000,  // Hack Squat
  q06: 150,   // Bulgarian Split Squat (per hand)
  q07: 150,   // Goblet Squat
  q08: 150,   // Walking Lunge (per hand)
  q09: 800,   // Smith Machine Squat
  q10: 800,   // Leg Press (Single Leg)
  q11: 150,   // Reverse Lunge (per hand)
  q12: 150,   // Step Up (per hand)
  q13: 250,   // Leg Extension (Single Leg)
  q14: 150,   // Cable Leg Extension

  // ── Hamstrings ────────────────────────────────────────
  h01: 700,   // Romanian Deadlift
  h02: 300,   // Leg Curl
  h03: 600,   // Stiff-Leg Deadlift
  h03b: 600,  // (alias → h03)
  h04: 200,   // Dumbbell Romanian Deadlift (per hand)
  h05: null,  // Nordic Hamstring Curl (bodyweight)
  h05b: null,
  h06: 150,   // Kettlebell Swing
  h07: 300,   // Lying Leg Curl
  h08: 300,   // Seated Leg Curl
  h09: null,  // Swiss Ball Leg Curl (bodyweight)
  h10: 300,   // Standing Leg Curl
  h11: 150,   // Single Leg RDL (per hand)
  h12: 400,   // Good Morning

  // ── Glutes ────────────────────────────────────────────
  g01: 900,   // Hip Thrust
  g02: null,  // Glute Bridge (bodyweight)
  g03: 300,   // Cable Pull-Through
  g04: 1000,  // Sumo Deadlift
  g05: 100,   // Cable Kickback
  g06: null,  // Banded Hip Thrust (band)
  g07: 800,   // Hip Thrust Machine
  g08: 800,   // Glute Drive Machine
  g09: null,  // Donkey Kick (bodyweight)
  g10: 400,   // Abduction Machine

  // ── Calves ────────────────────────────────────────────
  cv01: 1000, // Standing Calf Raise
  cv02: 400,  // Seated Calf Raise
  cv03: 150,  // Dumbbell Calf Raise (per hand)
  cv04: 1500, // Leg Press Calf Raise
  cv05: null, // Bodyweight Calf Raise
  cv06: 800,  // Smith Machine Calf Raise
  cv07: 300,  // Single-Leg Calf Raise
  cv08: 1000, // (alias → cv01)
  cv09: 500,  // Barbell Calf Raise

  // ── Core ──────────────────────────────────────────────
  co01: null, // Plank (timed)
  co02: null, // Hanging Leg Raise (bodyweight)
  co03: 300,  // Cable Crunch
  co04: null, // Ab Wheel Rollout (bodyweight)
  co05: null, // Russian Twist (bodyweight)
  co06: null, // Pallof Press (band/no-weight)
  co07: null, // Dead Bug (bodyweight)
  co08: 100,  // Weighted Crunch
  co09: null, // Sit-Up (bodyweight)
  co10: null, // Leg Raise (bodyweight)
  co11: null, // Bicycle Crunch (bodyweight)
  co12: null, // Side Plank (timed)
  co13: 150,  // Cable Woodchop

  // ── Traps ─────────────────────────────────────────────
  tp01: 800,  // Barbell Shrug
  tp02: 220,  // Dumbbell Shrug (per hand)
  tp03: 300,  // Upright Row
  tp04: 500,  // Cable Shrug
  tp05: 300,  // Farmer Carry (per hand)
  tp06: 200,  // Kettlebell Shrug
  tp07: 800,  // (alias → tp01)
  tp08: 800,  // Smith Machine Shrug

  // ── Forearms ──────────────────────────────────────────
  f01: 200,   // Wrist Curl
  f02: 150,   // Reverse Wrist Curl
  f03: 150,   // Reverse Curl
  f04: null,  // Plate Pinch Hold (timed)
  f05: 100,   // Dumbbell Wrist Curl (per hand)
  f06: null,  // Band Wrist Extension (band)
};

/** Ceiling lookup that resolves aliases first. Returns null for excluded exercises. */
export function maxPlausibleLoadLbs(exerciseId: string): number | null {
  const canonical = canonicalExerciseId(exerciseId);
  return MAX_PLAUSIBLE_LOAD_LBS[canonical] ?? MAX_PLAUSIBLE_LOAD_LBS[exerciseId] ?? null;
}

# ADAPTIVE FITNESS COACH — CLAUDE CONTEXT
<!-- DO NOT CHANGE THE FILENAME -->
<!-- Last updated: April 2026 — Goal-First Programming + Workout Experience Sprint -->

---

## PROJECT OVERVIEW

**App:** Adaptive Fitness Coach — iOS/Android subscription SaaS  
**Stack:** React Native + Expo, Supabase, RevenueCat, Claude API, Zustand  
**Supabase tables:** users, user_profiles, goals, plans, workout_logs, macro_plans, weekly_summaries, macro_logs, weight_logs, meal_suggestions  
**Config files:** Lib/supabase.ts, Lib/RevenueCat.ts  
**Edge Functions:** generate-plan, coaching-feedback, weekly-coach-summary, generate-next-week, adjust-macros, generate-meals  
**Key files:** constants/design.ts, constants/exerciseLibrary.ts, constants/ingredientLibrary.ts, components/MealBuilderModal.tsx, components/ExerciseCard.tsx, components/WorkoutResultsModal.tsx, navigation/types.ts, utils/splitRecommendation.ts

---

## BUILD STATUS

### Phase 1 — Foundation ✅ Complete
S01 Splash, S02 Goal Selection, S02b Goal Details, S03 Experience & Schedule, S03b RPE Education, S04 Constraints & Equipment, S05 Body Metrics, S06 Macro Setup, S07 Plan Preview + Paywall, S07b Building Plan

### Phase 2 — Core Loop ✅ Complete
S15 Weekly Coach Summary, Adaptive coaching engine, S13 Progress Charts, S16 Macro Tracker, S12 Exercise Library, S14 Goal Tracker, Tab navigation, S17 Profile & Settings, S18 Subscription Management

### Phase 3 — Engagement ✅ Complete
S19 Notifications, Stats, Jordan persona, Bodyweight logging, AI macro adjustment, Meal suggestions, Meal builder, Dashboard polish

### Design Upgrade ✅ Complete — April 2026
### Coaching Engine Sprint ✅ Complete — April 2026
### Onboarding Upgrade Sprint ✅ Complete — April 2026

### Goal-First Programming Sprint ✅ Complete — April 2026
- Split picker removed — Jordan prescribes structure based on goal + experience + days + priority muscles
- utils/splitRecommendation.ts: full decision tree, 12-split library, session structure mapping
- Programming matrix: 2D goal × experience (sets, reps, RPE, rest, volume)
- Exercise library: movementPattern, category, secondaryMuscles, rotationGroup, usesWeight tags
- S02b: training history + split history inputs
- S03: Jordan structure card, split badge + info modal, Adjust mode with advanced splits
- Priority muscle overrides: leg/arm/upper dominant routing
- sessionStructure maps to selectedDays — count always matches

### Workout Experience Sprint ✅ Complete — April 2026
- Warmup sets auto-generated for compounds ≥95 lbs
- Self-select Week 1: targetWeight=0, user picks own weight at RPE target
- WorkoutResultsModal: completed day sets/RPE/volume/energy
- Last week strip + trend indicator on ExerciseCard
- Core/bodyweight/timed exercise support
- Jordan welcome: 4-sentence "I'm Jordan…" introduction
- Fatigue: 1=😴Wiped 2=😤Tired 3=😊Good 4=💪Strong 5=🔥Beast Mode
- workout_logs uses logged_at (not created_at)
- plans status: active / completed / paused (not inactive)

### Current Phase
TestFlight build + outstanding issues (see end of document)

---

## DESIGN SYSTEM

`constants/design.ts` is the single source of truth.

```ts
// Import pattern
import { Colors, Fonts, FontSizes, Spacing, Radius, CommonStyles } from '../constants/design';
// Onboarding screens:
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';
```

### Colors
```
bgPrimary='#09090B'  bgCard='#111113'  bgElevated='#1C1C1E'
accent='#F97316'  accentMuted='rgba(249,115,22,0.12)'  accentBorder='rgba(249,115,22,0.4)'
textPrimary='#FAFAFA'  textSecondary='#A1A1AA'  textTertiary='#52525B'
success='#22C55E'  successMuted='rgba(34,197,94,0.12)'
warning='#F59E0B'  warningMuted='rgba(245,158,11,0.12)'
danger='#EF4444'  dangerMuted='rgba(239,68,68,0.12)'
divider='#27272A'  border='#3F3F46'  overlay='rgba(0,0,0,0.7)'
```

### Typography & Radius
```
FontSizes: micro(10) label(11) caption(13) body(15) title(17) heading2(20) heading1(26) display(32)
Radius: sm(8) md(12) lg(16) xl(20) xxl(24) full(9999)
```

### Design Rules
- StyleSheet.create only — no inline styles except dynamic values
- No hardcoded hex — Colors.* exclusively
- No fontWeight — Fonts.* fontFamily only
- Primary buttons: height 56, Radius.lg, Colors.accent
- Section headings: FontSizes.label, Fonts.bold, Colors.textSecondary, letterSpacing 1.5, uppercase
- Cards: bgCard, Radius.lg, borderWidth 1, divider
- Jordan cards: bgCard + borderLeftWidth 3 + borderLeftColor accent
- Back chevrons: "‹" fontSize 28, Fonts.bold, Colors.accent

---

## NAVIGATION STRUCTURE

### Tab Navigator (5 tabs)
```
Home → HomeScreen, WeeklyCoachSummary
Workout → WorkoutHomeScreen, PlanView, ActiveWorkout, WorkoutComplete, ExerciseLibrary
Progress → ProgressCharts, GoalTracker
Nutrition → MacroTracker
Profile → ProfileSettings, SubscriptionManagement, NotificationsSettings
```

### Root Stack
```
Splash → Onboarding → GoalDetails → Experience → RPEEducation →
Constraints → BodyMetrics → MacroSetup → PlanPreview → BuildingPlan → MainTabs
```

### Critical Navigation Patterns
```ts
// WeeklyCoachSummary (via reset — no back stack)
navigation.reset({ index: 0, routes: [{ name: 'MainTabs',
  state: { routes: [{ name: 'HomeTab',
    state: { routes: [{ name: 'WeeklyCoachSummary', params: { planId, weekNumber } }] } }] } }] })

// PlanView from WorkoutComplete — MUST go through tab navigator
navigation.navigate('MainTabs', { screen: 'WorkoutTab', params: { screen: 'PlanView' } })
// NOT: navigation.navigate('PlanView') ← broken

// WeeklyCoachSummary back button
navigation.navigate('MainTabs') // NOT goBack()
```

---

## ONBOARDING — KEY BEHAVIOURS

**Step counter:** S02=1, S02b=2, S03=3, S03b=4, S04=5, S05=6, S06=7, S07=8. BuildingPlan has no step.

### S02b GoalDetailsScreen
**Strength additions:**
- Training background chips (optional): New / Following general / Already strength / Powerlifting
- New to training → strength_3x (3× lift frequency), existing strength → strength_2x

**Hypertrophy additions:**
- Current split chips (optional) + duration chips (< 3mo / 3–6mo / 6+ months)
- 6+ months on same split → structural novelty flag
- "Other" → text input, no novelty override

### S03 ExperienceScreen
- Day-of-week picker: 7 pills Mon–Sun, min 2, sorted Mon→Sun
- daysPerWeek = selectedDays.length (derived)
- Jordan structure card replaces split chips:
  - Split name badge + ⓘ info modal
  - Session list: day label + title + muscle chips
  - Jordan rationale in italic quotes
  - "Looks good →" → structureConfirmed = true → Continue enabled
  - "Adjust" → context chips based on experience + days
  - structureConfirmed resets on selectedDays/experience change
- Adjust options by experience:
  - Advanced 6d: PPL / Arnold Split / Batman Split / Let Jordan decide
  - Advanced 4d: PHUL / Upper/Lower / Let Jordan decide
  - Advanced 5d: PPL + Upper / Upper/Lower / Let Jordan decide
  - Intermediate 6d: PPL / Upper/Lower / Let Jordan decide
  - Beginner: More upper / More lower / More full body / Let Jordan decide
- Params out: all prior + splitId, splitName, splitRationale, sessionStructure, currentSplit, splitDuration, trainingBackground

### S03b RPEEducationScreen
- Read-only, step 4 of 8
- RPE 6 (Too Easy/success), RPE 8 (Working Hard/warning), RPE 10 (Max Effort/danger)
- "Got It →" → navigate('Constraints', { ...route.params })

### Split Recommendation (utils/splitRecommendation.ts)
**Decision order:**
1. Strength → early return (strength_2x/3x based on experience/background)
2. Beginner → early return (full_body_beginner ≤3d, upper_lower 4+d)
3. Base from experience × days matrix
4. Priority muscle overrides (arm > leg > upper dominant)
5. Structural novelty (6+ months same split → force different structure)

**Priority muscle overrides:**
- isArmDominant (≥2 arm muscles) + 6d advanced → batman
- isArmDominant + 5d → ppl_upper (arm focus)
- isArmDominant + 4d → upper_lower (arm focus upper day)
- isLegDominant (≥2 leg muscles) + 5d → ppl_leg_focus
- isLegDominant + 4d → leg_focus
- isLegDominant + 6d → base split + leg note appended
- isUpperDominant (≥3 upper, not leg/arm) + 4d → upper_focus
- isUpperDominant + 5d → ppl_upper

**sessionStructure + selectedDays:**
mapSessionsToDays() assigns workout sessions to actual selected days. Workout count always equals selectedDays.length. Rest days fill gaps.

---

## PLAN_JSON STRUCTURE

```
plan_json (top level):
  title, totalWeeks, daysPerWeek, goal, split, currentWeek
  jordanWelcome: string
  weeks: WeekObject[]

WeekObject:
  weekNumber
  phase: 'baseline' | 'accumulation' | 'intensification' | 'deload'
  days: DayObject[]

DayObject:
  dayNumber, type: 'workout' | 'rest', title, sessionFocus
  muscleGroups: string[], exercises: ExerciseObject[]

ExerciseObject:
  id, name, muscleGroup (Capitalised — .toLowerCase() for lookups)
  sets, reps (string), targetWeight (0 = self-select Week 1)
  restSeconds, targetRpe, coachingNote
  plateaued?, plateauResponse?, plateauWeeks?

sets_json (workout_logs):
  exerciseId, setNumber
  weightLbs ⚠️ NOT weight. 0 = bodyweight
  reps
  rpe ⚠️ 0 = not logged
  swapped: boolean
```

### Phase Rules
- Week 1: always 'baseline' — forced in normalize step
- effectivePhase fallback: week 1 + missing/accumulation → 'baseline'
- Phase badge colors: baseline=accent, accumulation=success, intensification/deload=warning

### Week 1 Self-Select (non-strength)
- targetWeight: 0 for all Week 1 exercises
- ExerciseCard: editable "Choose weight" input (NOT "Bodyweight" static text)
- Jordan strip: "Choose a weight at RPE [X] — log it and I'll build Week 2 from there."
- Warmup hint when enteredWeight===0: "💡 Enter your weight above to see warm-up sets"
- Warmup appears dynamically as user types
- generate-next-week: priorTargetWeight===0 → use avgLoggedWeight as baseline

### jordanWelcome (4 sentences always)
1. "I'm Jordan, your AI coach for the next X weeks."
2. Goal-specific with user's exact numbers/muscles
3. Week 1 calibration explanation
4. Forward action — RPE data → Week 2 personalisation
- Muscles: lowercase with "and" not comma-separated caps
- Never: Great / Excited / Crush it / Amazing

---

## EXERCISE LIBRARY (constants/exerciseLibrary.ts)

```ts
interface Exercise {
  id: string
  name: string
  muscleGroup: string
  secondaryMuscles: string[]
  movementPattern: MovementPattern
  category: 'primary_compound' | 'secondary_compound' | 'isolation'
  equipment: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  usesWeight: boolean
  rotationGroup: string
  rotationPriority: number
}
```

**usesWeight: false:** Plank, Ab Wheel, Pallof Press, Push-up variants, Hanging Leg Raise, bodyweight pull-up/dip  
**usesWeight: true:** all loaded exercises including cable/machine

### Exercise Enrichment (ActiveWorkoutScreen)
Plan_json exercises must be enriched with library data at load time. Without enrichment: category/movementPattern=undefined → warmup never shows.

```ts
function enrichExerciseWithLibraryData(planExercise: any) {
  const lib = EXERCISES.find(e => e.name.toLowerCase() === planExercise.name.toLowerCase())
  return { ...planExercise, ...lib,
    // plan data takes priority:
    name: planExercise.name, targetWeight: planExercise.targetWeight,
    sets: planExercise.sets, reps: planExercise.reps, id: planExercise.id }
}
```

---

## EXERCISECARD — KEY BEHAVIOURS

### Warmup Sets
- Shows for: primary_compound / secondary_compound (or horizontal/vertical/squat/hinge movementPattern) with effectiveWeight ≥ 95 lbs
- effectiveWeight = enteredWeight (self-select) OR exercise.targetWeight (normal)
- W1: 40%×10, W2: 60%×5, W3: 80%×3. Min 45 lbs, round to 5 lbs
- Display only — not logged. Collapsible (AsyncStorage, resets per session)

### usesWeight vs Self-Select vs Bodyweight
```
usesWeight=false → "Bodyweight" static text, no weight input (Plank, Push-up etc)
usesWeight=true + targetWeight=0 + week===1 + goal!=='strength' → "Choose weight" editable input
usesWeight=true + targetWeight>0 → normal pre-filled weight input
```

### Timed Exercises
- Detected: reps string matches /second|sec|s$|\d+s\b/i
- "Done" button logs fixed duration as reps, weightLbs=0
- Display: "45 sec" (abbreviated, not "45 seconds")

### Inline RPE Row
- 1-10 below active set, appears on RPE badge tap
- 1–4: success, 5–7: warning, 8–10: danger

### Last Week Strip
- Shows when previousSets.length > 0
- "LAST WEEK" + best set + all sets inline ("225×8  225×8  RPE 7.2 avg")
- BW×N for zero weight, "(swapped)" if any swapped

### Trend Indicator (2s ephemeral)
- ↑ more weight → success green
- ↑ more reps same weight → success green
- = same → textSecondary
- ↓ less weight → warning
- last=0, current>0 → "First weighted session — baseline set at X lbs" (accent)

### Set Completion Circle
- Same style for all: idle=bgElevated+border+"✓"textTertiary, complete=accent+"✓"textPrimary

---

## WORKOUT RESULTS MODAL (components/WorkoutResultsModal.tsx)

### Summary Strip
- AVG RPE: avg of rpe>0. Color: <6=success, 6-8=warning, >8=danger
- VOLUME: sum(weightLbs×reps). ≥1000 → "X.Xk lbs"
- ENERGY (not FATIGUE): session_fatigue_rating
  - 1=😴Wiped, 2=😤Tired, 3=😊Good, 4=💪Strong, 5=🔥Beast Mode

### Exercise Grouping
Primary: by exerciseId → fallback: name match → raw fallback: all sets ungrouped  
Empty state: "📋 No data yet / Complete this workout to see your results here."

### Set Display
```ts
weightLbs===0 && reps>20 → "${reps} sec"
weightLbs===0 → "Bodyweight × ${reps}"
else → "${weightLbs} lbs × ${reps}"
```

---

## DASHBOARD — KEY BEHAVIOURS

- useFocusEffect (not useEffect)
- Generate Next Week CTA logic:
  ```ts
  const nextWeekExists = weeks.some(w => w.weekNumber === nextWeekNumber)
  const weekHasAdvanced = dbCurrentWeek > planJsonCurrentWeek
  showCTA = isWeekComplete && !nextWeekExists && !weekHasAdvanced && currentWeek < totalWeeks
  ```

---

## SUPABASE EDGE FUNCTIONS

All: JWT **DISABLED**, Model: `claude-sonnet-4-6`. Disable JWT after every deploy.

### generate-plan — JWT: DISABLED
**New request body fields (v1.9):**
```ts
splitId, splitName, splitRationale,
sessionStructure: SessionDay[],  // Claude fills exercises, never determines structure
weightLbs,                       // for bodyweight-based estimation
currentSplit?, splitDuration?, trainingBackground?
```

**Week 1 weights:**
- Strength: current1RM × 0.75
- Non-strength: targetWeight=0 (self-select). Never guess specific weights.

**actualDaysPerWeek:**
```ts
sessionStructure.filter(d => d.type === 'workout').length
```
Always use this, not the daysPerWeek param.

### generate-next-week — JWT: DISABLED
**Self-select Week 1 → Week 2:**
```ts
if (priorTargetWeight === 0) {
  avgLoggedWeight = calculateAvgLoggedWeight(sets)
  // Use as new baseline, increase if rpeIsLow
}
```

---

## PROGRAMMING MATRIX (Goal × Experience)

| Goal | Beg Sets | Int Sets | Adv Sets | Rep Range | Beg RPE | Int RPE | Adv RPE |
|---|---|---|---|---|---|---|---|
| Strength | 3 | 4–5 | 5–6 | 1–5 | 6–7 | 7–8 | 8–9 |
| Hypertrophy | 3 | 4 | 4–5 | 6–15 | 6–7 | 7–8 | 8–9 |
| Recomp | 2–3 | 3 | 3–4 | 8–15 | 6 | 7 | 7–8 |
| Fat Loss | 2–3 | 3 | 3–4 | 10–20 | 6 | 7 | 7–8 |
| General | 2–3 | 3 | 3–4 | 8–12 | 6 | 7 | 7–8 |

Rest: Strength 180–300s, Hypertrophy 60–90s, Recomp 45–75s, Fat Loss 30–60s, General 60–90s

Volume landmarks: Beginner 6–12 sets/muscle/week, Intermediate 10–18, Advanced 14–22

---

## SPLIT LIBRARY

| splitId | Display | Days | Best For |
|---|---|---|---|
| full_body_beginner | Full Body | 3 | True beginners |
| full_body_advanced | Full Body | 3 | Advanced, low days |
| upper_lower | Upper / Lower | 4 | Intermediate all goals |
| phul | PHUL | 4 | Advanced intermediate hypertrophy |
| ppl_upper | PPL + Upper | 5 | Intermediate-Advanced |
| ppl | PPL | 6 | Intermediate-Advanced |
| ppl_leg_focus | PPL + Leg Focus | 5 | Leg-dominant |
| leg_focus | Leg Focus | 4 | Leg-dominant |
| upper_focus | Upper Focus | 4 | Upper-dominant |
| arnold | Arnold Split | 6 | Advanced hypertrophy |
| batman | Batman Split | 6 | Advanced, lagging arms |
| strength_2x | Strength Focus | 3–5 | Strength intermediate/advanced |
| strength_3x | Strength Focus | 5–6 | Strength beginner |

---

## DATABASE SCHEMA

### workout_logs
| Column | Notes |
|---|---|
| logged_at | timestamptz — ⚠️ use in .order(), NOT created_at |
| day_number | from plan_json dayNumber (1-indexed, resets per week) |
| session_fatigue_rating | 1=Wiped 2=Tired 3=Good 4=Strong 5=Beast Mode |
| sets_json | jsonb — weightLbs (not weight), rpe=0 means not logged |

⚠️ Always: `.order('logged_at', { ascending: false })` on workout_logs  
⚠️ Never: `.order('created_at')` on workout_logs — column doesn't exist

### plans
⚠️ Status constraint: active / completed / paused ONLY ('inactive' is invalid)  
⚠️ Cleanup: `UPDATE plans SET status='paused' WHERE status='active' AND id NOT IN (...)`

### planId source
⚠️ Always derive planId from fresh Supabase query — never from route.params or cached values. Stale planId = previous week fetch returns empty.

### SQL Migrations
```sql
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS training_days text[] DEFAULT '{}';

CREATE POLICY "Users can view own workout logs" ON workout_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own plans" ON plans
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own weekly summaries" ON weekly_summaries
  FOR SELECT USING (auth.uid() = user_id);

-- Cleanup duplicate active plans
UPDATE plans SET status='paused' WHERE status='active' AND id NOT IN (
  SELECT DISTINCT ON (user_id) id FROM plans
  WHERE status='active' ORDER BY user_id, created_at DESC);
```

---

## KNOWN ISSUES / NOTES

- Lib/ uses capital L — imports must be 'Lib/supabase'
- RevenueCat entitlement: 'pro' | web bypass: Platform.OS === 'web'
- ALL Edge Functions JWT: DISABLED | Model: 'claude-sonnet-4-6'
- user_profiles: always query with .order('id',{ascending:false}).limit(1).maybeSingle()
- Weight log dates: new Date(log_date + 'T00:00:00')
- Lift names: snake_case in DB → formatLiftName() for display
- jordanWelcome/sessionFocus/phase: only in plans post-April 2026, older plans fallback gracefully
- DEV button in ProfileSettings when __DEV__ === true

---

## RULES FOR THIS PROJECT

- React Native + Expo only, TypeScript everywhere
- All DB calls through Lib/supabase.ts
- All Claude API calls through Edge Functions only
- Never hardcode API keys or hex color strings
- Screens in /screens, components in /components
- Register every new screen in navigation/index.tsx AND navigation/types.ts
- planId always from fresh Supabase query, never from route.params

---

## HOW WE WORK

- Claude writes Cursor/Composer prompts, developer pastes
- Opus 4.6 for complex screens and prompt engineering
- Sonnet 4.6 for fixes, Edge Functions, simple screens
- Composer 2 for all multi-file tasks and screen redesigns
- Commit after every completed feature

---

## PHASE 4 PRIORITIES

- TestFlight build (after outstanding issues resolved)
- Post-Week-1 Jordan message in weekly-coach-summary
- Apple Health / Google Fit / MyFitnessPal integrations
- Plan graduation + cross-plan memory
- Transparent adaptation reasoning (tap weight → see why)
- Pyramid/wave loading for advanced users
- Beginner exercise education (cue cards + difficulty gating)

---

## DEFERRED FEATURES

- Bodyweight goal in onboarding
- Metric unit toggle (v1.2)
- Social features, cardio plans, web app
- Nutrition trend chart
- Multiple Jordan tone settings
- Missed session check-in / Readiness score
- Current lifts input in BodyMetrics

---

## OUTSTANDING ISSUES (April 8 2026)

### 🔴 Not yet addressed

**1. Lagging Areas in S04 is redundant**
S02b already collects priority muscles. Remove the Lagging Areas section from ConstraintsScreen entirely. Keep: Equipment, Current Injuries, Exercises to Avoid.

**2. Session length not wired to generate-plan prompt**
Collected in onboarding but Claude receives no instruction on what to do with it.
Add to prompt:
- 30–45 mins → max 4 exercises per session, shorter rest, supersets where possible
- 45–60 mins → standard 5–6 exercises, normal rest
- 60–90 mins → full exercise list, standard rest
- 90+ mins → full volume, longer rest for strength, additional isolation work

**3. Pyramid/wave loading for advanced users**
Straight sets correct for beginner/intermediate. Advanced users benefit from pyramid (ramp to top set + back-off). Requires generate-plan, generate-next-week, and ExerciseCard changes. Deferred post-TestFlight.

**4. Beginner exercise education**
- Cue cards: `cues: string[]` on each exercise (3-bullet "how to"), shown by default for beginners
- Beginner coachingNote: form cues first not load instructions
- Difficulty gating: beginners only get beginner/intermediate exercises

**5. Post-Week-1 Jordan summary message**
weekly-coach-summary after Week 1 should close the calibration loop. "Baseline week done — here's what I learned from your RPE and how Week 2 differs."

### 🟡 Submitted but needs verification

**6. Generate Week 2 CTA persisting**
Fix submitted (nextWeekExists + weekHasAdvanced check). Verify after duplicate plans resolved.

**7. Last week strip on Week 2**
Verify after SQL cleanup that previousSetsMap populates correctly when single active plan exists.

**8. daysPerWeek showing wrong count**
sessionStructure now maps to selectedDays. Verify with fresh plan that plan info shows correct day count.

### 🟢 Fixed this session
workout_logs logged_at ✅ | Results modal ✅ | Fatigue emoji ✅ | Warmup sets ✅ | Self-select Week 1 ✅ | Core/bodyweight/timed ✅ | Jordan welcome intro ✅ | Split recommendation by experience + priority muscles ✅ | Arnold/Batman/PHUL ✅ | Structural novelty ✅ | Split info modal ✅ | Adjust menu ✅ | Duplicate active plans SQL ✅ | plans status constraint documented ✅

---

## DO NOT CHANGE

The filename — it must remain `CLAUDE_CONTEXT.md`
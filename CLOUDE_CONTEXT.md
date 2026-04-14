# ADAPTIVE FITNESS COACH — CLAUDE CONTEXT
<!-- DO NOT CHANGE THE FILENAME -->
<!-- Last updated: April 2026 — v1.18 Near-Release Beta Reframe + Gap Expansion -->

---

## PROJECT OVERVIEW

**App:** Adaptive Fitness Coach — iOS/Android subscription SaaS
**Stack:** React Native + Expo, Supabase, RevenueCat, Claude API, Zustand
**Supabase tables:** users, user_profiles, goals, plans, workout_logs, macro_plans, weekly_summaries, macro_logs, weight_logs, meal_suggestions, cardio_logs (Phase 4), free_sessions (Phase 4), body_measurements (Phase 4)
**Config files:** Lib/supabase.ts, Lib/RevenueCat.ts
**Edge Functions:** generate-plan, coaching-feedback, weekly-coach-summary, generate-next-week, adjust-macros, generate-meals, generate-final-review, adjust-next-session (Phase 4), adjust-for-injury (Phase 4), adjust-equipment-session (Phase 4)
**Key files:** constants/design.ts, constants/exerciseLibrary.ts, constants/ingredientLibrary.ts, components/MealBuilderModal.tsx, components/ExerciseCard.tsx, components/WorkoutResultsModal.tsx, navigation/types.ts, utils/splitRecommendation.ts, utils/projections.ts, components/ProjectionChart.tsx

---

## BUILD STATUS

### Completed Phases
- Phase 1 — Foundation ✅
- Phase 2 — Core Loop ✅
- Phase 3 — Engagement ✅
- Design Upgrade ✅ April 2026
- Coaching Engine Sprint ✅ April 2026
- Onboarding Upgrade Sprint ✅ April 2026
- Goal-First Programming Sprint ✅ April 2026
- Workout Experience Sprint ✅ April 2026
- Projection Charts + Polish Sprint ✅ April 8 2026
- Post-Review Sprint (v1.14) ✅ April 9 2026 — All P0 + P1 resolved
- Beta Sprint Partial (v1.17) ✅ April 2026 — Selected bugs + DC fixes

### Completed in Beta Sprint (v1.17)
| Item | Detail |
|---|---|
| BUG-1 | Volume label "sets" → "lbs", k-suffix formatting |
| BUG-2 | Streak calculation: local date, timezone-safe |
| BUG-3 | Active set highlight tracks first unlogged set |
| BUG-6 | Rest timer reads per-exercise restSeconds with fallbacks |
| DC-1 | Post-deload weight regression: uses Week N-2 baseline |
| DC-2 | Deload RPE override in weekly-coach-summary |
| DC-3 | Ramp-up set baseline: peak weight not average |
| P2-W9 | Energy emoji selected state + Save & Finish gate |
| P2-CX6 | coaching-feedback pulsing skeleton loading state |
| P2-CX4 | Rest timer sound (expo-av) + background notification |

### Current Phase
**Near-Release Beta Sprint (v1.18)** — April 2026
Goal: F&F beta is near-release quality. Users who touch beta should feel like they're using a finished product. See OUTSTANDING ISSUES and 5-Week Sprint Order below.

---

## DESIGN SYSTEM

`constants/design.ts` is the single source of truth.

```ts
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

### Goal Colors
```
fat_loss → #F97316 | hypertrophy → #22C55E | strength → #F59E0B
power_hypertrophy → #F59E0B | recomp → #F97316 | general → #F97316
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
Workout → WorkoutHomeScreen, PlanView, ActiveWorkout, WorkoutComplete, ExerciseLibrary, WorkoutHistory, FreeSession
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
// WeeklyCoachSummary (via reset)
navigation.reset({ index: 0, routes: [{ name: 'MainTabs',
  state: { routes: [{ name: 'HomeTab',
    state: { routes: [{ name: 'WeeklyCoachSummary', params: { planId, weekNumber } }] } }] } }] })

// PlanView from WorkoutComplete
navigation.navigate('MainTabs', { screen: 'WorkoutTab', params: { screen: 'PlanView' } })
// NOT: navigation.navigate('PlanView') ← broken

// WeeklyCoachSummary back
navigation.navigate('MainTabs') // NOT goBack()
```

---

## GOALS

```ts
type Goal = 'fat_loss' | 'hypertrophy' | 'strength' | 'power_hypertrophy' | 'recomp' | 'general'
```

**power_hypertrophy** is a first-class goal added in v1.18. Display name: "Strength & Size". Uses PHUL split by default. Session architecture has two explicit phases:
- Phase 1: Heavy compound (3–6 reps, pyramid sets, RPE 8–9, 3–5 min rest)
- Phase 2: Hypertrophy accessories (8–12 reps, straight sets, RPE 7–8, 90–120s rest)

Both phases track progression independently in generate-next-week.

---

## ONBOARDING — KEY BEHAVIOURS

**Step counter:** S02=1, S02b=2, S03=3, S03b=4, S04=5, S05=6, S06=7, S07=8. BuildingPlan has no step.

### S02 Goal Selection
- Goals: fat_loss, hypertrophy, strength, power_hypertrophy, recomp, general
- power_hypertrophy display: "Strength & Size" with dual projection (1RM + lean mass)

### S02b GoalDetailsScreen
- CTA: Always "Continue" — never "Skip"
- Strength / power_hypertrophy: feasibility card uses `getStrengthProjectionRange()` — range, never flat number
- power_hypertrophy: shows dual projection, no pace selector
- `canReachGoal = high >= gap` (NOT 75% threshold)
- `recommendedWeeks` forwarded through ALL navigation hops

### S03 ExperienceScreen
- Day picker: 7 pills Mon–Sun, min 2, sorted Mon→Sun
- Jordan structure card: split badge + ⓘ modal, session list, rationale (warm tone required)
- "Looks good →" → `structureConfirmed = true` | "Adjust" → context chips
- `structureConfirmed` resets on `selectedDays`/`experience` change
- "Adjust" button: must show micro-hint "Change your days or split"
- **Enhanced Recovery Flag (v1.18):** Optional toggle below experience selector. Visible for Intermediate/Advanced only. Default off. Label: "I recover quickly between sessions and can handle high training volume." Stores `enhancedRecovery: true` in user_profiles. Adjusts volume ceilings and deload frequency in generate-plan. Never references medical protocols.

### S03b RPE Education
- Fast-path "Got It →" button for casual users
- Reword 1RM reference: "Only when pushing your absolute maximum"

### S04 Constraints
- Screen title: "Equipment & Constraints"
- Exercise avoid list: add muscle group context ("Hip Thrust (Glutes)")
- **Concurrent Sport Training (v1.18):** Optional section. Multi-select chip: Martial Arts / Running / Cycling / Swimming / Team Sports / Other. If any selected → days/week picker appears (1/2/3/4+). Stores `concurrentSport: { type: string[], daysPerWeek: number }` in user_profiles. Passed to generate-plan, generate-next-week, weekly-coach-summary, adjust-macros, TDEE calculation. Jordan schedules heavy leg days away from high-intensity sport days.

### S05 Body Metrics
- Verify keyboard doesn't bury fields on real device
- Tab order: ft → in must be seamless
- Add privacy reassurance line
- `biologicalSex` passed to generate-plan and generate-next-week for sex-aware programming

### S06 MacroSetup
- `calorie_pace` stored in `macro_plans`, passed to `generate-plan`
- "These targets will adjust weekly" must be above the fold
- +50/-50 buttons: min 44pt tap target
- Warm pace copy required
- power_hypertrophy goal: no pace selector shown

### S07 PlanPreviewScreen — Layout Order
1. Projection chart (FIRST)
2. Pace read-only badge (fat_loss + hypertrophy only)
3. Jordan context card (hypertrophy + advanced + projectedGain < 2.0 lbs)
4. Goal summary card
5. Sample week
6. Daily nutrition
7. Paywall footer

---

## PLAN_JSON STRUCTURE

```
plan_json: { title, totalWeeks, daysPerWeek, goal, split, currentWeek,
             experience, sessionLength, equipment, jordanWelcome,
             enhancedRecovery, concurrentSport, weeks[] }
WeekObject: { weekNumber, phase, days[] }
DayObject:  { dayNumber, type ('workout'|'rest'|'cardio'), title, sessionFocus,
              muscleGroups, exercises[], sessionPhase?,
              cardioType?, suggestedDurationMinutes? }
ExerciseObject: { id, name, muscleGroup, muscleEmphasis?, isUnilateral?,
                  setStructure ('straight'|'pyramid'|'wave'),
                  sets, reps, targetWeight, restSeconds,
                  targetRpe, coachingNote, difficultyTag?,
                  phase? ('strength'|'hypertrophy'),
                  plateaued?, plateauWeeks? }
sets_json: { exerciseId, setNumber, weightLbs, reps, rpe(0=not logged), swapped }
```

**NEW FIELDS (v1.18):**
- `plan_json.enhancedRecovery: boolean` — passed through to generate-next-week
- `plan_json.concurrentSport: { type: string[], daysPerWeek: number } | null`
- `DayObject.sessionPhase: 'power_hypertrophy' | undefined` — signals two-phase session
- `ExerciseObject.phase: 'strength' | 'hypertrophy' | undefined` — for power_hypertrophy sessions
- `ExerciseObject.muscleEmphasis: string` — sub-muscle targeting (v1.18 data layer)
- `ExerciseObject.isUnilateral: boolean` — affects rep display and volume calc
- `ExerciseObject.setStructure: 'straight' | 'pyramid' | 'wave'`
- `ExerciseObject.difficultyTag: 'beginner' | 'intermediate' | 'advanced'`

Phase: baseline(accent) | accumulation(success) | intensification/deload(warning)
Week 1 always baseline. Deload: every 4th week standard, every 5th week if enhancedRecovery.

---

## DATABASE SCHEMA NOTES

### New Columns (v1.18 — add to user_profiles)
```sql
enhanced_recovery boolean DEFAULT false
concurrent_sport jsonb DEFAULT null
-- concurrent_sport shape: { type: string[], daysPerWeek: number }
```

### Existing Critical Columns
- `session_fatigue_rating` NOT `energy_rating` (400 if wrong)
- `workout_logs.logged_at` NOT `created_at`
- `sets_json.weightLbs` NOT `weight`
- `user_profiles`: always `.order('id',{ascending:false}).limit(1).maybeSingle()`

---

## GENERATE-PLAN PROMPT — REQUIRED FIELDS (v1.18)

```ts
{
  goal,               // includes 'power_hypertrophy' as valid value
  experience,
  sessionStructure,
  equipment,
  sessionLength,
  targetWeeks,
  biologicalSex,      // for sex-aware programming
  enhancedRecovery,   // boolean — adjusts volume ceilings + deload frequency
  concurrentSport,    // { type, daysPerWeek } | null — schedule + calorie context
  allowPyramid,       // true for intermediate/advanced; always true for power_hypertrophy
  muscleEmphasisMap,  // { biceps: 'long_head', ... } from priority muscle flags
  priorityMuscles,    // string[] — lagging muscles needing session architecture changes
  caloriePace,
  macroTargets,
  injuryList,
}
```

**power_hypertrophy session structure prompt instruction:**
```
For power_hypertrophy goal, each workout session must have two explicit phases:
PHASE 1 — STRENGTH (list first): 1-2 heavy barbell/compound exercises, 3-6 reps,
setStructure: 'pyramid', RPE 8-9, rest 180-300s. coachingNote must reference 1RM context.
PHASE 2 — HYPERTROPHY (list second): 3-5 accessory exercises, 8-12 reps,
setStructure: 'straight', RPE 7-8, rest 90-120s. coachingNote must reference size/feel context.
Tag each exercise with phase: 'strength' or phase: 'hypertrophy'.
```

**Exercise selection reasoning prompt instruction:**
```
For every exercise, coachingNote must explain WHY this exercise was chosen for this
specific user — not form cues. Reference the user's goal, experience, priority muscles,
and the exercise's mechanical advantage. Example: "Incline DB Curl — maximizes long-head
stretch, the most effective position for building bicep size from a deficit."
This reasoning appears when the user taps the exercise to understand Jordan's choices.
```

**Sub-muscle targeting prompt instruction (when muscleEmphasisMap present):**
```
User has flagged [muscle] as a priority with emphasis on [muscleEmphasis].
Select exercises that target this emphasis specifically:
- bicep long_head: Incline DB Curl, Bayesian Cable Curl, Overhead Cable Curl
- bicep short_head: Preacher Curl, Spider Curl, Machine Preacher Curl
- lateral delt: Cable Lateral Raise, Leaning Lateral Raise
- tricep long_head: Overhead Cable Extension, Incline Skull Crusher
- chest upper: Low-to-High Cable Fly, Incline Press variations
- lat lower: Straight-Arm Pulldown, Pullover Machine
Weight exercise selection toward muscleEmphasis, include 2+ angles of the same emphasis.
```

**Sex-aware programming prompt instruction:**
```
User biological sex: [biologicalSex]
If female:
  - Add 2 reps to all rep ranges (e.g. 8-12 → 10-14)
  - Volume ceiling: 10-15% higher than male equivalent
  - Deload: week 5 instead of week 4 (faster inter-set recovery)
```

**Enhanced recovery prompt instruction:**
```
User has indicated exceptional recovery between sessions (enhancedRecovery: true).
  - Apply volume at upper end of range + 30-40% above standard advanced ceiling
  - MRV ceiling: 28-36 sets/muscle/week
  - Deload: week 5 instead of week 4
  - coachingNotes may reference recovery capacity where relevant
```

**Concurrent sport prompt instruction:**
```
User also trains [concurrentSport.type] [concurrentSport.daysPerWeek] days/week.
  - Do NOT schedule heavy leg days adjacent to high-intensity sport training days
  - Reduce leg volume on weeks with 3+ sport sessions
  - Jordan notes in weekly summary may reference sport training in recovery context
  - TDEE already adjusted — no prompt action needed for calories
```

---

## GENERATE-NEXT-WEEK PROMPT — REQUIRED CONTEXT (v1.18)

All existing fields plus:
```ts
{
  enhancedRecovery,        // affects deload frequency and volume ceiling
  concurrentSport,         // affects scheduling and recovery assessment
  biologicalSex,           // affects rep ranges and deload timing
  sessionPhase,            // 'power_hypertrophy' → handle Phase 1 + Phase 2 progression separately
}
```

**power_hypertrophy progression instruction:**
```
This plan has two-phase sessions. Track Phase 1 (strength) and Phase 2 (hypertrophy) separately.
Phase 1 progression: use strength goal calculateIncrease() — aggressive, 1RM-oriented.
Phase 2 progression: use hypertrophy goal calculateIncrease() — moderate.
A plateau in Phase 2 does NOT trigger Phase 1 exercise rotation and vice versa.
```

---

## WEEKLY-COACH-SUMMARY PROMPT — REQUIRED CONTEXT (v1.18)

All existing fields plus:
```ts
{
  enhancedRecovery,
  concurrentSport,         // include sport sessions logged this week if available
  biologicalSex,
  isDeloadWeek,            // DC-2 override — deload RPE interpretation
  sessionPhase,            // power_hypertrophy → reference both phase 1 and 2 in summary
}
```

---

## SPLIT LIBRARY

14 splits. `power_hypertrophy` goal defaults to `phul` (4+ days) or `full_body_advanced` with hybrid structure (3 days) or `upper_lower` hybrid (2 days).

```
full_body_beginner, full_body_advanced, upper_lower, phul, ppl_upper, ppl,
ppl_leg_focus, leg_focus, upper_focus, arnold, batman, strength_2x, strength_3x, phyl
```

---

## EXERCISE LIBRARY — NEW FIELDS (v1.18)

All exercises in `constants/exerciseLibrary.ts` require:
```ts
{
  id: string,
  name: string,
  muscleGroup: string,
  muscleEmphasis: 'long_head' | 'short_head' | 'upper' | 'lower' | 'lateral'
                | 'posterior' | 'both' | null,
  isUnilateral: boolean,
  setStructure: 'straight' | 'pyramid' | 'wave',    // default 'straight'
  difficultyTag: 'beginner' | 'intermediate' | 'advanced',
  equipment: string[],
}
```

**New exercises to add to library (v1.18):**
- Incline DB Curl — biceps, muscleEmphasis: long_head
- Spider Curl — biceps, muscleEmphasis: short_head
- Cable Lateral Raise — deltoids, muscleEmphasis: lateral
- Leaning Lateral Raise — deltoids, muscleEmphasis: lateral
- Overhead Cable Extension — triceps, muscleEmphasis: long_head
- Straight-Arm Cable Pulldown — lats, muscleEmphasis: lower
- Low-to-High Cable Fly — chest, muscleEmphasis: upper
- Meadows Row — back, muscleEmphasis: both
- Bayesian Cable Curl — biceps, muscleEmphasis: long_head

---

## TDEE CALCULATION (v1.18)

```ts
Step 1: Convert imperial → metric
Step 2: BMR via Mifflin-St Jeor
Step 3: TDEE = BMR × activityMultiplier (1.375–1.9 by lifting days/week)
Step 4: Concurrent sport adjustment:
  if concurrentSport:
    const intensityCal = {
      'martial_arts': 150, 'team_sports': 150,
      'running': 120, 'cycling': 120,
      'swimming': 130, 'other': 100
    }
    const sportAdjustment = concurrentSport.type.reduce((sum, t) =>
      sum + (intensityCal[t] ?? 100), 0) / concurrentSport.type.length
      * concurrentSport.daysPerWeek
    TDEE += sportAdjustment
Step 5: Apply pace offset (fat_loss/hypertrophy) or fixed (others)
Step 6: Round to nearest 50. Min 1200, max 5500.
```

---

## WEEK TRANSITION FLOW

- `WorkoutCompleteScreen` fires `weekly-coach-summary` + `generate-next-week` via `Promise.allSettled`
- Navigation blocked until `nextWeekReady = true`
- Idempotency: skip if next week already in plan_json
- Error state: retry UI — never a dead end
- DC-1/2/3: all fixed in v1.17 ✅

---

## POWER-HYPERTROPHY PROGRESSION RULES

```
Phase 1 (strength compounds):
  calculateIncrease() — uses strength multipliers (aggressive)
  Pyramid setStructure — ascending weight per set
  RPE target 8-9 on top sets
  Rest: 180-300s hardcoded regardless of other settings

Phase 2 (hypertrophy accessories):
  calculateIncrease() — uses hypertrophy multipliers (moderate)
  Straight setStructure
  RPE target 7-8
  Rest: prescribed restSeconds (90-120s typical)

Plateau detection:
  Phase 1 plateau → rotate compound variation (e.g. Barbell Bench → Incline Barbell)
  Phase 2 plateau → rotate accessory variation (prefer same muscleEmphasis)
  Phase 1 plateau does NOT affect Phase 2 and vice versa

Week 1 weights:
  Phase 1 compounds: current1RM × 0.75 (from S02b input)
  Phase 2 accessories: self-select (targetWeight = 0)
```

---

## UNILATERAL EXERCISE RULES

- Display: "X reps each side" — never "X reps"
- sets_json: reps logged are per-side
- Volume calc: multiply reps × 2 for total
- coaching-feedback prompt: "reps reported are per-side"
- generate-next-week prompt: "reps reported are per-side — do not treat as bilateral"
- `isUnilateral: boolean` on all ExerciseObjects and in exercise library
- **BUG-5: this is NOT yet implemented — must ship before TestFlight**

---

## KNOWN ISSUES / NOTES

- `Lib/` uses capital L — imports must be `'Lib/supabase'`
- RevenueCat entitlement: `'pro'` | web bypass: `Platform.OS === 'web'`
- ALL Edge Functions JWT: DISABLED | Model: `'claude-sonnet-4-6'`
- `user_profiles`: always `.order('id',{ascending:false}).limit(1).maybeSingle()`
- Weight log dates: `new Date(log_date + 'T00:00:00')`
- Lift names: snake_case in DB → `formatLiftName()` for display
- `jordanWelcome`/`sessionFocus`/`phase`: post-April 2026 plans only, older plans fallback gracefully
- DEV button in ProfileSettings when `__DEV__ === true`
- Weight placeholder: "Weight" not "Choose weight"
- `session_fatigue_rating` NOT `energy_rating` — Supabase 400 if wrong column name
- Calorie TDEE max: 5500 (raised from 5000 in v1.18 to support high combined training loads)

---

## RULES FOR THIS PROJECT

- React Native + Expo only, TypeScript everywhere
- All DB calls through `Lib/supabase.ts` | All Claude calls through Edge Functions only
- No hardcoded API keys or hex strings
- Screens in `/screens` | Components in `/components`
- Register every new screen in `navigation/index.tsx` AND `navigation/types.ts`
- `planId` always from fresh Supabase query, never from `route.params`
- **Never use "AI" in any Jordan copy or user-facing text**
- **Never show a dead-end screen — every screen must have a forward action**
- **Identity test before shipping any screen:** "Does this feel like a coach or an app?"
- **Unilateral exercises:** always display "X reps each side", always ×2 for volume, always flag `isUnilateral` in prompt context
- **power_hypertrophy sessions:** always show Phase 1 / Phase 2 split in workout UI and results
- **Enhanced recovery:** never reference medical protocols — framing is always a training characteristic
- **Concurrent sport:** always schedule heavy leg days away from high-intensity sport days
- **DEV testing mode:** When __DEV__ === true, day-of-week gating on the dashboard is bypassed via toggle in ProfileSettings DEV panel. This allows sequential testing of all weeks without being blocked by calendar day. Never ship the bypass to production — always guard with __DEV__ === true check.

---

## HOW WE WORK

- Claude writes Cursor/Composer prompts, developer pastes
- Opus 4.6 for complex screens, prompt engineering, new features, new goals
- Sonnet 4.6 for fixes, Edge Functions, simple screens
- Composer 2 for all multi-file tasks and screen redesigns
- Commit after every completed feature

---

## OUTSTANDING ISSUES

### 🔴 BUGS — Fix Before TestFlight

1. **BUG-4** — S03 Training Experience shows error state before any error occurs (ExperienceScreen)
2. **BUG-5** — Unilateral exercise handling missing entirely (isUnilateral field, rep display, volume calc ×2, coaching-feedback prompt, generate-next-week prompt)
3. **BUG-8** — Dashboard day-of-week intelligence: dashboard always shows "Start Workout" regardless of whether today is a scheduled workout day. Needs getTodaysPlanDay() utility (local date, timezone-safe, same pattern as BUG-2). DEV override: toggle in ProfileSettings DEV panel bypasses day-of-week gating so any session can be triggered on any day during testing — production always day-gated. Priority: Week 2.

### 🔴 In Progress

3. **P2-CX2** — Weekly summary banner: implemented but not showing. See ACTIVE DEBUG section below.

### 🔴 Must Ship Before Beta — New Features (v1.18)

4. **GAP-2** — Enhanced recovery flag: S03 toggle, user_profiles column, generate-plan prompt, generate-next-week prompt, deload frequency
5. **GAP-1** — Concurrent sport input: S04 section, user_profiles column, TDEE calc, generate-plan prompt, weekly-coach-summary prompt, scheduling logic
6. **GAP-5** — Power-Hypertrophy goal: S02 goal card, S02b dual projection, generate-plan two-phase structure, generate-next-week two-phase progression, Phase 1/2 display in ActiveWorkout + results
7. **GAP-7** — Sub-muscle targeting data layer: exercise library re-tag (muscleEmphasis field), generate-plan prompt instruction, plateau rotation sub-muscle awareness, new exercises added to library
8. **GAP-8** — Sex-aware programming: generate-plan prompt, generate-next-week prompt (rep ranges, volume ceiling, deload timing)
9. **GAP-9** — Metric unit toggle: Profile Settings toggle, all weight displays + inputs, progress charts — DB always stores lbs
10. **GAP-6** — Exercise selection reasoning: generate-plan prompt updated to produce selection rationale (not form cues) in coachingNote

### 🟠 Must Ship Before Beta — Features

11. **P2-CX7** — 24hr re-engagement push (Plan Ready "Go to Dashboard" tap)
12. **Plan Completion Flow** — PlanCompleteScreen + generate-final-review Edge Function + cross-plan memory
13. **P3-C1** — Within-week load adjustment (adjust-next-session Edge Function)
14. **P3-C2** — Missed session handling (detect + push + dashboard card)
15. **P3-F7** — Transparent adaptation reasoning (tap weight → bottom sheet)
16. **P3-F10** — Jordan tone evolution (prompt copy changes by completedWeeks)
17. **P3-F1** — Exercise education (How To modal, 3–5 form cues, difficulty tags)
18. **P3-F2** — Cardio layer (Light + Medium prescriptions)
19. **P3-F3** — Pyramid sets for intermediate/advanced (all goals)
20. **P3-F9** — Body measurement tracking (waist/chest/hip/arm + progress chart)
21. **P3-F12** — Sex-aware programming (generate-plan + generate-next-week prompt changes)
22. **P2-N2** — Meal Builder search bar
23. **Free Session Mode** — basic version
24. **Workout History Screen**

### 🟠 Must Ship — Polish (Week 4)

25. All **P2-W** items: W7 (rest day collapse), W8 (phase legend), W10 (results Jordan note)
26. All **P2-N** items: N1 (overshoot warning), N3 (log meal toast), N4 (adherence legend), N5 (adherence Jordan note)
27. All **P2-PR** items: PR4 (Week 2 paywall), PR5 (gating consistency), PR6 (goal edit gate)
28. All **P2-O** items: O4–O13
29. **P2-O-REST** — Active recovery suggestions on rest day dashboard card. Instead of blank "Rest Day" state, Jordan suggests light activity: walking, mobility, stretching. Copy only — no new feature system. Example: "Today's a rest day — a 20-minute walk or some mobility work will help you recover faster for [next workout day]."
29. **P2-CX1** — Bad week emotional coaching copy paths
30. **P2-CX3** — Sleep input on daily weigh-in card
31. **P2-CX5** — Haptic feedback (full spec Section 8.8 of PRD)
32. **P2-ST1** — Identity audit: remove tracker/logger/planner language everywhere

### 🟡 Beta Target — Not Blocking

33. **P3-C7** — Mid-plan injury handling (adjust-for-injury Edge Function)
34. **GAP-10** — Session architecture for weak-point priority (generate-plan prompt restructuring)
35. **P3-C5** — Full readiness score (sleep + soreness + stress check-in)
36. **P3-C3** — Mid-week Jordan check-in card (client-side)
37. **P3-F6** — Notification schedule customization

### ⚪ Post-Beta (Public Launch)

- Supersets (P3-F11)
- Apple Health / Google Fit / MyFitnessPal (P3-F5)
- Wave loading
- Sub-muscle targeting full UI (S02b sub-selector)
- App Store assets, ASO, screenshots
- Video exercise demonstrations
- Sex-aware programming deep calibration (after beta data)

---

## ACTIVE DEBUG — P2-CX2 Weekly Summary Banner

**Status:** Implemented, not working. Debug in progress.

**Implementation summary:**
- HomeScreen `loadDashboardData` queries `weekly_summaries` for all rows (user/plan, week_number DESC, limit 10)
- Walks list checking `AsyncStorage` key `summary_viewed_${planId}_week${weekNumber}` for each
- Sets `unviewedSummaryWeekNumber` to first week whose key is NOT `'true'`
- Banner renders above Jordan card when state is non-null
- `WeeklyCoachSummaryScreen` sets key to `'true'` on mount

**Symptom:** Banner does not appear after completing a week.

**Debug steps — add to loadDashboardData before investigating further:**
```ts
console.log('BANNER — summaries query error:', error);
console.log('BANNER — summaries rows:', JSON.stringify(summaries));
// inside loop:
console.log(`BANNER — key: ${viewedKey} | value: ${viewed}`);
// after loop:
console.log('BANNER — unviewedWeek result:', unviewedWeek);
```

**Likely failure points in order:**
1. `weekly_summaries` row does not exist → check Supabase Table Editor first
2. AsyncStorage key already `'true'` from prior testing → clear AsyncStorage
3. `planId` or `userId` mismatch between banner query and the row's values
4. JSX render condition wrong → check `unviewedSummaryWeekNumber` null check in render

**First action:** Open Supabase → Table Editor → weekly_summaries. Confirm a row exists for this user/plan after completing a week. If no row: bug is in weekly-coach-summary Edge Function, not the banner.

---

## 5-WEEK SPRINT ORDER SUMMARY

**Week 1:** BUG-4, BUG-5 | Power-Hypertrophy goal + PHUL session architecture | Enhanced recovery flag | Concurrent sport input + TDEE | Sex-aware programming prompts | Calorie max → 5500

**Week 2:** Sub-muscle targeting data layer | Exercise selection reasoning in coachingNote | Within-week load adjustment | Missed session handling | Jordan tone evolution | Transparent adaptation reasoning | P2-CX2 banner fix | P2-CX7 re-engagement push

**Week 3:** Plan completion flow + generate-final-review | Free session mode | Workout history screen | Cardio layer | Pyramid sets | Body measurement tracking | Meal Builder search | Sleep input | Metric unit toggle | Exercise education

**Week 4:** All P2-W, P2-N, P2-PR, P2-O polish | P2-CX1 bad week copy | P2-CX3 sleep input | P2-CX5 haptics | Identity audit | P2-ST1

**Week 5:** Full QA + regression. End-to-end all goals including power_hypertrophy. Deload regression (DC-1/2/3). Concurrent sport scheduling. Enhanced recovery volume. Real device testing (haptics/timers/notifications require real device).

---

## DO NOT CHANGE

The filename — it must remain `CLAUDE_CONTEXT.md`
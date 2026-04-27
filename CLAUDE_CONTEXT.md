# ADAPTIVE FITNESS COACH — CLAUDE CONTEXT
<!-- DO NOT CHANGE THE FILENAME -->
<!-- Last updated: April 2026 — Near-Release Beta Sprint Week 2 (v1.19) -->

---

## PROJECT OVERVIEW

**App:** Adaptive Fitness Coach — iOS/Android subscription SaaS
**Stack:** React Native + Expo, Supabase, RevenueCat, Claude API, Zustand
**Supabase tables:** users, user_profiles, goals, plans, workout_logs, macro_plans, weekly_summaries, macro_logs, weight_logs, meal_suggestions, cardio_logs (Phase 4), free_sessions (Phase 4), body_measurements (Phase 4)
**Config files:** Lib/supabase.ts, Lib/RevenueCat.ts
**Edge Functions:** generate-plan, coaching-feedback, weekly-coach-summary, generate-next-week, adjust-macros, generate-meals, generate-final-review, adjust-next-session, adjust-for-injury (Phase 4), adjust-equipment-session (Phase 4)
**Key files:** constants/design.ts, constants/exerciseLibrary.ts, constants/ingredientLibrary.ts, components/MealBuilderModal.tsx, components/ExerciseCard.tsx, components/WorkoutResultsModal.tsx, navigation/types.ts, utils/splitRecommendation.ts, utils/projections.ts, utils/dateUtils.ts, utils/sessionSignal.ts, utils/missedSession.ts, utils/adaptationReason.ts, components/ProjectionChart.tsx

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
- Post-Review Sprint (v1.14) ✅ April 9 2026
- Beta Sprint Partial (v1.17) ✅ April 2026
- Near-Release Beta Sprint Week 1 (v1.18) ✅ April 14 2026
- Near-Release Beta Sprint Week 2 (v1.19) ✅ April 16 2026

### Completed in Week 2 Beta Sprint (v1.19)
| Item | Detail |
|---|---|
| BUG-8 | scheduledDays stored in plan_json, dashboard day-of-week gating working |
| GAP-7 | muscleEmphasis data layer: stampMuscleEmphasis post-processing, fuzzy match aliases, EQUIPMENT_MAP |
| GAP-13 | Sub-muscle priority targeting UI: Biceps/Triceps/Chest/Shoulders/Back/Quads with experience-aware defaults |
| GAP-6 | Exercise selection reasoning in coachingNote: stacked UI (reasoning + RPE anchor) |
| P3-C1 | Within-week load adjustment: adjust-next-session Edge Function, pre-session Jordan modal |
| P3-C2 | Missed session handling: window check, reschedule or skip-and-forward |
| P3-F10 | Jordan tone evolution: newcomer/building/established/veteran tiers by completedWeeks |
| P3-F7 | Transparent adaptation reasoning: tap weight → bottom sheet with Jordan explanation |
| RPE progression | RPE-gap-scaled weight increases (3/5/8% buckets with experience multipliers) |
| Equipment rounding | Barbell 2.5 lbs, dumbbell/cable/machine 5 lbs, kettlebell 8 lbs |
| Week 1 RPE cap | enforceWeek1Rpe: compounds ≤8, isolations ≤7 (rep range proxy) |
| Self-select fix | Old weight adaptation system disabled for priorTargetWeight===0 exercises |
| Library fuzzy match | enrichExerciseWithLibraryData: plural strip + partial match |
| exerciseId resolution | enforceWeightProgression reads exerciseId→name map from plan_json |
| Spelling | "programme" → "program", "Flye" → "Fly" normalisation |

### Current Phase
**Near-Release Beta Sprint Week 3 (v1.19)** — April 2026
P2-CX7 24hr re-engagement push is NEXT.

---

## DESIGN SYSTEM

`constants/design.ts` is the single source of truth.
```ts
import { Colors, Fonts, FontSizes, Spacing, Radius, CommonStyles } from '../constants/design';
// Onboarding screens:
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';
```

### Colors
bgPrimary='#09090B'  bgCard='#111113'  bgElevated='#1C1C1E'
accent='#F97316'  accentMuted='rgba(249,115,22,0.12)'  accentBorder='rgba(249,115,22,0.4)'
textPrimary='#FAFAFA'  textSecondary='#A1A1AA'  textTertiary='#52525B'
success='#22C55E'  successMuted='rgba(34,197,94,0.12)'
warning='#F59E0B'  warningMuted='rgba(245,158,11,0.12)'
danger='#EF4444'  dangerMuted='rgba(239,68,68,0.12)'
divider='#27272A'  border='#3F3F46'  overlay='rgba(0,0,0,0.7)'

### Goal Colors
fat_loss → #F97316 | hypertrophy → #22C55E | strength → #F59E0B
power_hypertrophy → #F59E0B | recomp → #F97316 | general → #F97316

### Typography & Radius
FontSizes: micro(10) label(11) caption(13) body(15) title(17) heading2(20) heading1(26) display(32)
Radius: sm(8) md(12) lg(16) xl(20) xxl(24) full(9999)

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
Home → HomeScreen, WeeklyCoachSummary
Workout → WorkoutHomeScreen, PlanView, ActiveWorkout, WorkoutComplete, ExerciseLibrary, WorkoutHistory, FreeSession
Progress → ProgressCharts, GoalTracker
Nutrition → MacroTracker
Profile → ProfileSettings, SubscriptionManagement, NotificationsSettings

### Root Stack
Splash → Onboarding → GoalDetails → Experience → RPEEducation →
Constraints → BodyMetrics → MacroSetup → PlanPreview → BuildingPlan → MainTabs

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

**power_hypertrophy** is a first-class goal. Display name: "Strength & Size". Uses PHUL split by default.

---

## ONBOARDING — KEY BEHAVIOURS

**Step counter:** S02=1, S02b=2, S03=3, S03b=4, S04=5, S05=6, S06=7, S07=8. BuildingPlan has no step.

### S02b GoalDetailsScreen
- CTA: Always "Continue" — never "Skip"
- power_hypertrophy: 4 optional 1RM inputs, experience-based dual projection, no pace selector
- Strength: feasibility card uses getStrengthProjectionRange() — range, never flat number
- canReachGoal = high >= gap (NOT 75% threshold)
- recommendedWeeks forwarded through ALL navigation hops
- **Sub-muscle preferences (GAP-13):** After priority muscle chip selected, refinement row appears
  - SUB_MUSCLE_OPTIONS defined for: Biceps, Triceps, Chest, Shoulders, Back, Quads
  - Default: "Balanced" pre-selected for all experience levels
  - No pre-selection for advanced was removed (experience not yet collected at S02b)
  - subMusclePreferences forwarded to BuildingPlanScreen → generate-plan → plan_json root

### S03 ExperienceScreen
- Day picker: 7 pills Mon–Sun, min 2, sorted Mon→Sun
- Jordan structure card: split badge + ⓘ modal, session list, rationale (warm tone required)
- "Looks good →" → structureConfirmed = true | "Adjust" → context chips
- structureConfirmed resets on selectedDays/experience/enhancedRecovery change
- Enhanced Recovery Flag: toggle below experience selector, Intermediate/Advanced only, default off
- Session length warning for power_hypertrophy + short session on S03 (not S07)

### S04 Constraints
- Screen title: "Equipment & Constraints"
- Concurrent Sport Training section at bottom: multi-select chips + days/week picker

### S05 Body Metrics
- biologicalSex collected here — passed to generate-plan and generate-next-week

### S06 MacroSetup
- calorie_pace stored in macro_plans, passed to generate-plan
- power_hypertrophy: no pace selector shown
- Calorie max: 5500
- Concurrent sport TDEE adjustment applied here

### S07 PlanPreviewScreen
- power_hypertrophy: dual projection (1RM + lean mass), no pace selector
- Session length warning removed from S07 (moved to S03)

---

## PLAN_JSON STRUCTURE
```
plan_json: { title, totalWeeks, daysPerWeek, goal, split, currentWeek,
experience, sessionLength, equipment, jordanWelcome,
enhancedRecovery, concurrentSport, biologicalSex,
scheduledDays, subMusclePreferences, weeks[] }
WeekObject: { weekNumber, phase, days[] }
DayObject:  { dayNumber, type ('workout'|'rest'|'cardio'), title, sessionFocus,
muscleGroups, exercises[], sessionPhase?,
cardioType?, suggestedDurationMinutes? }
ExerciseObject: { id, name, muscleGroup, muscleEmphasis, equipment,
isUnilateral?, setStructure ('straight'|'pyramid'|'wave'),
sets, reps, targetWeight, restSeconds,
targetRpe, coachingNote, adjustedBySignal?,
phase? ('strength'|'hypertrophy'),
plateaued?, plateauWeeks? }
sets_json: { exerciseId, setNumber, weightLbs, reps, rpe(0=not logged), swapped }
```

**v1.19 fields:**
- plan_json.scheduledDays: string[] — e.g. ['Mon','Wed','Fri']
- plan_json.subMusclePreferences: Record<string,string> — e.g. {"Biceps":"long_head","Chest":"upper"}
- ExerciseObject.muscleEmphasis: string — taxonomy tag, stamped by stampMuscleEmphasis()
- ExerciseObject.equipment: string — 'barbell'|'dumbbell'|'cable'|'machine'|'bodyweight'|'kettlebell'
- ExerciseObject.adjustedBySignal: 'high_fatigue'|'low_fatigue' — set by adjust-next-session

Phase colors: baseline(accent) | accumulation(success) | intensification/deload(warning)
Week 1 always baseline. Deload: every 4th week standard, every 5th week if enhancedRecovery OR biologicalSex === 'female'.

---

## DATABASE SCHEMA NOTES

### Columns added in v1.18–v1.19
```sql
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS enhanced_recovery boolean DEFAULT false;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS concurrent_sport jsonb DEFAULT null;
ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS skipped boolean DEFAULT false;
-- goals table constraint updated to include power_hypertrophy
ALTER TABLE goals DROP CONSTRAINT goals_goal_type_check;
ALTER TABLE goals ADD CONSTRAINT goals_goal_type_check
  CHECK (goal_type IN ('fat_loss','hypertrophy','strength','power_hypertrophy','recomp','general'));
```

### Critical columns
- session_fatigue_rating NOT energy_rating (400 if wrong)
- workout_logs.logged_at NOT created_at
- sets_json.weightLbs NOT weight
- user_profiles: always .order('id',{ascending:false}).limit(1).maybeSingle()

---

## GENERATE-PLAN — KEY BEHAVIOURS (v1.19)

### Post-processing order (all run after Claude response, before Supabase save):
1. `enforceRepRanges(exercises, biologicalSex)` — female rep range adjustments
2. `stampMuscleEmphasis(exercises)` — MUSCLE_EMPHASIS_MAP + alias lookup, longest key first
3. `stampEquipment(exercises)` — EQUIPMENT_MAP + alias lookup, longest key first
4. `enforceWeek1Rpe(exercises)` — Week 1 only: compounds ≤8 RPE, isolations ≤7 RPE (rep range proxy: lowEnd ≥9 = isolation)
5. `normaliseExerciseName(name)` — "Flye"→"Fly", etc.

### coachingNote rules (GAP-6)
- 1–2 sentences explaining WHY this exercise is in this plan for this user
- Selection reasoning ONLY — not form cues, not generic motivation
- Never write "Choose a weight" — RPE anchor shown separately in UI
- Never write "programme" — always "program"
- Jordan voice, first person

### Sub-muscle bias (GAP-13)
- subMusclePreferences passed in request body, stored in plan_json root
- Bias instruction injected into Claude prompt: 60% of that muscle's exercises from targeted sub-muscle
- "Balanced" = even distribution, no bias instruction sent to Claude

### scheduledDays
- Destructured from request body as selectedDays
- Stored in plan_json root: scheduledDays: selectedDays ?? []

### Other
- max_tokens: 16000
- biologicalSex, enhancedRecovery, concurrentSport all passed in request body and stored in plan_json
- currentLifts (power_hypertrophy): Phase 1 targetWeight = currentLifts[lift] × 0.75, rounded to nearest 5 lbs

---

## GENERATE-NEXT-WEEK — KEY BEHAVIOURS (v1.19)

### Weight progression — enforceWeightProgression()
TypeScript post-processing owns ALL weight arithmetic. Claude's targetWeight values are overwritten.

**RPE gap buckets (rpeGap = avgLoggedRpe - targetRpe):**
```ts
rpeGap <= -2.5 → basePct = 8%   // very easy
rpeGap <= -1.5 → basePct = 5%   // clearly too light
rpeGap <= -0.5 → basePct = 3%   // slightly light
otherwise      → fixed increase: compound +2.5, isolation +1.0
```

**Experience multipliers:** beginner ×1.3 | intermediate ×1.0 | advanced ×0.7

**Equipment-aware rounding:**
```ts
barbell → 2.5 lbs
dumbbell / cable / machine → 5 lbs
kettlebell → 8 lbs
bodyweight → 0 (no rounding)
```

**Floors:** barbell 45 lbs | dumbbell/cable/machine 5 lbs | bodyweight 0
**Cap:** never more than 12% increase per week
**Dumbbell sanity cap:** max 150 lbs
**Self-select guard:** priorTargetWeight === 0 → old weight adaptation system skipped entirely, enforceWeightProgression owns the calculation

### Exercise name resolution
- exerciseIdToName map built from all weeks in plan_json
- Sets_json resolved: exerciseId → name (primary), fallback to exerciseName/name fields
- findExerciseDataKey(): exact → plural strip → add plural → partial match (longest key first)

### Other
- stampEquipment runs BEFORE enforceWeightProgression (equipment needed for rounding)
- stampMuscleEmphasis runs AFTER enforceWeightProgression
- biologicalSex, enhancedRecovery, concurrentSport read from plan_json
- Deload cadence: (enhancedRecovery || biologicalSex === 'female') ? 5 : 4
- power_hypertrophy: Phase 1 and Phase 2 progress independently
- Unilateral rule: reps in sets_json are per-side
- DC-1 fix: when priorWeek.phase === 'deload', use Week N-2 weights as progression baseline

---

## ADJUST-NEXT-SESSION EDGE FUNCTION (P3-C1)

**Trigger:** Called from WorkoutCompleteScreen after session saved. Fire-and-forget.
**Input:** planId, weekNumber, signal ('high_fatigue'|'low_fatigue')
**Guard:** Only mutates exercises where targetWeight > 0. Never mutates self-select exercises.
**RPE delta:** high_fatigue → -0.5 | low_fatigue → +0.5
**Scope:** Only remaining sessions in current week. Never future weeks.
**Sets adjustedBySignal field** on mutated exercises.

### Signal detection (utils/sessionSignal.ts)
```ts
high_fatigue: avgRpe > 8.5 AND fatigueRating <= 2
low_fatigue:  avgRpe < 6.0 AND fatigueRating >= 4
on_target:    avgRpe 7.0–8.5
```

### Pre-session modal
Shown in ActiveWorkoutScreen on mount when preSessionMessage is non-null.
Signal passed as preSessionMessage param to ActiveWorkout navigation.
NOT shown on dashboard (removed — was causing UX confusion).

---

## MISSED SESSION HANDLING (P3-C2, utils/missedSession.ts)

**Detection:** Today is scheduled training day + session unlogged + time after 8pm local
**Window check:** Tomorrow is a rest day → offer reschedule (one day only, never cascade)
**No window:** Skip-and-forward with Jordan note
**User confirmation always required** — never auto-reschedule silently
**markSessionSkipped:** inserts workout_log with skipped: true, sets_json: []
**rescheduleSession:** writes rescheduledTo: dayLabel to plan_json day object

---

## ADAPTATION REASONING (P3-F7, utils/adaptationReason.ts)

Tappable weight target in ExerciseCard (targetWeight > 0 only) → bottom sheet.
Client-side only — no Edge Function.
Reads lastWeekSets (already fetched for last week strip).

**Signal types:** up | down | hold | baseline | fatigue_adjusted
**Increase trigger:** rpeGap < -0.5
**Decrease trigger:** rpeGap > 1.0
**Hold:** within ±0.5 to +1.0

---

## JORDAN TONE EVOLUTION (P3-F10)

Applied in: generate-next-week, coaching-feedback, weekly-coach-summary

```ts
function getJordanToneTier(completedWeeks: number): 'newcomer'|'building'|'established'|'veteran' {
  if (weeks <= 1) return 'newcomer';   // welcoming, explanatory
  if (weeks <= 4) return 'building';   // warmer, references actual numbers
  if (weeks <= 8) return 'established'; // direct, referential, pattern-aware
  return 'veteran';                     // terse, data-driven, peer-level
}
```

Note: `'new'` is a JS reserved word — always use `'newcomer'` as the key. Function must be at module scope (not inside serve handler) to avoid Deno bundler errors.

---

## EXERCISE LIBRARY — KEY BEHAVIOURS (v1.19)

### muscleEmphasis field
Required on all Exercise objects. Taxonomy: mid_chest, upper_chest, lower_chest, mid_back, lats, upper_back, front_delt, lateral_delt, rear_delt, long_head_tricep, lateral_head_tricep, short_head_bicep, long_head_bicep, brachialis, quads, hamstrings, glutes, adductors, gastrocnemius, soleus, rectus_abdominis, obliques, transverse_abs, spinal_erectors.

### equipment field
Required on all Exercise objects: 'barbell'|'dumbbell'|'machine'|'cable'|'bodyweight'|'kettlebell'|'band'

### isUnilateral
Detected by UNILATERAL_IDS set. Lookup in enrichExerciseWithLibraryData uses fuzzy match:
1. Exact name match
2. Strip plural 's' and retry
3. Partial match (name contains library name or vice versa)

### Name normalisation
- "Flye"/"Flyes" → "Fly"/"Flys" (normaliseExerciseName in generate-plan)
- Exercise names in plan_json must match library for enrichment to work

### Sub-muscle priority targeting (GAP-13)
```ts
SUB_MUSCLE_OPTIONS defined for: Biceps, Triceps, Chest, Shoulders, Back, Quads
Biceps:   Balanced / Short head / Long head / Brachialis
Triceps:  Balanced / Long head / Lateral head
Chest:    Balanced / Upper / Lower
Shoulders: Balanced / Front / Lateral / Rear
Back:     Balanced / Lats (width) / Upper back (thickness)
Quads:    Balanced / Outer sweep / Teardrop (VMO)
```
Default: 'balanced' pre-selected for all users (experience not yet known at S02b).

---

## WEEK 1 PROGRAMMING RULES (v1.19)

- **enforceWeek1Rpe:** All exercises post-processed after Claude response
  - rep range low end ≥ 9 → isolation → cap RPE at 7
  - rep range low end < 9 → compound → cap RPE at 8
- **Self-select weights:** Non-strength goals, targetWeight: 0 for all Week 1 exercises
- **Jordan coaching note line 1:** Selection reasoning (GAP-6)
- **Jordan coaching note line 2:** "Pick a weight that lands at RPE X — I'll program Week 2 from your actual numbers." (shown only when targetWeight === 0)

---

## SEX-AWARE PROGRAMMING (v1.18)

Implemented via enforceRepRanges() post-processing in generate-plan.
```ts
// Female adjustments:
// Phase 1 (power_hypertrophy): always forced to '5-8'
// Phase 2 (power_hypertrophy): bucket by lowEnd
// Non-phase exercises: FEMALE_REP_MAP (+2 to both ends)
// Male Phase 2: minimum 8 reps enforced

// Deload cadence:
// enhancedRecovery || biologicalSex === 'female' → week 5
// standard → week 4
```

---

## DASHBOARD — DAY-OF-WEEK INTELLIGENCE (BUG-8 — COMPLETE)

### utils/dateUtils.ts
```ts
getTodayDayLabel(): 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun'
isTodayTrainingDay(scheduledDays, todayLabel): boolean
getNextTrainingDay(scheduledDays, todayLabel): { dayLabel, daysAway, displayName }
isLastScheduledTrainingDayToday(scheduledDays, todayLabel): boolean
isPastLastTrainingDay(scheduledDays, todayLabel): boolean
```

### Hero card priority (HomeScreen)
- missedSessionResult?.isMissed → MissedSessionCard (warning border)
- !isTrainingDay && allSessionsComplete → Generate Week 2 CTA
- !isTrainingDay → RestDayCard
- showGenerateNextWeekCTA → Generate Week 2 CTA
- todaySession exists → WorkoutCard
- else → generic rest card

### RestDayCard
"REST DAY" label + "Next up: [displayName]" (orange, accent)
Jordan avatar + contextual recovery message

### DEV bypass
AsyncStorage key: 'dev_bypass_day_gate'
Toggle in ProfileSettings DEV panel: "Bypass Day Gate (test any session)"

---

## SPLIT LIBRARY (v1.19)

14 splits. power_hypertrophy goal:
2 days → upper_lower hybrid
3 days → full_body_advanced hybrid
4-5 days → phul
6-7 days → ppl (caps at 6 workout sessions)

---

## DEPLOYMENT RULES

### Edge Functions — always use --no-verify-jwt
```bash
supabase functions deploy generate-plan --no-verify-jwt
supabase functions deploy generate-next-week --no-verify-jwt
supabase functions deploy coaching-feedback --no-verify-jwt
supabase functions deploy weekly-coach-summary --no-verify-jwt
supabase functions deploy adjust-macros --no-verify-jwt
supabase functions deploy generate-meals --no-verify-jwt
supabase functions deploy generate-final-review --no-verify-jwt
supabase functions deploy adjust-next-session --no-verify-jwt
```
Only deploy functions that were actually changed. JWT re-enables on redeploy — always include --no-verify-jwt.

### Expo client — hot-reloads automatically
Screen and component changes apply immediately. No action needed.

### Navigation type changes
npx expo start --clear

### Supabase schema changes — run migration first
Never add a column in app code before adding it in Supabase — returns 400 error.

---

## KNOWN ISSUES / NOTES

- Lib/ uses capital L — imports must be 'Lib/supabase'
- RevenueCat entitlement: 'pro' | web bypass: Platform.OS === 'web'
- ALL Edge Functions JWT: DISABLED | Model: 'claude-sonnet-4-6'
- user_profiles: always .order('id',{ascending:false}).limit(1).maybeSingle()
- Weight log dates: new Date(log_date + 'T00:00:00')
- Lift names: snake_case in DB → formatLiftName() for display
- jordanWelcome/sessionFocus/phase: post-April 2026 plans only, older plans fallback gracefully
- DEV button in ProfileSettings when __DEV__ === true
- Weight placeholder: "Weight" not "Choose weight"
- session_fatigue_rating NOT energy_rating — Supabase 400 if wrong column name
- Calorie TDEE max: 5500
- Phase 1 targetWeight rounded to nearest 5 lbs (not 2.5) for barbell compounds
- GAP-8-MINOR: Overhead Press occasionally shows 8-12 instead of 10-14 in female power_hypertrophy. Fix in Week 5 QA.
- Jordan tone 'new' is a JS reserved word — always use 'newcomer' as object key in Edge Functions
- Edge Functions: getJordanToneTier must be at module scope, not inside serve() — Deno bundler error otherwise
- enforceWeightProgression: old [weight adaptation] system must be disabled for priorTargetWeight===0 to prevent conflict
- stampEquipment must run BEFORE enforceWeightProgression in generate-next-week
- Walking Lunge and similar exercises may have inconsistent naming (singular vs plural) across weeks — fuzzy match handles this client-side but plan_json consistency preferred

---

## DEV PANEL (ProfileSettings — __DEV__ === true)

- DEV: Restart Onboarding button
- Clear Summary Banners button (clears all summary_viewed_* AsyncStorage keys)
- Bypass Day Gate toggle (dev_bypass_day_gate AsyncStorage key)

---

## RULES FOR THIS PROJECT

- React Native + Expo only, TypeScript everywhere
- All DB calls through Lib/supabase.ts | All Claude calls through Edge Functions only
- No hardcoded API keys or hex strings
- Screens in /screens | Components in /components
- Register every new screen in navigation/index.tsx AND navigation/types.ts
- planId always from fresh Supabase query, never from route.params
- Never use "AI" in any Jordan copy or user-facing text
- Never show a dead-end screen — every screen must have a forward action
- Identity test before shipping any screen: "Does this feel like a coach or an app?"
- Unilateral exercises: always display "X reps each side", always ×2 for volume
- power_hypertrophy sessions: always show Phase 1/Phase 2 split in workout UI and results
- Enhanced recovery: never reference medical protocols
- Concurrent sport: always schedule heavy leg days away from high-intensity sport days
- DEV testing mode: day-of-week gating bypassed via ProfileSettings DEV toggle — never ships to production
- enforceRepRanges() is the single source of truth for female rep ranges — never ask Claude to compute +2
- enforceWeightProgression() is the single source of truth for weight targets — Claude never computes increases
- stampMuscleEmphasis() and stampEquipment() are the single source of truth for those fields — Claude values overwritten
- Never write "programme" — always "program"
- Never write "Flye" — always "Fly"

---

## HOW WE WORK

- Claude writes Cursor/Composer prompts, developer pastes
- Opus 4.6 for complex screens, prompt engineering, new features, new goals
- Sonnet 4.6 for fixes, Edge Functions, simple screens
- Composer 2 for all multi-file tasks and screen redesigns
- Commit after every completed feature
- Provide testing criteria after every prompt

---

## OUTSTANDING ISSUES

### 🔴 BUGS — Fix Before TestFlight

None currently blocking. All Week 2 bugs resolved.

### 🔴 Must Ship Before Beta — Week 3 (IN PROGRESS)

1. **P2-CX7** — 24hr re-engagement push (Plan Ready "Go to Dashboard" tap) — NEXT
2. **Plan Completion Flow** — PlanCompleteScreen + generate-final-review Edge Function + cross-plan memory
3. **P3-C2 polish** — Missed session: rescheduled session UI needs to show correctly on dashboard next day
4. **P3-F1** — Exercise education (How To modal, 3–5 form cues, difficulty tags)
5. **P3-F2** — Cardio layer (Light + Medium prescriptions)
6. **P3-F3** — Pyramid sets for intermediate/advanced (all goals)
7. **P3-F9** — Body measurement tracking (waist/chest/hip/arm + progress chart)
8. **P2-N2** — Meal Builder search bar
9. **Free Session Mode** — basic version
10. **Workout History Screen**
11. **GAP-9** — Metric unit toggle: Profile Settings toggle, all weight displays + inputs, progress charts — DB always stores lbs
12. **P2-CX3** — Sleep input on daily weigh-in card

### 🟠 Must Ship — New (added during Week 2 sprint)

13. **GAP-11** — Sport session logging: dashboard card when concurrentSport set
14. **GAP-12** — Dynamic sport calorie adjustment: weekly-coach-summary reads sport_logs
15. **P2-O-REST** — Active recovery suggestions on rest day dashboard card (copy only)
16. **GAP-13** ✅ COMPLETE — Sub-muscle priority targeting

### 🟠 Must Ship — Polish (Week 4)

17. All P2-W items: W7 (rest day collapse), W8 (phase legend), W10 (results Jordan note)
18. All P2-N items: N1 (overshoot warning), N3 (log meal toast), N4 (adherence legend), N5 (adherence Jordan note)
19. All P2-PR items: PR4 (Week 2 paywall), PR5 (gating consistency), PR6 (goal edit gate)
20. All P2-O items: O4–O13
21. **P2-CX1** — Bad week emotional coaching copy paths
22. **P2-CX5** — Haptic feedback (full spec)
23. **P2-ST1** — Identity audit: remove tracker/logger/planner language everywhere

### 🟡 Beta Target — Not Blocking

24. P3-C7 — Mid-plan injury handling
25. P3-C5 — Full readiness score
26. P3-C3 — Mid-week Jordan check-in card
27. P3-F6 — Notification schedule customization

### ⚪ Post-Beta

- Supersets | Apple Health/Google Fit/MyFitnessPal | Wave loading
- Sub-muscle targeting full UI deep calibration | App Store assets | Video exercise demos
- Sex-aware programming deep calibration (after beta data)

---

## 5-WEEK SPRINT ORDER SUMMARY

**Week 1 ✅ COMPLETE:** BUG-4, BUG-5, BUG-7 | Power-Hypertrophy + PHUL | Enhanced recovery | Concurrent sport + TDEE | Sex-aware programming | Calorie max 5500

**Week 2 ✅ COMPLETE:** BUG-8 (scheduledDays) | GAP-7 (muscleEmphasis + equipment data layer) | GAP-13 (sub-muscle priority UI) | GAP-6 (exercise reasoning in coachingNote) | P3-C1 (within-week load adjustment) | P3-C2 (missed session handling) | P3-F10 (Jordan tone evolution) | P3-F7 (adaptation reasoning) | RPE-gap-scaled weight progression | Equipment-aware rounding | Week 1 RPE caps

**Week 3 IN PROGRESS:** P2-CX7 re-engagement push (NEXT) | Plan completion flow | Free session mode | Workout history | Cardio layer | Pyramid sets | Body measurements | Meal Builder search | Sleep input | Metric toggle | Exercise education | GAP-11 sport logging | GAP-12 sport calorie adjustment

**Week 4:** All P2-W, P2-N, P2-PR, P2-O polish | P2-CX1/3/5 | Identity audit | P2-O-REST active recovery copy

**Week 5:** Full QA + regression. End-to-end all goals. Deload regression. Concurrent sport scheduling. Enhanced recovery volume. Real device testing.

---

## DO NOT CHANGE

The filename — it must remain CLAUDE_CONTEXT.md
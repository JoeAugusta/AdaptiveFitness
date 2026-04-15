# ADAPTIVE FITNESS COACH — CLAUDE CONTEXT
<!-- DO NOT CHANGE THE FILENAME -->
<!-- Last updated: April 2026 — v1.18 Near-Release Beta Sprint -->

---

## PROJECT OVERVIEW

**App:** Adaptive Fitness Coach — iOS/Android subscription SaaS
**Stack:** React Native + Expo, Supabase, RevenueCat, Claude API, Zustand
**Supabase tables:** users, user_profiles, goals, plans, workout_logs, macro_plans, weekly_summaries, macro_logs, weight_logs, meal_suggestions, cardio_logs (Phase 4), free_sessions (Phase 4), body_measurements (Phase 4)
**Config files:** Lib/supabase.ts, Lib/RevenueCat.ts
**Edge Functions:** generate-plan, coaching-feedback, weekly-coach-summary, generate-next-week, adjust-macros, generate-meals, generate-final-review, adjust-next-session (Phase 4), adjust-for-injury (Phase 4), adjust-equipment-session (Phase 4)
**Key files:** constants/design.ts, constants/exerciseLibrary.ts, constants/ingredientLibrary.ts, components/MealBuilderModal.tsx, components/ExerciseCard.tsx, components/WorkoutResultsModal.tsx, navigation/types.ts, utils/splitRecommendation.ts, utils/projections.ts, utils/dateUtils.ts, components/ProjectionChart.tsx

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

### Completed in Week 1 Beta Sprint (v1.18)
| Item | Detail |
|---|---|
| BUG-4 | S03 ExperienceScreen: red validation text on mount fixed |
| BUG-5 | Unilateral exercise handling: isUnilateral field, rep display, volume ×2, prompt context |
| BUG-7 | Active set highlight no longer bleeds to next exercise |
| GAP-5 | Power-Hypertrophy goal: full onboarding, PHUL session architecture, Phase 1/2 workout UI, WorkoutResultsModal split, dual projection |
| GAP-2 | Enhanced Recovery flag: S03 toggle, user_profiles column, deload cadence week 5, generate-plan + generate-next-week prompts |
| GAP-1 | Concurrent Sport input: S04 section, user_profiles column, TDEE adjustment, generate-plan + generate-next-week prompts |
| GAP-8 | Sex-aware programming: enforceRepRanges() post-processing in generate-plan, female +2 all exercises, week 5 deload, biologicalSex in plan_json |
| Calorie max | Raised from 5000 → 5500 |
| P2-CX2 | Weekly summary banner confirmed working (was testing artifact) |

### Current Phase
**Near-Release Beta Sprint Week 2 (v1.18)** — April 2026
BUG-8 day-of-week dashboard intelligence is IN PROGRESS — partially implemented, blocked on scheduledDays missing from plan_json.

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

**power_hypertrophy** is a first-class goal added in v1.18. Display name: "Strength & Size". Uses PHUL split by default. Session architecture has two explicit phases:
- Phase 1: Heavy compound (3–6 reps male / 5–8 reps female, pyramid sets, RPE 8–9, 3–5 min rest)
- Phase 2: Hypertrophy accessories (8–12 reps male / 10–14 reps female, straight sets, RPE 7–8, 90–120s rest)

Both phases track progression independently in generate-next-week.

---

## ONBOARDING — KEY BEHAVIOURS

**Step counter:** S02=1, S02b=2, S03=3, S03b=4, S04=5, S05=6, S06=7, S07=8. BuildingPlan has no step.

### S02 Goal Selection
- Goals: fat_loss, hypertrophy, strength, power_hypertrophy, recomp, general
- power_hypertrophy display: "Strength & Size"

### S02b GoalDetailsScreen
- CTA: Always "Continue" — never "Skip"
- power_hypertrophy: 4 optional 1RM inputs (Bench/Squat/Deadlift/OHP), experience-based dual projection (no target 1RM, no feasibility card), no pace selector
- Strength: feasibility card uses getStrengthProjectionRange() — range, never flat number
- canReachGoal = high >= gap (NOT 75% threshold)
- recommendedWeeks forwarded through ALL navigation hops

### S03 ExperienceScreen
- Day picker: 7 pills Mon–Sun, min 2, sorted Mon→Sun
- Jordan structure card: split badge + ⓘ modal, session list, rationale (warm tone required)
- "Looks good →" → structureConfirmed = true | "Adjust" → context chips
- structureConfirmed resets on selectedDays/experience/enhancedRecovery change
- Enhanced Recovery Flag: toggle below experience selector, Intermediate/Advanced only, default off
- Label: "I recover quickly between sessions and can handle high training volume."
- Session length warning for power_hypertrophy + short session on S03 (not S07)

### S04 Constraints
- Screen title: "Equipment & Constraints"
- Concurrent Sport Training section at bottom: multi-select chips + days/week picker
- Sport chips: Martial Arts / Running / Cycling / Swimming / Team Sports / Other
- Days picker: 1/2/3/4+ (appears only when sport selected)

### S05 Body Metrics
- biologicalSex collected here — passed to generate-plan and generate-next-week

### S06 MacroSetup
- calorie_pace stored in macro_plans, passed to generate-plan
- power_hypertrophy: no pace selector shown
- Calorie max: 5500 (raised from 5000 in v1.18)
- Concurrent sport TDEE adjustment applied here

### S07 PlanPreviewScreen
- power_hypertrophy: dual projection (1RM + lean mass), no pace selector
- Session length warning removed from S07 (moved to S03)

---

## PLAN_JSON STRUCTURE
plan_json: { title, totalWeeks, daysPerWeek, goal, split, currentWeek,
experience, sessionLength, equipment, jordanWelcome,
enhancedRecovery, concurrentSport, biologicalSex,
scheduledDays, weeks[] }
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

**v1.18 fields:**
- plan_json.enhancedRecovery: boolean
- plan_json.concurrentSport: { type: string[], daysPerWeek: number } | null
- plan_json.biologicalSex: 'male' | 'female' | 'prefer_not_to_say'
- plan_json.scheduledDays: string[] — e.g. ['Mon','Wed','Fri'] — IN PROGRESS (BUG-8)
- DayObject.sessionPhase: 'power_hypertrophy' | undefined
- ExerciseObject.phase: 'strength' | 'hypertrophy' | undefined
- ExerciseObject.isUnilateral: boolean
- ExerciseObject.setStructure: 'straight' | 'pyramid' | 'wave'

Phase colors: baseline(accent) | accumulation(success) | intensification/deload(warning)
Week 1 always baseline. Deload: every 4th week standard, every 5th week if enhancedRecovery OR biologicalSex === 'female'.

---

## DATABASE SCHEMA NOTES

### Columns added in v1.18
```sql
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS enhanced_recovery boolean DEFAULT false;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS concurrent_sport jsonb DEFAULT null;
-- goals table constraint updated to include power_hypertrophy:
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

## SEX-AWARE PROGRAMMING (v1.18)

Implemented via enforceRepRanges() post-processing in generate-plan AFTER Claude response, before Supabase save. TypeScript enforces — Claude receives base ranges.
```ts
// Female adjustments applied by enforceRepRanges():
// Phase 1 (power_hypertrophy): always forced to '5-8'
// Phase 2 (power_hypertrophy): bucket by lowEnd of Claude's output:
//   lowEnd ≤ 9  → '10-14'
//   lowEnd ≤ 11 → '12-16'
//   lowEnd ≤ 13 → '14-18'
//   else        → '17-22'
// Non-phase exercises: FEMALE_REP_MAP lookup table (+2 to both ends)
// Male Phase 2: minimum 8 reps enforced (corrects Claude drift to 6-8)

// Deload cadence:
// enhancedRecovery || biologicalSex === 'female' → week 5
// standard → week 4
// Applied in both PlanView client-side AND generate-next-week prompt
```

biologicalSex stored in plan_json root for generate-next-week access.

---

## TDEE CALCULATION (v1.18)
```ts
Step 1: Convert imperial → metric
Step 2: BMR via Mifflin-St Jeor
Step 3: TDEE = BMR × activityMultiplier (1.375–1.9 by lifting days/week)
Step 4: Concurrent sport adjustment:
  if concurrentSport:
    avgIntensity = avg of sport intensities (martial_arts/team_sports:150, running/cycling:120, swimming:130, other:100)
    TDEE += avgIntensity × daysPerWeek
Step 5: Apply pace offset
Step 6: Round to nearest 50. Min 1200, max 5500.
```

---

## GENERATE-PLAN — KEY BEHAVIOURS (v1.18)

- enforceRepRanges() post-processes all exercises after Claude response
- currentLifts (power_hypertrophy): Phase 1 targetWeight = currentLifts[lift] × 0.75, rounded to nearest 5 lbs. Null lift → targetWeight: 0
- scheduledDays must be stored in plan_json root (IN PROGRESS — BUG-8)
- biologicalSex, enhancedRecovery, concurrentSport all passed in request body and stored in plan_json
- max_tokens: 16000 (raised to prevent truncation on large plans)
- Validation logging: Phase1/Phase2 counts logged per day for power_hypertrophy

### Session exercise count (90+ mins, intermediate example)
30-45: 4 total | 45-60: 5 total | 60-90: 6 total | 90+: 7-8 total

---

## GENERATE-NEXT-WEEK — KEY BEHAVIOURS (v1.18)

- effectiveOldWeight ReferenceError: FIXED
- biologicalSex, enhancedRecovery, concurrentSport read from plan_json
- Deload cadence: (enhancedRecovery || biologicalSex === 'female') ? 5 : 4
- power_hypertrophy: Phase 1 and Phase 2 progress independently
- Unilateral rule: reps in sets_json are per-side

---

## SPLIT LIBRARY (v1.18)

14 splits. power_hypertrophy goal:
2 days → upper_lower hybrid
3 days → full_body_advanced hybrid
4-5 days → phul
6-7 days → ppl (caps at 6 workout sessions)

---

## UNILATERAL EXERCISE RULES

- Display: "X reps each side" — never "X reps"
- sets_json: reps logged are per-side (stored as entered, NOT doubled)
- Volume calc: multiply reps × 2 for total
- coaching-feedback prompt: "reps reported are per-side"
- generate-next-week prompt: "reps reported are per-side"
- isUnilateral: boolean on all ExerciseObjects

---

## POWER-HYPERTROPHY SESSION RULES

- Phase 1 header: "PHASE 1 — STRENGTH" | subtitle dynamic from first Phase 1 exercise reps
- Phase 2 header: "PHASE 2 — HYPERTROPHY" | subtitle dynamic from first Phase 2 exercise reps
- Phase 1 rest timer: always 240s (4 min) regardless of restSeconds
- Phase 2 rest timer: prescribed restSeconds (90-120s typical)
- WorkoutResultsModal: split into Phase 1 (top weight) + Phase 2 (volume) sections

---

## DASHBOARD — DAY-OF-WEEK INTELLIGENCE (BUG-8 — IN PROGRESS)

### utils/dateUtils.ts (created v1.18)
```ts
getTodayDayLabel(): 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun'
isTodayTrainingDay(scheduledDays, todayLabel): boolean
getNextTrainingDay(scheduledDays, todayLabel): { dayLabel, daysAway, displayName }
isLastScheduledTrainingDayToday(scheduledDays, todayLabel): boolean
isPastLastTrainingDay(scheduledDays, todayLabel): boolean
```

### Hero card priority (HomeScreen)

!isTrainingDay && !devBypassDayGate:

allSessionsComplete && postWeekHeroAllowed → Generate Week 2 CTA
else → RestDayCard (Jordan message + "Next up: [day]")


showGenerateNextWeekCTA → Generate Week 2 CTA
todaySession exists → WorkoutCard
else → generic rest card


### RestDayCard
- "REST DAY" label + "Next up: [displayName]" (orange, accent)
- Jordan avatar + contextual recovery message
- Message varies by daysAway (1 = "tomorrow", 2+ = day name)

### BLOCKER: scheduledDays not in plan_json
hasDayLabels = false → falls back to degraded behaviour (first unlogged session regardless of day).
Fix required: store scheduledDays in plan_json from generate-plan + pass selectedDays from BuildingPlanScreen.

### DEV bypass
AsyncStorage key: 'dev_bypass_day_gate'
Toggle in ProfileSettings DEV panel: "Bypass Day Gate (test any session)"
When ON: always shows next unlogged workout card, bypasses all day gating.

---

## DEV PANEL (ProfileSettings — __DEV__ === true)

- DEV: Restart Onboarding button
- Clear Summary Banners button (clears all summary_viewed_* AsyncStorage keys)
- Bypass Day Gate toggle (dev_bypass_day_gate AsyncStorage key)

---

## DEPLOYMENT RULES

### Edge Functions — must deploy manually after every change
supabase functions deploy generate-plan
supabase functions deploy generate-next-week
supabase functions deploy coaching-feedback
supabase functions deploy weekly-coach-summary
supabase functions deploy adjust-macros
supabase functions deploy generate-meals
supabase functions deploy generate-final-review
Only deploy functions that were actually changed.

### Expo client — hot-reloads automatically
Screen and component changes apply immediately. No action needed.

### Navigation type changes
npx expo start --clear

### Supabase schema changes — run migration first
```sql
ALTER TABLE table_name ADD COLUMN IF NOT EXISTS column_name type DEFAULT value;
```
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
- P2-CX2 weekly summary banner: confirmed working — was testing artifact (AsyncStorage keys set to 'true' during testing). Clear via DEV panel "Clear Summary Banners" button.
- GAP-8-MINOR: Overhead Press occasionally shows 8-12 instead of 10-14 in female power_hypertrophy. All other exercises correct. Fix in Week 5 QA.

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

1. **BUG-8** — Dashboard day-of-week intelligence: PARTIALLY IMPLEMENTED. dateUtils.ts, RestDayCard, DEV bypass toggle all done. BLOCKER: scheduledDays not stored in plan_json → hasDayLabels always false → falls back to degraded behaviour (shows next unlogged session regardless of day). Fix: add scheduledDays to generate-plan output + pass selectedDays from BuildingPlanScreen to Edge Function.

### 🔴 Must Ship Before Beta — New Features (v1.18)

2. **GAP-7** — Sub-muscle targeting data layer: exercise library re-tag (muscleEmphasis field), generate-plan prompt instruction, plateau rotation sub-muscle awareness
3. **GAP-6** — Exercise selection reasoning: generate-plan prompt updated to produce selection rationale (not form cues) in coachingNote
4. **GAP-9** — Metric unit toggle: Profile Settings toggle, all weight displays + inputs, progress charts — DB always stores lbs

### 🟠 Must Ship Before Beta — Features

5. **P2-CX7** — 24hr re-engagement push (Plan Ready "Go to Dashboard" tap)
6. **Plan Completion Flow** — PlanCompleteScreen + generate-final-review Edge Function + cross-plan memory
7. **P3-C1** — Within-week load adjustment (adjust-next-session Edge Function)
8. **P3-C2** — Missed session handling (detect + push + dashboard card)
9. **P3-F7** — Transparent adaptation reasoning (tap weight → bottom sheet)
10. **P3-F10** — Jordan tone evolution (prompt copy changes by completedWeeks)
11. **P3-F1** — Exercise education (How To modal, 3–5 form cues, difficulty tags)
12. **P3-F2** — Cardio layer (Light + Medium prescriptions)
13. **P3-F3** — Pyramid sets for intermediate/advanced (all goals)
14. **P3-F9** — Body measurement tracking (waist/chest/hip/arm + progress chart)
15. **P2-N2** — Meal Builder search bar
16. **Free Session Mode** — basic version
17. **Workout History Screen**

### 🟠 Must Ship — New (added Week 1 sprint)

18. **GAP-11** — Sport session logging: dashboard card when concurrentSport set. "Did you train [sport] today?" Yes/No/Partial. Logs to sport_logs table (user_id, plan_id, log_date, sport_type, completed, intensity). Week 3.
19. **GAP-12** — Dynamic sport calorie adjustment: weekly-coach-summary reads sport_logs, compares actual vs expected sessions, adjusts next week TDEE via adjust-macros. Forward-looking, never accusatory. Week 3, depends on GAP-11.
20. **P2-O-REST** — Active recovery suggestions on rest day dashboard card. Jordan suggests walk/mobility/stretching. Copy only, no new feature system. Week 4.
21. **BUG-8** — Dashboard day-of-week intelligence (see above — in progress)

### 🟠 Must Ship — Polish (Week 4)

22. All P2-W items: W7 (rest day collapse), W8 (phase legend), W10 (results Jordan note)
23. All P2-N items: N1 (overshoot warning), N3 (log meal toast), N4 (adherence legend), N5 (adherence Jordan note)
24. All P2-PR items: PR4 (Week 2 paywall), PR5 (gating consistency), PR6 (goal edit gate)
25. All P2-O items: O4–O13
26. **P2-CX1** — Bad week emotional coaching copy paths
27. **P2-CX3** — Sleep input on daily weigh-in card
28. **P2-CX5** — Haptic feedback (full spec)
29. **P2-ST1** — Identity audit: remove tracker/logger/planner language everywhere

### 🟡 Beta Target — Not Blocking

30. P3-C7 — Mid-plan injury handling
31. P3-C5 — Full readiness score
32. P3-C3 — Mid-week Jordan check-in card
33. P3-F6 — Notification schedule customization

### ⚪ Post-Beta

- Supersets | Apple Health/Google Fit/MyFitnessPal | Wave loading
- Sub-muscle targeting full UI | App Store assets | Video exercise demos
- Sex-aware programming deep calibration (after beta data)

---

## 5-WEEK SPRINT ORDER SUMMARY

**Week 1 ✅ COMPLETE:** BUG-4, BUG-5, BUG-7 | Power-Hypertrophy + PHUL | Enhanced recovery | Concurrent sport + TDEE | Sex-aware programming | Calorie max 5500

**Week 2 IN PROGRESS:** BUG-8 (scheduledDays fix — ACTIVE) | GAP-7 sub-muscle targeting | GAP-6 exercise reasoning | P3-C1 within-week load adjustment | P3-C2 missed session | P3-F10 Jordan tone evolution | P3-F7 adaptation reasoning | P2-CX7 re-engagement push

**Week 3:** Plan completion flow | Free session mode | Workout history | Cardio layer | Pyramid sets | Body measurements | Meal Builder search | Sleep input | Metric toggle | Exercise education | GAP-11 sport logging | GAP-12 sport calorie adjustment

**Week 4:** All P2-W, P2-N, P2-PR, P2-O polish | P2-CX1/3/5 | Identity audit | P2-O-REST active recovery copy

**Week 5:** Full QA + regression. End-to-end all goals. Deload regression. Concurrent sport scheduling. Enhanced recovery volume. Real device testing.

---

## ACTIVE DEBUG — BUG-8 scheduledDays

**Status:** Dashboard day-of-week logic implemented but not gating correctly.

**Root cause:** plan_json does not contain scheduledDays field. hasDayLabels = false → degraded behaviour → next unlogged session shown regardless of day.

**Fix required (Composer 2 — two files):**

File 1: supabase/functions/generate-plan/index.ts
- Destructure selectedDays (or whatever the user's training day array is called) from request body
- Add to plan_json root: scheduledDays: selectedDays ?? []
- Add to Claude prompt plan_json structure instruction

File 2: screens/onboarding/BuildingPlanScreen.tsx (or wherever generate-plan is called)
- Confirm selectedDays (from ExperienceScreen S03 params) is in the Edge Function request body
- If not: add scheduledDays: params.selectedDays ?? []

**Verification:** After fix, console.log in HomeScreen should show:
[BUG-8] scheduledDays: ['Mon','Fri'], hasDayLabels: true, isTrainingDay: false/true

**After fix:** Generate a fresh plan, check plan_json.scheduledDays in Supabase, confirm rest day card shows on non-training days.

---

## DO NOT CHANGE

The filename — it must remain CLAUDE_CONTEXT.md

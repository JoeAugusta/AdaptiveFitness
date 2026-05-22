# HONE — CLAUDE CONTEXT
<!-- DO NOT CHANGE THE FILENAME -->
<!-- Last updated: May 2026 — TestFlight Beta Sprint v1.21 -->

---

## PROJECT OVERVIEW

**App:** Hone — iOS/Android subscription SaaS fitness coaching app
**Previous name:** Adaptive Fitness Coach (renamed to Hone May 2026)
**Stack:** React Native + Expo, Supabase, RevenueCat, Claude API
**Supabase tables:** users, user_profiles, goals, plans, workout_logs, macro_plans, weekly_summaries, macro_logs, weight_logs, meal_suggestions, body_measurements, sport_logs, free_sessions
**Config files:** Lib/supabase.ts (capital L), Lib/RevenueCat.ts
**Edge Functions:** generate-plan, coaching-feedback, weekly-coach-summary, generate-next-week, adjust-macros, generate-meals, adjust-next-session, delete-account
**Key files:** constants/design.ts, constants/exerciseLibrary.ts, constants/exerciseEducation.ts, constants/ingredientLibrary.ts, components/MealBuilderModal.tsx, components/ExerciseCard.tsx, components/WorkoutResultsModal.tsx, components/ExerciseEducationModal.tsx, components/SportSessionModal.tsx, navigation/types.ts, utils/splitRecommendation.ts, utils/projections.ts, utils/units.ts, utils/haptics.ts, hooks/useEntitlement.ts, screens/BodyMeasurementsScreen.tsx, contexts/AuthContext.tsx, screens/auth/AuthScreen.tsx, screens/auth/SignUpScreen.tsx, screens/auth/SignInScreen.tsx, screens/SplashScreen.tsx

---

## BRANDING

**App name:** Hone
**Tagline:** "Your coach. Built around you."
**app.json:** name: "Hone", slug: "hone", bundleIdentifier: "com.hone.app"
**Logo:** Stylized H mark — orange (#F97316) square with rounded corners (rx=16), dark H letterform inside. App icon style (orange bg, dark H) for App Store. Rounded H wordmark for splash/auth screens.
**Wordmark:** lowercase "hone" in Fonts.bold, Colors.textPrimary
**AI persona:** Jordan — never referred to as "AI". "Your coach. Built around you."

---

## BUILD STATUS

### ✅ Weeks 1–5 Beta Sprint COMPLETE — May 2026
All P2 polish items shipped. RevenueCat gating live. Strength goal programming overhaul complete. generate-next-week fully rewritten with deterministic W1-clone approach.

### Current Phase
**TestFlight Beta** — May 2026
Auth flow complete. Hone rebrand complete. Ready for F&F TestFlight distribution.

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
- Jordan cards: bgElevated + borderLeftWidth 3 + borderLeftColor accentBorder
- Section headings: FontSizes.label, Fonts.bold, Colors.textSecondary, letterSpacing 1.5, uppercase
- import supabase from 'Lib/supabase' (capital L — always)

---

## NAVIGATION STRUCTURE

```
Auth stack (unauthenticated): Auth → SignUp | SignIn
Onboarding stack: GoalDetails → Experience → RPEEducation → Constraints → BodyMetrics → MacroSetup → PlanPreview → BuildingPlan
Main: Home → HomeScreen, WeeklyCoachSummary
      Workout → WorkoutHomeScreen, PlanView, ActiveWorkout, WorkoutComplete, ExerciseLibrary
      Progress → ProgressCharts, GoalTracker, PersonalRecordsScreen, BodyMeasurements
      Nutrition → MacroTracker
      Profile → ProfileSettings, SubscriptionManagement, NotificationsSettings
```

### Auth Flow (NEW v1.21)
- SplashScreen checks: no session → Auth | session + no plans → Onboarding | session + plans → MainTabs
- AuthContext.tsx tracks session, hasPlans, authReady, refreshPlans()
- SignOut: use .then().catch().finally() pattern — NOT async/await (hangs on web)
- Sign out navigates: navigation.reset({ index: 0, routes: [{ name: 'Auth' }] })
- Alert.alert for native confirmation; window.confirm for web

### Critical Navigation Patterns
```ts
// WeeklyCoachSummary (via reset)
navigation.reset({ index: 0, routes: [{ name: 'MainTabs',
  state: { routes: [{ name: 'HomeTab',
    state: { routes: [{ name: 'WeeklyCoachSummary', params: { planId, weekNumber } }] } }] } }] })

// PlanView from WorkoutComplete
navigation.navigate('MainTabs', { screen: 'WorkoutTab', params: { screen: 'PlanView' } })
// NOT: navigation.navigate('PlanView') ← broken

// Paywall navigation
navigation.navigate('ProfileTab' as any, { screen: 'SubscriptionManagement' })
```

---

## DATABASE SCHEMA NOTES

```
workout_logs: logged_at (NOT created_at) | sets_json.weightLbs (NOT weight)
sets_json per set: { exerciseId (positional e.g. "e1"), exerciseName, weightLbs, rpe, reps, setNumber, isWarmup, swapped }
plans: status = active/completed/paused ONLY
macro_plans: calorie_pace text DEFAULT 'balanced'
planId: always fresh query, never route.params
weight_logs: sleep_hours FLOAT (nullable)
user_profiles: height_ft INTEGER, height_in INTEGER, age INTEGER, full_name TEXT
               unique constraint on user_id — use .update() not upsert
               always query: .order('id', {ascending:false}).limit(1).maybeSingle()
```

### All Applied SQL Migrations
```sql
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS training_days text[] DEFAULT '{}';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS height_ft INTEGER;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS height_in INTEGER;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE macro_plans ADD COLUMN IF NOT EXISTS calorie_pace text DEFAULT 'balanced';
ALTER TABLE weight_logs ADD COLUMN IF NOT EXISTS sleep_hours FLOAT;
ALTER TABLE weekly_summaries ADD COLUMN IF NOT EXISTS sport_calorie_nudge TEXT;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_user_id_unique UNIQUE (user_id);
-- Body measurements, sport_logs tables — see PRD Section 11
```

---

## AUTH & USER MANAGEMENT (NEW v1.21)

### Sign Up Flow
- Fields: Full Name, Email, Password, Confirm Password
- After signUp: upsert user_profiles with { user_id, full_name }
- onConflict: 'user_id' required on upsert
- Email confirmation: disabled for TestFlight (Supabase Auth Settings)

### Sign In Flow
- supabase.auth.signInWithPassword({ email, password })
- After sign in: refreshPlans() → route to Onboarding or MainTabs
- Forgot password: supabase.auth.resetPasswordForEmail(email)

### Display Name
- HomeScreen reads user_profiles.full_name, splits on space for first name
- Fallback: email local part (before @), capitalize first letter

### Account Deletion (P0 — COMPLETE)
- Edge Function: delete-account (--no-verify-jwt)
- Deletion order: macro_logs → meal_suggestions → weight_logs → body_measurements → sport_logs → free_sessions → workout_logs → weekly_summaries → macro_plans → plans → goals → user_profiles → auth.admin.deleteUser()
- Profile → Support → "Delete Account" (Colors.danger label)
- Two-step confirmation Alert
- On success: supabase.auth.signOut() → navigate to Auth

---

## PLAN_JSON STRUCTURE

```
plan_json root keys: goal, split, title, weeks[], goalLift, targetLift,
                     totalWeeks, currentWeek, daysPerWeek, deloadCycle,
                     biologicalSex, jordanWelcome, scheduledDays,
                     sessionLength, concurrentSport, enhancedRecovery,
                     week1BaselineWeight, subMusclePreferences,
                     experience, equipment,
                     latestJordanNote, latestJordanNoteUpdatedAt

WeekObject: { weekNumber, phase, days[] }
DayObject:  { dayNumber, type, title, sessionFocus, muscleGroups, exercises[] }
ExerciseObject: { id, name, muscleGroup, sets, reps (string or number),
                  targetWeight, restSeconds, targetRpe, coachingNote,
                  setStructure, setTargets[], equipment, compoundTier,
                  muscleEmphasis, adaptationHeadline, adaptationBody,
                  adaptationThisSession }
```

**CRITICAL:** exercise.reps can be string ("5", "45 seconds") or number (5).
Always coerce: String(exercise.reps ?? '') before calling string methods.
ExerciseCard.isTimedExercise and parseTimedDuration must use String() conversion.

---

## GENERATE-NEXT-WEEK — ARCHITECTURE (v1.21 REWRITE)

### Core Principle
**No Claude API call.** W2+ is built by cloning W1 structure and updating weights deterministically.

### Execution Order
1. Fetch active plan + plan_json
2. Query prior week workout_logs (filtered by plan_id + week_number, ordered by logged_at DESC)
3. Deduplicate logs: one row per day_number (most recent wins)
4. Build priorHeavyExerciseMap and priorVolumeExerciseMap from plan_json.weeks[priorWeekIndex].days
   - Heavy map: days where title does NOT include 'volume'
   - Volume map: days where title includes 'volume'
5. Clone W1: newWeekDays = JSON.parse(JSON.stringify(week1.days))
6. Per-exercise loop (see below)
7. Volume day reps stamp (target lift only → 8 reps)
8. DB write: append new week to plan_json.weeks[], update current_week

### Per-Exercise Weight Progression
```ts
// Baseline: always from plan_json (NOT from logs)
const priorPlanExercise = isTargetLiftOnHeavyDay
  ? priorHeavyExerciseMap.get(exName)
  : isTargetLiftOnVolumeDay
    ? priorVolumeExerciseMap.get(exName) ?? priorHeavyExerciseMap.get(exName)
    : priorHeavyExerciseMap.get(exName) ?? priorVolumeExerciseMap.get(exName);

const planBaseline = getPlanBaselineWeight(priorPlanExercise);
// Pyramid: max of setTargets[].targetWeight
// Straight: targetWeight directly

// RPE from logs only (direction signal)
const avgLoggedRpe = workingSets average rpe ?? 7.0;
```

### Key Functions
- `isTargetLift(exercise, goalLift)` — exact name match only, no substring
- `computeRpeGap(avgLoggedRpe, targetRpe)` — returns targetRpe - avgLoggedRpe (positive = easier = increase)
- `strengthPeriodisation(weekInCycle)` — W1:5×5@7 | W2:4×4@8 | W3:3×3@8.5 | W4:deload3×5@6
- `accessoryWeightIncrement(avgRpe, targetRpe, equipment)` — tiered by gap and equipment
- `pyramidTopSetPct(setCount)` — 3-set:1.0 | 4-set:1.0 | 5-set:0.90
- `buildSetTargets(targetWeight, setCount, priorSetTargets)` — returns objects {setNumber, targetWeight, targetRpe, targetReps}
- `isVolumeDay(session, planJson)` — checks title.includes('volume') first, then planJson.weeks[0].days lookup
- `getPlanBaselineWeight(exercise)` — max of setTargets or targetWeight
- `getExerciseSets(allSets, exercise)` — name-only match with normalize() (handles plural/singular)

### sets_json Key Facts
- One log row per session (all exercises in one flat sets_json array)
- exerciseId is positional ("e1", "e2") — NEVER use for matching
- Match exercises by exerciseName only
- Session scoping: find matchingPriorLog by day_number before filtering sets

### Test Harness
POST to generate-next-week with `{"mode":"test"}` — runs all scenarios, returns JSON.
PowerShell: `Invoke-WebRequest -Uri "https://[project].supabase.co/functions/v1/generate-next-week" -Method POST -Headers @{"Content-Type"="application/json"} -Body '{"mode":"test"}' -UseBasicParsing | Select-Object -ExpandProperty Content`

---

## GENERATE-PLAN — KEY BEHAVIOURS

**SESSION COUNT CONTRACT:** workoutDayCount = sessionStructure.filter(d => d.type === 'workout').length

**plan_json root fields written at generation:**
- experience, equipment (from request body — required for ProfileSettings)
- sessionLength, daysPerWeek, deloadCycle
- week1BaselineWeight = round(current1RM * 0.75 / 2.5) * 2.5 (strength only)

**Strength goal:**
- Target lift = always exercise #1 on heavy day
- setStructure: 'straight' enforced in post-processor (not via Claude prompt alone)
- Volume day target lift: 85% of heavy day weight, 8 reps (post-processor stamps this)
- Periodisation: W1:5×5@7 → W2:4×4@8 → W3:3×3@8.5 → W4:deload

**2-day strength splits:**
- Upper body target lift (bench/OHP): Heavy Upper + Volume Upper (both upper body)
- Lower body target lift (squat/deadlift): Heavy Lower + Volume Lower (both lower body)
- sessionStructure built in utils/splitRecommendation.ts with targetLiftDay:true, primaryLift fields
- Override fires at top of getSessionStructure() before all matrix logic

**Post-processing (after Claude response, before DB write):**
1. enforceSetStructure() — target lift → straight, accessories → equipment/tier rules
2. Volume day reps stamp — target lift only → reps:'8', repsMin:8, repsMax:8
3. plan_json.experience = body.experience, plan_json.equipment = body.equipment

---

## JORDAN PERSONA — VOICE RULES

- Never: "AI", "tracker", "planner", "log and track", "AI coach"
- Never: "Great / Excited / Crush it / Amazing / bounce back / you've got this"
- Never: exclamation marks on tough weeks
- Weekly summary: max 4 sentences per paragraph, two-paragraph structure
- jordanWelcome: always 4 sentences, first person, no qualifiers
- Tone tiers: newcomer(0–1wk) → building(2–4) → established(5–8) → veteran(9+)
- latestJordanNote: written to plan_json after each session via coaching-feedback

---

## HOME SCREEN — JORDAN CARD

Priority order for Jordan card body:
1. latestSummary.coach_note or latestSummary.summary (weekly summary)
2. plan_json.latestJordanNote (session coaching note, updated after each workout)
3. plan_json.jordanWelcome (W1 only, before any sessions)

Review Weekly Summary CTA:
- Shows when: completedWeek >= 1 AND latestSummary != null AND plan active
- hasUnviewedWeeklySummary drives NEW badge only (AsyncStorage key: `'hone_unviewed_summary_week'`; legacy `'afc_unviewed_summary_week'` migrated on read in HomeScreen)
- CTA text: "Review Week {N} Summary →" in Colors.accent
- Written to AsyncStorage after weekly-coach-summary succeeds in WorkoutCompleteScreen
- Cleared from AsyncStorage (badge only) when WeeklyCoachSummaryScreen mounts

---

## PROFILE SETTINGS — TRAINING PREFERENCES

Read priority: plan_json first → user_profiles fallback
```ts
const pj = plan?.plan_json ?? {};
experience    = pj?.experience    ?? profile?.experience    ?? '—';
equipment     = pj?.equipment     ?? profile?.equipment     ?? '—';
sessionLength = pj?.sessionLength ?? profile?.session_length ?? '—';
daysPerWeek   = pj?.daysPerWeek   ?? profile?.training_days?.length ?? '—';
split = formatSplit(pj?.split ?? profile?.preferred_split ?? '—');
goal  = formatGoal(pj?.goal ?? '—');
```

formatSplit: full_body_beginner/advanced → "Full Body", ppl → "PPL" etc.
formatGoal: power_hypertrophy → "Strength & Size", fat_loss → "Fat Loss" etc.
formatEquipment: full_gym → "Full Gym", home_gym → "Home Gym" etc.

---

## REVENUECAT GATING

```ts
isPro: boolean  // web always true; native reads entitlements.active['pro']
// Fail closed: error → isPro = false
```

Gates: Week 2+ sessions | Progress charts (6 sections) | Goal edit
Lock button: "🔒 Unlock Week {N} — Go Pro"

---

## SUPABASE EDGE FUNCTIONS

All: JWT **DISABLED** (`--no-verify-jwt`), Model: `claude-sonnet-4-6`
Deploy reminder: `supabase functions deploy [function-name] --no-verify-jwt`

---

## SPLIT LIBRARY

| splitId | Display | Days |
|---|---|---|
| full_body_beginner | Full Body | 3 |
| full_body_advanced | Full Body | 3 |
| upper_lower | Upper / Lower | 4 |
| phul | PHUL | 4 |
| ppl_upper | PPL + Upper | 5 |
| ppl | PPL | 6 |
| ppl_leg_focus | PPL + Leg Focus | 5 |
| leg_focus | Leg Focus | 4 |
| upper_focus | Upper Focus | 4 |
| arnold | Arnold Split | 6 |
| batman | Batman Split | 6 |
| strength_2x | Strength Focus | 3–5 |
| strength_3x | Strength Focus | 5–6 |

---

## METRIC UNIT TOGGLE

`utils/units.ts` + `useMetric()` hook (`HONE_UNITS_METRIC_KEY` → storage string `'afc_units_metric'` unchanged for upgrade compatibility)
Golden Rule: DB always stores lbs. Convert at display layer only.

---

## KNOWN ISSUES / GOTCHAS

- Lib/ uses capital L — imports must be 'Lib/supabase'
- exercise.reps is string OR number — always coerce with String() before string methods
- sets_json exerciseId is positional ("e1") — match exercises by exerciseName only
- Alert.alert doesn't work on web — use Platform.OS check + window.confirm for web
- Sign out: use .then().catch().finally() NOT async/await (hangs on web)
- user_profiles: .update() not upsert (unique constraint). Query: .order('id',{ascending:false}).limit(1).maybeSingle()
- planId: always fresh query, never route.params
- PlanView from WorkoutComplete: navigation.navigate('MainTabs', { screen: 'WorkoutTab', params: { screen: 'PlanView' } })
- workout_logs uses logged_at not created_at

---

## HOW WE WORK

- Claude writes Cursor/Composer prompts, developer pastes
- Opus 4.6 for complex screens, new features, prompt engineering
- Sonnet 4.6 for fixes, Edge Functions, simple screens
- Composer 2 for all multi-file tasks
- Always provide testing criteria
- Always include `--no-verify-jwt` on every Edge Function deploy
- Commit after every completed feature
- Test harness first: curl generate-next-week?mode=test before UI testing

---

## OUTSTANDING ITEMS

### 🟠 Remaining QA (pre-beta)
- Deload regression: W4→W5 baseline uses W3 weights (not W4 deload weights)
- Enhanced recovery: deload every 5th week not 4th
- Concurrent sport: leg days away from high-intensity sport days
- Female rep ranges: +2 vs male across all goals
- Full 5-goal regression (hypertrophy, fat_loss, strength, recomp, general)

### 🟡 Post-TestFlight
- Lite re-onboarding for plan completion (skip paywall + body metrics re-entry)
- Claude API fallback: serve generic starter plan when API fails
- Cost minimisation: rate limiting free-tier plan generation
- Custom email domain for auth emails (SendGrid/Resend)
- Apple Sign In (required for App Store if other social login exists)
- Splash/loading screen: **Hone** text; `./assets/splash-icon.png` should be regenerated for final brand art
- App icon asset generation (1024×1024 PNG for App Store)

### ✅ Completed This Sprint
- Account deletion (P0 — App Store requirement)
- Auth flow: SignUp, SignIn, SignOut
- Full name on signup → stored in user_profiles.full_name
- New user → onboarding, existing user → dashboard
- Hone rebrand: app name, logo mark, auth screen
- generate-next-week full rewrite (W1 clone, plan baseline, no Claude call)
- Strength goal progression: periodisation, straight sets, volume day 8 reps
- Jordan card: session note + weekly summary priority chain
- Profile training preferences: reads from plan_json first
- ExerciseCard: reps string/number coercion fix
- Warmup visibility: movement-type based rules

---

## DO NOT CHANGE

The filename — it must remain `CLAUDE_CONTEXT.md`
<!-- DO NOT CHANGE THE FILENAME -->
PROJECT CONTEXT
App: Adaptive Fitness Coach — iOS/Android subscription SaaS
Stack: React Native + Expo, Supabase, RevenueCat, Claude API, Zustand
Supabase tables: users, user_profiles, goals, plans, workout_logs, macro_plans, weekly_summaries, macro_logs, weight_logs, meal_suggestions
Config files: Lib/supabase.ts, Lib/Revenuecat.ts
Edge Functions: supabase/functions/generate-plan, supabase/functions/coaching-feedback, supabase/functions/weekly-coach-summary, supabase/functions/generate-next-week, supabase/functions/adjust-macros, supabase/functions/generate-meals
Other key files: constants/design.ts, constants/ingredientLibrary.ts, components/MealBuilderModal.tsx

COMPLETED SCREENS
Phase 1 — Foundation (✅ Complete)

S01 Splash ✅
S02 Goal Selection ✅
S02b Goal Details ✅
S03 Experience & Schedule ✅
S04 Constraints & Equipment ✅
S05 Body Metrics ✅
S06 Macro Setup ✅
S07 Plan Preview + Paywall ✅ (RevenueCat wired — native only, web dev bypass active)
S07b Building Plan ✅
S08 Home Dashboard ✅
S09 Active Workout ✅
S10 Workout Complete ✅
S11 Plan View ✅

Phase 2 — Core Loop (✅ Complete)

S15 Weekly Coach Summary ✅
Adaptive coaching engine ✅
S13 Progress Charts ✅
S16 Macro Tracker ✅
S12 Exercise Library ✅
S14 Goal Tracker ✅
Tab navigation ✅
S17 Profile & Settings ✅
S18 Subscription Management ✅

Phase 3 — Engagement (✅ Complete)

S19 Notifications Settings ✅
Real streak, session count, weekly volume on Dashboard ✅
Jordan coach persona ✅
Daily bodyweight logging ✅
AI macro adjustment ✅
Jordan meal suggestions ✅
Meal builder ✅
Weekly summary fixes ✅
Dashboard polish ✅

Design Upgrade — applying new design system across all screens (✅ Complete)
Reference document: AdaptiveFitnessCoach_PRD_v1_6.md and AdaptiveFitness_DesignSpec_v1_0.md


CURRENT PHASE
Phase 4 — Integrations (Apple Health, Google Fit, MyFitnessPal OAuth, wearable HR data)
Pre-launch: TestFlight build + paywall conversion optimization


DESIGN SYSTEM (✅ Implemented)
constants/design.ts is the single source of truth for all tokens.
All screens import from this file. Do not use hardcoded hex strings.

Import pattern:
import { Colors, Fonts, FontSizes, LineHeights, Spacing,
         Radius, CommonStyles, Shadows } from '../constants/design';
Adjust relative path: onboarding screens use '../../constants/design'

Font: DM Sans loaded in App.tsx via @expo-google-fonts/dm-sans
  Fonts.regular   = 'DMSans_400Regular'
  Fonts.medium    = 'DMSans_500Medium'
  Fonts.semiBold  = 'DMSans_600SemiBold'
  Fonts.bold      = 'DMSans_700Bold'

Key colors:
  Colors.bgPrimary    = '#09090B'   // screen background
  Colors.bgCard       = '#111113'   // card background
  Colors.bgElevated   = '#1C1C1E'   // modals, bottom sheets
  Colors.accent       = '#F97316'   // orange — primary brand
  Colors.accentMuted  = 'rgba(249,115,22,0.12)'
  Colors.accentBorder = 'rgba(249,115,22,0.4)'
  Colors.textPrimary  = '#FAFAFA'
  Colors.textSecondary = '#A1A1AA'
  Colors.textTertiary  = '#52525B'
  Colors.success      = '#22C55E'
  Colors.successMuted = 'rgba(34,197,94,0.12)'
  Colors.warning      = '#F59E0B'
  Colors.warningMuted = 'rgba(245,158,11,0.12)'
  Colors.danger       = '#EF4444'
  Colors.dangerMuted  = 'rgba(239,68,68,0.12)'
  Colors.divider      = '#27272A'
  Colors.border       = '#3F3F46'
  Colors.overlay      = 'rgba(0,0,0,0.7)'

FontSizes: micro(10) label(11) caption(13) body(15) title(17)
           heading2(20) heading1(26) display(32)

Radius: sm(8) md(12) lg(16) xl(20) xxl(24) full(9999)

DESIGN UPGRADE PROGRESS (✅ All Complete — committed April 2026)
Color pass ✅ — all screens use Colors.* from constants/design.ts
Font pass ✅ — all screens use Fonts.* and FontSizes.* from constants/design.ts

Screen redesigns completed:
✅ S02–S07b Onboarding screens (step counter replaces progress bar, full card selection pattern)
✅ S08 Home Dashboard
✅ S09 Active Workout (ExerciseCard.tsx, RPESelector.tsx)
✅ S10 Workout Complete
✅ S11 Plan View
✅ S12 Exercise Library
✅ S13 Progress Charts (bodyweight chart date fix + clip fix)
✅ S14 Goal Tracker (lift name formatter, Expectations tooltip wired)
✅ S15 Weekly Coach Summary
✅ S16 Macro Tracker + MealBuilderModal
✅ S17 Profile & Settings + NotificationsSettings
✅ S18 Subscription Management


DESIGN RULES FOR ALL REMAINING PROMPTS
- Import Colors, Fonts, FontSizes, Radius from constants/design.ts
- StyleSheet.create only — no inline styles (except dynamic DimensionValue widths)
- No hardcoded hex strings anywhere — use Colors.* exclusively
- Remove fontWeight — use fontFamily (Fonts.*) instead
- All primary buttons: height 56, borderRadius Radius.lg, backgroundColor Colors.accent
- All section headings: fontSize FontSizes.label, fontFamily Fonts.bold,
  color Colors.textSecondary, letterSpacing 1.5, textTransform 'uppercase'
- All cards: backgroundColor Colors.bgCard, borderRadius Radius.lg,
  borderWidth 1, borderColor Colors.divider
- Back chevrons: "‹" fontSize 28, fontFamily Fonts.bold, color Colors.accent
- Screen background: Colors.bgPrimary always


NAVIGATION STRUCTURE
Tab Navigator (5 tabs)

Home → HomeScreen, WeeklyCoachSummary
Workout → WorkoutHomeScreen, PlanView, ActiveWorkout, WorkoutComplete, ExerciseLibrary
Progress → ProgressCharts, GoalTracker
Nutrition → MacroTracker
Profile → ProfileSettings, SubscriptionManagement, NotificationsSettings

Root stack (above tabs — no tab bar)
Splash → Onboarding → GoalDetails → Experience →
Constraints → BodyMetrics → MacroSetup → PlanPreview → BuildingPlan → MainTabs
ActiveWorkout and WorkoutComplete live in root stack (full screen, no tab bar).

View Full Plan from HomeScreen:
  navigation.navigate('WorkoutTab' as any, {
    screen: 'PlanView', params: { planId, weekNumber }
  })

SUPABASE EDGE FUNCTIONS
generate-plan — JWT: DISABLED | Returns: { plan }
coaching-feedback — JWT: DISABLED | Returns: { feedback: string }
weekly-coach-summary — JWT: DISABLED | Model: claude-sonnet-4-6
  Guard: only generates if weekNumber < currentWeek
  Client saves result via upsert to weekly_summaries
generate-next-week — JWT: DISABLED | Model: claude-sonnet-4-6
  Saves directly to Supabase, increments current_week
  Guards: plan_complete, already_advanced (idempotent)
adjust-macros — JWT: DISABLED | Model: claude-sonnet-4-6
  Requires 3+ weight_logs in last 14 days
  Cap: ±200 cal, protein floor: weightLbs × 0.8g
generate-meals — JWT: DISABLED | Model: claude-sonnet-4-6
  Upserts single row per user in meal_suggestions

Deploy all:
supabase functions deploy generate-plan
supabase functions deploy coaching-feedback
supabase functions deploy weekly-coach-summary
supabase functions deploy generate-next-week
supabase functions deploy adjust-macros
supabase functions deploy generate-meals
⚠️ JWT verification must be DISABLED in dashboard after every deploy.

JORDAN COACH PERSONA
Name: Jordan (gender-neutral)
Voice: Direct, data-driven, no filler praise
Always references actual numbers (weights, reps, RPE, week number)
Signs off weekly summaries with "— Jordan"
In UI: "JORDAN" label style — fontSize FontSizes.label, fontFamily Fonts.bold,
color Colors.accent, letterSpacing 1.5

CRITICAL DATA NOTES
sets_json shape (workout_logs):
  exerciseId: string     // resolve name via exerciseMap from plan_json.weeks
  setNumber: number
  weightLbs: number      // ⚠️ field is weightLbs not weight
  reps: number
  rpe: number | null
  swapped: boolean

plan_json exercise shape:
  id, name, muscleGroup (⚠️ Capitalised — use .toLowerCase() for color lookup),
  sets, reps (string e.g. "8-10"), targetWeight, restSeconds, targetRpe,
  coachingNote?

Upsert conflict keys:
  macro_logs: 'user_id,log_date,meal_name'
  weekly_summaries: 'user_id,plan_id,week_number'
  weight_logs: 'user_id,log_date'
  meal_suggestions: 'user_id'

DATABASE — ADDITIONAL COLUMNS
sql-- User profiles extras (run if missing)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS injuries text[],
  ADD COLUMN IF NOT EXISTS height_ft integer,
  ADD COLUMN IF NOT EXISTS height_in integer,
  ADD COLUMN IF NOT EXISTS weight_lbs float,
  ADD COLUMN IF NOT EXISTS dietary_style text DEFAULT 'omnivore',
  ADD COLUMN IF NOT EXISTS food_allergies text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS meal_prefs_set boolean DEFAULT false;

-- Goals table extras (run if missing)
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS recomp_focus text,
  ADD COLUMN IF NOT EXISTS general_focus text,
  ADD COLUMN IF NOT EXISTS starting_weight_lbs float,
  ADD COLUMN IF NOT EXISTS secondary_lift text,
  ADD COLUMN IF NOT EXISTS projection_text text,
  ADD COLUMN IF NOT EXISTS projection_metrics jsonb;

-- New tables (run if missing)
CREATE TABLE IF NOT EXISTS weight_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  weight_lbs FLOAT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, log_date)
);

CREATE TABLE IF NOT EXISTS meal_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ DEFAULT now(),
  suggestions_json JSONB NOT NULL,
  calories_target INTEGER NOT NULL,
  UNIQUE(user_id)
);

DATABASE — ACTIVE PLAN QUERY PATTERN
⚠️ Always use created_at ordering when querying active plans/goals to guarantee
the most recent record wins (multiple records may be marked active from test runs):

supabase
  .from('plans')
  .select(...)
  .eq('user_id', uid)
  .eq('status', 'active')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()

Same pattern for goals table. Run this SQL once to clean up stale active records:

-- Keep only the most recent active plan per user
UPDATE plans SET status = 'inactive'
WHERE status = 'active'
  AND id NOT IN (
    SELECT DISTINCT ON (user_id) id FROM plans
    WHERE status = 'active'
    ORDER BY user_id, created_at DESC
  );

-- Same for goals
UPDATE goals SET status = 'inactive'
WHERE status = 'active'
  AND id NOT IN (
    SELECT DISTINCT ON (user_id) id FROM goals
    WHERE status = 'active'
    ORDER BY user_id, created_at DESC
  );

ADAPTIVE ENGINE LOGIC
Completion tiers:
  full ≥80%: +2.5 compound / +1 isolation if RPE≤7 and reps exceeded
  partial 60-79%: hold all weights
  low <60%: decrease -2.5 all exercises

Phase cycle (4-week):
  week % 4 === 0 → deload (weights ×0.8, sets -1 min 2)
  first half → accumulation
  second half → intensification

MACRO ADJUSTMENT LOGIC
Target rates: fat_loss -0.75/wk, hypertrophy +0.25/wk,
  strength +0.25/wk, recomp 0.0/wk, general 0.0/wk
Thresholds: |delta| < 0.3 → on_track, |delta| > 1.5 → anomaly
Cap: ±200 cal, protein floor weightLbs × 0.8g

MEAL BUILDER
Files: constants/ingredientLibrary.ts + components/MealBuilderModal.tsx
50 hardcoded ingredients across 4 categories
getFilteredIngredients(category, slot, dietaryStyle, allergies): Ingredient[]
Accessed via "Customise →" on Jordan meal cards
Ingredient selection is per-serving (− / count / +) not single toggle

KNOWN ISSUES / NOTES
- Lib/ uses capital L — imports must be 'Lib/supabase'
- RevenueCat entitlement key: 'pro'
- RevenueCat web bypass: Platform.OS === 'web' in PlanPreviewScreen
- ALL Edge Functions JWT: DISABLED
- Edge Function model: 'claude-sonnet-4-6'
- Deno VS Code warnings: harmless
- S10 duration shows 0 min on web (correct on device)
- require('react').useState on line ~101 of WorkoutCompleteScreen — pre-existing, non-blocking
- Weekly summary only generates if weekNumber < currentWeek
- Coach card on Dashboard only shows if summary is for currentWeek-1 or newer
- user_profiles may have duplicate rows from test runs — always query with
  .order('id', { ascending: false }).limit(1).maybeSingle()
- Weight log date display: always parse log_date as local time using
  new Date(log_date + 'T00:00:00') to prevent UTC timezone offset shifting
  the date back by one day in US timezones
- Lift names stored as snake_case in DB (e.g. bench_press) — use formatLiftName()
  helper to display: lift.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
- Sign out uses navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] })
  via getParent().getParent() to reach the root navigator from tab screens
- DEV: Restart Onboarding button visible in ProfileSettings when __DEV__ === true

RULES FOR THIS PROJECT
- React Native + Expo only, TypeScript everywhere
- All DB calls through Lib/supabase.ts
- All Claude API calls through Edge Functions only
- Never hardcode API keys or hex color strings
- Screens in /screens, components in /components
- Register every new screen in navigation/index.tsx

HOW WE WORK
- Claude writes Cursor/Composer prompts, developer pastes
- Opus 4.6 for complex screens and prompt engineering
- Sonnet 4.6 for fixes, Edge Functions, simple screens
- Composer 2 for all multi-file tasks and screen redesigns
- Commit after every completed screen

PHASE 4 PRIORITIES (next)
- Apple Health integration (HealthKit)
- Google Fit integration (Android)
- MyFitnessPal nutrition sync (OAuth)
- Wearable heart rate data
- TestFlight build + paywall conversion optimization

DEFERRED FEATURES
- Bodyweight goal in onboarding with healthy rate guardrails
- Metric unit toggle (imperial only in v1 — deferred to v1.2)
- Social features, in-app chat, cardio plans, web app
- Nutrition trend chart on Progress screen (redundant with Nutrition tab weekly chart)

DO NOT CHANGE
The filename — it must remain CLAUDE_CONTEXT.md
Any other files in the project
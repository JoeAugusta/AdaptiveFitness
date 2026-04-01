CLAUDE_CONTEXT.md
<!-- DO NOT CHANGE THE FILENAME -->
PROJECT CONTEXT
App: Adaptive Fitness Coach — iOS/Android subscription SaaS
Stack: React Native + Expo, Supabase, RevenueCat, Claude API, Zustand
Supabase tables: users, user_profiles, goals, plans, workout_logs, macro_plans, weekly_summaries, macro_logs, weight_logs, meal_suggestions
Config files: Lib/supabase.ts, Lib/Revenuecat.ts
Edge Functions: supabase/functions/generate-plan, supabase/functions/coaching-feedback, supabase/functions/weekly-coach-summary, supabase/functions/generate-next-week, supabase/functions/adjust-macros, supabase/functions/generate-meals
Other key files: constants/ingredientLibrary.ts, components/MealBuilderModal.tsx
COMPLETED SCREENS
Phase 1 — Foundation (✅ Complete)
S01 Splash ✅ (checks auth session — skips onboarding if active plan exists)
S02 Goal Selection ✅
S02b Goal Details (branching by goal type) ✅
S03 Experience & Schedule ✅
S04 Constraints & Equipment ✅
S05 Body Metrics ✅
S06 Macro Setup ✅
S07 Plan Preview + Paywall ✅ (RevenueCat wired — native only, web dev bypass active)
S07b Building Plan ✅ (fires generate-plan Edge Function, saves to Supabase, saves projection to goals)
S08 Home Dashboard ✅ (real stats, weight logging card, week advance CTA, live coach card)
S09 Active Workout ✅ (Supabase wired + coaching-feedback Edge Function)
S10 Workout Complete ✅ (auto-triggers weekly summary + generate-next-week + adjust-macros + generate-meals on last session)
S11 Plan View ✅ (Supabase wired — real plan, correct week, locked future weeks)
Phase 2 — Core Loop (✅ Complete)
S15 Weekly Coach Summary ✅ (guard: never generates for current active week)
Adaptive coaching engine ✅ (generate-next-week Edge Function)
S13 Progress Charts ✅ (strength, volume, bodyweight trend wired, consistency heatmap)
S16 Macro Tracker ✅ (calorie ring, macro breakdown, Jordan meal suggestions, meal builder, weekly adherence)
S12 Exercise Library ✅ (86 exercises, search, filter, favourites, avoided)
S14 Goal Tracker ✅ (progress bar, milestones, expectations vs reality, goal history)
Tab navigation ✅ (5 tabs: Home, Workout, Progress, Nutrition, Profile)
S17 Profile & Settings ✅ (weight reads from weight_logs, edit modal removed)
S18 Subscription Management ✅
Phase 3 — Engagement (✅ Complete)
S19 Notifications Settings ✅ (workout reminders + daily weigh-in reminder, AsyncStorage persistence)
Real streak, session count, weekly volume on Dashboard ✅
Jordan coach persona ✅ (deployed across all 4 Edge Functions)
Daily bodyweight logging ✅ (Dashboard card, weight_logs table, Profile read-only)
AI macro adjustment ✅ (adjust-macros Edge Function, weekly trigger from WorkoutComplete)
Jordan meal suggestions ✅ (generate-meals Edge Function, dietary preferences questionnaire)
Meal builder ✅ (50-ingredient hardcoded library, zero API cost, "Customise →" on meal cards)
Weekly summary fixes ✅ (upsert not insert, staleness guard on coach card, previous weeks list)
Dashboard polish ✅ (live coach card, greeting fix, volume zero state, View Full Plan nav fix)
CURRENT PHASE
Phase 3 ✅ Complete — Next: TestFlight prep + Phase 4 (Integrations)
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
WorkoutHomeScreen auto-fetches active plan and navigates to PlanView with real planId.
View Full Plan from HomeScreen navigates via:
navigation.navigate('WorkoutTab' as any, { screen: 'PlanView', params: { planId, weekNumber } })
SUPABASE EDGE FUNCTIONS
generate-plan
Called from: BuildingPlanScreen.tsx
Purpose: Week 1 plan via Claude API
JWT: DISABLED | Returns: { plan }
coaching-feedback
Called from: ActiveWorkoutScreen.tsx
Purpose: Real-time coaching note per set
JWT: DISABLED | Returns: { feedback: string }
weekly-coach-summary
Called from: WeeklyCoachSummaryScreen + WorkoutCompleteScreen
Purpose: Weekly debrief from workout_logs
JWT: DISABLED | Model: claude-sonnet-4-6
Client saves result to weekly_summaries via upsert (not the Edge Function)
Guard: only generates if weekNumber < currentWeek
Returns: { summary: WeeklySummaryData }
generate-next-week
Called from: WorkoutCompleteScreen (auto) + HomeScreen (manual CTA)
Purpose: Adapted Week N+1 from workout_logs
JWT: DISABLED | Model: claude-sonnet-4-6
Saves directly to Supabase (appends week, increments current_week)
Returns: { status, nextWeekNumber, phase, completionTier }
Guards: plan_complete, already_advanced (idempotent)
adjust-macros
Called from: WorkoutCompleteScreen (after weekly summary upsert succeeds)
Purpose: Weekly macro adjustment based on weight trend vs goal target rate
JWT: DISABLED | Model: claude-sonnet-4-6
Requires minimum 3 weight_logs in last 14 days
Thresholds: |delta| < 0.3 → on_track, |delta| > 1.5 → anomaly
Cap: ±200 calories per adjustment, protein floor: weightLbs × 0.8g
Upserts new macro_plans row on adjustment
Returns: { status, weeklyChange, targetRate, delta, calorieAdjustment, reasoning, ... }
generate-meals
Called from: WorkoutCompleteScreen (weekly refresh, silent) + MacroTrackerScreen (on prefs save)
Purpose: Jordan meal suggestions calibrated to macro targets and dietary preferences
JWT: DISABLED | Model: claude-sonnet-4-6
Upserts single row per user in meal_suggestions (onConflict: 'user_id')
Returns: { status: 'success', suggestions: { meals, dailyTotals, jordanNote } }
Deploy commands
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here
supabase functions deploy generate-plan
supabase functions deploy coaching-feedback
supabase functions deploy weekly-coach-summary
supabase functions deploy generate-next-week
supabase functions deploy adjust-macros
supabase functions deploy generate-meals
⚠️ JWT verification must be DISABLED in dashboard after every deploy.
JORDAN COACH PERSONA
Name: Jordan (gender-neutral)
Voice: Direct, data-driven, no filler praise ("Great job!", "Keep it up!" — never used)
Always references actual numbers (weights, reps, RPE, week number)
Signs off weekly summaries with "— Jordan"
Speaks in first person throughout
Deployed in: generate-plan, coaching-feedback, weekly-coach-summary, generate-next-week
CRITICAL DATA NOTES
sets_json shape (workout_logs)
typescript{
exerciseId: string;   // e.g. "e1" — resolve name via exerciseMap
setNumber: number;
weightLbs: number;    // ⚠️ field is weightLbs not weight
reps: number;
rpe: number | null;
swapped: boolean;
}
No exerciseName stored — always resolve via exerciseMap built from plan_json.weeks.
plan_json exercise shape
typescript{
id: string;           // e.g. "e1"
name: string;
muscleGroup: string;  // ⚠️ Capitalised e.g. "Chest", "Back"
sets: number;
reps: string;         // e.g. "8-10"
targetWeight: number;
restSeconds: number;
targetRpe: number;
coachingNote?: string;
}
⚠️ muscleGroup color lookup must use .toLowerCase()
macro_logs upsert
onConflict: 'user_id,log_date,meal_name'
weekly_summaries upsert
onConflict: 'user_id,plan_id,week_number'
weight_logs upsert
onConflict: 'user_id,log_date'
meal_suggestions upsert
onConflict: 'user_id'
DATABASE — ADDITIONAL COLUMNS
sql-- Goals table extras (run if missing)
ALTER TABLE goals
ADD COLUMN IF NOT EXISTS recomp_focus text,
ADD COLUMN IF NOT EXISTS general_focus text,
ADD COLUMN IF NOT EXISTS starting_weight_lbs float,
ADD COLUMN IF NOT EXISTS secondary_lift text,
ADD COLUMN IF NOT EXISTS projection_text text,
ADD COLUMN IF NOT EXISTS projection_metrics jsonb;
-- User profiles extras
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS injuries text[],
ADD COLUMN IF NOT EXISTS height_ft integer,
ADD COLUMN IF NOT EXISTS height_in integer,
ADD COLUMN IF NOT EXISTS weight_lbs float,
ADD COLUMN IF NOT EXISTS dietary_style text DEFAULT 'omnivore',
ADD COLUMN IF NOT EXISTS food_allergies text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS meal_prefs_set boolean DEFAULT false;
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
projection_text: human-readable expectation saved at onboarding
projection_metrics: { expectedWeeklyVolumeIncreasePct, expectedConsistencyTarget,
planDurationWeeks, goalType, expectedStrengthGainLbs?, expectedWeightLossLbs? }
ADAPTIVE ENGINE LOGIC
Completion tiers (from workout_logs vs daysPerWeek):
full ≥80%: normal progression (+2.5 compound / +1 isolation if RPE≤7 and reps exceeded)
partial 60–79%: hold all weights
low <60%: decrease -2.5 all exercises
Phase cycle (4-week):
week % 4 === 0 → deload (weights ×0.8, sets -1 min 2)
first half of plan → accumulation
second half → intensification
MACRO ADJUSTMENT LOGIC (adjust-macros)
Target rates by goal:
fat_loss: -0.75 lbs/week
hypertrophy: +0.25 lbs/week
strength: +0.25 lbs/week
recomp: 0.0 lbs/week
general: 0.0 lbs/week
Thresholds:
|delta| < 0.3 → on_track (no adjustment)
0.3 ≤ |delta| ≤ 1.5 → adjust (Claude call)
|delta| > 1.5 → anomaly (no adjustment)
Guardrails: ±200 cal cap, protein floor weightLbs × 0.8g, calories rounded to 50, macros to 5
MEAL BUILDER
File: constants/ingredientLibrary.ts + components/MealBuilderModal.tsx
50 hardcoded ingredients: 15 proteins, 15 carbs, 10 fats, 10 vegetables
Filtered by: category, MealSlot, DietaryStyle, Allergen[]
getFilteredIngredients(category, slot, dietaryStyle, allergies): Ingredient[]
Zero API cost — all macro calculation is local
Accessed via "Customise →" on Jordan meal cards in MacroTracker
KNOWN ISSUES / NOTES
Lib/ uses capital L — imports must be 'Lib/supabase'
RevenueCat entitlement key: 'pro'
RevenueCat web bypass: Platform.OS === 'web' in PlanPreviewScreen
ALL Edge Functions JWT: DISABLED
Edge Function model: 'claude-sonnet-4-6'
Deno VS Code warnings: harmless
S10 duration shows 0 min on web (correct on device)
require('react').useState on line ~101 of WorkoutCompleteScreen — pre-existing, non-blocking, clean up in future pass
Weekly summary only generates if weekNumber < currentWeek (guard in WeeklyCoachSummaryScreen + WorkoutCompleteScreen)
Coach card on Dashboard only shows if summary is for currentWeek - 1 or newer (staleness guard)
Projection text NULL for goals created before migration — expected
user_profiles may have duplicate rows from test runs — query with .order('id', { ascending: false }).limit(1).maybeSingle()
RULES FOR THIS PROJECT
React Native + Expo only, TypeScript everywhere
All DB calls through Lib/supabase.ts
All Claude API calls through Edge Functions only
Never hardcode API keys
Screens in /screens, components in /components
Register every new screen in navigation/index.tsx
HOW WE WORK
Claude writes Cursor/Composer prompts, developer pastes
Opus 4.6 for complex screens and prompt engineering, Sonnet 4.6 for fixes/Edge Functions/simple screens
Use Composer 2 for multi-file tasks
Commit after every completed screen
COLOR VARIABLES
typescriptconst BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const CARD_SELECTED_BG = 'rgba(59,130,246,0.12)';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const DISABLED_BG = '#334155';
const DIVIDER_COLOR = '#2D3F55';
PHASE 4 PRIORITIES
Apple Health integration (HealthKit) — step count, active calories, heart rate during workouts
Google Fit integration (Android)
MyFitnessPal nutrition sync (OAuth)
Wearable heart rate data
DEFERRED FEATURES
Bodyweight goal in onboarding (target weight with healthy rate guardrails and expectation cards)
Metric unit toggle (imperial only in v1 — deferred to v1.2)
Social features (sharing, leaderboards, following)
In-app chat with human coaches
Cardio / running plans
Web app version
DO NOT CHANGE
The filename — it must remain CLAUDE_CONTEXT.md

Any other files in the project
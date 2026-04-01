CLAUDE_CONTEXT.md
<!-- DO NOT CHANGE THE FILENAME -->
PROJECT CONTEXT
App: Adaptive Fitness Coach — iOS/Android subscription SaaS
Stack: React Native + Expo, Supabase, RevenueCat, Claude API, Zustand
Supabase tables: users, user_profiles, goals, plans, workout_logs, macro_plans, weekly_summaries, macro_logs
Config files: Lib/supabase.ts, Lib/Revenuecat.ts
Edge Functions: supabase/functions/generate-plan, supabase/functions/coaching-feedback, supabase/functions/weekly-coach-summary, supabase/functions/generate-next-week

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
S08 Home Dashboard ✅ (Supabase wired — real plan data, Week 2+ aware)
S09 Active Workout ✅ (Supabase wired + coaching-feedback Edge Function)
S10 Workout Complete ✅ (auto-triggers weekly summary + generate-next-week on last session)
S11 Plan View ✅ (Supabase wired — real plan, correct week, locked future weeks)

Phase 2 — Core Loop (🟡 Almost Complete)

S15 Weekly Coach Summary ✅
Adaptive coaching engine ✅ (generate-next-week Edge Function)
S13 Progress Charts ✅ (strength, volume, bodyweight placeholder, consistency heatmap)
S16 Macro Tracker ✅ (calorie ring, macro breakdown, meal logging, weekly adherence)
S12 Exercise Library ✅ (86 exercises, search, filter, favourites, avoided)
S14 Goal Tracker ✅ (progress bar, milestones, expectations vs reality, goal history)
Tab navigation ✅ (5 tabs: Home, Workout, Progress, Nutrition, Profile)
S17 Profile & Settings ✅
S18 Subscription Management ✅


CURRENT PHASE
Phase 3 — Engagement

NAVIGATION STRUCTURE
Tab Navigator (5 tabs)

Home → HomeScreen, WeeklyCoachSummary
Workout → WorkoutHomeScreen, PlanView, ActiveWorkout, WorkoutComplete, ExerciseLibrary
Progress → ProgressCharts, GoalTracker
Nutrition → MacroTracker
Profile → ProfileSettings (placeholder — to be built)

Root stack (above tabs — no tab bar)
Splash → Onboarding → GoalDetails → Experience →
Constraints → BodyMetrics → MacroSetup → PlanPreview → BuildingPlan → MainTabs
ActiveWorkout and WorkoutComplete live in root stack (full screen, no tab bar).
WorkoutHomeScreen auto-fetches active plan and navigates to PlanView with real planId.

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
Client saves result to weekly_summaries (not the Edge Function)
Returns: { summary: WeeklySummaryData }

generate-next-week

Called from: WorkoutCompleteScreen (auto) + HomeScreen (manual CTA)
Purpose: Adapted Week N+1 from workout_logs
JWT: DISABLED | Model: claude-sonnet-4-6
Saves directly to Supabase (appends week, increments current_week)
Returns: { status, nextWeekNumber, phase, completionTier }
Guards: plan_complete, already_advanced (idempotent)

Deploy commands
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here
supabase functions deploy generate-plan
supabase functions deploy coaching-feedback
supabase functions deploy weekly-coach-summary
supabase functions deploy generate-next-week
⚠️ JWT verification must be DISABLED in dashboard after every deploy.

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
  ADD COLUMN IF NOT EXISTS weight_lbs float;
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


KNOWN ISSUES / NOTES

Lib/ uses capital L — imports must be 'Lib/supabase'
RevenueCat entitlement key: 'pro'
RevenueCat web bypass: Platform.OS === 'web' in PlanPreviewScreen
ALL Edge Functions JWT: DISABLED
Edge Function model: 'claude-sonnet-4-6'
Deno VS Code warnings: harmless
Dashboard quick stats (streak, sessions, volume): still mock — Phase 3
S10 duration shows 0 min on web (correct on device)
Macro quick-add presets don't sum to plan target — by design (partial meals)
Projection text NULL for goals created before migration — expected


RULES FOR THIS PROJECT

React Native + Expo only, TypeScript everywhere
All DB calls through Lib/supabase.ts
All Claude API calls through Edge Functions only
Never hardcode API keys
Screens in /screens, components in /components
Register every new screen in navigation/index.tsx

HOW WE WORK

Claude writes Cursor prompts, developer pastes
Opus 4.6 for complex screens, Sonnet 4.6 for fixes/Edge Functions
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

PHASE 3 PRIORITIES (after S17/S18)

Push notifications (workout reminders, milestone alerts)
Real streak + session count on Dashboard (replace mock)
Real weekly volume on Dashboard
Improved coach personality / memory

DEFERRED FEATURES — NUTRITION V2

Daily bodyweight logging → stored in new weight_logs table
AI macro adjustment based on weight trend (weekly Claude call)
Weight goal in onboarding (lose X lbs / gain X lbs) with
healthy rate guardrails and realistic expectation cards
Macro quick-add preset recalibration to match plan targets
Meal recommendations from dietary preferences / allergy questionnaire
MyFitnessPal / Apple Health nutrition sync


DO NOT CHANGE

The filename — it must remain CLAUDE_CONTEXT.md
- Any other files in the project
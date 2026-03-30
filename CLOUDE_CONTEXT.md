# CLAUDE_CONTEXT.md
<!-- DO NOT CHANGE THE FILENAME -->

## PROJECT CONTEXT
App: Adaptive Fitness Coach — iOS/Android subscription SaaS
Stack: React Native + Expo, Supabase, RevenueCat, Claude API, Zustand
Supabase tables: users, user_profiles, goals, plans, workout_logs, macro_plans, weekly_summaries
Config files: Lib/supabase.ts, Lib/Revenuecat.ts
Edge Functions: supabase/functions/generate-plan, supabase/functions/coaching-feedback, supabase/functions/weekly-coach-summary, supabase/functions/generate-next-week

---

## COMPLETED SCREENS

### Phase 1 — Foundation (✅ Complete)
- S01 Splash ✅
- S02 Goal Selection ✅
- S02b Goal Details (branching by goal type) ✅
- S03 Experience & Schedule ✅
- S04 Constraints & Equipment ✅
- S05 Body Metrics ✅
- S06 Macro Setup ✅
- S07 Plan Preview + Paywall ✅ (RevenueCat wired — native only, web dev bypass active)
- S07b Building Plan ✅ (fires generate-plan Edge Function, saves to Supabase)
- S08 Home Dashboard ✅ (Supabase wired — real plan data)
- S09 Active Workout ✅ (Supabase wired — real plan data + coaching-feedback Edge Function)
- S10 Workout Complete ✅ (auto-triggers weekly summary on last session of week)
- S11 Plan View ✅ (mock data — Supabase wiring pending)

### Phase 2 — Core Loop (🟡 In Progress)
- S15 Weekly Coach Summary ✅ (complete — Claude API + Supabase wired)

---

## CURRENT PHASE
Phase 2 — Core Loop
S15 Weekly Coach Summary complete and working.
Next task: Adaptive coaching engine (generate-next-week Edge Function) — generates
Week 2+ based on workout_logs. This is the blocker for users progressing past Week 1.

---

## NAVIGATION STACK (navigation/index.tsx)
Splash → Onboarding → GoalDetails → Experience →
Constraints → BodyMetrics → MacroSetup → PlanPreview →
BuildingPlan → Dashboard → ActiveWorkout → WorkoutComplete
                         → PlanView
                         → WeeklyCoachSummary

---

## SUPABASE EDGE FUNCTIONS

### generate-plan
- File: supabase/functions/generate-plan/index.ts
- Called from: BuildingPlanScreen.tsx via supabase.functions.invoke
- Purpose: Generates Week 1 training plan via Claude API
- JWT verification: DISABLED (anonymous auth used in dev)
- Secret: ANTHROPIC_API_KEY (set via supabase secrets set)
- Returns: { plan: { title, totalWeeks, daysPerWeek, currentWeek, weeks: [week1] } }

### coaching-feedback
- File: supabase/functions/coaching-feedback/index.ts
- Called from: ActiveWorkoutScreen.tsx via supabase.functions.invoke
- Purpose: Returns a real-time coaching note after each logged set
- JWT verification: DISABLED
- Secret: ANTHROPIC_API_KEY (same key)
- Returns: { feedback: string }

### weekly-coach-summary
- File: supabase/functions/weekly-coach-summary/index.ts
- Called from: WeeklyCoachSummaryScreen.tsx + WorkoutCompleteScreen.tsx
- Purpose: Generates weekly debrief by reading workout_logs vs plan targets
- JWT verification: DISABLED (turn off in Supabase dashboard → Edge Functions → weekly-coach-summary)
- Secret: ANTHROPIC_API_KEY (same key)
- Model: claude-sonnet-4-6
- Returns: { summary: WeeklySummaryData }
- Client saves result to weekly_summaries table after receiving it
- Do NOT save from inside the Edge Function

### generate-next-week
- File: supabase/functions/generate-next-week/index.ts
- Called from: WorkoutCompleteScreen.tsx (or client trigger after week completion)
- Purpose: Generates adapted training plan for Week N+1 based on workout_logs performance
- JWT verification: DISABLED (turn off in Supabase dashboard → Edge Functions → generate-next-week)
- Secrets: ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY (auto-available)
- Model: claude-sonnet-4-6
- Receives: { userId: string, planId: string, completedWeekNumber: number }
- Guard returns: { status: 'plan_complete' } or { status: 'already_advanced' }
- On success: saves new week to plan_json.weeks, updates current_week on plans row
- Returns: { status: 'success', nextWeekNumber, phase, completionTier }
- Adaptation logic: full/partial/low tiers → increase/hold/decrease weights
- Phase cycle: accumulation → intensification → deload (every 4th week)
- Deload: 80% weight, -1 set, recovery coaching notes

### Deploy commands
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here
supabase functions deploy generate-plan
supabase functions deploy coaching-feedback
supabase functions deploy weekly-coach-summary
supabase functions deploy generate-next-week

---

## PLAN JSON STRUCTURE (stored in plans.plan_json)
```typescript
{
  title: string;
  totalWeeks: number;
  daysPerWeek: number;
  currentWeek: number;
  weeks: [
    {
      weekNumber: number;
      phase: "accumulation" | "intensification" | "deload";
      days: [
        {
          dayNumber: number;
          type: "workout" | "rest";
          title: string;
          muscleGroups: string[];
          exercises: [
            {
              id: string;
              name: string;
              muscleGroup: string;
              sets: number;
              reps: string;        // e.g. "8-10"
              targetWeight: number;
              restSeconds: number;
              targetRpe: number;
            }
          ]
        }
      ]
    }
  ]
}
```
Note: Only Week 1 is generated at onboarding. Subsequent weeks are
generated by the adaptive coaching engine after each week is completed.

---

## WEEKLY SUMMARY JSON STRUCTURE (stored in weekly_summaries.summary_json)
```typescript
{
  weekNumber: number;
  performanceRating: "strong" | "on-track" | "tough-week";
  headline: string;
  highlights: string[];
  performanceSummary: string;
  nextWeekChanges: string;
  nutritionCheckin: string;
  motivationalNote: string;
}
```

## WEEKLY SUMMARIES TABLE
```sql
CREATE TABLE weekly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  summary_json JSONB NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, plan_id, week_number)
);
```
RLS enabled. Policies: select and insert for own user_id only.

---

## S15 WEEKLY COACH SUMMARY — HOW IT WORKS
- Entry points: Dashboard coach card ("Weekly Summary →") + S10 WorkoutComplete banner
- On mount: fetches last 4 rows from weekly_summaries for planId ordered by week_number DESC
- If current week summary exists in DB → displays immediately (no API call)
- If not → calls weekly-coach-summary Edge Function → saves to weekly_summaries → displays
- History section shows previous weeks as expandable collapsed cards (one open at a time)
- Error state shows red left-border card with Retry button
- Auto-trigger in S10: fires after last session of week (completedDays >= daysPerWeek),
  shows banner with "View Weekly Summary" CTA navigating to WeeklyCoachSummary

---

## PARAMS CHAIN
By S07b the following params are available for Claude API plan generation:
- goal, targetLift, current1RM, target1RM, recommendedWeeks (optional)
- secondaryLift (optional, strength only)
- priorityMuscles (optional, hypertrophy only)
- recompFocus (optional, recomp only)
- generalFocus (optional, general only)
- startingWeightLbs (optional, fat loss only)
- targetWeightLbs, targetDate (optional)
- targetBodyFatPct (optional)
- planDuration (all goals)
- experience, daysPerWeek, sessionLength, split
- equipment, weakPoints[], excludedExercises[], injuries[]
- sex, age, heightFt, heightIn, weightLbs, bodyFatPct
- calories, proteinG, carbsG, fatsG

---

## KNOWN ISSUES / NOTES
- Lib/ folder uses capital L on disk — all imports must match: 'Lib/supabase'
- Lib/supabase.ts uses EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY from .env
- .env is in .gitignore — never commit it
- RevenueCat entitlement key is 'pro'
- RevenueCat does not work on web — Platform.OS === 'web' bypass in PlanPreviewScreen.tsx
- Anonymous auth is enabled in Supabase (Authentication → User Signups → Allow anonymous sign-ins)
- ALL Edge Functions have JWT verification DISABLED in Supabase dashboard
- ANTHROPIC_API_KEY is stored as a Supabase secret — never put it in .env or client code
- Edge Function model string must be 'claude-sonnet-4-6' (not claude-sonnet-4-20250514)
- Deno 'cannot find name' warnings in VS Code are harmless — editor issue, not a runtime error
- S08 Dashboard: coach message card and quick stats (streak, volume) are still mock data — Phase 2
- S11 Plan View: still using mock data — needs Supabase wiring in Phase 2
- S10 WorkoutComplete: duration shows 0 min in web testing (correct on device)
- useNativeDriver warnings in web dev are expected — native only, not a bug
- Users cannot progress past Week 1 until the adaptive engine (generate-next-week) is built

---

## DATABASE SCHEMA NOTES
The following columns were added after initial schema creation (run if missing):
```sql
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS recomp_focus text,
  ADD COLUMN IF NOT EXISTS general_focus text,
  ADD COLUMN IF NOT EXISTS starting_weight_lbs float,
  ADD COLUMN IF NOT EXISTS secondary_lift text;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS injuries text[],
  ADD COLUMN IF NOT EXISTS height_ft integer,
  ADD COLUMN IF NOT EXISTS height_in integer,
  ADD COLUMN IF NOT EXISTS weight_lbs float;
```

---

## RULES FOR THIS PROJECT
- React Native + Expo only, no bare React Native
- TypeScript everywhere, no JavaScript files
- All database calls go through Lib/supabase.ts
- All Claude API calls go through Supabase Edge Functions — NEVER call Anthropic API directly from client
- Never hardcode API keys
- Keep components in /components folder
- Keep screens in /screens folder
- Register every new screen in navigation/index.tsx

---

## HOW WE WORK
- Claude writes Cursor prompts, developer pastes into Cursor
- Never write code directly — Claude output is always a Cursor prompt
- Reference ExperienceScreen.tsx for UI patterns and color variables
- Claude labels every prompt with Sonnet 4.6 or Opus 4.6
- Use Opus 4.6 for complex screens (Active Workout, Adaptive Engine)
- Use Sonnet 4.6 for simpler screens, fixes, and Edge Functions

---

## GIT RULES
- Commit and push after every completed screen
- Branch naming: feature/S[number]-[screen-name]
- Merge to main only when screen is confirmed working

---

## COLOR VARIABLES (from ExperienceScreen.tsx)
```typescript
const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const CARD_SELECTED_BG = 'rgba(59,130,246,0.12)';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const DISABLED_BG = '#334155';
```

---

## PHASE 2 PRIORITIES (in order)
1. ✅ S15 Weekly Coach Summary — COMPLETE
2. Adaptive coaching engine — generate-next-week Edge Function (Week 2+ generation)
   THIS IS THE NEXT TASK. Users are blocked from Week 2 until this is built.
3. S13 Progress Charts — strength progression, volume, bodyweight trend
4. S16 Macro Tracker — daily macro logging and adherence tracking
5. S12 Exercise Library — searchable database with muscle group tags
6. S14 Goal Tracker — progress bars, milestone notifications
7. S17 Profile & Settings — edit profile, units, preferences
8. S18 Subscription Management — RevenueCat customer portal

---

## DO NOT CHANGE
- The filename — it must remain CLAUDE_CONTEXT.md
- Any other files in the project
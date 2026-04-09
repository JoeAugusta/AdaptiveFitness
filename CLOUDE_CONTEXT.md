# ADAPTIVE FITNESS COACH — CLAUDE CONTEXT
<!-- DO NOT CHANGE THE FILENAME -->
<!-- Last updated: April 2026 — Post-Review Sprint v1.14 COMPLETE -->

---

## PROJECT OVERVIEW

**App:** Adaptive Fitness Coach — iOS/Android subscription SaaS  
**Stack:** React Native + Expo, Supabase, RevenueCat, Claude API, Zustand  
**Supabase tables:** users, user_profiles, goals, plans, workout_logs, macro_plans, weekly_summaries, macro_logs, weight_logs, meal_suggestions  
**Config files:** Lib/supabase.ts, Lib/RevenueCat.ts  
**Edge Functions:** generate-plan, coaching-feedback, weekly-coach-summary, generate-next-week, adjust-macros, generate-meals  
**Key files:** constants/design.ts, constants/exerciseLibrary.ts, constants/ingredientLibrary.ts, components/MealBuilderModal.tsx, components/ExerciseCard.tsx, components/WorkoutResultsModal.tsx, navigation/types.ts, utils/splitRecommendation.ts, utils/projections.ts, components/ProjectionChart.tsx, utils/deleteAccount.ts

---

## BUILD STATUS

### Phase 1 — Foundation ✅ Complete
### Phase 2 — Core Loop ✅ Complete
### Phase 3 — Engagement ✅ Complete
### Design Upgrade ✅ Complete — April 2026
### Coaching Engine Sprint ✅ Complete — April 2026
### Onboarding Upgrade Sprint ✅ Complete — April 2026
### Goal-First Programming Sprint ✅ Complete — April 2026
### Workout Experience Sprint ✅ Complete — April 2026
### Bug Fix Sprint ✅ Complete — April 2026
### Projection Charts + Polish Sprint ✅ Complete — April 8 2026
### Post-Review Sprint (v1.14) ✅ Complete — April 9 2026

### Current Phase
**P2 Polish Sprint** — Ready to begin  
All P0 and P1 items resolved. See OUTSTANDING ISSUES below for P2 backlog.

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

### Goal colors (charts and badges)
```
fat_loss → #F97316 | hypertrophy → #22C55E | strength → #F59E0B | recomp → #F97316 | general → #F97316
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
// WeeklyCoachSummary (via reset)
navigation.reset({ index: 0, routes: [{ name: 'MainTabs',
  state: { routes: [{ name: 'HomeTab',
    state: { routes: [{ name: 'WeeklyCoachSummary', params: { planId, weekNumber } }] } }] } }] })

// PlanView from WorkoutComplete
navigation.navigate('MainTabs', { screen: 'WorkoutTab', params: { screen: 'PlanView' } })
// NOT: navigation.navigate('PlanView') ← broken

// WeeklyCoachSummary back
navigation.navigate('MainTabs') // NOT goBack()

// WeeklyCoachSummary Start Workout CTA
navigation.navigate('Dashboard', {
  screen: 'WorkoutTab',
  params: { screen: 'WorkoutHome' }
}) // Real route names — Dashboard not MainTabs, WorkoutHome not WorkoutHomeScreen
```

---

## ONBOARDING — KEY BEHAVIOURS

**Step counter:** S02=1, S02b=2, S03=3, S03b=4, S04=5, S05=6, S06=7, S07=8. BuildingPlan has no step.

### S02b GoalDetailsScreen

**CTA:** Always "Continue" — never "Skip". Navigation identical regardless of optional field selection.

**Strength:**
- Feasibility card uses getStrengthProjectionRange() — shows "+low–high lbs" range, never flat number
- Experience unknown at S02b → range covers advanced (0.75/wk) to beginner (2.0/wk)
- canReachGoal = high >= gap (not 75% threshold)
- Plan duration chip pre-selects from weeksToTarget midpoint

**Hypertrophy:**
- Priority muscle chips (optional, max 3)
- Current split + duration chips → 6+ months same split → structural novelty flag

**All goals:** recommendedWeeks forwarded through ALL navigation hops

### S03 ExperienceScreen
- Day-of-week picker: 7 pills Mon–Sun, min 2, sorted Mon→Sun
- Jordan structure card: split badge + ⓘ modal, session list, rationale
- "Looks good →" → structureConfirmed = true | "Adjust" → context chips
- structureConfirmed resets on selectedDays/experience change
- All reason strings use ${days} variable — no hardcoded day counts

### S06 MacroSetupScreen
**Pace selector (fat_loss + hypertrophy only):**
```
fat_loss:    Conservative (−250) / Balanced (−400, default) / Aggressive (−600)
hypertrophy: Lean Bulk (+200, default) / Moderate (+300) / Aggressive (+500)
```
- calorie_pace stored in macro_plans, passed to generate-plan
- Replaces hardcoded TDEE adjustment for these two goals only

**Calorie adjustment:**
```
strength → TDEE + 200 | recomp → TDEE | general → TDEE
fat_loss / hypertrophy → TDEE + paceAdjustment
```
Rounded to nearest 50. Min 1200, max 5000.

### S07 PlanPreviewScreen — Layout
1. Projection chart (FIRST — conversion moment)
2. Pace read-only badge (fat_loss + hypertrophy only — not interactive)
3. Jordan context card (hypertrophy + advanced only — when projectedGain < 2.0 lbs)
4. Goal summary card
5. Sample week (from sessionStructure, never Claude output) — 2 days visible, remainder locked
6. Daily nutrition
7. Paywall footer

**Small-gain contextualisation:**
When goal === 'hypertrophy' AND experience === 'advanced' AND projectedGain < 2.0 lbs, render Jordan card:
```
"Advanced lifters gain lean mass slowly — that's the biology, not the plan.
+X lbs of lean mass is visible, meaningful change at your level."
```

**Sample week lock text:** `+ ${remainingDays} more ${remainingDays === 1 ? 'day' : 'days'} visible after unlocking`
- `visibleDays = 2` (constant)
- `remainingDays = Math.max(0, sampleDays.length - visibleDays)` — sampleDays = workout-only days
- Lock row hidden if remainingDays === 0

### BuildingPlanScreen
- Animated step sequence: Goal analysed → Structure built → Nutrition calculated → Weights calibrated → Coaching notes written → Ready
- Navigation fires only when BOTH animation complete AND API response received
- Error state: retry button, "Jordan is in high demand right now — tap to try again."
- Retry logic with exponential backoff on 529 overloaded errors

---

## PROJECTION CHARTS

### utils/projections.ts
```ts
getFatLossProjection(startWeight, pace, weeks): number[]
// conservative=−0.5/wk | balanced=−0.75/wk | aggressive=−1.1/wk

getHypertrophyProjection(experience, pace, weeks): number[]
// Monthly gains: conservative{beg:1.0,int:0.5,adv:0.25} balanced{1.5,0.75,0.4} aggressive{2.5,1.25,0.6}

getStrengthProjection(current1RM, experience, weeks): number[]
// Decelerating curve: beg=3/wk, int=1.5/wk, adv=0.75/wk

getStrengthProjectionRange(current1RM, target1RM, weeks): { low, high, weeksToTarget }
// Range: adv(0.75/wk) to beg/int(2.0/wk) — for GoalDetails feasibility
```

### components/ProjectionChart.tsx
Visual elements:
- Gradient fill: goal color → transparent under line (LinearGradient, react-native-svg)
- Confidence band: ±20%, goal color opacity 0.07 (hypertrophy + recomp only)
- Primary line: goal color, strokeWidth 2.5
- End-point bubble: pill at final point showing end value
- Start marker + label at week 0 (strength only)
- Target line: dashed orange "Goal: X lbs" (strength only)
- Current week: dashed orange vertical + "Wk N" label (Goal Tracker only)
- Completed region: rgba(249,115,22,0.05) fill left of current week (Goal Tracker only)
- Animation: line draws left→right, 800ms ease, re-triggers on pace change

**Y-axis unit labels:** Shown in callout strip sub-label under END RESULT value:
```
fat_loss → "lbs bodyweight" | hypertrophy → "lbs lean mass (est.)"
strength → "lbs (est. 1RM)"  | recomp → "lbs bodyweight"
FontSizes.caption, Colors.textTertiary
```

### PlanPreview by goal
- Fat loss: 3 pace lines (active=solid, others=dashed+muted). Callout: end weight / rate / weeks
- Hypertrophy: active line + band. Callout: lean mass total / monthly rate / weeks
- Strength: projection + target line. Callout: "X lbs / Y goal" / range / weeks
- Recomp: dual-axis (weight left, BF% right)

### Goal Tracker actuals overlay
- `actualsData` prop: weight_logs (fat loss/recomp/hypertrophy), Epley 1RM from sets (strength)
- Ahead/behind badge: actuals[currentWeek] vs projection[currentWeek]
- Empty state: projection + "Complete Week 1 to track your results here."
- Never blank — projection always renders

---

## DASHBOARD — KEY BEHAVIOURS

- useFocusEffect (not useEffect)
- **Sessions count: `.eq('plan_id', activePlanId)` on workout_logs — active plan only**
- All workout_logs aggregations use activePlanId filter
- planId always from fresh Supabase query

### Day 1 Cold-Start State
When `sessionCount === 0 AND currentWeek === 1`:
- Hide stats row entirely (no zeros)
- Show motivational placeholder: "Your stats will build here as you train. Start your first session to begin."
- Stats row returns after first session logged
- Volume label always "Vol. this week" in lbs — never "— sets"

### Three-State Jordan Card
```ts
type JordanCardState = 'day1' | 'in_week' | 'summary_available';

const jordanCardState =
  sessionCount === 0 && currentWeek === 1 ? 'day1' :
  weeklyCoachSummary?.headline ? 'summary_available' :
  'in_week';

const displayedJordanText = {
  day1: "Day 1 starts now. Choose weights that feel like RPE 7–8 — challenging but controlled. Log every set honestly and I'll take it from here.",
  in_week: "First session logged. Keep the same approach next session — your numbers are already telling me what Week 2 needs to look like.",
  summary_available: weeklyCoachSummary?.headline ?? jordanWelcome,
}[jordanCardState];
```

Weekly Summary link only shown in summary_available state.

### Pre-Session Signal Detection
Client-side only. No Edge Function.
```ts
// workout_logs column: session_fatigue_rating (NOT energy_rating)
const weeklyLogs = workoutLogs.filter(log => log.week_number === currentWeek);
const lastSession = weeklyLogs[0];
const avgRpe = calculateAvgRpe(lastSession?.sets_json ?? []);
const energyRating = lastSession?.session_fatigue_rating ?? 3;

// Signal logic (pure functions outside component):
const getSessionSignal = (avgRpe, energy) => {
  if (avgRpe === 0) return null;
  if (avgRpe > 8.5 && energy <= 2) return 'high_fatigue';
  if (avgRpe < 6.0 && energy >= 4) return 'low_fatigue';
  if (avgRpe >= 7.0 && avgRpe <= 8.5) return 'on_target';
  return null;
};
```

Signal passed as `preSessionMessage` param to ActiveWorkout navigation.
Modal fires in ActiveWorkoutScreen on mount if preSessionMessage exists.

### Session Focus Card (Dashboard Workout Card)
SessionFocus displayed as orange accentMuted card above stats row:
```ts
sessionFocusCard: { backgroundColor: Colors.accentMuted, borderColor: Colors.accentBorder }
sessionFocusText: { color: Colors.accent }
```

### Generate Next Week CTA
```ts
showCTA = isWeekComplete && !nextWeekExists && !weekHasAdvanced && currentWeek < totalWeeks
```

### Weekly Review Empty State
Always has CTA at bottom — never a dead-end:
```
[Start Today's Workout →]   ← primary orange button
navigation: navigate('Dashboard', { screen: 'WorkoutTab', params: { screen: 'WorkoutHome' } })
```

---

## SESSION INTENT LINE

### getSessionIntent() helper (pure function, shared between screens)
```ts
const getSessionIntent = (phase, sessionFocus, split) => {
  if (sessionFocus?.trim().length > 0) return sessionFocus;
  const phaseMap = {
    baseline:        'Calibration week — choose your starting weights',
    accumulation:    'Volume focus — hit your rep targets across all sets',
    intensification: 'Intensity focus — push the top end, not total volume',
    deload:          'Recovery week — 60% effort, prioritise movement quality',
    power:           'Power focus — heavy loads, full rest between sets',
  };
  if (phaseMap[phase?.toLowerCase()]) return phaseMap[phase.toLowerCase()];
  const splitDisplay = split?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? 'Training';
  return `${splitDisplay} — follow Jordan's targets`;
};
```

- **Dashboard workout card:** Orange accentMuted card
- **PlanView day cards:** Italic gray text (FontSizes.caption, Fonts.italic, Colors.textSecondary)
- Rest day cards: no intent line
- Never blank — fallback chain always produces a value

---

## CONSISTENCY GRID

Plan-relative grid (not rolling 10-week window):
- Columns = totalWeeks from plan_json
- Rows = 7 (Mon–Sun)
- Column 1 = Plan Week 1 (anchored to plan created_at Monday)
- Current week column: accent border
- Past/future untrained cells: Colors.bgElevated + borderColor: Colors.divider
- Trained cells: Colors.accent

**planMonday derivation:**
```ts
const planCreatedAt = new Date(activePlan.created_at);
const dow = planCreatedAt.getDay();
const daysBack = (dow + 6) % 7;
const planMonday = new Date(planCreatedAt);
planMonday.setDate(planCreatedAt.getDate() - daysBack);
planMonday.setHours(0, 0, 0, 0);
```

**Cell mapping:**
```ts
const daysSince = Math.floor((logDate - planMonday) / 86400000);
const weekIndex = Math.floor(daysSince / 7);
const dayIndex = (logDate.getDay() + 6) % 7; // 0=Mon, 6=Sun
const cellIndex = weekIndex * 7 + dayIndex;
```

**Consistency rate:** `sessionsLogged / (weeksWithSessions * daysPerWeek)`
- Uses `weeksWithSessions` (weeks with ≥1 log) not `currentWeek` as denominator
- Avoids inflating denominator for in-progress weeks with 0 sessions

**Jordan note logic:**
```ts
if (completedWeeks === 0) → hide card
if (completedWeeks === 1 && weekCompletionRate >= 1.0) → "Week 1 done — 100% completion rate. The grid fills up fast from here."
if (completedWeeks < 3) → "${totalSessions} sessions logged — keep building."
else → "${consistencyRate}% session completion — ${context}. Hitting your ${daysPerWeek} sessions every week is the single biggest lever for results."
```

**Stat label:** "X sessions logged — Week N of M"

---

## JORDAN PERSONA — VOICE RULES

- 4-sentence jordanWelcome always
- Never: Great / Excited / Crush it / Amazing / AI coach / AI
- Volume suggestions: Jordan-actionable only
- Post-Week-1 summary closes calibration loop with specific RPE references
- **Never say "AI coach" — Jordan is a coach. Use "your coach" or "I" exclusively.**
- **Weekly summary: max 4 sentences per paragraph, two-paragraph structure**
- **Nutrition Jordan card: forward-looking tense until at least one meal is logged today**
- **Day 1 dashboard Jordan card is unique — never the same text as Plan Ready screen**
- **Pre-session modal copy is signal-based — only fires when RPE + energy data exists**

---

## WORKOUT EXPERIENCE — KEY BEHAVIOURS

### Pre-Session Modal (ActiveWorkoutScreen)
```ts
// route.params.preSessionMessage: string | null
const [showPreSessionModal, setShowPreSessionModal] = useState(!!preSessionMessage);
```
Bottom sheet modal on mount. "Let's go →" dismisses. Backdrop tap also dismisses.
Only renders when preSessionMessage is non-null.

### Session Intent Line
See SESSION INTENT LINE section above.

### Week 1 PR Labelling
```ts
const prLabel = currentWeek === 1 ? 'Baselines Set' : 'PRs Hit';
```

### RPE Badge Color Logic
```ts
const getRPEBadgeColor = (rpe: number, targetRpe: number) => {
  const delta = rpe - targetRpe;
  if (delta < -1.5) return Colors.danger;
  if (delta < -0.5) return Colors.warning;
  if (delta <= 0.5) return Colors.success;
  if (delta <= 1.5) return Colors.warning;
  return Colors.danger;
};
```

### ExerciseCard — Existing Behaviours
Warmup: primary/secondary compounds ≥95 lbs. W1:40%×10, W2:60%×5, W3:80%×3. Min 45 lbs.
```
usesWeight=false → "Bodyweight" static
usesWeight=true + targetWeight=0 + wk1 + !strength → "Weight" editable (placeholder: "Weight")
usesWeight=true + targetWeight>0 → pre-filled input
```

---

## WORKOUT RESULTS MODAL

AVG RPE: <6=success, 6-8=warning, >8=danger | VOLUME: sum(weightLbs×reps), ≥1000→"X.Xk lbs"  
ENERGY: 1=😴Wiped 2=😤Tired 3=😊Good 4=💪Strong 5=🔥Beast Mode  
PR label: Week 1 → "Baselines Set" | Week 2+ → "PRs Hit"

---

## WORKOUT COMPLETE SCREEN — WEEK TRANSITION

When final session of week logged (`distinctLoggedDays >= daysPerWeek`):
1. Auto-fires both `weekly-coach-summary` and `generate-next-week` via `Promise.allSettled`
2. Blocks "Go to Dashboard" button while generating — shows loader
3. Shows: "Jordan is building your Week N — it'll be ready in a moment."
4. On success: `nextWeekReady = true` → Done button appears
5. On error: retry UI — "Tap to check if it's ready." + Try Again button
6. Idempotency: checks if next week already exists before calling

---

## NOTIFICATIONS SCREEN

### Hero section (top of screen, above WORKOUT REMINDERS):
"JORDAN WILL NOTIFY YOU" label + 3 value prop rows:
- 🔔 30 minutes before each scheduled session
- 📋 When your weekly coaching review is ready
- 🏆 When you hit a milestone

Permission state:
- Not granted → orange "Enable Notifications" button → calls `Notifications.requestPermissionsAsync()`
- Granted → green dot + "Notifications enabled"
- Web: Platform guard, no permission call

---

## NUTRITION — JORDAN CARD TENSE

```ts
const hasLoggedToday = (todaysMeals ?? []).length > 0;
// Forward-looking until first meal logged:
// "Here's your plan for today — hit these targets and you'll be right on track."
// After first meal: progress-acknowledging copy
```

---

## PROFILE SETTINGS

**Training Preferences reads from active plan_json first:**
```ts
experience = activePlan?.plan_json?.experience ?? userProfile?.training_age;
daysPerWeek = activePlan?.plan_json?.daysPerWeek ?? userProfile?.days_per_week;
// etc.
```

**Body metric editing:** Height and age editable via inline tap → modal → saves to user_profiles. Does not regenerate macro plan.

**Rate App trigger:** Only show when `completedWeeks >= 1`.

**Account deletion:** Profile → Support → "Delete Account"
- Full-screen confirm modal
- Cascade delete: workout_logs, weekly_summaries, meal_suggestions, macro_logs, macro_plans, weight_logs, plans, goals, user_profiles
- On confirm: sign out → navigate to Splash
- utils/deleteAccount.ts handles the cascade

---

## SUPABASE EDGE FUNCTIONS

All: JWT **DISABLED**, Model: `claude-sonnet-4-6`. Disable JWT after every deploy.

### generate-plan
- Retry logic with exponential backoff on 529 overloaded errors
- Returns `{ error: 'overloaded' }` with 503 status on failure
- **NEVER say "AI" in jordanWelcome or any generated copy**
- workoutDayCount = sessionStructure.filter(d => d.type === 'workout').length
- totalWeeks: `body.recommendedWeeks ?? body.totalWeeks ?? body.planDuration ?? body.weeks ?? 12`

### generate-next-week
- priorTargetWeight===0 → avgLoggedWeight as Week 2 baseline
- Auto-triggers on week completion — zero required user action
- **⚠️ KNOWN ISSUE: Reads deload week weights as progression baseline (P1.5 fix needed)**
- Same retry logic as generate-plan

### generate-meals
jordanNote rules:
- Max 3 sentences. Hard limit.
- Never "AI", never "crush it", never banned phrases
- Lead with coaching reason BEFORE citing gram deviations
- On-target plans: explain food philosophy, not dry number summary
- Trigger: delete meal_suggestions row to force regeneration

### weekly-coach-summary
- **⚠️ KNOWN ISSUE: Deload RPE not interpreted correctly (P1.5 fix needed)**
- When isDeloadWeek: avgRpe > 7 should flag as "deload ran hot", not "deload done right"

---

## DATABASE SCHEMA NOTES

```
workout_logs: logged_at (NOT created_at) | sets_json.weightLbs (NOT weight)
workout_logs: session_fatigue_rating (NOT energy_rating) ← CRITICAL column name
plans: status = active/completed/paused ONLY
macro_plans: calorie_pace text DEFAULT 'balanced'
planId: always fresh query, never route.params
```

### SQL Migrations (all applied)
```sql
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS training_days text[] DEFAULT '{}';
ALTER TABLE macro_plans ADD COLUMN IF NOT EXISTS calorie_pace text DEFAULT 'balanced';
UPDATE plans SET status='paused' WHERE status='active' AND id NOT IN (
  SELECT DISTINCT ON (user_id) id FROM plans WHERE status='active'
  ORDER BY user_id, created_at DESC);
```

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

## KNOWN ISSUES / NOTES

- Lib/ uses capital L — imports must be 'Lib/supabase'
- RevenueCat entitlement: 'pro' | web bypass: Platform.OS === 'web'
- ALL Edge Functions JWT: DISABLED | Model: 'claude-sonnet-4-6'
- user_profiles: always `.order('id',{ascending:false}).limit(1).maybeSingle()`
- Weight log dates: new Date(log_date + 'T00:00:00')
- Lift names: snake_case in DB → formatLiftName() for display
- jordanWelcome/sessionFocus/phase: post-April 2026 plans only, older plans fallback gracefully
- DEV button in ProfileSettings when __DEV__ === true
- Weight placeholder: "Weight" not "Choose weight"
- **workout_logs energy column: `session_fatigue_rating` NOT `energy_rating`**
- **React hooks must all be declared at top of component — never conditionally**
- **Pre-session signal functions must be pure functions outside component to avoid hooks violations**

---

## RULES FOR THIS PROJECT

- React Native + Expo only, TypeScript everywhere
- All DB calls through Lib/supabase.ts | All Claude calls through Edge Functions only
- No hardcoded API keys or hex strings
- Screens in /screens | Components in /components
- Register every new screen in navigation/index.tsx AND navigation/types.ts
- planId always from fresh Supabase query, never from route.params
- **Never use "AI" in any Jordan copy or user-facing text**
- **Never show a dead-end screen — every screen must have a forward action**
- **All hooks unconditionally at top of component — Rules of Hooks**

---

## HOW WE WORK

- Claude writes Cursor/Composer prompts, developer pastes
- Opus 4.6 for complex screens and prompt engineering
- Sonnet 4.6 for fixes, Edge Functions, simple screens
- Composer 2 for all multi-file tasks and screen redesigns
- Commit after every completed feature

---

## PHASE 4 PRIORITIES

- Within-week load adjustment (adjust-next-session Edge Function) — PRD Section 15.4
- Apple Health / Google Fit / MyFitnessPal integrations
- Plan graduation + cross-plan memory
- Transparent adaptation reasoning (tap weight → see why)
- Pyramid/wave loading for advanced users
- Beginner exercise education (cue cards + difficulty gating + video)
- Missed session handling + mid-week Jordan check-in
- Readiness score (pre-session check-in)
- Cardio/conditioning layer for fat loss plans

---

## DEFERRED FEATURES

- Bodyweight goal in onboarding | Metric unit toggle (v1.2)
- Social features, cardio plans, web app | Nutrition trend chart
- Multiple Jordan tone settings
- Current lifts input in BodyMetrics
- Notification schedule customization

---

## OUTSTANDING ISSUES

### ✅ P0 — All Resolved (April 9 2026)
1. Account deletion ✅
2. Notifications permission flow ✅
3. Grammar bug — Consistency Grid ✅
4. Sample week lock text ✅

### ✅ P1 — All Resolved (April 9 2026)
5. Plan Preview Jordan context card ✅
6. Plan Preview y-axis labels ✅
7. Dashboard Day 1 Jordan card ✅
8. Dashboard cold-start stats ✅
9. Weekly Review empty state CTA ✅
10. Nutrition Jordan card tense ✅
11. Notifications screen rewrite ✅
12. Consistency Grid new-user Jordan note + plan-relative redesign ✅
13. Pre-session coaching card → pre-workout modal ✅
14. Session intent line ✅
15. Week 1→2 transition automation ✅

### 🔴 P1.5 — Coaching Correctness (fix before real users hit deload week)

**DC-1: Post-deload weight regression**
After deload week (weights ×0.8), `generate-next-week` reads deload weights as progression baseline. Week N+1 starts from deload weight instead of pre-deload weight + progression.

Fix: In `generate-next-week` prompt — when `priorWeek.phase === 'deload'`, use Week N-2 weights as progression baseline, not Week N-1 (deload) weights. Deload week RPE/energy still informs fatigue state but weight targets step forward from the pre-deload week.

**DC-2: Deload RPE interpretation in weekly summary**
RPE 9 on a deload week triggers "deload done right" copy. Incorrect — deload at RPE 9 means the user went too hard.

Fix: In `weekly-coach-summary` Edge Function prompt — add deload-specific rating logic:
```ts
// When isDeloadWeek === true:
// avgRpe <= 7 → "Deload executed well"
// avgRpe > 7  → "Deload ran too hot — effort was higher than intended for a recovery week"
// This overrides the normal completion-based performanceRating
```

### 🟡 P2 — 30-Day Polish (first update post-launch)

**Workout:**
- P2-W1: Weight placeholder "Weight" not "Choose weight" ← may already be fixed
- P2-W2: First-session hint on ⓘ button: "Tap ⓘ for form tips"
- P2-W3: RPE badge color logic (getRPEBadgeColor) in ActiveWorkout + WorkoutResults
- P2-W4: Swap Exercise — difficulty tags (Similar/Easier/Harder) + "Keep [Exercise Name]" cancel
- P2-W5: Jordan feedback card must not be occluded by rest timer overlay
- P2-W6: Week 1 "Baselines Set" relabelling in WorkoutResultsModal + WorkoutCompleteScreen

**Weekly Summary:**
- P2-WS1: Max 4 sentences per paragraph, two-paragraph structure
- P2-WS2: Subtle section dividers between WINS / WHAT'S CHANGING / NUTRITION
- P2-WS3: Push notification when weekly summary generates

**Progress Tab:**
- P2-P1: Default strength lift by goal (hypertrophy→bench, strength→goalLift/squat, etc.)
- P2-P2: Fix Hamstrings bar color in Weekly Volume chart (Colors.accent only)
- P2-P3: Goal-aware Jordan bodyweight note (hypertrophy losing weight → under-eating warning)
- P2-P4: Milestone threshold at 10% not 25% for "Getting Started"
- P2-P5: Expectations vs Reality — show Week 1 volume data when available

**Onboarding:**
- P2-O1: GoalDetails feasibility card above plan duration chips
- P2-O2: Goal Selection disabled Continue — increase contrast
- P2-O3: Exercise avoid list — add muscle group context

**Profile:**
- P2-PR1: Body metric editing (height + age) ← may already be done
- P2-PR2: Rate App trigger gate (completedWeeks >= 1) ← may already be done
- P2-PR3: Label or remove unlabelled "›" chevron in profile header

**Copy & Voice:**
- P2-C1: Remove "AI" from all Jordan intro copy (existing plans in DB need manual update or re-onboard)
- P2-C2: Plan Preview: replace "Join thousands" social proof
- P2-C3: Macro Setup pace labels — warmer copy
- P2-C4: Weekly Review empty state Jordan note
- P2-C5: Macro Setup: surface macro adjustment note above the fold

**Dashboard:**
- P2-D1: Vol. this week showing "—" at start of Week 2+ (cold-start only triggers on Week 1)

**Scaling / Infrastructure:**
- P2-S1: Server-side RevenueCat entitlement check in generate-plan before calling Anthropic
- P2-S2: Job queue for generate-plan (Supabase pg_cron + generation_jobs table) at 5k+ users
- P2-S3: Anthropic rate limit increase request before launch
- P2-S4: Cost alert in Anthropic console ($50/day)
- P2-S5: coaching-feedback is highest cost driver — monitor at scale (576 calls/user/plan)

### ⚪ P3 — Phase 4 Roadmap
See Phase 4 Priorities above.

---

### 🟢 Fixed — Session 4 (April 9 2026)
Account deletion ✅ | Notifications permission + time pickers ✅ | Consistency Grid grammar ✅ | Sample week lock text ✅ | Plan Preview Jordan context card ✅ | Plan Preview y-axis unit labels in callout ✅ | Dashboard Day 1 Jordan card ✅ | Dashboard cold-start stats ✅ | Weekly Review CTA ✅ | Nutrition Jordan card tense ✅ | Notifications screen value props rewrite ✅ | Consistency Grid new-user note + plan-relative redesign ✅ | Pre-session coaching → pre-workout modal ✅ | Session intent line (dashboard orange card + PlanView italic) ✅ | Week 1→2 transition bulletproof automation ✅ | BuildingPlanScreen loading sequence ✅ | generate-plan retry logic ✅ | Jordan three-state card (day1/in_week/summary) ✅ | session_fatigue_rating column name fix ✅

---

## DO NOT CHANGE

The filename — it must remain `CLAUDE_CONTEXT.md`
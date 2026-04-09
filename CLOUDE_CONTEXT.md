# ADAPTIVE FITNESS COACH — CLAUDE CONTEXT
<!-- DO NOT CHANGE THE FILENAME -->
<!-- Last updated: April 2026 — Post-Review Sprint v1.14 -->

---

## PROJECT OVERVIEW

**App:** Adaptive Fitness Coach — iOS/Android subscription SaaS  
**Stack:** React Native + Expo, Supabase, RevenueCat, Claude API, Zustand  
**Supabase tables:** users, user_profiles, goals, plans, workout_logs, macro_plans, weekly_summaries, macro_logs, weight_logs, meal_suggestions  
**Config files:** Lib/supabase.ts, Lib/RevenueCat.ts  
**Edge Functions:** generate-plan, coaching-feedback, weekly-coach-summary, generate-next-week, adjust-macros, generate-meals  
**Key files:** constants/design.ts, constants/exerciseLibrary.ts, constants/ingredientLibrary.ts, components/MealBuilderModal.tsx, components/ExerciseCard.tsx, components/WorkoutResultsModal.tsx, navigation/types.ts, utils/splitRecommendation.ts, utils/projections.ts, components/ProjectionChart.tsx

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

### Current Phase
**Post-Review Sprint (v1.14)** — April 9 2026  
Full app walkthrough completed. P0/P1/P2/P3 sprint defined. See OUTSTANDING ISSUES below.

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
3. Jordan context card (hypertrophy + advanced only — when projectedGain < 2.0 lbs) ← NEW v1.14
4. Goal summary card
5. Sample week (from sessionStructure, never Claude output)
6. Daily nutrition
7. Paywall footer

**Small-gain contextualisation (NEW v1.14):**
When goal === 'hypertrophy' AND experience === 'advanced' AND projectedGain < 2.0 lbs, render Jordan card:
```
"Advanced lifters gain lean mass slowly — that's the biology, not the plan.
+X lbs of lean mass is visible, meaningful change at your level."
```

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
// Uses real experience value (available from S03 onwards)

getStrengthProjectionRange(current1RM, target1RM, weeks): { low, high, weeksToTarget }
// Range: adv(0.75/wk) to beg/int(2.0/wk) — for GoalDetails feasibility (experience unknown)
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

**Y-axis unit labels (NEW v1.14):** All charts must display unit label rotated 90° left of y-axis:
```
fat_loss → "lbs bodyweight" | hypertrophy → "lbs lean mass (est.)"
strength → "lbs (est. 1RM)"  | recomp → "lbs bodyweight"
FontSizes.micro, Colors.textTertiary
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

### Day 1 Cold-Start State (NEW v1.14)
When `sessionCount === 0 AND currentWeek === 1`:
- Hide stats row entirely (no zeros)
- Show motivational placeholder: "Your stats will build here as you train. Start your first session to begin."
- Stats row returns after first session logged
- Volume label always "Vol. this week" in lbs — never "— sets"

### Day 1 Jordan Card (NEW v1.14)
**Must be unique — never the same text as Plan Ready screen.**
```
"Day 1 starts now. Choose weights that feel like RPE 7–8 — challenging
but controlled. Log every set honestly and I'll take it from here."
```

### Pre-Session Coaching Card (NEW v1.14)
When at least one session logged this week AND another session is upcoming:
```ts
const avgRpe = calculateAvgRpe(lastSession.sets_json);
const energy = lastSession.energy_rating; // 1–5

// high_fatigue: avgRpe > 8.5 AND energy <= 2
// low_fatigue:  avgRpe < 6.0 AND energy >= 4
// on_target:    avgRpe 7.0–8.5

// Jordan card copy:
// high_fatigue: "Your last session ran hot — execute clean today. Focus on form without chasing extra load."
// low_fatigue:  "You had plenty left in the tank — today we use it. Push the top of your rep ranges."
// on_target:    "Last session dialled in well. Same approach today — trust the targets."
```
Jordan card renders between stats row and Start Workout button. Client-side only — no Edge Function needed.

### Generate Next Week CTA
```ts
showCTA = isWeekComplete && !nextWeekExists && !weekHasAdvanced && currentWeek < totalWeeks
```

### Weekly Review Empty State (NEW v1.14)
In-progress weekly review screen must always have a CTA at bottom:
```
[Start Today's Workout →]   ← primary orange button
```
Never a dead-end screen.

---

## JORDAN PERSONA — VOICE RULES

- 4-sentence jordanWelcome always
- Never: Great / Excited / Crush it / Amazing
- Volume suggestions: Jordan-actionable only
- Post-Week-1 summary closes calibration loop with specific RPE references
- **Never say "AI coach" — Jordan is a coach. Use "your coach" or "I" exclusively. (NEW v1.14)**
- **Weekly summary: max 4 sentences per paragraph, two-paragraph structure (NEW v1.14)**
- **Nutrition Jordan card: forward-looking tense until at least one meal is logged today (NEW v1.14)**

---

## WORKOUT EXPERIENCE — KEY BEHAVIOURS

### Session Intent Line (NEW v1.14)
All day cards in PlanView and dashboard workout card display session intent beneath title chips:
```
Baseline:        "Calibration week — choose your starting weights"
Accumulation:    "Volume focus — hit your rep targets across all sets"
Intensification: "Intensity focus — push the top end, not total volume"
Deload:          "Recovery week — 60% effort, prioritise movement quality"
Power sessions:  "Power focus — heavy loads, full rest between sets"
Fallback:        "${split} training — follow Jordan's targets"
```
FontSizes.caption, Fonts.italic, Colors.textSecondary. Never blank.

### Week 1 PR Labelling (NEW v1.14)
```ts
const prLabel = currentWeek === 1 ? 'Baselines Set' : 'PRs Hit';
```

### RPE Badge Color Logic (NEW v1.14)
```ts
const getRPEBadgeColor = (rpe: number, targetRpe: number) => {
  const delta = rpe - targetRpe;
  if (delta < -1.5) return Colors.danger;   // well below — too easy
  if (delta < -0.5) return Colors.warning;  // slightly below
  if (delta <= 0.5) return Colors.success;  // on target
  if (delta <= 1.5) return Colors.warning;  // slightly above
  return Colors.danger;                     // too high
};
```

### Swap Exercise Modal (NEW v1.14)
- Difficulty tag per alternative: "Similar" | "Easier" | "Harder" (stored in exerciseLibrary.ts as `swapDifficulty`)
- "Keep [Exercise Name]" text button below alternatives list — explicit cancel always present

### ExerciseCard — Existing Behaviours
Warmup: primary/secondary compounds ≥95 lbs. W1:40%×10, W2:60%×5, W3:80%×3. Min 45 lbs.
```
usesWeight=false                              → "Bodyweight" static
usesWeight=true + targetWeight=0 + wk1 + !strength → "Weight" editable (placeholder: "Weight" not "Choose weight")
usesWeight=true + targetWeight>0              → pre-filled input
```
Last week strip: sequential fetch after planId resolves. Match exerciseId → fallback name.  
Timed: /second|sec|s$|\d+s\b/i → "Done" button, logs duration as reps.  
Trend: 2s ephemeral — ↑weight/reps=success, =same=muted, ↓=warning.

---

## WORKOUT RESULTS MODAL

AVG RPE: <6=success, 6-8=warning, >8=danger | VOLUME: sum(weightLbs×reps), ≥1000→"X.Xk lbs"  
ENERGY: 1=😴Wiped 2=😤Tired 3=😊Good 4=💪Strong 5=🔥Beast Mode  
PR label: Week 1 → "Baselines Set" | Week 2+ → "PRs Hit" ← NEW v1.14

---

## PROFILE SETTINGS

**Training Preferences reads from active plan_json first:**
```ts
const activePlan = await supabase.from('plans').select('plan_json')
  .eq('user_id', userId).eq('status', 'active')
  .order('created_at', { ascending: false }).limit(1).maybeSingle();

experience    = activePlan?.plan_json?.experience    ?? userProfile?.training_age;
daysPerWeek   = activePlan?.plan_json?.daysPerWeek   ?? userProfile?.days_per_week;
sessionLength = activePlan?.plan_json?.sessionLength ?? userProfile?.session_duration_mins;
split         = activePlan?.plan_json?.split         ?? userProfile?.preferred_split;
equipment     = activePlan?.plan_json?.equipment     ?? userProfile?.equipment;
```
sessionLength string range ("30-45") → display "30–45 min". Null → display "—".

**Body metric editing (NEW v1.14):** Height and age are editable via inline tap → modal → saves to user_profiles. Biological sex not editable. Does not regenerate macro plan.

**Rate App trigger (NEW v1.14):** Only show when `completedWeeks >= 1`. Hide entirely before Week 1 complete.

**Account deletion (NEW v1.14 — APP STORE REQUIREMENT):**  
Profile → Support → "Delete Account"  
Full-screen confirm modal → cascade delete all user data → sign out → Splash  
Verify Supabase RLS cascade covers: user_profiles, goals, plans, workout_logs, macro_plans, weight_logs, meal_suggestions, weekly_summaries.

---

## SUPABASE EDGE FUNCTIONS

All: JWT **DISABLED**, Model: `claude-sonnet-4-6`. Disable JWT after every deploy.

### generate-plan
**SESSION COUNT CONTRACT:**
- workoutDayCount = sessionStructure.filter(d => d.type === 'workout').length
- First instruction in Claude prompt — split name NEVER determines day count

**totalWeeks:** `body.recommendedWeeks ?? body.totalWeeks ?? body.planDuration ?? body.weeks ?? 12`

**Exercise cap:** getMaxExercises(sessionLength, experience)
```
beginner:[3,4,5,5] intermediate:[4,5,6,6] advanced:[5,6,7,8] — indexed by ≤45/≤60/≤90/90+min
```

**Week 1:** strength = current1RM × 0.75 | non-strength = targetWeight: 0

**caloriePace** passed in body — used for any coaching notes referencing deficit/surplus

### generate-next-week
- priorTargetWeight===0 → avgLoggedWeight as Week 2 baseline
- Post-Week-1 summary closes calibration loop with specific RPE references
- **Must trigger automatically on week completion — zero required user action (NEW v1.14)**
- **Week 2 must be available before user exits post-workout flow (NEW v1.14)**
- **Error state: "Jordan is building your Week 2 — it'll be ready in a moment." + loader (NEW v1.14)**

---

## PLAN_JSON STRUCTURE

```
plan_json: { title, totalWeeks, daysPerWeek, goal, split, currentWeek,
             experience, sessionLength, equipment, jordanWelcome, weeks[] }
WeekObject: { weekNumber, phase, days[] }
DayObject:  { dayNumber, type, title, sessionFocus, muscleGroups, exercises[] }
ExerciseObject: { id, name, muscleGroup, sets, reps, targetWeight, restSeconds,
                  targetRpe, coachingNote, plateaued?, plateauWeeks? }
sets_json: { exerciseId, setNumber, weightLbs, reps, rpe(0=not logged), swapped }
```

Phase: baseline(accent) | accumulation(success) | intensification/deload(warning)  
Week 1 always baseline. plan_json.experience/sessionLength/equipment used by ProfileSettings.

---

## DATABASE SCHEMA NOTES

```
workout_logs: logged_at (NOT created_at) | sets_json.weightLbs (NOT weight)
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

formatSessionTitle(): snake_case focus ID → display title. Fallback: capitalise + replace underscores.

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
- **Weight placeholder: "Weight" not "Choose weight" — truncation fix (NEW v1.14)**

---

## RULES FOR THIS PROJECT

- React Native + Expo only, TypeScript everywhere
- All DB calls through Lib/supabase.ts | All Claude calls through Edge Functions only
- No hardcoded API keys or hex strings
- Screens in /screens | Components in /components
- Register every new screen in navigation/index.tsx AND navigation/types.ts
- planId always from fresh Supabase query, never from route.params
- **Never use "AI" in any Jordan copy or user-facing text (NEW v1.14)**
- **Never show a dead-end screen — every screen must have a forward action (NEW v1.14)**

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

### 🔴 P0 — App Store Submission Blockers (must fix before any submission)

1. **Account deletion** — add to Profile → Support. Full cascade delete + confirm modal. Apple requirement.
2. **Notifications permission flow** — "Available on iOS & Android" button must call `Notifications.requestPermissionsAsync()`. Verify not shipping as dead button.
3. **Grammar bug** — Consistency Grid: `${count} training ${count === 1 ? 'day' : 'days'} in the last 10 weeks`
4. **Sample week lock text** — `+ ${remainingDays} more days visible after unlocking` must derive from `sessionStructure.length`, not hardcoded.

### 🟠 P1 — Conversion & Day 1 Retention (before first public marketing)

5. **Plan Preview Jordan context card** — show when hypertrophy + advanced + projectedGain < 2.0 lbs
6. **Plan Preview y-axis labels** — "lbs lean mass (est.)" etc on all projection charts
7. **Dashboard Day 1 Jordan card** — unique copy, never duplicate of Plan Ready screen
8. **Dashboard cold-start stats** — hide zeros on Day 1, show motivational placeholder
9. **Weekly Review empty state** — add "Start Today's Workout →" CTA
10. **Nutrition Jordan card tense** — forward-looking until first meal logged
11. **Notifications screen** — rewrite with specific value props (session reminders + weekly summary alert)
12. **Consistency Grid new-user Jordan note** — "Week 1 done — 100% completion. The grid fills up fast."
13. **Pre-session coaching card** — client-side signal detection, Jordan framing card on dashboard (Section 15.3)
14. **Session intent line** — one-line purpose on all day cards and dashboard workout card
15. **Week 1→2 transition** — auto-trigger generate-next-week, available before user exits post-workout flow

### 🟡 P2 — 30-Day Polish (first update post-launch)
See PRD Section 14.4 for full P2 list (22 items across Workout / Weekly Summary / Progress / Onboarding / Profile / Copy).

### ⚪ P3 — Phase 4 Roadmap
See PRD Section 14.5 and Phase 4 Priorities above.

---

### 🟢 Fixed — Session 3 (April 8 2026)
Pace selector in MacroSetup ✅ | calorie_pace replaces hardcoded adjustments ✅ | PlanPreview layout (chart first) ✅ | ProjectionChart (gradient, band, bubble, animation) ✅ | PlanPreview pace → read-only badge ✅ | Goal Tracker actuals overlay + ahead/behind badge ✅ | Strength feasibility range text ✅ | Strength chart start label + goal line + gap callout + y-axis fix ✅ | GoalDetails CTA always "Continue" ✅ | Dashboard sessions filtered to active planId ✅ | ProfileSettings reads active plan_json ✅

---

## DO NOT CHANGE

The filename — it must remain `CLAUDE_CONTEXT.md`
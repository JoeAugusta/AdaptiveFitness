# HONE — CLAUDE CONTEXT
<!-- DO NOT CHANGE THE FILENAME -->
<!-- Last updated: May 2026 — TestFlight Beta Sprint -->

---

## PROJECT OVERVIEW

**App:** Hone: AI Fitness Coach — iOS subscription SaaS (rebranded from Adaptive Fitness Coach)
**Bundle ID:** com.gethone.app
**App Store:** "Hone: AI Fitness Coach" (App ID: 6772574749)
**EAS Project:** 5ce920f1-92df-4e16-af50-30659cf55aeb
**Supabase Project:** vpjbsovstlctgkvpqqal
**Stack:** React Native + Expo (SDK 55), Supabase (PostgreSQL, Edge Functions, RLS), RevenueCat, Claude API
**Supabase tables:** users, user_profiles, goals, plans, workout_logs, macro_plans, weekly_summaries, weight_logs, body_measurements, sport_logs, beta_feedback, cardio_logs, free_sessions
**Edge Functions:** generate-plan, coaching-feedback, weekly-coach-summary, generate-next-week, generate-final-review, delete-account
**Key files:** constants/design.ts, constants/exerciseLibrary.ts, components/ExerciseCard.tsx, navigation/types.ts, utils/splitRecommendation.ts, utils/projections.ts, components/ProjectionChart.tsx, components/BetaFeedbackModal.tsx

---

## BUILD STATUS

### Current Phase
**TestFlight Beta Sprint** — May 2026
Friends & family beta active. Build 22 in flight. Core features complete.

### Completed Sprints
- Phase 1–3 Foundation, Core Loop, Engagement ✅
- Design Upgrade ✅ April 2026
- Coaching Engine Sprint ✅ April 2026
- Onboarding Upgrade Sprint ✅ April 2026
- Goal-First Programming Sprint ✅ April 2026
- Workout Experience Sprint ✅ April 2026
- Bug Fix Sprint ✅ April 2026
- Projection Charts + Polish Sprint ✅ April 8 2026
- Post-Review Sprint v1.14 ✅ April 2026
- Hone Rebrand Sprint ✅ May 2026
- TestFlight Beta Launch ✅ May 2026

---

## BRANDING

**App name:** Hone
**Tagline:** Your coach. Built around you.
**Logo:** Orange hexagon outline mark with dark background and orange H letterform inside
- AuthScreen SVG: 56×56, hexagon outline H
- SplashScreen SVG: 96×96, hexagon outline H
- App icon: 1024×1024 PNG — hexagon H on dark background
- Splash asset: 1284×2778 PNG — hexagon H centered on #09090B

**SVG mark (use in all screens):**
```jsx
<Svg width={W} height={W} viewBox="0 0 100 100">
  <Polygon
    points="50,7 89,28 89,72 50,93 11,72 11,28"
    fill="#09090B"
    stroke="#F97316"
    strokeWidth="5"
  />
  <Rect x="24" y="28" width="18" height="44" rx="4" fill="#F97316"/>
  <Rect x="58" y="28" width="18" height="44" rx="4" fill="#F97316"/>
  <Rect x="24" y="42" width="52" height="14" rx="3" fill="#F97316"/>
</Svg>
```

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
- Section headings: FontSizes.label, Fonts.bold, Colors.textSecondary, letterSpacing 1.5, uppercase
- Cards: bgCard, Radius.lg, borderWidth 1, divider
- Jordan cards: bgCard + borderLeftWidth 3 + borderLeftColor accent
- Back chevrons: "‹" fontSize 28, Fonts.bold, Colors.accent

---

## NAVIGATION STRUCTURE

### Root Stack
```
Splash → BetaWelcome → Auth → SignUp/SignIn →
JordanIntro → Onboarding → GoalDetails → Experience → RPEEducation →
Constraints → BodyMetrics → MacroSetup → PlanPreview → BuildingPlan →
Dashboard (MainTabs)
```

### Tab Navigator (5 tabs)
```
HomeTab → HomeScreen, WeeklyCoachSummary
WorkoutTab → WorkoutHomeScreen, PlanView, ExerciseLibrary, WorkoutHistory, FreeSession, PlanComplete
ProgressTab → ProgressCharts, GoalTracker, PersonalRecords, BodyMeasurements
NutritionTab → MacroTracker
ProfileTab → ProfileSettings, SubscriptionManagement, NotificationsSettings
```

### Root Stack (full-screen, above tabs)
```
ActiveWorkout, WorkoutComplete, PlanComplete
```

### Critical Navigation Patterns
```ts
// PlanView from WorkoutComplete
navigation.navigate('MainTabs', { screen: 'WorkoutTab', params: { screen: 'PlanView' } })

// WeeklyCoachSummary
navigation.reset({ index: 0, routes: [{ name: 'Dashboard',
  state: { routes: [{ name: 'HomeTab',
    state: { routes: [{ name: 'WeeklyCoachSummary', params: { planId, weekNumber } }] } }] } }] })

// New user flow: SignUp → JordanIntro → Onboarding
// Returning user: SplashScreen reads authReady from AuthContext → Dashboard
```

---

## JORDAN PERSONA RULES

- **NEVER use "AI" in any Jordan-facing copy**
- All coaching copy must be specific and data-driven
- Jordan speaks in first person, coach voice — never system/app voice
- Weekly summaries sign off "— Jordan"
- No banned phrases: "crush it", generic motivational filler
- Jordan intro copy (JordanIntroScreen):
  > "I'm Jordan. After each set I'll ask how hard it felt — that's how I know whether to push you harder next week or pull back. No guessing. Just training that adapts to you."

---

## AUTH & SESSION

### Supabase client (Lib/supabase.ts)
```ts
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

**Critical:** AsyncStorage MUST be configured as auth storage or sessions won't persist between app launches.

### Supabase version
Pinned to `"@supabase/supabase-js": "2.45.0"` (no caret — exact pin).
Newer versions pull in OTEL dependencies that break Hermes bundler.

### Metro config (metro.config.js)
Required to shim the `ws` Node.js module used by @supabase/realtime-js:
```js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const config = getDefaultConfig(__dirname);
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'ws') {
    return { filePath: require.resolve('./shims/ws.js'), type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
```

`shims/ws.js`:
```js
'use strict';
const W = typeof WebSocket !== 'undefined' ? WebSocket : null;
module.exports = W;
module.exports.default = W;
```

### AuthContext
Uses `onAuthStateChange` — sets `authReady` only after first event fires (INITIAL_SESSION).
Never use `getSession()` alone on mount — races AsyncStorage hydration on cold start.

### SplashScreen routing
Single useEffect gated on `authReady`. Uses `hasNavigated` ref to prevent double navigation.
Routes: no session → BetaWelcome/Auth | anonymous → Dashboard | no plans → JordanIntro | has plans → Dashboard

---

## BETA CONFIGURATION

### Beta bypass
```ts
// hooks/useEntitlement.ts
const BETA_BYPASS = true; // flip to false before public launch

// screens/onboarding/PlanPreviewScreen.tsx
const BETA_BYPASS = true; // same
```

### Beta feedback
`BetaFeedbackModal` component used throughout app.
- Profile: all areas selectable
- Onboarding screens: `lockArea={true}` + `defaultArea="onboarding"` props
- Modal uses `presentationStyle="pageSheet"` + `transparent={false}` for reliable rendering on device
- Data saved to `beta_feedback` Supabase table

### Beta welcome
`BetaWelcomeScreen` shown once on first launch (AsyncStorage key: `hone_beta_welcome_seen`).

---

## ONBOARDING FLOW

### Screen map
| Screen | Step | File |
|---|---|---|
| JordanIntro | (pre-onboarding) | screens/onboarding/JordanIntroScreen.tsx |
| Goal Selection | 1 of 8 | screens/OnboardingScreen.tsx |
| Goal Details | 2 of 8 | screens/onboarding/GoalDetailsScreen.tsx |
| Experience & Schedule | 3 of 8 | screens/onboarding/ExperienceScreen.tsx |
| RPE Education | 4 of 8 | screens/onboarding/RPEEducationScreen.tsx |
| Constraints & Equipment | 5 of 8 | screens/onboarding/ConstraintsScreen.tsx |
| Body Metrics | 6 of 8 | screens/onboarding/BodyMetricsScreen.tsx |
| Macro Setup | 7 of 8 | screens/onboarding/MacroSetupScreen.tsx |
| Plan Preview + Paywall | 8 of 8 | screens/onboarding/PlanPreviewScreen.tsx |
| Building Plan | (none) | screens/onboarding/BuildingPlanScreen.tsx |

### Week 1 calibration exception
New users on Week 1 with 0 sessions logged always see Day 1 available regardless of calendar day.
`isWeek1NoSessionsYet = (plan.current_week === 1) && (completedDayNumbers.size === 0)`
Dashboard shows "Start whenever you're ready — your schedule begins Week 2." hint.

---

## EDGE FUNCTIONS

All deployed with `--no-verify-jwt`. JWT re-enables on every redeploy — always add `--no-verify-jwt`.
Model: `claude-sonnet-4-6` in all Edge Functions.

| Function | Purpose |
|---|---|
| generate-plan | Initial plan generation |
| generate-next-week | Week N+1 generation from RPE data |
| coaching-feedback | Per-set Jordan coaching note |
| weekly-coach-summary | End-of-week Jordan summary |
| generate-final-review | Plan completion review |
| delete-account | Cascade delete all user data |

**Deploy command:**
```bash
supabase functions deploy <function-name> --no-verify-jwt
```

---

## DATABASE SCHEMA NOTES

```
workout_logs: uses logged_at (NOT created_at)
workout_logs: sets_json.weightLbs (NOT weight)
plans: status = active/completed/paused ONLY
user_profiles: always .order('id',{ascending:false}).limit(1).maybeSingle()
body metric editing: uses .update() not upsert (unique constraint on user_profiles.user_id)
session_fatigue_rating: NOT energy_rating (400 error if wrong)
```

---

## SUBSCRIPTIONS

RevenueCat entitlement key: `'pro'`
Web bypass: `Platform.OS === 'web'` always isPro=true
Beta bypass: `BETA_BYPASS = true` in useEntitlement.ts and PlanPreviewScreen.tsx
Fail closed: error → isPro = false

App Store products not yet configured (needed before public launch).
RevenueCat project still named "AdaptiveFitness" — rename to "Hone" before public launch.

---

## KNOWN CRITICAL GOTCHAS

- `session_fatigue_rating` not `energy_rating` — Supabase 400 error if wrong field name
- `user_profiles` always queried with `.order('id', {ascending:false}).limit(1).maybeSingle()`
- PlanView navigation from WorkoutComplete: `navigation.navigate('MainTabs', { screen: 'WorkoutTab', params: { screen: 'PlanView' } })` — NOT direct navigation
- `workout_logs` uses `logged_at` not `created_at`
- Body metric editing uses `.update()` not upsert
- Supabase pinned to `2.45.0` exactly — `ws` shim required in metro.config.js
- AsyncStorage must be configured in Lib/supabase.ts for session persistence
- All Edge Function deploys use `--no-verify-jwt`
- JWT re-enables on every redeploy

---

## TARGET LIFT LIST (6 exercises only)
- Bench Press
- Back Squat
- Deadlift
- Overhead Press
- Weighted Pull-up
- Sumo Deadlift

Romanian Deadlift, Front Squat, Barbell Row removed — no standardized 1RM protocol.
PPL split unavailable for lower body target lifts (squat/deadlift).

---

## WORKING PATTERN

- Claude writes Cursor/Composer prompts → Joe pastes → reports results
- Opus 4.6 for complex screens and new features
- Sonnet 4.6 for fixes and Edge Functions
- Composer 2 for all multi-file changes
- Commit before every build (EAS uses commit hash — same hash = cached build)
- Always remind to deploy Edge Functions after changes

---

## OUTSTANDING ISSUES

### 🔴 P0 — Beta Blockers

1. **BetaFeedbackModal** — pageSheet approach in Build 22, not yet confirmed working on device
2. **Account deletion** — Apple App Store requirement (implemented but needs regression test)
3. **Push notifications permission flow** — needs verification on device

### 🟠 P1 — High Priority Beta Fixes

4. **Plan generation timing** — progress bar completes 30-40s before API returns; spinner "Jordan is finalizing your plan..." added in Build 21, not yet confirmed
5. **Jordan note on plan ready screen** — strips "I'm Jordan" re-intro; cleanJordanMessage() added, not yet confirmed
6. **Onboarding feedback buttons** — added to all onboarding screens in Build 21, not yet confirmed

### 🟡 P2 — Post-Beta Polish

7. Active workout: keyboard dismiss on weight/reps inputs (ExerciseCard.tsx)
8. Active workout: cancel without saving (3-option Alert — Keep Going / Finish & Save / Discard)
9. Weekly summary empty state CTA
10. Consistency Grid new-user Jordan note
11. Progress tab default lift by goal
12. Body metric editing in profile
13. **Language / i18n (v2.0)** — deferred. Requires i18next + react-i18next, translation files for all UI strings, App Store localization submissions. Recommended approach: English-only Jordan copy with translated UI shell. Do not implement until v2.0.

### ✅ Recently Fixed

- Session persistence (AsyncStorage in Lib/supabase.ts) — Build 22
- Jordan intro screen before onboarding — Build 15+
- Week 1 Day 1 always available — Build 9+
- Weight log keyboard dismiss — Build 9+
- Paywall bypass for beta — Build 8
- Stay logged in (ws shim + Supabase pin) — Build 22

---

## RULES FOR THIS PROJECT

- React Native + Expo only, TypeScript everywhere
- All DB calls through Lib/supabase.ts
- All Claude calls through Edge Functions only — never from client directly
- No hardcoded API keys or hex strings
- Screens in /screens | Components in /components
- Register every new screen in navigation/index.tsx AND navigation/types.ts
- planId always from fresh Supabase query, never from route.params
- **NEVER use "AI" in any Jordan copy or user-facing text**
- **Never show a dead-end screen — every screen must have a forward action**
- **Jordan is never called "AI" — he is a coach**

---

## DO NOT CHANGE

The filename — it must remain `CLAUDE_CONTEXT.md`

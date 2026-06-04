# HONE — CLAUDE CONTEXT
<!-- DO NOT CHANGE THE FILENAME -->
<!-- Last updated: June 3 2026 — Build 26 sprint complete, progression engine + swap system overhaul -->

---

## PROJECT OVERVIEW

**App:** Hone: AI Fitness Coach — iOS subscription SaaS
**Bundle ID:** com.gethone.app
**App Store:** "Hone: AI Fitness Coach" (App ID: 6772574749)
**EAS Project:** 5ce920f1-92df-4e16-af50-30659cf55aeb
**Supabase Project:** vpjbsovstlctgkvpqqal
**Stack:** React Native + Expo (SDK 55), Supabase (PostgreSQL, Edge Functions, RLS), RevenueCat, Claude API

---

## BUILD STATUS

**Current phase:** Near-Launch Beta Sprint — June 2026
**Build 25:** Submitted. generate-plan quality sprint + generate-next-week progression engine overhaul.
**Build 26:** In progress — subscription redesign, RevenueCat wiring, pricing screen, progression engine overhaul, swap system overhaul.

### Build 25 — What's In It
- generate-plan: coaching note overhaul (explain exercise, not goal-lift fabrication)
- generate-plan: Tier-1 lower compound enforcement (post-processing)
- generate-plan: knee injury exclusion list (post-processing + prompt rule)
- generate-plan: deduplicateExercises() post-processing
- generate-next-week: W1→W2 calibration flat for self-select plans (no increment on calibration week)
- generate-next-week: advanced lifter experience multiplier applied to fixed increments
- generate-next-week: isolation increment ceiling (2.5 lbs max for dumbbell/cable)
- generate-next-week: deload week reduces load ×0.85 and sets −1 (minimum 2)
- generate-next-week: power_hypertrophy accessory weight baseline fixed (BW collapse resolved)
- generate-next-week: exercise name normalization (conservative — parentheses only, not equipment words)
- Goal progress hero card on Goal Tracker (S14) — 1RM progress ring + Jordan note (strength only)
- Workout completion share card (react-native-view-shot + expo-sharing, native only)
- 1RM chart: category + exercise selector (muscle group filter → exercise chips)
- Weekly volume: expanded muscle group map, keyword fallback, no "Other" category
- Plan start date: smart "Your first session is [Day]" — single CTA, no binary choice
- MacroSetup useEffect fix: recalculates for all goal types not just fat_loss/hypertrophy
- MacroSetup reset link: "Reset to recommended" when calories manually adjusted
- Protein floor for fat_loss: 0.8g/lb instead of 1.0g/lb; minimum 50g fat floor
- Hone brand: capital H throughout (matches logo mark)
- Home screen: "Schedule begins Week 2" hint removed
- Plan completion %: sessions-based not time-based (0% until first session logged)
- "Consistency" stat card: adjustsFontSizeToFit to prevent wrapping
- Personal Records + Meal Preferences screens: safe area bottom padding fixed
- Weight log: refetch after save to fix race condition on dashboard
- Projection chart: "index" label removed from y-axis
- Behind pace badge: hidden until Week 2 (no meaningful comparison in Week 1)
- Estimated 1RM: loose exercise name matching + fallback to current1RM when no logs
- Goal Tracker hero card: strength goal only (removed redundant non-strength version)

---

## BRANDING

**App name:** Hone (capital H — matches the capital H logo mark)
**App Store name:** "Hone: AI Fitness Coach" (title case required by Apple)
**Tagline:** Your coach. Built around you.

### App Logo
The app logo is the hexagon H mark stored in `assets/icon.png`.
Used in: SplashScreen (inline SVG), AuthScreen (Image, 72×72), SignInScreen (Image, 36×36), SignUpScreen (Image, 36×36).
DO NOT use inline SVG for the logo on auth screens — use `require('../../assets/icon.png')`.

### Jordan Avatar (JordanAvatar component)
```tsx
import Svg, { Circle, Polygon, Rect, Text as SvgText } from 'react-native-svg';

function JordanAvatar({ size = 48 }: { size?: number }) {
  const r = size / 2;
  const cx = r;
  const cy = r;
  const hex = [0,1,2,3,4,5].map(i => {
    const angle = Math.PI / 180 * (60 * i + 30);
    const hr = r * 0.72;
    return `${cx + hr * Math.cos(angle)},${cy + hr * Math.sin(angle)}`;
  }).join(' ');
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={cx} cy={cy} r={r - 1.5} fill="#09090B"
        stroke="#F97316" strokeWidth={size > 60 ? 2.5 : size > 40 ? 2 : 1.5} />
      <Polygon points={hex} fill="none" stroke="#F97316"
        strokeWidth={size > 60 ? 1.2 : 0.8} opacity={0.35} />
      <SvgText x={cx} y={cy + size * 0.18} fontSize={size * 0.5}
        fontWeight="700" fill="#F97316" textAnchor="middle">J</SvgText>
      <Rect x={cx - size * 0.14} y={cy + size * 0.22}
        width={size * 0.28} height={size > 60 ? 3 : 2}
        rx={size > 60 ? 1.5 : 1} fill="#F97316" opacity={0.7} />
    </Svg>
  );
}
```
**CRITICAL:** x={cx} NOT x={cx + size * 0.03} — offset causes off-center J.
**Sizes:** JordanIntro: 80 | BuildingPlan loading: 72 | HomeScreen card: 32 | ActiveWorkout preSession: 40

---

## DESIGN SYSTEM

`constants/design.ts` is the single source of truth.

```ts
import { Colors, Fonts, FontSizes, Spacing, Radius, CommonStyles } from '../constants/design';
// Onboarding:
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';
```

### Colors
```
bgPrimary='#09090B'  bgCard='#111113'  bgElevated='#1C1C1E'
accent='#F97316'  accentMuted='rgba(249,115,22,0.12)'  accentBorder='rgba(249,115,22,0.4)'
textPrimary='#FAFAFA'  textSecondary='#A1A1AA'  textTertiary='#52525B'
success='#22C55E'  warning='#F59E0B'  danger='#EF4444'
divider='#27272A'  border='#3F3F46'  overlay='rgba(0,0,0,0.7)'
```

### Design Rules
- StyleSheet.create only — no inline styles except dynamic values
- No hardcoded hex — Colors.* exclusively
- No fontWeight — Fonts.* fontFamily only
- No em-dashes (—) anywhere in copy
- No emojis as UI icons — use Ionicons from @expo/vector-icons
- Primary buttons: height 56, Radius.lg, Colors.accent
- Jordan cards: bgCard + borderLeftWidth 3 + borderLeftColor accent
- Back chevrons: "‹" fontSize 28, Fonts.bold, Colors.accent
- User avatar (profile screen): bgElevated background, border Colors.border, textPrimary initial — NOT orange
- Home screen header: greeting text only, no avatar circle

### Icon Usage
All icons use Ionicons from @expo/vector-icons. No emoji as UI icons anywhere.
Fatigue/effort ratings use colored dot system (not emoji):
  { rating: 1, label: 'Wiped', color: '#EF4444' }
  { rating: 2, label: 'Tired', color: '#F97316' }
  { rating: 3, label: 'Good', color: '#F59E0B' }
  { rating: 4, label: 'Strong', color: '#84CC16' }
  { rating: 5, label: 'Beast', color: '#22C55E' }

Goal selection cards use left accent bar (not emoji):
  Unselected: borderLeftColor Colors.border (3px)
  Selected: borderLeftColor goal.accentColor (3px) + accentMuted background

---

## NAVIGATION STRUCTURE

```
Splash → BetaWelcome → Auth → SignUp/SignIn →
JordanIntro → Onboarding → GoalDetails → Experience → RPEEducation →
Constraints → BodyMetrics → MacroSetup → PricingScreen → BuildingPlan →
Dashboard (MainTabs)

Tabs: HomeTab | WorkoutTab | ProgressTab | NutritionTab | ProfileTab

Root stack (full-screen above tabs):
ActiveWorkout, WorkoutComplete, PlanComplete
```

### Critical Navigation Patterns
```ts
// PlanView from WorkoutComplete
navigation.navigate('MainTabs', { screen: 'WorkoutTab', params: { screen: 'PlanView' } })
```

---

## JORDAN PERSONA RULES

- NEVER use "AI" in any Jordan-facing copy
- NEVER use em-dashes (—) anywhere
- All coaching copy: specific, data-driven, coach voice
- Weekly summaries sign off "Jordan" (no dash before) — only in motivationalNote, nowhere else
- No banned phrases: "crush it", generic motivational filler
- Max 2 sentences for pre-session messages
- Max 3 sentences for nutrition Jordan notes

### cleanJordanMessage() — apply to ALL jordanWelcome renders
```ts
function cleanJordanMessage(msg: string): string {
  return msg
    .replace(/^I'm Jordan[^.]*\.\s*/i, '')
    .replace(/^[^.]*hardest[^.]*\.\s*/i, '')
    .replace(/^[^.]*difficult[^.]*\.\s*/i, '')
    .replace(/^[^.]*toughest[^.]*\.\s*/i, '')
    .replace(/^[^.]*challenging[^.]*\.\s*/i, '')
    .replace(/[^.]*begins (in )?week 2[^.]*\.\s*/gi, '')
    .replace(/[^.]*starts (in )?week 2[^.]*\.\s*/gi, '')
    .replace(/[^.]*your (workouts?|training|schedule) (will )?(begin|start)[^.]*\.\s*/gi, '')
    .trim() || msg;
}
```

### stripEmDash() — apply to ALL Claude-generated strings at render
```ts
export function stripEmDash(text: string): string {
  return text
    .replace(/ — /g, '. ')
    .replace(/—/g, '.')
    .replace(/ – /g, ' ')
    .replace(/–/g, '-')
    .trim();
}
```
Defined in utils/jordanText.ts — import from there, never copy-paste.
Apply to: jordanWelcome, coachingNote, coach_note, summaryText, latestJordanNote, preSessionMessage, sessionFocus in WorkoutHistoryScreen, plan title in ProfileSettingsScreen, any string from Edge Functions before rendering.

---

## AUTH & SESSION

### Supabase client (Lib/supabase.ts)
```ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```
**CRITICAL:** AsyncStorage MUST be configured or sessions won't persist.

### Package versions
```
"@supabase/supabase-js": "2.45.0"  ← exact pin, no caret
```
Newer versions pull OTEL dependencies that break Hermes.

### Metro config — ws shim required
```js
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'ws') {
    return { filePath: require.resolve('./shims/ws.js'), type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};
```

---

## BETA CONFIGURATION

```ts
// constants/betaBypass.ts — single source of truth
const BETA_BYPASS = true; // flip false before public launch
```

### BetaFeedbackModal props
```tsx
// Onboarding — locked:
<BetaFeedbackModal visible={show} onClose={() => setShow(false)}
  defaultArea="onboarding" lockArea={true} />

// Profile — all areas:
<BetaFeedbackModal visible={show} onClose={() => setShow(false)} />
```
Uses `presentationStyle="pageSheet"` + `transparent={false}`.
`canSubmit` = `category && (lockArea || featureArea) && description.length >= 3`.

---

## ONBOARDING FLOW

| Screen | Step | Notes |
|---|---|---|
| JordanIntro | pre | Forward only, no back |
| Goal Selection | 1/8 | Accent bar left border, no emoji |
| Goal Details | 2/8 | Plan duration Jordan card has left border accent |
| Experience & Schedule | 3/8 | Recovery toggle has "Recovery" section label |
| RPE Education | 4/8 | RPE circles: tinted fill + matching border |
| Constraints | 5/8 | |
| Body Metrics | 6/8 | Body fat slider, bf value in textPrimary not accent |
| Macro Setup | 7/8 | Pace card: "Lean Bulk" title only, description below |
| Pricing Screen | pre-plan | After MacroSetup, before BuildingPlan. BETA_BYPASS skips paywall. |
| Building Plan | none | No italic copy. Checkmark uses Ionicons. |

### Body fat slider
Skip button sets bodyFatPct to null. Zone label only shows after user touches slider.
bf value color: Colors.textPrimary. Zone label color: Colors.accent.

### Mid-week plan start (FIXED — Build 23)
plans table has start_date date column. generate-plan sets start_date = today at INSERT.
BuildingPlanScreen shows "When do you want to begin?" after plan generates.
Next Monday computed as: `const daysUntilMonday = (1 - today.getDay() + 7) % 7 || 7;`
Dashboard uses count-forward from start_date — NOT calendar weekday mapping.

### Keyboard dismiss — all onboarding screens
Every screen wraps root in `TouchableWithoutFeedback onPress={Keyboard.dismiss}`.

---

## SPLIT LOGIC (utils/splitRecommendation.ts)

### batman6() — 6 workout days (FIXED)
```ts
function batman6(): SessionDay[] {
  return [
    W(1, 'chest_back_heavy', ['chest', 'back'], 'heavy'),
    W(2, 'legs_shoulders', ['quads', 'hamstrings', 'shoulders'], 'moderate'),
    W(3, 'arms_core', ['biceps', 'triceps', 'core'], 'moderate'),
    W(4, 'chest_back_volume', ['chest', 'back'], 'volume'),
    W(5, 'legs_unilateral', ['hamstrings', 'glutes', 'quads'], 'volume'),
    W(6, 'arms_core', ['biceps', 'triceps', 'shoulders'], 'volume'),
    R(7),
  ];
}
```

### effectiveDays pattern
```ts
const effectiveDays = selectedDays?.length > 0 ? selectedDays.length : daysPerWeek;
```

---

## EXERCISE LIBRARY (constants/exerciseLibrary.ts)

### Grip/attachment variants
22 variants added. Same rotationGroup as parent, different muscleEmphasis.
gripVariant field on Exercise interface.

### Swap logic (components/ExerciseCard.tsx)
Candidates from EXERCISES library — NOT exercise.alternatives.
Priority: same movementPattern → same primaryMuscle + compoundTier fallback.
Excludes exercises already in current workout.

---

## EXERCISE SWAP SYSTEM

⚠️ **NEEDS EXTENDED TESTING BEFORE LAUNCH** — see Pre-Launch Checklist.

### Architecture
- Two-step UX: tap to select (highlight) → Swap/Cancel buttons appear
- `persistExerciseSwapsToPlan()` in `utils/swapPersistence.ts`: writes swapped name to plan_json for current week AND all future weeks. Sets `originalName` on first swap. Updates `equipment`, `muscleGroup`, `compoundTier` from EXERCISES library.
- `generate-next-week` detects swap via `isExerciseSwappedThisWeek()` — checks `exercise.originalName !== exercise.name`. Skips anomaly detection. Uses logged weight as new baseline. Clears `originalName` after processing.

### Weight prefill on swap
- `fetchLastLoggedWeightForExercise()` in `utils/swapWeightHistory.ts`: exact name match only across ALL plan logs (no week_number filter). Returns MAX weight found.
- `fetchLastLoggedSetsForExercise()` in `utils/swapWeightHistory.ts`: returns full `{ setNumber, weightLbs }[]` array for most recent session with that exercise. Used for pyramid prefill on swap-back.
- Exact match only — NO partial/includes matching for either function.

### Swap weight flow
```
User taps Swap → applySwap() in ExerciseCard:
  1. fetchLastLoggedSetsForExercise() for candidate name
  2. If ascending pattern (pyramid): store as pyramidSets, set prefilledWeight = max
  3. If straight sets: prefilledWeight = max weight found
  4. Call onSwapExercise(id, name, { prefilledWeight, pyramidSets })

handleSwapExercise() in ActiveWorkoutScreen:
  1. setExerciseSwaps: track swap name
  2. setExercisePyramidSetsOverrides: store pyramid structure if present
  3. setExerciseTargetWeightOverrides: store prefilled weight

ExerciseCard getDefaultInput():
  - pyramidSetsOverride takes priority for pyramid exercises (per-set weights)
  - targetWeightOverride used when no pyramid override
  - inputValues cleared whenever targetWeightOverride changes (via useEffect)
```

### previousSets behavior after swap
- `getPreviousSetsForExercise()` now matches by exercise NAME (exact) not by slot ID
- After swap: previousSets is empty → "Last Week" strip hidden ✅
- After swap-back (e.g. Dumbbell → Barbell): finds W1 barbell sets by exact name ✅
- Trend arrow suppressed when previousSets is empty ✅

### coaching-feedback anomaly detection
- Ratio > 3.0× difference treated as likely swap — neutral message, no "logging error"
- 1.5×–3.0× difference — existing logging error message retained

### Known gaps (test before launch)
- Multi-week swap chains (A→B→C→A) not regression tested
- Swap on volume days vs heavy days not regression tested
- Swap + deload week interaction not tested
- Pyramid swap-back with different set count than original not tested

---

## EDGE FUNCTIONS

All deployed with `--no-verify-jwt`. JWT re-enables on every redeploy — always add flag.
Model: `claude-sonnet-4-6` in all functions.

```bash
supabase functions deploy <function-name> --no-verify-jwt
```

### generate-plan — key rules
- Week 1 factor: beginner=0.70 | intermediate=0.75 | advanced=0.82
- Cable exercises specify attachment, barbell rows specify grip
- Vary grip/attachment — never same grip twice in same week
- No em-dashes anywhere in output
- Sets start_date = today at INSERT
- Marks all other active plans for user as 'paused' on new plan creation

### generate-next-week — progression engine (Build 26 overhaul)

**RPE gap:** `targetRpe - loggedRpe` (positive = easier than target = increase)

**Pyramid detection:**
- `isPyramidExercise()`: checks `setStructure === 'pyramid'` OR ascending setTargets
- Top set = MAX weight logged (not average)
- Top set RPE = RPE of sets at top weight only (warmup sets excluded from RPE calc)

**Equipment-aware rounding:**
- ALL equipment rounds to nearest 5 lbs (`roundToEquipmentIncrement`)
- Barbell: 5 lb min (2.5 lb plates each side)
- Dumbbell: 5 lb min (fixed pairs)
- Cable/Machine: 5 lb min
- 192.5 lbs on a barbell is impossible — always rounds to 195

**RPE-based progression thresholds:**
```
rpeGap >= 0 (on target or better): always progress — minimum increment
rpeGap >= -1.0 (slightly hard): hold
rpeGap < -1.0 (too hard): decrease
```
Hitting target RPE = still progress (minimum 5 lbs). This is intentional.

**Minimum increments by compoundTier:**
```
isolation: gap >= 2.0 → 10 lbs max; gap >= 1.0 → 5 lbs; gap >= 0 → 5 lbs
primary_compound: gap >= 2.0 → max(raw, 10); gap >= 1.0 → max(raw, 10); gap >= 0 → max(raw, 5)
secondary_compound: gap >= 2.0 → max(raw, 10); gap >= 1.0 → max(raw, 5); gap >= 0 → max(raw, 5)
```

**Pyramid setTargets scaling:**
- `scalePyramidSetTargets()`: preserves W1 percentage ratios, scales proportionally to new top set
- When top set holds: setTargets preserved exactly (no regeneration of intermediate sets)
- When W1 had targetWeight=0: build setTargets from actual logged weights, then scale

**Swap detection in generate-next-week:**
- `isExerciseSwappedThisWeek()`: checks `exercise.originalName !== exercise.name`
- When wasSwapped: use logged weight as baseline, skip anomaly detection, clear `originalName`
- `deriveEquipmentFromName()`: re-derives equipment from name (prevents stale barbell equipment on dumbbell swap)

**Calibration:**
- `isCalibrationWeek = completedWeekNumber === 1` ONLY
- NOT triggered by `priorPrescribedWeight === 0` (that just means self-select)

**Adaptation copy (`stampExerciseAdaptationCopyAfterProgression`):**
- wasSwapped=true: "New exercise baseline — X lbs" / "Switched from Y — starting fresh at X lbs for Z."
- diff > 0: "Up N lbs — building on last week"
- diff < 0: "Down N lbs — recovery week"
- gap >= -1: "Same load — on track"

⚠️ **NEEDS EXTENDED TESTING BEFORE LAUNCH** — see Pre-Launch Checklist.

### analyze-progress-photo Edge Function
- Model: claude-sonnet-4-6 (vision)
- Gate: 28 days via user_profiles.last_photo_analysis_at
- Storage: progress-photos bucket (private), path: {userId}/{timestamp}_front.jpg
- Table: progress_photos (id, user_id, plan_id, week_number, photo_url_front, photo_url_side, analyzed_at, estimated_bf_pct, estimated_bf_range, lean_mass_lbs, analysis_json, macro_adjusted)
- Macro update: Katch-McArdle BMR = 370 + (21.6 × lean_mass_kg), updates macro_plans when >100 kcal difference
- Body image guardrails: progress vs self only, never vs external standard, always range not exact %, 3 sentence max Jordan note
- Deploy: supabase functions deploy analyze-progress-photo --no-verify-jwt
- Cost: ~$0.017 per analysis (2 images + prompt, Sonnet pricing)

### Progression Engine Audit Results (June 2026 — 5 profiles × 4 weeks)
| Profile | Result |
|---|---|
| Strength OHP Intermediate M | Clean — OHP +5/wk, squat +5-10/wk, deload fires correctly |
| Hypertrophy Advanced F | Fixed — bench 95→95→100→102.5, not 95→115→125 |
| Recomp Knee Injury F | Clean — no unsafe exercises, progressive load, correct calibration |
| Power Hypertrophy Deadlift Advanced M | Fixed — accessories no longer collapse to BW |
| Fat Loss Beginner No Barbell | Clean — no barbell, deload fires, beginner RPE artifact noted |

**Remaining gaps (post-beta):** volume/set/rep periodization, deload hierarchy by exercise class, rolling RPE history

### generate-meals — key rules
- jordanNote: max 3 sentences, no em-dashes
- No em-dash rule in system prompt

### generate-weekly-summary — key rules
- motivationalNote: 1-2 sentences, ends with "— Jordan" (only place)
- No em-dashes, no double periods
- STYLE RULE: Never use em-dashes. Never use double periods.

### generate-final-review — key rules (FIXED — Build 24)
- scheduledSessions = totalWeeks x daysPerWeek derived from first week only
  (plan_json.weeks is incremental — do NOT count array length)
- splitDisplayName looked up from SPLIT_DISPLAY map before passing to Claude
- Claude instructed to use exact split name verbatim — never infer from session structure
- SPLIT_DISPLAY keys: arnold, ppl, upper_lower, full_body, bro_split, strength_focused, athletic, batman

### coaching-feedback — key rules
- Pre-session messages: max 2 sentences
- max_tokens: 120 for pre-session calls
- Anomaly detection: ratio > 3.0× treated as likely swap (neutral message, no "logging error")

### _shared/week1PyramidSetTargets.ts
Ascending pyramids — top set last:
  3-set: 80/90/100%, 4-set: 75/85/92/100%, 5-set: 70/80/85/90/100%

---

## ACTIVE WORKOUT SCREEN

### Timers — timestamp-based
Elapsed and rest timers both use absolute timestamps. Survive background/lock.
AppState 'active' listener recalculates both on foreground.

### Keep-awake
activateKeepAwakeAsync() on mount, deactivateKeepAwake() on unmount.

### Jordan coaching overlay
Position: bottom: 24 (static), zIndex: 200, direct child of SafeAreaView.
Shows immediately when coaching-feedback resolves. NOT deferred to rest end.
Auto-dismisses after 5 seconds. Timeout tracked via overlayDismissTimeout ref.
clearTimeout called before each new show to prevent stacking/flashing.
Condition: overlayNoteVisible && overlayNote (no isRestActive gate).

### Crash recovery draft
```ts
type WorkoutDraft = {
  planId: string;
  dayNumber: number;
  weekNumber: number;
  sets: LoggedSet[];
  savedAt: number;
};
const WORKOUT_DRAFT_KEY = 'hone_workout_draft';
```
Draft written after every set. Resume prompt shown only if planId + dayNumber match AND savedAt < 7 days.
Draft cleared on successful save. checkDraft() called after loadWorkoutData() resolves.

### Workout save — try/catch
handleSaveAndFinish wrapped in try/catch. Alert with Retry/Discard on failure.

### Exercise swap state
```ts
// ActiveWorkoutScreen state
exerciseSwaps: Record<string, string>          // exerciseId → swapped name
exerciseTargetWeightOverrides: Record<string, number>  // exerciseId → prefilled weight
exercisePyramidSetsOverrides: Record<string, { setNumber: number; weightLbs: number }[]>
```
All three passed to ExerciseCard as props. pyramidSetsOverride takes priority over targetWeightOverride for pyramid exercises in getDefaultInput().

---

## DASHBOARD (HomeScreen)

### Header
Greeting text only — no avatar circle. profileInitial and profileButton removed.

### Workout scheduling (FIXED — Build 23)
Count-forward from plans.start_date. currentSessionIndex = completedSessionCount.
Calendar-agnostic. If start_date is in future: shows "Coming Up" card, hides workout.

### Jordan card
cleanJordanMessage() applied to jordanWelcome and latestJordanNote before display.
stripEmDash() applied at final assignment.
planStartsOn check at TOP of displayedJordanTextRaw ternary.

### Quick stats
Volume shows '—' when weeklyVolume === 0.
Streak shows '—' when currentStreak === 0.
Volume uses Colors.accent, streak and sessions use Colors.textPrimary when non-zero.

### Workout done state
After completing workout: "Great work today." card + Jordan recovery note.
Next workout hidden until next scheduled day.

---

## PROGRESS CHARTS (screens/ProgressChartsScreen.tsx)

### All data scoped to active plan
workout_logs query uses .eq('plan_id', plan.id).
fetchPersonalRecords() accepts planId param.
Weekly volume muscle groups from EXERCISES library via normalizeExerciseName().
normalizeExerciseName() applied to Loop 2 (volume) ONLY — NOT Loop 1 (strengthMap).
strengthMap keys use raw exerciseName to match chip labels exactly.

### Personal Records
Medal emoji replaced with styled #1/#2/#3 text in gold/silver/bronze colors.
prRankGold: '#F59E0B', prRankSilver: '#A1A1AA', prRankBronze: '#C2783A'.

### Multiple active plans prevention
generate-plan pauses all other user plans on new plan creation.
All plan queries: .order('created_at', { ascending: false }).limit(1).maybeSingle().

---

## PLAN COMPLETE SCREEN (screens/PlanCompleteScreen.tsx)

### generate-final-review integration
- stripEmDash() applied to all jordanReview paragraphs at render
- Checkmarks in "What You Built": Ionicons name="checkmark", color=Colors.success,
  circle background rgba(34,197,94,0.12)
- Goal chip ("What's Next"): outline style with bgElevated background + dynamic border color
- "Go to Dashboard" secondary CTA: Colors.textSecondary plain text link

---

## REVENUECAT / SUBSCRIPTIONS

**SDK key:** `EXPO_PUBLIC_REVENUECAT_IOS_KEY` in .env
**Purchases.configure()** in App.tsx (skips when BETA_BYPASS or web)
**Project:** Hone | **Bundle:** com.gethone.app | **P8 key:** uploaded

### Products (App Store Connect)
| ID | Price | Trial |
|---|---|---|
| com.hone.pro.annual | $99.99/yr | 7-day |
| com.hone.pro.quarterly | $34.99/3mo | 7-day |
| com.hone.pro.monthly.v2 | $14.99/mo | 7-day |

**CRITICAL:** `com.hone.pro.monthly` permanently deleted — never reuse this ID.
Quarterly uses custom identifier `'quarterly'` not `$rc_three_month`.

### useEntitlement hook
```ts
{ isPro, status: 'loading'|'trial'|'paid'|'free', loading, trialEndsAt }
```

### Paywall placement
PricingScreen placed AFTER MacroSetup (user invested before seeing price).
Feature bullets (5): outcome-focused, Jordan-voiced.
BETA_BYPASS skips purchase entirely.

---

## BUILD 26 — COMPLETED THIS SPRINT

### Progression Engine Overhaul ✅
- Pyramid top set detection: uses MAX weight, not average (warmup sets excluded)
- Pyramid RPE: top set RPE only, not average across all sets
- Equipment rounding: ALL equipment rounds to nearest 5 lbs (barbell loadable math)
- Pyramid setTargets scaling: proportional ratios preserved week over week
- RPE threshold: gap >= 0 always progresses (minimum 5 lbs) — hitting target = progress
- Minimum increments: compound-tier aware (isolation capped at 10 lbs max jump)
- Calibration fix: isCalibrationWeek = completedWeekNumber === 1 ONLY
- setTargets preserved when top set holds (no intermediate set regression)
- All equipment rounds to 5 lbs (cable/machine no longer produces 127.5 lbs)

### Swap System Overhaul ✅
- previousSets matched by exercise NAME (exact), not by slot ID
- After swap: "Last Week" strip hidden (empty previousSets) ✅
- After swap-back: correct exercise history shown ✅
- Trend arrow suppressed on swap weeks ✅
- Jordan coaching-feedback: ratio > 3× treated as swap, no "logging error" ✅
- Weight prefill on swap: fetchLastLoggedWeightForExercise (exact match, all weeks) ✅
- Pyramid prefill on swap-back: fetchLastLoggedSetsForExercise returns per-set weights ✅
- inputValues cleared when targetWeightOverride changes (any value, not just 0) ✅
- pyramidSetsOverride flows through ActiveWorkoutScreen → ExerciseCard as prop ✅
- persistExerciseSwapsToPlan updates equipment + compoundTier from EXERCISES library ✅
- generate-next-week: wasSwapped re-derives equipment from name (prevents stale barbell on dumbbell) ✅
- generate-next-week: originalName cleared after swap week processed ✅

### Other Build 26 ✅
- Subscription / RevenueCat fully wired
- PricingScreen mid-onboarding (after MacroSetup)
- Week 2 lock → SubscriptionManagementScreen
- Notification copy revamp (Jordan-voiced)
- UTC timezone fix (getLocalDateString())
- Consistency grid fix (Sunday clipping, column alignment)
- PR detection fix (weight-first, not Epley)
- Progressive Overload stat card (↑ N exercises)
- Metric height/units support
- Account deletion flow ✅
- Push notifications permission flow ✅

---

## PRE-LAUNCH CHECKLIST

- [x] Account deletion flow (Apple — P0) ✅
- [x] Push notifications permission flow (Apple — P0) ✅
- [x] App Store products (monthly/quarterly/annual with 7-day trials) ✅
- [x] RevenueCat rename to Hone ✅
- [x] RevenueCat iOS app + products + entitlement + offering configured ✅
- [x] Purchases.configure() wired in App.tsx ✅
- [ ] **EXTENDED SWAP TESTING** — see swap test matrix below ⚠️
- [ ] **EXTENDED GENERATE-NEXT-WEEK TESTING** — see progression test matrix below ⚠️
- [ ] Google Play products + RevenueCat Android app (when ready for Android)
- [ ] BETA_BYPASS = false in constants/betaBypass.ts (single flip)
- [ ] Mac App Store checkbox uncheck in App Store Connect
- [ ] Rate App gate: completedWeeks >= 1
- [ ] Apply for Apple Small Business Program (15% fee from day 1)
- [ ] Sandbox purchase flow test on physical device
- [ ] DC-1: Post-deload weight regression fix (generate-next-week)
- [ ] DC-2: Deload RPE misinterpretation in weekly summary
- [ ] Final 5-profile simulation regression check before submission

### ⚠️ Swap Test Matrix (complete before launch)
- [ ] Straight set → straight set swap (same equipment)
- [ ] Straight set → straight set swap (different equipment, e.g. barbell → dumbbell)
- [ ] Pyramid → pyramid swap (same equipment)
- [ ] Pyramid → pyramid swap (different equipment)
- [ ] Swap on W1 (self-select week)
- [ ] Swap on W2+ (prescribed weight week)
- [ ] Swap back to original exercise (W3 barbell → dumbbell → barbell)
- [ ] Multi-hop swap (A → B → C, never A again)
- [ ] Swap on volume day vs heavy day
- [ ] Swap + deload week (W4)
- [ ] Swap with no prior history (new exercise, prefilledWeight = 0)
- [ ] generate-next-week after swap: correct baseline, no anomaly message
- [ ] generate-next-week after swap-back: progresses from correct prior exercise

### ⚠️ Progression Test Matrix (complete before launch)
- [ ] W1 → W2 calibration (self-select goals): no increment, logged weight as baseline
- [ ] W1 → W2 straight sets: RPE gap calculates correctly, min increment applies
- [ ] W1 → W2 pyramid: top set used, intermediate sets scale proportionally
- [ ] On-target RPE (gap = 0): still increments by minimum 5 lbs
- [ ] Slightly hard RPE (gap = -0.5): holds weight
- [ ] Too hard RPE (gap = -1.5): decreases weight
- [ ] Isolation exercise gap >= 2: caps at 10 lbs max jump
- [ ] Barbell weight always multiple of 5 (never 192.5, 227.5 etc)
- [ ] Deload week: ×0.85 load, sets -1
- [ ] Post-deload W5: progresses from pre-deload weights not deload weights (DC-1)
- [ ] Strength goal periodization: W1 5×5, W2 4×4, W3 3×3, W4 deload
- [ ] setTargets hold when top set holds (no intermediate set regression)
- [ ] setTargets scale when top set increases (proportional ratios)

### Abuse Prevention — Test on Physical Device (BETA_BYPASS must = false)
- [ ] Device fingerprint stored after fresh onboarding
- [ ] Fingerprint stability across force-close/reopen
- [ ] Preview doesn't increment counter
- [ ] One free full plan gate
- [ ] Device fingerprint blocks second account
- [ ] Reinstall abuse blocked
- [ ] Email cooldown
- [ ] Pro bypasses all limits
- [ ] Lite preview cost (~1,500 output tokens vs ~4,000 full)

---

## API COST ANALYSIS

Full analysis script: `/home/claude/cost-analysis.mjs` (run anytime to recalculate)

### Cost per user (10 week engagement, all Sonnet 4.6)
| Function | Cost/call | Lifetime calls | Total |
|---|---|---|---|
| generate-plan | $0.084 | 1.2x | $0.10 |
| generate-next-week | $0.060 | 10x | $0.60 |
| generate-weekly-summary | $0.021 | 10x | $0.21 |
| generate-meals | $0.017 | 10x | $0.17 |
| adjust-macros | $0.010 | 3.2x | $0.03 |
| analyze-progress-photo | $0.017 | 2.5x | $0.04 |
| **TOTAL** | | | **$1.15** |

### Gross margins
- Monthly sub ($14.99 × 2.5 months avg): **96.1% margin**
- Annual sub ($99.99): **98.6% margin**

### Monthly API cost at scale
| Active users | Monthly Claude cost |
|---|---|
| 1,000 | $418 |
| 10,000 | $4,181 |
| 50,000 | $20,904 |

### Free tier abuse mitigation (3 layers — build before launch)
- **Layer A**: Lite preview plan during onboarding (~$0.02 vs $0.08), full plan after subscription
- **Layer B**: Rate limit by email (30-day cooldown on full plans for non-subscribers) + device fingerprint (expo-device) to block account cycling
- **Layer D**: One full plan generation token per free user (counter on user_profiles.full_plan_generations_used)
- All layers bypassed when BETA_BYPASS = true
- RATE_LIMIT_ENABLED = !BETA_BYPASS (flip simultaneously at launch)

---

## RULES FOR THIS PROJECT

- React Native + Expo only, TypeScript everywhere
- All DB calls through Lib/supabase.ts
- All Claude calls through Edge Functions only — never from client
- No hardcoded hex, no em-dashes, no emojis as icons
- "Hone" capital H in-app — matches the logo mark. Never "hone" lowercase.
- Jordan never called "AI"
- Never show a dead-end screen
- Register every new screen in navigation/index.tsx AND navigation/types.ts
- planId always from fresh Supabase query, never from route.params

---

## DO NOT CHANGE

The filename — it must remain `CLAUDE_CONTEXT.md`
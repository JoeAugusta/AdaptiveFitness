# Adaptive Fitness Coach — Product Requirements Document
Version: 1.1 | Phase 1 Complete | Last updated: March 2026

## 1. Product Overview

### Vision
Replace the need for an online fitness coach. Most workout apps give 
you a static plan and leave you to execute it alone. This app acts as 
a real coach — one that listens, adapts, and pushes you based on how 
you actually perform week over week.

### Core Value Proposition
- Generates a personalized plan based on deep input about goals and constraints
- Adapts sets, reps, and weight weekly based on actual performance
- Provides real-time coaching feedback, not just a plan generator
- Includes a comprehensive macro/nutrition plan aligned to physique goals

## 2. Tech Stack
- Mobile: React Native + Expo
- Backend/Database: Supabase (PostgreSQL, Auth, Storage)
- Subscriptions: RevenueCat
- AI Engine: Anthropic Claude API
- State: Zustand
- Charts: Victory Native or Gifted Charts
- IDE: Cursor + Claude Sonnet

## 3. Onboarding Flow (v1.1 — as built)

### Steps
1. Splash screen
2. Goal selection
3. Goal details (branches by goal type)
4. Experience, schedule & training split
5. Constraints, injuries & equipment
6. Body metrics (imperial: ft/in, lbs)
7. Macro setup with live recalculation
8. Plan preview + paywall (RevenueCat mocked)
9. Building plan loading screen

### Goal Types & Goal-Specific Inputs
| Goal | Label | Goal-Specific Inputs |
|---|---|---|
| strength | Strength Focus | Target lift, current 1RM, target 1RM, secondary lift (optional), plan duration |
| hypertrophy | Hypertrophy | Priority muscles (max 3), plan duration |
| recomp | Body Recomposition | Recomp focus (fat loss vs muscle gain), plan duration |
| fat_loss | Fat Loss | Starting weight, target weight, timeline/plan duration |
| general | General Fitness | Motivation focus, plan duration |

### Profile Inputs Collected
- Training age (beginner / intermediate / advanced)
- Training split (PPL / Upper/Lower / Full Body / Bro Split / Custom)
- Days per week (3–6)
- Session duration (30–45 / 45–60 / 60–90 / 90+ mins)
- Equipment (full_gym / home_gym / dumbbells / bodyweight)
- Current injuries (shoulder / lower_back / knee / hip / wrist / elbow)
- Excluded exercises (from injury auto-exclusion + manual)
- Weak points / lagging areas
- Age, sex, height (ft/in), weight (lbs), body fat % (optional)
- Calculated macros: calories, protein, carbs, fats

### Macro Calculation Logic
1. Convert imperial to metric
2. BMR via Mifflin-St Jeor formula
3. TDEE = BMR × activity multiplier (based on training days)
4. Calorie target adjusted by goal (+300 hypertrophy, -400 fat loss, etc.)
5. Protein = weightLbs × 1.0g, Fats = 25% of calories, Carbs = remainder

## 4. Plan Generation Engine

### How Plans Are Generated
Structured prompt to Claude API. Full user profile serialized as JSON 
and passed as context. Model returns structured weekly plan with 
exercises, sets, reps, rest periods, RPE targets.

### Plan Structure
- Duration: user-selected (4–24 weeks depending on goal)
- Phases: accumulation, intensification, deload
- Each workout: exercise name, sets, reps, target weight, rest, RPE, notes
- Progression: linear, double progression, or undulating

### Full Params Chain (available at plan generation)
```typescript
{
  // Goal
  goal: string;
  targetLift?: string;
  current1RM?: string;
  target1RM?: string;
  secondaryLift?: string;
  planDuration?: string;
  priorityMuscles?: string[];
  targetWeightLbs?: string;
  startingWeightLbs?: string;
  targetDate?: string;
  recompFocus?: string;
  generalFocus?: string;
  targetBodyFatPct?: string;
  recommendedWeeks?: string;
  
  // Experience
  experience: string;
  daysPerWeek: string;
  sessionLength: string;
  split: string;
  
  // Constraints
  equipment: string;
  weakPoints: string[];
  excludedExercises: string[];
  injuries: string[];
  
  // Body metrics
  sex: string;
  age: string;
  heightFt: string;
  heightIn: string;
  weightLbs: string;
  bodyFatPct: string | null;
  
  // Macros
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
}
```

## 5. Adaptive Coaching Engine (Phase 2)

### Weekly Adaptation Logic
After each logged week, evaluates:
- Reps achieved vs prescribed
- Weight used vs prescribed
- RPE logged vs target
- Session completion rate
- User fatigue rating

Outputs:
- Weight increase/hold/decrease per exercise
- Rep range adjustment
- Volume adjustment
- Exercise swap on consistent underperformance
- Deload trigger on high fatigue signals

### Real-Time Coaching Feedback
After each logged set, brief coaching note via Claude API:
- PR reinforcement
- Form reminders on high-RPE compound lifts
- Pacing guidance mid-workout
- Recovery nudges

## 6. Screen Inventory

| ID | Screen | Phase | Status |
|---|---|---|---|
| S01 | Splash | Phase 1 | ✅ Complete |
| S02 | Goal Selection | Phase 1 | ✅ Complete |
| S02b | Goal Details | Phase 1 | ✅ Complete |
| S03 | Experience & Schedule | Phase 1 | ✅ Complete |
| S04 | Constraints & Equipment | Phase 1 | ✅ Complete |
| S05 | Body Metrics | Phase 1 | ✅ Complete |
| S06 | Macro Setup | Phase 1 | ✅ Complete |
| S07 | Plan Preview + Paywall | Phase 1 | ✅ Complete |
| S07b | Building Plan (Loading) | Phase 1 | ✅ Complete |
| S08 | Home Dashboard | Phase 1 | 🔲 Next |
| S09 | Active Workout | Phase 1 | 🔲 Pending |
| S10 | Workout Complete | Phase 1 | 🔲 Pending |
| S11 | Plan View | Phase 1 | 🔲 Pending |
| S12 | Exercise Library | Phase 2 | 🔲 Pending |
| S13 | Progress Charts | Phase 2 | 🔲 Pending |
| S14 | Goal Tracker | Phase 2 | 🔲 Pending |
| S15 | Weekly Coach Summary | Phase 2 | 🔲 Pending |
| S16 | Macro Tracker | Phase 2 | 🔲 Pending |
| S17 | Profile & Settings | Phase 2 | 🔲 Pending |
| S18 | Subscription Management | Phase 2 | 🔲 Pending |

## 7. Subscription Model
| Tier | Price | Includes |
|---|---|---|
| Free | $0 | Onboarding + 1 plan (no adaptation) |
| Pro Monthly | $14.99/mo | Full adaptive coaching, macros, analytics |
| Pro Annual | $99.99/yr | Same as Pro Monthly (~$8.33/mo) |

RevenueCat manages all IAP. Never implement custom receipt validation.
Status: Mocked in S07. Wiring is next task.

## 8. Data Models (Supabase)

### users
- id (UUID), email, created_at, subscription_status, subscription_tier

### user_profiles  
- user_id, training_age, days_per_week, session_duration_mins,
  preferred_split, equipment, excluded_exercises, weak_points,
  injuries, age, sex, height_ft, height_in, weight_lbs, body_fat_pct

### goals
- id, user_id, goal_type, target_lift, secondary_lift, current_1rm,
  target_1rm, plan_duration_weeks, recomp_focus, general_focus,
  status, created_at, target_date

### plans
- id, user_id, goal_id, title, current_week, total_weeks,
  status, plan_json (jsonb), created_at

### workout_logs
- id, user_id, plan_id, week_number, day_number, logged_at,
  session_fatigue_rating, notes, sets_json (jsonb)

### macro_plans
- id, user_id, goal_id, calories_target, protein_g, carbs_g,
  fats_g, notes, created_at

## 9. Build Phases

### Phase 1 — Foundation (Current)
Auth, onboarding, plan generation, basic workout logging,
RevenueCat paywall.

### Phase 2 — Core Loop
Adaptive coaching engine, real-time set feedback, weekly summary,
progress charts, macro tracker.

### Phase 3 — Engagement
Push notifications, goal milestones, consistency streaks,
coach personality improvements.

### Phase 4 — Integrations
Apple Health / Google Fit, wearable heart rate data.

## 10. Out of Scope (v1.0)
- Social features
- In-app hosted video demos
- Human coach chat
- Cardio/running plans
- Wearable integration (Phase 4)
- Web app
- Tablet optimised layouts
- Metric units (deferred)

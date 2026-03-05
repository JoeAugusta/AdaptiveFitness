## PROJECT CONTEXT
App: Adaptive Fitness Coach — iOS/Android subscription SaaS
Stack: React Native + Expo, Supabase, RevenueCat, Claude API, Zustand
Supabase tables: user_profiles, goals, plans, workout_logs, macro_plans
Config files: lib/supabase.ts, lib/revenuecat.ts

## COMPLETED SCREENS
- S01 Splash ✅
- S02 Goal Selection ✅
- S02b Goal Details (branching by goal type) ✅
- S03 Experience & Schedule ✅
- S04 Constraints & Equipment ✅
- S05 Body Metrics ✅
- S06 Macro Setup ✅
- S07 Plan Preview + Paywall ✅ (RevenueCat mocked)

## CURRENT PHASE
Phase 1 — Foundation
Next task: Wire RevenueCat, then build S08 Home Dashboard

## NAVIGATION STACK (navigation/index.tsx)
Splash → Onboarding → GoalDetails → Experience → 
Constraints → BodyMetrics → MacroSetup → PlanPreview → 
Dashboard (not yet built)

## PARAMS CHAIN
By S07 the following params are available for Claude API plan generation:
- goal, targetLift, current1RM, target1RM, recommendedWeeks (optional)
- priorityMuscles (optional), targetWeightLbs, targetDate (optional)
- targetBodyFatPct (optional)
- experience, daysPerWeek, sessionLength, split
- equipment, weakPoints[], excludedExercises[], injuries[]
- sex, age, heightFt, heightIn, weightLbs, bodyFatPct
- calories, proteinG, carbsG, fatsG

## RULES FOR THIS PROJECT
- React Native + Expo only, no bare React Native
- TypeScript everywhere, no JavaScript files
- All database calls go through lib/supabase.ts
- Never hardcode API keys
- Keep components in /components folder
- Keep screens in /screens folder
- Register every new screen in navigation/index.tsx

## HOW WE WORK
- Claude writes Cursor prompts, developer pastes into Cursor
- Never write code directly — Claude output is always a Cursor prompt
- Reference ExperienceScreen.tsx for UI patterns and color variables
- Claude labels every prompt with Sonnet 4.6 or Opus 4.6

## GIT RULES
- Commit and push after every completed screen
- Branch naming: feature/S[number]-[screen-name]
- Merge to main only when screen is confirmed working

## COLOR VARIABLES (from ExperienceScreen.tsx)
const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const CARD_SELECTED_BG = 'rgba(59,130,246,0.12)';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const DISABLED_BG = '#334155';

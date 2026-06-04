-- Nutrition target weight for meal coaching context
ALTER TABLE macro_plans
  ADD COLUMN IF NOT EXISTS target_weight_lbs numeric;

COMMENT ON COLUMN macro_plans.target_weight_lbs IS
  'User goal body weight (lbs) from onboarding; used for deficit/surplus meal coaching';

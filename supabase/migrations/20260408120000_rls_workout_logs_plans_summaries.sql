-- Allow authenticated users to read their own workout_logs (INSERT often already allowed).
-- Apply in Supabase SQL Editor or via: supabase db push
--
-- If a table did not have RLS enabled yet, enable it only after you have policies for
-- every operation the app needs (SELECT/INSERT/UPDATE) on that table.

ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own workout logs" ON workout_logs;
CREATE POLICY "Users can view own workout logs"
  ON workout_logs
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own workout logs" ON workout_logs;
CREATE POLICY "Users can insert own workout logs"
  ON workout_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- plans / weekly_summaries: add SELECT for own rows when RLS is already enabled.
-- (Do not ENABLE RLS here — your project may already rely on existing policies.)

DROP POLICY IF EXISTS "Users can view own plans" ON plans;
CREATE POLICY "Users can view own plans"
  ON plans
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own weekly summaries" ON weekly_summaries;
CREATE POLICY "Users can view own weekly summaries"
  ON weekly_summaries
  FOR SELECT
  USING (auth.uid() = user_id);

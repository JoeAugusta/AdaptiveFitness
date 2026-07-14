-- Personal records computed on write from workout_logs / free_sessions sets_json blobs.
-- Exercise identity is resolved client-side (exercise_key); no exercises catalog table.

-- Remove superseded draft tables if an earlier migration was applied to dev.
DROP TABLE IF EXISTS logged_sets CASCADE;
DROP TABLE IF EXISTS exercises CASCADE;
DROP TABLE IF EXISTS exercise_records CASCADE;

CREATE TABLE exercise_records (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  best_e1rm NUMERIC NOT NULL,
  best_load NUMERIC NOT NULL,
  best_reps INT NOT NULL,
  best_rpe NUMERIC NULL,
  -- Parent row id: workout_logs.id or free_sessions.id (no FK — either source).
  best_workout_log_id UUID NOT NULL,
  best_set_number INT NOT NULL,
  best_source TEXT NOT NULL CHECK (best_source IN ('workout', 'free_session')),
  best_date DATE NOT NULL,
  baseline_e1rm NUMERIC NOT NULL,
  baseline_date DATE NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exercise_key)
);

CREATE INDEX exercise_records_user_idx
  ON exercise_records (user_id);

ALTER TABLE exercise_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own exercise records" ON exercise_records;
DROP POLICY IF EXISTS "Users can view own exercise records" ON exercise_records;
DROP POLICY IF EXISTS "Users can insert own exercise records" ON exercise_records;
DROP POLICY IF EXISTS "Users can update own exercise records" ON exercise_records;
DROP POLICY IF EXISTS "Users can delete own exercise records" ON exercise_records;

CREATE POLICY "Users can view own exercise records"
  ON exercise_records
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own exercise records"
  ON exercise_records
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own exercise records"
  ON exercise_records
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own exercise records"
  ON exercise_records
  FOR DELETE
  USING (auth.uid() = user_id);

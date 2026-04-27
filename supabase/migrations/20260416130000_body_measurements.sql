-- Body measurements (inches). Run in Supabase before app uses this table.
CREATE TABLE IF NOT EXISTS body_measurements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measured_at DATE NOT NULL,
  waist_in    DOUBLE PRECISION,
  chest_in    DOUBLE PRECISION,
  hips_in     DOUBLE PRECISION,
  left_arm_in DOUBLE PRECISION,
  right_arm_in DOUBLE PRECISION,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own measurements"
  ON body_measurements FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

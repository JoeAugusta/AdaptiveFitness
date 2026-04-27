CREATE TABLE IF NOT EXISTS sport_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  logged_at DATE NOT NULL,
  sport_type TEXT NOT NULL,
  duration_min INTEGER NOT NULL CHECK (duration_min > 0),
  intensity TEXT NOT NULL CHECK (intensity IN ('low', 'moderate', 'high')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (user_id, plan_id, logged_at)
);

ALTER TABLE sport_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sport logs"
  ON sport_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

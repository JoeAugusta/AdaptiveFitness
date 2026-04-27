CREATE TABLE IF NOT EXISTS cardio_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  day_number INTEGER NOT NULL,
  cardio_type TEXT NOT NULL CHECK (cardio_type IN ('light', 'medium')),
  duration_minutes INTEGER NOT NULL,
  logged_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE cardio_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own cardio logs"
  ON cardio_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

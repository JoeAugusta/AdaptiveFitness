CREATE TABLE IF NOT EXISTS free_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  logged_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  session_name TEXT NOT NULL DEFAULT 'Free Session',
  sets_json JSONB NOT NULL DEFAULT '[]',
  session_fatigue_rating INTEGER CHECK (session_fatigue_rating BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE free_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own free sessions"
  ON free_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

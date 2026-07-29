CREATE TABLE IF NOT EXISTS ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  function_name TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_id_created_at
  ON ai_usage_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_function_name_created_at
  ON ai_usage_events (function_name, created_at DESC);

ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;

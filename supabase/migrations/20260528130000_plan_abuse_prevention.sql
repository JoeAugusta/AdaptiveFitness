-- Layer A: preview plans
ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT false;

-- Layer B: device fingerprint on profile
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;

-- Layer D: one free full plan generation per non-Pro user
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS full_plan_generations_used INTEGER DEFAULT 0;

-- Layer B: rate limit monitoring
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  device_id TEXT,
  event_type TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_created_at ON rate_limit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_profiles_device_id ON user_profiles (device_id) WHERE device_id IS NOT NULL;

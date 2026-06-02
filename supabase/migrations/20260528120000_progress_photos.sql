-- Monthly progress photo check-in (Pro). Run in Supabase SQL editor if not applied via CLI.

CREATE TABLE IF NOT EXISTS progress_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  week_number INTEGER,
  photo_url_front TEXT,
  photo_url_side TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  analyzed_at TIMESTAMPTZ,
  estimated_bf_pct FLOAT,
  estimated_bf_range TEXT,
  lean_mass_lbs FLOAT,
  analysis_json JSONB,
  macro_adjusted BOOLEAN DEFAULT false
);

ALTER TABLE progress_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own photos" ON progress_photos;
CREATE POLICY "Users manage own photos"
  ON progress_photos FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS last_photo_analysis_at TIMESTAMPTZ;

-- Storage bucket + RLS: create bucket "progress-photos" in dashboard (private, 10MB, jpeg/png/heic).
-- Storage policy (storage.objects):
-- CREATE POLICY "Users manage own photos"
--   ON storage.objects FOR ALL
--   USING (bucket_id = 'progress-photos'
--     AND auth.uid()::text = (storage.foldername(name))[1]);

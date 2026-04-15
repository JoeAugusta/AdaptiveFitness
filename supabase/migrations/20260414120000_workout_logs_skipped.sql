ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS skipped boolean DEFAULT false;

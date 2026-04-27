-- Leg circumferences (inches). Safe if columns already exist.
ALTER TABLE body_measurements
  ADD COLUMN IF NOT EXISTS left_thigh_in DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS right_thigh_in DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS left_calf_in DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS right_calf_in DOUBLE PRECISION;

-- One-off maintenance: inspect and dedupe plan_json.weeks for active plans.
-- Run in Supabase SQL Editor (review results before UPDATE).

-- Inspect
SELECT id, current_week,
  jsonb_array_length(plan_json->'weeks') AS week_count
FROM plans
WHERE status = 'active';

-- Deduplicate: one row per (weekNumber), keeps first row per weekNumber
-- (ORDER BY weekNumber, week — adjust if you need "last wins" instead)
UPDATE plans
SET plan_json = jsonb_set(
  plan_json,
  '{weeks}',
  (
    SELECT jsonb_agg(week ORDER BY (week->>'weekNumber')::int)
    FROM (
      SELECT DISTINCT ON ((week->>'weekNumber')::int) week
      FROM jsonb_array_elements(plan_json->'weeks') AS week
      ORDER BY (week->>'weekNumber')::int, week
    ) deduped
  )
)
WHERE status = 'active';

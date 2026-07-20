create table if not exists public.health_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_date date not null,
  hrv_ms integer,
  resting_hr integer,
  sleep_hours numeric(3,1),
  source text,
  synced_at timestamptz not null default now(),
  unique (user_id, metric_date)
);

alter table public.health_daily_metrics enable row level security;

create policy "own health metrics select" on public.health_daily_metrics
  for select using (auth.uid() = user_id);
create policy "own health metrics insert" on public.health_daily_metrics
  for insert with check (auth.uid() = user_id);
create policy "own health metrics update" on public.health_daily_metrics
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_health_daily_metrics_user_date
  on public.health_daily_metrics (user_id, metric_date desc);

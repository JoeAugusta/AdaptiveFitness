-- Subscription status columns read by generate-plan.isUserPro.
-- Added live via SQL editor on 2026-07-22; captured here for reproducibility.
alter table public.user_profiles
  add column if not exists subscription_status text not null default 'free',
  add column if not exists subscription_tier   text;

create index if not exists idx_user_profiles_subscription_status
  on public.user_profiles (subscription_status);
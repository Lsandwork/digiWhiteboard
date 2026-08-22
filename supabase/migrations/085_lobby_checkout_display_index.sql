-- Lobby checkout polls filter hidden = false AND display_status = checking_out,
-- then order newest-first under a row limit. Narrow the partial index so Postgres
-- can satisfy that path without scanning every active transition row.
--
-- If the Supabase SQL editor times out, use scripts/apply-lobby-checkout-index.sql
-- with a direct psql connection (port 5432) and CREATE INDEX CONCURRENTLY.

create index if not exists live_transition_dogs_active_checkout_started_idx
  on public.live_transition_dogs (status_started_at desc)
  where hidden = false and display_status = 'checking_out';

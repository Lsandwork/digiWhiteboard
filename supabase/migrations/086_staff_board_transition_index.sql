-- Staff board fast poll filters hidden = false AND display_status IN
-- (checking_in, checking_out), then orders newest-first under a row limit.
-- 064's active_started_idx is hidden = false only; this matches the staff
-- query so a just-added basket dog is not waiting on a sequential scan.
--
-- If the Supabase SQL editor times out, use scripts/apply-staff-board-transition-index.sql
-- with a direct psql connection (port 5432) and CREATE INDEX CONCURRENTLY.

create index if not exists live_transition_dogs_active_board_started_idx
  on public.live_transition_dogs (status_started_at desc)
  where hidden = false and display_status in ('checking_in', 'checking_out');

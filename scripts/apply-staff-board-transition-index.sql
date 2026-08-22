-- Manual apply for the staff board transition index (when the SQL editor times out).
--
-- 1. In Supabase Dashboard → Project Settings → Database, copy the
--    **Direct connection** URI (port 5432, NOT the pooler on 6543).
-- 2. Run this file with psql:
--      psql "$DATABASE_URL" -f scripts/apply-staff-board-transition-index.sql
-- 3. CREATE INDEX CONCURRENTLY cannot run inside a transaction block.

create index concurrently if not exists live_transition_dogs_active_board_started_idx
  on public.live_transition_dogs (status_started_at desc)
  where hidden = false and display_status in ('checking_in', 'checking_out');

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'live_transition_dogs'
  and indexname = 'live_transition_dogs_active_board_started_idx';

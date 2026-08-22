-- Manual apply for lobby checkout index (when the SQL editor times out).
--
-- 1. In Supabase Dashboard → Project Settings → Database, copy the
--    **Direct connection** URI (port 5432, NOT the pooler on 6543).
-- 2. Run this file with psql (allows multi-minute index builds):
--      psql "$DATABASE_URL" -f scripts/apply-lobby-checkout-index.sql
-- 3. CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
--    Run each statement separately if your client wraps files in BEGIN/COMMIT.

-- Step A — quick checks (should finish in seconds)
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'live_transition_dogs'
order by indexname;

select
  count(*) as total_rows,
  count(*) filter (where hidden = false) as active_rows,
  count(*) filter (where hidden = false and display_status = 'checking_out') as active_checkouts
from public.live_transition_dogs;

-- Step B — if this index already exists, you are done (skip Step C).
-- Migration 064 creates live_transition_dogs_active_started_idx (hidden = false only).
-- That index already helps lobby polls; 085 narrows it to checkout rows only.

-- Step C — build the lobby-specific partial index without blocking writes.
-- May take several minutes on a large table; do not use the pooler / SQL editor timeout.
create index concurrently if not exists live_transition_dogs_active_checkout_started_idx
  on public.live_transition_dogs (status_started_at desc)
  where hidden = false and display_status = 'checking_out';

-- Step D — confirm
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'live_transition_dogs'
  and indexname = 'live_transition_dogs_active_checkout_started_idx';

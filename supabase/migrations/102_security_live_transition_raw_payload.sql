-- Security: stop anon/authenticated REST from selecting live_transition_dogs.raw_payload.
--
-- The table keeps an intentional public SELECT policy for Realtime wake-ups on active
-- check-in/out rows. Application feeds already sanitize via toPublicRawPayload, and new
-- webhook writes store only that public schema. Column privileges block PostgREST
-- `select=*` from returning the historical raw_payload JSON to holders of the anon key.
--
-- Realtime WAL still delivers row images; write-time sanitization (app code) is the
-- primary control for that path. Full webhook bodies remain in gingr_webhook_events
-- (deny-all anon policy).
--
-- service_role / table owner retain full access. No data rewritten.
-- Reversible: supabase/rollbacks/102_security_live_transition_raw_payload.down.sql
-- Runtime impact: catalog privilege change only; brief ACCESS EXCLUSIVE on the table metadata.

set lock_timeout = '3s';

do $$
begin
  if to_regclass('public.live_transition_dogs') is null then
    raise notice 'skip missing table public.live_transition_dogs';
    return;
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'live_transition_dogs'
      and column_name = 'raw_payload'
  ) then
    execute 'revoke select (raw_payload) on public.live_transition_dogs from public, anon, authenticated';
  end if;
end
$$;

reset lock_timeout;

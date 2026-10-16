-- Shared, atomic admin login throttle (replaces per-instance in-memory counters).
--
-- Keys are HMAC hashes computed by the server (no raw IPs or emails stored).
-- Only the server (service_role) touches this table/function.
-- The app falls back to its in-memory limiter if this migration is not applied,
-- so login keeps working before/after deploy in either order.
--
-- Runtime impact: login only — one indexed read per attempt, one upsert per failed
-- attempt per key. No Gingr traffic. New objects only; no locks on existing tables.
-- Reversible: supabase/rollbacks/101_admin_login_throttle.down.sql

create table if not exists public.admin_login_throttle (
  key text primary key,
  failures integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists admin_login_throttle_updated_at_idx
  on public.admin_login_throttle (updated_at);

alter table public.admin_login_throttle enable row level security;
revoke all on table public.admin_login_throttle from public, anon, authenticated;
grant all on table public.admin_login_throttle to service_role;

-- Records one failed attempt for p_key and returns locked_until (null if not locked).
-- Reaching p_max inside the window locks for p_lock_seconds and resets the counter.
create or replace function public.admin_login_throttle_fail(
  p_key text,
  p_max integer,
  p_window_seconds integer,
  p_lock_seconds integer
) returns timestamptz
language plpgsql
set search_path = public
as $$
declare
  v_locked timestamptz;
begin
  insert into public.admin_login_throttle as t (key, failures, window_started_at, locked_until, updated_at)
  values (
    p_key,
    case when p_max <= 1 then 0 else 1 end,
    now(),
    case when p_max <= 1 then now() + make_interval(secs => p_lock_seconds) end,
    now()
  )
  on conflict (key) do update set
    failures = case
      when (case when t.window_started_at < now() - make_interval(secs => p_window_seconds) then 1 else t.failures + 1 end) >= p_max
        then 0
      when t.window_started_at < now() - make_interval(secs => p_window_seconds) then 1
      else t.failures + 1
    end,
    window_started_at = case
      when t.window_started_at < now() - make_interval(secs => p_window_seconds) then now()
      else t.window_started_at
    end,
    locked_until = case
      when (case when t.window_started_at < now() - make_interval(secs => p_window_seconds) then 1 else t.failures + 1 end) >= p_max
        then now() + make_interval(secs => p_lock_seconds)
      else t.locked_until
    end,
    updated_at = now()
  returning t.locked_until into v_locked;

  delete from public.admin_login_throttle where updated_at < now() - interval '2 days';

  return case when v_locked > now() then v_locked else null end;
end
$$;

revoke execute on function public.admin_login_throttle_fail(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_login_throttle_fail(text, integer, integer, integer) to service_role;

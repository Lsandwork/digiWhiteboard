-- Rollback 102: restore anon/authenticated ability to SELECT raw_payload
-- (table-level SELECT grant remains; only the column revoke is undone).

set lock_timeout = '3s';

do $$
begin
  if to_regclass('public.live_transition_dogs') is null then
    return;
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'live_transition_dogs'
      and column_name = 'raw_payload'
  ) then
    execute 'grant select (raw_payload) on public.live_transition_dogs to anon, authenticated';
  end if;
end
$$;

reset lock_timeout;

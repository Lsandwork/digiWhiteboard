-- Dedicated TL Digi Board snapshot store.
-- The public TV GET was hanging because it extracted JSON from the 7+ MiB
-- admin_settings.settings blob. A single-row table keeps reads under a second.

create table if not exists public.tl_digi_board_snapshots (
  id text primary key,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tl_digi_board_snapshots enable row level security;

drop policy if exists "No public tl_digi_board_snapshots access" on public.tl_digi_board_snapshots;
create policy "No public tl_digi_board_snapshots access"
  on public.tl_digi_board_snapshots for all using (false) with check (false);

revoke all on table public.tl_digi_board_snapshots from public;
grant select, insert, update, delete on table public.tl_digi_board_snapshots to service_role;

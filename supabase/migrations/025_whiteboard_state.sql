create table if not exists public.whiteboard_state (
  board_type text primary key check (board_type in ('staff_whiteboard', 'lobby_whiteboard')),
  version text not null,
  updated_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists whiteboard_state_updated_at_idx
  on public.whiteboard_state (updated_at desc);

alter table public.whiteboard_state enable row level security;

drop policy if exists "No public whiteboard_state access" on public.whiteboard_state;
create policy "No public whiteboard_state access"
  on public.whiteboard_state for all using (false);

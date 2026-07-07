-- Cast Keeper: display device registry and remote commands for TV / Chromecast displays

create table if not exists public.display_devices (
  id text primary key,
  name text,
  display_type text not null check (display_type in ('staff_whiteboard', 'lobby_whiteboard')),
  status text not null default 'online',
  last_seen_at timestamptz not null default now(),
  current_route text,
  app_version text,
  wake_lock_status text,
  last_heartbeat_at timestamptz,
  last_data_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists display_devices_type_seen_idx
  on public.display_devices (display_type, last_seen_at desc);

create table if not exists public.display_commands (
  id uuid primary key default gen_random_uuid(),
  display_type text not null check (display_type in ('staff_whiteboard', 'lobby_whiteboard')),
  device_id text references public.display_devices(id) on delete set null,
  command_type text not null check (
    command_type in ('hard_refresh', 'clear_notice', 'show_notice', 'show_video', 'switch_display')
  ),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists display_commands_pending_idx
  on public.display_commands (display_type, status, created_at asc)
  where status = 'pending';

alter table public.display_devices enable row level security;
alter table public.display_commands enable row level security;

drop policy if exists "No public display_devices access" on public.display_devices;
create policy "No public display_devices access"
  on public.display_devices for all using (false);

drop policy if exists "No public display_commands access" on public.display_commands;
create policy "No public display_commands access"
  on public.display_commands for all using (false);

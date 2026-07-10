-- Remote Whiteboard Cast: cloud-controlled digital signage receivers.
-- A TV/mini-PC opens /cast/receiver; admins control it from anywhere over the
-- public internet through these tables (service role only — never exposed to the
-- browser directly).

create table if not exists public.remote_cast_receivers (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  pairing_code text unique,
  pairing_code_expires_at timestamptz,
  receiver_token_hash text not null,
  status text not null default 'offline' check (status in ('online', 'offline', 'reconnecting', 'error')),
  active_screen text not null default 'standby' check (active_screen in ('standby', 'lobby', 'staff', 'blackout')),
  last_command text,
  refresh_nonce integer not null default 0,
  last_seen_at timestamptz,
  paired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists remote_cast_receivers_token_idx
  on public.remote_cast_receivers (receiver_token_hash);
create index if not exists remote_cast_receivers_pairing_idx
  on public.remote_cast_receivers (pairing_code);
create index if not exists remote_cast_receivers_last_seen_idx
  on public.remote_cast_receivers (last_seen_at desc);

create table if not exists public.remote_cast_commands (
  id uuid primary key default gen_random_uuid(),
  receiver_id uuid not null references public.remote_cast_receivers(id) on delete cascade,
  command text not null check (command in ('CAST_LOBBY', 'CAST_STAFF', 'REFRESH', 'BLACKOUT', 'WAKE', 'STANDBY', 'RENAME_DISPLAY')),
  screen text,
  payload jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'executed', 'expired'))
);

create index if not exists remote_cast_commands_receiver_idx
  on public.remote_cast_commands (receiver_id, created_at desc);

alter table public.remote_cast_receivers enable row level security;
alter table public.remote_cast_commands enable row level security;

drop policy if exists "No public remote_cast_receivers access" on public.remote_cast_receivers;
create policy "No public remote_cast_receivers access"
  on public.remote_cast_receivers for all using (false);

drop policy if exists "No public remote_cast_commands access" on public.remote_cast_commands;
create policy "No public remote_cast_commands access"
  on public.remote_cast_commands for all using (false);

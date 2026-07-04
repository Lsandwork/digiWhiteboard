-- Admin board configuration extensions (non-destructive)

alter table public.lobby_settings
  add column if not exists class_schedule jsonb,
  add column if not exists published_version text not null default 'v1.0.0',
  add column if not exists published_at timestamptz,
  add column if not exists published_by text;

create table if not exists public.staff_board_settings (
  id text primary key default 'default',
  refresh_interval_ms integer not null default 2000,
  team_reminder text,
  important_notice text,
  show_team_reminders boolean not null default true,
  footer_message text,
  published_version text not null default 'v1.0.0',
  published_at timestamptz,
  published_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_publish_log (
  id uuid primary key default gen_random_uuid(),
  board_type text not null check (board_type in ('lobby', 'staff')),
  version text not null,
  published_by text,
  published_at timestamptz not null default now()
);

insert into public.staff_board_settings (id)
  values ('default')
  on conflict (id) do nothing;

alter table public.staff_board_settings enable row level security;
alter table public.admin_publish_log enable row level security;

drop policy if exists "No public staff board settings access" on public.staff_board_settings;
create policy "No public staff board settings access"
  on public.staff_board_settings
  for all
  using (false);

drop policy if exists "No public admin publish log access" on public.admin_publish_log;
create policy "No public admin publish log access"
  on public.admin_publish_log
  for all
  using (false);

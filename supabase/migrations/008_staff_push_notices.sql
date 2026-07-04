-- Staff Push Notices (non-destructive)

create table if not exists public.staff_push_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text,
  priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  display_mode text not null default 'normal' check (display_mode in ('normal', 'urgent')),
  is_active boolean not null default false,
  is_default boolean not null default false,
  created_by text,
  updated_by text,
  pushed_at timestamptz,
  expires_at timestamptz,
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_push_notices_active_idx
  on public.staff_push_notices (is_active, pushed_at desc, created_at desc);

create index if not exists staff_push_notices_history_idx
  on public.staff_push_notices (created_at desc);

drop trigger if exists set_staff_push_notices_updated_at on public.staff_push_notices;
create trigger set_staff_push_notices_updated_at
  before update on public.staff_push_notices
  for each row
  execute function public.set_updated_at();

alter table public.staff_push_notices enable row level security;

drop policy if exists "No public staff push notices access" on public.staff_push_notices;
create policy "No public staff push notices access"
  on public.staff_push_notices
  for all
  using (false);

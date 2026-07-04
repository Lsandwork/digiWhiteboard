-- Staff Push Notices scheduling and active notice indexes (non-destructive)

do $$
begin
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
end $$;

alter table public.staff_push_notices
  add column if not exists schedule_enabled boolean not null default false,
  add column if not exists scheduled_at timestamptz,
  add column if not exists recurrence text not null default 'none',
  add column if not exists next_scheduled_at timestamptz;

do $$
begin
  alter table public.staff_push_notices
    drop constraint if exists staff_push_notices_recurrence_check;

  alter table public.staff_push_notices
    add constraint staff_push_notices_recurrence_check
    check (recurrence in ('none', 'day', 'week', 'month'));
end $$;

create index if not exists staff_push_notices_active_partial_idx
  on public.staff_push_notices (pushed_at desc, created_at desc)
  where is_active = true;

create index if not exists staff_push_notices_active_expiration_idx
  on public.staff_push_notices (expires_at)
  where is_active = true and expires_at is not null;

create index if not exists staff_push_notices_due_scheduled_idx
  on public.staff_push_notices (next_scheduled_at asc, scheduled_at asc)
  where schedule_enabled = true and is_active = false and cleared_at is null;

create index if not exists staff_push_notices_recent_history_idx
  on public.staff_push_notices (created_at desc, pushed_at desc);

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
  using (false)
  with check (false);

-- Walks Board: recurring hourly walk tracking for No Plays, Groomed, and Break Dogs

create table if not exists public.walk_board_entries (
  id uuid primary key default gen_random_uuid(),
  dog_name text not null check (char_length(trim(dog_name)) > 0 and char_length(dog_name) <= 80),
  dog_name_normalized text not null,
  walk_type text not null check (walk_type in ('no_plays', 'groomed', 'break_dog')),
  status text not null default 'active' check (status in ('active', 'cleared')),
  created_at timestamptz not null default now(),
  created_by uuid references public.admin_users(id) on delete set null,
  cycle_started_at timestamptz not null default now(),
  next_due_at timestamptz not null,
  last_walked_at timestamptz,
  last_walked_by uuid references public.admin_users(id) on delete set null,
  snooze_used boolean not null default false,
  snoozed_at timestamptz,
  snoozed_by uuid references public.admin_users(id) on delete set null,
  cleared_at timestamptz,
  cleared_by uuid references public.admin_users(id) on delete set null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.walk_board_activity (
  id uuid primary key default gen_random_uuid(),
  walk_entry_id uuid not null references public.walk_board_entries(id) on delete cascade,
  action text not null check (
    action in ('added', 'walk_due', 'reminder_sent', 'walked', 'snoozed', 'cleared')
  ),
  actor_user_id uuid references public.admin_users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  previous_due_at timestamptz,
  new_due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.walk_board_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  walk_entry_id uuid not null references public.walk_board_entries(id) on delete cascade,
  cycle_started_at timestamptz not null,
  due_at timestamptz not null,
  sent_at timestamptz not null default now(),
  unique (walk_entry_id, cycle_started_at, due_at)
);

create index if not exists walk_board_entries_active_idx
  on public.walk_board_entries (status, next_due_at)
  where status = 'active';

create index if not exists walk_board_entries_next_due_idx
  on public.walk_board_entries (next_due_at)
  where status = 'active';

create index if not exists walk_board_entries_type_idx
  on public.walk_board_entries (walk_type)
  where status = 'active';

create index if not exists walk_board_entries_normalized_idx
  on public.walk_board_entries (dog_name_normalized)
  where status = 'active';

create index if not exists walk_board_entries_created_at_idx
  on public.walk_board_entries (created_at desc);

create index if not exists walk_board_activity_entry_idx
  on public.walk_board_activity (walk_entry_id, occurred_at desc);

create index if not exists walk_board_reminder_sends_entry_idx
  on public.walk_board_reminder_sends (walk_entry_id, sent_at desc);

drop trigger if exists set_walk_board_entries_updated_at on public.walk_board_entries;
create trigger set_walk_board_entries_updated_at
  before update on public.walk_board_entries
  for each row execute function public.set_updated_at();

alter table public.walk_board_entries enable row level security;
alter table public.walk_board_activity enable row level security;
alter table public.walk_board_reminder_sends enable row level security;

drop policy if exists "No public walk board entries access" on public.walk_board_entries;
create policy "No public walk board entries access"
  on public.walk_board_entries for all using (false) with check (false);

drop policy if exists "No public walk board activity access" on public.walk_board_activity;
create policy "No public walk board activity access"
  on public.walk_board_activity for all using (false) with check (false);

drop policy if exists "No public walk board reminder sends access" on public.walk_board_reminder_sends;
create policy "No public walk board reminder sends access"
  on public.walk_board_reminder_sends for all using (false) with check (false);

do $$
begin
  alter publication supabase_realtime add table public.walk_board_entries;
exception
  when duplicate_object then null;
end $$;

insert into public.admin_permissions (key, label)
values ('receive_walks_board_reminders', 'Receive Walks Board Reminders')
on conflict (key) do nothing;

-- Walks Board alarm cycles: 2-hour physical whiteboard reminders (8am–7pm PT, 7 days)

create table if not exists public.walk_board_cycles (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null unique,
  shift_date date not null,
  scheduled_hour integer not null check (scheduled_hour in (8, 10, 12, 14, 16, 18)),
  status text not null default 'pending' check (status in ('pending', 'completed', 'missed')),
  due_at timestamptz not null,
  completed_at timestamptz,
  completed_by uuid references public.admin_users(id) on delete set null,
  missed_at timestamptz,
  push_notice_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists walk_board_cycles_date_idx
  on public.walk_board_cycles (shift_date desc, scheduled_hour asc);

create index if not exists walk_board_cycles_pending_idx
  on public.walk_board_cycles (status, due_at)
  where status = 'pending';

alter table public.walk_board_activity
  add column if not exists walk_cycle_id uuid references public.walk_board_cycles(id) on delete cascade;

alter table public.walk_board_activity
  drop constraint if exists walk_board_activity_action_check;

alter table public.walk_board_activity
  add constraint walk_board_activity_action_check
  check (action in ('added', 'walk_due', 'reminder_sent', 'walked', 'snoozed', 'cleared', 'alarm_due', 'completed', 'missed'));

alter table public.walk_board_activity
  alter column walk_entry_id drop not null;

create index if not exists walk_board_activity_cycle_idx
  on public.walk_board_activity (walk_cycle_id, occurred_at desc);

alter table public.walk_board_reminder_sends
  add column if not exists walk_cycle_id uuid references public.walk_board_cycles(id) on delete cascade;

alter table public.walk_board_reminder_sends
  add column if not exists slot_key text;

alter table public.walk_board_reminder_sends
  alter column walk_entry_id drop not null;

alter table public.walk_board_reminder_sends
  alter column cycle_started_at drop not null;

create unique index if not exists walk_board_reminder_sends_cycle_slot_idx
  on public.walk_board_reminder_sends (walk_cycle_id, slot_key)
  where walk_cycle_id is not null and slot_key is not null;

drop trigger if exists set_walk_board_cycles_updated_at on public.walk_board_cycles;
create trigger set_walk_board_cycles_updated_at
  before update on public.walk_board_cycles
  for each row execute function public.set_updated_at();

alter table public.walk_board_cycles enable row level security;

drop policy if exists "No public walk board cycles access" on public.walk_board_cycles;
create policy "No public walk board cycles access"
  on public.walk_board_cycles for all using (false) with check (false);

do $$
begin
  alter publication supabase_realtime add table public.walk_board_cycles;
exception
  when duplicate_object then null;
end $$;

-- Seed automatic staff-TV push alerts for the 2-hour walk check (8am–6pm, 7 days).
insert into public.daily_reminders (
  title,
  message,
  scheduled_time,
  audience,
  shift_group,
  priority,
  display_duration_seconds,
  active_days,
  requires_swing_handler,
  is_active,
  footer_text,
  internal_notes,
  sort_order
)
select
  seed.title,
  'Update the No Plays, Grooming, and Walks Board physical whiteboard (not digital). Check No Plays over during the walk. Take photos and upload them. This alarm cannot be snoozed — mark complete on Walks Board.',
  seed.scheduled_time::time,
  array['dog_handler','team_lead']::text[],
  'all_handler_shifts',
  'important',
  600,
  array['monday','tuesday','wednesday','thursday','friday','saturday','sunday']::text[],
  false,
  true,
  'This alarm cannot be snoozed. Mark complete after the physical board is updated.',
  'walks_board_alarm',
  seed.sort_order
from (
  values
    ('Physical Whiteboard Walk Check · 8:00 AM', '08:00:00', 200),
    ('Physical Whiteboard Walk Check · 10:00 AM', '10:00:00', 201),
    ('Physical Whiteboard Walk Check · 12:00 PM', '12:00:00', 202),
    ('Physical Whiteboard Walk Check · 2:00 PM', '14:00:00', 203),
    ('Physical Whiteboard Walk Check · 4:00 PM', '16:00:00', 204),
    ('Physical Whiteboard Walk Check · 6:00 PM', '18:00:00', 205)
) as seed(title, scheduled_time, sort_order)
where not exists (
  select 1 from public.daily_reminders existing
  where existing.internal_notes = 'walks_board_alarm'
    and existing.scheduled_time = seed.scheduled_time::time
);

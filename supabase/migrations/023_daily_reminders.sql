-- Daily Reminders for Staff Digital Whiteboard (scheduled handler reminders)

create table if not exists public.daily_reminders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  scheduled_time time not null,
  audience text[] not null default array['dog_handler', 'team_lead']::text[],
  shift_group text not null default 'am_handler',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'important')),
  display_duration_seconds integer not null default 120,
  active_days text[] not null default array['monday','tuesday','wednesday','thursday','friday','saturday','sunday']::text[],
  requires_swing_handler boolean not null default false,
  is_active boolean not null default true,
  footer_text text,
  internal_notes text,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  daily_reminder_id uuid not null references public.daily_reminders(id) on delete cascade,
  shift_date date not null,
  sent_at timestamptz not null default now(),
  sent_type text not null check (sent_type in ('automatic', 'early', 'force_resend')),
  sent_by_user_id text,
  sent_by_name text,
  push_notice_id text,
  skipped_reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_reminder_daily_state (
  id uuid primary key default gen_random_uuid(),
  daily_reminder_id uuid not null references public.daily_reminders(id) on delete cascade,
  shift_date date not null,
  status text not null default 'pending' check (
    status in ('pending', 'sent_automatic', 'sent_early', 'force_resend', 'queued', 'skipped', 'inactive')
  ),
  sent_at timestamptz,
  sent_by_user_id text,
  sent_by_name text,
  push_notice_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (daily_reminder_id, shift_date)
);

create index if not exists daily_reminders_active_sort_idx
  on public.daily_reminders (is_active, sort_order asc, scheduled_time asc);

create index if not exists daily_reminder_sends_reminder_date_idx
  on public.daily_reminder_sends (daily_reminder_id, shift_date desc);

create index if not exists daily_reminder_sends_shift_date_idx
  on public.daily_reminder_sends (shift_date desc, sent_at desc);

create unique index if not exists daily_reminder_sends_one_automatic_or_early_per_day_idx
  on public.daily_reminder_sends (daily_reminder_id, shift_date)
  where sent_type in ('automatic', 'early');

drop trigger if exists set_daily_reminders_updated_at on public.daily_reminders;
create trigger set_daily_reminders_updated_at
  before update on public.daily_reminders
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_daily_reminder_daily_state_updated_at on public.daily_reminder_daily_state;
create trigger set_daily_reminder_daily_state_updated_at
  before update on public.daily_reminder_daily_state
  for each row
  execute function public.set_updated_at();

alter table public.daily_reminders enable row level security;
alter table public.daily_reminder_sends enable row level security;
alter table public.daily_reminder_daily_state enable row level security;

drop policy if exists "No public daily reminders access" on public.daily_reminders;
create policy "No public daily reminders access"
  on public.daily_reminders for all using (false);

drop policy if exists "No public daily reminder sends access" on public.daily_reminder_sends;
create policy "No public daily reminder sends access"
  on public.daily_reminder_sends for all using (false);

drop policy if exists "No public daily reminder daily state access" on public.daily_reminder_daily_state;
create policy "No public daily reminder daily state access"
  on public.daily_reminder_daily_state for all using (false);

-- Default AM Dog Handler reminders (6:30am–1:30pm) — seed once when empty
do $$
begin
  if not exists (select 1 from public.daily_reminders limit 1) then
    insert into public.daily_reminders (
      title, message, scheduled_time, audience, shift_group, priority,
      display_duration_seconds, requires_swing_handler, sort_order
    ) values
      ('Check In With Team Lead', 'Clock in, check in with the Team Lead, get your yard assignment, grab your fanny pack, and ask which dogs need special attention today.', '06:30:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 1),
      ('Fanny Pack + Yard Supply Check', 'Make sure your fanny pack is assigned and stocked. Check for poop bags, slip lead, radio/communication tool if used, and any yard supplies. Tell the Team Lead right away if anything is missing.', '06:35:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 2),
      ('Morning Potty Support', 'Help get dogs out for morning potty. Watch for loose stool, limping, coughing, vomiting, blood, appetite issues, or unusual behavior. Report concerns to the Team Lead immediately.', '06:40:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 3),
      ('Yard Safety Setup', 'Help the Team Lead finish yard setup. Check water buckets, play equipment, gates, mop/poop buckets, and make sure the yard is safe before more dogs arrive.', '06:45:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 4),
      ('Taxi Arrival Support', 'Be ready to receive taxi dogs safely. Use slip leads when needed, confirm dogs go to the correct yard or area, and tell the Team Lead about any unusual taxi notes.', '07:00:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 5),
      ('Special Needs Dog Reminder', 'Ask the Team Lead which dogs need special handling, rotations, slow intros, cone/collar checks, private walks, group walks, bordetella tracking, or extra monitoring.', '07:30:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 6),
      ('Breakfast + Water Support', 'Support breakfast and water refresh. Help clean feeding areas, check bowls, refresh waters, and watch dogs after meals. Team Lead handles meds and Gingr recording unless you are specifically assigned.', '07:45:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 7),
      ('Yard Observation Check', 'Watch dog behavior closely as the yard gets busier. Report mounting, bullying, stress, over-arousal, coughing, limping, loose stool, vomiting, or any dog that needs a break.', '08:15:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 8),
      ('Potty Station Cleaning', 'Help rinse and scrub the potty station with Got Pee if assigned. Remove waste, check for odor buildup, and tell the Team Lead if supplies are low.', '09:00:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 9),
      ('Water + Yard Reset', 'Refresh waters, pick up waste, reset toys/equipment, and help keep the yard clean before lunch rotations start.', '09:30:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 10),
      ('Swing Handler Handoff Check', 'If a 10am–6:30pm handler is working today, help update them on yard assignments, special needs dogs, behavior concerns, and cleaning priorities.', '10:00:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, true, 11),
      ('Lunch Coverage Plan', 'Check with the Team Lead before lunches begin. Confirm who is covering each yard so no yard is ever left unattended.', '10:10:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 12),
      ('Handler Lunch 1 Coverage', 'First lunch coverage. If one handler is on lunch, the other handler and Team Lead must keep yards covered. Communicate before stepping away.', '10:15:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 13),
      ('Handler Lunch 2 Coverage', 'Second lunch coverage. Confirm coverage with the Team Lead before leaving the yard. Yards must never be unattended.', '10:30:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 14),
      ('Post-Lunch Yard Reset', 'After lunch coverage, reset the yard. Pick up waste, refresh water, check dog energy levels, and report any changes to the Team Lead.', '10:45:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 15),
      ('Potty Station Reset', 'Second potty station cleaning check. Rinse and scrub with Got Pee if assigned. Keep the area clean before the afternoon rush.', '11:00:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 16),
      ('Boarder Area Refresh Support', 'Help refresh overnight dog areas if assigned. Shake out bedding, check waters, look for accidents, remove dirty blankets, and tell the Team Lead if a dog needs a clean bed or reset.', '11:30:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 17),
      ('Yard + Hallway Cleaning', 'Help keep shared areas clean before PM crossover. Vacuum yard/hallways if assigned, sweep or vacuum the parking lot, pick up hair, remove waste, and keep walkways safe.', '12:00:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 18),
      ('Dog Notes Support', 'Tell the Team Lead about anything that should be added to dog notes: behavior changes, injuries, appetite changes, stool concerns, coughing, limping, owner notes, or special handling updates.', '12:30:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 19),
      ('PM Prep Support', 'Help prep for the PM team. Clean bowls, organize food areas, help with bedding/water checks, and make sure anything unfinished is reported to the Team Lead.', '12:45:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 20),
      ('Mop Wheel Hair Removal', 'Remove hair from mop wheels before PM shift. Check mop wheels, remove hair buildup, rinse if needed, and return cleaning tools properly.', '13:00:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 21),
      ('Laundry + Towel Support', 'Help keep laundry moving before leaving. Start laundry if assigned, grab towels from Grooming if needed, and tell the Team Lead if towels, blankets, or cleaning rags are running low.', '13:15:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 22),
      ('End-of-Shift Handoff', 'Before clocking out, check in with the Team Lead. Share dog concerns, cleaning issues, owner notes, special needs updates, and anything unfinished.', '13:25:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 23),
      ('Clock Out Check', 'Make sure your assigned tasks are complete, supplies are returned, and the Team Lead knows you are leaving.', '13:30:00', array['dog_handler','team_lead'], 'am_handler', 'normal', 120, false, 24);
  end if;
end $$;

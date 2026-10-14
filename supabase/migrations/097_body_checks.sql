-- Body Checks — historical floor inspections.
-- Gingr remains the source of truth for identity, reservations, and check-in.
-- Each submission is a new report. Earlier reports are never overwritten.

create table if not exists public.body_check_reports (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  gingr_animal_id text not null check (char_length(trim(gingr_animal_id)) > 0),
  dog_name text not null check (char_length(trim(dog_name)) > 0),
  dog_photo_url text,
  gingr_owner_id text,
  owner_name text,
  gingr_reservation_id text,
  service_type text,
  service_category text not null default 'other'
    check (service_category in ('daycare', 'boarding', 'grooming', 'training', 'outing', 'hike', 'other')),
  location_id text,
  staff_user_id uuid references public.admin_users(id) on delete set null,
  staff_name text not null check (char_length(trim(staff_name)) > 0),
  inspected_at timestamptz not null default now(),
  ears jsonb not null default '[]'::jsonb,
  nails jsonb not null default '[]'::jsonb,
  body_grooming jsonb not null default '[]'::jsonb,
  body_physical jsonb not null default '[]'::jsonb,
  other_notes jsonb not null default '{}'::jsonb,
  notes text,
  severity text not null default 'routine'
    check (severity in ('routine', 'needs_follow_up', 'urgent')),
  follow_up_status text not null default 'none'
    check (follow_up_status in ('none', 'required', 'scheduled', 'completed', 'owner_contacted')),
  follow_up_kinds text[] not null default '{}',
  submission_status text not null default 'submitted'
    check (submission_status in ('submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists body_check_reports_idempotency_idx
  on public.body_check_reports (idempotency_key);

create index if not exists body_check_reports_inspected_idx
  on public.body_check_reports (inspected_at desc);

create index if not exists body_check_reports_animal_idx
  on public.body_check_reports (gingr_animal_id, inspected_at desc);

create index if not exists body_check_reports_follow_up_idx
  on public.body_check_reports (follow_up_status, inspected_at desc);

create index if not exists body_check_reports_search_idx
  on public.body_check_reports (dog_name, owner_name, staff_name);

create table if not exists public.body_check_follow_up_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.body_check_reports(id) on delete cascade,
  from_status text,
  to_status text not null,
  note text,
  changed_by uuid references public.admin_users(id) on delete set null,
  changed_by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists body_check_follow_up_events_report_idx
  on public.body_check_follow_up_events (report_id, created_at desc);

drop trigger if exists set_body_check_reports_updated_at on public.body_check_reports;
create trigger set_body_check_reports_updated_at
  before update on public.body_check_reports
  for each row execute function public.set_updated_at();

alter table public.body_check_reports enable row level security;
alter table public.body_check_follow_up_events enable row level security;

drop policy if exists "No public body check reports access" on public.body_check_reports;
create policy "No public body check reports access"
  on public.body_check_reports for all using (false) with check (false);

drop policy if exists "No public body check follow up access" on public.body_check_follow_up_events;
create policy "No public body check follow up access"
  on public.body_check_follow_up_events for all using (false) with check (false);

revoke all on table public.body_check_reports from public, anon, authenticated;
revoke all on table public.body_check_follow_up_events from public, anon, authenticated;
grant select, insert, update, delete on table public.body_check_reports to service_role;
grant select, insert, update, delete on table public.body_check_follow_up_events to service_role;

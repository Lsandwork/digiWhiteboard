-- Cached Gingr facility-calendar services + same-day birthdays for
-- Team Lead / Coordinator My Shift Needs Attention.
-- Refreshed hourly 6am–7pm Pacific by /api/cron/my-shift-facility-feed.

create table if not exists public.ops_gingr_animal_birthdates (
  gingr_animal_id text primary key,
  birthdate date not null,
  dog_name text,
  owner_name text,
  updated_at timestamptz not null default now()
);

comment on table public.ops_gingr_animal_birthdates is
  'Cached Gingr animal date of birth for My Shift birthday checks. Gingr remains source of truth.';

create table if not exists public.ops_my_shift_facility_feed (
  id uuid primary key default gen_random_uuid(),
  feed_date date not null unique,
  services jsonb not null default '[]'::jsonb,
  birthdays jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now(),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ops_my_shift_facility_feed_synced_idx
  on public.ops_my_shift_facility_feed (synced_at desc);

comment on table public.ops_my_shift_facility_feed is
  'Hourly Gingr facility calendar + birthday snapshot for Team Lead / Coordinator My Shift.';

alter table public.ops_gingr_animal_birthdates enable row level security;
alter table public.ops_my_shift_facility_feed enable row level security;

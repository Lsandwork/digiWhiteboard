create extension if not exists pgcrypto;

create table if not exists public.live_transition_dogs (
  id uuid primary key default gen_random_uuid(),
  gingr_reservation_id text unique,
  gingr_animal_id text,
  animal_name text not null,
  owner_name text,
  reservation_type text,
  current_status text not null,
  display_status text not null,
  room text,
  notes text,
  flags jsonb default '{}'::jsonb,
  status_started_at timestamptz,
  completed_at timestamptz,
  last_seen_from_gingr_at timestamptz,
  raw_payload jsonb,
  hidden boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.gingr_webhook_events (
  id uuid primary key default gen_random_uuid(),
  webhook_type text,
  entity_id text,
  entity_type text,
  signature text,
  verified boolean default false,
  processed boolean default false,
  processing_error text,
  payload jsonb not null,
  created_at timestamptz default now()
);

create table if not exists public.board_activity_log (
  id uuid primary key default gen_random_uuid(),
  gingr_reservation_id text,
  animal_name text,
  action text not null,
  previous_status text,
  new_status text,
  source text not null,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists live_transition_dogs_current_status_idx on public.live_transition_dogs(current_status);
create index if not exists live_transition_dogs_display_status_idx on public.live_transition_dogs(display_status);
create index if not exists live_transition_dogs_hidden_idx on public.live_transition_dogs(hidden);
create index if not exists live_transition_dogs_gingr_reservation_id_idx on public.live_transition_dogs(gingr_reservation_id);
create index if not exists live_transition_dogs_gingr_animal_id_idx on public.live_transition_dogs(gingr_animal_id);
create index if not exists gingr_webhook_events_webhook_type_idx on public.gingr_webhook_events(webhook_type);
create index if not exists board_activity_log_created_at_idx on public.board_activity_log(created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists live_transition_dogs_set_updated_at on public.live_transition_dogs;
create trigger live_transition_dogs_set_updated_at
before update on public.live_transition_dogs
for each row execute function public.set_updated_at();

alter table public.live_transition_dogs enable row level security;
alter table public.gingr_webhook_events enable row level security;
alter table public.board_activity_log enable row level security;

drop policy if exists "Public can read active transition dogs" on public.live_transition_dogs;
create policy "Public can read active transition dogs"
on public.live_transition_dogs
for select
to anon, authenticated
using (
  hidden = false
  and display_status in ('checking_in', 'checking_out')
);

drop policy if exists "No public webhook event access" on public.gingr_webhook_events;
create policy "No public webhook event access"
on public.gingr_webhook_events
for select
to anon, authenticated
using (false);

drop policy if exists "No public activity log access" on public.board_activity_log;
create policy "No public activity log access"
on public.board_activity_log
for select
to anon, authenticated
using (false);

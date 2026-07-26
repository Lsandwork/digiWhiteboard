-- Owner live tracking + ETA notification state (30-min SMS / 15-min map state).
create table if not exists public.route_owner_tracking (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.route_plans(id) on delete cascade,
  route_id uuid not null references public.route_plan_routes(id) on delete cascade,
  stop_id uuid not null references public.route_plan_stops(id) on delete cascade,
  token text not null unique,
  operating_date date not null,
  direction text not null check (direction in ('pickup', 'dropoff')),
  van_key text not null,
  samsara_vehicle_name text,
  owner_name text,
  dog_names text[] not null default '{}',
  owner_phone_e164 text,
  stop_address text,
  stop_latitude double precision,
  stop_longitude double precision,
  status text not null default 'pending'
    check (status in ('pending', 'en_route', 'arriving_15', 'arrived', 'completed', 'cancelled')),
  last_eta_minutes numeric,
  last_vehicle_latitude double precision,
  last_vehicle_longitude double precision,
  last_vehicle_at timestamptz,
  link_sent_at timestamptz,
  notified_30_at timestamptz,
  notified_15_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stop_id)
);

create index if not exists route_owner_tracking_token_idx on public.route_owner_tracking (token);
create index if not exists route_owner_tracking_date_idx on public.route_owner_tracking (operating_date, status);
create index if not exists route_owner_tracking_plan_idx on public.route_owner_tracking (plan_id);

drop trigger if exists set_route_owner_tracking_updated_at on public.route_owner_tracking;
create trigger set_route_owner_tracking_updated_at
  before update on public.route_owner_tracking
  for each row execute function set_updated_at();

-- Ensure stop items can be used to rebuild Samsara notes after generate.
alter table public.route_plan_stops
  add column if not exists owner_phone_display text;

comment on column public.route_plan_stops.owner_phone_display is
  'Full owner phone for Samsara driver notes (also embedded in driver_notes).';

comment on table public.route_owner_tracking is
  'Public owner tracking tokens + 30/15 minute ETA notification state for Fitdog routes.';

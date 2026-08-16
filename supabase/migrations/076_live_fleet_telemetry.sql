-- Live Fleet: durable Samsara vehicle IDs + shared telemetry cache/cursor.
-- Extends Route Generator vehicle configs; does not replace owner tracking.

alter table public.route_vehicle_configs
  add column if not exists samsara_vehicle_id text;

comment on column public.route_vehicle_configs.samsara_vehicle_id is
  'Stable Samsara vehicle id from /fleet/vehicles/stats. Preferred join key for Live Fleet.';

create unique index if not exists route_vehicle_configs_samsara_vehicle_id_uidx
  on public.route_vehicle_configs (samsara_vehicle_id)
  where samsara_vehicle_id is not null and length(trim(samsara_vehicle_id)) > 0;

-- Single-row sync cursor for the org feed (avoid one Samsara poll per browser).
create table if not exists public.route_fleet_sync_state (
  id text primary key default 'default',
  end_cursor text,
  has_next_page boolean not null default false,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_error_status integer,
  last_update_count integer not null default 0,
  simulated boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint route_fleet_sync_state_singleton check (id = 'default')
);

insert into public.route_fleet_sync_state (id)
values ('default')
on conflict (id) do nothing;

-- Latest GPS snapshot per RuffOps van (normalized; never stores API tokens).
create table if not exists public.route_fleet_vehicle_telemetry (
  van_key text primary key
    references public.route_vehicle_configs (van_key) on delete cascade,
  samsara_vehicle_id text,
  samsara_vehicle_name text,
  latitude double precision,
  longitude double precision,
  heading double precision,
  speed_mph double precision,
  address text,
  gps_timestamp timestamptz,
  received_at timestamptz not null default now(),
  status text not null default 'unknown'
    check (status in ('moving', 'parked', 'stale', 'offline', 'unknown')),
  simulated boolean not null default false,
  raw_summary jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint route_fleet_telemetry_no_van_4 check (van_key <> 'van_4')
);

create index if not exists route_fleet_vehicle_telemetry_received_idx
  on public.route_fleet_vehicle_telemetry (received_at desc);

alter table public.route_fleet_sync_state enable row level security;
alter table public.route_fleet_vehicle_telemetry enable row level security;

drop policy if exists route_fleet_sync_state_deny_all on public.route_fleet_sync_state;
create policy route_fleet_sync_state_deny_all
  on public.route_fleet_sync_state
  for all
  using (false)
  with check (false);

drop policy if exists route_fleet_vehicle_telemetry_deny_all on public.route_fleet_vehicle_telemetry;
create policy route_fleet_vehicle_telemetry_deny_all
  on public.route_fleet_vehicle_telemetry
  for all
  using (false)
  with check (false);

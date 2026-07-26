-- Route Generator: Fitdog pickup/drop-off planning + Samsara export
-- Access is enforced server-side; tables are service-role only (RLS deny-all).

create table if not exists public.route_generator_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.route_vehicle_configs (
  id uuid primary key default gen_random_uuid(),
  van_key text not null unique check (van_key in ('van_1', 'van_2', 'van_3', 'van_5', 'van_6')),
  display_name text not null,
  samsara_vehicle_name text not null default '',
  vehicle_pool text not null check (vehicle_pool in ('club', 'outing')),
  active boolean not null default true,
  max_dogs integer,
  max_load_units numeric,
  max_large_dogs integer,
  max_route_duration_minutes integer,
  max_stops integer,
  eligible_services text[] not null default '{}',
  driver_name text,
  driver_admin_user_id uuid references public.admin_users(id) on delete set null,
  starting_depot_key text not null default 'fitdog',
  ending_depot_key text not null default 'fitdog',
  operational_start_time time,
  operational_end_time time,
  notes text not null default '',
  capacity_configured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_vehicle_no_van_4 check (van_key <> 'van_4')
);

create table if not exists public.route_service_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null unique,
  canonical_service text not null check (
    canonical_service in (
      'Adventure Hike',
      'Beach Excursion',
      'Trainer-Led Hike',
      'Group Class',
      'Taxi Service'
    )
  ),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.route_report_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'fitdog',
  status text not null default 'disconnected'
    check (status in ('disconnected', 'connected', 'expired', 'error')),
  source_mode text not null default 'fixture'
    check (source_mode in ('api', 'csv', 'browser_worker', 'fixture')),
  username_masked text,
  secret_reference text,
  pickup_report_selector text,
  dropoff_report_selector text,
  field_mapping jsonb not null default '{}'::jsonb,
  last_connected_at timestamptz,
  last_successful_pull_at timestamptz,
  last_error text,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.route_report_runs (
  id uuid primary key default gen_random_uuid(),
  operating_date date not null,
  status text not null default 'queued'
    check (status in (
      'queued', 'running', 'waiting_for_authentication', 'completed',
      'completed_with_warnings', 'failed', 'cancelled'
    )),
  source_mode text not null default 'fixture',
  pickup_count integer not null default 0,
  dropoff_count integer not null default 0,
  warning_count integer not null default 0,
  error_count integer not null default 0,
  format_changed boolean not null default false,
  started_by uuid references public.admin_users(id) on delete set null,
  started_by_email text,
  correlation_id text,
  error_message text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists route_report_runs_date_idx on public.route_report_runs (operating_date desc);

create table if not exists public.route_report_source_files (
  id uuid primary key default gen_random_uuid(),
  report_run_id uuid not null references public.route_report_runs(id) on delete cascade,
  direction text not null check (direction in ('pickup', 'dropoff', 'combined')),
  storage_path text,
  content_sha256 text,
  content_type text,
  byte_size integer,
  sanitized_snapshot jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.route_report_items (
  id uuid primary key default gen_random_uuid(),
  report_run_id uuid not null references public.route_report_runs(id) on delete cascade,
  direction text not null check (direction in ('pickup', 'dropoff')),
  reservation_id text,
  customer_id text,
  owner_first_name text,
  owner_last_name text,
  owner_full_name text,
  dog_id text,
  dog_name text,
  service_raw text,
  service_canonical text,
  address_raw text,
  address_street text,
  address_unit text,
  address_city text,
  address_state text,
  address_zip text,
  owner_phone_masked text,
  owner_phone_encrypted text,
  time_window_start timestamptz,
  time_window_end timestamptz,
  service_start_at timestamptz,
  service_end_at timestamptz,
  dog_size text,
  dog_weight numeric,
  special_notes text,
  driver_notes text,
  reservation_notes text,
  validation_status text not null default 'ok'
    check (validation_status in ('ok', 'warning', 'error')),
  validation_reasons text[] not null default '{}',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists route_report_items_run_res_dir_uidx
  on public.route_report_items (report_run_id, reservation_id, direction)
  where reservation_id is not null;

create index if not exists route_report_items_run_idx on public.route_report_items (report_run_id);

create table if not exists public.route_address_cache (
  id uuid primary key default gen_random_uuid(),
  address_key text not null unique,
  original_address text not null,
  normalized_address text,
  unit text,
  latitude double precision,
  longitude double precision,
  geocoder_confidence numeric,
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'valid', 'low_confidence', 'invalid')),
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.route_address_overrides (
  id uuid primary key default gen_random_uuid(),
  report_item_id uuid references public.route_report_items(id) on delete cascade,
  original_value text,
  corrected_value text not null,
  latitude double precision,
  longitude double precision,
  reason text not null default '',
  corrected_by uuid references public.admin_users(id) on delete set null,
  corrected_by_email text,
  corrected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.route_plans (
  id uuid primary key default gen_random_uuid(),
  operating_date date not null,
  report_run_id uuid references public.route_report_runs(id) on delete set null,
  status text not null default 'draft'
    check (status in (
      'draft', 'generating', 'needs_review', 'ready_for_approval', 'approved',
      'exported', 'synced_to_samsara', 'superseded', 'failed'
    )),
  current_version integer not null default 1,
  shadow_mode boolean not null default true,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references public.admin_users(id) on delete set null,
  created_by_email text,
  approved_by uuid references public.admin_users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists route_plans_date_idx on public.route_plans (operating_date desc);

create table if not exists public.route_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.route_plans(id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null default '{}'::jsonb,
  optimization_seed text,
  optimization_label text
    check (optimization_label in (
      'optimized', 'feasible_not_fully_optimized', 'infeasible', 'needs_management_review'
    )),
  created_by uuid references public.admin_users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  unique (plan_id, version_number)
);

create table if not exists public.route_plan_routes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.route_plans(id) on delete cascade,
  version_number integer not null default 1,
  van_key text not null check (van_key in ('van_1', 'van_2', 'van_3', 'van_5', 'van_6')),
  vehicle_pool text not null check (vehicle_pool in ('club', 'outing')),
  direction text not null check (direction in ('pickup', 'dropoff')),
  wave_name text not null default '',
  status text not null default 'draft',
  locked boolean not null default false,
  driver_name text,
  departure_at timestamptz,
  return_at timestamptz,
  total_stops integer not null default 0,
  total_dogs integer not null default 0,
  capacity_used integer not null default 0,
  load_units_used numeric not null default 0,
  large_dogs integer not null default 0,
  estimated_distance_miles numeric not null default 0,
  estimated_drive_minutes numeric not null default 0,
  service_types text[] not null default '{}',
  warnings text[] not null default '{}',
  map_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_plan_routes_no_van_4 check (van_key <> 'van_4')
);

create index if not exists route_plan_routes_plan_idx on public.route_plan_routes (plan_id, version_number);

create table if not exists public.route_plan_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.route_plan_routes(id) on delete cascade,
  sequence integer not null,
  stop_kind text not null default 'customer'
    check (stop_kind in ('depot_start', 'customer', 'depot_end', 'manual')),
  owner_name text,
  address text,
  latitude double precision,
  longitude double precision,
  dog_count integer not null default 0,
  load_units numeric not null default 0,
  requested_window_start timestamptz,
  requested_window_end timestamptz,
  eta_arrival timestamptz,
  eta_departure timestamptz,
  owner_phone_masked text,
  driver_notes text,
  validation_status text not null default 'ok',
  locked boolean not null default false,
  locked_sequence boolean not null default false,
  household_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (route_id, sequence)
);

create table if not exists public.route_plan_stop_items (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references public.route_plan_stops(id) on delete cascade,
  report_item_id uuid references public.route_report_items(id) on delete set null,
  dog_name text,
  service_canonical text,
  reservation_id text,
  dog_size text,
  load_units numeric not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.route_manual_stops (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.route_plans(id) on delete cascade,
  direction text not null check (direction in ('pickup', 'dropoff')),
  address text not null,
  notes text not null default '',
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.route_export_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version_number integer not null default 1,
  active boolean not null default false,
  delimiter text not null default ',',
  encoding text not null default 'utf-8',
  headers text[] not null default '{}',
  sample_storage_path text,
  validated boolean not null default false,
  uploaded_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.route_export_template_mappings (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.route_export_templates(id) on delete cascade,
  samsara_column text not null,
  column_index integer not null,
  mapped_field text,
  required boolean not null default false,
  created_at timestamptz not null default now(),
  unique (template_id, samsara_column)
);

create table if not exists public.route_export_jobs (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.route_plans(id) on delete cascade,
  version_number integer not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'completed_with_warnings', 'failed', 'cancelled')),
  template_id uuid references public.route_export_templates(id) on delete set null,
  file_name text,
  storage_path text,
  validation_report jsonb not null default '{}'::jsonb,
  emergency_override boolean not null default false,
  override_reason text,
  created_by uuid references public.admin_users(id) on delete set null,
  created_by_email text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.route_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.route_plans(id) on delete cascade,
  status text not null default 'queued',
  dry_run boolean not null default true,
  result jsonb not null default '{}'::jsonb,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.route_worker_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  status text not null default 'queued'
    check (status in (
      'queued', 'running', 'waiting_for_authentication', 'completed',
      'completed_with_warnings', 'failed', 'cancelled'
    )),
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  correlation_id text,
  owned_by_plan_id uuid references public.route_plans(id) on delete set null,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists route_worker_jobs_status_idx on public.route_worker_jobs (status, created_at);

create table if not exists public.route_audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text,
  entity_id text,
  actor_admin_id uuid references public.admin_users(id) on delete set null,
  actor_email text,
  actor_role text,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  correlation_id text,
  created_at timestamptz not null default now()
);

create index if not exists route_audit_events_created_idx on public.route_audit_events (created_at desc);

-- updated_at triggers
do $$
declare
  t text;
begin
  foreach t in array array[
    'route_generator_settings',
    'route_vehicle_configs',
    'route_service_aliases',
    'route_report_connections',
    'route_report_runs',
    'route_report_items',
    'route_address_cache',
    'route_plans',
    'route_plan_routes',
    'route_plan_stops',
    'route_export_templates',
    'route_export_jobs',
    'route_sync_jobs',
    'route_worker_jobs'
  ]
  loop
    execute format('drop trigger if exists set_%s_updated_at on public.%I', t, t);
    execute format(
      'create trigger set_%s_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- RLS deny-all (service role bypass)
do $$
declare
  t text;
begin
  foreach t in array array[
    'route_generator_settings',
    'route_vehicle_configs',
    'route_service_aliases',
    'route_report_connections',
    'route_report_runs',
    'route_report_source_files',
    'route_report_items',
    'route_address_cache',
    'route_address_overrides',
    'route_plans',
    'route_plan_versions',
    'route_plan_routes',
    'route_plan_stops',
    'route_plan_stop_items',
    'route_manual_stops',
    'route_export_templates',
    'route_export_template_mappings',
    'route_export_jobs',
    'route_sync_jobs',
    'route_worker_jobs',
    'route_audit_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "No public %s" on public.%I', t, t);
    execute format('create policy "No public %s" on public.%I for all using (false)', t, t);
  end loop;
end $$;

-- Seed vans (capacities intentionally unconfigured)
insert into public.route_vehicle_configs (
  van_key, display_name, samsara_vehicle_name, vehicle_pool, eligible_services, capacity_configured
) values
  ('van_1', 'Van 1', '', 'club', array['Trainer-Led Hike', 'Group Class', 'Taxi Service'], false),
  ('van_2', 'Van 2', '', 'club', array['Trainer-Led Hike', 'Group Class', 'Taxi Service'], false),
  ('van_3', 'Van 3', '', 'outing', array['Adventure Hike', 'Beach Excursion'], false),
  ('van_5', 'Van 5', '', 'outing', array['Adventure Hike', 'Beach Excursion'], false),
  ('van_6', 'Van 6', '', 'outing', array['Adventure Hike', 'Beach Excursion'], false)
on conflict (van_key) do nothing;

insert into public.route_service_aliases (alias, canonical_service) values
  ('adventure hike', 'Adventure Hike'),
  ('adventure hikes', 'Adventure Hike'),
  ('beach excursion', 'Beach Excursion'),
  ('beach excursions', 'Beach Excursion'),
  ('trainer-led hike', 'Trainer-Led Hike'),
  ('trainer led hike', 'Trainer-Led Hike'),
  ('trainer-led hikes', 'Trainer-Led Hike'),
  ('group class', 'Group Class'),
  ('group classes', 'Group Class'),
  ('taxi', 'Taxi Service'),
  ('taxi service', 'Taxi Service'),
  ('taxi services', 'Taxi Service')
on conflict (alias) do nothing;

insert into public.route_generator_settings (key, value) values
  ('depot', '{"name":"","address":"","latitude":null,"longitude":null,"geofence_radius_m":100,"timezone":"America/Los_Angeles","verified":false}'::jsonb),
  ('dog_size_loads', '{"Small":null,"Medium":null,"Large":null,"Extra Large":null,"Unknown":null,"configured":false}'::jsonb),
  ('feature_checklist', '{"shadow_mode":true,"production_enabled":false}'::jsonb),
  ('optimization_weights', '{"late":1000,"capacity":900,"eligibility":800,"drive_time":50,"distance":40,"balance":20}'::jsonb)
on conflict (key) do nothing;

insert into public.route_report_connections (provider, status, source_mode)
select 'fitdog', 'disconnected', 'fixture'
where not exists (select 1 from public.route_report_connections where provider = 'fitdog');

insert into public.admin_permissions (key, label, description)
select * from (values
  ('route_generator.view', 'Route Generator: View', 'View Route Generator plans and maps.'),
  ('route_generator.pull_report', 'Route Generator: Pull Report', 'Pull Fitdog pickup/drop-off reports.'),
  ('route_generator.generate', 'Route Generator: Generate', 'Generate and re-optimize routes.'),
  ('route_generator.edit', 'Route Generator: Edit', 'Manually edit routes and overrides.'),
  ('route_generator.approve', 'Route Generator: Approve', 'Approve route plans for export.'),
  ('route_generator.export', 'Route Generator: Export', 'Export validated Samsara CSV files.'),
  ('route_generator.manage_settings', 'Route Generator: Manage Settings', 'Manage vans, depot, integrations, and templates.'),
  ('route_generator.view_audit', 'Route Generator: View Audit', 'View Route Generator audit events.')
) as v(key, label, description)
where exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'admin_permissions')
on conflict (key) do nothing;

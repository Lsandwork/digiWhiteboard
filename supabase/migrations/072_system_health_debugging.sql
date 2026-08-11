-- RuffOps System Health & Debugging — structured observability, route audits, Cursor debug bridge.
-- Service-role only (RLS deny-all). Fail-safe instrumentation writes from server.

create table if not exists public.system_health_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  event_category text not null default 'system',
  severity text not null default 'info',
  occurred_at timestamptz not null default now(),
  user_id uuid references public.admin_users(id) on delete set null,
  user_email text,
  role text,
  module text,
  entity_type text,
  entity_id text,
  correlation_id text,
  request_id text,
  session_id text,
  integration text,
  status text,
  duration_ms integer,
  message text,
  metadata_json jsonb not null default '{}'::jsonb,
  before_json jsonb,
  after_json jsonb,
  release_version text,
  environment text,
  created_at timestamptz not null default now()
);

create index if not exists system_health_events_occurred_idx
  on public.system_health_events (occurred_at desc);
create index if not exists system_health_events_correlation_idx
  on public.system_health_events (correlation_id, occurred_at desc)
  where correlation_id is not null;
create index if not exists system_health_events_type_idx
  on public.system_health_events (event_type, occurred_at desc);
create index if not exists system_health_events_user_idx
  on public.system_health_events (user_id, occurred_at desc)
  where user_id is not null;
create index if not exists system_health_events_entity_idx
  on public.system_health_events (entity_type, entity_id, occurred_at desc)
  where entity_id is not null;
create index if not exists system_health_events_severity_idx
  on public.system_health_events (severity, occurred_at desc);
create index if not exists system_health_events_module_idx
  on public.system_health_events (module, occurred_at desc)
  where module is not null;

create table if not exists public.system_health_errors (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  error_type text,
  error_message text not null,
  severity text not null default 'error',
  environment text,
  application_module text,
  page text,
  endpoint text,
  user_id uuid references public.admin_users(id) on delete set null,
  role text,
  browser text,
  device text,
  release_version text,
  correlation_id text,
  request_id text,
  stack_trace text,
  affected_operation text,
  context_json jsonb not null default '{}'::jsonb,
  occurrence_count integer not null default 1,
  first_occurrence_at timestamptz not null default now(),
  last_occurrence_at timestamptz not null default now(),
  status text not null default 'unresolved',
  assigned_to uuid references public.admin_users(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.admin_users(id) on delete set null,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists system_health_errors_fingerprint_uniq
  on public.system_health_errors (fingerprint);
create index if not exists system_health_errors_status_idx
  on public.system_health_errors (status, last_occurrence_at desc);
create index if not exists system_health_errors_last_idx
  on public.system_health_errors (last_occurrence_at desc);

create table if not exists public.system_health_route_audits (
  id uuid primary key default gen_random_uuid(),
  correlation_id text not null unique,
  plan_id uuid,
  report_run_id uuid,
  operating_date date,
  actor_admin_id uuid references public.admin_users(id) on delete set null,
  actor_email text,
  actor_role text,
  quality_gate text not null default 'UNKNOWN',
  status text not null default 'running',
  expected_dogs integer not null default 0,
  generated_dogs integer not null default 0,
  excluded_dogs integer not null default 0,
  missing_dogs jsonb not null default '[]'::jsonb,
  unexpected_dogs jsonb not null default '[]'::jsonb,
  duplicate_assignments jsonb not null default '[]'::jsonb,
  destination_mismatches jsonb not null default '[]'::jsonb,
  manual_records jsonb not null default '[]'::jsonb,
  pipeline_stages jsonb not null default '[]'::jsonb,
  address_summary jsonb not null default '{}'::jsonb,
  samsara_summary jsonb not null default '{}'::jsonb,
  owner_texts jsonb not null default '{}'::jsonb,
  validation_failures jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  release_version text,
  environment text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists system_health_route_audits_date_idx
  on public.system_health_route_audits (operating_date desc, started_at desc);
create index if not exists system_health_route_audits_plan_idx
  on public.system_health_route_audits (plan_id)
  where plan_id is not null;
create index if not exists system_health_route_audits_status_idx
  on public.system_health_route_audits (status, started_at desc);
create index if not exists system_health_route_audits_quality_idx
  on public.system_health_route_audits (quality_gate, started_at desc);

create table if not exists public.system_health_route_dog_traces (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.system_health_route_audits(id) on delete cascade,
  correlation_id text not null,
  dog_name text,
  dog_id text,
  reservation_id text,
  source text,
  service_canonical text,
  service_raw text,
  direction text,
  pickup_requested text,
  dropoff_requested text,
  pickup_normalized text,
  dropoff_normalized text,
  eligibility text,
  route_van_key text,
  route_name text,
  generated_destination text,
  expected_destination text,
  validation_status text,
  error_code text,
  decision_trace jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists system_health_route_dog_traces_audit_idx
  on public.system_health_route_dog_traces (audit_id);
create index if not exists system_health_route_dog_traces_corr_idx
  on public.system_health_route_dog_traces (correlation_id);
create index if not exists system_health_route_dog_traces_dog_idx
  on public.system_health_route_dog_traces (dog_name, correlation_id)
  where dog_name is not null;

create table if not exists public.system_health_integration_calls (
  id uuid primary key default gen_random_uuid(),
  integration text not null,
  action text not null,
  status text not null default 'unknown',
  http_status integer,
  latency_ms integer,
  success boolean,
  correlation_id text,
  request_id text,
  feature text,
  record_count integer,
  error_code text,
  error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists system_health_integration_calls_integ_idx
  on public.system_health_integration_calls (integration, occurred_at desc);
create index if not exists system_health_integration_calls_corr_idx
  on public.system_health_integration_calls (correlation_id)
  where correlation_id is not null;
create index if not exists system_health_integration_calls_fail_idx
  on public.system_health_integration_calls (success, occurred_at desc);

create table if not exists public.system_health_api_logs (
  id uuid primary key default gen_random_uuid(),
  method text not null,
  endpoint text not null,
  status_code integer,
  latency_ms integer,
  user_id uuid references public.admin_users(id) on delete set null,
  user_email text,
  request_id text,
  correlation_id text,
  feature text,
  integration text,
  error_state boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists system_health_api_logs_occurred_idx
  on public.system_health_api_logs (occurred_at desc);
create index if not exists system_health_api_logs_endpoint_idx
  on public.system_health_api_logs (endpoint, occurred_at desc);
create index if not exists system_health_api_logs_status_idx
  on public.system_health_api_logs (status_code, occurred_at desc);
create index if not exists system_health_api_logs_corr_idx
  on public.system_health_api_logs (correlation_id)
  where correlation_id is not null;

create table if not exists public.system_health_service_checks (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  status text not null default 'UNKNOWN',
  response_time_ms integer,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  errors_last_hour integer not null default 0,
  errors_last_24h integer not null default 0,
  success_rate_24h numeric,
  detail text,
  metadata_json jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists system_health_service_checks_service_idx
  on public.system_health_service_checks (service_id, checked_at desc);

create table if not exists public.system_health_settings (
  id text primary key default 'default',
  debug_logging_enabled boolean not null default true,
  verbose_logging boolean not null default false,
  route_decision_tracing boolean not null default true,
  api_diagnostics boolean not null default true,
  integration_diagnostics boolean not null default true,
  live_activity_enabled boolean not null default true,
  developer_bridge_enabled boolean not null default true,
  cursor_bridge_enabled boolean not null default true,
  production_diagnostic_access boolean not null default false,
  pii_masking boolean not null default true,
  health_check_interval_seconds integer not null default 300,
  retention_events_days integer not null default 90,
  retention_api_logs_days integer not null default 30,
  retention_route_audits_days integer not null default 365,
  retention_errors_days integer not null default 180,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users(id) on delete set null
);

insert into public.system_health_settings (id)
values ('default')
on conflict (id) do nothing;

create table if not exists public.system_health_live_debug_sessions (
  id uuid primary key default gen_random_uuid(),
  feature text not null,
  scope_user_id uuid references public.admin_users(id) on delete set null,
  scope_correlation_id text,
  scope_integration text,
  enabled_by uuid references public.admin_users(id) on delete set null,
  reason text,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists system_health_live_debug_active_idx
  on public.system_health_live_debug_sessions (active, expires_at)
  where active = true;

create table if not exists public.system_health_debug_access_logs (
  id uuid primary key default gen_random_uuid(),
  actor_admin_id uuid references public.admin_users(id) on delete set null,
  actor_email text,
  query_type text not null,
  resource text,
  environment text,
  sanitized boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists system_health_debug_access_logs_occurred_idx
  on public.system_health_debug_access_logs (occurred_at desc);

-- RLS deny-all (service role bypasses)
do $$
declare
  t text;
begin
  foreach t in array array[
    'system_health_events',
    'system_health_errors',
    'system_health_route_audits',
    'system_health_route_dog_traces',
    'system_health_integration_calls',
    'system_health_api_logs',
    'system_health_service_checks',
    'system_health_settings',
    'system_health_live_debug_sessions',
    'system_health_debug_access_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "No public %s" on public.%I', t, t);
    execute format('create policy "No public %s" on public.%I for all using (false)', t, t);
  end loop;
end $$;

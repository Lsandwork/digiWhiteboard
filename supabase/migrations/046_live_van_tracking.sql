-- Fitdog Live Van Tracking
-- Owner-facing transportation ETA + GPS tracking (service-role only; app enforces RBAC).

create table if not exists public.transport_tracking_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transport_tracking_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id text,
  route_plan_id uuid references public.route_plans(id) on delete set null,
  route_id uuid references public.route_plan_routes(id) on delete set null,
  route_stop_id uuid references public.route_plan_stops(id) on delete set null,
  reservation_ids text[] not null default '{}',
  customer_id text,
  household_key text,
  dog_names text[] not null default '{}',
  dog_ids text[] not null default '{}',
  direction text not null check (direction in ('pickup', 'dropoff')),
  status text not null default 'scheduled'
    check (status in (
      'scheduled', 'route_assigned', 'preparing', 'on_the_way',
      'thirty_minutes_away', 'live_tracking_available', 'fifteen_minutes_away',
      'five_minutes_away', 'arriving', 'arrived', 'picked_up', 'dropped_off',
      'completed', 'delayed', 'cancelled', 'tracking_unavailable', 'skipped', 'failed'
    )),
  van_key text check (van_key is null or van_key in ('van_1', 'van_2', 'van_3', 'van_5', 'van_6')),
  van_display_name text,
  samsara_route_id text,
  samsara_stop_id text,
  samsara_vehicle_id text,
  samsara_driver_id text,
  stop_latitude double precision,
  stop_longitude double precision,
  stop_address_masked text,
  geofence_radius_meters integer not null default 100,
  geofence_state text not null default 'outside'
    check (geofence_state in ('outside', 'approaching', 'inside', 'departed')),
  current_eta_at timestamptz,
  eta_source text check (eta_source is null or eta_source in (
    'samsara_route_eta', 'samsara_eta_webhook', 'maps_live_traffic',
    'scheduled_time', 'manual_override'
  )),
  previous_eta_at timestamptz,
  vehicle_latitude double precision,
  vehicle_longitude double precision,
  vehicle_heading double precision,
  vehicle_accuracy_meters double precision,
  last_gps_at timestamptz,
  live_tracking_enabled_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz,
  owner_phone_e164 text,
  owner_email text,
  owner_app_user_id text,
  notification_prefs jsonb not null default '{"sms":true,"email":true,"push":false}'::jsonb,
  health_status text not null default 'healthy',
  emergency_privacy_mode boolean not null default false,
  shadow_mode boolean not null default true,
  delay_incident_active boolean not null default false,
  threshold_30_sent_at timestamptz,
  threshold_15_sent_at timestamptz,
  threshold_5_sent_at timestamptz,
  arrived_notified_at timestamptz,
  completed_notified_at timestamptz,
  delay_notified_at timestamptz,
  operating_date date,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transport_tracking_no_van_4 check (van_key is null or van_key <> 'van_4')
);

create index if not exists transport_tracking_sessions_status_idx
  on public.transport_tracking_sessions (status);
create index if not exists transport_tracking_sessions_date_idx
  on public.transport_tracking_sessions (operating_date desc);
create index if not exists transport_tracking_sessions_stop_idx
  on public.transport_tracking_sessions (route_stop_id);
create index if not exists transport_tracking_sessions_vehicle_idx
  on public.transport_tracking_sessions (samsara_vehicle_id)
  where samsara_vehicle_id is not null;
create unique index if not exists transport_tracking_sessions_stop_unique
  on public.transport_tracking_sessions (route_stop_id)
  where route_stop_id is not null and status not in ('cancelled', 'completed', 'failed');

create table if not exists public.transport_tracking_tokens (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.transport_tracking_sessions(id) on delete cascade,
  token_hash text not null unique,
  not_before_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  rotation_number integer not null default 1,
  last_accessed_at timestamptz,
  access_count integer not null default 0,
  is_staff_preview boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists transport_tracking_tokens_session_idx
  on public.transport_tracking_tokens (session_id);

create table if not exists public.transport_tracking_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.transport_tracking_sessions(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  samsara_event_id text,
  correlation_id text,
  created_at timestamptz not null default now()
);

create index if not exists transport_tracking_events_session_idx
  on public.transport_tracking_events (session_id, created_at desc);
create unique index if not exists transport_tracking_events_samsara_unique
  on public.transport_tracking_events (samsara_event_id)
  where samsara_event_id is not null;

create table if not exists public.transport_tracking_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.transport_tracking_sessions(id) on delete cascade,
  vehicle_latitude double precision,
  vehicle_longitude double precision,
  vehicle_heading double precision,
  eta_at timestamptz,
  eta_source text,
  status text,
  recorded_at timestamptz not null default now()
);

create index if not exists transport_tracking_snapshots_session_idx
  on public.transport_tracking_snapshots (session_id, recorded_at desc);

create table if not exists public.transport_tracking_vehicle_locations (
  id uuid primary key default gen_random_uuid(),
  samsara_vehicle_id text not null,
  van_key text check (van_key is null or van_key in ('van_1', 'van_2', 'van_3', 'van_5', 'van_6')),
  latitude double precision not null,
  longitude double precision not null,
  heading double precision,
  speed_mps double precision,
  accuracy_meters double precision,
  recorded_at timestamptz not null,
  source text not null default 'samsara_stats_feed',
  created_at timestamptz not null default now(),
  constraint transport_vehicle_loc_no_van_4 check (van_key is null or van_key <> 'van_4')
);

create index if not exists transport_tracking_vehicle_locations_vehicle_idx
  on public.transport_tracking_vehicle_locations (samsara_vehicle_id, recorded_at desc);

create table if not exists public.transport_tracking_eta_history (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.transport_tracking_sessions(id) on delete cascade,
  eta_at timestamptz,
  eta_source text,
  minutes_away numeric,
  recorded_at timestamptz not null default now()
);

create index if not exists transport_tracking_eta_history_session_idx
  on public.transport_tracking_eta_history (session_id, recorded_at desc);

create table if not exists public.transport_tracking_notification_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  channel text not null default 'sms' check (channel in ('sms', 'email', 'push')),
  direction text check (direction is null or direction in ('pickup', 'dropoff')),
  body text not null,
  subject text,
  active boolean not null default true,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transport_tracking_notifications (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.transport_tracking_sessions(id) on delete cascade,
  event_type text not null,
  channel text not null check (channel in ('sms', 'email', 'push', 'whatsapp')),
  idempotency_key text not null unique,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled', 'shadow_recorded')),
  body text not null,
  recipient_masked text,
  provider text,
  provider_message_id text,
  delivery_result text,
  failure_reason text,
  retry_count integer not null default 0,
  threshold_reached_at timestamptz,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transport_tracking_notifications_session_idx
  on public.transport_tracking_notifications (session_id, created_at desc);

create table if not exists public.transport_tracking_preferences (
  id uuid primary key default gen_random_uuid(),
  customer_id text,
  phone_e164 text,
  email text,
  transportation_updates_enabled boolean not null default true,
  sms_enabled boolean not null default true,
  email_enabled boolean not null default true,
  push_enabled boolean not null default false,
  language text not null default 'en',
  quiet_hours jsonb not null default '{}'::jsonb,
  consent_at timestamptz,
  consent_source text,
  opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists transport_tracking_preferences_customer_uidx
  on public.transport_tracking_preferences (customer_id)
  where customer_id is not null;

create table if not exists public.transport_tracking_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'samsara',
  event_id text not null,
  event_type text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'duplicate')),
  payload_sanitized jsonb not null default '{}'::jsonb,
  error_message text,
  unique (provider, event_id)
);

create table if not exists public.transport_tracking_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'samsara',
  event_type text not null,
  external_id text,
  session_id uuid references public.transport_tracking_sessions(id) on delete set null,
  payload_sanitized jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.transport_tracking_provider_cursors (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'samsara',
  cursor_key text not null,
  cursor_value text not null,
  updated_at timestamptz not null default now(),
  unique (provider, cursor_key)
);

create table if not exists public.transport_tracking_route_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.transport_tracking_sessions(id) on delete cascade,
  geometry jsonb not null default '[]'::jsonb,
  provider text,
  distance_meters numeric,
  duration_seconds numeric,
  computed_at timestamptz not null default now(),
  stale boolean not null default false
);

create index if not exists transport_tracking_route_lines_session_idx
  on public.transport_tracking_route_lines (session_id, computed_at desc);

create table if not exists public.transport_tracking_manual_overrides (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.transport_tracking_sessions(id) on delete cascade,
  override_type text not null,
  previous_value jsonb,
  new_value jsonb,
  reason text not null,
  created_by uuid references public.admin_users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.transport_tracking_audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null,
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

create index if not exists transport_tracking_audit_created_idx
  on public.transport_tracking_audit_events (created_at desc);

create table if not exists public.transport_tracking_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  status text not null default 'queued'
    check (status in (
      'queued', 'running', 'waiting_for_authentication', 'completed',
      'completed_with_warnings', 'failed', 'cancelled'
    )),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  last_error text,
  correlation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists transport_tracking_jobs_due_idx
  on public.transport_tracking_jobs (status, run_after)
  where status = 'queued';

-- Default notification templates
insert into public.transport_tracking_notification_templates (template_key, channel, direction, body)
values
  ('pickup_30', 'sms', 'pickup', 'Heads up! {{dog_names}}''s Fitdog driver is about 30 minutes away. We''ll send a live tracking link when the van gets closer.'),
  ('pickup_15', 'sms', 'pickup', '{{dog_names}}''s Fitdog van is about 15 minutes away. Follow the driver here: {{tracking_url}}'),
  ('pickup_5', 'sms', 'pickup', '{{dog_names}}''s driver is almost there. Please have {{dog_names}} ready with any needed leash, harness, or belongings.'),
  ('pickup_arrived', 'sms', 'pickup', 'Your Fitdog driver has arrived for {{dog_names}}.'),
  ('pickup_complete', 'sms', 'pickup', '{{dog_names}} has been picked up and is safely on the way.'),
  ('dropoff_30', 'sms', 'dropoff', '{{dog_names}} is heading home. The Fitdog van is about 30 minutes away.'),
  ('dropoff_15', 'sms', 'dropoff', '{{dog_names}} is about 15 minutes from home. Follow the Fitdog van here: {{tracking_url}}'),
  ('dropoff_5', 'sms', 'dropoff', '{{dog_names}} is almost home. The Fitdog van is about 5 minutes away.'),
  ('dropoff_arrived', 'sms', 'dropoff', '{{dog_names}} has arrived home.'),
  ('dropoff_complete', 'sms', 'dropoff', '{{dog_names}} has been dropped off. Thank you for riding with Fitdog.'),
  ('delay', 'sms', null, 'Your Fitdog van is running a little behind. The updated arrival estimate for {{dog_names}} is {{arrival_time}}. Follow the latest update here: {{tracking_url}}'),
  ('cancelled', 'sms', null, 'Transportation for {{dog_names}} has been cancelled. Please contact Fitdog if you need assistance.'),
  ('skipped_owner', 'sms', null, 'We''re updating your transportation details. Please contact Fitdog if you need immediate assistance.')
on conflict (template_key) do nothing;

insert into public.transport_tracking_settings (key, value)
values
  ('thresholds', '{"notice_minutes":30,"live_minutes":15,"final_minutes":5,"expiration_grace_minutes":15,"delay_increase_minutes":15}'::jsonb),
  ('freshness', '{"gps_stale_seconds":120,"eta_stale_seconds":180,"route_event_stale_seconds":300}'::jsonb),
  ('privacy', '{"driver_name_enabled":false,"show_destination_after_pickup":false,"emergency_privacy_mode":false}'::jsonb),
  ('contact', '{"business_phone":"","business_email":"hello@fitdog.com"}'::jsonb),
  ('retention', '{"snapshot_days":7,"notification_days":365}'::jsonb),
  ('feature_checklist', '{"shadow_mode":true,"production_enabled":false}'::jsonb)
on conflict (key) do nothing;

-- RLS deny-all (service role bypasses)
do $$
declare
  t text;
begin
  foreach t in array array[
    'transport_tracking_settings',
    'transport_tracking_sessions',
    'transport_tracking_tokens',
    'transport_tracking_events',
    'transport_tracking_snapshots',
    'transport_tracking_vehicle_locations',
    'transport_tracking_eta_history',
    'transport_tracking_notification_templates',
    'transport_tracking_notifications',
    'transport_tracking_preferences',
    'transport_tracking_webhook_events',
    'transport_tracking_provider_events',
    'transport_tracking_provider_cursors',
    'transport_tracking_route_lines',
    'transport_tracking_manual_overrides',
    'transport_tracking_audit_events',
    'transport_tracking_jobs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'drop policy if exists %I on public.%I',
      'No public ' || t,
      t
    );
    execute format(
      'create policy %I on public.%I for all using (false) with check (false)',
      'No public ' || t,
      t
    );
  end loop;
end $$;

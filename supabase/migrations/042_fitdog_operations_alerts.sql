-- Fitdog Operations Alerts: payment failure / missed payment ledger for staff.ruffops.com Operations.

create table if not exists public.fitdog_integration_settings (
  id text primary key default 'default',
  integration_mode text not null default 'playwright'
    check (integration_mode in ('api', 'webhook', 'playwright')),
  sync_enabled boolean not null default true,
  missed_payment_grace_minutes integer not null default 60,
  backfill_days integer not null default 365,
  reconciliation_days integer not null default 30,
  incremental_interval_minutes integer not null default 8,
  encrypted_session jsonb not null default '{}'::jsonb,
  last_successful_sync_at timestamptz,
  last_backfill_at timestamptz,
  last_reconciliation_at timestamptz,
  cursor jsonb not null default '{}'::jsonb,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users(id) on delete set null
);

insert into public.fitdog_integration_settings (id)
values ('default')
on conflict (id) do nothing;

create table if not exists public.fitdog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('cron', 'manual', 'webhook', 'backfill', 'reconciliation', 'resume')),
  mode text not null default 'incremental'
    check (mode in ('incremental', 'backfill', 'reconciliation', 'webhook')),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'skipped', 'interrupted')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  records_scanned integer not null default 0,
  alerts_created integer not null default 0,
  alerts_updated integer not null default 0,
  alerts_resolved integer not null default 0,
  error_count integer not null default 0,
  retry_count integer not null default 0,
  message text,
  error_details text,
  checkpoint jsonb not null default '{}'::jsonb,
  actor_user_id uuid references public.admin_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists fitdog_sync_runs_started_idx
  on public.fitdog_sync_runs (started_at desc);

create table if not exists public.fitdog_raw_events (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'fitdog',
  ingestion_method text not null check (ingestion_method in ('api', 'webhook', 'playwright', 'manual')),
  event_type text,
  source_event_id text,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  sanitized_payload jsonb not null default '{}'::jsonb,
  parse_error text,
  screenshot_path text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists fitdog_raw_events_idempotency_uidx
  on public.fitdog_raw_events (idempotency_key);
create index if not exists fitdog_raw_events_source_event_idx
  on public.fitdog_raw_events (source_event_id);
create index if not exists fitdog_raw_events_created_idx
  on public.fitdog_raw_events (created_at desc);

create table if not exists public.fitdog_customers (
  id uuid primary key default gen_random_uuid(),
  fitdog_owner_id text not null unique,
  owner_name text not null default '',
  email text,
  phone text,
  source_url text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fitdog_dogs (
  id uuid primary key default gen_random_uuid(),
  fitdog_dog_id text not null unique,
  fitdog_owner_id text,
  dog_name text not null default '',
  breed text,
  source_url text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fitdog_dogs_owner_idx on public.fitdog_dogs (fitdog_owner_id);

create table if not exists public.fitdog_reservations (
  id uuid primary key default gen_random_uuid(),
  fitdog_reservation_id text not null unique,
  fitdog_owner_id text,
  fitdog_dog_id text,
  service_name text,
  service_date timestamptz,
  status text,
  attendance_status text,
  completed_at timestamptz,
  amount_due numeric(12, 2),
  currency text not null default 'USD',
  covered_by_package boolean not null default false,
  covered_by_credit boolean not null default false,
  complimentary boolean not null default false,
  waived boolean not null default false,
  source_url text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fitdog_reservations_service_date_idx
  on public.fitdog_reservations (service_date desc nulls last);
create index if not exists fitdog_reservations_owner_idx
  on public.fitdog_reservations (fitdog_owner_id);

create table if not exists public.fitdog_services (
  id uuid primary key default gen_random_uuid(),
  fitdog_service_id text not null unique,
  fitdog_reservation_id text,
  fitdog_owner_id text,
  fitdog_dog_id text,
  service_name text not null default '',
  service_date timestamptz,
  completed_at timestamptz,
  attended boolean not null default false,
  amount_due numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  covered_by_package boolean not null default false,
  covered_by_credit boolean not null default false,
  complimentary boolean not null default false,
  discounted boolean not null default false,
  waived boolean not null default false,
  adjustment_notes text,
  source_url text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fitdog_services_completed_idx
  on public.fitdog_services (completed_at desc nulls last);

create table if not exists public.fitdog_invoices (
  id uuid primary key default gen_random_uuid(),
  fitdog_invoice_id text not null unique,
  fitdog_owner_id text,
  fitdog_dog_id text,
  fitdog_reservation_id text,
  status text,
  amount_due numeric(12, 2) not null default 0,
  amount_paid numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  due_at timestamptz,
  paid_at timestamptz,
  source_url text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fitdog_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  fitdog_transaction_id text not null unique,
  fitdog_owner_id text,
  fitdog_dog_id text,
  fitdog_reservation_id text,
  fitdog_invoice_id text,
  status text not null,
  amount numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  failure_reason text,
  payment_method_brand text,
  payment_method_last_four text,
  attempt_number integer not null default 1,
  attempted_at timestamptz,
  succeeded_at timestamptz,
  source_url text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fitdog_payment_tx_status_idx
  on public.fitdog_payment_transactions (status);
create index if not exists fitdog_payment_tx_attempted_idx
  on public.fitdog_payment_transactions (attempted_at desc nulls last);

create table if not exists public.operations_alerts (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'fitdog',
  source_event_id text,
  source_record_id text,
  idempotency_key text not null,
  alert_type text not null check (alert_type in (
    'PAYMENT_FAILED',
    'PAYMENT_MISSED',
    'CARD_DECLINED',
    'CARD_EXPIRED',
    'CARD_MISSING',
    'PAYMENT_PROCESSING_ERROR',
    'PAYMENT_RETRY_FAILED',
    'OUTSTANDING_BALANCE',
    'PAYMENT_RESOLVED',
    'FITDOG_SYNC_ERROR'
  )),
  severity text not null default 'medium'
    check (severity in ('critical', 'high', 'medium', 'low')),
  owner_id text,
  owner_name text not null default '',
  dog_id text,
  dog_name text,
  reservation_id text,
  invoice_id text,
  transaction_id text,
  service_name text,
  service_date timestamptz,
  amount_due numeric(12, 2) not null default 0,
  amount_paid numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  failure_reason text,
  payment_attempt_count integer not null default 0,
  payment_method_brand text,
  payment_method_last_four text,
  status text not null default 'new' check (status in (
    'new',
    'acknowledged',
    'assigned',
    'owner_contacted',
    'awaiting_payment',
    'follow_up_scheduled',
    'paid',
    'waived',
    'false_positive',
    'resolved',
    'reopened'
  )),
  assigned_user_id uuid references public.admin_users(id) on delete set null,
  assigned_user_name text,
  detected_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  follow_up_at timestamptz,
  resolution_type text,
  resolution_notes text,
  package_credit_check jsonb not null default '{}'::jsonb,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists operations_alerts_idempotency_uidx
  on public.operations_alerts (idempotency_key);
create index if not exists operations_alerts_status_idx on public.operations_alerts (status);
create index if not exists operations_alerts_type_idx on public.operations_alerts (alert_type);
create index if not exists operations_alerts_detected_idx on public.operations_alerts (detected_at desc);
create index if not exists operations_alerts_assigned_idx on public.operations_alerts (assigned_user_id);
create index if not exists operations_alerts_severity_idx on public.operations_alerts (severity);

create table if not exists public.operations_alert_activity (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.operations_alerts(id) on delete cascade,
  activity_type text not null,
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid references public.admin_users(id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists operations_alert_activity_alert_idx
  on public.operations_alert_activity (alert_id, created_at desc);

create table if not exists public.operations_alert_assignments (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.operations_alerts(id) on delete cascade,
  assigned_user_id uuid references public.admin_users(id) on delete set null,
  assigned_user_name text,
  assigned_by_user_id uuid references public.admin_users(id) on delete set null,
  assigned_by_name text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists operations_alert_assignments_alert_idx
  on public.operations_alert_assignments (alert_id, created_at desc);

drop trigger if exists set_fitdog_customers_updated_at on public.fitdog_customers;
create trigger set_fitdog_customers_updated_at
  before update on public.fitdog_customers
  for each row execute function public.set_updated_at();

drop trigger if exists set_fitdog_dogs_updated_at on public.fitdog_dogs;
create trigger set_fitdog_dogs_updated_at
  before update on public.fitdog_dogs
  for each row execute function public.set_updated_at();

drop trigger if exists set_fitdog_reservations_updated_at on public.fitdog_reservations;
create trigger set_fitdog_reservations_updated_at
  before update on public.fitdog_reservations
  for each row execute function public.set_updated_at();

drop trigger if exists set_fitdog_services_updated_at on public.fitdog_services;
create trigger set_fitdog_services_updated_at
  before update on public.fitdog_services
  for each row execute function public.set_updated_at();

drop trigger if exists set_fitdog_invoices_updated_at on public.fitdog_invoices;
create trigger set_fitdog_invoices_updated_at
  before update on public.fitdog_invoices
  for each row execute function public.set_updated_at();

drop trigger if exists set_fitdog_payment_transactions_updated_at on public.fitdog_payment_transactions;
create trigger set_fitdog_payment_transactions_updated_at
  before update on public.fitdog_payment_transactions
  for each row execute function public.set_updated_at();

drop trigger if exists set_operations_alerts_updated_at on public.operations_alerts;
create trigger set_operations_alerts_updated_at
  before update on public.operations_alerts
  for each row execute function public.set_updated_at();

drop trigger if exists set_fitdog_integration_settings_updated_at on public.fitdog_integration_settings;
create trigger set_fitdog_integration_settings_updated_at
  before update on public.fitdog_integration_settings
  for each row execute function public.set_updated_at();

alter table public.fitdog_integration_settings enable row level security;
alter table public.fitdog_sync_runs enable row level security;
alter table public.fitdog_raw_events enable row level security;
alter table public.fitdog_customers enable row level security;
alter table public.fitdog_dogs enable row level security;
alter table public.fitdog_reservations enable row level security;
alter table public.fitdog_services enable row level security;
alter table public.fitdog_invoices enable row level security;
alter table public.fitdog_payment_transactions enable row level security;
alter table public.operations_alerts enable row level security;
alter table public.operations_alert_activity enable row level security;
alter table public.operations_alert_assignments enable row level security;

drop policy if exists "No public fitdog_integration_settings" on public.fitdog_integration_settings;
create policy "No public fitdog_integration_settings" on public.fitdog_integration_settings for all using (false);

drop policy if exists "No public fitdog_sync_runs" on public.fitdog_sync_runs;
create policy "No public fitdog_sync_runs" on public.fitdog_sync_runs for all using (false);

drop policy if exists "No public fitdog_raw_events" on public.fitdog_raw_events;
create policy "No public fitdog_raw_events" on public.fitdog_raw_events for all using (false);

drop policy if exists "No public fitdog_customers" on public.fitdog_customers;
create policy "No public fitdog_customers" on public.fitdog_customers for all using (false);

drop policy if exists "No public fitdog_dogs" on public.fitdog_dogs;
create policy "No public fitdog_dogs" on public.fitdog_dogs for all using (false);

drop policy if exists "No public fitdog_reservations" on public.fitdog_reservations;
create policy "No public fitdog_reservations" on public.fitdog_reservations for all using (false);

drop policy if exists "No public fitdog_services" on public.fitdog_services;
create policy "No public fitdog_services" on public.fitdog_services for all using (false);

drop policy if exists "No public fitdog_invoices" on public.fitdog_invoices;
create policy "No public fitdog_invoices" on public.fitdog_invoices for all using (false);

drop policy if exists "No public fitdog_payment_transactions" on public.fitdog_payment_transactions;
create policy "No public fitdog_payment_transactions" on public.fitdog_payment_transactions for all using (false);

drop policy if exists "No public operations_alerts" on public.operations_alerts;
create policy "No public operations_alerts" on public.operations_alerts for all using (false);

drop policy if exists "No public operations_alert_activity" on public.operations_alert_activity;
create policy "No public operations_alert_activity" on public.operations_alert_activity for all using (false);

drop policy if exists "No public operations_alert_assignments" on public.operations_alert_assignments;
create policy "No public operations_alert_assignments" on public.operations_alert_assignments for all using (false);

-- Track Incidents: Gingr webhook-backed incident ledger for admin/management.

create table if not exists public.track_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_number text not null,
  gingr_incident_id text unique,
  occurred_at timestamptz,
  source text not null default 'gingr' check (source in ('gingr', 'manual')),
  dog_name text not null default '',
  dog_breed text,
  gingr_animal_id text,
  owner_name text not null default '',
  gingr_owner_id text,
  incident_type text not null default 'Incident',
  incident_type_id text,
  reported_by text not null default '',
  reported_by_username text,
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'follow_up_needed', 'resolved')),
  assigned_to_user_id uuid references public.admin_users(id) on delete set null,
  assigned_to_name text,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  location_name text,
  location_id text,
  notes text not null default '',
  latest_update text,
  raw_payload jsonb not null default '{}'::jsonb,
  gingr_webhook_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists track_incidents_incident_number_uidx
  on public.track_incidents (incident_number);
create index if not exists track_incidents_occurred_at_idx
  on public.track_incidents (occurred_at desc nulls last);
create index if not exists track_incidents_status_idx
  on public.track_incidents (status);
create index if not exists track_incidents_source_idx
  on public.track_incidents (source);
create index if not exists track_incidents_created_at_idx
  on public.track_incidents (created_at desc);

create table if not exists public.track_incident_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('cron', 'manual', 'webhook')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  imported_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  message text,
  actor_user_id uuid references public.admin_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists track_incident_sync_runs_started_idx
  on public.track_incident_sync_runs (started_at desc);

drop trigger if exists set_track_incidents_updated_at on public.track_incidents;
create trigger set_track_incidents_updated_at
  before update on public.track_incidents
  for each row execute function public.set_updated_at();

alter table public.track_incidents enable row level security;
alter table public.track_incident_sync_runs enable row level security;

drop policy if exists "No public track_incidents" on public.track_incidents;
create policy "No public track_incidents" on public.track_incidents for all using (false);

drop policy if exists "No public track_incident_sync_runs" on public.track_incident_sync_runs;
create policy "No public track_incident_sync_runs" on public.track_incident_sync_runs for all using (false);

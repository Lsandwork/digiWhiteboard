-- Phase 1: Unified Operations Command Center foundation.
-- Non-destructive: existing boards / walks / push / Team Log keep working.
-- Gingr remains authoritative for customers, pets, reservations, packages, payments.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Universal dog identity (RuffOps operational view; Gingr owns master pet data)
-- ---------------------------------------------------------------------------
create table if not exists public.ops_dogs (
  id uuid primary key default gen_random_uuid(),
  gingr_animal_id text,
  fitdog_dog_id text,
  ruffly_contact_dog_id uuid,
  name text not null default '',
  owner_name text,
  owner_phone_e164 text,
  photo_url text,
  breed text,
  flags jsonb not null default '{}'::jsonb,
  special_instructions text,
  gingr_profile_url text,
  last_gingr_sync_at timestamptz,
  gingr_sync_stale boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ops_dogs_gingr_animal_uidx
  on public.ops_dogs (gingr_animal_id)
  where gingr_animal_id is not null;

create unique index if not exists ops_dogs_fitdog_dog_uidx
  on public.ops_dogs (fitdog_dog_id)
  where fitdog_dog_id is not null;

create index if not exists ops_dogs_name_idx on public.ops_dogs (lower(name));
create index if not exists ops_dogs_owner_name_idx on public.ops_dogs (lower(owner_name));

comment on table public.ops_dogs is
  'RuffOps operational dog identity. Gingr remains the pet-business source of truth; this maps and caches ops fields.';

-- ---------------------------------------------------------------------------
-- Shared live operational status (one current row per dog)
-- ---------------------------------------------------------------------------
create table if not exists public.ops_dog_status (
  dog_id uuid primary key references public.ops_dogs(id) on delete cascade,
  status text not null default 'expected'
    check (status in (
      'expected',
      'arrived',
      'checked_in',
      'yard',
      'break',
      'training',
      'grooming',
      'outing',
      'transportation',
      'ready_for_pickup',
      'checked_out',
      'overnight',
      'other'
    )),
  sub_status text,
  location_label text,
  yard_key text,
  gingr_reservation_id text,
  transportation_state text,
  grooming_state text,
  training_state text,
  walk_state text,
  break_state text,
  assigned_employee_ids jsonb not null default '[]'::jsonb,
  status_started_at timestamptz,
  expected_checkout_at timestamptz,
  source_module text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by_admin_id uuid
);

create index if not exists ops_dog_status_status_idx on public.ops_dog_status (status);
create index if not exists ops_dog_status_reservation_idx on public.ops_dog_status (gingr_reservation_id);

-- ---------------------------------------------------------------------------
-- Append-only operational timeline events
-- ---------------------------------------------------------------------------
create table if not exists public.ops_events (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid references public.ops_dogs(id) on delete set null,
  event_type text not null,
  category text not null default 'other'
    check (category in (
      'check_in',
      'checkout',
      'yard',
      'break',
      'walk',
      'body_check',
      'collar_check',
      'feeding',
      'medication',
      'grooming',
      'training',
      'transportation',
      'outing',
      'incident',
      'owner_communication',
      'alert',
      'task',
      'employee_note',
      'photo',
      'video',
      'important_notice',
      'status',
      'system',
      'other'
    )),
  title text not null,
  summary text,
  actor_admin_id uuid,
  actor_name text,
  actor_role text,
  source_module text not null default 'ops',
  source_record_type text,
  source_record_id text,
  related_task_id uuid,
  related_alert_id uuid,
  severity text check (severity is null or severity in ('critical', 'high', 'attention', 'informational')),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists ops_events_dog_occurred_idx
  on public.ops_events (dog_id, occurred_at desc);
create index if not exists ops_events_category_occurred_idx
  on public.ops_events (category, occurred_at desc);
create index if not exists ops_events_source_idx
  on public.ops_events (source_module, source_record_type, source_record_id);
create unique index if not exists ops_events_idempotency_uidx
  on public.ops_events (
    (coalesce(source_module, '')),
    (coalesce(source_record_type, '')),
    (coalesce(source_record_id, '')),
    (coalesce(event_type, ''))
  )
  where source_record_id is not null;

-- ---------------------------------------------------------------------------
-- Central task engine
-- ---------------------------------------------------------------------------
create table if not exists public.ops_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  dog_id uuid references public.ops_dogs(id) on delete set null,
  related_event_id uuid references public.ops_events(id) on delete set null,
  assigned_admin_id uuid,
  assigned_role text,
  due_at timestamptz,
  priority text not null default 'attention'
    check (priority in ('critical', 'high', 'attention', 'informational')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'completed', 'snoozed', 'escalated', 'cancelled')),
  created_by_admin_id uuid,
  created_from text,
  completed_by_admin_id uuid,
  completed_at timestamptz,
  snoozed_until timestamptz,
  notes text,
  escalation_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ops_tasks_status_due_idx on public.ops_tasks (status, due_at);
create index if not exists ops_tasks_assignee_idx on public.ops_tasks (assigned_admin_id, status);
create index if not exists ops_tasks_dog_idx on public.ops_tasks (dog_id, status);

-- ---------------------------------------------------------------------------
-- Central notification center
-- ---------------------------------------------------------------------------
create table if not exists public.ops_notifications (
  id uuid primary key default gen_random_uuid(),
  user_admin_id uuid,
  role_key text,
  team_key text,
  dog_id uuid references public.ops_dogs(id) on delete set null,
  task_id uuid references public.ops_tasks(id) on delete set null,
  event_id uuid references public.ops_events(id) on delete set null,
  alert_key text,
  route_key text,
  incident_id text,
  title text not null,
  body text,
  priority text not null default 'attention'
    check (priority in ('critical', 'high', 'attention', 'informational')),
  dedupe_key text,
  read_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by_admin_id uuid,
  resolved_at timestamptz,
  resolved_by_admin_id uuid,
  resolution_notes text,
  href_tab text,
  href_path text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ops_notifications_user_unread_idx
  on public.ops_notifications (user_admin_id, created_at desc)
  where read_at is null;
create index if not exists ops_notifications_role_idx
  on public.ops_notifications (role_key, created_at desc);
create unique index if not exists ops_notifications_dedupe_uidx
  on public.ops_notifications (dedupe_key)
  where dedupe_key is not null and resolved_at is null;

-- ---------------------------------------------------------------------------
-- Shared ops audit trail (immutable-style append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.ops_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_admin_id uuid,
  actor_email text,
  actor_role text,
  action text not null,
  object_type text not null,
  object_id text,
  previous_value jsonb,
  new_value jsonb,
  source_module text not null default 'ops',
  device_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ops_audit_events_created_idx
  on public.ops_audit_events (created_at desc);
create index if not exists ops_audit_events_object_idx
  on public.ops_audit_events (object_type, object_id, created_at desc);
create index if not exists ops_audit_events_actor_idx
  on public.ops_audit_events (actor_admin_id, created_at desc);

-- RLS: service role only (same pattern as other internal ops tables)
alter table public.ops_dogs enable row level security;
alter table public.ops_dog_status enable row level security;
alter table public.ops_events enable row level security;
alter table public.ops_tasks enable row level security;
alter table public.ops_notifications enable row level security;
alter table public.ops_audit_events enable row level security;

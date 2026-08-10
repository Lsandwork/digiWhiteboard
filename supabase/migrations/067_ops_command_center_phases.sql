-- Phase 2–7 Command Center extensions: overnight rounds + shift handoff.

create table if not exists public.ops_overnight_rounds (
  id uuid primary key default gen_random_uuid(),
  operating_date date not null,
  round_slot text not null
    check (round_slot in ('22:00', '00:00', '02:00', '04:00', '06:00')),
  status text not null default 'due'
    check (status in ('due', 'completed', 'missed', 'escalated')),
  due_at timestamptz not null,
  completed_at timestamptz,
  completed_by_admin_id uuid,
  notes text,
  dog_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operating_date, round_slot)
);

create index if not exists ops_overnight_rounds_date_idx
  on public.ops_overnight_rounds (operating_date, round_slot);

create table if not exists public.ops_shift_handoffs (
  id uuid primary key default gen_random_uuid(),
  from_shift text not null,
  to_shift text not null,
  submitted_by_admin_id uuid,
  submitted_by_name text,
  acknowledged_by_admin_id uuid,
  acknowledged_by_name text,
  acknowledged_at timestamptz,
  summary text not null default '',
  unresolved_incidents text,
  important_dogs text,
  medication text,
  feeding text,
  behavior_concerns text,
  late_pickups text,
  transportation_issues text,
  owner_follow_ups text,
  grooming_pending text,
  training_pending text,
  open_tasks text,
  system_issues text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ops_shift_handoffs_created_idx
  on public.ops_shift_handoffs (created_at desc);

alter table public.ops_overnight_rounds enable row level security;
alter table public.ops_shift_handoffs enable row level security;

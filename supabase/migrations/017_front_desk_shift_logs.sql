-- Front Desk Shift Tracking Log schema (non-destructive, mirrors JSON storage fields)
-- Runtime storage currently uses admin_settings.staff_admin_ops JSON; this migration documents SQL parity.

create table if not exists public.front_desk_shift_logs (
  id uuid primary key default gen_random_uuid(),
  log_type text not null,
  subject text not null,
  details text not null,
  priority text not null default 'Normal',
  status text not null default 'Open',
  submitted_by uuid,
  assigned_to uuid,
  assigned_team text,
  dog_name text,
  owner_name text,
  department_area text,
  due_at timestamptz,
  reminder_at timestamptz,
  needs_management_review boolean not null default false,
  urgent boolean not null default false,
  linked_owner_follow_up_id uuid,
  linked_active_issue_id uuid,
  management_alerted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  archived_at timestamptz
);

create table if not exists public.front_desk_shift_log_updates (
  id uuid primary key default gen_random_uuid(),
  shift_log_id uuid not null references public.front_desk_shift_logs(id) on delete cascade,
  update_text text not null,
  update_type text not null default 'Internal Note',
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists front_desk_shift_logs_log_type_idx on public.front_desk_shift_logs (log_type);
create index if not exists front_desk_shift_logs_priority_idx on public.front_desk_shift_logs (priority);
create index if not exists front_desk_shift_logs_status_idx on public.front_desk_shift_logs (status);
create index if not exists front_desk_shift_logs_assigned_team_idx on public.front_desk_shift_logs (assigned_team);
create index if not exists front_desk_shift_logs_due_at_idx on public.front_desk_shift_logs (due_at);
create index if not exists front_desk_shift_logs_reminder_at_idx on public.front_desk_shift_logs (reminder_at);
create index if not exists front_desk_shift_logs_urgent_idx on public.front_desk_shift_logs (urgent);
create index if not exists front_desk_shift_logs_needs_review_idx on public.front_desk_shift_logs (needs_management_review);
create index if not exists front_desk_shift_logs_created_at_idx on public.front_desk_shift_logs (created_at desc);

alter table public.front_desk_shift_logs enable row level security;
alter table public.front_desk_shift_log_updates enable row level security;

drop policy if exists "No public front desk shift logs access" on public.front_desk_shift_logs;
create policy "No public front desk shift logs access"
  on public.front_desk_shift_logs for all using (false) with check (false);

drop policy if exists "No public front desk shift log updates access" on public.front_desk_shift_log_updates;
create policy "No public front desk shift log updates access"
  on public.front_desk_shift_log_updates for all using (false) with check (false);

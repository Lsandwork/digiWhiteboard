-- Operations Checklist: shared daily operational flow with permanent completion history.

create table if not exists public.operations_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  catalog_key text not null unique,
  section_key text not null,
  section_label text not null,
  section_sort integer not null default 0,
  title text not null,
  assigned_role text not null,
  due_time time,
  sort_order integer not null default 0,
  is_recurring boolean not null default true,
  requires_photo boolean not null default false,
  requires_management_approval boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operations_checklist_templates_active_idx
  on public.operations_checklist_templates (is_active, section_sort, sort_order);
create index if not exists operations_checklist_templates_role_idx
  on public.operations_checklist_templates (assigned_role);

create table if not exists public.operations_checklist_day_meta (
  shift_date date primary key,
  shift_label text not null default 'AM Shift',
  manager_on_duty_user_id uuid references public.admin_users(id) on delete set null,
  manager_on_duty_name text,
  clocked_in_names text[] not null default '{}',
  crossover_notes text,
  previous_crossover_notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users(id) on delete set null
);

create table if not exists public.operations_checklist_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.operations_checklist_templates(id) on delete cascade,
  shift_date date not null,
  catalog_key text not null,
  section_key text not null,
  section_label text not null,
  section_sort integer not null default 0,
  title text not null,
  assigned_role text not null,
  assigned_user_id uuid references public.admin_users(id) on delete set null,
  assigned_user_name text,
  due_time time,
  sort_order integer not null default 0,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'needs_attention', 'blocked', 'not_applicable')),
  notes text,
  problem_note text,
  help_requested boolean not null default false,
  requires_photo boolean not null default false,
  requires_management_approval boolean not null default false,
  photo_url text,
  completed_by_user_id uuid references public.admin_users(id) on delete set null,
  completed_by_name text,
  completed_at timestamptz,
  started_by_user_id uuid references public.admin_users(id) on delete set null,
  started_by_name text,
  started_at timestamptz,
  returned_by_user_id uuid references public.admin_users(id) on delete set null,
  returned_by_name text,
  returned_at timestamptz,
  return_reason text,
  pushed_to_staff_board boolean not null default false,
  pushed_to_staff_board_at timestamptz,
  acknowledgment_required boolean not null default false,
  acknowledged_at timestamptz,
  acknowledged_by_user_id uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, shift_date)
);

create index if not exists operations_checklist_instances_shift_idx
  on public.operations_checklist_instances (shift_date, section_sort, sort_order);
create index if not exists operations_checklist_instances_status_idx
  on public.operations_checklist_instances (shift_date, status);
create index if not exists operations_checklist_instances_role_idx
  on public.operations_checklist_instances (shift_date, assigned_role);
create index if not exists operations_checklist_instances_assignee_idx
  on public.operations_checklist_instances (assigned_user_id);
create index if not exists operations_checklist_instances_completed_idx
  on public.operations_checklist_instances (completed_at desc nulls last);

create table if not exists public.operations_checklist_events (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.operations_checklist_instances(id) on delete cascade,
  shift_date date not null,
  action text not null,
  actor_user_id uuid references public.admin_users(id) on delete set null,
  actor_name text,
  from_status text,
  to_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists operations_checklist_events_instance_idx
  on public.operations_checklist_events (instance_id, created_at desc);
create index if not exists operations_checklist_events_shift_idx
  on public.operations_checklist_events (shift_date, created_at desc);

drop trigger if exists set_operations_checklist_templates_updated_at on public.operations_checklist_templates;
create trigger set_operations_checklist_templates_updated_at
  before update on public.operations_checklist_templates
  for each row execute function public.set_updated_at();

drop trigger if exists set_operations_checklist_instances_updated_at on public.operations_checklist_instances;
create trigger set_operations_checklist_instances_updated_at
  before update on public.operations_checklist_instances
  for each row execute function public.set_updated_at();

drop trigger if exists set_operations_checklist_day_meta_updated_at on public.operations_checklist_day_meta;
create trigger set_operations_checklist_day_meta_updated_at
  before update on public.operations_checklist_day_meta
  for each row execute function public.set_updated_at();

alter table public.operations_checklist_templates enable row level security;
alter table public.operations_checklist_day_meta enable row level security;
alter table public.operations_checklist_instances enable row level security;
alter table public.operations_checklist_events enable row level security;

drop policy if exists "No public operations_checklist_templates" on public.operations_checklist_templates;
create policy "No public operations_checklist_templates"
  on public.operations_checklist_templates for all using (false);

drop policy if exists "No public operations_checklist_day_meta" on public.operations_checklist_day_meta;
create policy "No public operations_checklist_day_meta"
  on public.operations_checklist_day_meta for all using (false);

drop policy if exists "No public operations_checklist_instances" on public.operations_checklist_instances;
create policy "No public operations_checklist_instances"
  on public.operations_checklist_instances for all using (false);

drop policy if exists "No public operations_checklist_events" on public.operations_checklist_events;
create policy "No public operations_checklist_events"
  on public.operations_checklist_events for all using (false);

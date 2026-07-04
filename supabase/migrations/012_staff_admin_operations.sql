-- Staff Digital Whiteboard Admin operations (non-destructive)

create table if not exists public.crossover_messages (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  message text not null,
  from_department text not null,
  to_department text not null,
  priority text not null default 'Normal' check (priority in ('Low', 'Normal', 'Medium', 'High', 'Critical')),
  status text not null default 'Active' check (status in ('Active', 'Open', 'In Progress', 'Scheduled', 'Pending Review', 'Resolved', 'Archived')),
  related_dog_name text,
  related_owner_name text,
  related_route text,
  created_by uuid,
  assigned_to uuid,
  urgent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.crossover_message_replies (
  id uuid primary key default gen_random_uuid(),
  crossover_message_id uuid not null references public.crossover_messages(id) on delete cascade,
  message text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.owner_follow_ups (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  owner_name text not null,
  dog_name text,
  logged_by uuid,
  assigned_to uuid,
  department text,
  priority text not null default 'Normal' check (priority in ('Low', 'Normal', 'Medium', 'High', 'Critical')),
  due_date timestamptz,
  status text not null default 'Open' check (status in ('Active', 'Open', 'In Progress', 'Scheduled', 'Pending Review', 'Resolved', 'Archived')),
  follow_up_notes text,
  source text not null default 'Manual',
  source_id uuid,
  urgent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.active_issues (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('Lost Belongings', 'Facility Issue', 'Staff Issue', 'Owner Issue', 'Dog Issue', 'Medical / Health', 'Route / Transport', 'Grooming', 'Daycare', 'General')),
  source text not null check (source in ('Front Desk', 'Crossover Communication', 'Owner Follow Up', 'Push Notice', 'Manual', 'Other')),
  source_id uuid,
  source_table text,
  reported_by uuid,
  assigned_to uuid,
  priority text not null default 'Normal' check (priority in ('Low', 'Normal', 'Medium', 'High', 'Critical')),
  reported_at timestamptz not null default now(),
  due_at timestamptz,
  status text not null default 'Open' check (status in ('Active', 'Open', 'In Progress', 'Scheduled', 'Pending Review', 'Resolved', 'Archived')),
  notes text,
  resolution_notes text,
  related_owner_name text,
  related_dog_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  activity_type text not null,
  title text not null,
  description text,
  source_table text,
  source_id uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists crossover_messages_priority_idx on public.crossover_messages(priority);
create index if not exists crossover_messages_status_idx on public.crossover_messages(status);
create index if not exists crossover_messages_assigned_to_idx on public.crossover_messages(assigned_to);
create index if not exists crossover_messages_created_at_idx on public.crossover_messages(created_at desc);
create index if not exists crossover_message_replies_message_idx on public.crossover_message_replies(crossover_message_id, created_at desc);

create index if not exists owner_follow_ups_priority_idx on public.owner_follow_ups(priority);
create index if not exists owner_follow_ups_status_idx on public.owner_follow_ups(status);
create index if not exists owner_follow_ups_assigned_to_idx on public.owner_follow_ups(assigned_to);
create index if not exists owner_follow_ups_created_at_idx on public.owner_follow_ups(created_at desc);
create index if not exists owner_follow_ups_due_date_idx on public.owner_follow_ups(due_date);
create index if not exists owner_follow_ups_source_idx on public.owner_follow_ups(source);
create index if not exists owner_follow_ups_source_id_idx on public.owner_follow_ups(source_id);

create index if not exists active_issues_priority_idx on public.active_issues(priority);
create index if not exists active_issues_status_idx on public.active_issues(status);
create index if not exists active_issues_assigned_to_idx on public.active_issues(assigned_to);
create index if not exists active_issues_created_at_idx on public.active_issues(created_at desc);
create index if not exists active_issues_due_at_idx on public.active_issues(due_at);
create index if not exists active_issues_source_idx on public.active_issues(source);
create index if not exists active_issues_source_id_idx on public.active_issues(source_id);
create unique index if not exists active_issues_source_unique_idx
  on public.active_issues(source_table, source_id)
  where source_table is not null and source_id is not null and status <> 'Archived';

create index if not exists activity_logs_created_at_idx on public.activity_logs(created_at desc);
create index if not exists activity_logs_source_idx on public.activity_logs(source_table, source_id);

drop trigger if exists set_crossover_messages_updated_at on public.crossover_messages;
create trigger set_crossover_messages_updated_at
  before update on public.crossover_messages
  for each row execute function public.set_updated_at();

drop trigger if exists set_owner_follow_ups_updated_at on public.owner_follow_ups;
create trigger set_owner_follow_ups_updated_at
  before update on public.owner_follow_ups
  for each row execute function public.set_updated_at();

drop trigger if exists set_active_issues_updated_at on public.active_issues;
create trigger set_active_issues_updated_at
  before update on public.active_issues
  for each row execute function public.set_updated_at();

alter table public.crossover_messages enable row level security;
alter table public.crossover_message_replies enable row level security;
alter table public.owner_follow_ups enable row level security;
alter table public.active_issues enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "No public crossover messages access" on public.crossover_messages;
create policy "No public crossover messages access"
  on public.crossover_messages for all using (false) with check (false);

drop policy if exists "No public crossover replies access" on public.crossover_message_replies;
create policy "No public crossover replies access"
  on public.crossover_message_replies for all using (false) with check (false);

drop policy if exists "No public owner follow ups access" on public.owner_follow_ups;
create policy "No public owner follow ups access"
  on public.owner_follow_ups for all using (false) with check (false);

drop policy if exists "No public active issues access" on public.active_issues;
create policy "No public active issues access"
  on public.active_issues for all using (false) with check (false);

drop policy if exists "No public activity logs access" on public.activity_logs;
create policy "No public activity logs access"
  on public.activity_logs for all using (false) with check (false);

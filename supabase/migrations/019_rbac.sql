-- RBAC schema for Fitdog Staff Digital Whiteboard Admin
-- References admin_users (custom auth), not auth.users.
-- Runtime assignments are also stored in admin_settings.settings.admin_user_access JSON
-- until this schema is fully wired; this migration documents and prepares normalized tables.

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_departments (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_permissions (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_role_permissions (
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  permission_id uuid not null references public.admin_permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.admin_user_roles (
  user_id uuid not null references public.admin_users(id) on delete cascade,
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  is_primary boolean not null default false,
  assigned_by uuid references public.admin_users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table if not exists public.admin_user_departments (
  user_id uuid not null references public.admin_users(id) on delete cascade,
  department_id uuid not null references public.admin_departments(id) on delete cascade,
  assigned_by uuid references public.admin_users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, department_id)
);

create table if not exists public.admin_user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.admin_users(id) on delete cascade,
  permission_id uuid not null references public.admin_permissions(id) on delete cascade,
  effect text not null check (effect in ('allow', 'deny')),
  reason text,
  assigned_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, permission_id)
);

-- password_change_requirements tracked via admin_users.force_password_change;
-- user_invites not used (passwords stored as bcrypt hash only, never plain text).

insert into public.admin_roles (key, label) values
  ('super_admin', 'Super Admin'),
  ('admin', 'Admin'),
  ('management', 'Management'),
  ('front_desk_coordinator', 'Front Desk - Coordinator'),
  ('team_leader', 'Team Leader'),
  ('groomer', 'Groomer'),
  ('daycare', 'Daycare'),
  ('trainer', 'Trainer'),
  ('driver', 'Driver'),
  ('hiker', 'Hiker'),
  ('overnight', 'Overnight'),
  ('maintenance', 'Maintenance'),
  ('staff', 'Staff'),
  ('viewer', 'Viewer')
on conflict (key) do nothing;

insert into public.admin_departments (key, label) values
  ('front_desk', 'Front Desk'),
  ('management', 'Management'),
  ('daycare', 'Daycare'),
  ('grooming', 'Grooming'),
  ('training', 'Training'),
  ('transportation', 'Transportation'),
  ('overnight', 'Overnight'),
  ('maintenance', 'Maintenance'),
  ('admin', 'Admin')
on conflict (key) do nothing;

insert into public.admin_permissions (key, label) values
  ('view_admin_panel', 'View Admin Panel'),
  ('view_staff_whiteboard', 'View Staff Whiteboard'),
  ('manage_push_notices', 'Manage Push Notices'),
  ('push_grooming_request', 'Push Grooming Request'),
  ('clear_grooming_request', 'Clear Grooming Request'),
  ('view_front_desk_log', 'View Front Desk Log'),
  ('create_front_desk_log', 'Create Front Desk Log'),
  ('edit_front_desk_log', 'Edit Front Desk Log'),
  ('assign_front_desk_log', 'Assign Front Desk Log'),
  ('resolve_front_desk_log', 'Resolve Front Desk Log'),
  ('view_owner_follow_up', 'View Owner Follow Up'),
  ('create_owner_follow_up', 'Create Owner Follow Up'),
  ('edit_owner_follow_up', 'Edit Owner Follow Up'),
  ('assign_owner_follow_up', 'Assign Owner Follow Up'),
  ('resolve_owner_follow_up', 'Resolve Owner Follow Up'),
  ('view_active_issues', 'View Active Issues'),
  ('create_active_issue', 'Create Active Issue'),
  ('edit_active_issue', 'Edit Active Issue'),
  ('assign_active_issue', 'Assign Active Issue'),
  ('resolve_active_issue', 'Resolve Active Issue'),
  ('view_staff_directory', 'View Staff Directory'),
  ('manage_staff_users', 'Manage Staff Users'),
  ('reset_user_password', 'Reset User Password'),
  ('force_password_change', 'Force Password Change'),
  ('configure_integrations', 'Configure Integrations'),
  ('view_integration_status', 'View Integration Status'),
  ('manage_templates', 'Manage Templates'),
  ('receive_admin_alerts', 'Receive Admin Alerts'),
  ('manage_staff_directory', 'Manage Staff Directory')
on conflict (key) do nothing;

alter table public.admin_roles enable row level security;
alter table public.admin_departments enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_user_roles enable row level security;
alter table public.admin_user_departments enable row level security;
alter table public.admin_user_permission_overrides enable row level security;

drop policy if exists "No public admin rbac access" on public.admin_roles;
create policy "No public admin rbac access" on public.admin_roles for all using (false);
drop policy if exists "No public admin departments access" on public.admin_departments;
create policy "No public admin departments access" on public.admin_departments for all using (false);
drop policy if exists "No public admin permissions access" on public.admin_permissions;
create policy "No public admin permissions access" on public.admin_permissions for all using (false);
drop policy if exists "No public admin role permissions access" on public.admin_role_permissions;
create policy "No public admin role permissions access" on public.admin_role_permissions for all using (false);
drop policy if exists "No public admin user roles access" on public.admin_user_roles;
create policy "No public admin user roles access" on public.admin_user_roles for all using (false);
drop policy if exists "No public admin user departments access" on public.admin_user_departments;
create policy "No public admin user departments access" on public.admin_user_departments for all using (false);
drop policy if exists "No public admin user permission overrides access" on public.admin_user_permission_overrides;
create policy "No public admin user permission overrides access" on public.admin_user_permission_overrides for all using (false);

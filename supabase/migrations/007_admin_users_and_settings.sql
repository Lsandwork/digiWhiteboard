-- Admin users, audit logs, and global admin settings (non-destructive)

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text unique not null,
  password_hash text not null,
  role text not null default 'manager_admin' check (role in ('owner_admin', 'manager_admin', 'viewer')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  force_password_change boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.admin_users(id) on delete set null
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_admin_id uuid references public.admin_users(id) on delete set null,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_settings (
  id text primary key default 'default',
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.admin_settings (id, settings)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;

alter table public.admin_users enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.admin_settings enable row level security;

drop policy if exists "No public admin users access" on public.admin_users;
create policy "No public admin users access"
  on public.admin_users for all using (false);

drop policy if exists "No public admin audit logs access" on public.admin_audit_logs;
create policy "No public admin audit logs access"
  on public.admin_audit_logs for all using (false);

drop policy if exists "No public admin settings access" on public.admin_settings;
create policy "No public admin settings access"
  on public.admin_settings for all using (false);

create index if not exists admin_audit_logs_created_at_idx on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_action_idx on public.admin_audit_logs (action);
create index if not exists admin_users_email_idx on public.admin_users (lower(email));

-- Login events for Admin / Management Reports (logins per day and per week).

create table if not exists public.admin_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.admin_users(id) on delete set null,
  email text,
  logged_in_at timestamptz not null default now(),
  source text
);

create index if not exists admin_login_events_logged_in_idx
  on public.admin_login_events (logged_in_at desc);

create index if not exists admin_login_events_user_idx
  on public.admin_login_events (user_id, logged_in_at desc);

alter table public.admin_login_events enable row level security;

drop policy if exists "No public admin login events access" on public.admin_login_events;
create policy "No public admin login events access"
  on public.admin_login_events for all using (false) with check (false);

-- Backfill from existing login audit rows so historical reports are not empty.
insert into public.admin_login_events (user_id, email, logged_in_at, source)
select
  actor_admin_id,
  actor_email,
  created_at,
  'audit_backfill'
from public.admin_audit_logs
where action = 'admin.login';

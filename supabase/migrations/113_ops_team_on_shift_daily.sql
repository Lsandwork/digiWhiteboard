-- Daily login attendance for My Shift "Team on Shift" (Pacific business date).

create table if not exists public.ops_team_on_shift_daily (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  business_date date not null,
  first_login_at timestamptz not null,
  last_login_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ops_team_on_shift_daily_user_date_key unique (admin_user_id, business_date)
);

create index if not exists ops_team_on_shift_daily_date_idx
  on public.ops_team_on_shift_daily (business_date desc, first_login_at asc);

create index if not exists ops_team_on_shift_daily_user_idx
  on public.ops_team_on_shift_daily (admin_user_id, business_date desc);

alter table public.ops_team_on_shift_daily enable row level security;

drop policy if exists "No public ops team on shift access" on public.ops_team_on_shift_daily;
create policy "No public ops team on shift access"
  on public.ops_team_on_shift_daily for all using (false) with check (false);

comment on table public.ops_team_on_shift_daily is
  'One row per admin user per Pacific calendar day after a successful RuffOps staff login.';

-- Idempotent upsert: first login sets first_login_at; later logins bump last_login_at only.
create or replace function public.record_ops_team_on_shift_login(
  p_admin_user_id uuid,
  p_logged_in_at timestamptz default now()
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_date date;
begin
  if p_admin_user_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.admin_users u
    where u.id = p_admin_user_id
      and u.status = 'active'
      and lower(u.email) not like '%@demo.com'
  ) then
    return;
  end if;

  v_business_date := (timezone('America/Los_Angeles', p_logged_in_at))::date;

  insert into public.ops_team_on_shift_daily (
    admin_user_id,
    business_date,
    first_login_at,
    last_login_at
  )
  values (
    p_admin_user_id,
    v_business_date,
    p_logged_in_at,
    p_logged_in_at
  )
  on conflict on constraint ops_team_on_shift_daily_user_date_key do update
    set
      last_login_at = greatest(ops_team_on_shift_daily.last_login_at, excluded.last_login_at),
      updated_at = now();
end;
$$;
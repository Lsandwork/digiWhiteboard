-- Persistent Staff Directory roster (source of truth).
-- External/JSON sync may add or update rows but must never delete them.
-- Hard DELETE is blocked; admin archive sets deleted_at.

alter table public.staff_directory
  alter column id type text using id::text;

alter table public.staff_directory
  add column if not exists checklist_items jsonb,
  add column if not exists external_id text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text;

create index if not exists staff_directory_external_id_idx on public.staff_directory(external_id);
create index if not exists staff_directory_deleted_at_idx on public.staff_directory(deleted_at);
create index if not exists staff_directory_email_idx on public.staff_directory(lower(email));

-- Block accidental wipes. Admin removal is a soft-delete (deleted_at).
create or replace function public.prevent_staff_directory_hard_delete()
returns trigger
language plpgsql
as $$
begin
  if current_setting('staff_directory.allow_hard_delete', true) = 'on' then
    return OLD;
  end if;
  raise exception 'staff_directory rows cannot be hard-deleted; archive with deleted_at instead';
end;
$$;

drop trigger if exists prevent_staff_directory_hard_delete on public.staff_directory;
create trigger prevent_staff_directory_hard_delete
  before delete on public.staff_directory
  for each row execute function public.prevent_staff_directory_hard_delete();

-- Team Log / staff ops JSON writes must never replace the directory snapshot.
create or replace function public.patch_staff_admin_ops_preserve_directory(p_value jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  touched timestamptz := now();
  previous jsonb;
  next jsonb;
begin
  select settings->'staff_admin_ops' into previous
  from public.admin_settings
  where id = 'default';

  next := coalesce(p_value, '{}'::jsonb) - 'staff_directory';
  if previous is not null and previous ? 'staff_directory' then
    next := jsonb_set(next, '{staff_directory}', previous->'staff_directory', true);
  end if;

  insert into public.admin_settings (id, settings, updated_at)
  values ('default', jsonb_build_object('staff_admin_ops', next), touched)
  on conflict (id) do update
    set settings = jsonb_set(
          coalesce(public.admin_settings.settings, '{}'::jsonb),
          '{staff_admin_ops}',
          next,
          true
        ),
        updated_at = touched;

  return touched;
end;
$$;

revoke all on function public.patch_staff_admin_ops_preserve_directory(jsonb) from public;
grant execute on function public.patch_staff_admin_ops_preserve_directory(jsonb) to service_role;

-- Restore recoverable people from the JSON blob into the table (additive).
insert into public.staff_directory (
  id, name, role, department, email, phone, status, notes, checklist_items,
  admin_user_id, dashboard_role, created_at, updated_at
)
select
  coalesce(nullif(m->>'id', ''), gen_random_uuid()::text),
  coalesce(nullif(m->>'name', ''), 'Staff'),
  nullif(m->>'role', ''),
  coalesce(nullif(m->>'department', ''), 'Front Desk'),
  nullif(lower(trim(m->>'email')), ''),
  nullif(m->>'phone', ''),
  case when m->>'status' = 'Inactive' then 'Inactive' else 'Active' end,
  nullif(m->>'notes', ''),
  case when jsonb_typeof(m->'checklist_items') = 'array' then m->'checklist_items' else null end,
  case
    when m->>'admin_user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (m->>'admin_user_id')::uuid
    else null
  end,
  case
    when m->>'dashboard_role' in (
      'owner_admin', 'manager_admin', 'assistant_manager', 'front_desk_coordinator',
      'team_leader', 'groomer', 'trainer', 'daycare', 'driver', 'hiker', 'marketing', 'viewer'
    ) then m->>'dashboard_role'
    else null
  end,
  coalesce((m->>'created_at')::timestamptz, now()),
  coalesce((m->>'updated_at')::timestamptz, now())
from public.admin_settings s
cross join lateral jsonb_array_elements(coalesce(s.settings->'staff_admin_ops'->'staff_directory', '[]'::jsonb)) as m
where s.id = 'default'
  and coalesce(m->>'name', '') <> ''
  and not (
    coalesce(m->>'id', '') like 'default-staff-%'
    and coalesce(m->>'email', '') = ''
    and coalesce(m->>'admin_user_id', '') = ''
    and coalesce(m->>'phone', '') = ''
  )
on conflict (id) do nothing;

-- Restore login accounts that never had / lost a directory row.
insert into public.staff_directory (
  id, name, role, department, email, phone, status, notes,
  admin_user_id, dashboard_role, created_at, updated_at
)
select
  'admin-user-' || u.id::text,
  coalesce(nullif(u.full_name, ''), split_part(u.email, '@', 1), 'Staff'),
  null,
  case
    when u.role in ('owner_admin', 'manager_admin', 'assistant_manager') then 'Management'
    when u.role = 'team_leader' then 'Team Lead'
    when u.role = 'front_desk_coordinator' then 'Front Desk'
    when u.role = 'groomer' then 'Grooming'
    when u.role = 'trainer' then 'Training'
    when u.role = 'daycare' then 'Daycare'
    when u.role in ('driver', 'hiker') then 'Transportation'
    when u.role = 'marketing' then 'Marketing'
    else 'Front Desk'
  end,
  lower(u.email),
  null,
  case when u.status = 'disabled' then 'Inactive' else 'Active' end,
  null,
  u.id,
  u.role,
  u.created_at,
  u.updated_at
from public.admin_users u
where lower(u.email) not like '%@demo.com'
  and not exists (
    select 1
    from public.staff_directory d
    where d.deleted_at is null
      and (
        d.admin_user_id = u.id
        or (d.email is not null and lower(d.email) = lower(u.email))
      )
  )
on conflict (id) do nothing;

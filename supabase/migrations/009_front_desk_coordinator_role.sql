-- Front desk coordinator role for Push Notices-only admin access (non-destructive)

do $$
begin
  alter table public.admin_users
    drop constraint if exists admin_users_role_check;

  alter table public.admin_users
    add constraint admin_users_role_check
    check (role in ('owner_admin', 'manager_admin', 'front_desk_coordinator', 'viewer'));
exception
  when undefined_table then
    null;
end $$;

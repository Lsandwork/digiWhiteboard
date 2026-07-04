-- Add Team Leader admin role (same access as Front Desk Coordinator)

do $$
begin
  alter table public.admin_users
    drop constraint if exists admin_users_role_check;

  alter table public.admin_users
    add constraint admin_users_role_check
    check (role in ('owner_admin', 'manager_admin', 'front_desk_coordinator', 'team_leader', 'viewer'));
exception
  when undefined_table then
    null;
end $$;

do $$
begin
  alter table public.staff_directory
    drop constraint if exists staff_directory_dashboard_role_check;

  alter table public.staff_directory
    add constraint staff_directory_dashboard_role_check
    check (
      dashboard_role is null
      or dashboard_role in ('owner_admin', 'manager_admin', 'front_desk_coordinator', 'team_leader', 'viewer')
    );
exception
  when undefined_table then
    null;
end $$;

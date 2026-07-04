-- Staff Directory dashboard login linkage (non-destructive)

alter table public.staff_directory
  add column if not exists admin_user_id uuid,
  add column if not exists dashboard_role text;

do $$
begin
  alter table public.staff_directory
    drop constraint if exists staff_directory_dashboard_role_check;

  alter table public.staff_directory
    add constraint staff_directory_dashboard_role_check
    check (
      dashboard_role is null
      or dashboard_role in ('owner_admin', 'manager_admin', 'front_desk_coordinator', 'viewer')
    );
exception
  when undefined_table then
    null;
end $$;

create index if not exists staff_directory_admin_user_id_idx on public.staff_directory(admin_user_id);

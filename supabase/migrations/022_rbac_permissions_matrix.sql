-- RBAC permissions matrix extension + Super Admin safety
-- Legacy mapping: admin_users.role = owner_admin => Super Admin (unchanged)

insert into public.admin_permissions (key, label) values
  ('view_user_groups_permissions', 'View User Groups & Permissions'),
  ('manage_user_groups_permissions', 'Manage User Groups & Permissions'),
  ('manage_system_settings', 'Edit System Settings'),
  ('view_integrations', 'View Integrations'),
  ('view_api_access', 'View API Access'),
  ('manage_api_keys', 'Manage API Keys'),
  ('view_gingr_sync_settings', 'View Gingr Sync Settings'),
  ('manage_gingr_sync_settings', 'Manage Gingr Sync Settings'),
  ('manage_gemini_settings', 'Manage Gemini Settings'),
  ('manage_database_tools', 'Database Tools'),
  ('manage_staff_whiteboard', 'Manage Staff Whiteboard'),
  ('view_notifications', 'View Notifications'),
  ('respond_to_notifications', 'Respond to Notifications'),
  ('assign_notifications', 'Assign Notifications'),
  ('view_internal_notes', 'View Internal Notes'),
  ('create_internal_notes', 'Create Internal Notes'),
  ('view_video_links', 'View Video Links'),
  ('manage_video_links', 'Manage Video Links'),
  ('use_fitdog_ai', 'Use Fitdog AI'),
  ('view_analytics', 'View Analytics'),
  ('export_reports', 'Export Reports'),
  ('view_admin_logs', 'View Admin Logs')
on conflict (key) do nothing;

-- Runtime matrix is stored in admin_settings.settings.role_permission_matrix (JSON).
-- Ensure at least one active Super Admin (owner_admin) exists.
do $$
declare
  super_count integer;
  fallback_id uuid;
begin
  select count(*) into super_count
  from public.admin_users
  where role = 'owner_admin' and status = 'active';

  if super_count = 0 then
    select id into fallback_id
    from public.admin_users
    where role = 'manager_admin' and status = 'active'
    order by created_at asc
    limit 1;

    if fallback_id is not null then
      update public.admin_users
      set role = 'owner_admin', updated_at = now()
      where id = fallback_id;
    else
      raise warning '[rbac] No active admin user found to promote to Super Admin.';
    end if;
  end if;
end $$;

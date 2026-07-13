-- Marketing Account role: lobby whiteboard content editors (promotions, schedule, messages)

ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN (
    'owner_admin',
    'manager_admin',
    'assistant_manager',
    'front_desk_coordinator',
    'team_leader',
    'groomer',
    'trainer',
    'daycare',
    'marketing',
    'viewer'
  ));

DO $$
BEGIN
  ALTER TABLE public.staff_directory
    DROP CONSTRAINT IF EXISTS staff_directory_dashboard_role_check;

  ALTER TABLE public.staff_directory
    ADD CONSTRAINT staff_directory_dashboard_role_check
    CHECK (
      dashboard_role IS NULL
      OR dashboard_role IN (
        'owner_admin',
        'manager_admin',
        'assistant_manager',
        'front_desk_coordinator',
        'team_leader',
        'groomer',
        'trainer',
        'daycare',
        'marketing',
        'viewer'
      )
    );
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

INSERT INTO public.admin_roles (key, label)
VALUES ('marketing', 'Marketing Account')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.admin_permissions (key, label)
VALUES ('manage_lobby_board', 'Manage Lobby Whiteboard')
ON CONFLICT (key) DO NOTHING;

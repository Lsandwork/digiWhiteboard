-- Overnight staff logins: My Shift, Team Log, Submit Request, Notifications, Global Settings, Help Center.

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
    'driver',
    'hiker',
    'overnight',
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
        'driver',
        'hiker',
        'overnight',
        'marketing',
        'viewer'
      )
    );
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

INSERT INTO public.admin_roles (key, label)
VALUES ('overnight', 'Overnight')
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label;

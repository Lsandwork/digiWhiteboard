-- Per-role investor demo accounts (password123 for all — see lib/demo/constants.ts)
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
    'viewer'
  ));

INSERT INTO public.admin_users (full_name, email, password_hash, role, status, force_password_change)
VALUES
  ('Investor Demo', 'demo@demo.com', '$2b$12$8PMCI0xrJlcJUNlNG36ruegMm4Z4hVZVMTEge71iAM13Z/i.cz0Cm', 'owner_admin', 'active', false),
  ('Super Admin Demo', 'demo-super@demo.com', '$2b$12$8PMCI0xrJlcJUNlNG36ruegMm4Z4hVZVMTEge71iAM13Z/i.cz0Cm', 'owner_admin', 'active', false),
  ('Admin Demo', 'demo-admin@demo.com', '$2b$12$8PMCI0xrJlcJUNlNG36ruegMm4Z4hVZVMTEge71iAM13Z/i.cz0Cm', 'manager_admin', 'active', false),
  ('Assistant Manager Demo', 'demo-management@demo.com', '$2b$12$8PMCI0xrJlcJUNlNG36ruegMm4Z4hVZVMTEge71iAM13Z/i.cz0Cm', 'assistant_manager', 'active', false),
  ('Team Lead Demo', 'demo-teamlead@demo.com', '$2b$12$8PMCI0xrJlcJUNlNG36ruegMm4Z4hVZVMTEge71iAM13Z/i.cz0Cm', 'team_leader', 'active', false),
  ('Front Desk Demo', 'demo-frontdesk@demo.com', '$2b$12$8PMCI0xrJlcJUNlNG36ruegMm4Z4hVZVMTEge71iAM13Z/i.cz0Cm', 'front_desk_coordinator', 'active', false),
  ('Groomer Demo', 'demo-groomer@demo.com', '$2b$12$8PMCI0xrJlcJUNlNG36ruegMm4Z4hVZVMTEge71iAM13Z/i.cz0Cm', 'groomer', 'active', false),
  ('Trainer Demo', 'demo-trainer@demo.com', '$2b$12$8PMCI0xrJlcJUNlNG36ruegMm4Z4hVZVMTEge71iAM13Z/i.cz0Cm', 'trainer', 'active', false),
  ('Dog Handler Demo', 'demo-handler@demo.com', '$2b$12$8PMCI0xrJlcJUNlNG36ruegMm4Z4hVZVMTEge71iAM13Z/i.cz0Cm', 'daycare', 'active', false)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  force_password_change = false;

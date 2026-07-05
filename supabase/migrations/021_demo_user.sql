-- Investor demo account (isolated sandbox — does not affect live boards)
INSERT INTO public.admin_users (full_name, email, password_hash, role, status, force_password_change)
VALUES (
  'Investor Demo',
  'demo@demo.com',
  '$2b$12$8PMCI0xrJlcJUNlNG36ruegMm4Z4hVZVMTEge71iAM13Z/i.cz0Cm',
  'owner_admin',
  'active',
  false
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  force_password_change = false;

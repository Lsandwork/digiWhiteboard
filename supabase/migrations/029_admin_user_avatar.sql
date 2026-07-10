-- Personal profile photo for admin/staff accounts (shown on the Settings profile
-- page and the sidebar user card). Stored as a small resized data URL.
alter table public.admin_users
  add column if not exists avatar_url text;

-- Add Clear theme option (dark sidebar + white content canvas).

alter table public.admin_users
  drop constraint if exists admin_users_theme_preference_check;

alter table public.admin_users
  add constraint admin_users_theme_preference_check
  check (theme_preference in ('light', 'dark', 'clear'));

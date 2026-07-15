-- Per-user Light/Dark theme preference for Fitdog dashboards.

alter table public.admin_users
  add column if not exists theme_preference text not null default 'dark';

alter table public.admin_users
  drop constraint if exists admin_users_theme_preference_check;

alter table public.admin_users
  add constraint admin_users_theme_preference_check
  check (theme_preference in ('light', 'dark'));

create index if not exists admin_users_theme_preference_idx
  on public.admin_users (theme_preference);

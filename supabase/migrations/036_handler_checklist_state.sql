-- Persist dog handler shift checklist completion per admin user.

alter table public.admin_users
  add column if not exists handler_checklist_state jsonb not null default '{}'::jsonb;

create index if not exists admin_users_handler_checklist_state_idx
  on public.admin_users using gin (handler_checklist_state);

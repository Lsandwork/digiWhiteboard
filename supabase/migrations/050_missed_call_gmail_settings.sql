-- Encrypted Gmail IMAP settings for Front Desk Missed Calls (App Password).

create table if not exists public.missed_call_gmail_settings (
  id text primary key default 'default',
  gmail_user text not null default 'lonnie@fitdog.com',
  app_password_enc jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users(id) on delete set null
);

alter table public.missed_call_gmail_settings enable row level security;

drop policy if exists missed_call_gmail_settings_deny_all on public.missed_call_gmail_settings;
create policy missed_call_gmail_settings_deny_all on public.missed_call_gmail_settings
  for all using (false) with check (false);

insert into public.missed_call_gmail_settings (id, gmail_user)
values ('default', 'lonnie@fitdog.com')
on conflict (id) do nothing;

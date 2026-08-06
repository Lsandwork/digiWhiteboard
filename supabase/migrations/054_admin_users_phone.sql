-- Phone numbers on dashboard user accounts for critical/urgent SMS alerts.
alter table public.admin_users
  add column if not exists phone text;

comment on column public.admin_users.phone is
  'Staff mobile for critical/urgent alert SMS (E.164 or US local). Admin and management roles only receive those texts.';

create index if not exists admin_users_phone_idx
  on public.admin_users (phone)
  where phone is not null and status = 'active';

-- Dedup log so the same critical alert does not spam SMS on retries.
create table if not exists public.admin_alert_sms_log (
  idempotency_key text primary key,
  recipient_count integer not null default 0,
  source_table text,
  source_id text,
  created_at timestamptz not null default now()
);

create index if not exists admin_alert_sms_log_created_at_idx
  on public.admin_alert_sms_log (created_at desc);

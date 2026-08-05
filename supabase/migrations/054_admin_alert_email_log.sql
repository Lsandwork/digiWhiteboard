-- Dedup log so the same critical/urgent alert does not spam email on retries.
create table if not exists public.admin_alert_email_log (
  idempotency_key text primary key,
  recipient_count integer not null default 0,
  recipients text[] not null default '{}',
  source_table text,
  source_id text,
  created_at timestamptz not null default now()
);

create index if not exists admin_alert_email_log_created_at_idx
  on public.admin_alert_email_log (created_at desc);

comment on table public.admin_alert_email_log is
  'Idempotency log for Critical/Urgent alert emails to Super Admin (lonnie@fitdog.com).';

alter table public.admin_alert_email_log enable row level security;

drop policy if exists "No public admin_alert_email_log" on public.admin_alert_email_log;
create policy "No public admin_alert_email_log"
  on public.admin_alert_email_log for all using (false);

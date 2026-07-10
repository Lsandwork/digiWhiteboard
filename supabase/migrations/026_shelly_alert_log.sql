create table if not exists public.shelly_alert_log (
  id uuid primary key default gen_random_uuid(),
  alert_key text unique not null,
  alert_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists shelly_alert_log_created_at_idx
  on public.shelly_alert_log (created_at desc);

alter table public.shelly_alert_log enable row level security;

drop policy if exists "No public shelly_alert_log access" on public.shelly_alert_log;
create policy "No public shelly_alert_log access"
  on public.shelly_alert_log for all using (false);

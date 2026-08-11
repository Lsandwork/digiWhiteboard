-- Audit trail for Route Generator owner SMS (link + ETA alerts).
-- Powers the Route Generator → Tracking tab.

create table if not exists public.route_owner_sms_events (
  id uuid primary key default gen_random_uuid(),
  tracking_id uuid references public.route_owner_tracking(id) on delete set null,
  plan_id uuid references public.route_plans(id) on delete set null,
  operating_date date,
  kind text not null
    check (kind in (
      'link',
      'eta_30',
      'eta_15',
      'pullup',
      'resend_link',
      'enable_alerts',
      'disable_alerts',
      'clear_notified',
      'cancel'
    )),
  to_e164 text,
  body_preview text,
  ok boolean not null default false,
  error text,
  provider_message_id text,
  actor_email text,
  actor_role text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists route_owner_sms_events_tracking_idx
  on public.route_owner_sms_events (tracking_id, created_at desc);

create index if not exists route_owner_sms_events_date_idx
  on public.route_owner_sms_events (operating_date, created_at desc);

create index if not exists route_owner_sms_events_plan_idx
  on public.route_owner_sms_events (plan_id, created_at desc);

comment on table public.route_owner_sms_events is
  'Route Generator owner SMS / tracking alert history for staff Tracking tab.';

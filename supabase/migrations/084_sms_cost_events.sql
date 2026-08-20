-- Operational SMS cost telemetry (no PII — no phone, body, names, or email).

create table if not exists public.sms_cost_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  category text not null,
  template_key text,
  encoding text not null check (encoding in ('GSM-7', 'UCS-2')),
  estimated_segments integer not null check (estimated_segments >= 1),
  estimated_cost numeric(10, 4),
  actual_segments integer,
  actual_cost numeric(10, 4),
  multi_segment boolean not null default false,
  idempotency_key text,
  provider_message_sid text,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'delivered', 'undelivered')),
  reconciled_at timestamptz,
  reconcile_error text
);

create index if not exists sms_cost_events_created_at_idx
  on public.sms_cost_events (created_at desc);

create index if not exists sms_cost_events_category_idx
  on public.sms_cost_events (category, created_at desc);

create index if not exists sms_cost_events_template_idx
  on public.sms_cost_events (template_key, created_at desc)
  where template_key is not null;

create index if not exists sms_cost_events_reconcile_idx
  on public.sms_cost_events (provider_message_sid, reconciled_at)
  where provider_message_sid is not null and reconciled_at is null;

create index if not exists sms_cost_events_idempotency_idx
  on public.sms_cost_events (idempotency_key)
  where idempotency_key is not null;

comment on table public.sms_cost_events is
  'Twilio SMS segment/cost telemetry for RuffOps cost optimization. Stores no customer PII.';

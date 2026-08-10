-- Harden owner tracking SMS against overnight spam and parked-van false ETAs.

alter table public.route_owner_tracking
  add column if not exists sms_alerts_enabled boolean not null default false;

alter table public.route_owner_tracking
  add column if not exists notified_pullup_at timestamptz;

alter table public.route_owner_tracking
  add column if not exists planned_arrival_at timestamptz;

alter table public.route_owner_tracking
  add column if not exists planned_window_start timestamptz;

alter table public.route_owner_tracking
  add column if not exists planned_window_end timestamptz;

-- Allow the live "pulling up" state used by ETA alerts.
alter table public.route_owner_tracking
  drop constraint if exists route_owner_tracking_status_check;

alter table public.route_owner_tracking
  add constraint route_owner_tracking_status_check
  check (status in ('pending', 'en_route', 'arriving_15', 'pulling_up', 'arrived', 'completed', 'cancelled'));

comment on column public.route_owner_tracking.sms_alerts_enabled is
  'True only when staff explicitly opted in to owner SMS on Approve / Send SMS. ETA cron never texts rows with this false.';

comment on column public.route_owner_tracking.planned_arrival_at is
  'Copied from route_plan_stops.eta_arrival so SMS can follow the planned Samsara/route time window.';

-- Hard stop for any active overnight spam rows once this migration lands.
update public.route_owner_tracking
set sms_alerts_enabled = false
where coalesce(sms_alerts_enabled, true) = true;

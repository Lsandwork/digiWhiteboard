-- Route Generator production-final: independent owner-texts flag + stop location metadata.
-- Backwards compatible — existing rows remain usable.

alter table public.route_plans
  add column if not exists owner_texts_enabled boolean not null default false;

alter table public.route_plan_routes
  add column if not exists vehicle_already_at_first_stop boolean not null default true;

alter table public.route_plan_stops
  add column if not exists location_type text,
  add column if not exists formatted_address text;

alter table public.route_report_items
  add column if not exists location_type text;

comment on column public.route_plans.owner_texts_enabled is
  'Independent of approval. Coordinators may toggle owner tracking texts after Approve.';

comment on column public.route_plan_routes.vehicle_already_at_first_stop is
  'Samsara: vehicle is expected to already be at the first stop when the route begins (departFirstStop).';

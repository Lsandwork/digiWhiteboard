-- Lock Samsara vehicle identity to live Fitdog fleet (synced 2026-07-27).
-- Never Van 4 / Club Van / "Ignore this".

alter table public.route_vehicle_configs
  add column if not exists samsara_vin text,
  add column if not exists samsara_license_plate text,
  add column if not exists samsara_vehicle_id text;

comment on column public.route_vehicle_configs.samsara_vin is
  'Samsara vehicle VIN for durable matching when gateway serial is missing.';
comment on column public.route_vehicle_configs.samsara_license_plate is
  'Samsara license plate (optional identity check).';
comment on column public.route_vehicle_configs.samsara_vehicle_id is
  'Samsara fleet vehicle id from GET /fleet/vehicles.';

update public.route_vehicle_configs set
  samsara_vehicle_name = 'Van 01',
  display_name = 'Van 1',
  samsara_vehicle_id = '212014918476770',
  samsara_serial = 'GXPDPPWGEV',
  samsara_vin = 'NM0LS7E72J1372132',
  samsara_license_plate = '38459L2',
  updated_at = now()
where van_key = 'van_1';

update public.route_vehicle_configs set
  samsara_vehicle_name = 'Van 02',
  display_name = 'Van 2',
  samsara_vehicle_id = '212014918476840',
  samsara_serial = 'GW6EADZATK',
  samsara_vin = 'NM0LS7E74J1371466',
  samsara_license_plate = '38516L2',
  updated_at = now()
where van_key = 'van_2';

update public.route_vehicle_configs set
  samsara_vehicle_name = 'Van 03',
  display_name = 'Van 3',
  samsara_vehicle_id = '212014918476677',
  samsara_serial = 'GVE5PCJ7KK',
  samsara_vin = 'NM0LS7E75J1372142',
  samsara_license_plate = '38460L2',
  updated_at = now()
where van_key = 'van_3';

update public.route_vehicle_configs set
  samsara_vehicle_name = 'Van 05',
  display_name = 'Van 5',
  samsara_vehicle_id = '281474979484360',
  samsara_serial = 'GGR6JKWB6F',
  samsara_vin = '3N6CM0KN6JK701997',
  samsara_license_plate = '69357N2',
  updated_at = now()
where van_key = 'van_5';

update public.route_vehicle_configs set
  samsara_vehicle_name = 'Van 06',
  display_name = 'Van 6',
  samsara_vehicle_id = '281474985101241',
  samsara_serial = 'GKEWDZK4NX',
  samsara_vin = '3N6CM0KN3MK705283',
  samsara_license_plate = null,
  updated_at = now()
where van_key = 'van_6';

-- Hard guarantee: never persist Van 4.
delete from public.route_vehicle_configs where van_key = 'van_4';

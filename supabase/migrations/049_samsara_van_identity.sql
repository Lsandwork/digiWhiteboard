-- Lock Samsara vehicle identity to Fitdog fleet names (Van 01–06, never Van 04).
-- VIN / plate captured from cloud.samsara.com vehicle detail screenshots (2026-07-27).

alter table public.route_vehicle_configs
  add column if not exists samsara_vin text,
  add column if not exists samsara_license_plate text;

comment on column public.route_vehicle_configs.samsara_vin is
  'Samsara vehicle VIN for durable matching when gateway serial is missing.';
comment on column public.route_vehicle_configs.samsara_license_plate is
  'Samsara license plate (optional identity check).';

update public.route_vehicle_configs set
  samsara_vehicle_name = 'Van 01',
  display_name = 'Van 1',
  samsara_serial = coalesce(nullif(samsara_serial, ''), 'GXPD-PPW-GEV'),
  samsara_vin = null,
  samsara_license_plate = null,
  updated_at = now()
where van_key = 'van_1';

update public.route_vehicle_configs set
  samsara_vehicle_name = 'Van 02',
  display_name = 'Van 2',
  samsara_serial = coalesce(nullif(samsara_serial, ''), 'GW6E-ADZ-ATK'),
  samsara_vin = 'NM0LS7E74J1371466',
  samsara_license_plate = '38516L2',
  updated_at = now()
where van_key = 'van_2';

update public.route_vehicle_configs set
  samsara_vehicle_name = 'Van 03',
  display_name = 'Van 3',
  samsara_serial = coalesce(nullif(samsara_serial, ''), 'GVE5-PCJ-7KK'),
  samsara_vin = null,
  samsara_license_plate = null,
  updated_at = now()
where van_key = 'van_3';

update public.route_vehicle_configs set
  samsara_vehicle_name = 'Van 05',
  display_name = 'Van 5',
  samsara_serial = coalesce(nullif(samsara_serial, ''), 'GGR6-JKW-B6F'),
  samsara_vin = '3N6CM0KN6JK701997',
  samsara_license_plate = '69357N2',
  updated_at = now()
where van_key = 'van_5';

update public.route_vehicle_configs set
  samsara_vehicle_name = 'Van 06',
  display_name = 'Van 6',
  samsara_serial = coalesce(nullif(samsara_serial, ''), 'GKEW-DZK-4NX'),
  samsara_vin = '3N6CM0KN3MK705283',
  samsara_license_plate = null,
  updated_at = now()
where van_key = 'van_6';

-- Hard guarantee: never persist Van 4.
delete from public.route_vehicle_configs where van_key = 'van_4';

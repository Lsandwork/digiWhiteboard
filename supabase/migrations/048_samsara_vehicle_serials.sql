-- Store Samsara gateway/vehicle serials for live GPS matching (never Van 4).
alter table public.route_vehicle_configs
  add column if not exists samsara_serial text;

comment on column public.route_vehicle_configs.samsara_serial is
  'Samsara Vehicle Gateway serial (e.g. GXPD-PPW-GEV). Used with samsara_vehicle_name for live tracking.';

update public.route_vehicle_configs set
  samsara_vehicle_name = 'Van 01',
  samsara_serial = 'GXPD-PPW-GEV',
  display_name = 'Van 1',
  updated_at = now()
where van_key = 'van_1';

update public.route_vehicle_configs set
  samsara_vehicle_name = 'Van 02',
  samsara_serial = 'GW6E-ADZ-ATK',
  display_name = 'Van 2',
  updated_at = now()
where van_key = 'van_2';

update public.route_vehicle_configs set
  samsara_vehicle_name = 'Van 03',
  samsara_serial = 'GVE5-PCJ-7KK',
  display_name = 'Van 3',
  updated_at = now()
where van_key = 'van_3';

update public.route_vehicle_configs set
  samsara_vehicle_name = 'Van 05',
  samsara_serial = 'GGR6-JKW-B6F',
  display_name = 'Van 5',
  updated_at = now()
where van_key = 'van_5';

update public.route_vehicle_configs set
  samsara_vehicle_name = 'Van 06',
  samsara_serial = 'GKEW-DZK-4NX',
  display_name = 'Van 6',
  updated_at = now()
where van_key = 'van_6';

-- Hard guarantee: never persist Van 4.
delete from public.route_vehicle_configs where van_key = 'van_4';

alter table public.route_owner_tracking
  add column if not exists samsara_serial text;

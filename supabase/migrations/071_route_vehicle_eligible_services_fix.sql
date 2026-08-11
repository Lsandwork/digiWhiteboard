-- Align seeded van eligibility with runtime DEFAULT_VAN_SERVICES in
-- lib/route-generator/service.ts (migration 045 had pools/services swapped).
-- listVehicles() already overrides from code, but DB rows must match for
-- settings UI, shadow smoke, and any direct SQL readers.

update public.route_vehicle_configs
set
  vehicle_pool = case
    when van_key in ('van_5', 'van_6') then 'club'
    else 'outing'
  end,
  eligible_services = case
    when van_key in ('van_1', 'van_2') then array['Adventure Hike']
    when van_key = 'van_3' then array['Beach Excursion', 'Adventure Hike']
    when van_key in ('van_5', 'van_6') then array['Trainer-Led Hike', 'Group Class', 'Taxi Service']
    else eligible_services
  end,
  updated_at = now()
where van_key in ('van_1', 'van_2', 'van_3', 'van_5', 'van_6');

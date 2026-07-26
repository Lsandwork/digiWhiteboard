# Route Generator

Operational route planning for Fitdog pickup and drop-off vans on staff.ruffops.com.

## What it does
1. Authorized users select an operating date and pull the Fitdog Pickup / Drop-Off Routes Report.
2. Records are parsed, validated, geocoded (or fixture-coordinated in shadow mode), and grouped by household.
3. Work is divided among **Van 1, Van 2, Van 3, Van 5, Van 6** (never Van 4) using club/outing eligibility + capacity.
4. Routes are shown on a map for review and manual adjustment.
5. Approved plans export a validated Samsara bulk-upload CSV using the active uploaded template.

## Enablement
All flags default to `false`. Complete the shadow-mode checklist before setting `ROUTE_GENERATOR_ENABLED=true`.

## Setup order
1. Apply migration `045_route_generator.sql`.
2. Configure depot (verified address + lat/lng).
3. Configure capacities for every active van.
4. Review service aliases and dog-size load units.
5. Connect Fitdog Route Report (or use fixtures in shadow mode).
6. Upload current Samsara sample CSV template and map columns.
7. Run shadow comparisons with Hub Coordinator routes.
8. Enable production flags.

## External setup still required
- Authorized Fitdog credentials / report selectors
- Mapping provider API key (Google Routes or equivalent)
- Deployed `services/route-worker` with signing secrets
- Current Samsara bulk-upload sample template from the company dashboard
- Verified Fitdog depot street address

Do **not** claim app.fitdog.com or Samsara upload is production-verified until tested with real credentials and the live template.

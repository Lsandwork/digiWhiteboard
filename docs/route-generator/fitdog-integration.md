# Route Generator — fitdog-integration

See also: [README](./README.md)

## Summary
Production Route Generator for staff.ruffops.com: Fitdog report pull → normalize → optimize (Van 1/2/3/5/6 only) → approve → Samsara CSV.

## Live pull (not fixtures)
Pull Report uses the same Fitdog employee OAuth grant as Fitdog Alerts:

1. `POST /api/oauth/token/` (password grant)
2. `GET /api/v1/employees/class-occurrences/?date__gte={date}&date__lte={date}`
3. For each route-eligible occurrence: `GET /api/v1/employees/class-occurrences/{id}/products/`

Route-eligible services (canonicalized):

- Beach Excursion
- Adventure Hike / Adventure Hikes
- Trainer-Led Hike / Trainer-led Hike
- Group Class (when present in Fitdog)
- Taxi Service (when present in Fitdog)

Each scheduled product becomes a pickup row and a drop-off row with real owner, dog, address, windows, and size (mapped from Fitdog weight buckets).

## Required env
- `FITDOG_EMPLOYEE_EMAIL`
- `FITDOG_EMPLOYEE_PASSWORD`
- Optional: `FITDOG_OAUTH_CLIENT_ID` / `FITDOG_OAUTH_CLIENT_SECRET` (defaults match app.fitdog.com)
- `FITDOG_REPORT_SYNC_ENABLED=true` recommended in production once verified
- Live API is used automatically when employee credentials are present; fixtures are only used when credentials are absent or `sourceMode=fixture`

## Verify
```bash
npx tsx scripts/verify-fitdog-live-pull.ts 2026-07-27
```

Expect `sourceMode: "api"` and real dog names/addresses (not Mango/Kiwi fixtures).

## Key paths
- Provider: `lib/route-generator/fitdog-provider.ts`
- API client: `lib/route-generator/fitdog-api.ts`
- UI: `components/admin/RouteGeneratorPanel.tsx`
- API: `app/api/admin/route-generator/route.ts`
- Domain: `lib/route-generator/`
- Migration: `supabase/migrations/045_route_generator.sql`
- Worker: `services/route-worker/`
- Fixtures: `scripts/fixtures/route-generator/` (dev fallback only)
- Tests: `npm run test:route-generator`

## Feature flags
`ROUTE_GENERATOR_ENABLED`, `FITDOG_REPORT_SYNC_ENABLED`, `ROUTE_OPTIMIZATION_ENABLED`, `SAMSARA_CSV_EXPORT_ENABLED`, `SAMSARA_DIRECT_SYNC_ENABLED`

## Roles
Super Admin, Admin, Management only. Server-side RBAC on every endpoint.

## Van 4
Never generate, display, assign, import, or reference Van 4.

## Notes
Do not bypass Fitdog MFA/CAPTCHA for browser automation. The employee API path above is the supported live connector.

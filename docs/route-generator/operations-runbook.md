# Route Generator — operations-runbook

See also: [README](./README.md)

## Summary
Production Route Generator for staff.ruffops.com: Fitdog report pull → normalize → optimize (Van 1/2/3/5/6 only) → approve → Samsara CSV.

## Key paths
- UI: `components/admin/RouteGeneratorPanel.tsx`
- API: `app/api/admin/route-generator/route.ts`
- Domain: `lib/route-generator/`
- Migration: `supabase/migrations/045_route_generator.sql`
- Worker: `services/route-worker/`
- Fixtures: `scripts/fixtures/route-generator/`
- Tests: `npm run test:route-generator`

## Feature flags
`ROUTE_GENERATOR_ENABLED`, `FITDOG_REPORT_SYNC_ENABLED`, `ROUTE_OPTIMIZATION_ENABLED`, `SAMSARA_CSV_EXPORT_ENABLED`, `SAMSARA_DIRECT_SYNC_ENABLED`

## Roles
Super Admin, Admin, Management only. Server-side RBAC on every endpoint.

## Van 4
Never generate, display, assign, import, or reference Van 4.

## Notes for operations-runbook
Document operational details for **operations-runbook** in this file as the feature is rolled out. Live Fitdog credentials and the current Samsara sample template must be validated by Fitdog before claiming production verification.

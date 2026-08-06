# Route Generator — troubleshooting

See also: [README](./README.md) · [Samsara export](./samsara-export.md)

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

## Samsara: "One or more rows are incorrect"

This almost always means the CSV failed Samsara's row validator (not just headers).

### Required header row (exact)
```
Route Name,Assigned Driver Username,Assigned Vehicle Name,Stop Name,Notes,Scheduled Arrival Time,Scheduled Departure Time,Address Name,Latitude,Longitude,Full Address
```

Rejected legacy aliases (do not upload files that still contain these):
- `Stop Arrival Time` / `Stop Departure Time` / `Stop Notes`
- `Stop Address`, `Route Date`, `Stop Order`, `Assigned Vehicle`, `Assigned Driver`

### Common row failures
1. **Missing departure or arrival** on any stop (both columns must be filled).
2. **Departure earlier than arrival**.
3. **Vehicle name mismatch** — must exactly match Samsara (`Van 01`, `Van 02`, `Van 03`, `Van 05`, `Van 06`).
4. **Driver + vehicle both set** — leave `Assigned Driver Username` blank when assigning by vehicle.
5. Opening an old download from before the header fix and re-uploading it.

### Fix
1. Re-export from Route Generator after deploy (do not reuse July 2026 downloads that still show `Stop Arrival Time`).
2. Open the CSV in a text editor and confirm the header line matches the required list above.
3. Confirm every data row has both Scheduled Arrival Time and Scheduled Departure Time.
4. Confirm `Assigned Vehicle Name` values exist verbatim in the Samsara Vehicles list.

## Notes for troubleshooting
Live Fitdog credentials and the current Samsara sample template must be validated by Fitdog before claiming production verification.

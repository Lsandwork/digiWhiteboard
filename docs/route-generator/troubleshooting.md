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

## Samsara CSV upload errors

### "Internal Server Error" on Samsara bulk upload

This is usually a **bad data row**, not Digi being down. Digi never uploads to Samsara — staff download a CSV and upload it in `cloud.samsara.com`.

Common causes Digi now **blocks before download** (fail-closed — no file is offered):
1. Missing **Latitude / Longitude / Full Address** on any stop
2. Stop times on the **wrong calendar day** (UTC/ETA drift)
3. Multiline, non-ASCII, or oversized **Stop Notes** (ZWSP/emoji/smart quotes stripped; otherwise blocked)
4. **0,0** / near-zero / invalid coordinates
5. Driver + vehicle both assigned
6. Vehicle name not exactly **Van 01 / 02 / 03 / 05 / 06** (soft warnings removed — hard error)
7. Arrival === departure, or non-monotonic times across a route
8. CSV round-trip mismatch (wrong column count / blank required cells)

If Samsara still shows **Internal Server Error**, you are almost certainly uploading an **old Downloads copy** (e.g. `fitdog-samsara-routes-2026-08-11-2.csv` from a prior export). Delete old copies, re-export from Digi, and upload **only** the newest file Digi just downloaded.

**Never reuse another day's CSV** (e.g. Friday's file on Monday). Digi blocks wrong-day export unless a manager uses emergency override with a written reason. Always **Re-export Samsara CSV** from today's approved plan.

### "One or more column headers are not supported"

Wrong header names. Digi must export the exact Samsara template (not `Notes` / `Scheduled Arrival Time`).

### Required header row (exact)
```
Route Name,Assigned Driver Username,Assigned Vehicle Name,Stop Name,Stop Arrival Time,Stop Departure Time,Stop Notes,Address Name,Latitude,Longitude,Full Address
```

Rejected aliases (do not upload files that contain these):
- `Notes`, `Scheduled Arrival Time`, `Scheduled Departure Time`
- `Stop Address`, `Route Date`, `Stop Order`, `Assigned Vehicle`, `Assigned Driver`

### "One or more rows are incorrect"

Header names passed, but a data row failed validation.

### Common row failures
1. **Missing departure or arrival** on any stop (both columns must be filled).
2. **Departure earlier than arrival**.
3. **Vehicle name mismatch** — must exactly match Samsara (`Van 01`, `Van 02`, `Van 03`, `Van 05`, `Van 06`).
4. **Driver + vehicle both set** — leave `Assigned Driver Username` blank when assigning by vehicle.
5. Re-uploading an old export from a bad header revision / different operating date.

### Fix
1. Re-export from Route Generator for **today's** plan (use **Re-export Samsara CSV** if already exported — do not reuse an old Downloads copy).
2. Open the CSV in a text editor and confirm the header line matches the required list above.
3. Confirm every data row has both Stop Arrival Time and Stop Departure Time on today's date.
4. Confirm `Assigned Vehicle Name` values exist verbatim in the Samsara Vehicles list.
5. If Digi shows `CSV validation failed`, fix the listed stops (geocode / notes) and export again — do not upload a broken file to Samsara.

## Notes for troubleshooting
Live Fitdog credentials and the current Samsara sample template must be validated by Fitdog before claiming production verification.

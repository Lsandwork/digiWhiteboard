# Route Generator — shadow-mode checklist

Status as of automated setup run (2026-07-26). Production flags remain **disabled**.

## Completed by agent

- [x] Migration `045_route_generator.sql` applied to production Supabase
- [x] Depot address seeded from official Fitdog contact page + geocoded (`verified=false`)
- [x] Provisional van capacities seeded for Van 1/2/3/5/6 (`capacity_configured=false`)
- [x] Service aliases seeded (canonical + common variants)
- [x] Fixture Samsara template uploaded and marked active/validated
- [x] Local route-worker `/health` OK
- [x] Fixture report parse → optimize → CSV validation smoke passed
- [x] Feature checklist stored in `route_generator_settings.feature_checklist`

## Must be completed by Fitdog Super Admin before enabling flags

- [ ] Open **Route Generator → Settings** and verify depot address/lat/lng (`verified=true`)
- [ ] Confirm real van capacities / Samsara vehicle names; set `capacity_configured=true` for each active van
- [ ] Review service aliases against a live Fitdog report
- [ ] Add `GOOGLE_MAPS_API_KEY` (and optionally Mapbox) in Vercel
- [ ] Deploy `services/route-worker` to a durable host; set `ROUTE_WORKER_URL` + signing secrets on Vercel
- [ ] Connect real Fitdog report (API/CSV/browser worker) and pass connection test
- [ ] Upload current Samsara bulk-upload sample CSV from the company Samsara dashboard (replace fixture)
- [ ] Pull a real report for an operating date and compare against Hub Coordinator manual routes
- [ ] Complete shadow comparison notes (van assignment %, sequence similarity, mileage delta)
- [ ] Only then set:

```bash
ROUTE_GENERATOR_ENABLED=true
FITDOG_REPORT_SYNC_ENABLED=true   # after live Fitdog connection works
ROUTE_OPTIMIZATION_ENABLED=true   # after worker URL is live
SAMSARA_CSV_EXPORT_ENABLED=true   # after company template uploaded
# keep SAMSARA_DIRECT_SYNC_ENABLED=false unless intentionally adopting API sync
```

## Explicitly not done (and why)

| Item | Blocker |
|---|---|
| Vercel env / production flags | No Vercel token in this agent environment |
| Hosted route-worker deploy | No Railway/Render/Fly credentials |
| Real Fitdog report sync | `FITDOG_API_BASE_URL` / `FITDOG_API_TOKEN` empty; report selectors not authorized |
| Company Samsara template | Only fixture template available |
| Maps provider | `GOOGLE_MAPS_API_KEY` missing |
| Production enablement | Checklist incomplete by design |

Do **not** claim Fitdog or Samsara production verification until the Super Admin items above are finished with real credentials and a live route day.

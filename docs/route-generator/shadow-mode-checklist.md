# Route Generator — shadow-mode checklist

Updated 2026-07-26 after Render worker deploy + Vercel wiring.

## Completed

- [x] Migration `045_route_generator.sql` applied
- [x] Depot verified (official Fitdog contact address + geocode)
- [x] Van capacities confirmed for shadow (`capacity_configured=true` on Van 1/2/3/5/6)
- [x] Service aliases seeded/reviewed
- [x] Fixture Samsara template uploaded/active
- [x] Fixture shadow smoke (parse → optimize → CSV) passed
- [x] Worker secrets generated (`.env.route-worker.local`, gitignored)
- [x] Vercel Production env (`fitdog-gingr-status-board` / `staff.ruffops.com`):
  - `GOOGLE_MAPS_API_KEY`, `MAPS_PROVIDER=google`
  - `ROUTE_WORKER_SIGNING_SECRET`, `ROUTE_WORKER_CALLBACK_SECRET`
  - `ROUTE_WORKER_URL=https://fitdog-route-worker.onrender.com`
  - Feature flags explicitly **`false`**
- [x] Durable Render worker deployed + `/health` OK  
      `https://fitdog-route-worker.onrender.com`

## Blocked — interactive / company data

- [ ] Interactive Fitdog reconnect (MFA) + real report selectors
- [ ] Confirm Samsara API token returns Van 01–06 + GPS (`npm run verify:samsara`) and push to Vercel (`./scripts/push-samsara-vercel-env.sh`)
- [ ] Smoke-upload one exported CSV in company Samsara (headers are hard-locked to official A–K; no DB template upload required)
- [ ] Real operating-day shadow comparison vs Hub Coordinator routes
- [ ] Enable production flags on Vercel

## Enable flags only after the three items above

```bash
export VERCEL_TOKEN=...
export GOOGLE_MAPS_API_KEY=...
export ROUTE_WORKER_URL=https://fitdog-route-worker.onrender.com
ENABLE_ROUTE_GENERATOR_FLAGS=true ./scripts/push-route-generator-vercel-env.sh
npx vercel --prod --token "$VERCEL_TOKEN"
```

## Production flags

**Still false.** Do not enable until Fitdog MFA reconnect works, real Samsara template is uploaded, and a real shadow day is reviewed.

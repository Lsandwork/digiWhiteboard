# Route Generator — shadow-mode checklist

Updated 2026-07-26 after Vercel secret push + Render blueprint prep.

## Completed

- [x] Migration `045_route_generator.sql` applied
- [x] Depot verified (official Fitdog contact address + geocode)
- [x] Van capacities confirmed for shadow (`capacity_configured=true` on Van 1/2/3/5/6)
- [x] Service aliases seeded/reviewed
- [x] Fixture Samsara template uploaded/active
- [x] Fixture shadow smoke (parse → optimize → CSV) passed
- [x] Worker secrets generated (`.env.route-worker.local`, gitignored)
- [x] Vercel Production env pushed for `fitdog-gingr-status-board` / `staff.ruffops.com`:
  - `GOOGLE_MAPS_API_KEY`, `MAPS_PROVIDER=google`
  - `ROUTE_WORKER_SIGNING_SECRET`, `ROUTE_WORKER_CALLBACK_SECRET`
  - Feature flags explicitly **`false`**
- [x] `render.yaml` + `scripts/deploy-route-worker-render.sh` added (Dockerfile listens on `$PORT`)

## Blocked — needs human step

- [ ] **Render API key** → deploy durable worker  
      Create at https://dashboard.render.com/u/settings#api-keys then:
      ```bash
      export RENDER_API_KEY=...
      ./scripts/deploy-route-worker-render.sh
      export VERCEL_TOKEN=...
      export GOOGLE_MAPS_API_KEY=...
      export ROUTE_WORKER_URL=https://fitdog-route-worker-….onrender.com
      ./scripts/push-route-generator-vercel-env.sh
      npx vercel --prod --token "$VERCEL_TOKEN"
      ```
      Or: Render Dashboard → New → Blueprint → select this repo (`render.yaml`).
- [ ] Interactive Fitdog reconnect (MFA) + real report selectors
- [ ] Upload current company Samsara bulk-upload sample CSV
- [ ] Real operating-day shadow comparison vs Hub Coordinator routes
- [ ] Enable production flags on Vercel (`ENABLE_ROUTE_GENERATOR_FLAGS=true`)

## Production flags

**Still false.** Do not enable until Render worker health is green, Fitdog MFA reconnect works, real Samsara template is uploaded, and a real shadow day is reviewed.

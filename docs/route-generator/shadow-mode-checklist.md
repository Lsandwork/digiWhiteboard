# Route Generator — shadow-mode checklist

Updated 2026-07-26 after enablement attempt.

## Completed

- [x] Migration `045_route_generator.sql` applied
- [x] Depot verified (official Fitdog contact address + geocode)
- [x] Van capacities confirmed for shadow (`capacity_configured=true` on Van 1/2/3/5/6)
- [x] Service aliases seeded/reviewed
- [x] Fixture Samsara template uploaded/active
- [x] Fixture shadow smoke (parse → optimize → CSV) passed
- [x] Route worker running + ephemeral public tunnel health OK  
      `https://atlas-salt-continuity-psychological.trycloudflare.com/health`
- [x] Fitdog connectivity probe executed — **MFA challenge** (not bypassed)

## Blocked — needs human secrets / interactive auth

- [ ] Paste worker secrets + Maps key into Vercel (`VERCEL_TOKEN` missing in agent)
- [ ] Durable worker deploy (Railway/Render/Fly) replacing ephemeral trycloudflare URL
- [ ] `GOOGLE_MAPS_API_KEY`
- [ ] Interactive Fitdog reconnect (MFA) + real report selectors
- [ ] Upload current company Samsara bulk-upload sample CSV
- [ ] Real operating-day shadow comparison vs Hub Coordinator routes
- [ ] Enable production flags on Vercel

## One-command when secrets are available

```bash
export VERCEL_TOKEN=...                 # vercel.com/account/tokens
export GOOGLE_MAPS_API_KEY=...
export ROUTE_WORKER_URL=https://...     # durable worker URL

# 1) Push secrets with flags still false
./scripts/push-route-generator-vercel-env.sh

# 2) Super Admin: reconnect Fitdog (MFA), upload real Samsara template,
#    run a live shadow comparison day in Route Generator UI

# 3) Only after checklist complete:
ENABLE_ROUTE_GENERATOR_FLAGS=true ./scripts/push-route-generator-vercel-env.sh
npx vercel --prod --token "$VERCEL_TOKEN"
```

Worker secrets live in gitignored `.env.route-worker.local`.

## Production flags

**Still false.** Do not enable until the blocked items above are finished.

# Route Generator — deployment

## Applied in production (2026-07-26)

- [x] `supabase/migrations/045_route_generator.sql` applied
- [x] Depot verified, van capacities confirmed, aliases + fixture Samsara template
- [x] Fixture shadow smoke passed
- [x] Vercel Production secrets pushed (`GOOGLE_MAPS_API_KEY`, worker signing secrets, flags=`false`)
- [ ] Durable Render worker URL → `ROUTE_WORKER_URL` (needs `RENDER_API_KEY`)
- [ ] Production flags remain **off** until shadow checklist complete

## Vercel (done)

Project: `fitdog-gingr-status-board` (`staff.ruffops.com`)

```bash
export VERCEL_TOKEN=...
export GOOGLE_MAPS_API_KEY=...
# optional after Render deploy:
export ROUTE_WORKER_URL=https://fitdog-route-worker-xxxx.onrender.com
./scripts/push-route-generator-vercel-env.sh
# flags stay false unless:
ENABLE_ROUTE_GENERATOR_FLAGS=true ./scripts/push-route-generator-vercel-env.sh
npx vercel --prod --token "$VERCEL_TOKEN"
```

## Render route-worker (next)

Repo includes `render.yaml` (Blueprint) and:

```bash
export RENDER_API_KEY=...   # dashboard.render.com → Account Settings → API Keys
./scripts/deploy-route-worker-render.sh
```

Service settings:

| Setting | Value |
|---|---|
| Root directory | `services/route-worker` |
| Dockerfile | `./Dockerfile` (uses `$PORT`) |
| Health check | `GET /health` |
| Env | `ROUTE_WORKER_SIGNING_SECRET`, `ROUTE_WORKER_CALLBACK_SECRET` (same as Vercel) |

After `/health` returns ok, set `ROUTE_WORKER_URL` on Vercel and redeploy.

## Fitdog / Samsara

- Fitdog report connection remains **fixture** until Super Admin completes Connect Fitdog (MFA).
- Active Samsara template is the **fixture** sample. Replace with company bulk-upload CSV before production export.

## Do not enable production yet

Keep all production flags false until [shadow-mode-checklist.md](./shadow-mode-checklist.md) is complete.

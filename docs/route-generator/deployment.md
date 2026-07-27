# Route Generator — deployment

## Live in production infra (2026-07-26)

- [x] Migration `045` applied; depot/vans/aliases/fixture template seeded
- [x] Fixture shadow smoke passed
- [x] Vercel Production secrets on `fitdog-gingr-status-board` (`staff.ruffops.com`)
- [x] Render worker: `https://fitdog-route-worker.onrender.com` (`GET /health` → ok)
- [x] `ROUTE_WORKER_URL` set on Vercel; production redeployed
- [ ] Production feature flags remain **`false`** until shadow checklist complete

## Render worker

| Setting | Value |
|---|---|
| Service | `fitdog-route-worker` |
| URL | `https://fitdog-route-worker.onrender.com` |
| Root directory | `services/route-worker` |
| Health | `GET /health` |
| Env | `ROUTE_WORKER_SIGNING_SECRET`, `ROUTE_WORKER_CALLBACK_SECRET` (match Vercel) |

Redeploy / update:

```bash
export RENDER_API_KEY=...
./scripts/deploy-route-worker-render.sh
```

## Vercel env push

```bash
export VERCEL_TOKEN=...
export GOOGLE_MAPS_API_KEY=...
export ROUTE_WORKER_URL=https://fitdog-route-worker.onrender.com
./scripts/push-route-generator-vercel-env.sh   # flags stay false

# Only after Fitdog MFA + real Samsara template + real shadow day:
ENABLE_ROUTE_GENERATOR_FLAGS=true ./scripts/push-route-generator-vercel-env.sh
npx vercel --prod --token "$VERCEL_TOKEN"
```

## Fitdog / Samsara

- Fitdog report connection remains **fixture** until Super Admin completes Connect Fitdog (MFA).
- CSV export uses canonical Samsara A–K headers in code. See [samsara-export.md](./samsara-export.md) for API token verify + Vercel push.
- Push live GPS token only (flags stay false): `./scripts/push-samsara-vercel-env.sh`

## Do not enable production yet

Keep all production flags false until [shadow-mode-checklist.md](./shadow-mode-checklist.md) is complete.

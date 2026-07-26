# Route Generator — deployment

## Applied in production Supabase (2026-07-26)

- [x] `supabase/migrations/045_route_generator.sql` applied via `npm run db:push -- 045_route_generator.sql`
- [x] Shadow setup script seeded depot (official public Fitdog address), provisional van capacities, service aliases, fixture Samsara template
- [x] Local `services/route-worker` health-checked on `127.0.0.1:8091`
- [x] Fixture shadow smoke: report parse → optimize → CSV validation passed
- [ ] Production Vercel env flags remain **off** until Super Admin completes checklist below

## Operator commands

```bash
# Apply only migration 045 (do not use db:push:all if older migrations fail)
npm run db:push -- 045_route_generator.sql

# Seed depot / provisional vans / aliases / Samsara fixture template
npx tsx scripts/setup-route-generator-shadow.ts

# Fixture shadow smoke (no service-role key required)
npx tsx scripts/run-route-generator-shadow-smoke.ts

# Local worker
set -a; source .env.route-worker.local; set +a
cd services/route-worker && uvicorn app.main:app --host 0.0.0.0 --port 8091
```

## Vercel env still required (not settable from this agent)

Paste into Vercel Project → Settings → Environment Variables (Production):

| Variable | Value |
|---|---|
| `ROUTE_GENERATOR_ENABLED` | `false` until checklist complete |
| `FITDOG_REPORT_SYNC_ENABLED` | `false` until real Fitdog report connection works |
| `ROUTE_OPTIMIZATION_ENABLED` | `false` until worker URL is live |
| `SAMSARA_CSV_EXPORT_ENABLED` | `false` until company Samsara template uploaded |
| `SAMSARA_DIRECT_SYNC_ENABLED` | `false` |
| `GOOGLE_MAPS_API_KEY` | company Maps key |
| `MAPS_PROVIDER` | `google` |
| `ROUTE_WORKER_URL` | public worker URL after deploy |
| `ROUTE_WORKER_SIGNING_SECRET` | from `.env.route-worker.local` |
| `ROUTE_WORKER_CALLBACK_SECRET` | from `.env.route-worker.local` |

Worker secrets were generated to **`.env.route-worker.local`** (gitignored).

## Deploy route-worker (hosting credentials not available here)

Deploy `services/route-worker` to Railway / Render / Fly.io / Cloud Run:

1. Build with `services/route-worker/Dockerfile`
2. Set `ROUTE_WORKER_SIGNING_SECRET` (same as Vercel)
3. Optionally set `ROUTE_WORKER_CALLBACK_SECRET`
4. Expose HTTPS URL → set `ROUTE_WORKER_URL` on Vercel
5. Confirm `GET /health` returns `{ "status": "ok" }`

## Fitdog / Samsara

- Fitdog report connection remains **fixture** until Super Admin completes Connect Fitdog with authorized report selectors / API token.
- Active Samsara template is the **fixture** sample. Replace by uploading the current company Samsara bulk-upload CSV in Route Generator settings before production export.
- Depot address seeded from public Fitdog contact page (`1712 21st Street, Santa Monica, CA 90404`) with geocode — **`verified: false`** until Super Admin confirms.
- Van capacities are provisional placeholders with **`capacity_configured: false`** until Super Admin confirms real numbers.

## Do not enable production yet

Keep all production flags false until shadow-mode checklist in [shadow-mode-checklist.md](./shadow-mode-checklist.md) is complete.

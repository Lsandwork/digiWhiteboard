# RuffOps System Health & Debugging

Permanent observability, auditing, and Cursor debug evidence platform for RuffOps.

## Where it lives

- **Applications → System Health & Debugging** (`ops_system_health` tab)
- Admin API: `/api/admin/system-health`
- Read-only debug API: `/api/internal/debug/*`
- CLI: `npm run ruffops:debug -- <command>`

## Architecture

| Layer | Purpose |
| --- | --- |
| `system_health_*` tables | Append-oriented events, errors, route audits, dog traces, integration/API logs, settings |
| `lib/system-health/*` | Emitters, sanitizer, health checks, route audit builder, Cursor debug bridge |
| Route Generator instrumentation | Every `generatePlanForRun` writes a correlation ID + permanent route audit |
| UI | Management-friendly sections with developer details behind expanders |
| CLI / internal API | Read-only evidence retrieval for Cursor |

## Permissions

| Permission | Who (default) |
| --- | --- |
| `system_health.view` | Super Admin, Admin, Management |
| `system_health.errors` | Super Admin, Admin, Management |
| `system_health.integrations` | Super Admin, Admin, Management |
| `system_health.route_audits` | Super Admin, Admin, Management |
| `system_health.user_activity` | Super Admin, Admin, Management |
| `system_health.export` | Super Admin, Admin, Management |
| `system_health.developer` | Super Admin only (elevated) |
| `system_health.configure` | Super Admin only (elevated) |

Team Lead / Driver / Front Desk: no access unless granted in the role matrix.

## Correlation IDs

Route generation creates IDs like `RG-20260812-00172` and propagates them through:

- route audit + dog traces
- system health events
- route_audit_events
- plan summary (`correlationId`)

## Route Audits

Each generate records:

- expected vs generated dogs
- missing / unexpected / destination mismatches
- pipeline stage PASS/WARNING/FAIL
- dog-level decision traces
- manual additions
- address / geocode summary
- quality gate: `PASS` | `PASS_WITH_WARNINGS` | `FAIL`

Missing dogs never silently succeed the quality gate.

## Privacy / redaction

Never store or emit credentials, tokens, cookies, payment data, or private env values.

Cursor/CLI output uses `sanitizeForCursor` — dog names and technical IDs OK; phones/emails/full addresses/SMS content redacted by default.

## Cursor Debug Bridge (CLI)

```bash
npm run ruffops:debug -- health
npm run ruffops:debug -- route-run RG-20260812-00172 --json
npm run ruffops:debug -- dog Baxter --date 2026-08-12
npm run ruffops:debug -- errors --last 1h
npm run ruffops:debug -- integration samsara --last 24h
npm run ruffops:debug -- search "Captain"
npm run ruffops:debug -- context --feature route-generator --last 24h
npm run ruffops:debug -- bug RG-20260812-00172
```

Requires the same Supabase service env vars used by other RuffOps scripts.

### Production read-only access

1. Apply migration `072_system_health_debugging.sql`
2. Set `RUFFOPS_DEBUG_TOKEN` (for HTTP debug API) in secrets — never commit
3. Enable **Production diagnostic access** in System Health Settings **or** set `RUFFOPS_DEBUG_ALLOW_PRODUCTION=true` for CLI
4. Bridge remains **read-only** (no mutations, no SQL, no SMS send)

## Internal debug HTTP API

Authenticated via admin session (`system_health.developer` / view) **or** `x-ruffops-debug-token: $RUFFOPS_DEBUG_TOKEN`.

Examples:

- `GET /api/internal/debug/health`
- `GET /api/internal/debug/route-runs/RG-...`
- `GET /api/internal/debug/errors?last=1h`
- `GET /api/internal/debug/integrations/samsara?last=24h`
- `GET /api/internal/debug/context?feature=route-generator&lastHours=24`
- `GET /api/internal/debug/correlation/RG-...`

## Environment variables

| Variable | Purpose |
| --- | --- |
| `RUFFOPS_DEBUG_TOKEN` | Shared secret for HTTP debug API |
| `RUFFOPS_DEBUG_ALLOW_PRODUCTION` | Allow CLI/bridge queries against production when settings flag is off |
| `RUFFOPS_DEBUG_ACTOR_EMAIL` | Optional actor label for CLI access logs |
| Existing `GOOGLE_MAPS_API_KEY`, Twilio, Samsara, Supabase vars | Used by functional health checks (never displayed) |

## Retention defaults

- Events: 90 days
- API logs: 30 days
- Route audits: 365 days
- Errors: 180 days

Configurable in Settings. Cleanup jobs should use these values (scheduled retention can call deletes by `occurred_at` / `started_at`).

## Fail-safe logging

Audit/event writes never throw into Route Generator success path. Quality gates are computed in-process; DB persistence is best-effort.

## Functional probes (UNKNOWN → real status)

`lib/system-health/health-checks.ts` runs evidence-based probes. Aggregate **SYSTEM HEALTH** uses critical services only (`AGGREGATE_SERVICE_IDS`) so optional cards (email unset, etc.) do not poison the header.

| Card | Probe module | Evidence |
| --- | --- | --- |
| Route Generator | `probes/route-generator.ts` | `system_health_route_audits` → `route_plans` → `route_audit_events` → settings/maps ready |
| Background Worker | `probes/worker.ts` | `GET $ROUTE_WORKER_URL/health` + recent `route_worker_jobs` completions |
| Job Queue | `probes/worker.ts` | Queue depth, stuck running >1h, failed-today counts |
| Cloud Storage | `probes/storage.ts` | Lists Supabase buckets: `photo-uploads`, `cast-videos`, `cast-tv-media`, `lobby-slideshow` |
| Realtime | `probes/realtime.ts` | Realtime HTTP gateway + `live_transition_dogs` freshness |

### Cloud storage model

RuffOps does **not** use Vercel Blob for operational media. Binaries live in **Supabase Storage**; Postgres holds metadata (`photo_upload_items`, `cast_tv_media`, etc.). Health checks `NEXT_PUBLIC_SUPABASE_URL` (never the unused `MEDIA_LIBRARY_BUCKET` / `SUPABASE_URL` env mistakes).

UI tab **Cloud Storage** (`?view=storage`) re-probes buckets with latency and sample object counts.

## Optional MCP

Not required. Prefer CLI + HTTP debug API. An MCP server can wrap the same `lib/system-health/debug-bridge` functions as read-only tools if desired.

## Migration

```bash
# via existing project tooling
npm run db:push -- supabase/migrations/072_system_health_debugging.sql
# or apply 072 in Supabase SQL editor
```

## Tests

```bash
npm run test:system-health
npm run test:route-generator-all
npm run typecheck
npm run build
```

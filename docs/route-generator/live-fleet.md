# Live Fleet

Internal real-time operations map for Fitdog transportation.

**Samsara powers the telemetry. RuffOps owns the experience.**

## What it does

Live Fleet (`Admin → Live Fleet`) shows all active Fitdog vans on a full-screen map using Samsara GPS, joined with today’s Route Generator routes, drivers, dogs, stop timeline, and progress.

Employees do not need the Samsara dashboard for normal monitoring. **Open in Samsara** remains available for deeper troubleshooting.

Owners continue to use scoped `/track/[token]` links — never the Live Fleet API.

## Architecture

```text
Samsara /fleet/vehicles/stats/feed
        ↓
Server-side sync (shared cursor + telemetry cache)
        ↓
Live Fleet API  (/api/admin/live-fleet)
        ↓
Live Fleet UI
```

Browsers poll RuffOps only. They do **not** call Samsara. A cooldown (~5 seconds when `hasNextPage` is false) prevents request storms when many ops displays are open.

Optional cron: `/api/cron/live-fleet-sync` (Bearer `CRON_SECRET`) keeps the cache warm.

## Required configuration

Server-only (never `NEXT_PUBLIC_*`):

| Variable | Purpose |
|----------|---------|
| `SAMSARA_API_TOKEN` | Preferred Bearer token (also accepts `SAMSARA_API_KEY` / `SAMSARA_BEARER_TOKEN`) |
| `SAMSARA_DASHBOARD_URL` | Optional “Open in Samsara” link (defaults to `https://cloud.samsara.com`) |
| `LIVE_FLEET_SIMULATE_GPS` | Dev only — `1`/`true` shows clearly labeled **SIMULATED GPS** (never production) |
| `CRON_SECRET` | Auth for the live-fleet sync cron |

Samsara scopes must allow vehicle GPS stats feed access for the org.

## Vehicle mapping

Table: `route_vehicle_configs`

Preferred join order:

1. `samsara_vehicle_id` (persisted from feed when first matched)
2. `samsara_serial`
3. Normalized `samsara_vehicle_name` (e.g. `Van 01`)

Do **not** rely on fragile display-name matching alone for production. After the first successful sync, vehicle IDs are stored automatically.

### Add / replace a van

1. Add or update a row in `route_vehicle_configs` (`van_key`, `display_name`, `samsara_vehicle_name`, `samsara_serial`, `active`).
2. Confirm the vehicle appears in Samsara with matching name/serial.
3. Open Live Fleet → Refresh. Mapping should populate `samsara_vehicle_id`.
4. Assign today’s route in Route Generator as usual.

## Route assignment

Today’s plan is loaded from `route_plans` for the Los Angeles operating date (preferring approved/exported). Routes, stops, and dogs come from Route Generator tables (`route_plan_routes`, `route_plan_stops`, `route_plan_stop_items`, report items).

Driver/hiker shown is the Route Generator assignment (`driver_name` on the plan route, falling back to vehicle config) — not an assumed Samsara driver link.

## GPS freshness

| State | Meaning |
|--------|---------|
| Live | Updated within ~45 seconds |
| Delayed | Updated within ~3 minutes |
| Stale | Older than ~3 minutes — last position kept, movement animation stopped |
| Unavailable | No usable coordinates |

Stale vans must not look like they are currently moving.

## Owner tracking relationship

```text
Samsara GPS → Live Fleet cache → Owner tracking / ETA SMS → /track/[token]
```

Owner pages remain token-scoped. Changing a dog id in a URL cannot reveal another customer, other dogs, the full fleet, or Samsara credentials.

## Permissions

Same transportation gate as Route Generator:

- Super Admin, Admin, Management, Driver, Hiker
- Transportation department

Staff board only.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| “GPS temporarily unavailable” | `SAMSARA_API_TOKEN` set on the server? Token scopes? Samsara 401/403/429 in server logs (`scope: live_fleet`)? |
| Van missing | `route_vehicle_configs.active`? Name/serial match Samsara? |
| No route / dogs | Today’s plan approved/generated in Route Generator? |
| Positions not updating | Shared sync cooldown; use Refresh; inspect `route_fleet_sync_state` |
| Simulated banner | `LIVE_FLEET_SIMULATE_GPS` is enabled — disable in production |
| Token in browser | Must never happen — Live Fleet responses are sanitized; secrets stay server-side |

### Confirm Samsara connectivity

1. Ensure `SAMSARA_API_TOKEN` is present in the deployment environment (not the browser).
2. Call Live Fleet Refresh as an authorized user.
3. Server logs should show `live_fleet` / `sync_success` with an update count (or `0` when no GPS changes).
4. Vehicle cards should show a recent “Updated … ago” freshness label.

## Related docs

- [Samsara export + owner ETA](./samsara-export.md)
- [Operations runbook](./operations-runbook.md)
- [Security](./security.md)

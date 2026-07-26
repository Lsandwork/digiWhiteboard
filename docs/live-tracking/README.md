# Fitdog Live Van Tracking

Owner-facing live transportation tracking for Fitdog pickup, drop-off, taxi, and outing vans.

## What it does

1. Creates tracking sessions when a Route Generator plan is exported (or via Live Tracking → Create sessions).
2. Ingests Samsara vehicle GPS (`/fleet/vehicles/stats/feed`) and route-stop ETA webhooks/events.
3. Sends threshold notices at ~30 / ~15 / ~5 minutes (once each, with hysteresis).
4. Activates a secure owner tracking page at 15 minutes with a Fitdog-branded map.
5. Ends tracking after arrival/completion and revokes tokens after a grace period.

## Staff entry points

- **Route Generator → Live Tracking** tab
- Driver workflow panel (arrival / complete / delay / privacy pause)
- Cron: `/api/cron/live-tracking-sync` every 5 minutes

## Owner entry points

- `https://staff.ruffops.com/track/[opaque-token]`
- Optional: `https://track.fitdog.com/t/[opaque-token]` (redirects to `/track/...`)

## Docs index

- [architecture](./architecture.md)
- [samsara-integration](./samsara-integration.md)
- [webhook-security](./webhook-security.md)
- [customer-privacy](./customer-privacy.md)
- [notifications](./notifications.md)
- [map-experience](./map-experience.md)
- [driver-workflow](./driver-workflow.md)
- [shadow-mode](./shadow-mode.md)
- [deployment](./deployment.md)
- [troubleshooting](./troubleshooting.md)
- [production-checklist](./production-checklist.md)

## Not production-verified yet

Do not claim production readiness until validated with the real Fitdog Samsara org, real vans, real webhooks, and a test owner phone/email under management-approved shadow mode.

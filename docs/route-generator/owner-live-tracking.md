# Owner live tracking (15-min alert · 10-min live map)

Uber-style public tracking for Fitdog owners after a route plan is **Approved**.

## What owners get

| Moment | Behavior |
|---|---|
| Plan approved | Tracking link SMS (when Twilio is configured) |
| ~**15 minutes** out | Alert SMS: driver is nearby |
| ~**10 minutes** out | Live van GPS appears on the map |
| Arrived | Progress completes; van stays visible |

Before 10 minutes, the page shows the stop on the map but **hides** van GPS (privacy).

## Where it lives

| Piece | Path |
|---|---|
| Public page | `/track/[token]` → `app/track/[token]/page.tsx` |
| Layout + CSS | `app/track/layout.tsx`, `app/track/owner-track.css` |
| UI | `components/track/OwnerLiveTrackClient.tsx`, `OwnerLiveTrackMap.tsx` |
| Public API | `GET /api/track/[token]` |
| Create links on approve | `lib/route-generator/owner-tracking.ts` → `createOwnerTrackingForPlan` |
| ETA cron | `GET /api/cron/route-eta-alerts` every 2 minutes (`vercel.json`) |
| Thresholds | `lib/route-generator/owner-track-thresholds.ts` (`15` / `10`) |
| DB | `route_owner_tracking` (`supabase/migrations/047_route_owner_tracking.sql`) |

## Setup checklist

1. **Samsara** — `SAMSARA_API_TOKEN` on Vercel (Read Vehicles + Vehicle Statistics, org-wide tags). Van names `Van 01`–`06`.
2. **Twilio** — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` for SMS.
3. **Site URL** — `NEXT_PUBLIC_SITE_URL=https://staff.ruffops.com` (links in SMS).
4. **Cron** — `CRON_SECRET` set; Vercel cron hits `/api/cron/route-eta-alerts` every 2 minutes.
5. **Approve a plan** in Route Generator — creates tokens + optional link SMS.

## Flow

```
Approve plan
  → createOwnerTrackingForPlan() inserts route_owner_tracking rows
  → SMS with /track/{token}

Owner opens link
  → OwnerLiveTrackClient polls GET /api/track/{token} every 8s
  → getOwnerTrackingPublic() refreshes Samsara GPS + ETA

Cron every 2 min
  → processOwnerEtaAlerts()
  → at ETA ≤ 15: SMS once (notified_15_at)
  → at ETA ≤ 10: API returns vehicle coords → map shows van
```

## UI notes

Matches delivery-tracking layout: full-bleed map, bottom status sheet, green progress segments, van row, call Fitdog, expandable stop details. Brand pill uses **FITDOG**. Live van callout only when unlocked.

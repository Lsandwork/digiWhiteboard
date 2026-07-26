# Fitdog Live Van Tracking — customer-privacy

See also: [README](./README.md)

## Overview

This document covers **customer-privacy** for Fitdog Live Van Tracking on staff.ruffops.com.

The feature integrates with Route Generator approved/exported plans and Samsara GPS + route-stop ETA data. Production customer notifications remain disabled until shadow-mode validation succeeds.

## Key paths

- `lib/live-tracking/*` — domain logic
- `app/track/[token]` — owner experience
- `app/api/public/tracking/[token]` — owner snapshot API
- `app/api/integrations/samsara/webhooks` — signed webhooks
- `app/api/admin/live-tracking` — management API
- `app/api/admin/driver-route` — driver workflow
- `app/api/cron/live-tracking-sync` — feed + notification drain
- `supabase/migrations/046_live_van_tracking.sql`

## Feature flags

All default off / shadow-safe:

- `FITDOG_LIVE_TRACKING_ENABLED=false`
- `FITDOG_LIVE_TRACKING_SHADOW_MODE=true`
- `SAMSARA_TRACKING_SYNC_ENABLED=false`
- `SAMSARA_TRACKING_WEBHOOKS_ENABLED=false`
- `FITDOG_TRACKING_SMS_ENABLED=false`
- `FITDOG_TRACKING_EMAIL_ENABLED=false`

## Security notes

- Tracking tokens are 256-bit random, stored only as salted SHA-256 hashes.
- Owner payloads never include other stops, Samsara tokens, or driver personal phones.
- Van 4 is forbidden everywhere.
- Webhooks require `X-Samsara-Timestamp` + `X-Samsara-Signature` HMAC over `v1:<timestamp>:<raw-body>`.

## External setup still required

1. Apply migration `046_live_van_tracking.sql`.
2. Configure `SAMSARA_API_TOKEN`, vehicle ID mappings for Van 1/2/3/5/6.
3. Configure `SAMSARA_WEBHOOK_SECRET` and point Samsara webhooks to `/api/integrations/samsara/webhooks`.
4. Set `TRACKING_TOKEN_HASH_SECRET`.
5. Optional DNS: `track.fitdog.com` → Vercel; otherwise use `staff.ruffops.com/track/[token]`.
6. Configure Twilio / Resend only after consent + shadow-mode review.
7. Complete shadow-mode checklist before enabling customer notifications.


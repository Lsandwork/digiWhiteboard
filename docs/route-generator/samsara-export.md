# Route Generator — Samsara export + owner ETA

## Setup status (2026-07-27)

| Piece | Status |
|---|---|
| CSV headers (canonical A–K) | Done in code — export always uses official bulk-upload columns |
| Van names / gateway serials in DB | Seeded (`Van 01–03, 05–06`) |
| Fixture CSV smoke | Passed |
| `SAMSARA_API_TOKEN` on Vercel | **Do this next** (see below) |
| Token returns vans + GPS | **Verify** — prior token authenticated but returned an empty vehicle list |
| Production Route Generator flags | Keep **false** until Fitdog MFA + shadow day |

## 1. Create / fix the Samsara API token

In [cloud.samsara.com](https://cloud.samsara.com) → **Settings → API Tokens**:

1. Create (or edit) a token with:
   - **Read Vehicles**
   - **Read Vehicle Statistics**
2. Set **tag access to the entire organization** (not a tag that excludes vans).
3. Confirm vehicle names match: `Van 01`, `Van 02`, `Van 03`, `Van 05`, `Van 06` (never Van 04).

Gateway serials stored in `route_vehicle_configs` (fallback match):

| Van | Samsara name | Serial |
|---|---|---|
| 1 | Van 01 | `GXPD-PPW-GEV` |
| 2 | Van 02 | `GW6E-ADZ-ATK` |
| 3 | Van 03 | `GVE5-PCJ-7KK` |
| 5 | Van 05 | `GGR6-JKW-B6F` |
| 6 | Van 06 | `GKEW-DZK-4NX` |

## 2. Verify the token locally

```bash
export SAMSARA_API_TOKEN='samsara_api_...'
npm run verify:samsara
```

Expect `ok: true`, all five vans in `fleetMatch` + `gpsMatch`.

If `fleetVehicleCount` is `0`: token is tag-restricted or missing Read Vehicles — fix in Samsara, do not push to Vercel yet.

## 3. Push token to Vercel (token only)

```bash
export VERCEL_TOKEN=...          # https://vercel.com/account/tokens
export SAMSARA_API_TOKEN='samsara_api_...'
./scripts/push-samsara-vercel-env.sh
npx vercel --prod --token "$VERCEL_TOKEN" --scope bridge-tess
```

Default push sets `SAMSARA_API_TOKEN` only and **does not** enable Route Generator flags.

Only after the [shadow-mode checklist](./shadow-mode-checklist.md) is complete:

```bash
ENABLE_ROUTE_GENERATOR_FLAGS=true ./scripts/push-samsara-vercel-env.sh
```

## 4. CSV template / bulk upload

Export no longer depends on a DB-uploaded template. It always emits Samsara’s official columns A–K:

`Route Name, Assigned Driver Username, Assigned Vehicle Name, Stop Name, Notes, Scheduled Arrival Time, Scheduled Departure Time, Address Name, Latitude, Longitude, Full Address`

Ops flow:

1. Approve a plan in Route Generator → **Export Samsara CSV**
2. Upload that file in Samsara → Routes → bulk upload
3. Optional smoke: download a fresh sample from the company dashboard and confirm headers still match A–K (if Samsara changes columns, update `SAMSARA_BULK_UPLOAD_HEADERS`)

## Samsara CSV Stop Notes (drivers)

Every customer stop exported to Samsara includes:

1. Dog names  
2. **Owner phone** (full number for the driver)  
3. **Pickup / drop-off instructions** from Fitdog `location_notes` (gate codes, key locations, etc.)  
4. Reservation notes when present  

Notes use newlines (supported by the Samsara Driver App). The CSV exporter quotes multiline cells so uploads succeed.

Rebuild path: Generate Routes writes notes on `route_plan_stops.driver_notes`; Export rebuilds from Fitdog report items + stop item links as a safety net.

## Owner live tracking (Uber-style map)

On **Approve**:

- Creates a public token per customer stop (`/track/[token]`)
- Sends an SMS with the live link when Twilio is configured (`TWILIO_*`)

Live map + ETA:

- Polls Samsara vehicle GPS when `SAMSARA_API_TOKEN` is set
- Owners see an Uber Eats–style map with live minutes
- Cron `/api/cron/route-eta-alerts` (every 2 minutes):
  - SMS when driver is ~**30 minutes** out
  - Map banner + SMS when ~**15 minutes** out

## Feature flags / secrets

`ROUTE_GENERATOR_ENABLED`, `SAMSARA_CSV_EXPORT_ENABLED`, `SAMSARA_API_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`

## Van 4

Never generate, display, assign, import, or reference Van 4.

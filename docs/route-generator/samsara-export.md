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
2. Set **Tag Access = Entire Organization** (critical — a tag-scoped token returns an empty vehicle list even though the UI shows vans).
3. Confirm vehicle names match (already correct in Fitdog org as of 2026-07-27):

| Staff name | Samsara name | Notes from fleet UI |
|---|---|---|
| Van 1 | **Van 01** | 2018 Ford Transit Connect |
| Van 2 | **Van 02** | 2018 Ford Transit Connect · VIN `NM0LS7E74J1371466` · plate `38516L2` |
| Van 3 | **Van 03** | 2018 Ford Transit Connect |
| Van 5 | **Van 05** | 2018 Nissan NV200 · VIN `3N6CM0KN6JK701997` · plate `69357N2` |
| Van 6 | **Van 06** | 2021 Nissan NV200 · VIN `3N6CM0KN3MK705283` |

Never Van 04. Do **not** rename away from `Van 01`… — our exporter and GPS matcher expect those exact labels.

Gateway serials (DB fallback) live in `route_vehicle_configs` / `lib/route-generator/samsara-vans.ts`.

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

Notes are flattened to a single line (` · ` separators) in the CSV so Samsara bulk upload does not reject multiline rows.

Rebuild path: Generate Routes writes notes on `route_plan_stops.driver_notes`; Export rebuilds from Fitdog report items + stop item links as a safety net.

## Required CSV headers

Exact Samsara bulk-upload columns A–K:

`Route Name, Assigned Driver Username, Assigned Vehicle Name, Stop Name, Notes, Scheduled Arrival Time, Scheduled Departure Time, Address Name, Latitude, Longitude, Full Address`

Every stop row must include **both** scheduled arrival and departure. Vehicle names must match Samsara exactly (`Van 01` … `Van 06`, never Van 04). Leave driver username blank when assigning by vehicle.

If Samsara says **"One or more rows are incorrect"**, see [troubleshooting](./troubleshooting.md).

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

## Van drop-off start times (Pacific)

| Vans | Drop-off start | Why |
|------|----------------|-----|
| Van 1, 2, 3 | **10:30 AM** | Outing return (Hahn / Beach) home drop-offs |
| Van 5, 6 | **12:00 PM** | Club vans — group classes end at noon; Van 5 primary for taxi / club drop-offs |

Pickup synthesis still starts at **07:00 AM**. These times feed the Samsara CSV when stop ETAs were not persisted.

## Feature flags / secrets

`ROUTE_GENERATOR_ENABLED`, `SAMSARA_CSV_EXPORT_ENABLED`, `SAMSARA_API_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`

## Van 4

Never generate, display, assign, import, or reference Van 4.

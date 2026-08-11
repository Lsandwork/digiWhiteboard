# Route Generator — Samsara export + owner ETA

## Samsara CSV Stop Notes (drivers)

Every customer stop exported to Samsara includes:

1. Dog names  
2. **Owner phone** (full number for the driver)  
3. **Pickup / drop-off instructions** from Fitdog `location_notes` (gate codes, key locations, etc.)  
4. Reservation notes when present  

Notes are flattened to a single line (ASCII ` | ` separators) in the CSV so Samsara bulk upload does not reject multiline rows. Never use middle-dot `·` — it is non-ASCII and has caused Digi fail-closed 422s and Samsara Internal Server Error.

Rebuild path: Generate Routes writes notes on `route_plan_stops.driver_notes`; Export rebuilds from Fitdog report items + stop item links as a safety net.

## Owner SMS (Twilio)

On **Approve**, Digi creates `/track/[token]` links and sends SMS when Twilio is configured:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID` (preferred — Fitdog Ruffly Messaging Service / A2P)
- `TWILIO_FROM_NUMBER` (fallback if Messaging Service is unset)
- `NEXT_PUBLIC_SITE_URL` (tracking link host, e.g. `https://staff.ruffops.com`)

Approve toast reports how many SMS were sent, or the first Twilio/phone error if send failed.

## Required CSV headers

Exact Samsara bulk-upload columns A–K:

`Route Name, Assigned Driver Username, Assigned Vehicle Name, Stop Name, Stop Arrival Time, Stop Departure Time, Stop Notes, Address Name, Latitude, Longitude, Full Address`

Every stop row must include **both** stop arrival and departure. Vehicle names must match Samsara exactly (`Van 01` … `Van 06`, never Van 04). Leave driver username blank when assigning by vehicle.

If Samsara says **"Internal Server Error"**, **"One or more column headers are not supported"**, or **"One or more rows are incorrect"**, see [troubleshooting](./troubleshooting.md).

### Same-day rule (required)

- Digi exports only for the plan **operating date**.
- Export of a non-today plan is **blocked** unless a manager uses emergency override with a written reason.
- After the first export, use **Re-export Samsara CSV** — do not upload Friday’s (or any prior) file on a later day.
- Digi validates lat/lng/address, same-day stop times (`m/d/yyyy H:mm`, CRLF), and flattened ASCII notes before download so Samsara bulk upload does not 500.

## Owner live tracking (Uber-style map)

On **Approve**:

- Creates a public token per customer stop (`/track/[token]`)
- Sends an SMS with the live link when Twilio is configured (`TWILIO_*`)

Live map + ETA:

- Polls Samsara vehicle GPS when `SAMSARA_API_TOKEN` is set
- Owners see an Uber Eats–style map with live minutes
- Cron `/api/cron/route-eta-alerts` (every 2 minutes):
  - Real owner ETA SMS only (Samsara GPS + quiet hours + moving-van gates)
  - SMS when driver is ~**30 minutes** out
  - Map banner + SMS when ~**15 minutes** out
  - **Does not** run the Jasper demo SMS path (permanently disabled)
- Staff UI: Route Generator → **Tracking / SMS** tab lists stops, link/ETA stamps, enable/disable alerts, resend link, and SMS event history (`route_owner_sms_events`)

## Van drop-off start times (Pacific)

| Vans | Drop-off start | Why |
|------|----------------|-----|
| Van 1, 2, 3 | **10:30 AM** | Outing return (Hahn / Beach) home drop-offs |
| Van 5, 6 | **12:00 PM** | Club vans — group classes end at noon; Van 5 primary for taxi / club drop-offs |

Pickup synthesis still starts at **07:00 AM**. These times feed the Samsara CSV when stop ETAs were not persisted.

## Feature flags / secrets

`ROUTE_GENERATOR_ENABLED`, `SAMSARA_CSV_EXPORT_ENABLED`, `SAMSARA_API_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_FROM_NUMBER`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`

## Fail-closed validation (never download a 500-prone file)

Before Digi returns a CSV download it runs hard checks including:
- Exact headers A–K
- Vehicle roster only: `Van 01|02|03|05|06`
- Address + lat/lng present; no near-zero coords
- Same operating-date datetimes in **unpadded** `m/d/yyyy H:mm` (official sample style); departure **after** arrival; monotonic route times
- Single-line printable-ASCII notes ≤ 480 chars (ASCII `|` separators only — never `·`)
- CRLF line endings; no UTF-8 BOM
- CSV round-trip parse of every data row
- Address Name blank (raw lat/lng mode)

If any check fails, export returns **422** and **no file** is downloaded.

## Van 4

Never generate, display, assign, import, or reference Van 4.

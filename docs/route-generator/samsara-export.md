# Route Generator — Samsara export + owner ETA

## CSV headers (required exact match)

Export must use Samsara’s official bulk-upload columns A–K (from the dashboard sample templates):

`Route Name, Assigned Driver Username, Assigned Vehicle Name, Stop Name, Stop Arrival Time, Stop Departure Time, Stop Notes, Address Name, Latitude, Longitude, Full Address`

Wrong names that fail upload: `Notes`, `Scheduled Arrival Time`, `Scheduled Departure Time`.

For raw lat/lng routes, leave **Address Name** blank and fill Latitude / Longitude / Full Address (do not mix Address Book names with coordinates on the same row).

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

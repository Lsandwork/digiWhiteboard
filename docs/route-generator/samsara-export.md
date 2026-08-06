# Route Generator — Samsara export + owner ETA

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
- SMS alert when driver is ~**15 minutes** out
- Live van appears on the map at ~**10 minutes** out
- Cron `/api/cron/route-eta-alerts` every 2 minutes

See [owner-live-tracking.md](./owner-live-tracking.md).

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

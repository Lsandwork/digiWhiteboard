# TL Additional Services — Gingr completion sync

Team Lead Digi Board tracks **10 required additional service types** and must only show a row when Gingr completion is **known incomplete**. Rows must disappear when Gingr marks the service **complete**.

## Required service types

1. Private Walk  
2. Group Walk  
3. Daily Enrichment (3pm) - Business Only  
4. Snack time - business only  
5. Puzzle Playtime  
6. Birthday Party  
7. Assessment Hike - Business Only  
8. Flea Preventative  
9. Bordetella - Business Only  
10. Taxi Service - Business Only  

Canonical list: `lib/tl-digi-board/tl-service-names.ts` (`TL_BOARD_REQUIRED_ADDITIONAL_SERVICES`).

## Supported Gingr completion source (TL_GINGR_KEY)

### Primary: reservation service rows

**Endpoint:** `POST https://{subdomain}.gingrapp.com/api/v1/reservations`

| Pull | Body fields | Purpose |
|------|-------------|---------|
| Checked-in | `key`, `location_id`, `checked_in=true` | Primary list of dogs on property |
| Same-day | `key`, `location_id`, `checked_in=false`, `start_date`, `end_date` (today LA) | Enrichment when checked-in payload omits `complete` |

**Service arrays on each reservation:**

- `services`
- `additional_services`
- `reservation_services`
- `addons`

**Completion field (authoritative):**

| Field | Meaning |
|-------|---------|
| `complete` | Unix **seconds** timestamp when marked complete in Gingr; `null` / empty / `0` = **pending** |

Confirmed from Gingr frontend (`app.js`):

- Reservation Services tab: `service.complete`, `addonData.complete`
- Services table: `t.complete ? moment(1e3*t.complete)... By t.completed_by`
- Mark complete actions: `POST /reservations/complete_service/id/{id}` and `POST /reservations/complete_service_addon/id/{id}` (staff UI only)

**Fallback fields (used only when `complete` absent):**

- `completed`, `completed_at`, `is_complete`, `status` containing “complete”

If none of these fields are present on the row → completion is **`unknown`**. The board shows **COMPLETION UNKNOWN** and does **not** assume incomplete.

### Not available with API key alone

| Endpoint | Why |
|----------|-----|
| `GET /services/get_by_reservation/id/{reservationId}` | Session auth (302 → login); not used for TV sync |
| `/api/v1/get_service_report_history` | Does not exist (unlike `get_medication_report_history`) |

## Board behaviour

| Gingr state | Board |
|-------------|-------|
| `complete` null/empty | **NEEDS COMPLETION** |
| `complete` timestamp | Hidden (completed) |
| No completion fields | **COMPLETION UNKNOWN** (visible; not emailed as incomplete) |

Email reminders (`/api/cron/tl-additional-services-reminder`) only include **known incomplete** rows.

## Automatic audit

Every sync runs `auditTlAdditionalServicesFromReservations()` (`lib/tl-digi-board/additional-services-audit.ts`).

Per required service type:

| Status | Meaning |
|--------|---------|
| `pass` | Scheduled today; every sample had reliable completion fields |
| `not_scheduled_today` | No samples today (nothing to verify live) |
| `fail` | At least one sample missing completion fields |

Audit stored on snapshot: `meta.servicesCompletionAudit`  
Pass gate: `meta.servicesCompletionStatusAvailable === true` (equivalent to `allReliable`).

### Run audit manually

```bash
TL_GINGR_KEY=... npx tsx scripts/audit-tl-additional-services-gingr.ts
```

Admin API (full admin session):

```
GET /api/admin/tl-digi-board/audit-services
```

### Unit tests

```bash
npm run test:tl-additional-services
npm run test:tl-additional-services-audit
```

## Implementation files

- `lib/tl-digi-board/gingr-reservation-services.ts` — reservation pulls + merge
- `lib/tl-digi-board/gingr-service-completion.ts` — completion resolution
- `lib/tl-digi-board/additional-services.ts` — board rows + sync
- `lib/tl-digi-board/additional-services-audit.ts` — per-type audit

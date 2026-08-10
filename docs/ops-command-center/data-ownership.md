# Fitdog RuffOps ↔ Gingr Data Ownership

RuffOps is Fitdog’s **live operations / staff accountability** platform.
Gingr remains Fitdog’s **primary pet-business management** system.

```
GINGR   = Business / Reservation System
RUFFOPS = Live Operations / Workflow / Accountability System
```

RuffOps must **work with** Gingr. It must not recreate Gingr.

---

## Gingr authoritative data

RuffOps may display, cache, or synchronize these — never invent a competing system of record:

- Customer accounts
- Dog / pet profiles (master identity in Gingr)
- Reservations and service bookings (daycare, boarding, grooming, training, etc.)
- Packages and package balances
- Payments, pricing, invoices
- Customer contact information owned by Gingr
- Reservation / service status as recorded in Gingr

When staff need to change Gingr-owned records, prefer **Open in Gingr** or an approved Gingr-integrated action.

---

## RuffOps authoritative data

- Operational dog state (yard, break, outing, ready for pickup, etc.)
- Walk tracking, body/collar checks
- RuffOps alerts, tasks, notifications, acknowledgements
- Shift handoff records
- Driver / hiker operational stop events
- Overnight rounds and wellness checks
- Internal operational notes and special handling instructions used on the floor
- Media metadata (files live in cloud object storage)
- Operational incident workflow state inside RuffOps
- Audit logs for RuffOps actions
- Employee acknowledgements

---

## Shared / synchronized data

| Data | Owner | RuffOps role |
|---|---|---|
| `gingr_animal_id` | Gingr | Canonical external dog key for RuffOps identity map |
| `gingr_reservation_id` | Gingr | Links today’s board transition to a booking |
| Dog display name / photo URL | Gingr (source) | Cached on `ops_dogs` for ops speed; refresh from Gingr |
| Owner display name / phone | Gingr (source) | Cached when operationally needed |
| Check-in / check-out transition | Gingr event → RuffOps board | Creates RuffOps ops events; does not replace Gingr reservation |
| Fitdog app dog/payment IDs | Fitdog ops mirror | Optional secondary key on `ops_dogs.fitdog_dog_id` |
| Route / Samsara vehicle location | Samsara | Consumed for ETA; not recreated as fleet management |

### Conflict rules

1. **Identity:** Prefer `gingr_animal_id`. If only a name is known (legacy walks), create/link an `ops_dogs` row when a Gingr id later appears.
2. **Business facts:** Gingr wins. RuffOps never overwrites Gingr package/payment/reservation truth.
3. **Floor state:** RuffOps wins for yard/walk/break/overnight/ops status while the dog is in Fitdog’s care.
4. **Sync failure:** Surfaces must label Gingr-dependent fields as potentially stale. Never silently pretend RuffOps is authoritative for Gingr data.
5. **No uncontrolled two-way sync.** Writes back to Gingr only through approved integrations.

---

## Shared operational objects

All new RuffOps features should attach to:

`Dog → Task → Event → Notification → User`

Do not create another isolated tool when an existing shared system can own the data.

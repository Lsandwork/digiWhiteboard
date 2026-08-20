# Package Group Walks

Dogs whose owner holds an eligible package receive one complimentary group walk
per Fitdog business day. RuffOps identifies who qualifies and records who walked
them. **Gingr is never written to by this feature.**

## Canonical rule

```
CURRENTLY CHECKED IN IN GINGR
+ OWNER HOLDS AN ELIGIBLE PACKAGE
+ NOT ALREADY COMPLETED FOR THE FITDOG BUSINESS DATE
= NEEDS GROUP WALK
```

Both the **Package Group Walks** page and the **Team Lead Alerts + Reminders**
whiteboard read this from one place — `lib/package-group-walks/service.ts` — so
the two screens cannot disagree.

## Eligible packages

| Key | Display name |
|-----|--------------|
| `monthly_unlimited` | Monthly Unlimited |
| `twenty_day_plus` | 20-Day PLUS Package |

Configured in `lib/package-group-walks/eligible-packages.ts`.

Matching is **exact on a normalized name** (case, punctuation, and spacing are
folded; word membership is not). `includes("plus")` would match `10-Day PLUS
Package` and hand out a walk nobody bought, so substring matching is never used.

### Confirming stable Gingr package ids

Gingr's legacy v1 API does not document a stable product-code field on
subscriptions, so display names are the portable identifier. Once the real ids
are confirmed in production they take precedence over names:

```
PACKAGE_GROUP_WALK_MONTHLY_UNLIMITED_GINGR_IDS=123,456
PACKAGE_GROUP_WALK_TWENTY_DAY_PLUS_GINGR_IDS=789
```

To read the ids Gingr actually returns (Full Admin session required):

```
GET /api/admin/package-group-walks/diagnostics
```

Production URL:

```
https://fitdog.ruffops.com/api/admin/package-group-walks/diagnostics
```

Auth:

- Full Admin (`owner_admin` / `manager_admin`) → sanitized JSON
- Authenticated non-admin → `403` JSON (`FORBIDDEN`)
- Unauthenticated → `401` JSON (`Unauthorized.`) — never the Next.js HTML 404 page

If Gingr credentials are missing or Gingr cannot be reached the route returns
HTTP `503` with `{ "ok": false, "error": "GINGR_UNAVAILABLE" }` rather than an
empty successful package list.

The payload lists distinct package/subscription ids and names, nested product /
package / subscription identifiers when Gingr sends them, `availableFields` for
the raw object shape, and whether each row matched Monthly Unlimited or
20-Day PLUS Package by name or confirmed id. It never returns API keys, tokens,
or owner PII. Set the env vars from that output to move from name matching to
id matching.

## Gingr data sources

Two bulk reads. Never one request per dog or per owner.

| Source | Endpoint | Cost |
|--------|----------|------|
| Checked-in dogs | `POST /api/v1/reservations` (`checked_in=true`) | Shared with the TL board's existing pull |
| Owner packages | `GET /api/v1/get_subscriptions` | One request per page, typically one page |
| Reservation-embedded packages | — | Free; already on the reservation payload |

`GET /api/v1/owner?id=` is deliberately unused: it is per-owner and would
reintroduce the N+1 pattern.

Credentials resolve server-side via `TL_GINGR_KEY` (falling back to
`GINGR_API_KEY`). No Gingr key ever reaches the browser.

## Storage

`supabase/migrations/082_package_group_walks.sql`

Only **completions** are stored. Pending is derived from live Gingr, so a stored
row can never keep a checked-out dog on the board, and the sync never writes one
row per eligible dog.

```sql
create unique index package_group_walks_unique_completion_idx
  on public.package_group_walks (business_date, gingr_animal_id, walk_type)
  where status = 'completed';
```

That partial unique index — not a client-side guard — is what makes completion
idempotent across double clicks, simultaneous users, sync retries, duplicate
Gingr payloads, and same-day re-check-in.

Business date is computed in `America/Los_Angeles`, never by truncating UTC.

RLS is enabled with a deny-all policy; the app reads and writes through the
service role, matching every other RuffOps table.

## Completion flow

1. `POST /api/admin/package-group-walks` with `{ action, gingrAnimalId }`
2. Session cookie authenticates the request (any authenticated RuffOps user)
3. Employee identity is resolved **from the session**, never the request body
4. Server re-checks eligibility — a client claiming a dog qualifies is not enough
5. Insert; on `23505` the existing row is returned (`created: false`)
6. `admin_audit_logs` records `package_group_walk.completed`

A stale tab that posts yesterday's `businessDate` gets a 409 rather than writing
to the wrong day.

## Propagation

| Surface | Mechanism | Latency |
|---------|-----------|---------|
| Package Group Walks page | Supabase Realtime on `package_group_walks`, 30s visibility-aware poll fallback | ~1s |
| TL whiteboard | `GET /api/boards/tl-alerts-reminders/package-group-walks` completion pulse every 5s | ≤5s |

The whiteboard snapshot only refreshes on the Gingr cadence, so completions are
also overlaid at read time in `loadTlDigiBoardPublicPayload`. A failed pulse is
never interpreted as "nothing completed" — rows stay until a successful read.

## States

`LOADING`, `LIVE`, `STALE`, `ERROR`, `EMPTY_VALID` are distinct.

An empty list renders as **All Clear only after a successful Gingr sync with a
working package source**. A Gingr outage shows the last-known-good list labelled
stale, or an explicit error — never "All Clear".

## Failure isolation

A Package Group Walks failure is caught inside the TL sync and reported through
its own `packageGroupWalksHealth`. It is excluded from the board-wide
`allClear` and from `resolveTlBoardDisplayState`, so Medication Reminders,
Additional Services, and Daily Reminders keep working if this card breaks.

Nothing here is on Gingr's check-in path. If RuffOps, Supabase, or this feature
is down, Gingr check-ins are unaffected.

## Tests

```bash
npm run test:package-group-walks
```

## Files

```
supabase/migrations/082_package_group_walks.sql
lib/package-group-walks/eligible-packages.ts   canonical package config + matching
lib/package-group-walks/gingr-packages.ts      bulk owner package resolution
lib/package-group-walks/service.ts             canonical qualification pipeline
lib/package-group-walks/store.ts               atomic/idempotent completions
lib/package-group-walks/tl-board.ts            whiteboard projection
lib/package-group-walks/actor.ts               session-derived employee identity
lib/package-group-walks/observability.ts       Sentry events
app/api/admin/package-group-walks/route.ts     list + complete
app/api/admin/package-group-walks/diagnostics/route.ts
app/api/boards/tl-alerts-reminders/package-group-walks/route.ts
components/admin/PackageGroupWalksPanel.tsx
```

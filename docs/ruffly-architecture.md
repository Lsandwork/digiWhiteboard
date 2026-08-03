# Ruffly Architecture

Ruffly is Fitdog’s customer communication, reputation, lead, review, marketing, and relationship module inside the existing RuffOps Next.js repository (`fitdog-gingr-status-board`).

## Decision: in-repo module (not a separate repository)

After inspecting routing, auth, Supabase clients, middleware host rewrites, Gingr webhooks, cron jobs, and the permission system, embedding Ruffly in this repository is safe and preferred:

- Staff already authenticate with `fitdog_admin_session` on `staff.ruffops.com`.
- Permissions, audit patterns, and notification dispatch already exist.
- Multi-domain hosting (lobby / casttv / staff) already uses middleware rewrites in one Vercel project.
- A separate repo would duplicate auth, RBAC, Gingr clients, and deployment risk.

## Hosting

| Surface | URL | Implementation |
|---------|-----|----------------|
| Staff app | `https://staff.ruffops.com/ruffly` | Authenticated App Router page + APIs under `/api/ruffly` and `/api/admin/ruffly` |
| Public | `https://ruffly.ruffops.com` | Middleware rewrite of `/` → `/ruffly/public`; public APIs, widget, token pages |
| Widget script | `https://ruffly.ruffops.com/widget.js` | Served from `/api/ruffly/widget` / `public/ruffly/widget.js` |

Staff session cookies remain **host-only** on `staff.ruffops.com`. Public pages never require or receive the admin cookie.

## Isolation

- Tables use the `ruffly_` prefix in `public` (Postgres schema-compatible naming; dedicated `ruffly` schema can be introduced later without rewriting domain code).
- Provider credentials stay server-side (env + encrypted `ruffly_provider_connections` secret references).
- Feature flags gate rollout (`RUFFLY_ENABLED`, channel flags).
- Existing lobby board, staff board, CAST-TV, and Gingr whiteboard webhooks are untouched; Ruffly adds parallel webhook + reconcile paths.

## Layers

```
components/ruffly/*          Staff UI (Fitdog design system)
app/ruffly/*                Staff + public pages
app/api/ruffly/*            Staff-authenticated + public + webhook APIs
app/api/cron/ruffly-*       Background reconcile / job workers
lib/ruffly/*                Domain services (contacts, inbox, leads, consent, jobs…)
lib/integrations/*          Provider adapters (Gingr, SMS, email, AI, reviews, social, voice)
supabase/migrations/044_*   Persistence
```

## Authentication & authorization

- Staff UI: `getAdminSession()` + `ruffly.view` (and finer keys) via `requirePermission`.
- Public tokens: HMAC-signed, expiring links for review / feedback / consent pages.
- Webhooks: Gingr SHA-256 HMAC (same message construction as existing board webhook).
- All mutations enforce permissions server-side; UI only hides controls.

## Provider adapters

Adapters expose a narrow interface (`send`, `receive`, `testConnection`, `health`). Implementations may be stubbed with “Setup Required” until credentials exist. No secrets are returned to the browser after save.

## Jobs

Vercel cron invokes `/api/cron/ruffly-reconcile` and `/api/cron/ruffly-jobs`. Durable work is persisted in `ruffly_job_queue` with idempotency keys, retries, and quiet-hours / consent checks before sends.

## Non-goals / safety

- No review gating.
- No invented availability, prices, or Gingr writes without an explicit tested write path.
- AI uses only published, customer-visible knowledge articles.
- Do not break lobby / staff / casttv hosts or existing `/api/gingr/webhook`.
- Gingr allows only one webhook URL — DigiBoard owns it and fans out into Ruffly.

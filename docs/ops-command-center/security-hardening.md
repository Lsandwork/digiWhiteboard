# RuffOps Security & Platform Hardening Notes (Phase 7)

## Architecture reminder
- Gingr owns customers, pets, reservations, packages, payments.
- RuffOps owns operational state, tasks, events, notifications, audit, overnight rounds, handoffs.

## Enforced / in place
- Server-side RBAC via `requirePermission` / `hasPermission` and tab permission maps.
- Ops Command Center APIs check session + permission keys before reads/writes.
- Secrets are not returned by System Health (only configured/not-configured style status).
- Admin/internal app should be `noindex, nofollow`.
- Webhook verification remains required for Gingr board ingestion.
- Audit events append-only for Command Center mutations.

## Shared-computer controls
- **Lock RuffOps** preserves the authenticated session while requiring password re-entry to reveal the UI.
- Prefer short idle lock on front-desk shared machines.

## MFA
- Sensitive roles (Management / Admin / Super Admin) should use the established auth provider MFA.
- Do not invent custom OTP storage in application tables.
- Track enablement in the identity provider / admin user settings when available.

## Uploads / media
- Keep binaries in object storage + CDN.
- Validate MIME/type server-side; store metadata only in Postgres.
- Prefer signed URLs for private media.

## Offline resilience
- Driver/Hiker and similar floor actions may queue locally and sync when online.
- UI must show Waiting to Sync / Synced; never silently drop actions.

## Remaining continuous hardening
- Rate-limit authentication and webhook endpoints.
- CSRF: cookie session APIs already require same-site admin session cookies; keep mutating routes session-authenticated.
- Continue expanding immutable audit coverage as modules migrate onto `ops_audit_events`.
- Backup / PITR remains a Supabase platform responsibility — verify schedule in project settings.

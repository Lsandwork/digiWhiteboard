# Operations Command Center — Phase status

## Goal

Shared operational primitives without replacing Gingr or destroying existing RuffOps tools.

## Compatibility

- Existing boards, walks, push notices, Team Log, Route Generator, Media Library, and Gingr webhooks keep working.
- Foundation writers are best-effort and must never block board/check-in latency paths.

## Phase status

| Phase | Status |
|---|---|
| 1 Foundation | Shipped |
| 2 Universal Dog Experience | Shipped (profile, timeline, ⌘K search, dog cards, side panel) |
| 3 My Shift | Shipped |
| 4 Role workflows | Shipped (Front Desk, Yard, Driver, Overnight, Trainer, Handoff) |
| 5 Platform health | Shipped |
| 6 Resilience | Shipped (offline queue, autosave, lock screen) |
| 7 Security | Documented + noindex + server RBAC |

## APIs

- `GET/POST /api/admin/ops-command-center`
- `GET /api/admin/ops-command-center/dogs/[dogId]`

See also: `data-ownership.md`, `security-hardening.md`

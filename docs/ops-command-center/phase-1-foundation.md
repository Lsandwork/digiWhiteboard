# Phase 1 — Operations Command Center Foundation

## Goal

Introduce shared operational primitives without a destructive rewrite:

1. Universal dog identity map (`ops_dogs`)
2. Shared live status (`ops_dog_status`)
3. Append-only operational events (`ops_events`)
4. Central task engine (`ops_tasks`)
5. Central notifications (`ops_notifications`)
6. Cross-module audit trail (`ops_audit_events`)
7. Data ownership rules (see `data-ownership.md`)

## Compatibility

- Existing boards, walks, push notices, Team Log, Route Generator, Media Library, and Gingr webhooks keep working.
- Foundation writers are **best-effort** and must never block board/check-in latency paths.
- Legacy modules continue using their own tables; adapters gradually emit shared events/status.

## Primary APIs

- `GET /api/admin/ops-command-center` — role-aware My Shift / Management snapshot
- `GET /api/admin/ops-command-center/dogs/[dogId]` — universal ops profile + timeline
- Task / notification mutations under the same route namespace

## Next phases

- Phase 2: Universal Dog Profile UI, timeline everywhere, global search, side panel
- Phase 3: Full My Shift personalization
- Phase 4: Role workflows (Front Desk, Yard, Groomer, Driver, Overnight, Trainer)
- Phase 5–7: Health, resilience, security hardening

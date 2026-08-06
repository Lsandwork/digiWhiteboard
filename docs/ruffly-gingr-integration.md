# Ruffly ↔ Gingr Integration

Code lives under `lib/integrations/gingr/`.

Env:
- `GINGR_BASE_URL` (optional) or `GINGR_SUBDOMAIN`
- `GINGR_API_KEY`
- `GINGR_LOCATION_ID`
- `GINGR_WEBHOOK_SIGNATURE_KEY`

Gingr allows **only one** webhook URL. Keep DigiBoard as the registered endpoint:

`https://staff.ruffops.com/api/gingr/webhook`

That route fans verified events into Ruffly (`ingestGingrWebhook`) automatically when `RUFFLY_ENABLED=true`.

Do **not** point Gingr at `/api/ruffly/webhooks/gingr` — that would stop Staff/Lobby boards from updating. The Ruffly-only route remains available for diagnostics/replay, but production Gingr UI must stay on DigiBoard.

Signature verification matches the existing board webhook HMAC (`webhook_type + entity_id + entity_type`).

Supported event handlers (processed asynchronously via `ruffly_job_queue`):
- owner_created / owner_edited → upsert contact
- lead_created → create Ruffly lead
- check_out / checking_out → queue review invitation (consent-checked)

Reconciliation cron: `/api/cron/ruffly-reconcile` (every 6 hours).

Direct reservation booking into Gingr is **not** claimed unless a dedicated write path is tested.

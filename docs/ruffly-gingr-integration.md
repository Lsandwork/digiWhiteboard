# Ruffly ↔ Gingr Integration

Code lives under `lib/integrations/gingr/`.

Auth matches Digi-board / Gingr public API: `key` query or form param against `https://{subdomain}.gingrapp.com/api/v1/...` (not Bearer headers, not `/api/owners`).

Connection test probes `/api/v1/get_locations`, falling back to `/api/v1/reservation_types`.

Env:
- `GINGR_BASE_URL` (optional) or `GINGR_SUBDOMAIN`
- `GINGR_API_KEY`
- `GINGR_LOCATION_ID`
- `GINGR_WEBHOOK_SIGNATURE_KEY`

Gingr Custom Configurations only supports **one** webhook URL. Keep Digi-board as the target:

`https://staff.ruffops.com/api/gingr/webhook`

That board endpoint fans out a copy into Ruffly (`ingestGingrWebhook`) so contacts/leads/review jobs still run. Do **not** point Gingr directly at `/api/ruffly/webhooks/gingr` or the whiteboard will stop updating.

The webhook signature key in Gingr must match `GINGR_WEBHOOK_SIGNATURE_KEY` in Vercel.

Optional dedicated Ruffly URL (testing only):
`https://staff.ruffops.com/api/ruffly/webhooks/gingr`

Signature verification matches the existing board webhook HMAC (`webhook_type + entity_id + entity_type`).

Supported event handlers (processed asynchronously via `ruffly_job_queue`):
- owner_created / owner_edited → upsert contact
- lead_created → create Ruffly lead
- check_out / checking_out → queue review invitation (consent-checked)

Reconciliation cron: `/api/cron/ruffly-reconcile` (every 6 hours).

Direct reservation booking into Gingr is **not** claimed unless a dedicated write path is tested.

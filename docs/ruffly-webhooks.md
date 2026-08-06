# Ruffly Webhooks

## Gingr
- Production URL in Gingr Custom Configurations: `POST /api/gingr/webhook` (Digi-board)
- Digi-board fans out verified events into Ruffly via `ingestGingrWebhook`
- Dedicated Ruffly endpoint (optional/testing): `POST /api/ruffly/webhooks/gingr`
- Verify SHA-256 HMAC with `GINGR_WEBHOOK_SIGNATURE_KEY` (must match Gingr’s Webhook signature key field)
- Idempotent via `ruffly_webhook_events.idempotency_key`
- Invalid signatures → 401, stored as failed
- Valid events acknowledged immediately; processing queued

## SMS (Twilio-compatible)
- Endpoint: `POST /api/ruffly/webhooks/sms`
- Handles opt-out language and inbound inbox messages

## Replay
Super Admin can re-queue failed events by inserting a `gingr_webhook_process` job for the event id (Integrations → logs UI planned; API job enqueue available).

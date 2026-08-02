# Ruffly Webhooks

## Gingr
- **Production URL in Gingr UI (only one allowed):** `POST /api/gingr/webhook`  
  DigiBoard processes the event for boards, then fans out into Ruffly.
- Ruffly-only diagnostic endpoint: `POST /api/ruffly/webhooks/gingr` (do not replace DigiBoard with this in Gingr)
- Verify SHA-256 HMAC with `GINGR_WEBHOOK_SIGNATURE_KEY`
- Idempotent via `ruffly_webhook_events.idempotency_key`
- Invalid signatures → 401, stored as failed
- Valid events acknowledged immediately; processing queued

## SMS (Twilio-compatible)
- Endpoint: `POST /api/ruffly/webhooks/sms`
- Handles opt-out language and inbound inbox messages

## Replay
Super Admin can re-queue failed events by inserting a `gingr_webhook_process` job for the event id (Integrations → logs UI planned; API job enqueue available).

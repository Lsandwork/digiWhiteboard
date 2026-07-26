# Ruffly Deployment

1. Merge `feature/ruffly` and deploy to Vercel (same project as staff/lobby/casttv).
2. Apply migration `044_ruffly_core.sql`.
3. Set env flags. Minimum production launch:
   - `RUFFLY_ENABLED=true`
   - `RUFFLY_TOKEN_SECRET` (dedicated random secret; required for review/feedback links)
   - Keep `RUFFLY_SENDING_SMS_ENABLED=false` and `RUFFLY_SENDING_EMAIL_ENABLED=false` until each provider test passes
   - Keep `RUFFLY_WEBCHAT_ENABLED` / `RUFFLY_AI_ENABLED` / `RUFFLY_VOICE_ENABLED` / campaign/automation flags off until tested
4. DNS: CNAME `ruffly.ruffops.com` → Vercel project (add domain in Vercel).
5. Configure Gingr webhook + Twilio inbound webhook (`/api/ruffly/webhooks/sms`).
6. Super Admin: open `/ruffly` → Integrations → Test connection for each provider, then turn that channel’s sending/feature flag on.
7. Do **not** advertise direct Gingr booking until Ruffly can create bookings inside Gingr (`isRufflyGingrBookingEnabled` stays false).

Rollback: set `RUFFLY_ENABLED=false` (staff nav still visible to owner_admin; APIs deny others).

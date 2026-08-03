# Ruffly Consent & SMS Compliance

- Separate transactional vs marketing consent (`ruffly_consents`)
- Suppressions (`ruffly_suppressions`) block sends
- Keyword + natural-language opt-out detection in `lib/ruffly/consent/opt-out.ts`
- Marketing sends require explicit opted_in
- Quiet hours stored on `ruffly_settings.quiet_hours` and enforced for marketing consent checks plus automated SMS jobs (`review_request_from_checkout`, `send_sms`); staff inbox replies bypass quiet hours
- Campaign/automation sends must call `canSendToContact` before delivery; suppressions are queried by phone/email/contact (not an unscoped row limit)
- No review gating — see `lib/ruffly/reviews/no-gating.ts`

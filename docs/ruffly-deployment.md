# Ruffly Deployment

1. Merge `feature/ruffly` and deploy to Vercel (same project as staff/lobby/casttv).
2. Apply migration `044_ruffly_core.sql`.
3. Set env flags (`RUFFLY_ENABLED`, provider keys). Keep sending flags `false` until Super Admin activates.
4. DNS: CNAME `ruffly.ruffops.com` → Vercel project.
5. Configure Gingr webhook + Twilio inbound webhook.
6. Roll out roles gradually.

Rollback: set `RUFFLY_ENABLED=false` (staff nav still visible to owner_admin; APIs deny others).

# Production checklist — Live Van Tracking

- [ ] Migration `046_live_van_tracking.sql` applied
- [ ] Samsara API connection passes (Read Routes, Vehicles, Vehicle Stats)
- [ ] Webhook signature test ping passes
- [ ] Van 1 / 2 / 3 / 5 / 6 vehicle mappings verified
- [ ] Van 4 does not exist in mappings
- [ ] Route-stop external IDs linked after export/sync
- [ ] Mapping provider configured (Google or Mapbox)
- [ ] Tracking domain SSL verified (`track.fitdog.com` or staff domain)
- [ ] Token isolation tests pass
- [ ] Privacy review signed off
- [ ] SMS provider test (Twilio) with staff number
- [ ] Email provider test (Resend) with staff inbox
- [ ] At least five real routes succeed in shadow mode
- [ ] ETA accuracy reviewed by Hub Coordinator / Management
- [ ] Super Admin disables shadow mode and enables production flags intentionally

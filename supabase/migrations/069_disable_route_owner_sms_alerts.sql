-- Immediately stop all Route Generator owner SMS alerts.
-- Run in Supabase SQL Editor if anyone received a route SMS without an intentional Approve.

update public.route_owner_tracking
set sms_alerts_enabled = false
where sms_alerts_enabled = true;

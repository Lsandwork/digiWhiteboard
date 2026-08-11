import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const panel = readFileSync(join(process.cwd(), "components/admin/RouteGeneratorPanel.tsx"), "utf8");
assert.match(panel, /Tracking \/ SMS/);
assert.match(panel, /RouteGeneratorTrackingTab/);
assert.match(panel, /setTab\("tracking"\)/);

const api = readFileSync(join(process.cwd(), "app/api/admin/route-generator/route.ts"), "utf8");
assert.match(api, /view === "tracking"/);
assert.match(api, /tracking_resend_link/);
assert.match(api, /tracking_set_sms_alerts/);
assert.match(api, /tracking_clear_notified/);
assert.match(api, /tracking_cancel/);

const admin = readFileSync(join(process.cwd(), "lib/route-generator/owner-tracking-admin.ts"), "utf8");
assert.match(admin, /export async function listOwnerTracking/);
assert.match(admin, /export async function resendOwnerTrackingLinkSms/);
assert.match(admin, /forceQuietHours/);
assert.match(admin, /recordOwnerSmsEvent/);

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/068_route_owner_sms_events.sql"),
  "utf8"
);
assert.match(migration, /route_owner_sms_events/);
assert.match(migration, /eta_30/);
assert.match(migration, /resend_link/);

const owner = readFileSync(join(process.cwd(), "lib/route-generator/owner-tracking.ts"), "utf8");
assert.match(owner, /recordOwnerSmsEvent/);
assert.match(owner, /kind: "eta_30"/);
assert.match(owner, /kind: "pullup"/);

const tab = readFileSync(join(process.cwd(), "components/admin/RouteGeneratorTrackingTab.tsx"), "utf8");
assert.match(tab, /Owner SMS & live tracking/);
assert.match(tab, /Resend/);
assert.match(tab, /Enable ETA alerts|Disable ETA alerts/);

console.log("test-owner-tracking-admin: ok");

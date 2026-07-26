import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  generateTrackingToken,
  hashTrackingToken,
  isTokenActive,
  tokensEqual,
  buildTrackingUrl
} from "../lib/live-tracking/tokens";
import { evaluateThresholds, shouldExposeLiveLocation, ownerStatusLabel } from "../lib/live-tracking/status";
import {
  verifySamsaraWebhookSignature,
  sanitizeWebhookPayload,
  isWebhookPing,
  extractWebhookEventId
} from "../lib/live-tracking/samsara-webhook";
import { renderTrackingTemplate, escapeTemplateValue, DEFAULT_TEMPLATES } from "../lib/live-tracking/templates";
import { buildOwnerSafeSnapshot, assertOwnerPayloadSafe, maskPhone } from "../lib/live-tracking/privacy";
import { idempotencyKey } from "../lib/live-tracking/notifications";
import { mapDisplayNameToVanKey } from "../lib/live-tracking/samsara-provider";
import { assertNeverVan4 } from "../lib/live-tracking/flags";
import { canUseLiveTracking, hasLiveTrackingPermission } from "../lib/live-tracking/access";
import { accessFromLegacyRole } from "../lib/admin/permissions";

// Tokens
const token = generateTrackingToken();
assert.ok(token.length >= 40, "token entropy");
const hash1 = hashTrackingToken(token);
const hash2 = hashTrackingToken(token);
assert.equal(hash1, hash2);
assert.ok(!tokensEqual(hash1, hashTrackingToken("other")));
assert.ok(buildTrackingUrl(token).includes("/track/") || buildTrackingUrl(token).includes("/t/"));
assert.equal(
  isTokenActive({
    notBeforeAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  }),
  true
);
assert.equal(
  isTokenActive({
    notBeforeAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    revokedAt: new Date().toISOString()
  }),
  false
);

// Threshold hysteresis / idempotency
const first = evaluateThresholds({
  status: "route_assigned",
  threshold30Sent: false,
  threshold15Sent: false,
  threshold5Sent: false,
  arrivedNotified: false,
  completedNotified: false,
  delayNotified: false,
  liveTrackingEnabled: false,
  minutesAway: 28,
  direction: "pickup"
});
assert.ok(first.events.includes("notice_30"));
assert.equal(first.events.includes("live_15"), false);

const after30 = evaluateThresholds({
  status: "thirty_minutes_away",
  threshold30Sent: true,
  threshold15Sent: false,
  threshold5Sent: false,
  arrivedNotified: false,
  completedNotified: false,
  delayNotified: false,
  liveTrackingEnabled: false,
  minutesAway: 34,
  direction: "pickup"
});
assert.deepEqual(after30.events, [], "no re-fire when ETA oscillates above 30");

const live = evaluateThresholds({
  status: "thirty_minutes_away",
  threshold30Sent: true,
  threshold15Sent: false,
  threshold5Sent: false,
  arrivedNotified: false,
  completedNotified: false,
  delayNotified: false,
  liveTrackingEnabled: false,
  minutesAway: 12,
  direction: "dropoff"
});
assert.ok(live.events.includes("live_15"));
assert.equal(live.enableLiveTracking, true);

const after15 = evaluateThresholds({
  status: "fifteen_minutes_away",
  threshold30Sent: true,
  threshold15Sent: true,
  threshold5Sent: false,
  arrivedNotified: false,
  completedNotified: false,
  delayNotified: false,
  liveTrackingEnabled: true,
  minutesAway: 18,
  direction: "dropoff"
});
assert.deepEqual(after15.events, [], "live stays on; no duplicate 15-min");

const five = evaluateThresholds({
  status: "fifteen_minutes_away",
  threshold30Sent: true,
  threshold15Sent: true,
  threshold5Sent: false,
  arrivedNotified: false,
  completedNotified: false,
  delayNotified: false,
  liveTrackingEnabled: true,
  minutesAway: 4,
  direction: "pickup"
});
assert.ok(five.events.includes("final_5"));

const delay = evaluateThresholds(
  {
    status: "fifteen_minutes_away",
    threshold30Sent: true,
    threshold15Sent: true,
    threshold5Sent: true,
    arrivedNotified: false,
    completedNotified: false,
    delayNotified: false,
    liveTrackingEnabled: true,
    minutesAway: 30,
    direction: "pickup"
  },
  { previousMinutesAway: 12, delayIncreaseMinutes: 15 }
);
assert.ok(delay.events.includes("delay"));

// Privacy / live location gating
assert.equal(
  shouldExposeLiveLocation({
    status: "thirty_minutes_away",
    liveTrackingEnabledAt: null,
    completedAt: null,
    cancelledAt: null,
    emergencyPrivacyMode: false,
    gpsStale: false,
    isNextStopOrWithinThreshold: true
  }),
  false
);
assert.equal(
  shouldExposeLiveLocation({
    status: "fifteen_minutes_away",
    liveTrackingEnabledAt: new Date().toISOString(),
    completedAt: null,
    cancelledAt: null,
    emergencyPrivacyMode: false,
    gpsStale: false,
    isNextStopOrWithinThreshold: true
  }),
  true
);
assert.equal(
  shouldExposeLiveLocation({
    status: "completed",
    liveTrackingEnabledAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    cancelledAt: null,
    emergencyPrivacyMode: false,
    gpsStale: false,
    isNextStopOrWithinThreshold: true
  }),
  false
);

assert.match(ownerStatusLabel("thirty_minutes_away", "pickup"), /on the way/i);

// Templates
const rendered = renderTrackingTemplate(DEFAULT_TEMPLATES.pickup_15, {
  dog_names: "Buddy",
  tracking_url: "https://staff.ruffops.com/track/abc"
});
assert.match(rendered, /Buddy/);
assert.match(rendered, /track\/abc/);
assert.equal(escapeTemplateValue("<script>"), "&lt;script&gt;");
assert.equal(renderTrackingTemplate("Hi {{evil}}", { evil: "x" }), "Hi ");

// Webhook signatures
const secret = "test-webhook-secret";
const rawBody = JSON.stringify({ eventId: "evt_1", eventType: "RouteStopEtaUpdated", data: { stopId: "s1", eta: new Date().toISOString() } });
const ts = String(Math.floor(Date.now() / 1000));
const sig = createHmac("sha256", secret).update(`v1:${ts}:${rawBody}`).digest("hex");
const ok = verifySamsaraWebhookSignature({
  rawBody,
  timestampHeader: ts,
  signatureHeader: `v1=${sig}`,
  secret
});
assert.equal(ok.ok, true);

const bad = verifySamsaraWebhookSignature({
  rawBody,
  timestampHeader: ts,
  signatureHeader: "v1=deadbeef",
  secret
});
assert.equal(bad.ok, false);

const replay = verifySamsaraWebhookSignature({
  rawBody,
  timestampHeader: String(Math.floor(Date.now() / 1000) - 10_000),
  signatureHeader: `v1=${sig}`,
  secret,
  replayWindowSeconds: 300
});
assert.equal(replay.ok, false);

assert.equal(isWebhookPing({ eventType: "Ping" }), true);
assert.equal(extractWebhookEventId(JSON.parse(rawBody)), "evt_1");
const sanitized = sanitizeWebhookPayload({
  eventId: "evt_1",
  eventType: "x",
  data: { phone: "555", stopId: "s1" }
});
assert.equal((sanitized.data as { phone?: string }).phone, undefined);

// Owner snapshot privacy
const snapshot = buildOwnerSafeSnapshot({
  session: {
    id: "sess-1",
    status: "fifteen_minutes_away",
    direction: "pickup",
    dog_names: ["Mochi"],
    van_display_name: "Van 1",
    van_key: "van_1",
    stop_latitude: 34.01,
    stop_longitude: -118.49,
    stop_address_masked: "Santa Monica, CA",
    vehicle_latitude: 34.02,
    vehicle_longitude: -118.48,
    vehicle_heading: 90,
    vehicle_accuracy_meters: 12,
    last_gps_at: new Date().toISOString(),
    current_eta_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    eta_source: "samsara_route_eta",
    live_tracking_enabled_at: new Date().toISOString(),
    completed_at: null,
    cancelled_at: null,
    emergency_privacy_mode: false,
    arrived_at: null,
    operating_date: "2026-07-26",
    health_status: "healthy"
  },
  routeLine: [
    { lat: 34.02, lng: -118.48 },
    { lat: 34.01, lng: -118.49 }
  ],
  contactPhone: "+13105551212"
});
assert.equal(snapshot.liveLocationVisible, true);
assert.ok(snapshot.vehicle);
assert.equal(snapshot.driverDisplayName, "Your Fitdog Driver");
assertOwnerPayloadSafe(snapshot);
assert.equal(maskPhone("+13105551212"), "***-***-1212");

const hidden = buildOwnerSafeSnapshot({
  session: {
    id: "sess-2",
    status: "thirty_minutes_away",
    direction: "dropoff",
    dog_names: ["Rex"],
    van_display_name: "Van 3",
    van_key: "van_3",
    stop_latitude: 34.01,
    stop_longitude: -118.49,
    stop_address_masked: "area",
    vehicle_latitude: 34.02,
    vehicle_longitude: -118.48,
    vehicle_heading: null,
    vehicle_accuracy_meters: null,
    last_gps_at: new Date().toISOString(),
    current_eta_at: new Date(Date.now() + 25 * 60_000).toISOString(),
    eta_source: "scheduled_time",
    live_tracking_enabled_at: null,
    completed_at: null,
    cancelled_at: null,
    emergency_privacy_mode: false,
    arrived_at: null,
    operating_date: "2026-07-26",
    health_status: "healthy"
  }
});
assert.equal(hidden.liveLocationVisible, false);
assert.equal(hidden.vehicle, null);
assert.deepEqual(hidden.routeLine, []);

// Van 4 never
assert.throws(() => assertNeverVan4("Van 4"));
assert.throws(() => assertNeverVan4("van_4"));
assert.equal(mapDisplayNameToVanKey("Van 1"), "van_1");
assert.equal(mapDisplayNameToVanKey("Van 5"), "van_5");
assert.throws(() => mapDisplayNameToVanKey("Van 4"));

// Permissions
const mgmt = accessFromLegacyRole(null, null, "assistant_manager");
assert.equal(canUseLiveTracking(mgmt), true);
assert.equal(hasLiveTrackingPermission(mgmt, "live_tracking.view"), true);
assert.equal(hasLiveTrackingPermission(mgmt, "live_tracking.manage_settings"), false);

const staff = accessFromLegacyRole(null, null, "daycare");
assert.equal(canUseLiveTracking(staff), false);

const coord = accessFromLegacyRole(null, null, "front_desk_coordinator");
assert.equal(canUseLiveTracking(coord), true);
assert.equal(hasLiveTrackingPermission(coord, "live_tracking.view"), true);
assert.equal(hasLiveTrackingPermission(coord, "live_tracking.manage"), false);

assert.equal(idempotencyKey("stop1", "live_15", "sms"), "tracking:stop1:live_15:sms");

// Fixtures: GPS feed parse shape + route event
const gpsFixture = {
  data: [
    {
      id: "veh_1",
      gps: { latitude: 34.02, longitude: -118.48, heading: 180, time: new Date().toISOString() }
    }
  ]
};
assert.equal(Number(gpsFixture.data[0].gps.latitude) > 0, true);

console.log("live-tracking tests: ok");

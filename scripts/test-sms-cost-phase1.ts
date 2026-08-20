import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { estimateSmsSegments, sanitizeSmsBody } from "../lib/integrations/sms/estimate-segments";
import {
  buildAdminAlertSms,
  buildRouteEta15Sms,
  buildRouteEta30Sms,
  buildRoutePullupSms,
  buildRouteTrackingLinkSms,
  ROUTE_SMS_FIXTURE
} from "../lib/integrations/sms/templates";

function gsmChar(repeat: number) {
  return "a".repeat(repeat);
}

// --- GSM segment estimator ---

assert.equal(estimateSmsSegments("Hello").encoding, "GSM-7");
assert.equal(estimateSmsSegments("Hello").segments, 1);

assert.equal(estimateSmsSegments(gsmChar(159)).segments, 1);
assert.equal(estimateSmsSegments(gsmChar(159)).units, 159);
assert.equal(estimateSmsSegments(gsmChar(160)).segments, 1);
assert.equal(estimateSmsSegments(gsmChar(160)).units, 160);
assert.equal(estimateSmsSegments(gsmChar(161)).segments, 2);

const tilde = estimateSmsSegments("~");
assert.equal(tilde.encoding, "GSM-7");
assert.equal(tilde.segments, 1);
assert.equal(tilde.units, 2);
assert.equal(tilde.extensionCharacterCount, 1);

const pipe = estimateSmsSegments("|");
assert.equal(pipe.encoding, "GSM-7");
assert.equal(pipe.units, 2);
assert.equal(pipe.extensionCharacterCount, 1);

const braces = estimateSmsSegments("{}");
assert.equal(braces.encoding, "GSM-7");
assert.equal(braces.units, 4);
assert.equal(braces.extensionCharacterCount, 2);

const backslash = estimateSmsSegments("\\");
assert.equal(backslash.encoding, "GSM-7");
assert.equal(backslash.units, 2);

const emDash = estimateSmsSegments("—");
assert.equal(emDash.encoding, "UCS-2");
assert.equal(emDash.nonGsmCharacters.includes("—"), true);

const middleDot = estimateSmsSegments("·");
assert.equal(middleDot.encoding, "UCS-2");

const curly = estimateSmsSegments("\u201chello\u201d");
assert.equal(curly.encoding, "UCS-2");

const emoji = estimateSmsSegments("🐶");
assert.equal(emoji.encoding, "UCS-2");
assert.equal(emoji.units, 2);

const ucs69 = "—".repeat(69);
const ucs70 = "—".repeat(70);
const ucs71 = "—".repeat(71);
assert.equal(estimateSmsSegments(ucs69).encoding, "UCS-2");
assert.equal(estimateSmsSegments(ucs69).units, 69);
assert.equal(estimateSmsSegments(ucs69).segments, 1);
assert.equal(estimateSmsSegments(ucs70).units, 70);
assert.equal(estimateSmsSegments(ucs70).segments, 1);
assert.equal(estimateSmsSegments(ucs71).units, 71);
assert.equal(estimateSmsSegments(ucs71).segments, 2);

assert.equal(sanitizeSmsBody("A—B·C").includes("-"), true);
assert.equal(sanitizeSmsBody("A—B·C").includes("|"), true);
assert.equal(sanitizeSmsBody("~15 min").includes("~"), true);

// --- Route templates (optimized, GSM-7, 1 segment with fixture) ---

const fixture = ROUTE_SMS_FIXTURE;
const linkBody = buildRouteTrackingLinkSms({
  dogs: fixture.dogs,
  direction: fixture.direction,
  url: fixture.url
});
const eta30Body = buildRouteEta30Sms({
  dogs: fixture.dogs,
  etaMinutes: 30,
  url: fixture.url
});
const eta15Body = buildRouteEta15Sms({
  dogs: fixture.dogs,
  etaMinutes: fixture.etaMinutes,
  url: fixture.url
});
const pullupBody = buildRoutePullupSms({ dogs: fixture.dogs, url: fixture.url });

for (const [label, body] of [
  ["tracking link", linkBody],
  ["eta 30", eta30Body],
  ["eta 15", eta15Body],
  ["pullup", pullupBody]
] as const) {
  const est = estimateSmsSegments(body);
  assert.equal(est.encoding, "GSM-7", `${label} should be GSM-7, got ${est.encoding} for: ${body}`);
  assert.equal(est.segments, 1, `${label} should be 1 segment (${est.units} units): ${body}`);
  assert.ok(est.units <= 150, `${label} should be <= 150 septets, got ${est.units}`);
}

// BEFORE vs AFTER (audit baseline with em dash / tilde / address)
const beforeLink = `Fitdog: track ${fixture.dogs}'s pickup live — ${fixture.url}`;
const afterLink = linkBody;
assert.equal(estimateSmsSegments(beforeLink).encoding, "UCS-2");
assert.equal(estimateSmsSegments(beforeLink).segments, 2);
assert.equal(estimateSmsSegments(afterLink).segments, 1);

const before30 = `Fitdog: your driver is about 30 minutes away for ${fixture.dogs}. Track live: ${fixture.url}`;
assert.equal(estimateSmsSegments(before30).segments, 1);

const before15 = `Fitdog: your driver is ~${fixture.etaMinutes} minutes out for ${fixture.dogs}. Live map: ${fixture.url}`;
const before15Est = estimateSmsSegments(before15);
assert.equal(before15Est.encoding, "GSM-7");
assert.equal(before15Est.segments, 1);

const beforePullup = `Fitdog: driver is pulling up for ${fixture.dogs} at 1234 Main Street right now. ${fixture.url}`;
assert.ok(estimateSmsSegments(beforePullup).units > estimateSmsSegments(pullupBody).units);

// Admin alert
const adminShort = buildAdminAlertSms({
  title: "Write-up submitted for review",
  detail: "Handler · late return",
  adminPath: "/admin?board=staff&tab=write_up_review",
  siteBase: "https://fitdog.ruffops.com"
});
assert.equal(estimateSmsSegments(adminShort).encoding, "GSM-7");
assert.equal(estimateSmsSegments(adminShort).segments, 1);

const criticalLong = buildAdminAlertSms({
  title: "URGENT: Dog fight in yard",
  detail:
    "Two dogs engaged near gate 3. Staff separated. Monitor both dogs for puncture wounds and notify owner immediately.",
  adminPath: "/admin?board=admin&tab=emergency_alerts",
  includeLink: true,
  siteBase: "https://fitdog.ruffops.com"
});
assert.ok(estimateSmsSegments(criticalLong).segments >= 1);
assert.ok(criticalLong.length > 80, "critical alert must not be destructively truncated");

// Idempotency wiring (static source checks)
const processor = readFileSync(join(process.cwd(), "lib/ruffly/jobs/processor.ts"), "utf8");
assert.match(processor, /ruffly-review:\$\{reservationId\}/);

const inbox = readFileSync(join(process.cwd(), "app/api/ruffly/inbox/[id]/route.ts"), "utf8");
assert.match(inbox, /ruffly-inbox:\$\{message\.id\}/);

const superAdmin = readFileSync(join(process.cwd(), "lib/staff/super-admin-sms.ts"), "utf8");
assert.match(superAdmin, /sa-sms:urgent:push:\$\{input\.id\}/);
assert.doesNotMatch(superAdmin, /Date\.now\(\)/);

const trackingTab = readFileSync(join(process.cwd(), "components/admin/RouteGeneratorTrackingTab.tsx"), "utf8");
assert.match(trackingTab, /Resend tracking text/);
assert.match(trackingTab, /resendingId/);

const ownerTracking = readFileSync(join(process.cwd(), "lib/route-generator/owner-tracking.ts"), "utf8");
assert.match(ownerTracking, /notified_30_at/);
assert.match(ownerTracking, /buildRouteEta30Sms/);
assert.match(ownerTracking, /buildRouteEta15Sms/);
assert.match(ownerTracking, /buildRoutePullupSms/);

const migration = readFileSync(join(process.cwd(), "supabase/migrations/084_sms_cost_events.sql"), "utf8");
assert.match(migration, /sms_cost_events/);

const reconcileCron = readFileSync(join(process.cwd(), "app/api/cron/sms-cost-reconcile/route.ts"), "utf8");
assert.match(reconcileCron, /reconcileSmsCostEvents/);

console.log("test-sms-cost-phase1: ok");
console.log(
  JSON.stringify(
    {
      templates: {
        tracking_link: { before: estimateSmsSegments(beforeLink), after: estimateSmsSegments(afterLink) },
        eta_30: { before: estimateSmsSegments(before30), after: estimateSmsSegments(eta30Body) },
        eta_15: { before: before15Est, after: estimateSmsSegments(eta15Body) },
        pullup: { before: estimateSmsSegments(beforePullup), after: estimateSmsSegments(pullupBody) },
        admin_short: estimateSmsSegments(adminShort),
        admin_critical: estimateSmsSegments(criticalLong)
      }
    },
    null,
    2
  )
);

/**
 * Regression tests for Gingr Service Addons report PDF import.
 * Run: npx tsx scripts/test-gingr-service-addons-import.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildScheduleFromGingrUpload } from "../lib/gingr-route-generator/import-file";
import { extractPdfText, isPdfBuffer } from "../lib/gingr-route-generator/pdf-text";
import { isRecognizedServiceAddon } from "../lib/gingr-route-generator/service-addon-labels";

const FIXTURE = path.resolve(
  process.env.GINGR_SERVICE_ADDONS_PDF ||
    "/home/ubuntu/.cursor/projects/agent-repos-digiwhiteboard/uploads/service-addons-route-notes_b607.pdf"
);
const ROUTE_DATE = "2026-11-16";

function dog(schedule: ReturnType<typeof buildScheduleFromGingrUpload>, name: string) {
  return schedule.dogs.find((entry) => entry.name === name || entry.name.startsWith(name));
}

assert.ok(fs.existsSync(FIXTURE), `Fixture PDF missing: ${FIXTURE}`);
const buffer = fs.readFileSync(FIXTURE);
assert.ok(isPdfBuffer(buffer));
const text = extractPdfText(buffer);
assert.ok(text.length > 500, "PDF text extraction should decode Flate streams");
assert.ok(text.toLowerCase().includes("service addons"));

for (const label of [
  "Before Outing - Fitdog to Pick Up @ Home",
  "After Outing - Fitdog to Drop Off @ Home",
  "Before Outing - Owner To Drop Off @ Fitdog Club",
  "After Outing - Owner Pick Up @ Fitdog Club",
  "Boarding @ Fitdog Club"
]) {
  assert.ok(isRecognizedServiceAddon(label), `Canonical addon: ${label}`);
}

const schedule = buildScheduleFromGingrUpload({ buffer, fileName: "service-addons-route-notes.pdf", date: ROUTE_DATE });
assert.ok(schedule.dogs.length >= 15, `Expected most report dogs; got ${schedule.dogs.length}`);

const fitdogHome = dog(schedule, "Zuma Coccari") || dog(schedule, "Zuma");
assert.ok(fitdogHome, "Expected Zuma from fixture");
assert.deepEqual(fitdogHome!.appointmentOptions, [
  "Before Outing - Fitdog to Pick Up @ Home",
  "After Outing - Fitdog to Drop Off @ Home"
]);
assert.equal(fitdogHome!.startLocation, "home");
assert.equal(fitdogHome!.endLocation, "home");
assert.equal(fitdogHome!.transportPlan.filters.beforePickup, true);
assert.equal(fitdogHome!.transportPlan.filters.afterDropoff, true);

const ownerClub = dog(schedule, "Luci");
assert.ok(ownerClub, "Expected Luci");
assert.equal(ownerClub!.transportPlan.status, "OK");
assert.equal(ownerClub!.startLocation, "club");
assert.equal(ownerClub!.endLocation, "club");
assert.equal(ownerClub!.transportPlan.filters.ownerManaged, true);
assert.equal(ownerClub!.ownerClubDropoff, true);
assert.equal(ownerClub!.ownerClubPickup, true);

const boarding = dog(schedule, "Maverick");
assert.ok(boarding, "Expected Maverick boarding row");
assert.ok(boarding!.transportPlan.isBoarding);
assert.equal(boarding!.startLocation, "club");
assert.equal(boarding!.endLocation, "club");

console.log(`OK — ${schedule.dogs.length} dogs from Service Addons PDF; transport classifications verified.`);
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  humanizeUnknownError,
  isInfrastructureError,
  LIVE_DATA_SLOW_MESSAGE,
  LIVE_DATA_UNAVAILABLE_MESSAGE
} from "../lib/safe-url";
import { emptyOpsCommandCenterSnapshot } from "../lib/ops-command-center/snapshot";
import { OPS_SNAPSHOT_BUILD_TIMEOUT_MS, OPS_SNAPSHOT_TIMEOUT_MS } from "../lib/ops-command-center/constants";
import { readResponseJson } from "../lib/http/read-response-json";
import { withTimeoutFallback } from "../lib/server-ttl-cache";

assert.equal(OPS_SNAPSHOT_TIMEOUT_MS, 6_000);
assert.equal(OPS_SNAPSHOT_BUILD_TIMEOUT_MS, 7_000);
assert.ok(OPS_SNAPSHOT_BUILD_TIMEOUT_MS > OPS_SNAPSHOT_TIMEOUT_MS);

assert.equal(
  humanizeUnknownError(new Error("The string did not match the expected pattern."), "Unable to load My Shift. Retry shortly."),
  "Unable to load My Shift. Retry shortly."
);
assert.equal(
  humanizeUnknownError(new Error("<!DOCTYPE html><html><title>supabas out</title>Error code 522</html>"), "fallback"),
  LIVE_DATA_UNAVAILABLE_MESSAGE
);
assert.equal(humanizeUnknownError(new Error("ops-access timed out after 6000ms."), "fallback"), LIVE_DATA_SLOW_MESSAGE);
assert.equal(isInfrastructureError(new Error("Failed to fetch")), true);

const empty = emptyOpsCommandCenterSnapshot({
  email: "lonnie@fitdog.com",
  displayName: "Lonnie",
  roleKey: "super_admin",
  roleLabel: "Super Admin"
});
assert.equal(empty.greetingName, "Lonnie");
assert.equal(empty.shiftSummary.dogsOnFloor, 0);
assert.equal(empty.pending, true);
assert.equal(empty.stale, false);
assert.equal(empty.gingrHealth.status, "healthy");
assert.equal(empty.staffOpsHealth.status, "ok");
assert.doesNotMatch(empty.staffOpsHealth.detail || "", /could not be loaded/);
assert.doesNotMatch(empty.gingrHealth.detail || "", /No Gingr webhook/);

async function testJsonReaders() {
  const html = new Response("<!DOCTYPE html><html><title>supabas out</title>Error code 522</html>", {
    headers: { "content-type": "text/html" }
  });
  await assert.rejects(() => readResponseJson(html), /temporarily unavailable/);

  const json = new Response(JSON.stringify({ greetingName: "Lonnie", stale: true }), {
    headers: { "content-type": "application/json" }
  });
  const body = await readResponseJson<{ greetingName: string }>(json);
  assert.equal(body.greetingName, "Lonnie");
}

{
  const route = readFileSync("app/api/admin/ops-command-center/route.ts", "utf8");
  assert.match(route, /loadOpsCommandCenterSnapshot/);
  assert.match(route, /accessFromLegacyRole/);
  assert.match(route, /maxDuration/);
  assert.doesNotMatch(route, /getUserAccess/);
  assert.doesNotMatch(route, /buildOpsCommandCenterSnapshot\(/);
}

{
  const panel = readFileSync("components/admin/ops-command-center/OpsCommandCenterPanel.tsx", "utf8");
  assert.match(panel, /readResponseJson/);
  assert.match(panel, /emptyOpsCommandCenterSnapshot/);
  assert.doesNotMatch(panel, /45_000/);
  assert.doesNotMatch(panel, /This page is taking too long to load/);
  assert.match(panel, /data\.pending/);
  assert.match(panel, /staffOpsHealth.status === "error"/);
}

{
  const snapshot = readFileSync("lib/ops-command-center/snapshot.ts", "utf8");
  assert.match(snapshot, /OPS_SNAPSHOT_TIMEOUT_MS/);
  assert.match(snapshot, /OPS_SNAPSHOT_BUILD_TIMEOUT_MS/);
  assert.match(snapshot, /last-good|OPS_SNAPSHOT_LAST_GOOD_KEY/);
  assert.match(snapshot, /shouldCacheOpsSnapshot|probeTimedOut|delayedStaffFeed/);
}

void testJsonReaders()
  .then(() => {
    console.log("ops-command-center resilience tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

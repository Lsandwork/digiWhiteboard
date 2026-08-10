import assert from "node:assert/strict";
import {
  OPS_DOG_STATUSES,
  OPS_EVENT_CATEGORIES,
  OPS_PRIORITIES,
  OPS_TASK_STATUSES
} from "../lib/ops-command-center/types";

assert.ok(OPS_DOG_STATUSES.includes("checked_in"));
assert.ok(OPS_DOG_STATUSES.includes("ready_for_pickup"));
assert.ok(OPS_DOG_STATUSES.includes("transportation"));
assert.ok(OPS_EVENT_CATEGORIES.includes("check_in"));
assert.ok(OPS_EVENT_CATEGORIES.includes("grooming"));
assert.ok(OPS_EVENT_CATEGORIES.includes("transportation"));
assert.deepEqual([...OPS_PRIORITIES], ["critical", "high", "attention", "informational"]);
assert.ok(OPS_TASK_STATUSES.includes("escalated"));
assert.ok(OPS_TASK_STATUSES.includes("snoozed"));

// Board → ops status mapping (mirror adapter rules for unit coverage).
function mapBoardDisplayToOpsStatus(
  displayStatus?: string | null,
  currentStatus?: string | null,
  room?: string | null
) {
  const token = `${displayStatus || ""} ${currentStatus || ""}`.toLowerCase();
  if (token.includes("checking_out") || token.includes("checked_out")) return "checked_out";
  if (token.includes("ready") && token.includes("pickup")) return "ready_for_pickup";
  if (token.includes("checking_in")) return "arrived";
  if (token.includes("checked_in")) {
    const roomToken = (room || "").toLowerCase();
    if (roomToken.includes("groom")) return "grooming";
    if (roomToken.includes("train")) return "training";
    if (roomToken.includes("break")) return "break";
    if (roomToken.includes("yard") || roomToken.includes("play")) return "yard";
    return "checked_in";
  }
  return "other";
}

assert.equal(mapBoardDisplayToOpsStatus("checking_in", "checking_in"), "arrived");
assert.equal(mapBoardDisplayToOpsStatus("checking_out", "checking_out"), "checked_out");
assert.equal(mapBoardDisplayToOpsStatus(null, "checked_in", "Small Yard"), "yard");
assert.equal(mapBoardDisplayToOpsStatus(null, "checked_in", "Grooming Suite"), "grooming");
assert.equal(mapBoardDisplayToOpsStatus(null, "checked_out"), "checked_out");

console.log("test-ops-command-center-foundation: ok");

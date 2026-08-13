import assert from "node:assert/strict";
import {
  availableActionsForKind,
  parseWorkItemId,
  workItemActionLabel,
  WORK_ITEM_ACTIONS
} from "../lib/ops-command-center/work-item-actions";

assert.deepEqual(parseWorkItemId("task:abc"), { kind: "ops_task", sourceId: "abc" });
assert.deepEqual(parseWorkItemId("followup:fu-1"), { kind: "owner_follow_up", sourceId: "fu-1" });
assert.deepEqual(parseWorkItemId("issue:is-1"), { kind: "active_issue", sourceId: "is-1" });
assert.deepEqual(parseWorkItemId("payment:pay-1"), { kind: "payment_alert", sourceId: "pay-1" });
assert.deepEqual(parseWorkItemId("notif:n-1"), { kind: "ops_notification", sourceId: "n-1" });
assert.equal(parseWorkItemId("unknown"), null);

for (const action of WORK_ITEM_ACTIONS) {
  assert.ok(workItemActionLabel(action).length > 0);
}

assert.ok(availableActionsForKind("ops_task").includes("resolved"));
assert.ok(availableActionsForKind("ops_task").includes("in_progress"));
assert.ok(availableActionsForKind("ops_task").includes("delete"));
assert.ok(availableActionsForKind("owner_follow_up").includes("archive"));
assert.ok(availableActionsForKind("active_issue").includes("in_progress"));
assert.ok(availableActionsForKind("payment_alert").includes("resolved"));
assert.ok(availableActionsForKind("ops_notification").includes("clear"));
assert.ok(!availableActionsForKind("ops_notification").includes("archive"));

console.log("ops-command-center-work-item-actions: ok");

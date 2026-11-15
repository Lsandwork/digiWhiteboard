/**
 * My Shift Shift Entry Log — multi-destination publishing UI wiring.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const composer = readFileSync(join(root, "components/admin/BulkShiftLogComposer.tsx"), "utf8");
const panel = readFileSync(join(root, "components/admin/ops-command-center/OpsCommandCenterPanel.tsx"), "utf8");
const dash = readFileSync(join(root, "components/admin/ops-command-center/MyShiftDashboard.tsx"), "utf8");

assert.match(composer, /Add to Active Issues/);
assert.match(composer, /Add to Owner Follow Up/);
assert.match(composer, /create_owner_follow_up/);
assert.match(composer, /create_active_issue/);
assert.match(panel, /shiftLogPublishSuccessMessage/);
assert.match(panel, /create_crossover_bulk/);
assert.match(dash, /multiLogPublish/);

console.log("test-my-shift-multi-log-publish: ok");
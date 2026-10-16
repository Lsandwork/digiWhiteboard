import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COMMAND_CENTER_EXTERNAL_LINKS,
  COMMAND_CENTER_MODULE_LINKS
} from "../lib/ops-command-center/command-links";

assert.ok(COMMAND_CENTER_MODULE_LINKS.length >= 10);
assert.ok(COMMAND_CENTER_MODULE_LINKS.some((link) => link.tab === "body_checks"));
assert.ok(COMMAND_CENTER_MODULE_LINKS.some((link) => link.tab === "walks_board"));
assert.ok(COMMAND_CENTER_EXTERNAL_LINKS.some((link) => link.href === "/gingr"));

const root = resolve(__dirname, "..");
const overview = readFileSync(resolve(root, "components/admin/ops-command-center/OpsCommandOverview.tsx"), "utf8");
assert.match(overview, /\/api\/admin\/ops-command-center"/);
assert.doesNotMatch(overview, /view=live_floor/);
assert.doesNotMatch(overview, /startVisibilityAwareInterval/);
assert.doesNotMatch(overview, /\/api\/board\/checkouts/);
assert.match(overview, /Open Live Floor/);
assert.match(overview, /OpsLiveCommandCenter/);

const dashboard = readFileSync(resolve(root, "components/admin/AdminDashboard.tsx"), "utf8");
assert.match(dashboard, /OpsCommandOverview/);
assert.match(dashboard, /tab === "ops_command_center"/);
// Default OCC tab must not mount live floor until the operator asks.
assert.doesNotMatch(
  dashboard,
  /tab === "ops_command_center" \? \(\s*<OpsLiveCommandCenter/
);

console.log("ops command overview tests passed");

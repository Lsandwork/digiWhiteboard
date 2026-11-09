import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MY_SHIFT_ASSETS, myShiftPortraitForName } from "../lib/ops-command-center/my-shift-assets";

const panel = readFileSync(join(process.cwd(), "components/admin/ops-command-center/OpsCommandCenterPanel.tsx"), "utf8");
const dash = readFileSync(join(process.cwd(), "components/admin/ops-command-center/MyShiftDashboard.tsx"), "utf8");
const snapshot = readFileSync(join(process.cwd(), "lib/ops-command-center/snapshot.ts"), "utf8");
const css = readFileSync(join(process.cwd(), "lib/theme/my-shift.css"), "utf8");
const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

assert.match(panel, /MyShiftDashboard/);
assert.match(dash, /Dogs Today/);
assert.match(dash, /Boarding Stays/);
assert.match(dash, /Taxi Runs/);
assert.match(dash, /Classes Today/);
assert.match(dash, /Grooming Appts/);
assert.match(dash, /Shift Details/);
assert.match(dash, /Today’s Tasks/);
assert.match(dash, /Important Alerts/);
assert.match(dash, /Team on Shift/);
assert.match(dash, /Quick Actions/);
assert.match(dash, /Recent Activity/);
assert.match(dash, /heroDog/);
assert.doesNotMatch(dash, /\b24\b Dogs Today/);
assert.match(snapshot, /facilityPulse/);
assert.match(snapshot, /teamOnShift/);
assert.match(snapshot, /loadLiveFloor/);
assert.match(css, /#020b1b/);
assert.match(css, /#079bff/);
assert.match(layout, /my-shift\.css/);
assert.equal(myShiftPortraitForName("Sarah M."), MY_SHIFT_ASSETS.portraits.sarah);
assert.equal(myShiftPortraitForName("Unknown Handler"), null);
assert.match(dash, /create_crossover_bulk|Shift Entry Log/);

console.log("my-shift-dashboard: ok");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  OPS_SNAPSHOT_CACHE_KEY,
  OPS_SNAPSHOT_POSITIVE_TTL_MS,
  STAFF_OPS_LIST_CACHE_KEY,
  STAFF_OPS_LIST_CACHE_TTL_MS
} from "../lib/ops-command-center/constants";
import { skipDashboardBackgroundHydrate } from "../lib/admin/dashboard-load";
import { readPanelCache, writePanelCache, clearPanelCache } from "../lib/admin/panel-session-cache";

assert.equal(OPS_SNAPSHOT_POSITIVE_TTL_MS, 20_000);
assert.equal(STAFF_OPS_LIST_CACHE_TTL_MS, 20_000);
assert.equal(STAFF_OPS_LIST_CACHE_KEY, "staff-ops:list");
assert.ok(OPS_SNAPSHOT_CACHE_KEY.length > 0);

assert.equal(skipDashboardBackgroundHydrate("staff", "my_shift"), true);
assert.equal(skipDashboardBackgroundHydrate("staff", "crossover_communication"), true);
assert.equal(skipDashboardBackgroundHydrate("staff", "front_desk_command"), true);

clearPanelCache();
assert.equal(readPanelCache("x", 1_000), null);
writePanelCache("x", { ok: true });
assert.deepEqual(readPanelCache<{ ok: boolean }>("x", 1_000), { ok: true });
clearPanelCache("x");
assert.equal(readPanelCache("x", 1_000), null);

const root = resolve(__dirname, "..");
const roleWorkspaces = readFileSync(resolve(root, "components/admin/ops-command-center/RoleWorkspaces.tsx"), "utf8");
assert.match(roleWorkspaces, /view=board_lanes/);
assert.doesNotMatch(roleWorkspaces, /fetch\(["'`]\/api\/board\/checkouts/);

const opsRoute = readFileSync(resolve(root, "app/api/admin/ops-command-center/route.ts"), "utf8");
assert.match(opsRoute, /view === "board_lanes"/);
assert.match(opsRoute, /loadAdminBoardLanes/);

const snapshot = readFileSync(resolve(root, "lib/ops-command-center/snapshot.ts"), "utf8");
assert.match(snapshot, /OPS_SNAPSHOT_POSITIVE_TTL_MS/);
assert.match(snapshot, /OPS_SNAPSHOT_CACHE_KEY/);

const staffFeed = readFileSync(resolve(root, "lib/ops-command-center/adapters/staff-ops-feed.ts"), "utf8");
assert.match(staffFeed, /STAFF_OPS_LIST_CACHE_KEY/);
assert.match(staffFeed, /getOrLoadTtlCache/);

const panel = readFileSync(resolve(root, "components/admin/ops-command-center/OpsCommandCenterPanel.tsx"), "utf8");
assert.match(panel, /readPanelCache/);
assert.match(panel, /writePanelCache/);

console.log("admin nav speed tests passed");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildAdminDashboardHref,
  parseAdminDashboardSearch,
  parseKnownAdminTab
} from "../lib/admin/dashboard-nav";
import { hubLinkHref } from "../lib/admin/super-admin-nav";

const root = process.cwd();

assert.equal(parseKnownAdminTab("help"), "help");
assert.equal(parseKnownAdminTab("sa_apps_hub"), "sa_apps_hub");
assert.equal(parseKnownAdminTab("bulk_photo_upload"), "bulk_photo_upload");
assert.equal(parseKnownAdminTab(null), null);
assert.equal(parseKnownAdminTab(""), null);
assert.equal(parseKnownAdminTab("not-a-tab"), null);
assert.equal(parseKnownAdminTab("overview"), "overview");

const missing = parseAdminDashboardSearch("");
assert.equal(missing.rawBoard, null);
assert.equal(missing.tab, null);
assert.equal(missing.board, "staff");

const parsed = parseAdminDashboardSearch("?board=staff&tab=sa_floor_hub");
assert.equal(parsed.board, "staff");
assert.equal(parsed.rawBoard, "staff");
assert.equal(parsed.tab, "sa_floor_hub");

assert.equal(
  buildAdminDashboardHref("staff", "bulk_photo_upload"),
  "/admin?board=staff&tab=bulk_photo_upload"
);
assert.equal(
  buildAdminDashboardHref("marketing", "sa_apps_hub"),
  "/admin?board=marketing&tab=sa_apps_hub"
);
assert.equal(
  hubLinkHref({ kind: "tab", tab: "crossover_communication", label: "Team Log", description: "" }),
  "/admin?board=staff&tab=crossover_communication"
);
assert.equal(
  hubLinkHref({
    kind: "route",
    id: "automatic-blog",
    href: "/admin/automatic-blog",
    label: "Blog Generator",
    description: ""
  }),
  "/admin/automatic-blog"
);

const dashboard = readFileSync(join(root, "components/admin/AdminDashboard.tsx"), "utf8");
assert.equal(dashboard.includes("useSearchParams"), false, "dashboard must not remount via useSearchParams");
assert.match(dashboard, /navigateAdminDashboard/);
assert.match(dashboard, /Do not bounce known tabs to My Shift/);

const hub = readFileSync(join(root, "components/admin/SuperAdminHubPanel.tsx"), "utf8");
assert.match(hub, /onClick=\{\(\) => onNavigate\(link\.tab\)\}/);
assert.match(hub, /if \(isRoute\)/);
assert.equal(
  hub.includes("<Link\n        href={href}") || hub.includes("href={href}"),
  true,
  "standalone apps still use Link"
);

console.log("admin dashboard nav tests passed");

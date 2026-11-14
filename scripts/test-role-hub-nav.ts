import assert from "node:assert/strict";
import { ADMIN_TABS, type AdminTab } from "../lib/admin/types";
import { accessFromLegacyRole, canAccessAdminTab, canAccessGingrRouteGenerator } from "../lib/admin/permissions";
import { buildStaffPanelNav, type NavEntry } from "../lib/admin/nav-groups";
import {
  HUB_NAV_ROLES,
  rolePrimaryTabs,
  uncoveredVisibleTabs,
  type HubNavRole
} from "../lib/admin/role-hub-nav";
import { filterHelpArticlesForRole } from "../lib/admin/help-content";
import type { AdminUserRole } from "../lib/admin/users";

function countNavIcons(entries: NavEntry[]) {
  let count = 0;
  for (const entry of entries) {
    if (entry.type === "item" || entry.type === "route") count += 1;
    if (entry.type === "group") count += entry.children.length;
  }
  return count;
}

for (const role of HUB_NAV_ROLES) {
  const access = accessFromLegacyRole(`hub-${role}`, `${role}@fitdog.test`, role);
  const visible = ADMIN_TABS.filter((tab) => canAccessAdminTab(access, tab, role, "staff"));
  const nav = buildStaffPanelNav(visible, "staff", role);
  const icons = countNavIcons(nav);
  const cap = role === "front_desk_coordinator" ? 20 : 10;
  assert.ok(icons <= cap, `${role} sidebar icons must be <= ${cap}, got ${icons}`);
  assert.ok(icons >= 1, `${role} must have at least one sidebar tab`);

  const missing = uncoveredVisibleTabs(role as HubNavRole, visible).filter((tab) => tab !== "user_interactions");
  assert.deepEqual(
    missing,
    [],
    `${role} has accessible staff tabs missing from hubs/primary: ${missing.join(", ")}`
  );

  const primaryTabs = rolePrimaryTabs(role as HubNavRole);
  if (role === "front_desk_coordinator") {
    for (const tab of [
      "ops_command_center",
      "crossover_communication",
      "owner_follow_up",
      "active_issues",
      "body_checks",
      "yard_links",
      "notifications"
    ] as const) {
      assert.equal(primaryTabs.includes(tab), true, `front desk sidebar includes ${tab}`);
      assert.equal(canAccessAdminTab(access, tab, role, "staff"), true, `front desk can open ${tab}`);
    }
    assert.equal(primaryTabs.includes("sa_floor_hub"), false, "front desk sidebar has no Floor Ops");
    assert.equal(canAccessAdminTab(access, "sa_floor_hub", role, "staff"), false, "front desk cannot open Floor Ops");
    assert.equal(primaryTabs.includes("sa_apps_hub"), false, "front desk sidebar has no Apps");
    assert.equal(canAccessAdminTab(access, "sa_apps_hub", role, "staff"), false, "front desk cannot open Apps");
    assert.equal(
      nav.some((entry) => entry.type === "item" && entry.tab === "sa_apps_hub"),
      false,
      "front desk nav does not render Apps"
    );
    assert.equal(canAccessGingrRouteGenerator(access, role), true);
    assert.equal(
      nav.some((entry) => entry.type === "route" && entry.id === "gingr-route-generator"),
      true,
      "front desk sidebar includes Gingr Route Generator"
    );
  }

  for (const articleId of ["cleaned-menu-hubs", "need-help-card-dismiss"]) {
    const articles = filterHelpArticlesForRole(role as AdminUserRole);
    assert.ok(
      articles.some((a) => a.id === articleId),
      `${role} help must include ${articleId}`
    );
  }
}

// Marketing keeps non-hub staff nav (few tabs) and still gets core help.
const marketingAccess = accessFromLegacyRole("mkt", "mkt@fitdog.test", "marketing");
const marketingVisible = ADMIN_TABS.filter((tab) =>
  canAccessAdminTab(marketingAccess, tab, "marketing", "staff")
);
const marketingNav = buildStaffPanelNav(marketingVisible, "staff", "marketing");
assert.ok(countNavIcons(marketingNav) <= 10, "marketing staff nav should stay small");
assert.ok(
  filterHelpArticlesForRole("marketing").some((a) => a.id === "cleaned-menu-hubs"),
  "marketing help includes cleaned menu article"
);

console.log("role-hub-nav: ok", {
  roles: HUB_NAV_ROLES.length,
  sample: Object.fromEntries(
    HUB_NAV_ROLES.map((role) => {
      const access = accessFromLegacyRole(`hub-${role}`, `${role}@fitdog.test`, role);
      const visible = ADMIN_TABS.filter((tab) => canAccessAdminTab(access, tab, role, "staff"));
      return [role, countNavIcons(buildStaffPanelNav(visible, "staff", role))];
    })
  )
});

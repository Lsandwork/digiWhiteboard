import assert from "node:assert/strict";
import { ADMIN_TABS, type AdminTab } from "../lib/admin/types";
import { accessFromLegacyRole, canAccessAdminTab } from "../lib/admin/permissions";
import { buildStaffPanelNav, type NavEntry } from "../lib/admin/nav-groups";
import {
  HUB_NAV_ROLES,
  ROLE_HUB_NAV,
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
  assert.ok(icons <= 10, `${role} sidebar icons must be <= 10, got ${icons}`);
  assert.ok(icons >= 1, `${role} must have at least one sidebar tab`);
  assert.ok(ROLE_HUB_NAV[role].primary.length <= 10, `${role} primary config exceeds 10`);

  const missing = uncoveredVisibleTabs(role as HubNavRole, visible);
  assert.deepEqual(
    missing,
    [],
    `${role} has accessible staff tabs missing from hubs/primary: ${missing.join(", ")}`
  );

  const primaryTabs = ROLE_HUB_NAV[role].primary.map((item) => item.tab);
  if (role === "team_leader" || role === "front_desk_coordinator" || role === "groomer") {
    assert.equal(
      primaryTabs.includes("ops_command_center"),
      false,
      `${role} must not show Ops Command Center as a primary sidebar tab`
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

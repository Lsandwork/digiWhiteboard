import assert from "node:assert/strict";
import { ADMIN_TABS, type AdminTab } from "../lib/admin/types";
import { accessFromLegacyRole, canAccessAdminTab } from "../lib/admin/permissions";
import { buildStaffPanelNav, type NavEntry } from "../lib/admin/nav-groups";
import {
  SUPER_ADMIN_PRIMARY_TABS,
  allSuperAdminHubLinkedTabs,
  isSuperAdminHubTab,
  parentHubForTab
} from "../lib/admin/super-admin-nav";

function countNavIcons(entries: NavEntry[]) {
  let count = 0;
  for (const entry of entries) {
    if (entry.type === "item" || entry.type === "route") count += 1;
    if (entry.type === "group") count += entry.children.length;
  }
  return count;
}

const access = accessFromLegacyRole("sa-1", "lonnie@fitdog.com", "owner_admin");
const visible = ADMIN_TABS.filter((tab) => canAccessAdminTab(access, tab, "owner_admin", "staff"));
const nav = buildStaffPanelNav(visible, "staff", "owner_admin");
const iconCount = countNavIcons(nav);

assert.equal(SUPER_ADMIN_PRIMARY_TABS.length, 10, "primary tab list is exactly 10");
assert.ok(iconCount <= 10, `Super Admin sidebar icons must be <= 10, got ${iconCount}`);
assert.equal(iconCount, 10, `expected exactly 10 Super Admin icons, got ${iconCount}`);

for (const tab of SUPER_ADMIN_PRIMARY_TABS) {
  assert.equal(canAccessAdminTab(access, tab, "owner_admin", "staff"), true, `can access primary ${tab}`);
}

const linked = new Set(allSuperAdminHubLinkedTabs());
const alwaysHidden = new Set<AdminTab>(["trainer_entry", "handler_shift_entry"]);
const primary = new Set<string>(SUPER_ADMIN_PRIMARY_TABS);

for (const tab of ADMIN_TABS) {
  if (primary.has(tab) || alwaysHidden.has(tab) || isSuperAdminHubTab(tab)) continue;
  if (!canAccessAdminTab(access, tab, "owner_admin", "staff")) continue;
  // Lobby/marketing-only surfaces stay on other boards.
  if (tab === "promotions" || tab === "schedule" || tab === "lobby_slideshow" || tab === "cast_tv") continue;
  assert.ok(linked.has(tab), `accessible staff tab ${tab} must appear in a Super Admin hub`);
  assert.ok(parentHubForTab(tab), `demoted tab ${tab} must map back to a hub`);
}

// Other roles keep the richer sidebar (not clamped to 10).
const adminAccess = accessFromLegacyRole("admin-1", "admin@fitdog.com", "manager_admin");
const adminVisible = ADMIN_TABS.filter((tab) => canAccessAdminTab(adminAccess, tab, "manager_admin", "staff"));
const adminNav = buildStaffPanelNav(adminVisible, "staff", "manager_admin");
assert.ok(
  countNavIcons(adminNav) > 10,
  "manager_admin sidebar should remain the full layout (not Super Admin cleanup)"
);

console.log("super-admin-nav-cleanup: ok", { iconCount, hubLinkedTabs: linked.size });

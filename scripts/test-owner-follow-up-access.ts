import assert from "node:assert/strict";
import { canManageOwnerFollowUp } from "../lib/admin/api-auth";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  hasPermission,
  TEAM_LEADER_TABS,
  FRONT_DESK_COORDINATOR_TABS
} from "../lib/admin/permissions";
import { buildStaffPanelNav, isTabInNav } from "../lib/admin/nav-groups";
import type { AdminTab } from "../lib/admin/types";

const roles = [
  "owner_admin",
  "manager_admin",
  "assistant_manager",
  "management",
  "front_desk_coordinator",
  "team_leader"
] as const;

const candidateTabs: AdminTab[] = [
  "crossover_communication",
  "owner_follow_up",
  "active_issues",
  "push_notices",
  "yard_push_notices",
  "grooming_push",
  "whiteboard_preview",
  "bulk_photo_upload",
  "yard_links",
  "walks_board",
  "notifications",
  "management_support",
  "route_generator",
  "fitdog_alerts",
  "staff_directory",
  "settings",
  "help"
];

assert.ok((TEAM_LEADER_TABS as readonly string[]).includes("owner_follow_up"));
assert.ok((FRONT_DESK_COORDINATOR_TABS as readonly string[]).includes("owner_follow_up"));

for (const role of roles) {
  const access = accessFromLegacyRole(`ofu-${role}`, `${role}@fitdog.test`, role);
  assert.equal(
    canAccessAdminTab(access, "owner_follow_up", role, "staff"),
    true,
    `${role} can open Owner Follow Up tab`
  );
  assert.equal(hasPermission(access, "view_owner_follow_up"), true, `${role} has view_owner_follow_up`);
  assert.equal(hasPermission(access, "create_owner_follow_up"), true, `${role} has create_owner_follow_up`);
  assert.equal(canManageOwnerFollowUp(role), true, `${role} can manage owner follow-up via API`);

  const visible = candidateTabs.filter((tab) => canAccessAdminTab(access, tab, role, "staff"));
  const nav = buildStaffPanelNav(visible, "staff", role === "management" ? "assistant_manager" : role);
  assert.equal(isTabInNav(nav, "owner_follow_up"), true, `${role} sees Owner Follow Up in panel nav`);
}

console.log("test-owner-follow-up-access: ok");

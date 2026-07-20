import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  canAccessHrPanelsForUser,
  canReviewManagementSupportForUser,
  canReviewWriteUpsForUser,
  canSubmitWriteUpForUser,
  hasPermission,
  permissionsForRoles
} from "../lib/admin/permissions";
import {
  canSubmitWriteUp,
  canViewOwnWriteUps,
  canReviewWriteUps
} from "../lib/admin/users";

// Admin and management can submit and review write-ups.
{
  for (const role of ["owner_admin", "manager_admin", "assistant_manager"] as const) {
    assert.equal(canSubmitWriteUp(role), true, `${role} can submit write-ups`);
    assert.equal(canReviewWriteUps(role), true, `${role} can review write-ups`);
    assert.equal(canViewOwnWriteUps(role), false, `${role} does not use handler write-up view`);
  }

  const managementAccess = accessFromLegacyRole("mgmt-1", "mgr@fitdog.test", "assistant_manager");
  assert.equal(hasPermission(managementAccess, "submit_write_up"), true);
  assert.equal(hasPermission(managementAccess, "review_write_ups"), true);
  assert.equal(canAccessAdminTab(managementAccess, "write_ups", "assistant_manager", "staff"), true);
  assert.equal(canAccessAdminTab(managementAccess, "hr_hub", "assistant_manager", "staff"), true);
}

// Super Admin RBAC always gets HR tabs and write-up submit/review.
{
  const superAccess = accessFromLegacyRole("super-1", "super@fitdog.test", "owner_admin");
  assert.equal(canAccessAdminTab(superAccess, "hr_hub", "owner_admin", "staff"), true);
  assert.equal(canAccessAdminTab(superAccess, "write_ups", "owner_admin", "staff"), true);
  assert.equal(canAccessAdminTab(superAccess, "write_up_review", "owner_admin", "staff"), true);
  assert.equal(canAccessAdminTab(superAccess, "complaint_review", "owner_admin", "staff"), true);
  assert.equal(canSubmitWriteUpForUser(superAccess, "owner_admin"), true);
  assert.equal(canReviewWriteUpsForUser(superAccess, "owner_admin"), true);
  assert.equal(canReviewManagementSupportForUser(superAccess, "owner_admin"), true);
  assert.equal(canAccessHrPanelsForUser(superAccess, "owner_admin"), true);

  const rbacSuperOnly = accessFromLegacyRole("rbac-super", "rbac@fitdog.test", "assistant_manager");
  rbacSuperOnly.roles = ["super_admin"];
  rbacSuperOnly.primaryRole = "super_admin";
  assert.equal(canSubmitWriteUpForUser(rbacSuperOnly, "assistant_manager"), true);
  assert.equal(canReviewWriteUpsForUser(rbacSuperOnly, "assistant_manager"), true);
  assert.equal(canReviewManagementSupportForUser(rbacSuperOnly, "assistant_manager"), true);
  assert.equal(canAccessHrPanelsForUser(rbacSuperOnly, "assistant_manager"), true);
  assert.equal(canAccessAdminTab(rbacSuperOnly, "write_up_review", "assistant_manager", "staff"), true);
  assert.equal(canAccessAdminTab(rbacSuperOnly, "complaint_review", "assistant_manager", "staff"), true);
}

// Team leads can submit but not view write-ups.
{
  assert.equal(canSubmitWriteUp("team_leader"), true);
  assert.equal(canViewOwnWriteUps("team_leader"), false);
  assert.equal(canReviewWriteUps("team_leader"), false);

  const teamLeadAccess = accessFromLegacyRole("lead-1", "lead@fitdog.test", "team_leader");
  assert.equal(hasPermission(teamLeadAccess, "submit_write_up"), true);
  assert.equal(hasPermission(teamLeadAccess, "view_own_write_ups"), false);
  assert.equal(hasPermission(teamLeadAccess, "review_write_ups"), false);
  assert.equal(canAccessAdminTab(teamLeadAccess, "management_support", "team_leader", "staff"), true);
  assert.equal(canAccessAdminTab(teamLeadAccess, "whiteboard_preview", "team_leader", "staff"), true);
  assert.equal(canAccessAdminTab(teamLeadAccess, "ms_hub", "team_leader", "staff"), false);
}

// Dog handlers / driver-hikers can view write-ups about themselves only.
{
  assert.equal(canSubmitWriteUp("daycare"), false);
  assert.equal(canViewOwnWriteUps("daycare"), true);
  assert.equal(canAccessAdminTab(accessFromLegacyRole("dh-1", "handler@fitdog.test", "daycare"), "write_ups", "daycare", "staff"), true);
  assert.equal(canSubmitWriteUp("driver"), false);
  assert.equal(canViewOwnWriteUps("driver"), true);
  assert.equal(canAccessAdminTab(accessFromLegacyRole("dr-1", "driver@fitdog.test", "driver"), "write_ups", "driver", "staff"), true);
}

// Admin role permissions include submit + review once.
{
  const adminPerms = permissionsForRoles(["admin"]);
  assert.equal(adminPerms.filter((p) => p === "submit_write_up").length, 1);
  assert.equal(adminPerms.includes("review_write_ups"), true);
}

// Team lead panel hides review for submit-only users.
{
  const panel = readFileSync(join(process.cwd(), "components/admin/ManagementSupportPanel.tsx"), "utf8");
  assert.match(panel, /allowWriteUpReview/);
  assert.match(panel, /reviewAllWriteUps/);
  assert.match(panel, /mode === "admin"/);
}

// API allows submit-only sessions to load the write-up form without listing submissions.
{
  const route = readFileSync(join(process.cwd(), "app/api/admin/management-support/route.ts"), "utf8");
  assert.match(route, /canSubmitWriteUpForUser\(access, role\)/);
  assert.match(route, /role: role \?\? "daycare"/);
  assert.doesNotMatch(route, /reports: \[\][\s\S]{0,80}role: role \?\? "team_leader"/);

  const hubRoute = readFileSync(join(process.cwd(), "app/api/admin/management-support-hub/route.ts"), "utf8");
  assert.match(hubRoute, /canReviewManagementSupportWithAccess\(access, session\?\.role\)/);
}

console.log("test-write-up-access: all assertions passed");

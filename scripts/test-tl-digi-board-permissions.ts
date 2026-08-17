import assert from "node:assert/strict";
import { accessFromLegacyRole, canAccessAdminTab, hasPermission } from "../lib/admin/permissions";

const FULL_ADMIN_ROLES = ["owner_admin", "manager_admin"] as const;
const DENIED_ROLES = [
  "assistant_manager",
  "team_leader",
  "front_desk_coordinator",
  "trainer",
  "marketing"
] as const;

for (const role of FULL_ADMIN_ROLES) {
  const access = accessFromLegacyRole(`tl-admin-${role}`, `${role}@fitdog.test`, role);
  assert.equal(
    canAccessAdminTab(access, "tl_digi_board", role, "staff"),
    true,
    `${role} can access Administration → TL Digi Board`
  );
  assert.equal(
    hasPermission(access, "manage_tl_digi_board"),
    true,
    `${role} has manage_tl_digi_board`
  );
  assert.equal(
    hasPermission(access, "view_tl_digi_board"),
    true,
    `${role} has view_tl_digi_board`
  );
}

for (const role of DENIED_ROLES) {
  const access = accessFromLegacyRole(`tl-denied-${role}`, `${role}@fitdog.test`, role);
  assert.equal(
    canAccessAdminTab(access, "tl_digi_board", role, "staff"),
    false,
    `${role} MUST NOT access Administration → TL Digi Board config tab`
  );
  assert.equal(
    hasPermission(access, "manage_tl_digi_board"),
    false,
    `${role} must not have manage_tl_digi_board`
  );
}

assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "owner_admin"), "tl_digi_board", "owner_admin", "lobby"),
  false,
  "TL Digi Board is staff-board only"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "owner_admin"), "tl_digi_board", "owner_admin", "marketing"),
  false,
  "TL Digi Board is not on marketing board"
);

console.log("test-tl-digi-board-permissions: ok");

import assert from "node:assert/strict";
import { accessFromLegacyRole, canAccessAdminTab } from "@/lib/admin/permissions";

const rolesThatSee = ["owner_admin", "manager_admin", "assistant_manager", "front_desk_coordinator"] as const;
const rolesThatDoNot = ["groomer", "trainer", "daycare", "marketing", "viewer", "team_leader"] as const;

for (const role of rolesThatSee) {
  const access = accessFromLegacyRole(null, null, role);
  assert.equal(
    canAccessAdminTab(access, "vip_auto_book", role, "staff"),
    true,
    `${role} should see VIP Auto Book`
  );
}

for (const role of rolesThatDoNot) {
  const access = accessFromLegacyRole(null, null, role);
  assert.equal(
    canAccessAdminTab(access, "vip_auto_book", role, "staff"),
    false,
    `${role} should not see VIP Auto Book`
  );
}

console.log("vip-auto-book-access: ok");

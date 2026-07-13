import assert from "node:assert/strict";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  firstAccessibleAdminTab,
  isLobbyDigiBoardOnlyLegacyRole,
  MARKETING_TABS,
  permissionsForRoles
} from "../lib/admin/permissions";

const access = accessFromLegacyRole("mkt-1", "marketing@fitdog.test", "marketing");

assert.equal(isLobbyDigiBoardOnlyLegacyRole("marketing"), true);
assert.equal(isLobbyDigiBoardOnlyLegacyRole("viewer"), false);

assert.ok(permissionsForRoles(["marketing"]).includes("manage_lobby_board"));

for (const tab of MARKETING_TABS) {
  assert.equal(
    canAccessAdminTab(access, tab, "marketing", "lobby"),
    true,
    `marketing should access lobby tab ${tab}`
  );
}

assert.equal(canAccessAdminTab(access, "push_notices", "marketing", "staff"), false);
assert.equal(canAccessAdminTab(access, "content", "marketing", "staff"), false);
assert.equal(canAccessAdminTab(access, "integrations", "marketing", "lobby"), false);
assert.equal(canAccessAdminTab(access, "remote_cast", "marketing", "lobby"), false);
assert.equal(canAccessAdminTab(access, "lobby_slideshow", "marketing", "lobby"), true);

assert.equal(firstAccessibleAdminTab(access, "marketing", "lobby"), "content");
assert.equal(firstAccessibleAdminTab(access, "marketing", "staff"), "content");

console.log("Marketing account access tests passed.");

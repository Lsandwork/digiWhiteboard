import assert from "node:assert/strict";
import { permissionsForRoles, legacyRoleToRoleKey, roleKeyToLegacyRole } from "../lib/admin/permissions";
import { isMarketingRole } from "../lib/admin/users";
import { canTransition } from "../lib/marketing/status";
import { MARKETING_ROUTES } from "../lib/marketing/constants";
import { MARKETING_NAV } from "../lib/marketing/nav";

assert.equal(legacyRoleToRoleKey("marketing"), "marketing");
assert.equal(roleKeyToLegacyRole("marketing"), "marketing");
assert.equal(isMarketingRole("marketing"), true);
assert.equal(isMarketingRole("trainer"), false);

const marketingPerms = permissionsForRoles(["marketing"]);
assert.ok(marketingPerms.includes("view_marketing_panel"));
assert.ok(marketingPerms.includes("manage_marketing_requests"));
assert.ok(!marketingPerms.includes("configure_integrations"));
assert.ok(!marketingPerms.includes("manage_staff_users"));

const staffPerms = permissionsForRoles(["daycare"]);
assert.ok(staffPerms.includes("respond_marketing_media_request"));

assert.equal(canTransition("awaiting_handler", "handler_acknowledged"), true);
assert.equal(canTransition("completed", "awaiting_handler"), false);
assert.equal(canTransition("completed", "awaiting_handler", true), false);

assert.equal(MARKETING_NAV.length, 10);
assert.equal(MARKETING_ROUTES.dashboard, "/marketing");
assert.equal(MARKETING_ROUTES.mediaPush, "/marketing/media-push");
assert.equal(MARKETING_ROUTES.settings, "/marketing/settings");

console.log("marketing panel tests passed");

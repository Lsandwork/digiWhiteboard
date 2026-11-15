import assert from "node:assert/strict";

process.env.ADMIN_SESSION_SECRET = "test-only-session-secret";
process.env.ADMIN_PASSWORD = "test-only-admin-password";
delete process.env.RUFFOPS_DEMO_MODE;

async function main() {
  const { createAdminSessionToken, verifyAdminSessionToken, getAdminSessionFromRequest, getUnfilteredAdminSessionFromRequest } =
    await import("../lib/admin/session");
  const { verifyAdminSessionTokenEdge } = await import("../lib/admin/session-edge");
  const { ADMIN_SESSION_COOKIE } = await import("../lib/admin/session-constants");
  const { isAdminRequest, getEffectiveAdminRole } = await import("../lib/admin/api-auth");
  const { verifyAdminCredentials } = await import("../lib/admin/auth");
  const { DEMO_EMAIL, DEMO_PASSWORD } = await import("../lib/demo/constants");
  const { isDemoModeEnabled, isDemoIdentity, isDemoRequestAllowed } = await import("../lib/demo/policy");
  const {
    accessFromLegacyRole,
    canManageAdminUsers,
    canChangeAdminUserPassword,
    canManageLobbyContent,
    canEditGlobalAdminSettings
  } = await import("../lib/admin/permissions");
  const { roleAssignmentError, canCreateAdminUsers } = await import("../lib/admin/user-creation-access");

  const request = (path: string, token: string | null, method = "GET", extraHeaders: Record<string, string> = {}) =>
    new Request(`https://ruffops.test${path}`, {
      method,
      headers: { ...(token ? { cookie: `${ADMIN_SESSION_COOKIE}=${token}` } : {}), ...extraHeaders }
    });

  // --- Demo mode is off unless the server explicitly enables it.
  assert.equal(isDemoModeEnabled(), false, "demo mode defaults to disabled");
  for (const value of ["", "true", "1", "yes", "ENABLE"]) {
    process.env.RUFFOPS_DEMO_MODE = value;
    assert.equal(isDemoModeEnabled(), false, `RUFFOPS_DEMO_MODE=${JSON.stringify(value)} must not enable demo`);
  }
  delete process.env.RUFFOPS_DEMO_MODE;

  assert.equal(isDemoIdentity({ email: "Someone@Demo.com" }), true);
  assert.equal(isDemoIdentity({ isDemo: true, email: "x@fitdog.com" }), true);
  assert.equal(isDemoIdentity({ email: "lonnie@fitdog.com" }), false);

  const demoLoginDisabled = await verifyAdminCredentials(DEMO_EMAIL, DEMO_PASSWORD);
  assert.equal(demoLoginDisabled.ok, false, "hardcoded demo credential rejected when demo mode is disabled");

  const demoToken = createAdminSessionToken({ email: DEMO_EMAIL, role: "owner_admin", isDemo: true, demoRole: "owner_admin" });
  const forgedDemoFlagToken = createAdminSessionToken({ email: "investor@demo.com", role: "owner_admin" });
  assert.equal(verifyAdminSessionToken(demoToken), null, "existing demo session rejected when demo disabled (node)");
  assert.equal(await verifyAdminSessionTokenEdge(demoToken), null, "existing demo session rejected when demo disabled (edge)");
  assert.equal(verifyAdminSessionToken(forgedDemoFlagToken), null, "@demo.com session rejected even without isDemo flag");

  const realToken = createAdminSessionToken({ email: "manager@fitdog.com", role: "manager_admin", adminUserId: "u-1" });
  assert.ok(verifyAdminSessionToken(realToken), "regular sessions unaffected");
  assert.ok(await verifyAdminSessionTokenEdge(realToken), "regular sessions unaffected (edge)");

  process.env.RUFFOPS_DEMO_MODE = "enabled";
  const demoLoginEnabled = await verifyAdminCredentials(DEMO_EMAIL, DEMO_PASSWORD);
  assert.equal(demoLoginEnabled.ok, true, "demo login works only when explicitly enabled");
  assert.ok(verifyAdminSessionToken(demoToken), "demo session valid when enabled");

  assert.equal(isDemoRequestAllowed("GET", "/api/live-board"), true);
  assert.equal(isDemoRequestAllowed("POST", "/api/demo/push"), true);
  assert.equal(isDemoRequestAllowed("POST", "/api/admin/users"), false, "demo cannot write outside /api/demo");
  assert.equal(isDemoRequestAllowed("GET", "/api/admin/users"), false, "demo cannot read staff directory");
  assert.equal(isDemoRequestAllowed("GET", "/api/admin/users/abc"), false);
  assert.equal(isDemoRequestAllowed("GET", "/api/admin/usersettings"), true, "prefix match is path-segment exact");
  assert.equal(isDemoRequestAllowed("GET", "/api/ruffly/conversations"), false);
  assert.equal(isDemoRequestAllowed("GET", "/api/ruffly/public/widget"), true);

  assert.ok(getAdminSessionFromRequest(request("/api/live-board", demoToken)), "demo can read public-safe data");
  assert.equal(getAdminSessionFromRequest(request("/api/admin/users", demoToken)), null);
  assert.equal(getAdminSessionFromRequest(request("/api/admin/settings", demoToken, "PATCH")), null);
  assert.ok(getUnfilteredAdminSessionFromRequest(request("/api/admin/settings", demoToken, "PATCH")), "unfiltered helper still sees demo");
  delete process.env.RUFFOPS_DEMO_MODE;
  assert.equal(getAdminSessionFromRequest(request("/api/live-board", demoToken)), null, "demo session dead once disabled");

  // --- mustChangePassword is enforced server-side for API calls.
  const tempPasswordToken = createAdminSessionToken({
    email: "new.hire@fitdog.com",
    role: "manager_admin",
    adminUserId: "u-2",
    mustChangePassword: true
  });
  for (const path of ["/api/admin/change-own-password", "/api/admin/session", "/api/admin/logout"]) {
    assert.ok(getAdminSessionFromRequest(request(path, tempPasswordToken, "POST")), `${path} allowed before password change`);
  }
  for (const path of ["/api/admin/users", "/api/admin/settings", "/api/admin/impersonate", "/api/admin/change-own-password/x"]) {
    assert.equal(getAdminSessionFromRequest(request(path, tempPasswordToken)), null, `${path} blocked until password change`);
  }
  assert.ok(getAdminSessionFromRequest(request("/api/admin/users", realToken)), "normal sessions pass the filter");

  // --- x-admin-password header no longer authenticates.
  const headerOnly = request("/api/admin/users", null, "GET", { "x-admin-password": process.env.ADMIN_PASSWORD! });
  assert.equal(isAdminRequest(headerOnly), false, "x-admin-password header is not an auth mechanism");
  assert.equal(getEffectiveAdminRole(headerOnly), null);
  const headerRole = request("/api/admin/users", realToken, "GET", { "x-admin-role": "owner_admin" });
  assert.equal(getEffectiveAdminRole(headerRole), "manager_admin", "role comes only from the signed session");

  // --- Missing legacy role is never treated as full admin.
  assert.equal(canManageAdminUsers(null, undefined), false);
  assert.equal(canManageAdminUsers(null, null), false);
  assert.equal(canChangeAdminUserPassword(null, undefined, "target"), false);
  assert.equal(canChangeAdminUserPassword(null, undefined, "self", "self"), true, "self-service password change kept");
  assert.equal(canManageAdminUsers(null, "owner_admin"), true);
  assert.equal(canManageAdminUsers(null, "manager_admin"), true);

  // --- Role assignment: actors may only grant roles they could create.
  const management = accessFromLegacyRole("m-1", "m@fitdog.com", "assistant_manager");
  const admin = accessFromLegacyRole("a-1", "a@fitdog.com", "manager_admin");
  const owner = accessFromLegacyRole("o-1", "o@fitdog.com", "owner_admin");
  assert.equal(canCreateAdminUsers(management, "assistant_manager"), true);
  assert.equal(roleAssignmentError(management, "assistant_manager", ["groomer"]), null);
  assert.ok(roleAssignmentError(management, "assistant_manager", ["admin"]), "management cannot grant admin");
  assert.ok(roleAssignmentError(management, "assistant_manager", ["super_admin"]), "management cannot grant super_admin");
  assert.ok(roleAssignmentError(admin, "manager_admin", ["super_admin"]), "admin cannot grant super_admin");
  assert.equal(roleAssignmentError(admin, "manager_admin", ["management", "groomer"]), null);
  assert.equal(roleAssignmentError(owner, "owner_admin", ["super_admin"]), null);
  assert.equal(roleAssignmentError(management, "assistant_manager", ["not_a_role"]), "Unknown role.");
  assert.equal(roleAssignmentError(management, "assistant_manager", [42]), "Unknown role.");
  assert.equal(
    roleAssignmentError(management, "assistant_manager", ["admin", "groomer"], ["admin"]),
    null,
    "roles the target already holds can be kept when editing other fields"
  );

  // --- Lobby content + global settings gates mirror the admin tab audiences.
  assert.equal(canManageLobbyContent(owner, "owner_admin"), true);
  assert.equal(canManageLobbyContent(admin, "manager_admin"), true);
  assert.equal(canManageLobbyContent(management, "assistant_manager"), true, "management keeps lobby editing");
  const marketing = accessFromLegacyRole("mk-1", "mk@fitdog.com", "marketing");
  const groomer = accessFromLegacyRole("g-1", "g@fitdog.com", "groomer");
  if (marketing.roles.includes("marketing")) {
    assert.equal(canManageLobbyContent(marketing, "marketing"), true, "marketing keeps lobby editing");
  }
  assert.equal(canManageLobbyContent(groomer, "groomer"), false, "groomers cannot edit lobby content");
  assert.equal(canManageLobbyContent(null, undefined), false);

  assert.equal(canEditGlobalAdminSettings(owner, "owner_admin"), true);
  assert.equal(canEditGlobalAdminSettings(admin, "manager_admin"), true);
  assert.equal(canEditGlobalAdminSettings(groomer, "groomer"), false);
  assert.equal(canEditGlobalAdminSettings(null, undefined), false);

  // --- Disabled / password-reset accounts lose API session on this instance.
  const {
    revokeAdminSessionsForUser,
    resetAdminSessionRevocationForTests,
    isAdminSessionRevoked
  } = await import("../lib/admin/session-revocation");
  resetAdminSessionRevocationForTests();
  const otherToken = createAdminSessionToken({ email: "other@fitdog.com", role: "manager_admin", adminUserId: "u-9" });
  assert.equal(isAdminSessionRevoked("u-1"), false);
  assert.ok(getAdminSessionFromRequest(request("/api/admin/users", realToken)), "session valid before revoke");
  revokeAdminSessionsForUser("u-1");
  assert.equal(isAdminSessionRevoked("u-1"), true);
  assert.equal(getAdminSessionFromRequest(request("/api/admin/users", realToken)), null, "revoked user blocked");
  assert.ok(getAdminSessionFromRequest(request("/api/admin/users", otherToken)), "other users unaffected");
  resetAdminSessionRevocationForTests();

  console.log("security auth gate tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

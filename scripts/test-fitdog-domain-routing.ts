import assert from "node:assert/strict";
import {
  FITDOG_HOSTNAME,
  FITDOG_LOGIN_REDIRECT_PATH,
  isFitdogHostname,
  normalizeHostname,
  shouldForceFitdogStaffBoard,
  shouldRedirectFitdogRootToLogin
} from "../lib/fitdog-domain";
import { isAdminDashboardPath, isStandaloneAdminAppPath } from "../lib/admin/admin-paths";
import { parseAdminBoardType } from "../lib/admin/types";

assert.equal(normalizeHostname("Fitdog.RuffOps.com:443"), FITDOG_HOSTNAME);
assert.equal(isFitdogHostname("fitdog.ruffops.com"), true);
assert.equal(isFitdogHostname("www.fitdog.ruffops.com"), true);
assert.equal(isFitdogHostname("staff.ruffops.com"), false);
assert.equal(shouldRedirectFitdogRootToLogin("fitdog.ruffops.com", "/"), true);
assert.equal(shouldRedirectFitdogRootToLogin("fitdog.ruffops.com", "/admin/login"), false);
assert.equal(shouldRedirectFitdogRootToLogin("staff.ruffops.com", "/"), false);
assert.match(FITDOG_LOGIN_REDIRECT_PATH, /board%3Dstaff|board=staff/);

// Bare /admin on the Fitdog host defaults to the staff board.
assert.equal(shouldForceFitdogStaffBoard("fitdog.ruffops.com", "/admin", null), true);
assert.equal(shouldForceFitdogStaffBoard("fitdog.ruffops.com", "/admin", ""), true);
// An explicit board is never rewritten — that loops staff <-> marketing forever.
assert.equal(shouldForceFitdogStaffBoard("fitdog.ruffops.com", "/admin", "lobby"), false);
assert.equal(shouldForceFitdogStaffBoard("fitdog.ruffops.com", "/admin", "marketing"), false);
assert.equal(shouldForceFitdogStaffBoard("fitdog.ruffops.com", "/admin", "staff"), false);
assert.equal(shouldForceFitdogStaffBoard("fitdog.ruffops.com", "/admin/login", null), false);
assert.equal(shouldForceFitdogStaffBoard("staff.ruffops.com", "/admin", null), false);
assert.equal(shouldForceFitdogStaffBoard("fitdog.ruffops.com", "/admin/automatic-blog", null), false);
assert.equal(
  shouldForceFitdogStaffBoard("fitdog.ruffops.com", "/admin/automatic-blog", ""),
  false,
  "Blog Generator must not be rewritten to the staff dashboard"
);
assert.equal(
  shouldForceFitdogStaffBoard("fitdog.ruffops.com", "/admin/blog/help/how-to-use-blog-generator", null),
  false
);
assert.equal(isAdminDashboardPath("/admin"), true);
assert.equal(isAdminDashboardPath("/admin/"), true);
assert.equal(isAdminDashboardPath("/admin/automatic-blog"), false);
assert.equal(isStandaloneAdminAppPath("/admin/automatic-blog"), true);
assert.equal(isStandaloneAdminAppPath("/admin/automatic-blog?page=social-generator".split("?")[0]), true);
assert.equal(isStandaloneAdminAppPath("/admin"), false);
assert.equal(isStandaloneAdminAppPath("/admin/login"), false);

assert.equal(parseAdminBoardType(null), "staff");
assert.equal(parseAdminBoardType(undefined), "staff");
assert.equal(parseAdminBoardType("lobby"), "lobby");
assert.equal(parseAdminBoardType("marketing"), "marketing");
assert.equal(parseAdminBoardType("staff"), "staff");

console.log("fitdog domain routing tests passed");

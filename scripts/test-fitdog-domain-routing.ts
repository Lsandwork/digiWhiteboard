import assert from "node:assert/strict";
import {
  FITDOG_HOSTNAME,
  FITDOG_LOGIN_REDIRECT_PATH,
  isFitdogHostname,
  normalizeHostname,
  shouldForceFitdogStaffBoard,
  shouldRedirectFitdogRootToLogin
} from "../lib/fitdog-domain";
import { parseAdminBoardType } from "../lib/admin/types";

assert.equal(normalizeHostname("Fitdog.RuffOps.com:443"), FITDOG_HOSTNAME);
assert.equal(isFitdogHostname("fitdog.ruffops.com"), true);
assert.equal(isFitdogHostname("staff.ruffops.com"), false);
assert.equal(shouldRedirectFitdogRootToLogin("fitdog.ruffops.com", "/"), true);
assert.equal(shouldRedirectFitdogRootToLogin("fitdog.ruffops.com", "/admin/login"), false);
assert.equal(shouldRedirectFitdogRootToLogin("staff.ruffops.com", "/"), false);
assert.match(FITDOG_LOGIN_REDIRECT_PATH, /board%3Dstaff|board=staff/);

assert.equal(shouldForceFitdogStaffBoard("fitdog.ruffops.com", "/admin", "lobby"), true);
assert.equal(shouldForceFitdogStaffBoard("fitdog.ruffops.com", "/admin", "marketing"), true);
assert.equal(shouldForceFitdogStaffBoard("fitdog.ruffops.com", "/admin", "staff"), false);
assert.equal(shouldForceFitdogStaffBoard("fitdog.ruffops.com", "/admin/login", "lobby"), false);
assert.equal(shouldForceFitdogStaffBoard("staff.ruffops.com", "/admin", "lobby"), false);

assert.equal(parseAdminBoardType(null), "staff");
assert.equal(parseAdminBoardType(undefined), "staff");
assert.equal(parseAdminBoardType("lobby"), "lobby");
assert.equal(parseAdminBoardType("marketing"), "marketing");
assert.equal(parseAdminBoardType("staff"), "staff");

console.log("fitdog domain routing tests passed");

import assert from "node:assert/strict";
import {
  FITDOG_HOSTNAME,
  FITDOG_LOGIN_REDIRECT_PATH,
  isFitdogHostname,
  normalizeHostname,
  shouldRedirectFitdogRootToLogin
} from "../lib/fitdog-domain";

assert.equal(normalizeHostname("Fitdog.RuffOps.com:443"), FITDOG_HOSTNAME);
assert.equal(isFitdogHostname("fitdog.ruffops.com"), true);
assert.equal(isFitdogHostname("staff.ruffops.com"), false);
assert.equal(shouldRedirectFitdogRootToLogin("fitdog.ruffops.com", "/"), true);
assert.equal(shouldRedirectFitdogRootToLogin("fitdog.ruffops.com", "/admin/login"), false);
assert.equal(shouldRedirectFitdogRootToLogin("staff.ruffops.com", "/"), false);
assert.equal(FITDOG_LOGIN_REDIRECT_PATH, "/admin/login?next=%2Fadmin");

console.log("fitdog domain routing tests passed");

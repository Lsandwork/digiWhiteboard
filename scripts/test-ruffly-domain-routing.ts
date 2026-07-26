import assert from "node:assert/strict";
import {
  isRufflyHostname,
  normalizeHostname,
  shouldRewriteRufflyRoot,
  RUFFLY_REWRITE_TARGET
} from "../lib/ruffly-domain";

assert.equal(normalizeHostname("Ruffly.RuffOps.com:443"), "ruffly.ruffops.com");
assert.equal(isRufflyHostname("ruffly.ruffops.com"), true);
assert.equal(isRufflyHostname("staff.ruffops.com"), false);
assert.equal(shouldRewriteRufflyRoot("ruffly.ruffops.com", "/"), true);
assert.equal(shouldRewriteRufflyRoot("ruffly.ruffops.com", "/ruffly/public"), false);
assert.equal(RUFFLY_REWRITE_TARGET, "/ruffly/public");

console.log("ruffly domain routing tests passed");

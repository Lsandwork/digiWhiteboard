import assert from "node:assert/strict";
import {
  isRufflyHostname,
  normalizeHostname,
  rewriteRufflyPublicPath,
  shouldRewriteRufflyRoot,
  RUFFLY_REWRITE_TARGET
} from "../lib/ruffly-domain";

assert.equal(normalizeHostname("Ruffly.RuffOps.com:443"), "ruffly.ruffops.com");
assert.equal(isRufflyHostname("ruffly.ruffops.com"), true);
assert.equal(isRufflyHostname("staff.ruffops.com"), false);
assert.equal(shouldRewriteRufflyRoot("ruffly.ruffops.com", "/"), true);
assert.equal(shouldRewriteRufflyRoot("ruffly.ruffops.com", "/ruffly/public"), false);
assert.equal(RUFFLY_REWRITE_TARGET, "/ruffly/public");
assert.equal(rewriteRufflyPublicPath("ruffly.ruffops.com", "/widget.js"), "/ruffly/widget.js");
assert.equal(rewriteRufflyPublicPath("ruffly.ruffops.com", "/review/abc"), "/ruffly/review/abc");
assert.equal(rewriteRufflyPublicPath("ruffly.ruffops.com", "/feedback/xyz"), "/ruffly/feedback/xyz");
assert.equal(rewriteRufflyPublicPath("staff.ruffops.com", "/review/abc"), null);

console.log("ruffly domain routing tests passed");

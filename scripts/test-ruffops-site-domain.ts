import assert from "node:assert/strict";
import {
  isReservedStaffOrAppPath,
  isRuffopsMarketingHostname,
  normalizePublicPathname,
  rewriteRuffopsMarketingPath,
  ruffopsMarketingRewriteTarget,
  RUFFOPS_SITE_PREFIX
} from "../lib/ruffops-site-domain";

assert.equal(isRuffopsMarketingHostname("ruffops.com"), true);
assert.equal(isRuffopsMarketingHostname("www.ruffops.com"), true);
assert.equal(isRuffopsMarketingHostname("WWW.RuffOps.com:443"), true);
assert.equal(isRuffopsMarketingHostname("staff.ruffops.com"), false);
assert.equal(isRuffopsMarketingHostname("lobby.ruffops.com"), false);
assert.equal(isRuffopsMarketingHostname("fitdog.ruffops.com"), false);
assert.equal(isRuffopsMarketingHostname("localhost"), false);

assert.equal(normalizePublicPathname("/services/"), "/services");
assert.equal(ruffopsMarketingRewriteTarget("/"), RUFFOPS_SITE_PREFIX);
assert.equal(ruffopsMarketingRewriteTarget("/services"), "/ruffops-site/services");
assert.equal(ruffopsMarketingRewriteTarget("/dog-behavior-ai.html"), "/ruffops-site/attune");
assert.equal(ruffopsMarketingRewriteTarget("/online-courses.html"), "/ruffops-site/resources");

assert.equal(rewriteRuffopsMarketingPath("ruffops.com", "/"), "/ruffops-site");
assert.equal(rewriteRuffopsMarketingPath("www.ruffops.com", "/contact"), "/ruffops-site/contact");
assert.equal(rewriteRuffopsMarketingPath("ruffops.com", "/send.php"), "/api/ruffops-site/send");
assert.equal(rewriteRuffopsMarketingPath("staff.ruffops.com", "/"), null);
assert.equal(rewriteRuffopsMarketingPath("staff.ruffops.com", "/services"), null);
assert.equal(rewriteRuffopsMarketingPath("ruffops.com", "/admin"), null);
assert.equal(rewriteRuffopsMarketingPath("ruffops.com", "/admin/login"), null);
assert.equal(rewriteRuffopsMarketingPath("ruffops.com", "/display/staff-whiteboard"), null);
assert.equal(rewriteRuffopsMarketingPath("ruffops.com", "/lobby/checkouts"), null);
assert.equal(rewriteRuffopsMarketingPath("ruffops.com", "/api/admin/session"), null);

assert.equal(isReservedStaffOrAppPath("/admin/login"), true);
assert.equal(isReservedStaffOrAppPath("/services"), false);

console.log("ruffops marketing domain routing tests passed");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RUFFOPS_AUTHOR,
  RUFFOPS_DIVISION,
  RUFFOPS_META,
  RUFFOPS_SOURCE_SIGNATURE,
  RUFFOPS_SOURCE_SIGNATURE_ELEMENT_ID,
  RUFFOPS_TAGLINE,
  RUFFOPS_WORDMARK_ASCII
} from "../lib/branding/ruffops-signature";

assert.match(RUFFOPS_WORDMARK_ASCII, /RUFFOPS|██████/);
assert.equal(RUFFOPS_TAGLINE, "SMARTER OPERATIONS. HAPPIER DOGS.");
assert.equal(RUFFOPS_AUTHOR, "Lonnie Sandoval");
assert.equal(RUFFOPS_DIVISION, "A Division of SK9 LLC");
assert.match(RUFFOPS_SOURCE_SIGNATURE, /RuffOps Operations Platform/);
assert.match(RUFFOPS_SOURCE_SIGNATURE, /Lonnie Sandoval/);
assert.match(RUFFOPS_SOURCE_SIGNATURE, /Author & Creator/);
assert.match(RUFFOPS_SOURCE_SIGNATURE, /A Division of SK9 LLC/);
assert.match(RUFFOPS_SOURCE_SIGNATURE, /BUILD/);
assert.doesNotMatch(RUFFOPS_SOURCE_SIGNATURE, /SENTRY_AUTH_TOKEN|SUPABASE_SERVICE_ROLE|password|api[_-]?key/i);
assert.equal(RUFFOPS_SOURCE_SIGNATURE_ELEMENT_ID, "ruffops-source-signature");
assert.equal(RUFFOPS_META.applicationName, "RuffOps");
assert.equal(RUFFOPS_META.author, "Lonnie Sandoval");
assert.equal(RUFFOPS_META.creator, "Lonnie Sandoval");
assert.equal(RUFFOPS_META.publisher, "SK9 LLC");

const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
assert.match(layout, /RuffOpsSourceSignature/);
assert.match(layout, /RuffOpsConsoleSignature/);
assert.match(layout, /authors:\s*\[\s*\{\s*name:\s*RUFFOPS_META\.author/);
assert.match(layout, /creator:\s*RUFFOPS_META\.creator/);
assert.match(layout, /publisher:\s*RUFFOPS_META\.publisher/);
assert.match(layout, /data-platform=\"ruffops\"/);
assert.match(layout, /data-ruffops=\"operations-platform\"/);

const boot = readFileSync(join(process.cwd(), "scripts/ruffops-dev.mjs"), "utf8");
assert.match(boot, /RUFFOPS_BOOT/);
assert.match(boot, /shouldSkipBoot/);
assert.match(boot, /SIGINT/);
assert.match(boot, /HANDING CONTROL TO NEXT\.JS/);

const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
assert.equal(pkg.scripts.dev, "node scripts/ruffops-dev.mjs");
assert.equal(pkg.scripts.build, "next build");
assert.match(String(pkg.author), /Lonnie Sandoval/);
assert.match(String(pkg.author), /SK9 LLC/);

console.log("ruffops-dev-signature: ok");

import assert from "node:assert/strict";
import {
  CAST_TV_HOSTNAME,
  CAST_TV_REWRITE_TARGET,
  shouldRewriteCastTvRoot
} from "../lib/cast-tv-domain";
import { normalizeHostname, shouldRewriteLobbyRoot } from "../lib/lobby-domain";

// --- CAST-TV subdomain at root → rewrite to /cast-tv ---
assert.equal(shouldRewriteCastTvRoot("casttv.ruffops.com", "/"), true, "casttv root rewrites");
assert.equal(shouldRewriteCastTvRoot("CASTTV.RUFFOPS.COM", "/"), true, "case-insensitive host rewrites");
assert.equal(shouldRewriteCastTvRoot("casttv.ruffops.com:3000", "/"), true, "host with port rewrites");
assert.equal(CAST_TV_REWRITE_TARGET, "/cast-tv");
assert.equal(CAST_TV_HOSTNAME, "casttv.ruffops.com");

// --- No rewrite loop: the rewrite target itself is never rewritten ---
assert.equal(
  shouldRewriteCastTvRoot("casttv.ruffops.com", "/cast-tv"),
  false,
  "/cast-tv is not rewritten (no loop)"
);

// --- API / static / asset paths on the CAST-TV host are not rewritten ---
for (const pathname of [
  "/api/cast-tv/media",
  "/api/cast-tv/heartbeat",
  "/api/cast-tv/settings",
  "/_next/static/chunks/main.js",
  "/favicon.ico",
  "/assets/fitdog/replace_f-logo.png",
  "/admin"
]) {
  assert.equal(
    shouldRewriteCastTvRoot("casttv.ruffops.com", pathname),
    false,
    `non-root path is not rewritten: ${pathname}`
  );
}

// --- Other hosts are never affected ---
for (const host of [
  "lobby.ruffops.com",
  "staff.ruffops.com",
  "fitdog-gingr-status-board.vercel.app",
  "localhost",
  "localhost:3000",
  "ruffops.com"
]) {
  assert.equal(shouldRewriteCastTvRoot(host, "/"), false, `${host} root is not rewritten`);
}

// --- Lobby routing remains unchanged ---
assert.equal(shouldRewriteLobbyRoot("lobby.ruffops.com", "/"), true);
assert.equal(shouldRewriteCastTvRoot("lobby.ruffops.com", "/"), false);
assert.equal(shouldRewriteLobbyRoot("casttv.ruffops.com", "/"), false);
assert.equal(normalizeHostname("casttv.ruffops.com"), "casttv.ruffops.com");

console.log("cast-tv domain routing tests passed");

import assert from "node:assert/strict";
import {
  LOBBY_HOSTNAME,
  LOBBY_REWRITE_TARGET,
  normalizeHostname,
  shouldRewriteLobbyRoot
} from "../lib/lobby-domain";

// --- Hostname normalization ---
assert.equal(normalizeHostname("lobby.ruffops.com"), "lobby.ruffops.com");
assert.equal(normalizeHostname("LOBBY.RuffOps.com"), "lobby.ruffops.com", "hostname is lowercased");
assert.equal(normalizeHostname("lobby.ruffops.com:3000"), "lobby.ruffops.com", "dev port is stripped");
assert.equal(normalizeHostname("  lobby.ruffops.com  "), "lobby.ruffops.com", "whitespace trimmed");
assert.equal(normalizeHostname(null), "");
assert.equal(normalizeHostname(undefined), "");

// --- Lobby subdomain at root → rewrite to /lobby/checkouts ---
assert.equal(shouldRewriteLobbyRoot("lobby.ruffops.com", "/"), true, "lobby root rewrites");
assert.equal(shouldRewriteLobbyRoot("LOBBY.RUFFOPS.COM", "/"), true, "case-insensitive host rewrites");
assert.equal(shouldRewriteLobbyRoot("lobby.ruffops.com:3000", "/"), true, "host with port rewrites");
assert.equal(LOBBY_REWRITE_TARGET, "/lobby/checkouts");
assert.equal(LOBBY_HOSTNAME, "lobby.ruffops.com");

// --- No rewrite loop: the rewrite target itself is never rewritten ---
assert.equal(
  shouldRewriteLobbyRoot("lobby.ruffops.com", "/lobby/checkouts"),
  false,
  "/lobby/checkouts is not rewritten (no loop)"
);

// --- API / static / asset / infra paths on the lobby host are not rewritten ---
for (const pathname of [
  "/api/lobby/checkouts",
  "/api/remote-cast/heartbeat",
  "/api/gingr/webhook",
  "/_next/static/chunks/main.js",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/sw-social-moments.js",
  "/assets/fitdog/social-moments/clips/social-moment-01.mp4",
  "/robots.txt",
  "/admin"
]) {
  assert.equal(
    shouldRewriteLobbyRoot("lobby.ruffops.com", pathname),
    false,
    `non-root path is not rewritten: ${pathname}`
  );
}

// --- Other hosts are never affected (Staff stays Staff) ---
for (const host of [
  "staff.ruffops.com",
  "fitdog-gingr-status-board.vercel.app",
  "fitdog-gingr-status-board-git-preview.vercel.app",
  "localhost",
  "localhost:3000",
  "127.0.0.1:3000",
  "ruffops.com"
]) {
  assert.equal(shouldRewriteLobbyRoot(host, "/"), false, `${host} root is not rewritten`);
  assert.equal(shouldRewriteLobbyRoot(host, "/lobby/checkouts"), false, `${host} /lobby/checkouts unchanged`);
}

console.log("lobby domain routing tests passed");

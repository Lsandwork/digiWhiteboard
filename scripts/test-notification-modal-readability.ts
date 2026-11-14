import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const modal = readFileSync(resolve(root, "components/admin/notifications/NotificationResponseModal.tsx"), "utf8");
const readable = readFileSync(resolve(root, "lib/fitdog-dashboard/theme-readable-canvas.css"), "utf8");
const globals = readFileSync(resolve(root, "app/globals.css"), "utf8");

assert.match(modal, /notif-response-modal admin-on-dark/, "modal shell must be a dark overlay surface");
assert.match(modal, /admin-on-dark notif-response-portal/, "portal must reset theme tokens for every account");

assert.match(
  readable,
  /\.admin-theme:is\(\.admin-on-dark, \.notif-response-modal/,
  "light/clear readable canvas must match portal as same-element dark island"
);
assert.match(
  readable,
  /\.ops-floor/,
  "light/clear readable canvas must treat the Floor workstation as a dark island"
);
assert.match(
  readable,
  /\.notif-response-rich-text/,
  "readable canvas must override Quill HTML inside the notification modal"
);

assert.match(globals, /\.admin-theme\.notif-response-portal\.admin-on-dark/, "globals must pin portal tokens above Clear .admin-theme");
assert.match(globals, /\.notif-response-modal\.admin-on-dark/, "globals must force rich text contrast on every theme");
assert.match(globals, /notif-response-details/, "globals must force Submission Details body contrast");
assert.match(globals, /background:\s*#1a120c\s*!important/, "Clear/Light must not bleach the dark modal panel");

const clearTheme = readFileSync(resolve(root, "lib/fitdog-dashboard/theme-clear.css"), "utf8");
assert.match(clearTheme, /notif-response-modal/, "Clear theme must explicitly keep notification modal dark");
assert.match(clearTheme, /ops-floor__drawer/, "Clear theme must keep Floor drawers dark");

console.log("notification modal readability: ok");
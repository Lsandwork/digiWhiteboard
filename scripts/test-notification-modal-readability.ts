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
  /\.admin-on-dark, \.notif-response-modal/,
  "light/clear readable canvas must treat the notification modal as a dark island"
);
assert.match(
  readable,
  /\.notif-response-rich-text/,
  "readable canvas must override Quill HTML inside the notification modal"
);

assert.match(globals, /\.notif-response-portal\.admin-on-dark/, "globals must pin modal tokens for all themes");
assert.match(globals, /\.notif-response-modal\.admin-on-dark/, "globals must force rich text contrast on every theme");

console.log("notification modal readability: ok");
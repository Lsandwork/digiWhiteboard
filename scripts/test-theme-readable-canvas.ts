import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const readable = readFileSync(resolve(root, "lib/fitdog-dashboard/theme-readable-canvas.css"), "utf8");
const layout = readFileSync(resolve(root, "app/layout.tsx"), "utf8");
const globals = readFileSync(resolve(root, "app/globals.css"), "utf8");
const tokens = readFileSync(resolve(root, "lib/theme/tokens.css"), "utf8");

assert.match(layout, /theme-readable-canvas\.css/, "layout must import readable canvas theme");
assert.match(globals, /--fitdog-text, var\(--text-primary/, "page titles must use theme text tokens");
assert.match(tokens, /html\[data-theme="light"\]/, "light theme tokens required");
assert.match(tokens, /html\[data-theme="clear"\]/, "clear theme tokens required");
assert.match(tokens, /--text-primary: #12213a/, "light canvases need dark primary text");

for (const theme of ["light", "clear"]) {
  assert.match(readable, new RegExp(`html\\[data-theme="${theme}"\\]`), `${theme} must be covered by readable canvas CSS`);
}

assert.match(readable, /text-white/, "must remap text-white on light canvases");
assert.match(readable, /text-slate-300/, "must remap pale slate text");
assert.match(readable, /text-rose-/, "must remap pale rose/urgent text");
assert.match(readable, /admin-preview-frame/, "must preserve white text in board previews");
assert.match(readable, /\.admin-sidebar/, "clear sidebar must keep light text");

console.log("theme readable canvas tests passed");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  TEXT_SCALE_VALUES,
  isTextScale,
  stepTextScale
} from "../lib/admin/text-scale";

assert.equal(isTextScale("md"), true);
assert.equal(isTextScale("xxl"), false);
assert.equal(stepTextScale("md", 1), "lg");
assert.equal(stepTextScale("xl", 1), "xl");
assert.equal(stepTextScale("sm", -1), "sm");
assert.equal(TEXT_SCALE_VALUES.md, 1);

const globals = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");
const boot = readFileSync(resolve(__dirname, "../lib/theme/boot-script.ts"), "utf8");
const shell = readFileSync(resolve(__dirname, "../components/admin/AdminShell.tsx"), "utf8");

assert.match(globals, /\.admin-floating-dock/, "floating dock styles required");
assert.match(globals, /\.admin-text-scale/, "text scale control styles required");
assert.match(globals, /--admin-text-scale/, "admin text scale CSS variable required");
assert.match(globals, /shift-log-row--highlight[\s\S]*?-webkit-line-clamp:\s*unset/, "urgent rows must not clamp preview");
assert.match(globals, /fitdog-alert-row--important/, "important Fitdog alert rows must unwrap");
assert.match(boot, /TEXT_SCALE_STORAGE_KEY|fitdog_admin_text_scale/, "boot script must restore text scale");
assert.match(shell, /TextScaleControls/, "AdminShell must mount text scale controls");
assert.match(shell, /admin-floating-dock/, "AdminShell must wrap AI bubble in floating dock");

console.log("text scale tests passed");

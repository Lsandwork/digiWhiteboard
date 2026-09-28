import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../lib/fitdog-dashboard/light-canvas.css"), "utf8");
const layout = readFileSync(resolve(__dirname, "../app/layout.tsx"), "utf8");
const shell = readFileSync(resolve(__dirname, "../components/ruffly/shell/RufflyPageClient.tsx"), "utf8");
const settings = readFileSync(resolve(__dirname, "../components/ruffly/settings/RufflySettingsPanel.tsx"), "utf8");

assert.match(layout, /light-canvas\.css/);
assert.match(shell, /ruffly-canvas light-canvas/);
assert.match(css, /\.ruffly-canvas/);
assert.match(css, /color:\s*#12213a/);
assert.match(css, /text-slate-500[\s\S]*#475569/);
assert.match(css, /\.text-white[\s\S]*#ffffff\s*!important/);
assert.match(settings, /text-slate-900/);
assert.match(settings, /Save profile/);
assert.match(settings, /font-semibold text-slate-900/);
assert.doesNotMatch(settings, /className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium"/);

console.log("light canvas contrast tests passed");

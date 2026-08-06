import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(__dirname, "../app/ruffly/public/page.tsx"), "utf8");
const widget = readFileSync(resolve(__dirname, "../public/widget.js"), "utf8");
const api = readFileSync(resolve(__dirname, "../app/api/ruffly/webchat/route.ts"), "utf8");

assert.match(page, /RUFFLY_WEBCHAT_SITE_KEY/);
assert.match(page, /__RUFFLY_WIDGET__/);
assert.match(page, /widget\.js/);
assert.match(widget, /__RUFFLY_WIDGET__/);
assert.match(api, /installSnippet/);
assert.match(api, /RUFFLY_WEBCHAT_SITE_KEY/);

console.log("Ruffly webchat embed wiring looks good.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const browserSrc = readFileSync(resolve("lib/fitdog-ops/providers/browser.ts"), "utf8");
const playwrightSrc = readFileSync(resolve("lib/fitdog-ops/providers/playwright.ts"), "utf8");
const nextConfig = readFileSync(resolve("next.config.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));

assert.match(browserSrc, /@sparticuz\/chromium/);
assert.match(browserSrc, /playwright-core/);
assert.match(browserSrc, /isServerlessRuntime|VERCEL/);
assert.match(playwrightSrc, /launchFitdogBrowser/);
assert.match(nextConfig, /serverExternalPackages/);
assert.match(nextConfig, /@sparticuz\/chromium/);
assert.ok(packageJson.dependencies["playwright-core"], "playwright-core must be a production dependency");
assert.ok(packageJson.dependencies["@sparticuz/chromium"], "@sparticuz/chromium must be a production dependency");

console.log("test-fitdog-browser-launcher: ok");

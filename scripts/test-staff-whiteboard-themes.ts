import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_STAFF_WHITEBOARD_THEME_ID,
  getStaffWhiteboardTheme,
  normalizeStaffWhiteboardThemeId,
  staffWhiteboardThemeCssVars,
  STAFF_WHITEBOARD_THEME_LIST,
  STAFF_WHITEBOARD_THEME_SETTING_KEY
} from "../lib/staff/whiteboard-themes";

assert.equal(DEFAULT_STAFF_WHITEBOARD_THEME_ID, "clear-white");
assert.equal(normalizeStaffWhiteboardThemeId("city"), "city");
assert.equal(normalizeStaffWhiteboardThemeId("CITY"), "city");
assert.equal(normalizeStaffWhiteboardThemeId("nope"), "clear-white");
assert.equal(STAFF_WHITEBOARD_THEME_SETTING_KEY, "staff_whiteboard_theme");

const city = getStaffWhiteboardTheme("city");
assert.equal(city.name, "City");
assert.match(city.description, /cinematic/i);
assert.ok(city.headerImage);
assert.equal(city.tokens.accent, "#FF9F1C");

const clear = getStaffWhiteboardTheme("clear-white");
assert.equal(clear.name, "Clear White");
assert.doesNotMatch(clear.description, /green/i);
assert.equal(clear.tokens.accent, "#FF9F1C");

const vars = staffWhiteboardThemeCssVars(city);
assert.equal(vars["--wb-accent"], "#FF9F1C");
assert.match(String(vars["--wb-header-image"]), /city-header\.png/);

assert.equal(STAFF_WHITEBOARD_THEME_LIST.length, 2);
assert.deepEqual(
  STAFF_WHITEBOARD_THEME_LIST.map((t) => t.id),
  ["clear-white", "city"]
);
assert.equal(STAFF_WHITEBOARD_THEME_LIST[1].name, "City");

const root = process.cwd();
for (const rel of [
  "public/assets/fitdog/staff-whiteboard/themes/city-header.png",
  "public/assets/fitdog/staff-whiteboard/themes/city-preview.png",
  "public/assets/fitdog/staff-whiteboard/themes/clear-white-preview.png"
]) {
  assert.equal(existsSync(join(root, rel)), true, `missing asset ${rel}`);
}

const selector = readFileSync(join(root, "components/admin/StaffWhiteboardThemeSelector.tsx"), "utf8");
assert.match(selector, /Whiteboard Theme/);
assert.match(selector, /Current Theme/);
assert.match(selector, /Use This Theme/);
assert.doesNotMatch(selector, /\bBeach\b/);

const dashboard = readFileSync(join(root, "components/admin/AdminDashboard.tsx"), "utf8");
assert.match(dashboard, /StaffWhiteboardThemeSelector/);
assert.match(dashboard, /saveStaffWhiteboardTheme/);
assert.match(dashboard, /previewThemeId=\{selectedWhiteboardTheme\}/);

const boardClient = readFileSync(join(root, "components/BoardClient.tsx"), "utf8");
assert.match(boardClient, /data-staff-wb-theme/);
assert.match(boardClient, /staffWhiteboardThemeCssVars/);
assert.match(boardClient, /whiteboardTheme=\{resolvedTheme\.id\}/);

const overlays = readFileSync(join(root, "lib/staff/board-overlays.ts"), "utf8");
assert.match(overlays, /whiteboardTheme/);
assert.match(overlays, /loadStaffWhiteboardThemeId/);

const settings = readFileSync(join(root, "lib/staff/settings.ts"), "utf8");
assert.match(settings, /whiteboard_theme/);
assert.match(settings, /saveStaffWhiteboardThemeId/);

const api = readFileSync(join(root, "app/api/admin/board-settings/route.ts"), "utf8");
assert.match(api, /whiteboard_theme/);

const css = readFileSync(join(root, "lib/staff/whiteboard-theme.css"), "utf8");
assert.match(css, /data-staff-wb-theme="city"/);
assert.match(css, /data-staff-wb-theme="clear-white"/);
assert.match(css, /--wb-header-image/);

const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
assert.match(layout, /whiteboard-theme\.css/);

console.log("staff whiteboard themes: ok");

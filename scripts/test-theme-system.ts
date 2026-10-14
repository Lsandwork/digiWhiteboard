/**
 * Theme system smoke tests — run with: npm run test:theme
 */
import assert from "node:assert/strict";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isThemeMode,
  normalizeThemeMode
} from "../lib/theme/constants";
import { defaultThemeForPath, resolveInitialTheme } from "../lib/theme/storage";
import { THEME_BOOT_SCRIPT } from "../lib/theme/boot-script";

function testThemeModeValidation() {
  assert.equal(isThemeMode("light"), true);
  assert.equal(isThemeMode("dark"), true);
  assert.equal(isThemeMode("clear"), true);
  assert.equal(isThemeMode("system"), false);
  assert.equal(normalizeThemeMode("fitdog_light"), "light");
  assert.equal(normalizeThemeMode("fitdog_dark"), "dark");
  assert.equal(normalizeThemeMode("fitdog_clear"), "clear");
  assert.equal(normalizeThemeMode("bogus", "dark"), "dark");
}

function testResolveInitialTheme() {
  assert.equal(resolveInitialTheme("light", false), "light");
  assert.equal(resolveInitialTheme("dark", false), "dark");
  assert.equal(resolveInitialTheme("clear", false), "clear");
  assert.equal(resolveInitialTheme(null, false), DEFAULT_THEME);
}

function testStorageKey() {
  assert.equal(THEME_STORAGE_KEY, "fitdog_theme_preference");
}

function testBootScriptShape() {
  assert.match(THEME_BOOT_SCRIPT, /dataset\.theme/);
  assert.match(THEME_BOOT_SCRIPT, /fitdog_theme_preference/);
  assert.match(THEME_BOOT_SCRIPT, /dark/);
  assert.match(THEME_BOOT_SCRIPT, /clear/);
  assert.match(THEME_BOOT_SCRIPT, /staff-cast/);
}

function testOperationsDefaultTheme() {
  assert.equal(defaultThemeForPath("/admin"), "light");
  assert.equal(defaultThemeForPath("/admin/login"), "light");
  assert.equal(defaultThemeForPath("/ruffly"), "light");
  assert.equal(defaultThemeForPath("/"), "dark");
  assert.equal(defaultThemeForPath("/display/staff-whiteboard"), "dark");
  assert.equal(defaultThemeForPath("/lobby/checkouts"), "dark");
  assert.equal(defaultThemeForPath("/cast/receiver"), "dark");
  assert.equal(defaultThemeForPath("/cast-tv"), "dark");
}

function main() {
  testThemeModeValidation();
  testResolveInitialTheme();
  testStorageKey();
  testBootScriptShape();
  testOperationsDefaultTheme();
  console.log("theme-system: all checks passed");
}

main();

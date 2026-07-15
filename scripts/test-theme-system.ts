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
import { resolveInitialTheme } from "../lib/theme/storage";
import { THEME_BOOT_SCRIPT } from "../lib/theme/boot-script";

function testThemeModeValidation() {
  assert.equal(isThemeMode("light"), true);
  assert.equal(isThemeMode("dark"), true);
  assert.equal(isThemeMode("system"), false);
  assert.equal(normalizeThemeMode("fitdog_light"), "light");
  assert.equal(normalizeThemeMode("fitdog_dark"), "dark");
  assert.equal(normalizeThemeMode("bogus", "dark"), "dark");
}

function testResolveInitialTheme() {
  assert.equal(resolveInitialTheme("light", false), "light");
  assert.equal(resolveInitialTheme("dark", false), "dark");
  assert.equal(resolveInitialTheme(null, false), DEFAULT_THEME);
}

function testStorageKey() {
  assert.equal(THEME_STORAGE_KEY, "fitdog_theme_preference");
}

function testBootScriptShape() {
  assert.match(THEME_BOOT_SCRIPT, /dataset\.theme/);
  assert.match(THEME_BOOT_SCRIPT, /fitdog_theme_preference/);
  assert.match(THEME_BOOT_SCRIPT, /dark/);
}

function main() {
  testThemeModeValidation();
  testResolveInitialTheme();
  testStorageKey();
  testBootScriptShape();
  console.log("theme-system: all checks passed");
}

main();

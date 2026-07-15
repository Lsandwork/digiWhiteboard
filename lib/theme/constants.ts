import type { ThemeMode } from "./types";

export const THEME_STORAGE_KEY = "fitdog_theme_preference";
export const THEME_BROADCAST_CHANNEL = "fitdog-theme-sync";

export const DEFAULT_THEME: ThemeMode = "dark";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function normalizeThemeMode(value: unknown, fallback: ThemeMode = DEFAULT_THEME): ThemeMode {
  if (value === "fitdog_light" || value === "light") return "light";
  if (value === "fitdog_dark" || value === "dark") return "dark";
  return fallback;
}

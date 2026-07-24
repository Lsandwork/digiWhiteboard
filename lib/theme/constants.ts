import type { ThemeMode } from "./types";

export const THEME_STORAGE_KEY = "fitdog_theme_preference";
export const THEME_BROADCAST_CHANNEL = "fitdog-theme-sync";

export const DEFAULT_THEME: ThemeMode = "dark";

export const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "clear", label: "Clear" }
];

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "clear";
}

export function normalizeThemeMode(value: unknown, fallback: ThemeMode = DEFAULT_THEME): ThemeMode {
  if (value === "fitdog_light" || value === "light") return "light";
  if (value === "fitdog_dark" || value === "dark") return "dark";
  if (value === "fitdog_clear" || value === "clear") return "clear";
  return fallback;
}

export function themeLabel(theme: ThemeMode): string {
  return THEME_OPTIONS.find((option) => option.value === theme)?.label ?? "Dark";
}

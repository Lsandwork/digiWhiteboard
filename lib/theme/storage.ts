import { DEFAULT_THEME, THEME_STORAGE_KEY, isThemeMode, normalizeThemeMode } from "./constants";
import type { ThemeMode } from "./types";

export function readLocalTheme(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : normalizeThemeMode(stored, DEFAULT_THEME);
  } catch {
    return null;
  }
}

export function writeLocalTheme(theme: ThemeMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore quota / private mode
  }
}

export function readSystemTheme(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_THEME;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveInitialTheme(stored: ThemeMode | null, systemFallback = false): ThemeMode {
  if (stored) return stored;
  if (systemFallback) return readSystemTheme();
  return DEFAULT_THEME;
}

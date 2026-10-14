import { DEFAULT_THEME, THEME_STORAGE_KEY, isThemeMode, normalizeThemeMode } from "./constants";
import type { ThemeMode } from "./types";

/** Live boards and cast surfaces stay on the dark display default. */
const DISPLAY_SURFACE = /^\/$|^\/(display|lobby|staff-cast|lobby-cast|cast-tv|demo|boards)(\/|$)|^\/cast(\/|$)/;

export function defaultThemeForPath(pathname: string): ThemeMode {
  const path = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  return DISPLAY_SURFACE.test(path) ? "dark" : "light";
}

export function readLocalTheme(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!stored) return null;
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

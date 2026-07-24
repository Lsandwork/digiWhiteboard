"use client";

import { THEME_OPTIONS, themeLabel } from "@/lib/theme/constants";
import type { ThemeMode } from "@/lib/theme/types";
import { useThemeOptional } from "@/components/theme/ThemeProvider";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const themeContext = useThemeOptional();
  if (!themeContext) return null;

  const { theme, setTheme, isHydrated } = themeContext;

  return (
    <label
      className={`theme-select ${compact ? "theme-select--compact" : ""}`}
      title="Theme"
    >
      {!compact ? <span className="theme-select__label">Theme</span> : null}
      <select
        className="theme-select__control"
        aria-label="Theme"
        value={theme}
        disabled={!isHydrated}
        onChange={(event) => setTheme(event.target.value as ThemeMode)}
      >
        {THEME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="sr-only">Current theme: {themeLabel(theme)}</span>
    </label>
  );
}

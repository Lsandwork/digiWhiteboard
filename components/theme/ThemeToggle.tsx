"use client";

import { Moon, Sun } from "lucide-react";
import { useThemeOptional } from "@/components/theme/ThemeProvider";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const themeContext = useThemeOptional();
  if (!themeContext) return null;

  const { theme, toggleTheme, isHydrated } = themeContext;
  const isLight = theme === "light";

  return (
    <button
      type="button"
      className={`theme-toggle ${compact ? "theme-toggle--compact" : ""}`}
      role="switch"
      aria-checked={isLight}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      onClick={toggleTheme}
      disabled={!isHydrated}
    >
      <span className="theme-toggle__track" aria-hidden>
        <Sun className={`theme-toggle__icon theme-toggle__icon--sun ${isLight ? "is-active" : ""}`} />
        <span className={`theme-toggle__thumb ${isLight ? "is-light" : ""}`} />
        <Moon className={`theme-toggle__icon theme-toggle__icon--moon ${!isLight ? "is-active" : ""}`} />
      </span>
      {!compact ? <span className="theme-toggle__label">{isLight ? "Light" : "Dark"}</span> : null}
    </button>
  );
}

import type { ThemeMode } from "./types";

export function applyThemeToDocument(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.classList.toggle("fitdog-light", theme === "light");
  root.classList.toggle("fitdog-dark", theme === "dark");

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "light" ? "#f7f9fc" : "#02060b");
  }
}

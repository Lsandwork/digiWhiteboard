import type { ThemeMode } from "./types";

export function applyThemeToDocument(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  // Clear uses a light content canvas with a dark sidebar.
  root.style.colorScheme = theme === "dark" ? "dark" : "light";
  root.classList.toggle("fitdog-light", theme === "light");
  root.classList.toggle("fitdog-dark", theme === "dark");
  root.classList.toggle("fitdog-clear", theme === "clear");

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      theme === "dark" ? "#02060b" : theme === "clear" ? "#ffffff" : "#f7f9fc"
    );
  }
}

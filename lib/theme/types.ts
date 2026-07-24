export type ThemeMode = "light" | "dark" | "clear";

export interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  isHydrated: boolean;
}

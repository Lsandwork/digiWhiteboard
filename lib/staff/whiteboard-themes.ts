/**
 * Staff Digital Whiteboard visual themes.
 * Theme definitions live in code; only the selected theme ID is persisted.
 */

export const STAFF_WHITEBOARD_THEME_SETTING_KEY = "staff_whiteboard_theme";

export type StaffWhiteboardThemeId = "clear-white" | "city";

export type StaffWhiteboardThemeTokens = {
  background: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  accent: string;
  accentSoft: string;
  statusLive: string;
  muted: string;
  headerBackground: string;
  footerBackground: string;
  cardShadow: string;
};

export type StaffWhiteboardTheme = {
  id: StaffWhiteboardThemeId;
  name: string;
  description: string;
  shortDescription: string;
  previewImage: string;
  headerImage?: string;
  tokens: StaffWhiteboardThemeTokens;
};

export const DEFAULT_STAFF_WHITEBOARD_THEME_ID: StaffWhiteboardThemeId = "clear-white";

/** FitDog orange — primary brand accent for all staff whiteboard themes. */
export const STAFF_WB_ACCENT_ORANGE = "#FF9F1C";

export const STAFF_WHITEBOARD_THEMES: Record<StaffWhiteboardThemeId, StaffWhiteboardTheme> = {
  "clear-white": {
    id: "clear-white",
    name: "Clear White",
    description: "Bright, clean, premium FitDog operations display.",
    shortDescription: "Bright & clean",
    previewImage: "/assets/fitdog/staff-whiteboard/themes/clear-white-preview.png",
    tokens: {
      background: "#F4F6F8",
      surface: "#FFFFFF",
      surfaceElevated: "#FFFFFF",
      textPrimary: "#1A1F2C",
      textSecondary: "#5B6577",
      border: "rgba(26, 31, 44, 0.10)",
      accent: STAFF_WB_ACCENT_ORANGE,
      accentSoft: "rgba(255, 159, 28, 0.14)",
      statusLive: "#E11D48",
      muted: "#8B93A7",
      headerBackground: "#FFFFFF",
      footerBackground: "#FFFFFF",
      cardShadow: "0 10px 28px rgba(15, 23, 42, 0.08)"
    }
  },
  city: {
    id: "city",
    name: "City",
    description: "Premium cinematic FitDog display with a dark architectural header and warm orange atmosphere.",
    shortDescription: "Cinematic & premium",
    previewImage: "/assets/fitdog/staff-whiteboard/themes/city-preview.png",
    headerImage: "/assets/fitdog/staff-whiteboard/themes/city-header.png",
    tokens: {
      background: "#F7F1E8",
      surface: "#FFFBF5",
      surfaceElevated: "#FFFFFF",
      textPrimary: "#141A24",
      textSecondary: "#5C6575",
      border: "rgba(20, 26, 36, 0.12)",
      accent: STAFF_WB_ACCENT_ORANGE,
      accentSoft: "rgba(255, 159, 28, 0.18)",
      statusLive: "#FF9F1C",
      muted: "#7A8496",
      headerBackground: "#0B1220",
      footerBackground: "#0B1220",
      cardShadow: "0 14px 36px rgba(11, 18, 32, 0.12)"
    }
  }
};

export const STAFF_WHITEBOARD_THEME_LIST: StaffWhiteboardTheme[] = [
  STAFF_WHITEBOARD_THEMES["clear-white"],
  STAFF_WHITEBOARD_THEMES.city
];

export function isStaffWhiteboardThemeId(value: unknown): value is StaffWhiteboardThemeId {
  return value === "clear-white" || value === "city";
}

export function normalizeStaffWhiteboardThemeId(value: unknown): StaffWhiteboardThemeId {
  if (isStaffWhiteboardThemeId(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "clear-white" || trimmed === "clear_white" || trimmed === "clearwhite") {
      return "clear-white";
    }
    if (trimmed === "city") return "city";
  }
  return DEFAULT_STAFF_WHITEBOARD_THEME_ID;
}

export function getStaffWhiteboardTheme(id: unknown): StaffWhiteboardTheme {
  return STAFF_WHITEBOARD_THEMES[normalizeStaffWhiteboardThemeId(id)];
}

/** CSS custom properties applied to the staff board shell. */
export function staffWhiteboardThemeCssVars(theme: StaffWhiteboardTheme): Record<string, string> {
  const t = theme.tokens;
  return {
    "--wb-background": t.background,
    "--wb-surface": t.surface,
    "--wb-surface-elevated": t.surfaceElevated,
    "--wb-text-primary": t.textPrimary,
    "--wb-text-secondary": t.textSecondary,
    "--wb-border": t.border,
    "--wb-accent": t.accent,
    "--wb-accent-soft": t.accentSoft,
    "--wb-status-live": t.statusLive,
    "--wb-muted": t.muted,
    "--wb-header-background": t.headerBackground,
    "--wb-footer-background": t.footerBackground,
    "--wb-card-shadow": t.cardShadow,
    ...(theme.headerImage ? { "--wb-header-image": `url(${theme.headerImage})` } : {})
  };
}

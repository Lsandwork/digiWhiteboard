export const SHELL_LAYOUT_STORAGE_KEY = "fitdog_shell_layout";

export type ShellLayoutMode = "mobile" | "desktop";

/** Forced mobile viewport so max-width:767px app chrome always activates. */
export const SHELL_LAYOUT_MOBILE_VIEWPORT =
  "width=390, initial-scale=1, viewport-fit=cover, maximum-scale=1";

/** Wide enough that phone app media queries (max-width: 767px) turn off. */
export const SHELL_LAYOUT_DESKTOP_VIEWPORT = "width=1280, initial-scale=1";

export const SHELL_LAYOUT_PHONE_MQ = "(max-width: 767px)";

export function isShellLayoutMode(value: unknown): value is ShellLayoutMode {
  return value === "mobile" || value === "desktop";
}

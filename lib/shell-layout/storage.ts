import { SHELL_LAYOUT_STORAGE_KEY, isShellLayoutMode, type ShellLayoutMode } from "./constants";

export function readLocalShellLayout(): ShellLayoutMode | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(SHELL_LAYOUT_STORAGE_KEY);
    return isShellLayoutMode(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeLocalShellLayout(mode: ShellLayoutMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SHELL_LAYOUT_STORAGE_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
}

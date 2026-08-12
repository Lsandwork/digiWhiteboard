import {
  SHELL_LAYOUT_DESKTOP_VIEWPORT,
  SHELL_LAYOUT_MOBILE_VIEWPORT,
  SHELL_LAYOUT_PHONE_MQ,
  type ShellLayoutMode
} from "./constants";

function ensureViewportMeta(): HTMLMetaElement | null {
  if (typeof document === "undefined") return null;
  let meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "viewport";
    document.head.appendChild(meta);
  }
  return meta;
}

/** Apply a forced shell layout (viewport + html[data-shell]). */
export function applyShellLayout(mode: ShellLayoutMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.shell = mode;

  const meta = ensureViewportMeta();
  if (!meta) return;
  meta.setAttribute(
    "content",
    mode === "desktop" ? SHELL_LAYOUT_DESKTOP_VIEWPORT : SHELL_LAYOUT_MOBILE_VIEWPORT
  );
}

/** Natural phone width when no forced preference is stored. */
export function detectNaturalShellLayout(): ShellLayoutMode {
  if (typeof window === "undefined") return "desktop";
  try {
    return window.matchMedia(SHELL_LAYOUT_PHONE_MQ).matches ? "mobile" : "desktop";
  } catch {
    return "desktop";
  }
}

export function resolveShellLayout(stored: ShellLayoutMode | null): ShellLayoutMode {
  return stored ?? detectNaturalShellLayout();
}

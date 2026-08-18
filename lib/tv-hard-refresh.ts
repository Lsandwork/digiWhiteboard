export const TV_HARD_REFRESH_QUERY = "_r";
export const TV_HARD_REFRESH_POLL_MS = 1_000;
export const TV_HARD_REFRESH_ENDPOINT = "/api/display/hard-refresh";

const TV_WHITEBOARD_PREFIXES = [
  "/lobby",
  "/cast",
  "/staff-cast",
  "/lobby-cast",
  "/display",
  "/boards"
] as const;

export function isTvWhiteboardPath(pathname: string) {
  const path = String(pathname || "/").split("?")[0] || "/";
  if (path === "/") return true;
  return TV_WHITEBOARD_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function currentUrl() {
  return new URL(window.location.href);
}

/** Drop the cache-buster so the TV browser app stays on its pinned URL. */
export function stripHardRefreshQuery() {
  if (typeof window === "undefined") return;
  try {
    const url = currentUrl();
    if (!url.searchParams.has(TV_HARD_REFRESH_QUERY)) return;
    url.searchParams.delete(TV_HARD_REFRESH_QUERY);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Ignore locked-down TV browsers.
  }
}

/**
 * Reload the whiteboard as if the TV browser just opened this same page:
 * a new document navigation to the same path, with a one-shot cache buster.
 */
export function visitPageAsNewNavigation() {
  if (typeof window === "undefined") return;
  try {
    const url = currentUrl();
    url.searchParams.delete(TV_HARD_REFRESH_QUERY);
    url.searchParams.set(TV_HARD_REFRESH_QUERY, String(Date.now()));
    window.location.replace(url.toString());
    return;
  } catch {
    // Some TV shells reject replace(); try a same-document assign next.
  }
  try {
    window.location.assign(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    return;
  } catch {
    // Fall through.
  }
  try {
    window.location.reload();
  } catch {
    // Ignore locked-down TV browsers that reject navigation.
  }
}

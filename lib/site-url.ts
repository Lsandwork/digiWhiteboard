/** Canonical public Digi-Board host for cast links, webhooks docs, and TV URLs. */
export const CANONICAL_PRODUCTION_SITE_URL = "https://staff.ruffops.com";

/**
 * Normalize a configured site URL.
 * Remaps the legacy Vercel preview hostname so cast/TV builders never advertise
 * fitdog-gingr-status-board.vercel.app in production.
 */
export function resolvePublicSiteUrl(raw?: string | null): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withProtocol);
    const host = url.hostname.toLowerCase();
    if (
      host === "fitdog-gingr-status-board.vercel.app" ||
      host === "fitdog-gingr-status-board-git-main.vercel.app"
    ) {
      return CANONICAL_PRODUCTION_SITE_URL;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function getPublicSiteUrl() {
  return (
    resolvePublicSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ||
    resolvePublicSiteUrl(process.env.VERCEL_URL) ||
    CANONICAL_PRODUCTION_SITE_URL
  );
}

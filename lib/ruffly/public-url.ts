import { CANONICAL_PRODUCTION_SITE_URL } from "@/lib/site-url";

const RUFFLY_DEDICATED_HOST = "ruffly.ruffops.com";

export function rufflyPublicBaseUrl() {
  return (
    process.env.RUFFLY_PUBLIC_URL?.trim() ||
    // Until ruffly.ruffops.com DNS is pointed at Vercel, serve public pages on staff.
    CANONICAL_PRODUCTION_SITE_URL
  ).replace(/\/$/, "");
}

export function rufflyApiBaseUrl() {
  return (
    process.env.RUFFLY_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    CANONICAL_PRODUCTION_SITE_URL
  ).replace(/\/$/, "");
}

function usesDedicatedRufflyHost(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === RUFFLY_DEDICATED_HOST;
  } catch {
    return false;
  }
}

/**
 * Review links use short `/review/:token` on ruffly.ruffops.com (middleware rewrite),
 * and `/ruffly/review/:token` on staff.ruffops.com (App Router path).
 */
export function rufflyReviewPath(token: string) {
  const base = rufflyPublicBaseUrl();
  const path = usesDedicatedRufflyHost(base)
    ? `/review/${encodeURIComponent(token)}`
    : `/ruffly/review/${encodeURIComponent(token)}`;
  return `${base}${path}`;
}

export function rufflyFeedbackPath(token: string) {
  const base = rufflyPublicBaseUrl();
  const path = usesDedicatedRufflyHost(base)
    ? `/feedback/${encodeURIComponent(token)}`
    : `/ruffly/feedback/${encodeURIComponent(token)}`;
  return `${base}${path}`;
}

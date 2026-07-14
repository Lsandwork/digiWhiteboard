/**
 * CAST-TV custom-domain routing.
 *
 * The casttv.ruffops.com subdomain points at this same Vercel project. At the
 * root path it must serve the CAST-TV slideshow (/cast-tv) via an internal
 * rewrite — never a visible redirect.
 */

import { normalizeHostname } from "@/lib/lobby-domain";

/** Hostname (lowercased, no port) that must render CAST-TV at "/". */
export const CAST_TV_HOSTNAME = "casttv.ruffops.com";

/** Internal target the CAST-TV root is rewritten to. */
export const CAST_TV_REWRITE_TARGET = "/cast-tv";

/**
 * True only for the CAST-TV subdomain requesting the site root. Only "/" is
 * rewritten, so /cast-tv (and everything else) is left untouched, which prevents
 * rewrite loops and keeps API/static/asset routes intact.
 */
export function shouldRewriteCastTvRoot(host: string | null | undefined, pathname: string): boolean {
  if (pathname !== "/") return false;
  return normalizeHostname(host) === CAST_TV_HOSTNAME;
}

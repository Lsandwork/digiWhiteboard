/**
 * Lobby custom-domain routing.
 *
 * The lobby.ruffops.com subdomain points at this same Vercel project. At the
 * root path it must serve the Lobby Digital Whiteboard (/lobby/checkouts) via an
 * internal rewrite — never a visible redirect, and never the Staff board.
 *
 * Kept as pure functions so the behavior is unit-testable without constructing a
 * full NextRequest.
 */

/** Hostname (lowercased, no port) that must render the lobby board at "/". */
export const LOBBY_HOSTNAME = "lobby.ruffops.com";

/** Internal target the lobby root is rewritten to. */
export const LOBBY_REWRITE_TARGET = "/lobby/checkouts";

/** Lowercase a Host header / hostname and strip any dev port (e.g. ":3000"). */
export function normalizeHostname(host: string | null | undefined): string {
  if (!host) return "";
  return host.trim().toLowerCase().split(":", 1)[0];
}

/**
 * True only for the lobby subdomain requesting the site root. Only "/" is
 * rewritten, so /lobby/checkouts (and everything else) is left untouched, which
 * prevents rewrite loops and keeps API/static/asset routes intact.
 */
export function shouldRewriteLobbyRoot(host: string | null | undefined, pathname: string): boolean {
  if (pathname !== "/") return false;
  return normalizeHostname(host) === LOBBY_HOSTNAME;
}

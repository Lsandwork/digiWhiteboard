/**
 * TL Digi Board uses a dedicated Gingr API key so it can differ from the
 * whiteboard / board-sync key (`GINGR_API_KEY`) in Vercel.
 *
 * Env: TL_GINGR_KEY, falling back to GINGR_API_KEY so the TV board still syncs
 * when only the staff-board key is configured.
 */

export const TL_GINGR_KEY_ENV = "TL_GINGR_KEY";

export function resolveTlGingrApiKey(): string {
  return process.env.TL_GINGR_KEY?.trim() || process.env.GINGR_API_KEY?.trim() || "";
}

/** Partner API (`api.gingr.io`) may require a Manage Account key, not the Users API key. */
export function resolveGingrPartnerApiKey(): string {
  return (
    process.env.GINGR_PARTNER_API_KEY?.trim() ||
    process.env.TL_GINGR_PARTNER_KEY?.trim() ||
    resolveTlGingrApiKey()
  );
}

export function isGingrPartnerApiKeyConfigured(): boolean {
  return Boolean(resolveGingrPartnerApiKey());
}

/**
 * True when `GINGR_PARTNER_API_KEY` (or `TL_GINGR_PARTNER_KEY`) is set to a value
 * different from the Users/TL facility key. Partner parent-packages return HTTP 403
 * when only the Users → API Keys key is used.
 */
export function isGingrPartnerApiKeyDistinctFromUsersKey(): boolean {
  const partner =
    process.env.GINGR_PARTNER_API_KEY?.trim() || process.env.TL_GINGR_PARTNER_KEY?.trim() || "";
  if (!partner) return false;
  const users = resolveTlGingrApiKey();
  return Boolean(users) && partner !== users;
}

export function isTlGingrKeyConfigured(): boolean {
  return Boolean(resolveTlGingrApiKey());
}

export function requireTlGingrApiKey(): string {
  const key = resolveTlGingrApiKey();
  if (!key) {
    throw new Error("TL_GINGR_KEY (or GINGR_API_KEY) is not configured on this environment.");
  }
  return key;
}

export function tlGingrClientConfig() {
  return {
    apiKey: resolveTlGingrApiKey(),
    subdomain: process.env.GINGR_SUBDOMAIN?.trim() || "fitdog",
    locationId: process.env.GINGR_LOCATION_ID?.trim() || "1"
  };
}

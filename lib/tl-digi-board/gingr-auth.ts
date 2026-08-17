/**
 * TL Digi Board uses a dedicated Gingr API key so it can differ from the
 * whiteboard / board-sync key (`GINGR_API_KEY`) in Vercel.
 *
 * Env: TL_GINGR_KEY
 * Optional shared host settings still use GINGR_SUBDOMAIN / GINGR_LOCATION_ID.
 */

export const TL_GINGR_KEY_ENV = "TL_GINGR_KEY";

export function resolveTlGingrApiKey(): string {
  return process.env.TL_GINGR_KEY?.trim() || "";
}

export function isTlGingrKeyConfigured(): boolean {
  return Boolean(resolveTlGingrApiKey());
}

export function requireTlGingrApiKey(): string {
  const key = resolveTlGingrApiKey();
  if (!key) {
    throw new Error("TL_GINGR_KEY is not configured on this environment.");
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

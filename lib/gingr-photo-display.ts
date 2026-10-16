import { isLegacyGingrPhotoUrl, normalizePhotoUrl } from "@/lib/board-utils";

export { isLegacyGingrPhotoUrl };

const GINGR_UPLOAD_BUCKET = "gingr-app-user-uploads";

export function parseHttpUrl(value: string | URL) {
  try {
    const url = typeof value === "string" ? new URL(value) : value;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    if (url.port && url.port !== "443" && url.port !== "80") return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * URLs a caller may ask the photo proxy to fetch (the public `src` parameter): Gingr's
 * own domain and Gingr's upload bucket on Google Cloud Storage — not arbitrary buckets.
 */
export function isAllowedGingrPhotoUrl(value: string | URL) {
  const url = parseHttpUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  if (host === "gingrapp.com" || host.endsWith(".gingrapp.com")) return true;
  if (host === `${GINGR_UPLOAD_BUCKET}.storage.googleapis.com`) return true;
  if (host === "storage.googleapis.com") return url.pathname.startsWith(`/${GINGR_UPLOAD_BUCKET}/`);
  return false;
}

const ALLOWED_PHOTO_HOST_SUFFIXES = [
  ".gingrapp.com",
  // Gingr's retired Rackspace CDN — still referenced by old animal records (never proxied).
  ".rackcdn.com"
];

const ALLOWED_PHOTO_HOSTS = new Set([
  "gingrapp.com",
  "cdn.gingrapp.com",
  // Gingr now serves animal photos from Google Cloud Storage (gingr-app-user-uploads).
  "storage.googleapis.com",
  "gingr-app-user-uploads.storage.googleapis.com"
]);

export function isAllowedGingrPhotoHost(hostname: string) {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  if (ALLOWED_PHOTO_HOSTS.has(host)) return true;
  return ALLOWED_PHOTO_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export function isGingrHostedPhotoUrl(url: string) {
  return isAllowedGingrPhotoUrl(url) || isLegacyGingrPhotoUrl(url);
}

/** Same-origin board photo URL so TVs/Safari can render Gingr pictures. */
export function toDisplayPhotoUrl(photoUrl?: string | null, animalId?: string | null) {
  const id = animalId?.trim() || "";
  const incoming = photoUrl?.trim() || "";
  if (incoming.startsWith("/api/") || incoming.startsWith("/assets/")) return incoming;

  const normalized = incoming ? normalizePhotoUrl(incoming) : "";
  if (normalized.startsWith("data:") || normalized.startsWith("blob:")) return null;

  if (id) {
    const params = new URLSearchParams({ animalId: id });
    if (normalized && isGingrHostedPhotoUrl(normalized) && !isLegacyGingrPhotoUrl(normalized)) {
      params.set("src", normalized);
    }
    return `/api/gingr/animal-photo/image?${params.toString()}`;
  }

  if (normalized && isGingrHostedPhotoUrl(normalized)) {
    return `/api/gingr/animal-photo/image?src=${encodeURIComponent(normalized)}`;
  }

  return normalized || null;
}

import { normalizePhotoUrl } from "@/lib/board-utils";

const ALLOWED_PHOTO_HOST_SUFFIXES = [
  ".gingrapp.com",
  ".amazonaws.com",
  ".cloudfront.net",
  // Gingr now serves animal photos from Google Cloud Storage.
  ".googleapis.com",
  ".googleusercontent.com",
  // Gingr's retired Rackspace CDN — still referenced by old animal records.
  ".rackcdn.com"
];

const ALLOWED_PHOTO_HOSTS = new Set([
  "gingrapp.com",
  "cdn.gingrapp.com",
  "storage.googleapis.com"
]);

/**
 * Gingr's legacy Rackspace CDN is dead — those URLs 404. Animal records created
 * before the Google Cloud Storage migration still carry them, so the board must
 * resolve a fresh photo through the proxy instead of rendering a broken image.
 */
const LEGACY_PHOTO_HOST_SUFFIXES = [".rackcdn.com"];

export function isAllowedGingrPhotoHost(hostname: string) {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  if (ALLOWED_PHOTO_HOSTS.has(host)) return true;
  return ALLOWED_PHOTO_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export function isGingrHostedPhotoUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return isAllowedGingrPhotoHost(parsed.hostname);
  } catch {
    return false;
  }
}

/** True when the URL points at a Gingr CDN that no longer serves images. */
export function isLegacyGingrPhotoUrl(url: string | null | undefined) {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  try {
    const host = new URL(trimmed).hostname.trim().toLowerCase();
    return LEGACY_PHOTO_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
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

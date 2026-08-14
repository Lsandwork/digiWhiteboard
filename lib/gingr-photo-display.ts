import { normalizePhotoUrl } from "@/lib/board-utils";

const ALLOWED_PHOTO_HOST_SUFFIXES = [
  ".gingrapp.com",
  ".amazonaws.com",
  ".cloudfront.net"
];

const ALLOWED_PHOTO_HOSTS = new Set(["gingrapp.com", "cdn.gingrapp.com"]);

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

/** Same-origin board photo URL so TVs/Safari can render Gingr pictures. */
export function toDisplayPhotoUrl(photoUrl?: string | null, animalId?: string | null) {
  const id = animalId?.trim() || "";
  const incoming = photoUrl?.trim() || "";
  if (incoming.startsWith("/api/") || incoming.startsWith("/assets/")) return incoming;

  const normalized = incoming ? normalizePhotoUrl(incoming) : "";
  if (normalized.startsWith("data:") || normalized.startsWith("blob:")) return null;

  if (id) {
    const params = new URLSearchParams({ animalId: id });
    if (normalized && isGingrHostedPhotoUrl(normalized)) params.set("src", normalized);
    return `/api/gingr/animal-photo/image?${params.toString()}`;
  }

  if (normalized && isGingrHostedPhotoUrl(normalized)) {
    return `/api/gingr/animal-photo/image?src=${encodeURIComponent(normalized)}`;
  }

  return normalized || null;
}

import type { LiveDog } from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

const photoKeys = [
  "image",
  "image_url",
  "photo",
  "photo_url",
  "profile_photo",
  "profile_photo_url",
  "profile_pic",
  "profile_pic_url",
  "profile_image",
  "profile_image_url",
  "avatar",
  "avatar_url",
  "profileImage",
  "gingr_photo",
  "gingr_photo_url",
  "pet_image",
  "pet_photo",
  "animal_image",
  "animal_photo",
  "a_image",
  "a_photo",
  "file",
  "upload",
  "camera",
  "thumb",
  "thumbnail_path",
  "img",
  "picture",
  "picture_url",
  "pic",
  "pic_url",
  "thumbnail",
  "thumbnail_url",
  "profile_picture",
  "profile_picture_url",
  "icon",
  "icon_url"
] as const;

/**
 * Gingr's retired Rackspace CDN. Animal records created before the Google Cloud
 * Storage migration still carry these URLs and they now return 404, so they must
 * never win over a live URL stored in another field.
 */
const LEGACY_PHOTO_HOST_SUFFIXES = [".rackcdn.com"];

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

function firstString(source: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

export function gingrPublicOrigin() {
  const subdomain = process.env.GINGR_SUBDOMAIN ?? "fitdog";
  return `https://${subdomain}.gingrapp.com`;
}

export function normalizePhotoUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;

  const origin = gingrPublicOrigin();
  if (trimmed.startsWith("/")) return `${origin}${trimmed}`;

  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    if (
      trimmed.startsWith("uploads/") ||
      trimmed.startsWith("files/") ||
      trimmed.startsWith("img/") ||
      trimmed.startsWith("images/")
    ) {
      return `${origin}/${trimmed}`;
    }
    if (/\.(jpe?g|png|gif|webp|avif|bmp)(\?.*)?$/i.test(trimmed) && !trimmed.includes("/")) {
      return `${origin}/uploads/${trimmed}`;
    }
  }

  return trimmed;
}

/** Every photo URL a Gingr record exposes, in key order and deduped. */
export function extractPhotoUrls(...sources: UnknownRecord[]) {
  const urls: string[] = [];
  const add = (value: string | null) => {
    if (!value) return;
    const normalized = normalizePhotoUrl(value);
    if (normalized && !urls.includes(normalized)) urls.push(normalized);
  };

  for (const source of sources) {
    for (const key of photoKeys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) {
        add(value.trim());
        continue;
      }

      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nested = value as UnknownRecord;
        add(firstString(nested, ["url", "href", "src", "path", "link", "original", "large", "medium", "small"]));
      }
    }
  }

  return urls;
}

export function extractPhotoUrl(...sources: UnknownRecord[]) {
  const urls = extractPhotoUrls(...sources);
  if (!urls.length) return null;
  // A dead Rackspace link in `image` must not shadow a live URL in another field.
  return urls.find((url) => !isLegacyGingrPhotoUrl(url)) ?? urls[0];
}

export function resolveDogPhotoUrl(dog: LiveDog) {
  if (dog.photo_url) return dog.photo_url;

  const payload = dog.raw_payload as UnknownRecord | null | undefined;
  if (!payload) return null;

  const data = (payload.entity_data ?? {}) as UnknownRecord;
  const record = (payload.record ?? {}) as UnknownRecord;
  const animal = typeof data.animal === "object" && data.animal ? (data.animal as UnknownRecord) : {};
  const reservation = typeof data.reservation === "object" && data.reservation ? (data.reservation as UnknownRecord) : {};

  return extractPhotoUrl(animal, reservation, data, record, payload);
}

export function formatBoardTime(value: string | null | undefined) {
  if (!value) return "--";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function formatBoardDateTime(date: Date) {
  return {
    time: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date),
    date: new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    })
      .format(date)
      .toUpperCase()
  };
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function includesAny(value: string, terms: string[]) {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

export function getDogStatusLabel(dog: LiveDog, mode: "in" | "out") {
  const room = dog.room?.trim() ?? "";

  if (mode === "in") {
    if (!room) return "Arriving Now";
    if (includesAny(room, ["parking", "lot", "arriv"])) return "Arriving Now";
    if (includesAny(room, ["front desk", "desk"])) return "At Front Desk";
    if (includesAny(room, ["lobby"])) return "Lobby";
    return titleCase(room);
  }

  if (!room) return "Ready for Pickup";
  if (includesAny(room, ["front desk", "desk"])) return "At Front Desk";
  if (includesAny(room, ["lobby"])) return "Lobby";
  if (includesAny(room, ["pickup", "ready"])) return "Ready for Pickup";
  return titleCase(room);
}

export function getDogLocationLabel(dog: LiveDog) {
  if (dog.room?.trim()) return dog.room.trim();
  return null;
}

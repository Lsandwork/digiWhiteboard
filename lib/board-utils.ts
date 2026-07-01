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

function firstString(source: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

export function normalizePhotoUrl(url: string) {
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) {
    const subdomain = process.env.GINGR_SUBDOMAIN ?? "fitdog";
    return `https://${subdomain}.gingrapp.com${url}`;
  }
  return url;
}

export function extractPhotoUrl(...sources: UnknownRecord[]) {
  for (const source of sources) {
    for (const key of photoKeys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) {
        return normalizePhotoUrl(value.trim());
      }

      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nested = value as UnknownRecord;
        const nestedUrl = firstString(nested, ["url", "href", "src", "path", "link", "original", "large", "medium", "small"]);
        if (nestedUrl) return normalizePhotoUrl(nestedUrl);
      }
    }
  }

  return null;
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

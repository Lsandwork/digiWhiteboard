import { unwrapGingrData } from "@/lib/integrations/gingr/client";

export type GingrCustomAnimalIcon = {
  id: string | null;
  animalId: string | null;
  title: string;
  comment: string | null;
  className: string | null;
  checkinAlert: boolean;
  isDeleted: boolean;
};

export type FighterRotationIcon = {
  animalId: string;
  title: string;
  comment: string;
  iconId: string | null;
};

type CachedIcons = {
  icons: GingrCustomAnimalIcon[];
  cachedAt: number;
};

const CACHE_TTL_MS = 30 * 60 * 1000;
const iconCache = new Map<string, CachedIcons>();

function getGingrConfig() {
  return {
    subdomain: process.env.GINGR_SUBDOMAIN?.trim() || "fitdog",
    apiKey: process.env.GINGR_API_KEY?.trim() || ""
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function readBool(value: unknown) {
  const token = String(value ?? "").trim().toLowerCase();
  return token === "1" || token === "true" || token === "yes";
}

function normalizeIcon(raw: unknown): GingrCustomAnimalIcon | null {
  const row = asRecord(raw);
  if (!row) return null;
  const title = readString(row.title) ?? readString(row.name) ?? "";
  if (!title) return null;
  return {
    id: readString(row.id),
    animalId: readString(row.animal_id) ?? readString(row.a_id),
    title,
    comment: readString(row.comment),
    className: readString(row.class) ?? readString(row.className),
    checkinAlert: readBool(row.checkin_alert),
    isDeleted: readBool(row.is_deleted)
  };
}

function collectIconsFromOwnerPayload(payload: unknown, animalId: string): GingrCustomAnimalIcon[] {
  const data = asRecord(unwrapGingrData(payload)) ?? asRecord(payload);
  if (!data) return [];

  const animals = Array.isArray(data.animals) ? data.animals : [];
  const icons: GingrCustomAnimalIcon[] = [];

  for (const animal of animals) {
    const row = asRecord(animal);
    if (!row) continue;
    const id = readString(row.a_id) ?? readString(row.system_id) ?? readString(row.id);
    if (id && id !== animalId) continue;
    const formData = asRecord(row.form_data);
    const rawIcons = formData?.custom_animal_icons ?? row.custom_animal_icons;
    if (!Array.isArray(rawIcons)) continue;
    for (const icon of rawIcons) {
      const normalized = normalizeIcon(icon);
      if (!normalized || normalized.isDeleted) continue;
      icons.push({ ...normalized, animalId: normalized.animalId ?? animalId });
    }
  }

  if (icons.length) return icons;

  // Fallback: walk payload for custom_animal_icons arrays matching this animal.
  const found: GingrCustomAnimalIcon[] = [];
  const walk = (value: unknown, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 8) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.custom_animal_icons)) {
      for (const icon of record.custom_animal_icons) {
        const normalized = normalizeIcon(icon);
        if (!normalized || normalized.isDeleted) continue;
        if (normalized.animalId && normalized.animalId !== animalId) continue;
        found.push({ ...normalized, animalId: normalized.animalId ?? animalId });
      }
    }
    for (const nested of Object.values(record)) walk(nested, depth + 1);
  };
  walk(data);
  return found;
}

export function isFighterRotationIcon(icon: Pick<GingrCustomAnimalIcon, "title" | "className">) {
  const title = icon.title.toLowerCase();
  const className = (icon.className ?? "").toLowerCase();
  if (title.includes("fighter") || title.includes("rotation")) return true;
  return className.includes("fighter-jet") || className.includes("fighter");
}

export function pickFighterRotationIcon(
  icons: GingrCustomAnimalIcon[],
  animalId?: string | null
): FighterRotationIcon | null {
  const match = icons.find((icon) => {
    if (!isFighterRotationIcon(icon)) return false;
    if (animalId && icon.animalId && icon.animalId !== animalId) return false;
    return Boolean((icon.comment ?? "").trim());
  });
  if (!match) return null;
  return {
    animalId: match.animalId ?? animalId ?? "",
    title: match.title,
    comment: String(match.comment ?? "").trim(),
    iconId: match.id
  };
}

export function invalidateGingrCustomAnimalIconsCache(animalId?: string | null) {
  if (!animalId) {
    iconCache.clear();
    return;
  }
  iconCache.delete(String(animalId));
}

/** Owner API carries per-animal custom icons under animals[].form_data.custom_animal_icons. */
export async function fetchGingrCustomAnimalIcons(animalId: string): Promise<GingrCustomAnimalIcon[]> {
  const id = String(animalId ?? "").trim();
  if (!id) return [];

  const cached = iconCache.get(id);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.icons;
  }

  const { subdomain, apiKey } = getGingrConfig();
  if (!apiKey) return [];

  const url = new URL(`https://${subdomain}.gingrapp.com/api/v1/owner`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("animal_id", id);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Gingr owner icons ${response.status}`);
  }
  const payload = await response.json();
  const icons = collectIconsFromOwnerPayload(payload, id);
  iconCache.set(id, { icons, cachedAt: Date.now() });
  return icons;
}

export async function fetchFighterRotationIcon(animalId: string): Promise<FighterRotationIcon | null> {
  const icons = await fetchGingrCustomAnimalIcons(animalId);
  return pickFighterRotationIcon(icons, animalId);
}

export type CheckedInGingrDog = {
  animalId: string;
  dogName: string;
  ownerName: string | null;
  reservationId: string | null;
  reservationType?: string | null;
  photoUrl?: string | null;
  checkedInAt?: string | null;
};

/** Currently checked-in dogs from Gingr reservations (facility presence). */
const CHECKED_IN_CACHE_TTL_MS = 45_000;
let checkedInCache: { dogs: CheckedInGingrDog[]; cachedAt: number } | null = null;

export function invalidateCurrentlyCheckedInDogsCache() {
  checkedInCache = null;
}

export async function fetchCurrentlyCheckedInDogs(options?: {
  force?: boolean;
}): Promise<CheckedInGingrDog[]> {
  if (
    !options?.force &&
    checkedInCache &&
    Date.now() - checkedInCache.cachedAt < CHECKED_IN_CACHE_TTL_MS
  ) {
    return checkedInCache.dogs;
  }

  const { subdomain, apiKey } = getGingrConfig();
  if (!apiKey) return [];

  const locationId = process.env.GINGR_LOCATION_ID?.trim() || "1";
  const today = new Date().toISOString().slice(0, 10);
  const response = await fetch(`https://${subdomain}.gingrapp.com/api/v1/reservations`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
    },
    body: new URLSearchParams({
      key: apiKey,
      checked_in: "true",
      location_id: locationId,
      // disregarded when checked_in=true, but some tenants still validate presence
      start_date: today,
      end_date: today
    }),
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Gingr checked-in reservations ${response.status}`);
  }

  const payload = await response.json();
  const data = unwrapGingrData(payload);
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? Object.values(data as Record<string, unknown>)
      : [];

  const dogs: CheckedInGingrDog[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const animal = asRecord(record.animal);
    const owner = asRecord(record.owner);
    const reservationType =
      asRecord(record.type) ??
      asRecord(record.reservation_type) ??
      null;
    const animalId = readString(animal?.id) ?? readString(record.animal_id) ?? readString(record.a_id);
    const dogName =
      readString(animal?.name) ??
      readString(animal?.first_name) ??
      readString(record.a_first) ??
      readString(record.animal_name);
    if (!animalId || !dogName) continue;
    if (seen.has(animalId)) continue;
    seen.add(animalId);
    const ownerFirst = readString(owner?.first_name) ?? readString(owner?.o_first);
    const ownerLast = readString(owner?.last_name) ?? readString(owner?.o_last);
    const ownerName = [ownerFirst, ownerLast].filter(Boolean).join(" ") || null;
    const photoUrl =
      readString(animal?.image) ??
      readString(animal?.image_url) ??
      readString(animal?.photo_url) ??
      readString(record.a_image) ??
      readString(record.photo_url) ??
      readString(record.image_url);
    dogs.push({
      animalId,
      dogName,
      ownerName,
      reservationId: readString(record.reservation_id) ?? readString(record.id),
      reservationType:
        readString(reservationType?.name) ??
        readString(record.type_name) ??
        (typeof record.type === "string" ? readString(record.type) : null) ??
        (typeof record.reservation_type === "string" ? readString(record.reservation_type) : null),
      photoUrl,
      checkedInAt:
        readString(record.check_in_stamp) ??
        readString(record.check_in_date) ??
        readString(record.checked_in_at)
    });
  }
  checkedInCache = { dogs, cachedAt: Date.now() };
  return dogs;
}

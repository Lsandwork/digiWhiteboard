import { extractPhotoUrl } from "@/lib/board-utils";
import {
  ANIMAL_PHOTO_COOLDOWN_MS,
  canFetchAnimalPhoto,
  canCallGingrEndpoint,
  isGingrPhotoFetchEnabled,
  markAnimalPhotoFetch,
  markGingrEndpointCalled
} from "@/lib/gingr-request-guard";

type UnknownRecord = Record<string, unknown>;

type CachedPhoto = {
  photoUrl: string | null;
  cachedAt: number;
};

const animalPhotoCache = new Map<string, CachedPhoto>();

function getGingrConfig() {
  return {
    subdomain: process.env.GINGR_SUBDOMAIN ?? "fitdog",
    apiKey: process.env.GINGR_API_KEY
  };
}

function gingrUrl(subdomain: string, path: string, params: Record<string, string>) {
  const url = new URL(`https://${subdomain}.gingrapp.com${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function readPhotoFromAnimalBody(body: unknown) {
  if (!body || typeof body !== "object") return null;

  const data = (body as { data?: unknown }).data;
  const records = Array.isArray(data) ? data : data ? [data] : [body];

  for (const record of records) {
    if (record && typeof record === "object") {
      const photoUrl = extractPhotoUrl(record as UnknownRecord);
      if (photoUrl) return photoUrl;
    }
  }

  return null;
}

function isCacheFresh(cached: CachedPhoto, now = Date.now()) {
  return now - cached.cachedAt <= ANIMAL_PHOTO_COOLDOWN_MS;
}

export function getCachedGingrAnimalPhotoUrl(animalId: string) {
  const trimmedAnimalId = animalId.trim();
  if (!trimmedAnimalId) return undefined;

  const cached = animalPhotoCache.get(trimmedAnimalId);
  if (!cached) return undefined;
  if (!isCacheFresh(cached)) {
    animalPhotoCache.delete(trimmedAnimalId);
    return undefined;
  }

  return cached.photoUrl;
}

function rememberAnimalPhoto(animalId: string, photoUrl: string | null) {
  animalPhotoCache.set(animalId, { photoUrl, cachedAt: Date.now() });
}

export async function getGingrAnimalPhotoUrl(animalId: string, timeoutMs = 4000) {
  const trimmedAnimalId = animalId.trim();
  if (!trimmedAnimalId) return null;

  const cached = getCachedGingrAnimalPhotoUrl(trimmedAnimalId);
  if (cached !== undefined) return cached;

  if (!isGingrPhotoFetchEnabled()) {
    rememberAnimalPhoto(trimmedAnimalId, null);
    return null;
  }

  if (!canFetchAnimalPhoto(trimmedAnimalId) || !canCallGingrEndpoint("animal_photo")) {
    return null;
  }

  const { subdomain, apiKey } = getGingrConfig();
  if (!apiKey) {
    rememberAnimalPhoto(trimmedAnimalId, null);
    return null;
  }

  markAnimalPhotoFetch(trimmedAnimalId);
  markGingrEndpointCalled("animal_photo");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(gingrUrl(subdomain, `/api/v1/animals/${encodeURIComponent(trimmedAnimalId)}`, { key: apiKey }), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      rememberAnimalPhoto(trimmedAnimalId, null);
      return null;
    }

    const body = (await response.json()) as unknown;
    const photoUrl = readPhotoFromAnimalBody(body);
    rememberAnimalPhoto(trimmedAnimalId, photoUrl);
    return photoUrl;
  } catch {
    rememberAnimalPhoto(trimmedAnimalId, null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

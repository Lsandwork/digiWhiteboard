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

const ANIMAL_PHOTO_MISS_COOLDOWN_MS = 5 * 60 * 1000;
const GLOBAL_MIN_INTERVAL_MS = Number(process.env.GINGR_GLOBAL_MIN_INTERVAL_MS ?? 2000);

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPhotoFromGingrData(data: unknown, animalId?: string) {
  if (!data) return null;

  const targetId = animalId?.trim();
  const records = Array.isArray(data) ? data : [data];

  for (const record of records) {
    if (!record || typeof record !== "object") continue;

    const rec = record as UnknownRecord;
    const nestedAnimal =
      rec.animal && typeof rec.animal === "object" && !Array.isArray(rec.animal)
        ? (rec.animal as UnknownRecord)
        : null;
    const animals = Array.isArray(rec.animals) ? rec.animals : null;

    const candidates: UnknownRecord[] = [rec];
    if (nestedAnimal) candidates.push(nestedAnimal);
    if (animals) {
      for (const animal of animals) {
        if (animal && typeof animal === "object") {
          candidates.push(animal as UnknownRecord);
        }
      }
    }

    for (const candidate of candidates) {
      if (targetId) {
        const candidateId = String(candidate.id ?? candidate.system_id ?? candidate.animal_id ?? "").trim();
        if (candidateId && candidateId !== targetId) continue;
      }

      const photoUrl = extractPhotoUrl(candidate);
      if (photoUrl) return photoUrl;
    }
  }

  return null;
}

function unwrapGingrBody(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const wrapped = body as { success?: boolean; error?: unknown; data?: unknown };
  if ("data" in wrapped) {
    if (wrapped.error) return null;
    return wrapped.data ?? null;
  }
  return body;
}

function readPhotoFromAnimalBody(body: unknown, animalId?: string) {
  const data = unwrapGingrBody(body);
  return readPhotoFromGingrData(data, animalId);
}

async function postGingrAnimals(
  subdomain: string,
  apiKey: string,
  animalId: string,
  idField: "id" | "system_id",
  signal: AbortSignal
) {
  const animalsPostUrl = `https://${subdomain}.gingrapp.com/api/v1/animals`;
  const body = new URLSearchParams();
  body.set("key", apiKey);
  body.set(`params[${idField}]`, animalId);
  return fetchGingrJson(
    animalsPostUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body
    },
    signal
  );
}

async function fetchGingrJson(url: string, init: RequestInit, signal: AbortSignal) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {})
    },
    cache: "no-store",
    signal
  });

  if (!response.ok) return null;
  const body = (await response.json()) as unknown;
  return unwrapGingrBody(body);
}

async function fetchGingrAnimalRecords(
  animalId: string,
  subdomain: string,
  apiKey: string,
  signal: AbortSignal
) {
  let data = await postGingrAnimals(subdomain, apiKey, animalId, "id", signal);
  if (data) return data;

  data = await postGingrAnimals(subdomain, apiKey, animalId, "system_id", signal);
  if (data) return data;

  const ownerUrl = gingrUrl(subdomain, "/api/v1/owner", {
    key: apiKey,
    animal_id: animalId
  });
  data = await fetchGingrJson(ownerUrl, { method: "GET" }, signal);
  if (data) return data;

  const animalsGetUrl = gingrUrl(subdomain, "/api/v1/animals", {
    key: apiKey,
    "params[id]": animalId
  });
  return fetchGingrJson(animalsGetUrl, { method: "GET" }, signal);
}

function isCacheFresh(cached: CachedPhoto, now = Date.now()) {
  const ttl = cached.photoUrl ? ANIMAL_PHOTO_COOLDOWN_MS : ANIMAL_PHOTO_MISS_COOLDOWN_MS;
  return now - cached.cachedAt <= ttl;
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

type GingrAnimalPhotoOptions = {
  bypassFetchGate?: boolean;
};

async function waitForGingrAnimalPhotoSlot() {
  while (!canCallGingrEndpoint("animal_photo")) {
    await sleep(250);
  }
}

export async function getGingrAnimalPhotoUrl(
  animalId: string,
  timeoutMs = 4000,
  options?: GingrAnimalPhotoOptions
) {
  const trimmedAnimalId = animalId.trim();
  if (!trimmedAnimalId) return null;

  const cached = getCachedGingrAnimalPhotoUrl(trimmedAnimalId);
  if (cached !== undefined) return cached;

  if (!options?.bypassFetchGate && !isGingrPhotoFetchEnabled()) {
    return null;
  }

  if (!canFetchAnimalPhoto(trimmedAnimalId, Date.now(), options)) {
    return null;
  }

  await waitForGingrAnimalPhotoSlot();

  const { subdomain, apiKey } = getGingrConfig();
  if (!apiKey) {
    rememberAnimalPhoto(trimmedAnimalId, null);
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    markGingrEndpointCalled("animal_photo");
    const data = await fetchGingrAnimalRecords(trimmedAnimalId, subdomain, apiKey, controller.signal);
    const photoUrl = readPhotoFromGingrData(data, trimmedAnimalId);
    rememberAnimalPhoto(trimmedAnimalId, photoUrl);
    if (!options?.bypassFetchGate) {
      markAnimalPhotoFetch(trimmedAnimalId);
    }
    return photoUrl;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function extractGingrAnimalPhotoFromData(data: unknown, animalId?: string) {
  return readPhotoFromGingrData(data, animalId);
}

export async function getGingrAnimalPhotoUrlMap(
  animalIds: Array<string | null | undefined>,
  options?: GingrAnimalPhotoOptions & { timeoutMs?: number }
) {
  const map = new Map<string, string | null>();
  const uniqueIds = [...new Set(animalIds.map((id) => id?.trim()).filter(Boolean) as string[])];

  for (let index = 0; index < uniqueIds.length; index += 1) {
    const animalId = uniqueIds[index];
    const cached = getCachedGingrAnimalPhotoUrl(animalId);
    if (cached !== undefined) {
      map.set(animalId, cached);
      continue;
    }

    const photoUrl = await getGingrAnimalPhotoUrl(animalId, options?.timeoutMs ?? 4000, options);
    map.set(animalId, photoUrl);

    if (index < uniqueIds.length - 1) {
      await sleep(GLOBAL_MIN_INTERVAL_MS);
    }
  }

  return map;
}

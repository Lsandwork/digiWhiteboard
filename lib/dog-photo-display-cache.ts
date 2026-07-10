import type { LiveDog } from "@/lib/types";
import { safeMediaUrl } from "@/lib/safe-url";

const photoByKey = new Map<string, string>();
const loadedKeys = new Set<string>();

export function getStableDogPhotoKey(dog: Pick<LiveDog, "id" | "gingr_reservation_id" | "gingr_animal_id">) {
  if (dog.gingr_reservation_id) return `res:${dog.gingr_reservation_id}`;
  if (dog.gingr_animal_id) return `animal:${dog.gingr_animal_id}`;
  return `id:${dog.id}`;
}

export function rememberStableDogPhoto(key: string, photoUrl: string | null | undefined) {
  const trimmed = photoUrl?.trim();
  if (!trimmed) return;
  photoByKey.set(key, trimmed);
}

export function getRememberedDogPhoto(key: string) {
  return photoByKey.get(key) ?? null;
}

export function markDogPhotoLoaded(key: string) {
  loadedKeys.add(key);
}

export function hasLoadedDogPhoto(key: string) {
  return loadedKeys.has(key);
}

export function resolveStableDogPhotoUrl(
  dog: LiveDog,
  resolvePhotoUrl: (dog: LiveDog) => string | null
) {
  const key = getStableDogPhotoKey(dog);
  const resolved = dog.photo_url?.trim() || resolvePhotoUrl(dog)?.trim() || null;
  if (resolved) {
    rememberStableDogPhoto(key, resolved);
    return resolved;
  }
  return getRememberedDogPhoto(key);
}

export function buildCastOptimizedDogPhotoUrl(photoUrl: string, width = 384, quality = 68) {
  const trimmed = photoUrl.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("/_next/image")) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;

  const safeRemote = safeMediaUrl(trimmed, "");
  if (!safeRemote) return "";

  return `/_next/image?url=${encodeURIComponent(safeRemote)}&w=${width}&q=${quality}`;
}

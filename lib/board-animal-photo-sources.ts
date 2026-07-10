import { extractPhotoUrl } from "@/lib/board-utils";
import { getCachedBackOfHouseBoard } from "@/lib/gingr-request-guard";

/** Resolve animal profile photos from the in-memory Gingr back-of-house cache (no extra API calls). */
export function getAnimalPhotosFromCachedBackOfHouse(animalIds: Array<string | null | undefined>) {
  const wanted = new Set(animalIds.map((id) => id?.trim()).filter(Boolean) as string[]);
  const photoMap = new Map<string, string>();
  if (!wanted.size) return photoMap;

  const cached = getCachedBackOfHouseBoard(Date.now(), true);
  if (!cached) return photoMap;

  for (const record of [...cached.checking_in, ...cached.checking_out]) {
    const animalId = record.animal_id != null ? String(record.animal_id).trim() : "";
    if (!animalId || !wanted.has(animalId) || photoMap.has(animalId)) continue;

    const photoUrl = extractPhotoUrl(record as Record<string, unknown>);
    if (photoUrl) photoMap.set(animalId, photoUrl);
  }

  return photoMap;
}

export function applyCachedBackOfHousePhotos<T extends { gingr_animal_id: string | null; photo_url: string | null }>(
  dogs: T[]
) {
  const photoMap = getAnimalPhotosFromCachedBackOfHouse(dogs.map((dog) => dog.gingr_animal_id));
  if (!photoMap.size) return dogs;

  return dogs.map((dog) => {
    if (dog.photo_url?.trim() || !dog.gingr_animal_id) return dog;
    const cachedPhoto = photoMap.get(dog.gingr_animal_id.trim());
    return cachedPhoto ? { ...dog, photo_url: cachedPhoto } : dog;
  });
}

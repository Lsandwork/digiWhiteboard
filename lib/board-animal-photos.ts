import { applyStoredAnimalPhotos, loadStoredAnimalPhotoUrl, persistAnimalPhotoUrl } from "@/lib/animal-photo-store";
import { applyCachedBackOfHousePhotos } from "@/lib/board-animal-photo-sources";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import { getGingrAnimalPhotoUrlMap } from "@/lib/gingr-animal-photo";
import type { LiveDog } from "@/lib/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

/** Staff board only: resolve Gingr profile photos for visible dogs on /api/live-board. */
export async function enrichStaffBoardAnimalPhotos(supabase: SupabaseClient, dogs: LiveDog[]) {
  if (!dogs.length) return dogs;

  const withPayloadPhotos = dogs.map((dog) => ({
    ...dog,
    photo_url: dog.photo_url ?? resolveDogPhotoUrl(dog)
  }));

  const withStoredPhotos = await applyStoredAnimalPhotos(supabase, withPayloadPhotos);
  const withCachedBackOfHousePhotos = applyCachedBackOfHousePhotos(withStoredPhotos);

  const stillMissingAnimalIds = [
    ...new Set(
      withCachedBackOfHousePhotos
        .filter((dog) => !dog.photo_url && dog.gingr_animal_id)
        .map((dog) => dog.gingr_animal_id as string)
    )
  ];

  if (!stillMissingAnimalIds.length) {
    return withCachedBackOfHousePhotos;
  }

  const photoMap = await getGingrAnimalPhotoUrlMap(stillMissingAnimalIds, {
    timeoutMs: 3000
  });

  const enriched = await Promise.all(
    withCachedBackOfHousePhotos.map(async (dog) => {
      if (dog.photo_url) return dog;

      const apiPhoto = dog.gingr_animal_id ? photoMap.get(dog.gingr_animal_id) : null;
      if (apiPhoto) {
        return { ...dog, photo_url: apiPhoto };
      }

      if (dog.gingr_animal_id) {
        const storedPhoto = await loadStoredAnimalPhotoUrl(supabase, dog.gingr_animal_id);
        if (storedPhoto) {
          return { ...dog, photo_url: storedPhoto };
        }
      }

      return dog;
    })
  );

  return enriched;
}

/** Background fill so the next TV/lobby poll already has Gingr photos stored. */
export async function fillAndPersistMissingAnimalPhotos(
  supabase: SupabaseClient,
  animalIds: Array<string | null | undefined>
) {
  const missing = [...new Set(animalIds.map((id) => id?.trim()).filter(Boolean) as string[])];
  if (!missing.length) return 0;

  const photoMap = await getGingrAnimalPhotoUrlMap(missing, { timeoutMs: 4000 });
  let saved = 0;
  for (const [animalId, photoUrl] of photoMap) {
    if (!photoUrl) continue;
    try {
      await persistAnimalPhotoUrl(supabase, animalId, photoUrl);
      saved += 1;
    } catch {
      // Persistence is best-effort — boards can still proxy the live Gingr photo.
    }
  }
  return saved;
}

export function collectMissingPhotoAnimalIds(
  dogs: Array<{ gingr_animal_id?: string | null; photo_url?: string | null; dog_photo_url?: string | null }>
) {
  return dogs
    .filter((dog) => !(dog.photo_url?.trim() || dog.dog_photo_url?.trim()) && dog.gingr_animal_id?.trim())
    .map((dog) => dog.gingr_animal_id as string);
}

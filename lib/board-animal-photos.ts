import { applyStoredAnimalPhotos, loadStoredAnimalPhotoUrl } from "@/lib/animal-photo-store";
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

  return Promise.all(
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
}

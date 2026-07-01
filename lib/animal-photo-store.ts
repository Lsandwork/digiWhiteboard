import type { LiveDog } from "@/lib/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

type StoredAnimalPhoto = {
  gingr_animal_id: string | null;
  photo_url: string | null;
};

export async function loadStoredAnimalPhotoMap(supabase: SupabaseClient, animalIds: Array<string | null | undefined>) {
  const uniqueIds = [...new Set(animalIds.map((id) => id?.trim()).filter(Boolean) as string[])];
  if (!uniqueIds.length) return new Map<string, string>();

  const { data, error } = await supabase
    .from("live_transition_dogs")
    .select("gingr_animal_id, photo_url, updated_at")
    .in("gingr_animal_id", uniqueIds)
    .not("photo_url", "is", null)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const photoMap = new Map<string, string>();
  for (const row of (data ?? []) as StoredAnimalPhoto[]) {
    const animalId = row.gingr_animal_id?.trim();
    const photoUrl = row.photo_url?.trim();
    if (animalId && photoUrl && !photoMap.has(animalId)) {
      photoMap.set(animalId, photoUrl);
    }
  }

  return photoMap;
}

export async function loadStoredAnimalPhotoUrl(supabase: SupabaseClient, animalId: string) {
  const photoMap = await loadStoredAnimalPhotoMap(supabase, [animalId]);
  return photoMap.get(animalId.trim()) ?? null;
}

export async function applyStoredAnimalPhotos(supabase: SupabaseClient, dogs: LiveDog[]) {
  const photoMap = await loadStoredAnimalPhotoMap(
    supabase,
    dogs.map((dog) => dog.gingr_animal_id)
  );

  if (!photoMap.size) return dogs;

  return dogs.map((dog) => {
    if (dog.photo_url || !dog.gingr_animal_id) return dog;
    const storedPhotoUrl = photoMap.get(dog.gingr_animal_id);
    return storedPhotoUrl ? { ...dog, photo_url: storedPhotoUrl } : dog;
  });
}

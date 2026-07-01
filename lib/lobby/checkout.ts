import { applyStoredAnimalPhotos } from "@/lib/animal-photo-store";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import { shouldExpireCheckoutDog } from "@/lib/checkout-display";
import { isPromptedCheckoutDog } from "@/lib/checkout-prompt";
import { fetchGingrBackOfHouse, mapGingrBoardToLiveDogs } from "@/lib/gingr-board-sync";
import { extractLobbyBreed, getLobbyCheckoutStatus, getLobbyPromptedAt } from "@/lib/lobby/status-label";
import type { LobbyCheckoutDog } from "@/lib/lobby/types";
import type { LiveDog } from "@/lib/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

function enrichDogPhotos(dogs: LiveDog[]) {
  return dogs.map((dog) => ({
    ...dog,
    photo_url: resolveDogPhotoUrl(dog)
  }));
}

function mergeCheckoutDogs(primary: LiveDog[], secondary: LiveDog[]) {
  const dogsByKey = new Map<string, LiveDog>();

  for (const dog of [...primary, ...secondary]) {
    const key = dog.gingr_reservation_id ?? dog.gingr_animal_id ?? dog.id;
    if (!dogsByKey.has(key)) dogsByKey.set(key, dog);
  }

  return [...dogsByKey.values()];
}

async function loadSupabasePromptedCheckoutDogs(supabase: SupabaseClient, now: Date) {
  const { data, error } = await supabase
    .from("live_transition_dogs")
    .select("*")
    .eq("hidden", false)
    .eq("display_status", "checking_out")
    .order("status_started_at", { ascending: true });

  if (error) throw error;

  return enrichDogPhotos((data ?? []) as LiveDog[])
    .filter(isPromptedCheckoutDog)
    .filter((dog) => !shouldExpireCheckoutDog(dog, now));
}

async function loadGingrCheckoutDogs(now: Date) {
  try {
    const gingrBoard = await fetchGingrBackOfHouse();
    if (!gingrBoard || gingrBoard.source === "disabled") return [];

    const mapped = enrichDogPhotos(mapGingrBoardToLiveDogs(gingrBoard));
    return mapped.filter(
      (dog) => dog.display_status === "checking_out" && !shouldExpireCheckoutDog(dog, now)
    );
  } catch {
    return [];
  }
}

function toLobbyCheckoutDog(dog: LiveDog, featured = false): LobbyCheckoutDog {
  return {
    id: dog.id,
    dog_name: dog.animal_name,
    breed: extractLobbyBreed(dog),
    dog_photo_url: resolveDogPhotoUrl(dog),
    checkout_status: getLobbyCheckoutStatus(dog, featured),
    prompted_at: getLobbyPromptedAt(dog),
    estimated_ready_at: dog.display_until,
    display_until: dog.display_until
  };
}

export async function loadLobbyCheckoutDogs(supabase: SupabaseClient, maxQueueCount = 6, now = new Date()) {
  const [gingrDogs, supabaseDogs] = await Promise.all([
    loadGingrCheckoutDogs(now),
    loadSupabasePromptedCheckoutDogs(supabase, now)
  ]);

  const merged = mergeCheckoutDogs(gingrDogs, supabaseDogs);
  const withStoredPhotos = await applyStoredAnimalPhotos(supabase, merged);
  const enriched = enrichDogPhotos(withStoredPhotos);

  const sorted = enriched.sort(
    (a, b) =>
      new Date(getLobbyPromptedAt(b) ?? b.updated_at).getTime() -
      new Date(getLobbyPromptedAt(a) ?? a.updated_at).getTime()
  );

  const featuredDog = sorted[0] ?? null;
  const queueDogs = sorted.slice(1, maxQueueCount + 1);

  return {
    featured: featuredDog ? toLobbyCheckoutDog(featuredDog, true) : null,
    queue: queueDogs.map((dog) => toLobbyCheckoutDog(dog, false)),
    activeCount: sorted.length,
    lastPromptedAt: featuredDog ? getLobbyPromptedAt(featuredDog) : sorted[0] ? getLobbyPromptedAt(sorted[0]) : null
  };
}

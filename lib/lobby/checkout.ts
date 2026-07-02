import { toIsoTimestamp } from "@/lib/board-dog";
import {
  mergeCheckoutDogs,
  reconcileGingrSourcedCheckouts
} from "@/lib/board-checkout-merge";
import { applyStoredAnimalPhotos } from "@/lib/animal-photo-store";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import { getGingrAnimalPhotoUrl } from "@/lib/gingr-animal-photo";
import {
  getLobbyCheckoutDisplayUntilIso,
  shouldExpireLobbyCheckoutDog
} from "@/lib/lobby/checkout-display";
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

async function enrichLobbyGingrAnimalPhotos(dogs: LiveDog[]) {
  const enriched = await Promise.all(
    dogs.map(async (dog) => {
      if (dog.photo_url || !dog.gingr_animal_id) return dog;

      const photoUrl = await getGingrAnimalPhotoUrl(dog.gingr_animal_id, 4000, { bypassFetchGate: true });
      return photoUrl ? { ...dog, photo_url: photoUrl } : dog;
    })
  );

  return enrichDogPhotos(enriched);
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
    .filter((dog) => !shouldExpireLobbyCheckoutDog(dog, now));
}

async function loadGingrCheckoutDogs(now: Date): Promise<{ dogs: LiveDog[]; gingrLive: boolean }> {
  try {
    const gingrBoard = await fetchGingrBackOfHouse();
    if (!gingrBoard || gingrBoard.source === "disabled") {
      return { dogs: [], gingrLive: false };
    }

    const mapped = enrichDogPhotos(mapGingrBoardToLiveDogs(gingrBoard));
    const dogs = mapped.filter(
      (dog) => dog.display_status === "checking_out" && !shouldExpireLobbyCheckoutDog(dog, now)
    );

    return { dogs, gingrLive: true };
  } catch {
    return { dogs: [], gingrLive: false };
  }
}

function toLobbyCheckoutDog(dog: LiveDog, featured = false): LobbyCheckoutDog {
  const displayUntil = getLobbyCheckoutDisplayUntilIso(dog);

  return {
    id: dog.id,
    gingr_animal_id: dog.gingr_animal_id,
    dog_name: dog.animal_name,
    breed: extractLobbyBreed(dog),
    dog_photo_url: resolveDogPhotoUrl(dog),
    checkout_status: getLobbyCheckoutStatus(dog, featured),
    prompted_at: getLobbyPromptedAt(dog),
    estimated_ready_at: displayUntil,
    display_until: displayUntil
  };
}

function lobbySortTime(dog: LiveDog) {
  const iso = getLobbyPromptedAt(dog) ?? toIsoTimestamp(dog.status_started_at) ?? toIsoTimestamp(dog.updated_at);
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export async function loadLobbyCheckoutDogs(supabase: SupabaseClient, maxQueueCount = 6, now = new Date()) {
  const [{ dogs: gingrDogs, gingrLive }, supabaseDogs] = await Promise.all([
    loadGingrCheckoutDogs(now),
    loadSupabasePromptedCheckoutDogs(supabase, now)
  ]);

  const merged = mergeCheckoutDogs(gingrDogs, supabaseDogs);
  const candidates = gingrLive ? reconcileGingrSourcedCheckouts(merged, gingrDogs) : merged;

  const withStoredPhotos = await applyStoredAnimalPhotos(supabase, candidates);
  const enriched = await enrichLobbyGingrAnimalPhotos(withStoredPhotos);
  const sorted = enriched.sort((a, b) => lobbySortTime(b) - lobbySortTime(a));

  const featuredDog = sorted[0] ?? null;
  const queueDogs = sorted.slice(1, maxQueueCount + 1);

  return {
    featured: featuredDog ? toLobbyCheckoutDog(featuredDog, true) : null,
    queue: queueDogs.map((dog) => toLobbyCheckoutDog(dog, false)),
    activeCount: sorted.length,
    lastPromptedAt: featuredDog ? getLobbyPromptedAt(featuredDog) : sorted[0] ? getLobbyPromptedAt(sorted[0]) : null,
    data_source: gingrLive ? "gingr_and_supabase" : "supabase_live_transition_dogs"
  };
}

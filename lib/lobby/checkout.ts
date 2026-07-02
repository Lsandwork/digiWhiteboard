import { toIsoTimestamp } from "@/lib/board-dog";
import {
  buildGingrCheckoutKeySet,
  isDogInGingrCheckoutBasket,
  mergeCheckoutDogs,
  reconcileGingrSourcedCheckouts
} from "@/lib/board-checkout-merge";
import { applyStoredAnimalPhotos, loadStoredAnimalPhotoUrl } from "@/lib/animal-photo-store";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import { getGingrAnimalPhotoUrlMap } from "@/lib/gingr-animal-photo";
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

/** Keep dogs visible while Gingr still lists them in the live checkout basket. */
export function isVisibleLobbyCheckoutDog(dog: LiveDog, now: Date, gingrCheckoutKeys: Set<string>) {
  if (dog.display_status !== "checking_out") return false;
  if (isDogInGingrCheckoutBasket(dog, gingrCheckoutKeys)) return true;
  return !shouldExpireLobbyCheckoutDog(dog, now);
}

function enrichDogPhotos(dogs: LiveDog[]) {
  return dogs.map((dog) => ({
    ...dog,
    photo_url: resolveDogPhotoUrl(dog)
  }));
}

async function enrichLobbyGingrAnimalPhotos(supabase: SupabaseClient, dogs: LiveDog[]) {
  const withResolvedPayloadPhotos = dogs.map((dog) => ({
    ...dog,
    photo_url: dog.photo_url ?? resolveDogPhotoUrl(dog)
  }));

  const missingAnimalIds = [
    ...new Set(
      withResolvedPayloadPhotos
        .filter((dog) => !dog.photo_url && dog.gingr_animal_id)
        .map((dog) => dog.gingr_animal_id as string)
    )
  ];

  if (!missingAnimalIds.length) {
    return withResolvedPayloadPhotos;
  }

  const photoMap = await getGingrAnimalPhotoUrlMap(missingAnimalIds, { bypassFetchGate: true, timeoutMs: 5000 });

  return Promise.all(
    withResolvedPayloadPhotos.map(async (dog) => {
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

async function loadSupabaseCheckoutDogs(
  supabase: SupabaseClient,
  now: Date,
  options: { promptedOnly: boolean }
) {
  const { data, error } = await supabase
    .from("live_transition_dogs")
    .select("*")
    .eq("hidden", false)
    .eq("display_status", "checking_out")
    .order("status_started_at", { ascending: true });

  if (error) throw error;

  return enrichDogPhotos((data ?? []) as LiveDog[])
    .filter((dog) => (options.promptedOnly ? isPromptedCheckoutDog(dog) : true))
    .filter((dog) => !shouldExpireLobbyCheckoutDog(dog, now));
}

async function loadGingrCheckoutDogs(now: Date): Promise<{ dogs: LiveDog[]; gingrLive: boolean }> {
  try {
    const gingrBoard = await fetchGingrBackOfHouse({ allReservationTypes: true });
    if (!gingrBoard || gingrBoard.source === "disabled") {
      return { dogs: [], gingrLive: false };
    }

    const mapped = enrichDogPhotos(mapGingrBoardToLiveDogs(gingrBoard));
    const gingrCheckoutDogs = mapped.filter((dog) => dog.display_status === "checking_out");
    const gingrCheckoutKeys = buildGingrCheckoutKeySet(gingrCheckoutDogs);
    const dogs = gingrCheckoutDogs.filter((dog) => isVisibleLobbyCheckoutDog(dog, now, gingrCheckoutKeys));

    return { dogs, gingrLive: true };
  } catch {
    return { dogs: [], gingrLive: false };
  }
}

function sortLobbyCheckoutDogs(dogs: LiveDog[]) {
  return [...dogs].sort((a, b) => lobbySortTime(b) - lobbySortTime(a));
}

function toLobbyCheckoutDog(dog: LiveDog, featured = false): LobbyCheckoutDog {
  const displayUntil = getLobbyCheckoutDisplayUntilIso(dog);

  return {
    id: dog.id,
    gingr_animal_id: dog.gingr_animal_id,
    dog_name: dog.animal_name,
    breed: extractLobbyBreed(dog),
    dog_photo_url: dog.photo_url ?? resolveDogPhotoUrl(dog),
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

export async function loadLobbyCheckoutDogs(supabase: SupabaseClient, _maxQueueCount = 6, now = new Date()) {
  const [{ dogs: gingrDogs, gingrLive }, supabasePromptedDogs, supabaseCheckoutDogs] = await Promise.all([
    loadGingrCheckoutDogs(now),
    loadSupabaseCheckoutDogs(supabase, now, { promptedOnly: true }),
    loadSupabaseCheckoutDogs(supabase, now, { promptedOnly: false })
  ]);

  let candidates: LiveDog[];

  if (gingrLive) {
    const gingrCheckoutKeys = buildGingrCheckoutKeySet(gingrDogs);
    const merged = mergeCheckoutDogs(gingrDogs, supabasePromptedDogs);
    candidates = reconcileGingrSourcedCheckouts(merged, gingrDogs).filter((dog) =>
      isVisibleLobbyCheckoutDog(dog, now, gingrCheckoutKeys)
    );
  } else {
    candidates = supabaseCheckoutDogs;
  }

  const withStoredPhotos = await applyStoredAnimalPhotos(supabase, candidates);
  const enriched = await enrichLobbyGingrAnimalPhotos(supabase, withStoredPhotos);
  const sorted = sortLobbyCheckoutDogs(enriched);

  const featuredDog = sorted[0] ?? null;
  const queueDogs = sorted.slice(1);

  return {
    featured: featuredDog ? toLobbyCheckoutDog(featuredDog, true) : null,
    queue: queueDogs.map((dog) => toLobbyCheckoutDog(dog, false)),
    activeCount: sorted.length,
    lastPromptedAt: featuredDog ? getLobbyPromptedAt(featuredDog) : sorted[0] ? getLobbyPromptedAt(sorted[0]) : null,
    data_source: gingrLive ? "gingr_and_supabase" : "supabase_live_transition_dogs"
  };
}

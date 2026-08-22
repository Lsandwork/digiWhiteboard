import { toIsoTimestamp } from "@/lib/board-dog";
import {
  buildGingrCheckoutKeySet,
  isDogInGingrCheckoutBasket,
  mergeCheckoutDogs,
  reconcileGingrSourcedCheckouts
} from "@/lib/board-checkout-merge";
import { applyCachedBackOfHousePhotos } from "@/lib/board-animal-photo-sources";
import { applyStoredAnimalPhotos, loadStoredAnimalPhotoUrl } from "@/lib/animal-photo-store";
import {
  FAST_BOARD_ROW_LIMIT,
  FAST_CHECKOUT_QUERY_TIMEOUT_MS,
  loadFastPromptedCheckouts
} from "@/lib/board-fast-checkout";
import { withTimeoutOrThrow } from "@/lib/server-ttl-cache";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import { getGingrAnimalPhotoUrlMap } from "@/lib/gingr-animal-photo";
import {
  getLobbyCheckoutDisplayUntilIso,
  shouldExpireLobbyCheckoutDog
} from "@/lib/lobby/checkout-display";
import { isPromptedCheckoutDog } from "@/lib/checkout-prompt";
import { fetchGingrBackOfHouse, mapGingrBoardToLiveDogs } from "@/lib/gingr-board-sync";
import { canCallGingrEndpoint } from "@/lib/gingr-request-guard";
import { extractLobbyBreed, getLobbyCheckoutStatus, getLobbyPromptedAt } from "@/lib/lobby/status-label";
import type { LobbyCheckoutDog } from "@/lib/lobby/types";
import type { LiveDog } from "@/lib/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

/** Lobby hot-path columns — avoid select(*) on a table that grows all day. */
const LOBBY_CHECKOUT_ROW_SELECT =
  "id, gingr_reservation_id, gingr_animal_id, animal_name, owner_name, photo_url, reservation_type, current_status, display_status, room, notes, flags, status_started_at, completed_at, display_until, last_seen_from_gingr_at, raw_payload, hidden, updated_at";

/** Full lobby sync may call Gingr + photo enrichment; keep bounded like the staff board. */
export const LOBBY_FULL_CHECKOUT_TIMEOUT_MS = 8_000;

export function isVisibleLobbyCheckoutDog(
  dog: LiveDog,
  now: Date,
  gingrCheckoutKeys: Set<string>,
  options: { requireGingrBasket?: boolean } = {}
) {
  if (dog.display_status !== "checking_out") return false;
  // Lobby guests must see checkout cards for the full display window.
  if (!shouldExpireLobbyCheckoutDog(dog, now)) return true;
  if (isDogInGingrCheckoutBasket(dog, gingrCheckoutKeys)) return true;
  if (options.requireGingrBasket) return false;
  return false;
}

function enrichDogPhotos(dogs: LiveDog[]) {
  return dogs.map((dog) => ({
    ...dog,
    photo_url: dog.photo_url ?? resolveDogPhotoUrl(dog)
  }));
}

async function enrichLobbyGingrAnimalPhotos(supabase: SupabaseClient, dogs: LiveDog[]) {
  const withResolvedPayloadPhotos = dogs.map((dog) => ({
    ...dog,
    photo_url: dog.photo_url ?? resolveDogPhotoUrl(dog)
  }));

  const withStoredPhotos = applyCachedBackOfHousePhotos(
    await applyStoredAnimalPhotos(supabase, withResolvedPayloadPhotos)
  );

  const stillMissingAnimalIds = [
    ...new Set(
      withStoredPhotos.filter((dog) => !dog.photo_url && dog.gingr_animal_id).map((dog) => dog.gingr_animal_id as string)
    )
  ];

  if (!stillMissingAnimalIds.length) {
    return withStoredPhotos;
  }

  const photoMap = await getGingrAnimalPhotoUrlMap(stillMissingAnimalIds, { timeoutMs: 3000 });

  return Promise.all(
    withStoredPhotos.map(async (dog) => {
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
  const { data, error } = await withTimeoutOrThrow(
    Promise.resolve(
      supabase
        .from("live_transition_dogs")
        .select(LOBBY_CHECKOUT_ROW_SELECT)
        .eq("hidden", false)
        .eq("display_status", "checking_out")
        // Newest first — a row limit must never hide the dog that just checked out.
        .order("status_started_at", { ascending: false, nullsFirst: false })
        .limit(FAST_BOARD_ROW_LIMIT)
    ),
    FAST_CHECKOUT_QUERY_TIMEOUT_MS,
    "lobby-checkout live_transition_dogs"
  );

  if (error) throw error;

  return enrichDogPhotos((data ?? []) as LiveDog[])
    .filter((dog) => (options.promptedOnly ? isPromptedCheckoutDog(dog) : true))
    .filter((dog) => !shouldExpireLobbyCheckoutDog(dog, now));
}

async function loadGingrCheckoutDogs(now: Date): Promise<{ dogs: LiveDog[]; gingrLive: boolean }> {
  try {
    const gingrBoard = await fetchGingrBackOfHouse({ allReservationTypes: true });
    if (!gingrBoard || gingrBoard.source === "disabled" || gingrBoard.source === "cooldown") {
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

export async function loadLobbyCheckoutDogsFast(supabase: SupabaseClient, now = new Date()) {
  const result = await loadFastPromptedCheckouts(supabase, now);
  const sorted = sortLobbyCheckoutDogs(result.checking_out);
  const featuredDog = sorted[0] ?? null;
  const queueDogs = sorted.slice(1);

  return {
    featured: featuredDog ? toLobbyCheckoutDog(featuredDog, true) : null,
    queue: queueDogs.map((dog) => toLobbyCheckoutDog(dog, false)),
    activeCount: sorted.length,
    lastPromptedAt: featuredDog ? getLobbyPromptedAt(featuredDog) : sorted[0] ? getLobbyPromptedAt(sorted[0]) : null,
    data_source: result.data_source,
    used_cached_gingr: false,
    basket_filtered: result.basket_filtered
  };
}

export async function loadLobbyCheckoutDogs(supabase: SupabaseClient, maxQueueCount = 6, now = new Date()) {
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
      isVisibleLobbyCheckoutDog(dog, now, gingrCheckoutKeys, { requireGingrBasket: true })
    );
  } else {
    candidates = supabaseCheckoutDogs;
  }

  const withStoredPhotos = await applyStoredAnimalPhotos(supabase, candidates);
  const enriched = await enrichLobbyGingrAnimalPhotos(supabase, withStoredPhotos);
  const sorted = sortLobbyCheckoutDogs(enriched);

  const featuredDog = sorted[0] ?? null;
  const queueDogs = sorted.slice(1, 1 + maxQueueCount);
  const usedCachedGingr = gingrLive && !canCallGingrEndpoint("back_of_house");

  return {
    featured: featuredDog ? toLobbyCheckoutDog(featuredDog, true) : null,
    queue: queueDogs.map((dog) => toLobbyCheckoutDog(dog, false)),
    activeCount: featuredDog ? 1 + queueDogs.length : queueDogs.length,
    lastPromptedAt: featuredDog ? getLobbyPromptedAt(featuredDog) : sorted[0] ? getLobbyPromptedAt(sorted[0]) : null,
    data_source: gingrLive ? "gingr_and_supabase" : "supabase_live_transition_dogs",
    used_cached_gingr: usedCachedGingr,
    basket_filtered: gingrLive
  };
}

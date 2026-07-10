import { applyStoredAnimalPhotos } from "@/lib/animal-photo-store";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import {
  buildGingrCheckoutKeySet,
  isDogInGingrCheckoutBasket,
  mergeCheckoutDogs,
  sortCheckoutDogs
} from "@/lib/board-checkout-merge";
import { shouldExpireCheckinDog } from "@/lib/checkin-display";
import { shouldExpireCheckoutDog } from "@/lib/checkout-display";
import { isPromptedCheckoutDog } from "@/lib/checkout-prompt";
import {
  fetchGingrBackOfHouse,
  mapGingrBoardToLiveDogs,
  syncGingrBoardState
} from "@/lib/gingr-board-sync";
import type { LiveDog } from "@/lib/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

function enrichDogs(dogs: LiveDog[]) {
  return dogs.map((dog) => ({
    ...dog,
    photo_url: dog.photo_url ?? resolveDogPhotoUrl(dog)
  }));
}

function timeoutResult<T>(promise: Promise<T>, ms: number, fallback: T) {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), ms);
    })
  ]);
}

function isStoredLiveTriggeredDog(dog: LiveDog) {
  return dog.raw_payload?.source !== "gingr_back_of_house";
}

function filterVisibleDogs(
  dogs: LiveDog[],
  now: Date,
  options: { requireStoredLiveTrigger?: boolean; requirePromptedCheckout?: boolean } = {}
) {
  const { requireStoredLiveTrigger = false, requirePromptedCheckout = false } = options;
  const checkingIn = dogs.filter(
    (dog) =>
      dog.display_status === "checking_in" &&
      (!requireStoredLiveTrigger || isStoredLiveTriggeredDog(dog)) &&
      !shouldExpireCheckinDog(dog, now)
  );
  const checkingOut = dogs.filter(
    (dog) =>
      dog.display_status === "checking_out" &&
      (!requireStoredLiveTrigger || isStoredLiveTriggeredDog(dog)) &&
      (!requirePromptedCheckout || isPromptedCheckoutDog(dog)) &&
      !shouldExpireCheckoutDog(dog, now)
  );
  return { checkingIn, checkingOut };
}

async function loadActiveCheckinRows(supabase: SupabaseClient, now: Date) {
  const { data, error } = await supabase
    .from("live_transition_dogs")
    .select("*")
    .eq("hidden", false)
    .eq("display_status", "checking_in")
    .order("status_started_at", { ascending: true });

  if (error) throw error;

  const rows = enrichDogs((data ?? []) as LiveDog[]).filter(
    (dog) => dog.raw_payload?.source !== "gingr_back_of_house"
  );
  const visible = rows.filter((dog) => !shouldExpireCheckinDog(dog, now));

  return { visible, rawCheckinRows: rows.length };
}

async function loadPromptedCheckoutRows(supabase: SupabaseClient, now: Date) {
  const { data, error } = await supabase
    .from("live_transition_dogs")
    .select("*")
    .eq("hidden", false)
    .eq("display_status", "checking_out")
    .order("status_started_at", { ascending: true });

  if (error) throw error;

  const rows = enrichDogs((data ?? []) as LiveDog[]);
  const prompted = rows.filter(isPromptedCheckoutDog);
  const visible = prompted.filter((dog) => !shouldExpireCheckoutDog(dog, now));

  return {
    visible,
    rawCheckoutRows: rows.length,
    promptedCheckoutRows: prompted.length
  };
}

async function loadSupabaseBoardRows(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("live_transition_dogs")
    .select("*")
    .eq("hidden", false)
    .in("display_status", ["checking_in", "checking_out"])
    .order("status_started_at", { ascending: true });

  if (error) throw error;
  return enrichDogs((data ?? []) as LiveDog[]);
}

/** Same dog merge rules as /api/live-board — server-side only, uses cached Gingr when available. */
export async function loadStaffBoardDogsForDisplay(supabase: SupabaseClient, now = new Date()) {
  const [gingrBoardResult, activeCheckinRows, promptedCheckoutRows] = await Promise.all([
    timeoutResult(fetchGingrBackOfHouse().catch(() => null), 2500, null),
    timeoutResult(loadActiveCheckinRows(supabase, now), 2500, { visible: [] as LiveDog[], rawCheckinRows: 0 }),
    timeoutResult(loadPromptedCheckoutRows(supabase, now), 2500, {
      visible: [] as LiveDog[],
      rawCheckoutRows: 0,
      promptedCheckoutRows: 0
    })
  ]);

  let checkingIn: LiveDog[] = [];
  let checkingOut: LiveDog[] = sortCheckoutDogs(promptedCheckoutRows.visible);

  if (gingrBoardResult && gingrBoardResult.source !== "disabled") {
    const mappedLiveDogs = enrichDogs(mapGingrBoardToLiveDogs(gingrBoardResult));
    const liveDogs = await timeoutResult(applyStoredAnimalPhotos(supabase, mappedLiveDogs), 1500, mappedLiveDogs);
    const visible = filterVisibleDogs(liveDogs, now);
    const gingrCheckoutKeys = buildGingrCheckoutKeySet(visible.checkingOut);
    const basketMatchedPromptedCheckouts = promptedCheckoutRows.visible.filter((dog) =>
      isDogInGingrCheckoutBasket(dog, gingrCheckoutKeys)
    );
    // Prefer the webhook's immediate transition signal while retaining any
    // dogs already present in Gingr's back-of-house response.
    checkingIn = mergeCheckoutDogs(visible.checkingIn, activeCheckinRows.visible);
    checkingOut = sortCheckoutDogs(mergeCheckoutDogs(visible.checkingOut, basketMatchedPromptedCheckouts));
  } else {
    if (gingrBoardResult?.source === "disabled") {
      await timeoutResult(syncGingrBoardState(supabase), 2500, null).catch(() => null);
    }

    const supabaseDogs = await loadSupabaseBoardRows(supabase);
    const storedSupabaseDogs = await timeoutResult(applyStoredAnimalPhotos(supabase, supabaseDogs), 1500, supabaseDogs);
    const visible = filterVisibleDogs(storedSupabaseDogs, now, {
      requireStoredLiveTrigger: true,
      requirePromptedCheckout: true
    });
    const storedActiveCheckins = await timeoutResult(
      applyStoredAnimalPhotos(supabase, activeCheckinRows.visible),
      1500,
      activeCheckinRows.visible
    );
    const storedPromptedCheckouts = await timeoutResult(
      applyStoredAnimalPhotos(supabase, promptedCheckoutRows.visible),
      1500,
      promptedCheckoutRows.visible
    );
    checkingIn = storedActiveCheckins.length ? storedActiveCheckins : visible.checkingIn;
    checkingOut = sortCheckoutDogs(mergeCheckoutDogs(visible.checkingOut, storedPromptedCheckouts));
  }

  return { checkingIn, checkingOut };
}

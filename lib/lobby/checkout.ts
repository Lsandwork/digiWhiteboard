import { resolveDogPhotoUrl } from "@/lib/board-utils";
import { shouldExpireCheckoutDog } from "@/lib/checkout-display";
import { isPromptedCheckoutDog } from "@/lib/checkout-prompt";
import { extractLobbyBreed, getLobbyCheckoutStatus, getLobbyPromptedAt } from "@/lib/lobby/status-label";
import type { LobbyCheckoutDog } from "@/lib/lobby/types";
import type { LiveDog } from "@/lib/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

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
  const { data, error } = await supabase
    .from("live_transition_dogs")
    .select("id, gingr_animal_id, animal_name, photo_url, room, reservation_type, status_started_at, display_until, raw_payload, flags, updated_at, display_status, hidden")
    .eq("hidden", false)
    .eq("display_status", "checking_out")
    .order("status_started_at", { ascending: false });

  if (error) throw error;

  const prompted = ((data ?? []) as LiveDog[])
    .filter((dog) => isPromptedCheckoutDog(dog))
    .filter((dog) => !shouldExpireCheckoutDog(dog, now));

  const sorted = prompted.sort(
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

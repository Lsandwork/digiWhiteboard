import { isLobbyCheckoutDogExpired } from "@/lib/lobby/checkout-display";
import type { LobbyCheckoutDog, LobbyCheckoutsResponse } from "@/lib/lobby/types";

export type StickyLobbyCheckoutEntry = {
  dog: LobbyCheckoutDog;
  firstSeenAt: number;
};

export type StickyLobbyCheckoutState = Map<string, StickyLobbyCheckoutEntry>;

export function getLobbyCheckoutMergeKey(dog: LobbyCheckoutDog) {
  if (dog.gingr_animal_id) return `animal:${dog.gingr_animal_id}`;
  return `id:${dog.id}`;
}

function lobbyCheckoutsToDogs(response: LobbyCheckoutsResponse) {
  const dogs = [...(response.queue ?? [])];
  if (response.featured) dogs.unshift(response.featured);
  return dogs;
}

function sortLobbyCheckoutDogs(dogs: LobbyCheckoutDog[]) {
  return [...dogs].sort((a, b) => {
    const aTime = a.prompted_at ? new Date(a.prompted_at).getTime() : 0;
    const bTime = b.prompted_at ? new Date(b.prompted_at).getTime() : 0;
    return bTime - aTime;
  });
}

export function buildLobbyCheckoutsResponse(dogs: LobbyCheckoutDog[], lastUpdated: string): LobbyCheckoutsResponse {
  const sorted = sortLobbyCheckoutDogs(dogs);
  return {
    featured: sorted[0] ?? null,
    queue: sorted.slice(1),
    counts: {
      active: sorted.length,
      queue: Math.max(0, sorted.length - (sorted[0] ? 1 : 0))
    },
    last_updated: lastUpdated
  };
}

/** Keep lobby checkout rows visible until expiry even when a fast poll returns empty. */
export function mergeStickyLobbyCheckouts(
  previous: StickyLobbyCheckoutState,
  incoming: LobbyCheckoutsResponse,
  nowMs: number
): StickyLobbyCheckoutState {
  const next = new Map(previous);

  for (const [key, entry] of next) {
    if (isLobbyCheckoutDogExpired(entry.dog, nowMs)) {
      next.delete(key);
    }
  }

  const incomingDogs = lobbyCheckoutsToDogs(incoming);
  if (!incomingDogs.length) {
    return next;
  }

  for (const dog of incomingDogs) {
    const key = getLobbyCheckoutMergeKey(dog);

    if (isLobbyCheckoutDogExpired(dog, nowMs)) {
      next.delete(key);
      continue;
    }

    const existing = next.get(key);
    const firstSeenAt =
      existing?.firstSeenAt ??
      (dog.prompted_at ? new Date(dog.prompted_at).getTime() : nowMs);

    next.set(key, {
      dog: existing ? { ...existing.dog, ...dog } : dog,
      firstSeenAt
    });
  }

  return next;
}

export function stickyLobbyStateToResponse(state: StickyLobbyCheckoutState, lastUpdated: string) {
  return buildLobbyCheckoutsResponse(
    [...state.values()].map((entry) => entry.dog),
    lastUpdated
  );
}

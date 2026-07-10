import { isLobbyCheckoutDogExpired } from "@/lib/lobby/checkout-display";
import { getLobbyCheckoutMergeKey, mergeLobbyDogFields } from "@/lib/lobby-display-stable";
import type { LobbyCheckoutDog, LobbyCheckoutsResponse } from "@/lib/lobby/types";

export type StickyLobbyCheckoutEntry = {
  dog: LobbyCheckoutDog;
  firstSeenAt: number;
  introducedAt: number;
  isFeatured: boolean;
};

export type StickyLobbyCheckoutState = Map<string, StickyLobbyCheckoutEntry>;

export type StickyLobbyCheckoutMergeOptions = {
  basketAuthoritative?: boolean;
  basketConfirmedEmpty?: boolean;
  pruneMissingFromBasket?: boolean;
  skipExpiry?: boolean;
};

export { getLobbyCheckoutMergeKey } from "@/lib/lobby-display-stable";

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

function buildLobbyResponseFromSticky(state: StickyLobbyCheckoutState, lastUpdated: string): LobbyCheckoutsResponse {
  const entries = [...state.values()].sort((a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    const aTime = a.dog.prompted_at ? new Date(a.dog.prompted_at).getTime() : a.firstSeenAt;
    const bTime = b.dog.prompted_at ? new Date(b.dog.prompted_at).getTime() : b.firstSeenAt;
    return bTime - aTime;
  });

  const featuredEntry = entries.find((entry) => entry.isFeatured) ?? entries[0] ?? null;
  const queueEntries = entries.filter((entry) => entry !== featuredEntry);

  return {
    featured: featuredEntry?.dog ?? null,
    queue: queueEntries.map((entry) => entry.dog),
    counts: {
      active: entries.length,
      queue: queueEntries.length
    },
    last_updated: lastUpdated
  };
}

/** Keep lobby checkout rows visible until expiry even when a fast poll returns empty. */
export function mergeStickyLobbyCheckouts(
  previous: StickyLobbyCheckoutState,
  incoming: LobbyCheckoutsResponse,
  nowMs: number,
  options: StickyLobbyCheckoutMergeOptions = {}
): StickyLobbyCheckoutState {
  const next = new Map(previous);
  const {
    basketAuthoritative = false,
    basketConfirmedEmpty = false,
    pruneMissingFromBasket = false,
    skipExpiry = false
  } = options;

  if (!skipExpiry) {
    for (const [key, entry] of next) {
      if (isLobbyCheckoutDogExpired(entry.dog, nowMs)) {
        next.delete(key);
      }
    }
  }

  const incomingDogs = lobbyCheckoutsToDogs(incoming);
  const incomingFeaturedKey = incoming.featured ? getLobbyCheckoutMergeKey(incoming.featured) : null;

  if (incomingDogs.length > 0 && basketAuthoritative && pruneMissingFromBasket) {
    const incomingKeys = new Set(incomingDogs.map((dog) => getLobbyCheckoutMergeKey(dog)));
    for (const key of next.keys()) {
      if (!incomingKeys.has(key)) {
        next.delete(key);
      }
    }
  } else if (incomingDogs.length === 0 && basketAuthoritative && basketConfirmedEmpty) {
    return new Map();
  } else if (!incomingDogs.length) {
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
    const introducedAt = existing?.introducedAt ?? firstSeenAt;
    const shouldFeature =
      existing?.isFeatured ??
      (incomingFeaturedKey ? key === incomingFeaturedKey : !next.size);

    next.set(key, {
      dog: existing ? mergeLobbyDogFields(existing.dog, dog) : dog,
      firstSeenAt,
      introducedAt,
      isFeatured: shouldFeature
    });
  }

  if (![...next.values()].some((entry) => entry.isFeatured) && next.size > 0) {
    const firstKey = next.keys().next().value;
    if (firstKey) {
      const entry = next.get(firstKey)!;
      next.set(firstKey, { ...entry, isFeatured: true });
    }
  }

  return next;
}

export function expireStickyLobbyCheckouts(previous: StickyLobbyCheckoutState, nowMs: number) {
  const next = new Map(previous);
  for (const [key, entry] of next) {
    if (isLobbyCheckoutDogExpired(entry.dog, nowMs)) {
      next.delete(key);
    }
  }
  return next;
}

export function stickyLobbyStateToResponse(state: StickyLobbyCheckoutState, lastUpdated: string) {
  return buildLobbyResponseFromSticky(state, lastUpdated);
}

export function areStickyLobbyStatesEqual(a: StickyLobbyCheckoutState, b: StickyLobbyCheckoutState) {
  if (a.size !== b.size) return false;
  for (const [key, entry] of a) {
    const other = b.get(key);
    if (!other) return false;
    if (other.firstSeenAt !== entry.firstSeenAt) return false;
    if (other.isFeatured !== entry.isFeatured) return false;
    if (other.dog.dog_name !== entry.dog.dog_name) return false;
    if ((other.dog.dog_photo_url ?? null) !== (entry.dog.dog_photo_url ?? null)) return false;
  }
  return true;
}

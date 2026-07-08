import { sortCheckoutDogs } from "@/lib/board-checkout-merge";
import { getCheckoutDisplayUntilAt, shouldExpireCheckoutDog } from "@/lib/checkout-display";
import type { LiveDog } from "@/lib/types";

export type StickyCheckoutEntry = {
  dog: LiveDog;
  firstSeenAt: number;
};

export type StickyCheckoutState = Map<string, StickyCheckoutEntry>;

/** Stable identity across Gingr rows, Supabase webhooks, and fast/full poll responses. */
export function getCheckoutMergeKey(dog: LiveDog) {
  if (dog.gingr_reservation_id) return `res:${dog.gingr_reservation_id}`;
  if (dog.gingr_animal_id) return `animal:${dog.gingr_animal_id}`;
  return `id:${dog.id}`;
}

function getAnchorMs(dog: LiveDog) {
  const anchor = dog.status_started_at ?? dog.updated_at;
  return anchor ? new Date(anchor).getTime() : Date.now();
}

function pickEarliestIso(a: string | null | undefined, b: string | null | undefined) {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function mergeCheckoutDogFields(existing: LiveDog, incoming: LiveDog, now: Date) {
  return {
    ...existing,
    ...incoming,
    status_started_at: pickEarliestIso(existing.status_started_at, incoming.status_started_at),
    display_until: pickLaterDisplayUntil(existing, incoming, now)
  };
}

function pickLaterDisplayUntil(existing: LiveDog, incoming: LiveDog, now: Date) {
  const existingUntil = getCheckoutDisplayUntilAt(existing, undefined, now);
  const incomingUntil = getCheckoutDisplayUntilAt(incoming, undefined, now);

  if (!existingUntil) return incoming.display_until;
  if (!incomingUntil) return existing.display_until;
  return existingUntil.getTime() >= incomingUntil.getTime() ? existing.display_until : incoming.display_until;
}

export function mergeStickyCheckoutDogs(
  previous: StickyCheckoutState,
  incoming: LiveDog[],
  now = new Date(),
  options: { basketAuthoritative?: boolean } = {}
): StickyCheckoutState {
  const next = new Map(previous);
  const { basketAuthoritative = false } = options;

  for (const [key, entry] of next) {
    if (shouldExpireCheckoutDog(entry.dog, now, entry.firstSeenAt)) {
      next.delete(key);
    }
  }

  if (incoming.length > 0 && basketAuthoritative) {
    const incomingKeys = new Set(incoming.map((dog) => getCheckoutMergeKey(dog)));
    for (const key of next.keys()) {
      if (!incomingKeys.has(key)) {
        next.delete(key);
      }
    }
  } else if (incoming.length === 0 && basketAuthoritative) {
    next.clear();
  }

  for (const dog of incoming) {
    const key = getCheckoutMergeKey(dog);

    if (dog.hidden || dog.display_status !== "checking_out") {
      next.delete(key);
      continue;
    }

    const existing = next.get(key);
    const firstSeenAt = existing?.firstSeenAt ?? getAnchorMs(dog);
    const mergedDog = existing ? mergeCheckoutDogFields(existing.dog, dog, now) : dog;

    if (shouldExpireCheckoutDog(mergedDog, now, firstSeenAt)) {
      next.delete(key);
      continue;
    }

    next.set(key, { dog: mergedDog, firstSeenAt });
  }

  return next;
}

export function stickyCheckoutStateToDogs(state: StickyCheckoutState) {
  return sortCheckoutDogs([...state.values()].map((entry) => entry.dog));
}

export function stickyCheckoutFirstSeenByKey(state: StickyCheckoutState) {
  const firstSeenByKey = new Map<string, number>();
  for (const [key, entry] of state) {
    firstSeenByKey.set(key, entry.firstSeenAt);
  }
  return firstSeenByKey;
}

import { sortCheckoutDogs } from "@/lib/board-checkout-merge";
import { getCheckoutDisplayMs, getCheckoutDisplayUntilAt, shouldExpireCheckoutDog } from "@/lib/checkout-display";
import type { LiveDog } from "@/lib/types";

export type StickyCheckoutEntry = {
  dog: LiveDog;
  firstSeenAt: number;
  introducedAt: number;
  displayUntilMs: number;
};

export type StickyCheckoutState = Map<string, StickyCheckoutEntry>;

export type StickyCheckoutMergeOptions = {
  basketAuthoritative?: boolean;
  basketConfirmedEmpty?: boolean;
  pruneMissingFromBasket?: boolean;
  skipExpiry?: boolean;
};

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

function resolveDisplayUntilMs(
  entry: StickyCheckoutEntry | undefined,
  dog: LiveDog,
  firstSeenAt: number,
  now: Date
) {
  const computed =
    getCheckoutDisplayUntilAt(dog, firstSeenAt, now)?.getTime() ?? firstSeenAt + getCheckoutDisplayMs();
  if (!entry) return computed;
  return Math.max(entry.displayUntilMs, computed);
}

function mergeCheckoutDogFields(existing: LiveDog, incoming: LiveDog, now: Date) {
  return {
    ...existing,
    ...incoming,
    photo_url: incoming.photo_url ?? existing.photo_url,
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
  options: StickyCheckoutMergeOptions = {}
): StickyCheckoutState {
  const next = new Map(previous);
  const {
    basketAuthoritative = false,
    basketConfirmedEmpty = false,
    pruneMissingFromBasket = false,
    skipExpiry = false
  } = options;

  if (!skipExpiry) {
    for (const [key, entry] of next) {
      if (shouldExpireCheckoutDog(entry.dog, now, entry.firstSeenAt) || now.getTime() >= entry.displayUntilMs) {
        next.delete(key);
      }
    }
  }

  if (incoming.length > 0 && basketAuthoritative && pruneMissingFromBasket) {
    const incomingKeys = new Set(incoming.map((dog) => getCheckoutMergeKey(dog)));
    for (const key of next.keys()) {
      if (!incomingKeys.has(key)) {
        next.delete(key);
      }
    }
  } else if (incoming.length === 0 && basketAuthoritative && basketConfirmedEmpty) {
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
    const introducedAt = existing?.introducedAt ?? firstSeenAt;
    const mergedDog = existing ? mergeCheckoutDogFields(existing.dog, dog, now) : dog;
    const displayUntilMs = resolveDisplayUntilMs(existing, mergedDog, firstSeenAt, now);

    if (!skipExpiry && (shouldExpireCheckoutDog(mergedDog, now, firstSeenAt) || now.getTime() >= displayUntilMs)) {
      next.delete(key);
      continue;
    }

    next.set(key, {
      dog: mergedDog,
      firstSeenAt,
      introducedAt,
      displayUntilMs
    });
  }

  return next;
}

export function expireStickyCheckoutDogs(previous: StickyCheckoutState, now = new Date()) {
  const next = new Map(previous);
  const nowMs = now.getTime();

  for (const [key, entry] of next) {
    if (shouldExpireCheckoutDog(entry.dog, now, entry.firstSeenAt) || nowMs >= entry.displayUntilMs) {
      next.delete(key);
    }
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

export function stickyCheckoutDisplayMetaByKey(state: StickyCheckoutState) {
  const metaByKey = new Map<string, { firstSeenAt: number; introducedAt: number; displayUntilMs: number }>();
  for (const [key, entry] of state) {
    metaByKey.set(key, {
      firstSeenAt: entry.firstSeenAt,
      introducedAt: entry.introducedAt,
      displayUntilMs: entry.displayUntilMs
    });
  }
  return metaByKey;
}

export function areStickyCheckoutStatesEqual(a: StickyCheckoutState, b: StickyCheckoutState) {
  if (a.size !== b.size) return false;
  for (const [key, entry] of a) {
    const other = b.get(key);
    if (!other) return false;
    if (other.firstSeenAt !== entry.firstSeenAt) return false;
    if (other.introducedAt !== entry.introducedAt) return false;
    if (other.displayUntilMs !== entry.displayUntilMs) return false;
    if (other.dog.id !== entry.dog.id) return false;
    if (other.dog.photo_url !== entry.dog.photo_url) return false;
    if (other.dog.display_status !== entry.dog.display_status) return false;
    if (other.dog.hidden !== entry.dog.hidden) return false;
  }
  return true;
}

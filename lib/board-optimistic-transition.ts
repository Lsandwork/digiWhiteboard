import { mergeCheckoutDogs, preserveDogPhotos, getTransitionMatchKeys } from "@/lib/board-checkout-merge";
import { isPromptedCheckoutDog } from "@/lib/checkout-prompt";
import type { LiveBoardResponse, LiveDog } from "@/lib/types";

function dogMatchesIdentity(dog: LiveDog, reference: LiveDog) {
  if (dog.id && reference.id && dog.id === reference.id) return true;
  const keys = new Set(getTransitionMatchKeys(reference));
  if (!keys.size) return false;
  return getTransitionMatchKeys(dog).some((key) => keys.has(key));
}

function withoutMatchingDog(dogs: LiveDog[], reference: LiveDog) {
  return dogs.filter((dog) => !dogMatchesIdentity(dog, reference));
}

/** Instant UI update from Supabase Realtime before the fast fetch confirms. */
export function applyOptimisticLiveBoardTransition(
  previous: LiveBoardResponse,
  next: LiveDog | null
): LiveBoardResponse | null {
  if (!next?.id) return null;

  if (next.hidden || next.display_status === "removed" || next.current_status === "basket_cleared") {
    const checkingIn = withoutMatchingDog(previous.checking_in, next);
    const checkingOut = withoutMatchingDog(previous.checking_out, next);
    if (checkingIn.length === previous.checking_in.length && checkingOut.length === previous.checking_out.length) {
      return null;
    }

    return {
      ...previous,
      checking_in: checkingIn,
      checking_out: checkingOut,
      counts: {
        checking_in: checkingIn.length,
        checking_out: checkingOut.length,
        total: checkingIn.length + checkingOut.length
      }
    };
  }

  if (next.display_status === "checking_in") {
    const checkingIn = preserveDogPhotos(previous.checking_in, mergeCheckoutDogs(previous.checking_in, [next]));
    const checkingOut = withoutMatchingDog(previous.checking_out, next);
    return {
      ...previous,
      checking_in: checkingIn,
      checking_out: checkingOut,
      counts: {
        checking_in: checkingIn.length,
        checking_out: checkingOut.length,
        total: checkingIn.length + checkingOut.length
      }
    };
  }

  if (next.display_status === "checking_out" && isPromptedCheckoutDog(next)) {
    const checkingOut = preserveDogPhotos(previous.checking_out, mergeCheckoutDogs(previous.checking_out, [next]));
    const checkingIn = withoutMatchingDog(previous.checking_in, next);
    return {
      ...previous,
      checking_in: checkingIn,
      checking_out: checkingOut,
      counts: {
        checking_in: checkingIn.length,
        checking_out: checkingOut.length,
        total: checkingIn.length + checkingOut.length
      }
    };
  }

  return null;
}

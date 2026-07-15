import { mergeCheckoutDogs, preserveDogPhotos } from "@/lib/board-checkout-merge";
import { isPromptedCheckoutDog } from "@/lib/checkout-prompt";
import type { LiveBoardResponse, LiveDog } from "@/lib/types";

function withoutDog(dogs: LiveDog[], dogId: string) {
  return dogs.filter((dog) => dog.id !== dogId);
}

/** Instant UI update from Supabase Realtime before the fast fetch confirms. */
export function applyOptimisticLiveBoardTransition(
  previous: LiveBoardResponse,
  next: LiveDog | null
): LiveBoardResponse | null {
  if (!next?.id) return null;

  if (next.hidden || next.display_status === "removed" || next.current_status === "basket_cleared") {
    const checkingIn = withoutDog(previous.checking_in, next.id);
    const checkingOut = withoutDog(previous.checking_out, next.id);
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

  if (next.display_status === "checking_in" && next.raw_payload?.source !== "gingr_back_of_house") {
    const checkingIn = preserveDogPhotos(previous.checking_in, mergeCheckoutDogs(previous.checking_in, [next]));
    const checkingOut = withoutDog(previous.checking_out, next.id);
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
    const checkingIn = withoutDog(previous.checking_in, next.id);
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

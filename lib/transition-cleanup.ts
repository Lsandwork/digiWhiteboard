import type { LiveDog } from "@/lib/types";

export const MINIMUM_VISIBLE_MS = 3 * 60 * 1000;

const completedStatuses = new Set(["checked_in", "checked_out", "manually_hidden", "synced_removed"]);

type TransitionDogLike = Pick<
  LiveDog,
  "status_started_at" | "completed_at" | "current_status" | "hidden" | "display_status"
> & {
  created_at?: string | null;
  updated_at?: string;
};

export function getTransitionAnchorAt(dog: TransitionDogLike) {
  const anchor = dog.status_started_at ?? dog.created_at ?? dog.updated_at ?? null;
  return anchor ? new Date(anchor) : null;
}

export function getHideAfterAt(dog: TransitionDogLike) {
  const anchor = getTransitionAnchorAt(dog);
  if (!anchor) return null;
  return new Date(anchor.getTime() + MINIMUM_VISIBLE_MS);
}

export function hasCompletedTransition(dog: TransitionDogLike) {
  return Boolean(dog.completed_at) || completedStatuses.has(dog.current_status);
}

export function shouldHideCompletedDog(dog: TransitionDogLike, now = new Date()) {
  if (dog.hidden) return false;
  if (!hasCompletedTransition(dog)) return false;

  const hideAfter = getHideAfterAt(dog);
  if (!hideAfter) return false;

  return now.getTime() >= hideAfter.getTime();
}

export function isContinuingSameTransition(
  existing: TransitionDogLike | null | undefined,
  webhookType: "checking_in" | "checking_out"
) {
  if (!existing || existing.hidden) return false;
  if (existing.display_status !== webhookType) return false;
  if (hasCompletedTransition(existing)) return false;
  return true;
}

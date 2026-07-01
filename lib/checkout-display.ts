import type { LiveDog } from "@/lib/types";

export const CHECKOUT_ALERT_MS = 20 * 1000;
export const CHECKOUT_REMINDER_INTERVAL_MS = 60 * 1000;
export const CHECKOUT_REMINDER_DURATION_MS = 2500;
export const EXPIRED_CHECKOUT_STORAGE_KEY = "fitdog-checkout-expired-events";

export function getCheckoutDisplayMinutes() {
  const raw =
    process.env.CHECKOUT_DISPLAY_MINUTES ??
    process.env.NEXT_PUBLIC_CHECKOUT_DISPLAY_MINUTES ??
    "4";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
}

export function getCheckoutDisplayMs() {
  return getCheckoutDisplayMinutes() * 60 * 1000;
}

export function getCheckoutAnchorAt(dog: LiveDog) {
  const anchor = dog.status_started_at ?? dog.updated_at ?? null;
  return anchor ? new Date(anchor) : null;
}

export function getStableCheckoutKey(dog: LiveDog) {
  const anchor = dog.status_started_at ?? dog.updated_at ?? dog.id;
  const reservation = dog.gingr_reservation_id ?? "no-reservation";
  const animal = dog.gingr_animal_id ?? dog.id;
  return `${reservation}::${animal}::${anchor}`;
}

export function getCheckoutDisplayUntilAt(dog: LiveDog, firstSeenAt?: number, now = new Date()) {
  const nowMs = now.getTime();

  if (dog.display_until && dog.display_status === "checking_out") {
    const untilMs = new Date(dog.display_until).getTime();
    if (untilMs > nowMs) {
      return new Date(untilMs);
    }
  }

  const anchor = getCheckoutAnchorAt(dog);
  if (anchor) {
    return new Date(anchor.getTime() + getCheckoutDisplayMs());
  }

  if (firstSeenAt) {
    return new Date(firstSeenAt + getCheckoutDisplayMs());
  }

  return null;
}

export function shouldExpireCheckoutDog(dog: LiveDog, now = new Date(), firstSeenAt?: number) {
  if (dog.display_status !== "checking_out") return false;
  const until = getCheckoutDisplayUntilAt(dog, firstSeenAt, now);
  if (!until) return false;
  return now.getTime() >= until.getTime();
}

export function computeCheckoutDisplayUntilIso(anchorIso: string) {
  return new Date(new Date(anchorIso).getTime() + getCheckoutDisplayMs()).toISOString();
}

export function resolveActiveCheckoutDisplayUntil(
  statusStartedAt: string,
  existingUntil: string | null | undefined
) {
  const computed = computeCheckoutDisplayUntilIso(statusStartedAt);
  if (existingUntil && new Date(existingUntil).getTime() > Date.now()) {
    return existingUntil;
  }
  return computed;
}

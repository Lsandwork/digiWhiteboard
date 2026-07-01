import type { LiveDog } from "@/lib/types";

export const EXPIRED_CHECKIN_STORAGE_KEY = "fitdog-checkin-expired-events";

export function getCheckinDisplayMinutes() {
  const raw =
    process.env.CHECKIN_DISPLAY_MINUTES ??
    process.env.NEXT_PUBLIC_CHECKIN_DISPLAY_MINUTES ??
    "3";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}

export function getCheckinDisplayMs() {
  return getCheckinDisplayMinutes() * 60 * 1000;
}

export function getCheckinAnchorAt(dog: LiveDog) {
  const anchor = dog.status_started_at ?? dog.updated_at ?? null;
  return anchor ? new Date(anchor) : null;
}

export function getStableCheckinKey(dog: LiveDog) {
  const anchor = dog.status_started_at ?? dog.updated_at ?? dog.id;
  const reservation = dog.gingr_reservation_id ?? "no-reservation";
  const animal = dog.gingr_animal_id ?? dog.id;
  return `${reservation}::${animal}::${anchor}`;
}

export function getCheckinDisplayUntilAt(dog: LiveDog, firstSeenAt?: number, now = new Date()) {
  const nowMs = now.getTime();

  if (dog.display_until && dog.display_status === "checking_in") {
    const untilMs = new Date(dog.display_until).getTime();
    if (untilMs > nowMs) {
      return new Date(untilMs);
    }
  }

  const anchor = getCheckinAnchorAt(dog);
  if (anchor) {
    return new Date(anchor.getTime() + getCheckinDisplayMs());
  }

  if (firstSeenAt) {
    return new Date(firstSeenAt + getCheckinDisplayMs());
  }

  return null;
}

export function shouldExpireCheckinDog(dog: LiveDog, now = new Date(), firstSeenAt?: number) {
  if (dog.display_status !== "checking_in") return false;
  const until = getCheckinDisplayUntilAt(dog, firstSeenAt, now);
  if (!until) return false;
  return now.getTime() >= until.getTime();
}

export function computeCheckinDisplayUntilIso(anchorIso: string) {
  return new Date(new Date(anchorIso).getTime() + getCheckinDisplayMs()).toISOString();
}

export function resolveActiveCheckinDisplayUntil(
  statusStartedAt: string,
  existingUntil: string | null | undefined,
  now = new Date()
) {
  if (existingUntil && new Date(existingUntil).getTime() > now.getTime()) {
    return existingUntil;
  }

  const computed = computeCheckinDisplayUntilIso(statusStartedAt);
  if (new Date(computed).getTime() > now.getTime()) {
    return computed;
  }

  return computeCheckinDisplayUntilIso(now.toISOString());
}

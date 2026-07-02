import { toIsoTimestamp } from "@/lib/board-dog";
import { getLobbyPromptedAt } from "@/lib/lobby/status-label";
import type { LiveDog } from "@/lib/types";

export function getLobbyCheckoutDisplayMinutes() {
  const raw = process.env.LOBBY_CHECKOUT_DISPLAY_MINUTES ?? "10";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

export function getLobbyCheckoutDisplayMs() {
  return getLobbyCheckoutDisplayMinutes() * 60 * 1000;
}

export function getLobbyCheckoutAnchorAt(dog: LiveDog) {
  const iso =
    getLobbyPromptedAt(dog) ??
    toIsoTimestamp(dog.status_started_at) ??
    toIsoTimestamp(dog.updated_at);
  if (!iso) return null;

  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getLobbyCheckoutDisplayUntilAt(dog: LiveDog) {
  const anchor = getLobbyCheckoutAnchorAt(dog);
  if (!anchor) return null;
  return new Date(anchor.getTime() + getLobbyCheckoutDisplayMs());
}

export function getLobbyCheckoutDisplayUntilIso(dog: LiveDog) {
  return getLobbyCheckoutDisplayUntilAt(dog)?.toISOString() ?? null;
}

export function shouldExpireLobbyCheckoutDog(dog: LiveDog, now = new Date()) {
  if (dog.display_status !== "checking_out") return true;
  const until = getLobbyCheckoutDisplayUntilAt(dog);
  if (!until) return false;
  return now.getTime() >= until.getTime();
}

export function isLobbyCheckoutDogExpired(
  dog: { display_until?: string | null },
  nowMs = Date.now()
) {
  if (!dog.display_until) return false;
  const untilMs = new Date(dog.display_until).getTime();
  return Number.isFinite(untilMs) && nowMs >= untilMs;
}

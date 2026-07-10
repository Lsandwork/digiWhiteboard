import { clampCheckoutPollMs } from "@/lib/board-checkout-merge";
import { debugBoardLog } from "@/lib/server-ttl-cache";
import { safeMediaUrl, safeUrl } from "@/lib/safe-url";
import type { LobbyScheduleDay } from "@/lib/lobby/class-schedule";
import { LOBBY_CLASS_SCHEDULE } from "@/lib/lobby/class-schedule";
import { lobbyAssets } from "@/lib/lobby/assets";
import type { LobbyCheckoutDog, LobbySettings } from "@/lib/lobby/types";

const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
  max_queue_count: 6,
  refresh_interval_ms: 5000,
  show_promotions: true,
  show_events: true,
  footer_message: "Thanks for being part of the Fitdog family. We'll take care of the rest.",
  lobby_message: "Thank you for letting us play, care & connect!",
  class_schedule: LOBBY_CLASS_SCHEDULE,
  published_version: "v1.0.0",
  published_at: null,
  published_by: null
};

function sanitizeScheduleDay(raw: unknown, debugBoard: boolean, index: number): LobbyScheduleDay | null {
  if (!raw || typeof raw !== "object") {
    debugBoardLog(debugBoard, "lobby_settings.class_schedule skipped row", { index, reason: "not-object", raw });
    return null;
  }

  const entry = raw as Record<string, unknown>;
  const day = typeof entry.day === "string" ? entry.day.trim() : "";
  if (!day) {
    debugBoardLog(debugBoard, "lobby_settings.class_schedule skipped row", { index, reason: "missing-day", raw });
    return null;
  }

  const classes = Array.isArray(entry.classes)
    ? entry.classes
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    : [];

  if (!classes.length) {
    debugBoardLog(debugBoard, "lobby_settings.class_schedule skipped row", { index, reason: "missing-classes", raw });
    return null;
  }

  return { day, classes };
}

export function sanitizeLobbyClassSchedule(raw: unknown, debugBoard = false): LobbyScheduleDay[] {
  if (!Array.isArray(raw)) {
    if (raw != null) {
      debugBoardLog(debugBoard, "lobby_settings.class_schedule fallback", {
        reason: "not-array",
        rawType: typeof raw
      });
    }
    return LOBBY_CLASS_SCHEDULE;
  }

  const schedule = raw
    .map((entry, index) => sanitizeScheduleDay(entry, debugBoard, index))
    .filter((entry): entry is LobbyScheduleDay => Boolean(entry));

  return schedule.length ? schedule : LOBBY_CLASS_SCHEDULE;
}

export function sanitizeLobbySettings(raw: unknown, debugBoard = false): LobbySettings {
  if (!raw || typeof raw !== "object") {
    debugBoardLog(debugBoard, "lobby_settings fallback", { reason: "missing-payload" });
    return DEFAULT_LOBBY_SETTINGS;
  }

  const input = raw as Record<string, unknown>;
  const maxQueue = Number(input.max_queue_count ?? DEFAULT_LOBBY_SETTINGS.max_queue_count);
  const refreshInterval = clampCheckoutPollMs(
    Number(input.refresh_interval_ms ?? DEFAULT_LOBBY_SETTINGS.refresh_interval_ms)
  );

  return {
    max_queue_count: Math.min(6, Math.max(3, Number.isFinite(maxQueue) ? maxQueue : DEFAULT_LOBBY_SETTINGS.max_queue_count)),
    refresh_interval_ms: refreshInterval,
    show_promotions: input.show_promotions == null ? DEFAULT_LOBBY_SETTINGS.show_promotions : Boolean(input.show_promotions),
    show_events: input.show_events == null ? DEFAULT_LOBBY_SETTINGS.show_events : Boolean(input.show_events),
    footer_message:
      typeof input.footer_message === "string" && input.footer_message.trim()
        ? input.footer_message.trim()
        : DEFAULT_LOBBY_SETTINGS.footer_message,
    lobby_message:
      typeof input.lobby_message === "string" && input.lobby_message.trim()
        ? input.lobby_message.trim()
        : DEFAULT_LOBBY_SETTINGS.lobby_message,
    class_schedule: sanitizeLobbyClassSchedule(input.class_schedule, debugBoard),
    published_version:
      typeof input.published_version === "string" && input.published_version.trim()
        ? input.published_version.trim()
        : DEFAULT_LOBBY_SETTINGS.published_version,
    published_at: typeof input.published_at === "string" ? input.published_at : null,
    published_by: typeof input.published_by === "string" ? input.published_by : null
  };
}

export function sanitizeLobbyCheckoutDog(raw: unknown, debugBoard = false): LobbyCheckoutDog | null {
  if (!raw || typeof raw !== "object") return null;
  const dog = raw as Record<string, unknown>;
  const id = typeof dog.id === "string" ? dog.id.trim() : "";
  const dogName = typeof dog.dog_name === "string" ? dog.dog_name.trim() : "";
  if (!id || !dogName) {
    debugBoardLog(debugBoard, "lobby_checkout_dog skipped", { reason: "missing-id-or-name", raw });
    return null;
  }

  const photoFallback = lobbyAssets.dogProfileFallback;
  const photo = safeMediaUrl(dog.dog_photo_url, photoFallback) || null;

  return {
    id,
    gingr_animal_id: typeof dog.gingr_animal_id === "string" ? dog.gingr_animal_id.trim() || null : null,
    dog_name: dogName,
    breed: typeof dog.breed === "string" ? dog.breed.trim() || null : null,
    dog_photo_url: photo,
    checkout_status:
      typeof dog.checkout_status === "string" && dog.checkout_status.trim()
        ? dog.checkout_status.trim()
        : "Ready for Pickup",
    prompted_at: typeof dog.prompted_at === "string" ? dog.prompted_at : null,
    estimated_ready_at: typeof dog.estimated_ready_at === "string" ? dog.estimated_ready_at : null,
    display_until: typeof dog.display_until === "string" ? dog.display_until : null
  };
}

export function sanitizeLobbyCheckouts(raw: {
  featured?: unknown;
  queue?: unknown;
  counts?: unknown;
  last_updated?: unknown;
  error?: unknown;
  basket_filtered?: unknown;
  stale?: unknown;
  debug?: unknown;
}) {
  const featured = sanitizeLobbyCheckoutDog(raw.featured);
  const queue = Array.isArray(raw.queue)
    ? raw.queue
        .map((dog) => sanitizeLobbyCheckoutDog(dog))
        .filter((dog): dog is LobbyCheckoutDog => Boolean(dog))
    : [];

  const countsRaw = raw.counts && typeof raw.counts === "object" ? (raw.counts as Record<string, unknown>) : {};
  const active = Number(countsRaw.active);
  const queueCount = Number(countsRaw.queue);

  return {
    featured,
    queue,
    counts: {
      active: Number.isFinite(active) ? active : (featured ? 1 : 0) + queue.length,
      queue: Number.isFinite(queueCount) ? queueCount : queue.length
    },
    last_updated: typeof raw.last_updated === "string" ? raw.last_updated : new Date().toISOString(),
    basket_filtered: Boolean(raw.basket_filtered),
    stale: Boolean(raw.stale),
    error: typeof raw.error === "string" ? raw.error : undefined,
    debug: raw.debug
  };
}

export function sanitizeSocialMomentAsset(value: unknown, fallback: string, debugBoard = false, field = "asset") {
  const resolved = safeUrl(value, fallback);
  if (resolved !== value && value != null) {
    debugBoardLog(debugBoard, "social_moment asset sanitized", { field, badValue: value, fallback: resolved });
  }
  return resolved || fallback;
}

export function isTechnicalCheckoutError(error: string | undefined) {
  if (!error) return false;
  return /timeout|timed out|unable to load|supabase|fast-checkout|pattern|invalid url|live_transition_dogs/i.test(error);
}

export function userFacingCheckoutMessage(error: string | undefined, hasVisibleCheckouts: boolean) {
  if (!error) return null;
  if (error === "Unauthorized.") {
    return "Lobby display is unauthorized. Open the board with a valid TV token.";
  }
  if (isTechnicalCheckoutError(error)) {
    return hasVisibleCheckouts ? "Live board temporarily refreshing" : null;
  }
  return hasVisibleCheckouts ? "Live board temporarily refreshing" : null;
}

export function getDefaultLobbySettings() {
  return DEFAULT_LOBBY_SETTINGS;
}

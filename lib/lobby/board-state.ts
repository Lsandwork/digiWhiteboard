import { cachedLoadLobbySettings, FAST_CHECKOUT_CACHE_TTL_MS } from "@/lib/board-settings-cache";
import { debugBoardLog, getOrLoadTtlCache, getTtlCache, setTtlCache, withTimeoutFallback } from "@/lib/server-ttl-cache";
import { loadLobbyCheckoutDogs, loadLobbyCheckoutDogsFast } from "@/lib/lobby/checkout";
import { LOBBY_IDLE_SLIDESHOW } from "@/lib/lobby/slideshow";
import { SOCIAL_MOMENTS } from "@/lib/lobby/social-moments";
import {
  getDefaultLobbySettings,
  sanitizeLobbyCheckouts,
  sanitizeLobbySettings,
  sanitizeSocialMomentAsset
} from "@/lib/lobby/validate";
import type { LobbyCheckoutDog, LobbySettings } from "@/lib/lobby/types";
import type { SocialMoment } from "@/lib/lobby/social-moments";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type LobbyBoardStatePayload = {
  board: "lobby";
  settings: LobbySettings;
  checkouts: {
    featured: LobbyCheckoutDog | null;
    queue: LobbyCheckoutDog[];
    counts: { active: number; queue: number };
    last_updated: string;
    basket_filtered: boolean;
    stale: boolean;
    error?: string;
  };
  socialMoments: SocialMoment[];
  serviceSlides: Array<{ src: string; alt: string }>;
  healthy: boolean;
  updatedAt: string;
};

const EMPTY_CHECKOUTS = {
  featured: null,
  queue: [],
  counts: { active: 0, queue: 0 },
  last_updated: "",
  basket_filtered: false,
  stale: false
};

function sanitizeSocialMoments(debugBoard: boolean): SocialMoment[] {
  return SOCIAL_MOMENTS.map((clip) => ({
    ...clip,
    src: sanitizeSocialMomentAsset(clip.src, clip.src, debugBoard, `${clip.id}.src`),
    poster: sanitizeSocialMomentAsset(clip.poster, clip.poster, debugBoard, `${clip.id}.poster`),
    sourceUrl: clip.sourceUrl ? sanitizeSocialMomentAsset(clip.sourceUrl, "", debugBoard, `${clip.id}.sourceUrl`) : null
  })).filter((clip) => clip.src && clip.poster);
}

function sanitizeServiceSlides(debugBoard: boolean) {
  return LOBBY_IDLE_SLIDESHOW.map((slide) => ({
    src: sanitizeSocialMomentAsset(slide.src, slide.src, debugBoard, "service-slide"),
    alt: slide.alt
  })).filter((slide) => slide.src);
}

export async function buildLobbyBoardState(
  supabase: SupabaseClient,
  options: { fast?: boolean; debugBoard?: boolean } = {}
): Promise<LobbyBoardStatePayload> {
  const debugBoard = Boolean(options.debugBoard);
  const now = new Date();
  const nowIso = now.toISOString();

  const settings = await withTimeoutFallback(
    cachedLoadLobbySettings(supabase).then((value) => sanitizeLobbySettings(value, debugBoard)).catch((error) => {
      debugBoardLog(debugBoard, "board-state settings failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      return getDefaultLobbySettings();
    }),
    2500,
    getDefaultLobbySettings()
  );

  let checkoutError: string | undefined;
  let stale = false;

  const checkoutResult = await getOrLoadTtlCache(
    options.fast ? "lobby-board-state:fast" : "lobby-board-state:full",
    FAST_CHECKOUT_CACHE_TTL_MS,
    async () => {
      if (options.fast) return loadLobbyCheckoutDogsFast(supabase, now);
      return loadLobbyCheckoutDogs(supabase, settings.max_queue_count, now);
    }
  ).catch((error) => {
    checkoutError = error instanceof Error ? error.message : "Unable to load lobby checkouts.";
    stale = true;
    return null;
  });

  const sanitizedCheckouts = sanitizeLobbyCheckouts({
    featured: checkoutResult?.featured ?? null,
    queue: checkoutResult?.queue ?? [],
    counts: {
      active: checkoutResult?.activeCount ?? 0,
      queue: checkoutResult?.queue.length ?? 0
    },
    last_updated: nowIso,
    basket_filtered: checkoutResult?.basket_filtered ?? false,
    stale,
    error: checkoutError
  });

  const healthy = !checkoutError && sanitizedCheckouts.counts.active >= 0;

  return {
    board: "lobby",
    settings,
    checkouts: sanitizedCheckouts,
    socialMoments: sanitizeSocialMoments(debugBoard),
    serviceSlides: sanitizeServiceSlides(debugBoard),
    healthy,
    updatedAt: nowIso
  };
}

export async function loadLobbyBoardState(
  supabase: SupabaseClient,
  options: { fast?: boolean; debugBoard?: boolean } = {}
) {
  const cacheKey = `board-state:lobby:${options.fast ? "fast" : "full"}`;
  const lastGoodKey = `${cacheKey}:last-good`;

  try {
    const payload = await getOrLoadTtlCache(cacheKey, FAST_CHECKOUT_CACHE_TTL_MS, () =>
      buildLobbyBoardState(supabase, options)
    );
    setTtlCache(lastGoodKey, payload, 120_000);
    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load lobby board state.";
    const lastGood = getTtlCache<LobbyBoardStatePayload>(lastGoodKey);
    if (lastGood) {
      return {
        ...lastGood,
        checkouts: {
          ...lastGood.checkouts,
          stale: true,
          error: message
        },
        healthy: false,
        updatedAt: new Date().toISOString()
      };
    }

    return {
      board: "lobby" as const,
      settings: getDefaultLobbySettings(),
      checkouts: {
        ...EMPTY_CHECKOUTS,
        last_updated: new Date().toISOString(),
        stale: true,
        error: message
      },
      socialMoments: sanitizeSocialMoments(Boolean(options.debugBoard)),
      serviceSlides: sanitizeServiceSlides(Boolean(options.debugBoard)),
      healthy: false,
      updatedAt: new Date().toISOString()
    };
  }
}

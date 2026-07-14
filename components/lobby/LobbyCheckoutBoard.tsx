"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LobbyClassSchedule } from "@/components/lobby/LobbyClassSchedule";
import { LobbyFeaturedCard } from "@/components/lobby/LobbyFeaturedCard";
import { LobbyHeader } from "@/components/lobby/LobbyHeader";
import { LobbyQueueList } from "@/components/lobby/LobbyQueueList";
import { LobbyValuesFooter } from "@/components/lobby/LobbyValuesFooter";
import { SocialMomentsCarousel } from "@/components/lobby/SocialMomentsCarousel";
import { TvLayoutCanvas } from "@/components/display/TvLayoutCanvas";
import { CastModeStatusIndicator, type CastModeStatus } from "@/components/display/CastModeStatusIndicator";
import { LobbyDebugPanel } from "@/components/lobby/LobbyDebugPanel";
import { LobbyIdleSlideshow } from "@/components/lobby/LobbyIdleSlideshow";
import { LobbyAssetImage } from "@/components/lobby/LobbyAssetImage";
import { lobbyLightAssets } from "@/lib/lobby/assets";
import {
  BOARD_CHECKOUT_POLL_MS,
  BOARD_FAST_FETCH_TIMEOUT_MS,
  BOARD_FULL_SYNC_POLL_MS,
  BOARD_REALTIME_DEBOUNCE_MS,
  BOARD_SETTINGS_POLL_MS,
  clampCheckoutPollMs
} from "@/lib/board-checkout-merge";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useInFlightPoll } from "@/hooks/useInFlightPoll";
import {
  areLobbyCheckoutsDisplayEqual,
  stabilizeLobbyCheckoutsResponse
} from "@/lib/lobby-display-stable";
import {
  areStickyLobbyStatesEqual,
  expireStickyLobbyCheckouts,
  mergeStickyLobbyCheckouts,
  stickyLobbyStateToResponse,
  type StickyLobbyCheckoutState
} from "@/lib/lobby-sticky-checkout";
import { debugBoardClient } from "@/lib/board-debug";
import {
  getDefaultLobbySettings,
  sanitizeLobbyCheckouts,
  sanitizeLobbySettings,
  userFacingCheckoutMessage
} from "@/lib/lobby/validate";
import { rememberLobbyBoardHealthyState } from "@/components/lobby/LobbyErrorBoundary";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { useLobbyCheckoutTimers } from "@/hooks/useLobbyCheckoutTimers";
import { useCastKeeperContext } from "@/hooks/useCastKeeper";
import { useDisplaySync } from "@/hooks/useDisplaySync";
import { useCastModeRuntime } from "@/hooks/useCastModeRuntime";
import { useDogPhotoPreloader } from "@/hooks/useDogPhotoPreloader";
import type { LobbyCheckoutDebug, LobbyCheckoutsResponse, LobbySettings, LobbyStatusResponse } from "@/lib/lobby/types";

const defaultSettings: LobbySettings = getDefaultLobbySettings();

const emptyCheckouts: LobbyCheckoutsResponse = {
  featured: null,
  queue: [],
  counts: { active: 0, queue: 0 },
  last_updated: ""
};

type LobbyDisplayMode = "IDLE" | "CHECKOUT_ACTIVE";

const LOBBY_EMPTY_CHECKOUT_GRACE_MS = 25_000;

function freshBoardUrl(url: string) {
  return `${url}${url.includes("?") ? "&" : "?"}fresh=1`;
}

function normalizeCheckoutsResponse(body: Partial<LobbyCheckoutsResponse> | null | undefined): LobbyCheckoutsResponse {
  const sanitized = sanitizeLobbyCheckouts(body ?? {});
  return {
    featured: sanitized.featured,
    queue: sanitized.queue,
    counts: sanitized.counts,
    last_updated: sanitized.last_updated,
    basket_filtered: sanitized.basket_filtered,
    error: sanitized.error
  };
}

function checkoutDogsFromResponse(response: LobbyCheckoutsResponse) {
  return [...(response.featured ? [response.featured] : []), ...(response.queue ?? [])];
}

export function LobbyCheckoutBoard({
  embeddedDisplayToken,
  castKeeperMode = false
}: {
  embeddedDisplayToken?: string;
  castKeeperMode?: boolean;
}) {
  const searchParams = useSearchParams();
  const castKeeper = useCastKeeperContext();
  const debugBoard = searchParams.get("debugBoard") === "1";
  const tvModeFromUrl = searchParams.get("display") !== "desktop";
  const castMode = castKeeperMode || searchParams.get("castMode") === "1" || searchParams.get("chromecast") === "1";
  const displayToken = searchParams.get("token")?.trim() ?? embeddedDisplayToken?.trim() ?? "";
  const showTvLayout = castKeeperMode || tvModeFromUrl;

  const [nowMs, setNowMs] = useState(0);
  const [settings, setSettings] = useState<LobbySettings>(defaultSettings);
  const [rawCheckouts, setRawCheckouts] = useState<LobbyCheckoutsResponse>(emptyCheckouts);
  const [checkouts, setCheckouts] = useState<LobbyCheckoutsResponse>(emptyCheckouts);
  const [displayMode, setDisplayMode] = useState<LobbyDisplayMode>("IDLE");
  const [healthy, setHealthy] = useState(true);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [lastFastFetchAt, setLastFastFetchAt] = useState<string | null>(null);
  const [lastFullFetchAt, setLastFullFetchAt] = useState<string | null>(null);
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState<string | null>(null);
  const [lastEmptySyncAt, setLastEmptySyncAt] = useState<string | null>(null);
  const [fastDebug, setFastDebug] = useState<LobbyCheckoutDebug | undefined>();
  const [fullDebug, setFullDebug] = useState<LobbyCheckoutDebug | undefined>();

  const checkoutsRef = useRef(checkouts);
  const stickyCheckoutRef = useRef<StickyLobbyCheckoutState>(new Map());
  const checkoutBasketFilteredRef = useRef(false);
  const checkoutBasketEmptyRef = useRef(false);
  const lastEmptySyncAtMsRef = useRef<number | null>(null);
  const emptyBasketStreakRef = useRef(0);

  useEffect(() => {
    checkoutsRef.current = checkouts;
  }, [checkouts]);

  const requestHeaders = useMemo(() => {
    const headers: Record<string, string> = {};
    if (displayToken) headers["x-lobby-display-token"] = displayToken;
    return headers;
  }, [displayToken]);

  const runFastPoll = useInFlightPoll();
  const runFullPoll = useInFlightPoll();

  const fastCheckoutEndpoint = debugBoard ? "/api/lobby/checkouts?fast=1&debugBoard=1" : "/api/lobby/checkouts?fast=1";
  const fullCheckoutEndpoint = debugBoard ? "/api/lobby/checkouts?debugBoard=1" : "/api/lobby/checkouts";
  const checkoutPollMs = clampCheckoutPollMs(settings.refresh_interval_ms || BOARD_CHECKOUT_POLL_MS);

  const applyCheckoutUpdate = useCallback((incoming: LobbyCheckoutsResponse, source: "fast" | "full") => {
    const now = Date.now();
    const syncIso = new Date(now).toISOString();
    const incomingDogs = checkoutDogsFromResponse(incoming);
    const currentHasCheckout = stickyCheckoutRef.current.size > 0;

    setRawCheckouts(incoming);
    setLastSuccessfulSyncAt(syncIso);

    if (incomingDogs.length > 0) {
      lastEmptySyncAtMsRef.current = null;
      setLastEmptySyncAt(null);
      setDisplayMode("CHECKOUT_ACTIVE");
    } else {
      if (lastEmptySyncAtMsRef.current == null) {
        lastEmptySyncAtMsRef.current = now;
        setLastEmptySyncAt(syncIso);
      }
    }

    checkoutBasketFilteredRef.current = Boolean(incoming.basket_filtered);
    if (incoming.basket_filtered && incomingDogs.length === 0) {
      emptyBasketStreakRef.current += 1;
    } else {
      emptyBasketStreakRef.current = 0;
    }

    const emptyGraceActive =
      currentHasCheckout &&
      incomingDogs.length === 0 &&
      lastEmptySyncAtMsRef.current != null &&
      now - lastEmptySyncAtMsRef.current < LOBBY_EMPTY_CHECKOUT_GRACE_MS;
    checkoutBasketEmptyRef.current = emptyBasketStreakRef.current >= 2 && !emptyGraceActive;

    const nextSticky = mergeStickyLobbyCheckouts(
      stickyCheckoutRef.current,
      incoming,
      now,
      {
        basketAuthoritative: checkoutBasketFilteredRef.current,
        basketConfirmedEmpty: checkoutBasketEmptyRef.current,
        pruneMissingFromBasket: source === "full" && !emptyGraceActive,
        skipExpiry: true
      }
    );

    if (areStickyLobbyStatesEqual(stickyCheckoutRef.current, nextSticky)) {
      return;
    }

    stickyCheckoutRef.current = nextSticky;
    const stickyResponse = stabilizeLobbyCheckoutsResponse(
      stickyLobbyStateToResponse(
        stickyCheckoutRef.current,
        incoming.last_updated || new Date().toISOString()
      )
    );

    if (areLobbyCheckoutsDisplayEqual(checkoutsRef.current, stickyResponse)) {
      return;
    }

    setCheckouts(stickyResponse);
    checkoutsRef.current = stickyResponse;
    setDisplayMode(stickyResponse.featured || stickyResponse.queue.length ? "CHECKOUT_ACTIVE" : "IDLE");
  }, []);

  const loadFastLobbyCheckouts = useCallback(async (options: { fresh?: boolean } = {}) => {
    await runFastPoll(async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), BOARD_FAST_FETCH_TIMEOUT_MS);

      try {
        const checkoutsRes = await fetch(options.fresh ? freshBoardUrl(fastCheckoutEndpoint) : fastCheckoutEndpoint, {
          cache: "no-store",
          headers: requestHeaders,
          signal: controller.signal
        });
        const checkoutBody = normalizeCheckoutsResponse((await checkoutsRes.json()) as Partial<LobbyCheckoutsResponse>);

        if (checkoutsRes.ok && !checkoutBody.error) {
          applyCheckoutUpdate(checkoutBody, "fast");
          setFastDebug(checkoutBody.debug);
          setLastFastFetchAt(new Date().toISOString());
          setRefreshMessage(null);
          setHealthy(true);
          if (castKeeperMode) castKeeper?.markDataFresh();
        }
      } catch {
        // Keep the last good lobby checkout data when a fast refresh fails.
      } finally {
        window.clearTimeout(timeout);
      }
    });
  }, [applyCheckoutUpdate, castKeeper, castKeeperMode, fastCheckoutEndpoint, requestHeaders, runFastPoll]);

  const loadLobbyCheckouts = useCallback(async () => {
    await runFullPoll(async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), BOARD_FAST_FETCH_TIMEOUT_MS * 2);

      try {
        const checkoutsRes = await fetch(fullCheckoutEndpoint, {
          cache: "no-store",
          headers: requestHeaders,
          signal: controller.signal
        });
        const checkoutBody = normalizeCheckoutsResponse((await checkoutsRes.json()) as Partial<LobbyCheckoutsResponse>);

        if (checkoutsRes.ok && !checkoutBody.error) {
          applyCheckoutUpdate(checkoutBody, "full");
          setFullDebug(checkoutBody.debug);
          setLastFullFetchAt(new Date().toISOString());
          setRefreshMessage(null);
          setHealthy(true);
          if (castKeeperMode) castKeeper?.markDataFresh();
        } else {
          const hasVisibleCheckouts = Boolean(checkoutsRef.current.featured || checkoutsRef.current.queue.length);
          const message = userFacingCheckoutMessage(checkoutBody.error, hasVisibleCheckouts);
          if (message) {
            setRefreshMessage(message);
          } else {
            setRefreshMessage(null);
          }
          if (!hasVisibleCheckouts) {
            setHealthy(true);
          } else if (message) {
            setHealthy(false);
          }
          if (debugBoard && checkoutBody.error) {
            debugBoardClient(true, "lobby-checkouts", "full sync kept last-good board", {
              error: checkoutBody.error,
              stale: Boolean((checkoutBody as { stale?: boolean }).stale),
              hasVisibleCheckouts
            });
          }
        }
      } catch {
        const hasVisibleCheckouts = Boolean(checkoutsRef.current.featured || checkoutsRef.current.queue.length);
        if (!hasVisibleCheckouts) {
          setHealthy(true);
          setRefreshMessage(null);
        } else {
          setHealthy(false);
          setRefreshMessage("Live board temporarily refreshing");
        }
      } finally {
        window.clearTimeout(timeout);
      }
    });
  }, [applyCheckoutUpdate, castKeeper, castKeeperMode, debugBoard, fullCheckoutEndpoint, requestHeaders, runFullPoll]);

  const loadLobbyMeta = useCallback(async () => {
    try {
      const [settingsRes, statusRes] = await Promise.all([
        fetch("/api/lobby/settings", { cache: "no-store", headers: requestHeaders }),
        fetch("/api/lobby/status", { cache: "no-store", headers: requestHeaders })
      ]);

      if (settingsRes.ok) {
        const body = (await settingsRes.json()) as { settings?: LobbySettings };
        if (body.settings) {
          const sanitized = sanitizeLobbySettings(body.settings, debugBoard);
          setSettings((current) => {
            const nextRefresh = clampCheckoutPollMs(sanitized.refresh_interval_ms ?? current.refresh_interval_ms);
            const next = {
              ...current,
              ...sanitized,
              refresh_interval_ms: nextRefresh
            };
            if (
              current.refresh_interval_ms === next.refresh_interval_ms &&
              current.max_queue_count === next.max_queue_count &&
              current.show_promotions === next.show_promotions &&
              current.show_events === next.show_events &&
              current.footer_message === next.footer_message &&
              current.lobby_message === next.lobby_message
            ) {
              return current;
            }
            return next;
          });
          rememberLobbyBoardHealthyState(sanitized.footer_message);
        }
      }

      if (statusRes.ok) {
        const body = (await statusRes.json()) as LobbyStatusResponse;
        setHealthy(body.healthy || (!checkoutsRef.current.featured && !checkoutsRef.current.queue.length));
        setSettings((current) => {
          const nextRefresh = clampCheckoutPollMs(body.refresh_interval_ms);
          if (current.refresh_interval_ms === nextRefresh) return current;
          return { ...current, refresh_interval_ms: nextRefresh };
        });
      }
    } catch {
      // Checkout polling owns the visible error state.
    }
  }, [debugBoard, requestHeaders]);

  const loadLobbyData = useCallback(async () => {
    await Promise.all([loadLobbyCheckouts(), loadFastLobbyCheckouts(), loadLobbyMeta()]);
  }, [loadFastLobbyCheckouts, loadLobbyCheckouts, loadLobbyMeta]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadLobbyData(), 0);
    return () => window.clearTimeout(initial);
  }, [loadLobbyData]);

  useEffect(() => {
    const next = expireStickyLobbyCheckouts(stickyCheckoutRef.current, nowMs);
    if (!areStickyLobbyStatesEqual(stickyCheckoutRef.current, next)) {
      stickyCheckoutRef.current = next;
      const stickyResponse = stabilizeLobbyCheckoutsResponse(
        stickyLobbyStateToResponse(
          next,
          checkoutsRef.current.last_updated || new Date().toISOString()
        )
      );
      if (!areLobbyCheckoutsDisplayEqual(checkoutsRef.current, stickyResponse)) {
        setCheckouts(stickyResponse);
        checkoutsRef.current = stickyResponse;
        setDisplayMode(stickyResponse.featured || stickyResponse.queue.length ? "CHECKOUT_ACTIVE" : "IDLE");
      }
    }
  }, [nowMs]);

  useEffect(() => {
    const initialClock = window.setTimeout(() => {
      setNowMs(Date.now());
    }, 0);
    const clockTimer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearTimeout(initialClock);
      window.clearInterval(clockTimer);
    };
  }, []);

  const debouncedRefreshCheckouts = useDebouncedCallback(() => {
    // Bypass the short server cache after a DB event so the event-triggered
    // refresh cannot receive the snapshot from just before the dog appeared.
    void loadFastLobbyCheckouts({ fresh: true });
  }, BOARD_REALTIME_DEBOUNCE_MS);

  useEffect(() => {
    // Cast/remote displays need the same quick fallback as direct boards when
    // Realtime is unavailable. The API's short TTL still deduplicates callers.
    const fastPollIntervalMs = castKeeperMode ? BOARD_CHECKOUT_POLL_MS : checkoutPollMs;
    const fullPollIntervalMs = castKeeperMode ? 60_000 : BOARD_FULL_SYNC_POLL_MS;
    const fastPollTimer = window.setInterval(() => void loadFastLobbyCheckouts(), fastPollIntervalMs);
    const fullPollTimer = window.setInterval(() => void loadLobbyCheckouts(), fullPollIntervalMs);
    return () => {
      window.clearInterval(fastPollTimer);
      window.clearInterval(fullPollTimer);
    };
  }, [castKeeperMode, checkoutPollMs, loadFastLobbyCheckouts, loadLobbyCheckouts]);

  useEffect(() => {
    if (castKeeperMode) return;
    const metaTimer = window.setInterval(() => void loadLobbyMeta(), BOARD_SETTINGS_POLL_MS);
    return () => window.clearInterval(metaTimer);
  }, [castKeeperMode, loadLobbyMeta]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let reconnectTimer: number | null = null;
    let reconnectDelayMs = 5_000;
    let cancelled = false;

    const subscribe = () => {
      if (cancelled) return;

      channel = supabase
        .channel(`lobby-live-transition-dogs-${castKeeperMode ? "cast" : "board"}-${Date.now()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "live_transition_dogs" }, () => {
          debouncedRefreshCheckouts();
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            reconnectDelayMs = 5_000;
            return;
          }

          if (castKeeperMode) {
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            reconnectTimer = window.setTimeout(() => {
              if (channel) void supabase.removeChannel(channel);
              subscribe();
            }, reconnectDelayMs);
            reconnectDelayMs = Math.min(reconnectDelayMs * 2, 60_000);
          }
        });
    };

    subscribe();

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [castKeeperMode, debouncedRefreshCheckouts]);

  const displayCheckouts = useMemo(() => stabilizeLobbyCheckoutsResponse(checkouts), [checkouts]);
  const { featured, queue, hasCheckout } = useLobbyCheckoutTimers(displayCheckouts, nowMs);
  const checkoutActive = displayMode === "CHECKOUT_ACTIVE" && hasCheckout;
  const idleCarouselPaused = checkoutActive;
  const activeCheckoutDog = checkoutActive ? featured ?? queue[0] ?? null : null;
  const rawCheckoutCount = checkoutDogsFromResponse(rawCheckouts).length;
  const activeCheckoutStartedAt = activeCheckoutDog?.prompted_at ?? null;
  const activeCheckoutExpiresAt = activeCheckoutDog?.display_until ?? null;
  const activePollingIntervalCount = castKeeperMode ? 2 : 3;
  const footerMessage = settings.footer_message ?? defaultSettings.footer_message;
  const castHealth: CastModeStatus =
    !healthy && !lastFastFetchAt && !lastFullFetchAt
      ? "offline"
      : refreshMessage || castKeeper?.connection === "reconnecting"
        ? "reconnecting"
        : "live";
  const castDogPhotoUrls = useMemo(
    () => [
      featured?.dog_photo_url,
      queue[0]?.dog_photo_url,
      queue[1]?.dog_photo_url,
      queue[2]?.dog_photo_url
    ],
    [featured?.dog_photo_url, queue]
  );
  useDogPhotoPreloader(castDogPhotoUrls, { enabled: castMode, debugBoard, width: 640 });
  useCastModeRuntime({
    enabled: castMode,
    boardType: "lobby",
    debugBoard,
    health: castHealth,
    onFallbackRefresh: () => window.location.reload()
  });

  useEffect(() => {
    const photoUrl = activeCheckoutDog?.dog_photo_url?.trim();
    if (!photoUrl || typeof window === "undefined") return;
    const image = new window.Image();
    image.decoding = "async";
    image.src = photoUrl;
  }, [activeCheckoutDog?.dog_photo_url]);

  useEffect(() => {
    if (!castKeeperMode) return;
    const handleRefresh = () => {
      void loadLobbyData();
    };
    window.addEventListener("fitdog-cast-keeper-refresh", handleRefresh);
    return () => window.removeEventListener("fitdog-cast-keeper-refresh", handleRefresh);
  }, [castKeeperMode, loadLobbyData]);

  useDisplaySync({
    enabled: !castKeeperMode,
    onContentUpdate: () => {
      void loadLobbyMeta();
      void loadLobbyCheckouts();
      void loadFastLobbyCheckouts();
    }
  });

  useEffect(() => {
    if (!castKeeperMode) return;
    if (healthy && !refreshMessage && (lastFullFetchAt || lastFastFetchAt)) {
      castKeeper?.markDataFresh();
    }
  }, [castKeeper, castKeeperMode, healthy, lastFastFetchAt, lastFullFetchAt, refreshMessage]);

  useEffect(() => {
    if (!showTvLayout) return;

    document.documentElement.classList.add("lobby-tv-display");

    return () => {
      document.documentElement.classList.remove("lobby-tv-display");
    };
  }, [showTvLayout]);

  return (
    <main
      className={`lobby-shell lobby-shell--light ${showTvLayout ? "lobby-tv-mode" : ""} ${castKeeperMode ? "cast-keeper-board" : ""} ${castMode ? "fitdog-cast-board" : ""} ${checkoutActive ? "lobby-has-checkout" : "lobby-idle-state"}`}
    >
      <div className="lobby-background lobby-background--light" aria-hidden />
      {castMode ? <CastModeStatusIndicator status={castHealth} /> : null}

      <TvLayoutCanvas enabled={showTvLayout} className="fitdog-tv-stage--lobby">
        <div className={`lobby-content relative z-10 flex min-h-screen flex-col px-6 py-4 ${showTvLayout ? "fitdog-lobby-canvas-inner" : ""}`}>
        <LobbyHeader healthy={healthy && !refreshMessage} hasCheckout={checkoutActive} />

        {refreshMessage ? (
          <div className="lobby-refresh-banner mt-2 rounded-lg px-4 py-2 text-center text-sm">
            {refreshMessage}
          </div>
        ) : null}

        <div className="lobby-main-grid mt-3 grid min-h-0 flex-1 grid-cols-[1.75fr_1fr] gap-4">
          <div
            className="lobby-checkout-column flex min-h-0 flex-col gap-3"
            data-queue-size={queue.length}
          >
            {checkoutActive && featured ? (
              <LobbyFeaturedCard key={featured.gingr_animal_id ?? featured.id} dog={featured} />
            ) : (
              <section className="lobby-panel lobby-idle-checkout-slot overflow-hidden">
                <LobbyIdleSlideshow tvMode={showTvLayout} />
              </section>
            )}

            {checkoutActive ? <LobbyQueueList dogs={queue} /> : null}

            {settings.show_events ? (
              <LobbyClassSchedule compact={checkoutActive} schedule={settings.class_schedule} />
            ) : null}
          </div>

          {settings.show_promotions ? (
            <SocialMomentsCarousel paused={idleCarouselPaused} performanceMode={castMode} />
          ) : (
            <section className="lobby-panel flex items-center justify-center p-6 text-center text-lobby-navy">
              <div>
                <LobbyAssetImage src={lobbyLightAssets.dogLogoExact} alt="" width={96} height={96} className="mx-auto h-20 w-20 object-contain" />
                <p className="mt-3 font-semibold">Social Media Moments</p>
              </div>
            </section>
          )}
        </div>

        <LobbyValuesFooter footerMessage={footerMessage} />
        </div>
      </TvLayoutCanvas>

      {debugBoard ? (
        <LobbyDebugPanel
          fastEndpoint={fastCheckoutEndpoint}
          fullEndpoint={fullCheckoutEndpoint}
          lastFastFetchAt={lastFastFetchAt}
          lastFullFetchAt={lastFullFetchAt}
          fastDebug={fastDebug}
          fullDebug={fullDebug}
          checkouts={checkouts}
          rawCheckoutCount={rawCheckoutCount}
          visibleCheckoutCount={(featured ? 1 : 0) + queue.length}
          checkoutPollMs={checkoutPollMs}
          displayMode={displayMode}
          activeCheckoutDogName={activeCheckoutDog?.dog_name ?? null}
          activeCheckoutDogId={activeCheckoutDog?.gingr_animal_id ?? activeCheckoutDog?.id ?? null}
          activeCheckoutStartedAt={activeCheckoutStartedAt}
          activeCheckoutExpiresAt={activeCheckoutExpiresAt}
          lastSuccessfulSyncAt={lastSuccessfulSyncAt}
          lastEmptySyncAt={lastEmptySyncAt}
          idleCarouselPaused={idleCarouselPaused}
          activePollingIntervalCount={activePollingIntervalCount}
        />
      ) : null}
    </main>
  );
}

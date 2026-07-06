"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { LobbyClassSchedule } from "@/components/lobby/LobbyClassSchedule";
import { LobbyFeaturedCard } from "@/components/lobby/LobbyFeaturedCard";
import { LobbyHeader } from "@/components/lobby/LobbyHeader";
import { LobbyQueueList } from "@/components/lobby/LobbyQueueList";
import { SocialMomentsCarousel } from "@/components/lobby/SocialMomentsCarousel";
import { LobbyCastButton } from "@/components/lobby/LobbyCastButton";
import { LobbyDebugPanel } from "@/components/lobby/LobbyDebugPanel";
import { LobbyIdleSlideshow } from "@/components/lobby/LobbyIdleSlideshow";
import { LobbyAssetImage } from "@/components/lobby/LobbyAssetImage";
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
  mergeStickyLobbyCheckouts,
  stickyLobbyStateToResponse,
  type StickyLobbyCheckoutState
} from "@/lib/lobby-sticky-checkout";
import { lobbyAssets } from "@/lib/lobby/assets";
import type { LobbyCheckoutDebug, LobbyCheckoutsResponse, LobbySettings, LobbyStatusResponse } from "@/lib/lobby/types";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { useLobbyCheckoutTimers } from "@/hooks/useLobbyCheckoutTimers";
import { useLobbyTvCast } from "@/hooks/useLobbyTvCast";
import { useDisplaySync } from "@/hooks/useDisplaySync";

const defaultSettings: LobbySettings = {
  max_queue_count: 6,
  refresh_interval_ms: 3000,
  show_promotions: true,
  show_events: true,
  footer_message: "Thanks for being part of the Fitdog family. We'll take care of the rest.",
  lobby_message: "Thank you for letting us play, care & connect!"
};

const emptyCheckouts: LobbyCheckoutsResponse = {
  featured: null,
  queue: [],
  counts: { active: 0, queue: 0 },
  last_updated: ""
};

function normalizeCheckoutsResponse(body: Partial<LobbyCheckoutsResponse> | null | undefined): LobbyCheckoutsResponse {
  return {
    featured: body?.featured ?? null,
    queue: body?.queue ?? [],
    counts: body?.counts ?? { active: 0, queue: 0 },
    last_updated: body?.last_updated ?? "",
    error: body?.error
  };
}

export function LobbyCheckoutBoard({ embeddedDisplayToken }: { embeddedDisplayToken?: string }) {
  const searchParams = useSearchParams();
  const debugBoard = searchParams.get("debugBoard") === "1";
  const tvModeFromUrl = searchParams.get("display") !== "desktop";
  const displayToken = searchParams.get("token")?.trim() ?? embeddedDisplayToken?.trim() ?? "";
  const {
    isTvLayout,
    showCastActive,
    castError,
    canCast,
    castUrl,
    castMethod,
    toggleTvCast,
    startChromecast,
    startWirelessCast,
    startAirPlayCast,
    copyCastUrl,
    stopTvCast,
    setCastError
  } = useLobbyTvCast(tvModeFromUrl, displayToken);

  const runCastAction = useCallback(async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start casting.";
      const cancelled = /cancel|abort|denied/i.test(message);
      if (!cancelled) {
        setCastError(message);
      }
    }
  }, [setCastError]);

  const [clock, setClock] = useState(() => new Date());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [settings, setSettings] = useState<LobbySettings>(defaultSettings);
  const [checkouts, setCheckouts] = useState<LobbyCheckoutsResponse>(emptyCheckouts);
  const [healthy, setHealthy] = useState(true);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [lastFastFetchAt, setLastFastFetchAt] = useState<string | null>(null);
  const [lastFullFetchAt, setLastFullFetchAt] = useState<string | null>(null);
  const [fastDebug, setFastDebug] = useState<LobbyCheckoutDebug | undefined>();
  const [fullDebug, setFullDebug] = useState<LobbyCheckoutDebug | undefined>();

  const checkoutsRef = useRef(checkouts);
  const stickyCheckoutRef = useRef<StickyLobbyCheckoutState>(new Map());

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

  const applyCheckoutUpdate = useCallback((incoming: LobbyCheckoutsResponse) => {
    stickyCheckoutRef.current = mergeStickyLobbyCheckouts(
      stickyCheckoutRef.current,
      incoming,
      Date.now()
    );
    const stickyResponse = stickyLobbyStateToResponse(
      stickyCheckoutRef.current,
      incoming.last_updated || new Date().toISOString()
    );
    setCheckouts(stickyResponse);
    checkoutsRef.current = stickyResponse;
  }, []);

  const loadFastLobbyCheckouts = useCallback(async () => {
    await runFastPoll(async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), BOARD_FAST_FETCH_TIMEOUT_MS);

      try {
        const checkoutsRes = await fetch(fastCheckoutEndpoint, {
          cache: "no-store",
          headers: requestHeaders,
          signal: controller.signal
        });
        const checkoutBody = normalizeCheckoutsResponse((await checkoutsRes.json()) as Partial<LobbyCheckoutsResponse>);

        if (checkoutsRes.ok && !checkoutBody.error) {
          applyCheckoutUpdate(checkoutBody);
          setFastDebug(checkoutBody.debug);
          setLastFastFetchAt(new Date().toISOString());
          setRefreshMessage(null);
          setHealthy(true);
        }
      } catch {
        // Keep the last good lobby checkout data when a fast refresh fails.
      } finally {
        window.clearTimeout(timeout);
      }
    });
  }, [applyCheckoutUpdate, fastCheckoutEndpoint, requestHeaders, runFastPoll]);

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
          applyCheckoutUpdate(checkoutBody);
          setFullDebug(checkoutBody.debug);
          setLastFullFetchAt(new Date().toISOString());
          setRefreshMessage(null);
          setHealthy(true);
        } else if (checkoutsRef.current.featured || checkoutsRef.current.queue.length) {
          setRefreshMessage(checkoutBody.error ?? "Live board temporarily refreshing");
        } else {
          setCheckouts(checkoutBody);
          const message =
            checkoutBody.error === "Unauthorized."
              ? "Lobby display is unauthorized. Open the board with a valid TV token."
              : (checkoutBody.error ?? "Live board temporarily refreshing");
          setRefreshMessage(message);
          setHealthy(false);
        }
      } catch {
        if (!checkoutsRef.current.featured && !checkoutsRef.current.queue.length) {
          setHealthy(false);
        }
        setRefreshMessage("Live board temporarily refreshing");
      } finally {
        window.clearTimeout(timeout);
      }
    });
  }, [applyCheckoutUpdate, fullCheckoutEndpoint, requestHeaders, runFullPoll]);

  const loadLobbyMeta = useCallback(async () => {
    try {
      const [settingsRes, statusRes] = await Promise.all([
        fetch("/api/lobby/settings", { cache: "no-store", headers: requestHeaders }),
        fetch("/api/lobby/status", { cache: "no-store", headers: requestHeaders })
      ]);

      if (settingsRes.ok) {
        const body = (await settingsRes.json()) as { settings: LobbySettings };
        if (body.settings) setSettings(body.settings);
      }

      if (statusRes.ok) {
        const body = (await statusRes.json()) as LobbyStatusResponse;
        setHealthy(body.healthy);
        setSettings((current) => ({
          ...current,
          refresh_interval_ms: clampCheckoutPollMs(body.refresh_interval_ms)
        }));
      }
    } catch {
      // Checkout polling owns the visible error state.
    }
  }, [requestHeaders]);

  const loadLobbyData = useCallback(async () => {
    await Promise.all([loadLobbyCheckouts(), loadFastLobbyCheckouts(), loadLobbyMeta()]);
  }, [loadFastLobbyCheckouts, loadLobbyCheckouts, loadLobbyMeta]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadLobbyData(), 0);
    return () => window.clearTimeout(initial);
  }, [loadLobbyData]);

  useEffect(() => {
    const clockTimer = window.setInterval(() => {
      setClock(new Date());
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(clockTimer);
  }, []);

  const debouncedRefreshCheckouts = useDebouncedCallback(() => {
    void loadFastLobbyCheckouts();
  }, BOARD_REALTIME_DEBOUNCE_MS);

  useEffect(() => {
    const fastPollTimer = window.setInterval(() => void loadFastLobbyCheckouts(), checkoutPollMs);
    const fullPollTimer = window.setInterval(() => void loadLobbyCheckouts(), BOARD_FULL_SYNC_POLL_MS);
    return () => {
      window.clearInterval(fastPollTimer);
      window.clearInterval(fullPollTimer);
    };
  }, [checkoutPollMs, loadFastLobbyCheckouts, loadLobbyCheckouts]);

  useEffect(() => {
    const metaTimer = window.setInterval(() => void loadLobbyMeta(), BOARD_SETTINGS_POLL_MS);
    return () => window.clearInterval(metaTimer);
  }, [loadLobbyMeta]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel("lobby-live-transition-dogs")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_transition_dogs" }, () => {
        debouncedRefreshCheckouts();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [debouncedRefreshCheckouts]);

  const { featured, queue, hasCheckout } = useLobbyCheckoutTimers(checkouts, nowMs);
  const footerMessage = settings.footer_message ?? defaultSettings.footer_message;
  const showIdleSlideshow = !hasCheckout;

  useDisplaySync({
    onContentUpdate: () => {
      void loadLobbyMeta();
    }
  });

  useEffect(() => {
    if (!isTvLayout) return;

    document.documentElement.classList.add("lobby-tv-display");

    const viewportMeta = document.querySelector('meta[name="viewport"]');
    const previousViewport = viewportMeta?.getAttribute("content") ?? null;
    viewportMeta?.setAttribute("content", "width=1920, initial-scale=1");

    return () => {
      document.documentElement.classList.remove("lobby-tv-display");
      if (previousViewport) {
        viewportMeta?.setAttribute("content", previousViewport);
      }
    };
  }, [isTvLayout]);

  return (
    <main
      className={`lobby-shell ${isTvLayout ? "lobby-tv-mode" : ""} ${hasCheckout ? "lobby-has-checkout" : "lobby-idle-state"}`}
    >
      <Image src={lobbyAssets.background} alt="" fill priority className="lobby-background object-cover" unoptimized />

      <LobbyCastButton
        castUrl={castUrl}
        isCasting={showCastActive}
        castError={castError}
        canCast={canCast}
        castMethod={castMethod}
        onToggle={() => void runCastAction(toggleTvCast)}
        onChromecast={() => void runCastAction(startChromecast)}
        onWireless={() => void runCastAction(startWirelessCast)}
        onAirPlay={() => void runCastAction(startAirPlayCast)}
        onCopyUrl={() => void runCastAction(copyCastUrl)}
        onStop={() => void runCastAction(stopTvCast)}
      />

      <div className="lobby-content relative z-10 flex min-h-screen flex-col px-8 py-5">
        <LobbyHeader clock={clock} healthy={healthy && !refreshMessage} hasCheckout={hasCheckout} />

        {refreshMessage ? (
          <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-sm text-amber-100">
            {refreshMessage}
          </div>
        ) : null}

        <div className="lobby-main-grid mt-4 grid min-h-0 flex-1 grid-cols-[1.75fr_1fr] gap-5">
          <div
            className={`flex min-h-0 flex-col gap-4 ${hasCheckout ? "lobby-checkout-column" : ""}`}
            data-queue-size={hasCheckout ? queue.length : undefined}
          >
            {featured ? (
              <LobbyFeaturedCard dog={featured} />
            ) : null}

            {hasCheckout ? <LobbyQueueList dogs={queue} /> : null}

            {showIdleSlideshow ? <LobbyIdleSlideshow tvMode={isTvLayout} /> : null}

            {settings.show_events ? (
              <LobbyClassSchedule compact={hasCheckout} schedule={settings.class_schedule} />
            ) : null}
          </div>

          {settings.show_promotions ? <SocialMomentsCarousel /> : null}
        </div>

        <footer className="lobby-footer mt-4 flex h-14 shrink-0 items-center gap-4 px-8">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center">
            <LobbyAssetImage src={lobbyAssets.pawIcon} alt="" width={20} height={20} className="h-5 w-5 opacity-95" />
          </div>
          <p className="flex-1 text-center text-base font-semibold text-white">{footerMessage}</p>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden>
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-white/90" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </div>
        </footer>
      </div>

      {debugBoard ? (
        <LobbyDebugPanel
          fastEndpoint={fastCheckoutEndpoint}
          fullEndpoint={fullCheckoutEndpoint}
          lastFastFetchAt={lastFastFetchAt}
          lastFullFetchAt={lastFullFetchAt}
          fastDebug={fastDebug}
          fullDebug={fullDebug}
          checkouts={checkouts}
          visibleCheckoutCount={(featured ? 1 : 0) + queue.length}
          checkoutPollMs={checkoutPollMs}
        />
      ) : null}
    </main>
  );
}

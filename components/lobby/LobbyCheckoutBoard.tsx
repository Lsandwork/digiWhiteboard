"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { LobbyClassSchedule } from "@/components/lobby/LobbyClassSchedule";
import { LobbyFeaturedCard } from "@/components/lobby/LobbyFeaturedCard";
import { LobbyHeader } from "@/components/lobby/LobbyHeader";
import { LobbyQueueList } from "@/components/lobby/LobbyQueueList";
import { LobbyServicesGrid } from "@/components/lobby/LobbyServicesGrid";
import { LobbyCastButton } from "@/components/lobby/LobbyCastButton";
import { LobbyIdleSlideshow } from "@/components/lobby/LobbyIdleSlideshow";
import { LobbyAssetImage } from "@/components/lobby/LobbyAssetImage";
import { BOARD_CHECKOUT_POLL_MS, BOARD_SETTINGS_POLL_MS } from "@/lib/board-checkout-merge";
import { lobbyAssets } from "@/lib/lobby/assets";
import type { LobbyCheckoutsResponse, LobbySettings, LobbyStatusResponse } from "@/lib/lobby/types";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { useLobbyCheckoutTimers } from "@/hooks/useLobbyCheckoutTimers";
import { useLobbyTvCast } from "@/hooks/useLobbyTvCast";

const defaultSettings: LobbySettings = {
  max_queue_count: 6,
  refresh_interval_ms: 5000,
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
  const tvModeFromUrl = searchParams.get("display") === "tv";
  const displayToken = searchParams.get("token")?.trim() ?? embeddedDisplayToken?.trim() ?? "";
  const {
    menuOpen,
    tvCastUrl,
    isTvLayout,
    showCastActive,
    castError,
    canChromecast,
    chromecastAppId,
    canAirPlay,
    canFullscreen,
    closeCastMenu,
    openCastMenu,
    startChromecast,
    startAirPlay,
    startFullscreenKiosk,
    copyTvLink,
    openTvLink,
    stopTvCast,
    toggleTvCast,
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

  const checkoutsRef = useRef(checkouts);

  useEffect(() => {
    checkoutsRef.current = checkouts;
  }, [checkouts]);

  const requestHeaders = useMemo(() => {
    const headers: Record<string, string> = {};
    if (displayToken) headers["x-lobby-display-token"] = displayToken;
    return headers;
  }, [displayToken]);

  const loadLobbyCheckouts = useCallback(async () => {
    try {
      const checkoutsRes = await fetch("/api/lobby/checkouts", { cache: "no-store", headers: requestHeaders });
      const checkoutBody = normalizeCheckoutsResponse((await checkoutsRes.json()) as Partial<LobbyCheckoutsResponse>);

      if (checkoutsRes.ok && !checkoutBody.error) {
        setCheckouts(checkoutBody);
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
    }
  }, [requestHeaders]);

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
        if (body.refresh_interval_ms >= BOARD_CHECKOUT_POLL_MS) {
          setSettings((current) => ({ ...current, refresh_interval_ms: body.refresh_interval_ms }));
        }
      }
    } catch {
      // Checkout polling owns the visible error state.
    }
  }, [requestHeaders]);

  const loadLobbyData = useCallback(async () => {
    await Promise.all([loadLobbyCheckouts(), loadLobbyMeta()]);
  }, [loadLobbyCheckouts, loadLobbyMeta]);

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

  useEffect(() => {
    const intervalMs = Math.max(BOARD_CHECKOUT_POLL_MS, settings.refresh_interval_ms);
    const pollTimer = window.setInterval(() => void loadLobbyCheckouts(), intervalMs);
    return () => window.clearInterval(pollTimer);
  }, [loadLobbyCheckouts, settings.refresh_interval_ms]);

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
        void loadLobbyCheckouts();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadLobbyCheckouts]);

  const { featured, queue, hasCheckout } = useLobbyCheckoutTimers(checkouts, nowMs);
  const footerMessage = settings.footer_message ?? defaultSettings.footer_message;
  const showIdleSlideshow = !hasCheckout;
  const showIdleEmptyCard = !featured && !isTvLayout;

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

      {!isTvLayout ? (
        <LobbyCastButton
        menuOpen={menuOpen}
        isCasting={showCastActive}
        castError={castError}
        tvCastUrl={tvCastUrl}
        canChromecast={canChromecast}
        chromecastAppId={chromecastAppId}
        canAirPlay={canAirPlay}
        canFullscreen={canFullscreen}
        onToggle={() => void toggleTvCast()}
        onOpenMenu={openCastMenu}
        onCloseMenu={closeCastMenu}
        onChromecast={() => void runCastAction(startChromecast)}
        onAirPlay={() => void runCastAction(startAirPlay)}
        onFullscreen={() => void runCastAction(startFullscreenKiosk)}
        onCopyLink={() => void runCastAction(copyTvLink)}
        onOpenLink={() => {
          try {
            openTvLink();
          } catch (error) {
            setCastError(error instanceof Error ? error.message : "Unable to open TV link.");
          }
        }}
      />
      ) : null}

      <div className="lobby-content relative z-10 flex min-h-screen flex-col px-8 py-5">
        <LobbyHeader clock={clock} healthy={healthy && !refreshMessage} />

        {refreshMessage ? (
          <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-sm text-amber-100">
            {refreshMessage}
          </div>
        ) : null}

        <div className="lobby-main-grid mt-4 grid min-h-0 flex-1 grid-cols-[1.75fr_1fr] gap-5">
          <div className="flex min-h-0 flex-col gap-4">
            {featured ? (
              <LobbyFeaturedCard dog={featured} />
            ) : showIdleEmptyCard ? (
              <section className="lobby-panel lobby-empty-card relative overflow-hidden rounded-2xl border-l-[6px] border-l-lobby-teal px-6 py-5">
                <LobbyAssetImage
                  src={lobbyAssets.pawIcon}
                  alt=""
                  width={160}
                  height={160}
                  className="pointer-events-none absolute bottom-2 right-8 h-36 w-36 opacity-[0.12]"
                />
                <div className="relative z-10 flex items-center gap-6">
                  <LobbyAssetImage
                    src={lobbyAssets.logoBadge}
                    alt=""
                    width={96}
                    height={96}
                    className="h-24 w-24 shrink-0 rounded-full ring-2 ring-lobby-teal/60"
                  />
                  <div>
                    <h2 className="text-4xl font-black leading-tight text-white">No dogs currently checking out</h2>
                    <p className="mt-2 text-lg text-white/85">
                      We&apos;ll update this screen as soon as a pup is on the way.
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            {hasCheckout ? <LobbyQueueList dogs={queue} /> : null}

            {showIdleSlideshow ? <LobbyIdleSlideshow tvMode={isTvLayout} /> : null}

            {settings.show_events ? <LobbyClassSchedule /> : null}
          </div>

          {settings.show_promotions ? <LobbyServicesGrid /> : null}
        </div>

        <footer className="lobby-footer mt-4 flex h-14 shrink-0 items-center gap-4 px-8">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center">
            <LobbyAssetImage src={lobbyAssets.pawIcon} alt="" width={20} height={20} className="h-5 w-5 opacity-95" />
          </div>
          <p className="flex-1 text-center text-base font-semibold text-white">{footerMessage}</p>
          <div className="flex shrink-0 items-center gap-1 opacity-30" aria-hidden>
            <LobbyAssetImage src={lobbyAssets.pawIcon} alt="" width={18} height={18} className="h-4 w-4" />
            <LobbyAssetImage src={lobbyAssets.pawIcon} alt="" width={14} height={14} className="h-3.5 w-3.5" />
            <LobbyAssetImage src={lobbyAssets.pawIcon} alt="" width={12} height={12} className="h-3 w-3" />
          </div>
        </footer>
      </div>
    </main>
  );
}

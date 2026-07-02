"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { LobbyClassSchedule } from "@/components/lobby/LobbyClassSchedule";
import { LobbyFeaturedCard } from "@/components/lobby/LobbyFeaturedCard";
import { LobbyHeader } from "@/components/lobby/LobbyHeader";
import { LobbyQueueList } from "@/components/lobby/LobbyQueueList";
import { LobbyServicesGrid } from "@/components/lobby/LobbyServicesGrid";
import { LobbyAssetImage } from "@/components/lobby/LobbyAssetImage";
import { lobbyAssets } from "@/lib/lobby/assets";
import type { LobbyCheckoutsResponse, LobbySettings, LobbyStatusResponse } from "@/lib/lobby/types";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { useLobbyCheckoutTimers } from "@/hooks/useLobbyCheckoutTimers";

const defaultSettings: LobbySettings = {
  max_queue_count: 6,
  refresh_interval_ms: 15000,
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
  const tvMode = searchParams.get("display") === "tv";
  const displayToken = searchParams.get("token")?.trim() ?? embeddedDisplayToken?.trim() ?? "";

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

  const loadLobbyData = useCallback(async () => {
    try {
      const [settingsRes, checkoutsRes, statusRes] = await Promise.all([
        fetch("/api/lobby/settings", { cache: "no-store", headers: requestHeaders }),
        fetch("/api/lobby/checkouts", { cache: "no-store", headers: requestHeaders }),
        fetch("/api/lobby/status", { cache: "no-store", headers: requestHeaders })
      ]);

      if (settingsRes.ok) {
        const body = (await settingsRes.json()) as { settings: LobbySettings };
        if (body.settings) setSettings(body.settings);
      }

      const checkoutBody = normalizeCheckoutsResponse((await checkoutsRes.json()) as Partial<LobbyCheckoutsResponse>);
      if (checkoutsRes.ok && !checkoutBody.error) {
        setCheckouts(checkoutBody);
        setRefreshMessage(null);
      } else if (checkoutsRef.current.featured || checkoutsRef.current.queue.length) {
        setRefreshMessage(checkoutBody.error ?? "Live board temporarily refreshing");
      } else {
        setCheckouts(checkoutBody);
        setRefreshMessage(checkoutBody.error ?? "Live board temporarily refreshing");
      }

      if (statusRes.ok) {
        const body = (await statusRes.json()) as LobbyStatusResponse;
        setHealthy(body.healthy);
        if (body.refresh_interval_ms >= 10000) {
          setSettings((current) => ({ ...current, refresh_interval_ms: body.refresh_interval_ms }));
        }
      } else {
        setHealthy(false);
      }
    } catch {
      setHealthy(false);
      setRefreshMessage("Live board temporarily refreshing");
    }
  }, [requestHeaders]);

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
    const intervalMs = Math.max(10000, settings.refresh_interval_ms);
    const pollTimer = window.setInterval(() => void loadLobbyData(), intervalMs);
    return () => window.clearInterval(pollTimer);
  }, [loadLobbyData, settings.refresh_interval_ms]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel("lobby-live-transition-dogs")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_transition_dogs" }, () => {
        void loadLobbyData();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadLobbyData]);

  const { featured, queue, hasCheckout } = useLobbyCheckoutTimers(checkouts, nowMs);
  const footerMessage = settings.footer_message ?? defaultSettings.footer_message;

  return (
    <main className={`lobby-shell ${tvMode ? "lobby-tv-mode" : ""}`}>
      <Image src={lobbyAssets.background} alt="" fill priority className="lobby-background object-cover" unoptimized />

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
            ) : (
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
            )}

            {hasCheckout ? <LobbyQueueList dogs={queue} /> : null}

            {settings.show_events ? <LobbyClassSchedule /> : null}
          </div>

          {settings.show_promotions ? <LobbyServicesGrid /> : null}
        </div>

        <footer className="lobby-footer mt-4 flex h-14 shrink-0 items-center gap-4 px-8">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
            <LobbyAssetImage src={lobbyAssets.pawIcon} alt="" width={20} height={20} className="h-5 w-5 opacity-90" />
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

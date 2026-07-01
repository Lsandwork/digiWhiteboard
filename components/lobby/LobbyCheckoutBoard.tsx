"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { LobbyClassSchedule } from "@/components/lobby/LobbyClassSchedule";
import { LobbyFeaturedCard } from "@/components/lobby/LobbyFeaturedCard";
import { LobbyHeader } from "@/components/lobby/LobbyHeader";
import { LobbyQueueList } from "@/components/lobby/LobbyQueueList";
import { LobbyServicesGrid } from "@/components/lobby/LobbyServicesGrid";
import { lobbyAssets } from "@/lib/lobby/assets";
import type { LobbyCheckoutsResponse, LobbySettings, LobbyStatusResponse } from "@/lib/lobby/types";

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

export function LobbyCheckoutBoard() {
  const searchParams = useSearchParams();
  const tvMode = searchParams.get("display") === "tv";
  const displayToken = searchParams.get("token")?.trim() ?? "";

  const [clock, setClock] = useState(() => new Date());
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

      const checkoutBody = (await checkoutsRes.json()) as LobbyCheckoutsResponse;
      if (checkoutsRes.ok && !checkoutBody.error) {
        setCheckouts(checkoutBody);
        setRefreshMessage(null);
      } else if (checkoutsRef.current.featured || checkoutsRef.current.queue.length) {
        setRefreshMessage("Live board temporarily refreshing");
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
    const clockTimer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    const intervalMs = Math.max(10000, settings.refresh_interval_ms);
    const pollTimer = window.setInterval(() => void loadLobbyData(), intervalMs);
    return () => window.clearInterval(pollTimer);
  }, [loadLobbyData, settings.refresh_interval_ms]);

  const hasCheckout = Boolean(checkouts.featured || checkouts.queue.length);
  const footerMessage = settings.footer_message ?? defaultSettings.footer_message;

  return (
    <main className={`lobby-shell ${tvMode ? "lobby-tv-mode" : ""}`}>
      <Image src={lobbyAssets.background} alt="" fill priority className="lobby-background object-cover" />

      <div className="lobby-content relative z-10 flex min-h-screen flex-col px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-5">
        <LobbyHeader clock={clock} healthy={healthy && !refreshMessage} lobbyMessage={settings.lobby_message} />

        {refreshMessage ? (
          <div className="mt-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-sm font-semibold text-amber-100">
            {refreshMessage}
          </div>
        ) : null}

        <div className="lobby-main-grid mt-3 grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.7fr_1fr] lg:gap-4">
          <div className="flex min-h-0 flex-col gap-3">
            {checkouts.featured ? (
              <LobbyFeaturedCard dog={checkouts.featured} />
            ) : (
              <section className="lobby-empty-card relative min-h-[140px] overflow-hidden rounded-2xl border-2 border-lobby-teal/35 bg-lobby-card/70 p-5 backdrop-blur-sm sm:min-h-[160px] sm:p-6">
                <Image src={lobbyAssets.idleCard} alt="" fill className="pointer-events-none object-cover opacity-60" />
                <Image
                  src={lobbyAssets.pawPattern}
                  alt=""
                  width={120}
                  height={120}
                  className="pointer-events-none absolute bottom-2 right-4 h-24 w-24 opacity-20"
                />
                <div className="relative z-10 flex items-center gap-5">
                  <Image
                    src={lobbyAssets.logoBadge}
                    alt=""
                    width={88}
                    height={88}
                    className="h-16 w-16 shrink-0 rounded-full border-2 border-lobby-teal/40 sm:h-20 sm:w-20"
                  />
                  <div>
                    <h2 className="text-2xl font-black text-white sm:text-3xl xl:text-4xl">No dogs currently checking out</h2>
                    <p className="mt-1 text-sm text-lobby-muted sm:text-base">
                      We&apos;ll update this screen as soon as a pup is on the way.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {hasCheckout ? <LobbyQueueList dogs={checkouts.queue} /> : null}

            {settings.show_events ? <LobbyClassSchedule /> : null}
          </div>

          {settings.show_promotions ? <LobbyServicesGrid /> : null}
        </div>

        <footer className="lobby-footer relative mt-3 shrink-0 overflow-hidden rounded-xl">
          <Image src={lobbyAssets.footerBar} alt="" width={1600} height={64} className="h-12 w-full object-cover sm:h-14" />
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs font-semibold text-white sm:text-sm">
            {footerMessage}
          </p>
        </footer>
      </div>
    </main>
  );
}

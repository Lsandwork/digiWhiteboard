"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { LobbyFeaturedCard } from "@/components/lobby/LobbyFeaturedCard";
import { LobbyHeader } from "@/components/lobby/LobbyHeader";
import { LobbyIdlePanels } from "@/components/lobby/LobbyIdlePanels";
import { LobbyQueueList } from "@/components/lobby/LobbyQueueList";
import { lobbyAssets } from "@/lib/lobby/assets";
import type {
  LobbyCheckoutsResponse,
  LobbyEvent,
  LobbyPromotion,
  LobbySettings,
  LobbyStatusResponse
} from "@/lib/lobby/types";

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
  const [promotions, setPromotions] = useState<LobbyPromotion[]>([]);
  const [events, setEvents] = useState<LobbyEvent[]>([]);
  const [healthy, setHealthy] = useState(true);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const checkoutsRef = useRef(checkouts);
  const promotionsRef = useRef(promotions);
  const eventsRef = useRef(events);

  useEffect(() => {
    checkoutsRef.current = checkouts;
  }, [checkouts]);
  useEffect(() => {
    promotionsRef.current = promotions;
  }, [promotions]);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const requestHeaders = useMemo(() => {
    const headers: Record<string, string> = {};
    if (displayToken) headers["x-lobby-display-token"] = displayToken;
    return headers;
  }, [displayToken]);

  const loadLobbyData = useCallback(async () => {
    try {
      const [settingsRes, checkoutsRes, promotionsRes, eventsRes, statusRes] = await Promise.all([
        fetch("/api/lobby/settings", { cache: "no-store", headers: requestHeaders }),
        fetch("/api/lobby/checkouts", { cache: "no-store", headers: requestHeaders }),
        fetch("/api/lobby/promotions", { cache: "no-store", headers: requestHeaders }),
        fetch("/api/lobby/events", { cache: "no-store", headers: requestHeaders }),
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

      if (promotionsRes.ok) {
        const body = (await promotionsRes.json()) as { promotions: LobbyPromotion[] };
        setPromotions(body.promotions ?? []);
      }

      if (eventsRes.ok) {
        const body = (await eventsRes.json()) as { events: LobbyEvent[] };
        setEvents(body.events ?? []);
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
      if (!checkoutsRef.current.featured && !checkoutsRef.current.queue.length) {
        setRefreshMessage("Live board temporarily refreshing");
      } else {
        setRefreshMessage("Live board temporarily refreshing");
      }
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
  const lobbyMessage = settings.lobby_message ?? defaultSettings.lobby_message;

  return (
    <main className={`lobby-shell ${tvMode ? "lobby-tv-mode" : ""}`}>
      <Image src={lobbyAssets.background} alt="" fill priority className="lobby-background object-cover" />

      <div className="lobby-content relative z-10 flex min-h-screen flex-col px-6 py-5 sm:px-8 sm:py-6 lg:px-10 lg:py-8">
        <LobbyHeader clock={clock} healthy={healthy && !refreshMessage} subtitle={lobbyMessage} />

        {refreshMessage ? (
          <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-center text-sm font-semibold text-amber-100 sm:text-base">
            {refreshMessage}
          </div>
        ) : null}

        <div className="mt-6 grid min-h-0 flex-1 gap-6 xl:grid-cols-[1.35fr_1fr]">
          <div className="flex min-h-0 flex-col gap-6">
            {checkouts.featured ? (
              <LobbyFeaturedCard dog={checkouts.featured} message={lobbyMessage} />
            ) : (
              <section className="lobby-empty-card rounded-[2rem] border border-white/10 bg-ink-900/70 p-8 text-center sm:p-10">
                <p className="text-sm font-bold uppercase tracking-[0.28em] text-fitdog-orange">Lobby Checkout Board</p>
                <h2 className="mt-4 text-4xl font-black text-white sm:text-5xl">No dogs currently checking out</h2>
                <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-300 sm:text-xl">
                  We&apos;ll update this screen as soon as a pup is on the way.
                </p>
              </section>
            )}

            {hasCheckout ? <LobbyQueueList dogs={checkouts.queue} /> : null}
          </div>

          <LobbyIdlePanels
            promotions={promotions}
            events={events}
            showPromotions={settings.show_promotions}
            showEvents={settings.show_events}
          />
        </div>

        <footer className="mt-6 shrink-0 border-t border-white/10 pt-4 text-center text-base text-slate-400 sm:text-lg">
          {footerMessage}
        </footer>
      </div>
    </main>
  );
}

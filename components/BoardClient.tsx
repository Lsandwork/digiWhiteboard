"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PawPrint } from "lucide-react";
import { BoardHeader } from "@/components/board/BoardHeader";
import { BoardPanel } from "@/components/board/BoardPanel";
import { useCheckoutDisplayTimers } from "@/hooks/useCheckoutDisplayTimers";
import { useNewCheckingInAlerts } from "@/hooks/useNewCheckingInAlerts";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { formatBoardDateTime } from "@/lib/board-utils";
import type { LiveBoardResponse, LiveDog } from "@/lib/types";

type ConnectionState = "connecting" | "live" | "polling" | "offline";

const emptyBoard: LiveBoardResponse = {
  checking_in: [],
  checking_out: [],
  counts: { checking_in: 0, checking_out: 0, total: 0 },
  last_updated: ""
};

function getDevDemoBoard(): LiveBoardResponse | null {
  if (process.env.NODE_ENV !== "development") return null;

  const now = new Date().toISOString();
  const demoDog = (name: string, owner: string, room: string, status: "checking_in" | "checking_out"): LiveDog => ({
    id: `demo-${name.toLowerCase()}`,
    gingr_reservation_id: null,
    gingr_animal_id: null,
    animal_name: name,
    owner_name: owner,
    photo_url: null,
    reservation_type: "Daycare",
    current_status: status,
    display_status: status,
    room,
    notes: null,
    flags: {},
    status_started_at: now,
    completed_at: null,
    display_until: null,
    last_seen_from_gingr_at: now,
    hidden: false,
    updated_at: now
  });

  return {
    checking_in: [
      demoDog("Beau", "Anderson", "Parking Lot", "checking_in"),
      demoDog("Cooper", "Martinez", "Front Desk", "checking_in")
    ],
    checking_out: [demoDog("Brody", "Johnson", "Front Desk", "checking_out")],
    counts: { checking_in: 2, checking_out: 1, total: 3 },
    last_updated: now
  };
}

export function BoardClient() {
  const searchParams = useSearchParams();
  const staffMode = searchParams.get("staff") === "1";

  const [board, setBoard] = useState<LiveBoardResponse>(emptyBoard);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [clock, setClock] = useState<Date | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [useDevDemo, setUseDevDemo] = useState(false);
  const { status: wakeLockStatus, requestWakeLock } = useScreenWakeLock();

  const { visibleCheckingInDogs } = useNewCheckingInAlerts(board.checking_in);
  const { visibleCheckoutDogs, manuallyExpireCheckout } = useCheckoutDisplayTimers(board.checking_out, nowMs);

  const loadBoard = useCallback(async (mode: ConnectionState = "polling") => {
    try {
      const response = await fetch("/api/live-board", { cache: "no-store" });
      if (!response.ok) throw new Error("Board request failed.");
      const data = (await response.json()) as LiveBoardResponse;
      const hasLiveDogs = data.checking_in.length > 0 || data.checking_out.length > 0;

      if (!hasLiveDogs && process.env.NODE_ENV === "development") {
        const demo = getDevDemoBoard();
        if (demo) {
          setBoard(demo);
          setUseDevDemo(true);
          setConnection((current) => (current === "live" ? "live" : mode));
          return;
        }
      }

      setUseDevDemo(false);
      setBoard(data);
      setConnection((current) => (current === "live" ? "live" : mode));
    } catch {
      setConnection("offline");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadBoard("connecting"), 0);
    const initialClock = window.setTimeout(() => setClock(new Date()), 0);
    const clockTimer = window.setInterval(() => setClock(new Date()), 1000);
    const nowTimer = window.setInterval(() => setNowMs(Date.now()), 1000);
    const pollTimer = window.setInterval(() => void loadBoard("polling"), 15000);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearTimeout(initialClock);
      window.clearInterval(clockTimer);
      window.clearInterval(nowTimer);
      window.clearInterval(pollTimer);
    };
  }, [loadBoard]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      const fallbackTimer = window.setTimeout(() => setConnection("polling"), 0);
      return () => window.clearTimeout(fallbackTimer);
    }

    const channel = supabase
      .channel("live-transition-dogs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_transition_dogs" },
        (payload) => {
          const next = payload.new as LiveDog | null;
          const old = payload.old as LiveDog | null;
          const dogName = next?.animal_name ?? old?.animal_name;
          if (dogName && next?.display_status === "checking_in" && !next.hidden) setToast(`${dogName} is checking in.`);
          if (dogName && next?.display_status === "checking_out" && !next.hidden) setToast(`${dogName} is checking out.`);
          if (dogName && next?.current_status === "checked_in") setToast(`${dogName} completed check-in.`);
          if (dogName && next?.current_status === "checked_out") setToast(`${dogName} completed check-out.`);
          void loadBoard("live");
        }
      )
      .subscribe((status) => {
        setConnection(status === "SUBSCRIBED" ? "live" : "polling");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadBoard]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleClearCheckout = useCallback(
    (dogId: string) => {
      const entry = visibleCheckoutDogs.find((item: { dog: LiveDog }) => item.dog.id === dogId);
      if (entry) {
        manuallyExpireCheckout(entry.dog);
      }
    },
    [manuallyExpireCheckout, visibleCheckoutDogs]
  );

  const dateTime = useMemo(
    () => (clock ? formatBoardDateTime(clock) : { time: "--:--", date: "LOADING" }),
    [clock]
  );

  return (
    <main className="board-shell kennel-lines flex min-h-screen flex-col overflow-hidden text-white">
      <div className="mx-auto flex h-full w-full max-w-[1920px] flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        <BoardHeader
          connection={connection}
          clockTime={dateTime.time}
          clockDate={dateTime.date}
          lastUpdated={board.last_updated}
          wakeLockStatus={wakeLockStatus}
          onRequestWakeLock={() => void requestWakeLock()}
        />

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2 lg:gap-5 xl:gap-6">
          <BoardPanel
            title="Checking In"
            subtitle="Dogs Arriving Today"
            mode="in"
            checkingInEntries={visibleCheckingInDogs}
          />
          <BoardPanel
            title="Checking Out"
            subtitle="Dogs Heading Home"
            mode="out"
            checkingOutEntries={visibleCheckoutDogs}
            showStaffClear={staffMode}
            onClearCheckout={handleClearCheckout}
          />
        </div>

        <footer className="mt-4 flex shrink-0 items-center justify-center gap-2 py-2 text-sm text-slate-400 sm:mt-5 sm:text-base">
          <PawPrint className="h-4 w-4 text-fitdog-blue/80" />
          <span>Thank you for trusting us with your pups!</span>
          <PawPrint className="h-4 w-4 text-fitdog-blue/80" />
        </footer>
      </div>

      {useDevDemo ? (
        <div className="pointer-events-none fixed left-4 top-4 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
          Development demo data
        </div>
      ) : null}

      {staffMode ? (
        <div className="fixed bottom-4 left-4 rounded-full border border-slate-600/50 bg-slate-950/80 px-3 py-1 text-xs font-semibold text-slate-300">
          Staff mode
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 w-[min(720px,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-emerald-300/50 bg-slate-950/95 px-6 py-4 text-xl font-bold text-white shadow-2xl backdrop-blur sm:text-2xl">
          <span className="mr-3 inline-grid h-9 w-9 place-items-center rounded-full bg-emerald-400 text-slate-950">✓</span>
          {toast}
        </div>
      ) : null}
    </main>
  );
}

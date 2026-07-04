"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PawPrint } from "lucide-react";
import { BoardDebugPanel } from "@/components/board/BoardDebugPanel";
import { BoardErrorBanner } from "@/components/board/BoardErrorBanner";
import { BoardHeader } from "@/components/board/BoardHeader";
import { BoardPanel } from "@/components/board/BoardPanel";
import { StaffCastButton } from "@/components/board/StaffCastButton";
import {
  StaffPushNoticeFullscreen,
  StaffPushNoticePanel,
  StaffPushNoticeTvOverlay
} from "@/components/board/StaffPushNotice";
import { useCheckinDisplayTimers } from "@/hooks/useCheckinDisplayTimers";
import { useCheckoutDisplayTimers } from "@/hooks/useCheckoutDisplayTimers";
import { useNewCheckingInAlerts } from "@/hooks/useNewCheckingInAlerts";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";
import { useStaffPushNotice } from "@/hooks/useStaffPushNotice";
import { unlockStaffPushNoticeAudio } from "@/lib/staff/push-notice-alarm";
import { useStaffTvCast } from "@/hooks/useStaffTvCast";
import { useDisplaySync } from "@/hooks/useDisplaySync";
import { BOARD_CHECKOUT_POLL_MS, BOARD_FAST_FETCH_TIMEOUT_MS, BOARD_FETCH_TIMEOUT_MS, BOARD_FULL_SYNC_POLL_MS } from "@/lib/board-checkout-merge";
import {
  getCheckoutMergeKey,
  mergeStickyCheckoutDogs,
  stickyCheckoutFirstSeenByKey,
  stickyCheckoutStateToDogs,
  type StickyCheckoutState
} from "@/lib/board-sticky-checkout";
import { useInFlightPoll } from "@/hooks/useInFlightPoll";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { formatBoardDateTime } from "@/lib/board-utils";
import type { LiveBoardResponse, LiveDog } from "@/lib/types";

type ConnectionState = "connecting" | "live" | "polling" | "offline";
type FetchStatus = "idle" | "loading" | "ok" | "error";

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
    flags: status === "checking_out" ? { checkout_prompted: true } : {},
    status_started_at: now,
    completed_at: null,
    display_until: null,
    last_seen_from_gingr_at: now,
    raw_payload:
      status === "checking_out"
        ? {
            source: "user_prompt",
            checkout_prompted: true,
            checkout_prompted_at: now,
            prompted_by: "development"
          }
        : null,
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
  const tvMode = searchParams.get("display") === "tv";
  const debugBoard = searchParams.get("debugBoard") === "1";
  const displayToken = searchParams.get("token")?.trim() ?? "";

  const [board, setBoard] = useState<LiveBoardResponse>(emptyBoard);
  const boardRef = useRef(board);
  const stickyCheckoutRef = useRef<StickyCheckoutState>(new Map());
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("idle");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<string | null>(null);
  const [clock, setClock] = useState<Date | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [useDevDemo, setUseDevDemo] = useState(false);
  const { status: wakeLockStatus, requestWakeLock } = useScreenWakeLock();
  const activePushNotice = useStaffPushNotice();
  const {
    isCasting,
    castError,
    canChromecast,
    toggleTvCast,
    setCastError
  } = useStaffTvCast(displayToken);

  useEffect(() => {
    document.documentElement.classList.toggle("staff-tv-display", tvMode);
    return () => document.documentElement.classList.remove("staff-tv-display");
  }, [tvMode]);

  useEffect(() => {
    void unlockStaffPushNoticeAudio();
  }, []);

  useEffect(() => {
    if (!tvMode) return;
    void requestWakeLock();
  }, [tvMode, requestWakeLock]);

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

  const { visibleCheckingInDogs: activeCheckingInDogs } = useCheckinDisplayTimers(board.checking_in, nowMs);

  const stickyCheckoutDogs = useMemo(() => {
    stickyCheckoutRef.current = mergeStickyCheckoutDogs(
      stickyCheckoutRef.current,
      board.checking_out,
      new Date(nowMs)
    );
    return stickyCheckoutStateToDogs(stickyCheckoutRef.current);
  }, [board.checking_out, nowMs]);

  const checkoutFirstSeenByKey = useMemo(
    () => stickyCheckoutFirstSeenByKey(stickyCheckoutRef.current),
    [stickyCheckoutDogs]
  );

  const { visibleCheckingInDogs } = useNewCheckingInAlerts(activeCheckingInDogs);
  const { visibleCheckoutDogs, manuallyExpireCheckout } = useCheckoutDisplayTimers(
    stickyCheckoutDogs,
    nowMs,
    checkoutFirstSeenByKey
  );

  const apiEndpoint = debugBoard ? "/api/live-board?debugBoard=1" : "/api/live-board";
  const fastCheckoutEndpoint = debugBoard ? "/api/board/checkouts?debugBoard=1" : "/api/board/checkouts";
  const runFastPoll = useInFlightPoll();
  const runFullPoll = useInFlightPoll();

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  const loadFastCheckouts = useCallback(async () => {
    await runFastPoll(async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), BOARD_FAST_FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(fastCheckoutEndpoint, { cache: "no-store", signal: controller.signal });
        const data = (await response.json()) as LiveBoardResponse & {
          checking_out: LiveDog[];
          counts?: { checking_out: number };
        };

        if (!response.ok || data.error) return;

        setBoard((previous) => ({
          ...previous,
          checking_out: data.checking_out,
          counts: {
            checking_in: previous.counts.checking_in,
            checking_out: data.checking_out.length,
            total: previous.counts.checking_in + data.checking_out.length
          },
          last_updated: data.last_updated ?? previous.last_updated,
          debug: data.debug ?? previous.debug
        }));
        setLastFetchAt(new Date().toISOString());
      } catch {
        // Keep the last good board data when a fast refresh fails.
      } finally {
        window.clearTimeout(timeout);
      }
    });
  }, [fastCheckoutEndpoint, runFastPoll]);

  const loadBoard = useCallback(
    async (mode: ConnectionState = "polling") => {
      await runFullPoll(async () => {
      setFetchStatus("loading");
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), BOARD_FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(apiEndpoint, { cache: "no-store", signal: controller.signal });
        const data = (await response.json()) as LiveBoardResponse;
        setLastFetchAt(new Date().toISOString());

        if (!response.ok || data.error) {
          throw new Error(data.error ?? `Board request failed (${response.status}).`);
        }

        const hasLiveDogs = data.checking_in.length > 0 || data.checking_out.length > 0;

        if (!hasLiveDogs && process.env.NODE_ENV === "development") {
          const demo = getDevDemoBoard();
          if (demo) {
            setBoard(demo);
            setUseDevDemo(true);
            setFetchError(null);
            setFetchStatus("ok");
            setLastSuccessAt(demo.last_updated);
            setConnection((current) => (current === "live" ? "live" : mode));
            return;
          }
        }

        setUseDevDemo(false);
        setBoard(data);
        setFetchError(null);
        setFetchStatus("ok");
        setLastSuccessAt(data.last_updated);
        setConnection((current) => (current === "live" ? "live" : mode));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Live board data is not loading.";
        const hasData =
          boardRef.current.checking_in.length > 0 || boardRef.current.checking_out.length > 0;
        setFetchError(message);
        setFetchStatus(hasData ? "ok" : "error");
        setConnection(hasData ? (mode === "connecting" ? "polling" : mode) : "offline");
      } finally {
        window.clearTimeout(timeout);
      }
      });
    },
    [apiEndpoint, runFullPoll]
  );

  useDisplaySync({
    onContentUpdate: () => {
      void loadBoard("polling");
    }
  });

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadBoard("connecting");
      void loadFastCheckouts();
    }, 0);
    const initialClock = window.setTimeout(() => setClock(new Date()), 0);
    const clockTimer = window.setInterval(() => setClock(new Date()), 1000);
    const nowTimer = window.setInterval(() => setNowMs(Date.now()), 1000);
    const fastPollTimer = window.setInterval(() => void loadFastCheckouts(), BOARD_CHECKOUT_POLL_MS);
    const fullPollTimer = window.setInterval(() => void loadBoard("polling"), BOARD_FULL_SYNC_POLL_MS);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearTimeout(initialClock);
      window.clearInterval(clockTimer);
      window.clearInterval(nowTimer);
      window.clearInterval(fastPollTimer);
      window.clearInterval(fullPollTimer);
    };
  }, [loadBoard, loadFastCheckouts]);

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
          void loadFastCheckouts();
        }
      )
      .subscribe((status) => {
        setConnection(status === "SUBSCRIBED" ? "live" : "polling");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadBoard, loadFastCheckouts]);

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
        stickyCheckoutRef.current.delete(getCheckoutMergeKey(entry.dog));
      }
    },
    [manuallyExpireCheckout, visibleCheckoutDogs]
  );

  const dateTime = useMemo(
    () => (clock ? formatBoardDateTime(clock) : { time: "--:--", date: "LOADING" }),
    [clock]
  );

  const hasBoardData = board.checking_in.length > 0 || board.checking_out.length > 0;
  const hasVisibleDogs = visibleCheckingInDogs.length > 0 || visibleCheckoutDogs.length > 0;
  const showEmptyState = fetchStatus === "ok" && !fetchError;
  const expiredCheckoutCount = Math.max(0, stickyCheckoutDogs.length - visibleCheckoutDogs.length);

  return (
    <main className="board-shell kennel-lines flex min-h-screen flex-col overflow-hidden text-white">
      <StaffPushNoticeTvOverlay active={Boolean(activePushNotice)} />

      {!tvMode ? (
        <StaffCastButton
          isCasting={isCasting}
          castError={castError}
          canChromecast={canChromecast}
          onToggle={() => void runCastAction(toggleTvCast)}
        />
      ) : null}

      <div className="mx-auto flex h-full w-full max-w-[1920px] flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        <BoardHeader
          connection={connection}
          clockTime={dateTime.time}
          clockDate={dateTime.date}
          lastUpdated={board.last_updated}
          wakeLockStatus={wakeLockStatus}
          onRequestWakeLock={() => void requestWakeLock()}
        />

        {fetchError && !hasBoardData ? (
          <BoardErrorBanner
            message="Live board data is not loading."
            lastSuccessAt={lastSuccessAt}
            onRetry={() => void loadBoard("polling")}
            devDetail={process.env.NODE_ENV === "development" ? fetchError : null}
          />
        ) : null}

        {activePushNotice && !hasVisibleDogs ? (
          <StaffPushNoticeFullscreen notice={activePushNotice} />
        ) : (
          <div className={`grid min-h-0 flex-1 gap-4 ${activePushNotice ? "xl:grid-cols-[minmax(0,1fr)_420px]" : ""} lg:gap-5 xl:gap-6`}>
            <div className="grid min-h-0 gap-4 lg:grid-cols-2 lg:gap-5 xl:gap-6">
              <BoardPanel
                title="Checking In"
                subtitle="Dogs Arriving Today"
                mode="in"
                checkingInEntries={visibleCheckingInDogs}
                nowMs={nowMs}
                showEmptyState={showEmptyState}
              />
              <BoardPanel
                title="Checking Out"
                subtitle="Dogs Heading Home"
                mode="out"
                checkingOutEntries={visibleCheckoutDogs}
                nowMs={nowMs}
                showStaffClear={staffMode}
                onClearCheckout={handleClearCheckout}
                showEmptyState={showEmptyState}
              />
            </div>
            {activePushNotice ? <StaffPushNoticePanel notice={activePushNotice} /> : null}
          </div>
        )}

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

      {debugBoard ? (
        <BoardDebugPanel
          endpoint={apiEndpoint}
          fetchStatus={fetchStatus}
          lastFetchAt={lastFetchAt}
          board={board}
          visibleCheckingInCount={visibleCheckingInDogs.length}
          visibleCheckingOutCount={visibleCheckoutDogs.length}
          expiredCheckoutCount={expiredCheckoutCount}
        />
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

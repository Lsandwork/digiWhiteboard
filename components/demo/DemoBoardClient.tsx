"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PawPrint } from "lucide-react";
import { BoardHeader } from "@/components/board/BoardHeader";
import { BoardPanel } from "@/components/board/BoardPanel";
import { GroomingPushNoticeOverlay, groomingClockFromMs } from "@/components/board/GroomingPushNoticeOverlay";
import { useCheckinDisplayTimers } from "@/hooks/useCheckinDisplayTimers";
import { useCheckoutDisplayTimers } from "@/hooks/useCheckoutDisplayTimers";
import { useNewCheckingInAlerts } from "@/hooks/useNewCheckingInAlerts";
import { useFitdogAlertSound } from "@/hooks/useFitdogAlertSound";
import { formatBoardDateTime } from "@/lib/board-utils";
import type { GroomingPushNotice } from "@/lib/staff/grooming-push-notices";
import type { LiveBoardResponse } from "@/lib/types";

const emptyBoard: LiveBoardResponse = {
  checking_in: [],
  checking_out: [],
  counts: { checking_in: 0, checking_out: 0, total: 0 },
  last_updated: ""
};

export function DemoBoardClient() {
  const [board, setBoard] = useState<LiveBoardResponse>(emptyBoard);
  const [activeGroomingNotice, setActiveGroomingNotice] = useState<GroomingPushNotice | null>(null);
  const [groomingQueue, setGroomingQueue] = useState<GroomingPushNotice[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [clock, setClock] = useState<Date | null>(null);

  useEffect(() => {
    setClock(new Date());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
      setClock(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    try {
      const [boardRes, groomingRes] = await Promise.all([
        fetch("/api/demo/board", { cache: "no-store" }),
        fetch("/api/demo/grooming-push", { cache: "no-store" })
      ]);
      const boardBody = await boardRes.json();
      const groomingBody = await groomingRes.json();
      if (boardRes.ok) {
        setBoard({
          checking_in: boardBody.checking_in ?? [],
          checking_out: boardBody.checking_out ?? [],
          counts: boardBody.counts ?? emptyBoard.counts,
          last_updated: boardBody.last_updated ?? new Date().toISOString()
        });
      }
      if (groomingRes.ok) {
        setActiveGroomingNotice(groomingBody.activeNotice ?? null);
        setGroomingQueue(groomingBody.queue ?? []);
      }
    } catch {
      // keep last good state
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [load]);

  useFitdogAlertSound(activeGroomingNotice?.id ?? null);

  const { visibleCheckingInDogs: timedCheckIns } = useCheckinDisplayTimers(board.checking_in, nowMs);
  const { visibleCheckingInDogs } = useNewCheckingInAlerts(timedCheckIns);

  const checkoutFirstSeen = useMemo(() => {
    const map = new Map<string, number>();
    board.checking_out.forEach((dog) => map.set(dog.id, nowMs));
    return map;
  }, [board.checking_out, nowMs]);

  const { visibleCheckoutDogs } = useCheckoutDisplayTimers(board.checking_out, nowMs, checkoutFirstSeen);

  const dateTime = useMemo(
    () => (clock ? formatBoardDateTime(clock) : { time: "--:--", date: "DEMO" }),
    [clock]
  );
  const groomingClock = groomingClockFromMs(nowMs);

  return (
    <main className="board-shell kennel-lines demo-board-root flex min-h-screen flex-col overflow-hidden text-white">
      <div className="demo-board-banner">
        <PawPrint className="h-4 w-4" aria-hidden />
        Investor Demo Whiteboard — isolated from live Fitdog data
      </div>

      <div className="mx-auto flex h-full w-full max-w-[1920px] flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        <BoardHeader
          connection="live"
          clockTime={dateTime.time}
          clockDate={dateTime.date}
          lastUpdated={board.last_updated}
          wakeLockStatus="unsupported"
          onRequestWakeLock={() => undefined}
        />

        {activeGroomingNotice ? (
          <GroomingPushNoticeOverlay
            notice={activeGroomingNotice}
            queue={groomingQueue}
            nowMs={nowMs}
            clockTime={groomingClock.clockTime}
            clockDate={groomingClock.clockDate}
          />
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2 lg:gap-5 xl:gap-6">
            <BoardPanel
              title="Checking In"
              subtitle="Dogs Arriving Today"
              mode="in"
              checkingInEntries={visibleCheckingInDogs}
              nowMs={nowMs}
              showEmptyState
            />
            <BoardPanel
              title="Checking Out"
              subtitle="Dogs Heading Home"
              mode="out"
              checkingOutEntries={visibleCheckoutDogs}
              nowMs={nowMs}
              showEmptyState
            />
          </div>
        )}
      </div>
    </main>
  );
}

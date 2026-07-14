"use client";

import { useEffect, useState } from "react";
import { formatBoardDateTime } from "@/lib/board-utils";

/** Visual clock only — isolates 1s ticks from the rest of the lobby board. */
export function LobbyStatusClock() {
  const [clock, setClock] = useState<Date | null>(null);

  useEffect(() => {
    const boot = window.setTimeout(() => setClock(new Date()), 0);
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(timer);
    };
  }, []);

  const { time, date } = clock ? formatBoardDateTime(clock) : { time: "--:--", date: "LOADING" };

  return (
    <div className="lobby-status-clock text-right">
      <p className="lobby-status-clock__time">{time}</p>
      <p className="lobby-status-clock__date">{date}</p>
    </div>
  );
}

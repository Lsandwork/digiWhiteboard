"use client";

import { useEffect, useState } from "react";
import { formatLaBoardDate, formatLaBoardLiveClock } from "@/lib/tl-digi-board/medication-windows";

export function useLaBoardNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const boot = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(timer);
    };
  }, []);

  return now;
}

/** Live LA clock for the TL Alerts TV header — ticks every second. */
export function TlBoardClock({ now }: { now: Date | null }) {
  return (
    <div className="tl-board__clock">
      <p className="tl-board__date">{now ? formatLaBoardDate(now) : "LOADING"}</p>
      <p className="tl-board__time" suppressHydrationWarning>
        {now ? formatLaBoardLiveClock(now) : "--:--:--"}
      </p>
    </div>
  );
}

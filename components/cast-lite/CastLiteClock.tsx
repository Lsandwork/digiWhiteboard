"use client";

import { memo, useEffect, useState } from "react";
import { formatBoardDateTime } from "@/lib/board-utils";

function formatClock(date: Date) {
  const formatted = formatBoardDateTime(date);
  return { time: formatted.time, date: formatted.date };
}

export const CastLiteClock = memo(function CastLiteClock() {
  const [clock, setClock] = useState({ time: "--:--", date: "LOADING" });

  useEffect(() => {
    const tick = () => setClock(formatClock(new Date()));
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="cast-lite-clock" aria-live="polite">
      <p className="cast-lite-clock__time">{clock.time}</p>
      <p className="cast-lite-clock__date">{clock.date}</p>
    </div>
  );
});

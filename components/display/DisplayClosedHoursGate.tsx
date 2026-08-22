"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  CAST_DISPLAY_TIMEZONE,
  castDisplayClosedStandbyMessage,
  castDisplayScheduleLabel,
  isCastDisplayOpenHours
} from "@/lib/remote-cast/hours";

const OPEN_HOURS_TICK_MS = 30_000;

/** Local Pacific open-hours clock for TV boards (no network). */
export function useCastDisplayOpenHours(nowProvider: () => Date = () => new Date()) {
  const [isOpen, setIsOpen] = useState(() => isCastDisplayOpenHours(nowProvider()));

  useEffect(() => {
    const tick = () => setIsOpen(isCastDisplayOpenHours(nowProvider()));
    tick();
    const timer = window.setInterval(tick, OPEN_HOURS_TICK_MS);
    return () => window.clearInterval(timer);
  }, [nowProvider]);

  return isOpen;
}

/**
 * When building hours are closed, render a local standby screen and unmount
 * children so Cast Keeper / board polls stop hitting Vercel + Supabase overnight.
 */
export function DisplayClosedHoursGate({
  children,
  enabled = true
}: {
  children: ReactNode;
  /** When false, always render children (admin laptop preview paths). */
  enabled?: boolean;
}) {
  const isOpen = useCastDisplayOpenHours();

  if (!enabled || isOpen) {
    return <>{children}</>;
  }

  return (
    <main
      className="display-closed-hours"
      style={{
        minHeight: "100vh",
        margin: 0,
        display: "grid",
        placeItems: "center",
        background: "#05080f",
        color: "#f4f7fb",
        fontFamily: "Avenir Next, Segoe UI, Helvetica Neue, sans-serif",
        padding: "2rem",
        textAlign: "center"
      }}
      aria-live="polite"
    >
      <div style={{ maxWidth: "36rem" }}>
        <p
          style={{
            margin: 0,
            letterSpacing: "0.22em",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "rgba(244,247,251,0.55)",
            textTransform: "uppercase"
          }}
        >
          Display standby
        </p>
        <h1 style={{ margin: "0.85rem 0 0", fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 750 }}>
          Whiteboards are off overnight
        </h1>
        <p style={{ margin: "0.85rem 0 0", fontSize: "1.15rem", color: "rgba(244,247,251,0.72)", lineHeight: 1.45 }}>
          {castDisplayClosedStandbyMessage(CAST_DISPLAY_TIMEZONE)}
        </p>
        <p style={{ margin: "1.25rem 0 0", fontSize: "0.9rem", color: "rgba(244,247,251,0.45)" }}>
          {castDisplayScheduleLabel(CAST_DISPLAY_TIMEZONE)}
        </p>
      </div>
    </main>
  );
}

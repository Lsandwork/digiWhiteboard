"use client";

import { useEffect, useMemo } from "react";
import Image from "next/image";
import { RefreshCw } from "lucide-react";
import { formatBoardTime } from "@/lib/board-utils";

const EXACT_MOCKUP = "/assets/fitdog/staff-empty-state/all-clear-mockup.jpg";

type ConnectionState = "connecting" | "live" | "polling" | "offline";

type StaffBoardEmptyStateProps = {
  connection?: ConnectionState;
  clockTime?: string;
  clockDate?: string;
  lastUpdated?: string;
  onSlideshowReady?: () => void;
};

function splitClockTime(clockTime: string) {
  const trimmed = clockTime.trim();
  const match = trimmed.match(/^(.+?)\s*(AM|PM)$/i);
  if (!match) return { time: trimmed, meridiem: "" };
  return { time: match[1]!.trim(), meridiem: match[2]!.toUpperCase() };
}

function liveLabel(connection: ConnectionState) {
  if (connection === "offline") return "OFFLINE";
  if (connection === "connecting") return "CONNECTING";
  return "LIVE";
}

/**
 * Staff board empty state — the approved All Clear mockup, rendered exactly.
 * Live clock / sync chip overlay the baked-in header so the TV stays current
 * without drifting from the designed artwork. No media-library slideshow.
 */
export function StaffBoardEmptyState({
  connection = "live",
  clockTime = "--:--",
  clockDate = "",
  lastUpdated,
  onSlideshowReady
}: StaffBoardEmptyStateProps) {
  const { time, meridiem } = useMemo(() => splitClockTime(clockTime), [clockTime]);
  const isHealthy = connection === "live" || connection === "polling";

  useEffect(() => {
    onSlideshowReady?.();
  }, [onSlideshowReady]);

  return (
    <section
      className="staff-all-clear"
      aria-label="All Clear — no active check-ins or check-outs"
      data-staff-board-layout="empty"
      data-staff-idle-slideshow="fallback"
    >
      <Image
        src={EXACT_MOCKUP}
        alt=""
        fill
        priority
        sizes="100vw"
        className="staff-all-clear__exact-art"
        aria-hidden="true"
      />

      <div className="staff-all-clear__exact-chrome">
        <div className={`staff-all-clear__live ${isHealthy ? "is-live" : "is-down"}`}>
          <span className="staff-all-clear__live-dot" />
          <div className="staff-all-clear__live-copy">
            <strong>{liveLabel(connection)}</strong>
            <span>{isHealthy ? "Board is active" : connection === "connecting" ? "Connecting…" : "Sync unavailable"}</span>
          </div>
        </div>

        <div className="staff-all-clear__clock" aria-live="polite">
          <div className="staff-all-clear__time">
            <span className="staff-all-clear__time-digits">{time}</span>
            {meridiem ? <span className="staff-all-clear__time-meridiem">{meridiem}</span> : null}
          </div>
          <div className="staff-all-clear__date">{clockDate}</div>
        </div>

        <div className="staff-all-clear__updated">
          <RefreshCw className="staff-all-clear__updated-icon" aria-hidden="true" />
          <span>Last updated {formatBoardTime(lastUpdated)}</span>
        </div>
      </div>

      <p className="sr-only">
        All Clear, Team. No check-ins or check-outs right now. Catch your breath, then go make some tails wag. Hydrate. Reset. The next pup is always plotting something.
      </p>
    </section>
  );
}

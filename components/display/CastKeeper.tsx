"use client";

import { useMemo } from "react";
import { CastKeeperProvider, useCastKeeperContext } from "@/hooks/useCastKeeper";
import { formatBoardDateTime } from "@/lib/board-utils";
import type { DisplayType } from "@/lib/display-keeper";

export { CastKeeperProvider };

type CastKeeperChromeProps = {
  displayType: DisplayType;
};

function formatStatusTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatBoardDateTime(date).time;
}

export function CastKeeperChrome({ displayType }: CastKeeperChromeProps) {
  const keeper = useCastKeeperContext();
  const showWakeWarning =
    keeper?.wakeLockStatus === "unsupported" ||
    keeper?.wakeLockStatus === "error" ||
    keeper?.wakeLockStatus === "released";

  const statusLabel = useMemo(() => {
    if (!keeper) return "Cast Keeper";
    if (keeper.connection === "offline") return "Offline";
    if (keeper.connection === "reconnecting") return "Reconnecting";
    return "Online";
  }, [keeper]);

  const statusClass =
    keeper?.connection === "online"
      ? "cast-keeper-status--online"
      : keeper?.connection === "reconnecting"
        ? "cast-keeper-status--reconnecting"
        : "cast-keeper-status--offline";

  return (
    <>
      {showWakeWarning ? (
        <div className="cast-keeper-warning" role="status">
          Display may sleep — keep this screen awake. Wake lock is{" "}
          {keeper?.wakeLockStatus === "unsupported" ? "not supported" : "inactive"} on this device.
        </div>
      ) : null}

      <div className={`cast-keeper-status ${statusClass}`} aria-live="polite">
        <span className="cast-keeper-status__dot" aria-hidden />
        <span className="cast-keeper-status__label">{statusLabel}</span>
        <span className="cast-keeper-status__meta">
          Cast Keeper active · {displayType === "staff_whiteboard" ? "Staff" : "Lobby"} · Updated{" "}
          {formatStatusTime(keeper?.lastDataAt ?? keeper?.lastHeartbeatAt ?? null)}
        </span>
        <span className="cast-keeper-status__pulse" aria-hidden>
          {keeper?.lastHeartbeatAt ? new Date(keeper.lastHeartbeatAt).getTime() : 0}
        </span>
      </div>
    </>
  );
}

"use client";

import clsx from "clsx";

export type CastModeStatus = "live" | "reconnecting" | "offline";

type CastModeStatusIndicatorProps = {
  status: CastModeStatus;
};

function statusCopy(status: CastModeStatus) {
  if (status === "live") return "Live";
  if (status === "offline") return "Offline";
  return "Reconnecting";
}

export function CastModeStatusIndicator({ status }: CastModeStatusIndicatorProps) {
  return (
    <div className={clsx("cast-mode-status", `cast-mode-status--${status}`)} aria-label={`Cast status: ${statusCopy(status)}`}>
      <span className="cast-mode-status__dot" aria-hidden />
      <span>{statusCopy(status)}</span>
    </div>
  );
}

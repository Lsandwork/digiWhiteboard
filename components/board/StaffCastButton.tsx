"use client";

import { Cast, MonitorOff, Tv } from "lucide-react";

type StaffCastButtonProps = {
  isCasting: boolean;
  castError: string | null;
  canChromecast: boolean;
  onToggle: () => void;
};

export function StaffCastButton({ isCasting, castError, canChromecast, onToggle }: StaffCastButtonProps) {
  return (
    <div className="staff-cast-control">
      <button
        type="button"
        onClick={onToggle}
        className={`staff-cast-button ${isCasting ? "staff-cast-button--active" : ""}`}
        aria-pressed={isCasting}
        disabled={!canChromecast && !isCasting}
        aria-label={
          isCasting
            ? "Stop casting staff digital whiteboard"
            : canChromecast
              ? "Cast staff digital whiteboard to TV with Google Chrome"
              : "Casting requires Google Chrome"
        }
        title={canChromecast ? undefined : "Use Google Chrome on desktop to cast to TV."}
      >
        {isCasting ? <MonitorOff className="h-4 w-4 shrink-0" aria-hidden /> : <Tv className="h-4 w-4 shrink-0" aria-hidden />}
        <span>{isCasting ? "Stop Casting" : "Cast to TV"}</span>
        {!isCasting && canChromecast ? <Cast className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden /> : null}
      </button>

      {castError ? <p className="staff-cast-error">{castError}</p> : null}
      {!canChromecast && !isCasting ? (
        <p className="staff-cast-error">Use Google Chrome on desktop to cast.</p>
      ) : null}
    </div>
  );
}

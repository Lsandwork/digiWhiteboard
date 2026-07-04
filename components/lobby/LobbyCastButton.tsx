"use client";

import { Cast, MonitorOff, Tv } from "lucide-react";

type LobbyCastButtonProps = {
  isCasting: boolean;
  castError: string | null;
  canChromecast: boolean;
  onToggle: () => void;
};

export function LobbyCastButton({ isCasting, castError, canChromecast, onToggle }: LobbyCastButtonProps) {
  return (
    <div className="lobby-cast-control">
      <button
        type="button"
        onClick={onToggle}
        className={`lobby-cast-button ${isCasting ? "lobby-cast-button--active" : ""}`}
        aria-pressed={isCasting}
        disabled={!canChromecast && !isCasting}
        aria-label={
          isCasting
            ? "Stop casting lobby board"
            : canChromecast
              ? "Cast lobby board to TV with Google Chrome"
              : "Casting requires Google Chrome"
        }
        title={canChromecast ? undefined : "Use Google Chrome on desktop to cast to TV."}
      >
        {isCasting ? <MonitorOff className="h-4 w-4 shrink-0" aria-hidden /> : <Tv className="h-4 w-4 shrink-0" aria-hidden />}
        <span>{isCasting ? "Stop Casting" : "Cast to TV"}</span>
        {!isCasting && canChromecast ? <Cast className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden /> : null}
      </button>

      {castError ? <p className="lobby-cast-error">{castError}</p> : null}
      {!canChromecast && !isCasting ? (
        <p className="lobby-cast-error">Use Google Chrome on desktop to cast.</p>
      ) : null}
    </div>
  );
}

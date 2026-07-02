"use client";

import { Monitor, MonitorOff, Tv } from "lucide-react";

type LobbyCastButtonProps = {
  isCasting: boolean;
  castError: string | null;
  onToggle: () => void;
};

export function LobbyCastButton({ isCasting, castError, onToggle }: LobbyCastButtonProps) {
  return (
    <div className="lobby-cast-control">
      <button
        type="button"
        onClick={onToggle}
        className={`lobby-cast-button ${isCasting ? "lobby-cast-button--active" : ""}`}
        aria-pressed={isCasting}
        aria-label={isCasting ? "Exit TV display mode" : "Cast lobby board to TV"}
      >
        {isCasting ? <MonitorOff className="h-4 w-4 shrink-0" aria-hidden /> : <Tv className="h-4 w-4 shrink-0" aria-hidden />}
        <span>{isCasting ? "Exit TV" : "Cast to TV"}</span>
        {!isCasting ? <Monitor className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden /> : null}
      </button>
      {castError ? <p className="lobby-cast-error">{castError}</p> : null}
    </div>
  );
}

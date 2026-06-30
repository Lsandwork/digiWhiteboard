"use client";

import clsx from "clsx";
import { Monitor } from "lucide-react";

type WakeLockStatusChipProps = {
  status: "unsupported" | "active" | "released" | "error" | "idle";
  onRequest: () => void;
};

export function WakeLockStatusChip({ status, onRequest }: WakeLockStatusChipProps) {
  if (status === "active") {
    return (
      <div className="board-chip inline-flex items-center gap-2 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-fitdog-green shadow-[0_0_10px_rgba(104,247,127,0.6)]" />
        <span className="text-sm font-semibold text-slate-200">Screen awake</span>
      </div>
    );
  }

  if (status === "unsupported") {
    return (
      <div className="board-chip inline-flex items-center gap-2 px-3 py-2">
        <Monitor className="h-4 w-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-500">Wake lock unavailable</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onRequest}
      className={clsx(
        "board-chip inline-flex items-center gap-2 px-3 py-2 transition hover:border-slate-500/60",
        status === "error" ? "border-amber-400/30" : ""
      )}
    >
      <span className={clsx("h-2 w-2 rounded-full", status === "error" ? "bg-amber-400" : "bg-slate-500")} />
      <span className="text-sm font-semibold text-slate-200">Keep screen awake</span>
    </button>
  );
}

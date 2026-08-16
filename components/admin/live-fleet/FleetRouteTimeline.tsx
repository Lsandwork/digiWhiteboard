"use client";

import type { LiveFleetStop } from "@/lib/live-fleet/types";

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit"
  });
}

function statusGlyph(stop: LiveFleetStop): string {
  if (stop.status === "completed" || stop.status === "skipped") return "✓";
  if (stop.isNext || stop.status === "current") return "●";
  if (stop.status === "exception") return "!";
  return "○";
}

type Props = {
  stops: LiveFleetStop[];
};

export function FleetRouteTimeline({ stops }: Props) {
  if (!stops.length) {
    return <p className="text-sm text-admin-muted">No stops on today&apos;s route.</p>;
  }

  return (
    <ol className="space-y-0">
      {stops.map((stop, index) => {
        const time = formatTime(stop.etaArrival);
        const active = stop.isNext || stop.status === "current";
        const done = stop.status === "completed" || stop.status === "skipped";
        return (
          <li key={stop.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < stops.length - 1 ? (
              <span
                className={`absolute left-[9px] top-5 h-[calc(100%-12px)] w-px ${
                  done ? "bg-emerald-500/50" : "bg-white/15"
                }`}
              />
            ) : null}
            <span
              className={`relative z-[1] mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                active
                  ? "bg-fitdog-orange text-white"
                  : done
                    ? "bg-emerald-500/20 text-emerald-300"
                    : stop.status === "exception"
                      ? "bg-rose-500/20 text-rose-300"
                      : "bg-white/10 text-admin-muted"
              }`}
            >
              {statusGlyph(stop)}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`truncate text-sm font-medium ${active ? "text-white" : "text-white/90"}`}>
                {stop.label}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-admin-muted">
                <span className="capitalize">{stop.direction}</span>
                {stop.locationType ? <span>{stop.locationType}</span> : null}
                {active ? <span className="font-semibold text-fitdog-orange">NEXT</span> : null}
                {time ? <span>{time}</span> : null}
              </div>
              {stop.dogNames.length > 1 ? (
                <div className="mt-1 truncate text-[11px] text-admin-muted">{stop.dogNames.join(", ")}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

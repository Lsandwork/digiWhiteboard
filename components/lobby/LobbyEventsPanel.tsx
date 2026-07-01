"use client";

import Image from "next/image";
import { lobbyAssets, lobbyIconPath } from "@/lib/lobby/assets";
import type { LobbyEvent } from "@/lib/lobby/types";

function formatEventDate(value: string | null) {
  if (!value) return "Coming Soon";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Coming Soon";
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

type LobbyEventsPanelProps = {
  events: LobbyEvent[];
};

export function LobbyEventsPanel({ events }: LobbyEventsPanelProps) {
  return (
    <section>
      <h3 className="mb-4 text-xl font-black uppercase tracking-[0.24em] text-white sm:text-2xl">Upcoming Events</h3>
      <div className="space-y-3">
        {events.slice(0, 5).map((event) => (
          <article
            key={event.id}
            className="flex items-start gap-3 rounded-2xl border border-white/10 bg-ink-900/60 p-4"
          >
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fitdog-orange/15">
              <Image src={lobbyIconPath("calendar")} alt="" width={22} height={22} className="h-5 w-5" loading="lazy" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-white sm:text-xl">{event.title}</p>
              {event.description ? <p className="mt-1 text-sm text-slate-400">{event.description}</p> : null}
              <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-fitdog-orange">
                {formatEventDate(event.event_at)}
              </p>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-fitdog-orange/20">
        <Image
          src={lobbyAssets.spaBanner}
          alt="Spa Day Sundays member special"
          width={640}
          height={180}
          className="h-auto w-full object-cover"
          loading="lazy"
        />
      </div>
    </section>
  );
}

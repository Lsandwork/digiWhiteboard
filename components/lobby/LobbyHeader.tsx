"use client";

import Image from "next/image";
import { lobbyAssets } from "@/lib/lobby/assets";
import { formatBoardDateTime } from "@/lib/board-utils";

type LobbyHeaderProps = {
  clock: Date;
  healthy: boolean;
  subtitle?: string | null;
};

export function LobbyHeader({ clock, healthy, subtitle }: LobbyHeaderProps) {
  const { time, date } = formatBoardDateTime(clock);

  return (
    <header className="lobby-header flex items-start justify-between gap-6">
      <div className="flex min-w-0 items-center gap-5">
        <Image
          src={lobbyAssets.logoSvg}
          alt="Fitdog Health and Social Club"
          width={88}
          height={88}
          className="h-16 w-16 shrink-0 sm:h-20 sm:w-20"
          priority
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-fitdog-orange/90 sm:text-base">
            Fitdog Health &amp; Social Club
          </p>
          <h1 className="lobby-title mt-1 text-4xl font-black uppercase tracking-wide text-white sm:text-6xl">
            Now Checking Out
          </h1>
          {subtitle ? <p className="mt-2 max-w-3xl text-lg text-slate-300 sm:text-xl">{subtitle}</p> : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-3">
        <div className="flex items-center gap-3">
          <Image
            src={lobbyAssets.syncedBadge}
            alt=""
            width={180}
            height={40}
            className="h-8 w-auto opacity-95"
          />
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
              healthy ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"
            }`}
          >
            {healthy ? "Live Checkout Sync" : "Refreshing"}
          </span>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tabular-nums text-white sm:text-4xl">{time}</p>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400 sm:text-base">{date}</p>
        </div>
      </div>
    </header>
  );
}

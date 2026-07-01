"use client";

import Image from "next/image";
import { lobbyAssets } from "@/lib/lobby/assets";
import { formatBoardDateTime } from "@/lib/board-utils";

type LobbyHeaderProps = {
  clock: Date;
  healthy: boolean;
  lobbyMessage?: string | null;
};

export function LobbyHeader({ clock, healthy, lobbyMessage }: LobbyHeaderProps) {
  const { time, date } = formatBoardDateTime(clock);

  return (
    <header className="lobby-header flex items-start justify-between gap-6">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center">
        <Image
          src={lobbyAssets.logoLockup}
          alt="Fitdog Health and Social Club"
          width={420}
          height={96}
          className="h-14 w-auto shrink-0 sm:h-16 lg:h-[4.5rem]"
          priority
        />
        <div className="min-w-0">
          <h1 className="lobby-title text-4xl font-black uppercase tracking-wide text-white sm:text-5xl xl:text-6xl">
            Now Checking Out
          </h1>
          <p className="mt-2 text-lg font-bold uppercase tracking-[0.22em] text-lobby-orange sm:text-xl">
            Your Dog&apos;s Best Life
          </p>
          {lobbyMessage ? (
            <p className="mt-2 max-w-3xl text-base text-slate-300 sm:text-lg">{lobbyMessage}</p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-3">
        <div className="flex items-center gap-3">
          <Image
            src={lobbyAssets.syncedBadge}
            alt="Synced with Gingr"
            width={200}
            height={44}
            className="h-9 w-auto opacity-95"
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

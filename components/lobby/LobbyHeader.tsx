"use client";

import Image from "next/image";
import { lobbyAssets } from "@/lib/lobby/assets";
import { formatBoardDateTime } from "@/lib/board-utils";

type LobbyHeaderProps = {
  clock: Date;
  healthy: boolean;
};

export function LobbyHeader({ clock, healthy }: LobbyHeaderProps) {
  const { time, date } = formatBoardDateTime(clock);

  return (
    <header className="lobby-header grid grid-cols-[minmax(0,220px)_1fr_auto] items-center gap-4 xl:gap-6">
      <Image
        src={lobbyAssets.logoLockup}
        alt="Fitdog Health and Social Club"
        width={240}
        height={80}
        className="h-14 w-auto shrink-0 xl:h-16"
        priority
      />

      <div className="min-w-0 text-center">
        <h1 className="lobby-title text-3xl font-black uppercase tracking-[0.04em] text-white xl:text-5xl">
          Now Checking Out
        </h1>
        <p className="mt-1 text-sm font-bold uppercase tracking-[0.18em] text-lobby-orange xl:text-base">
          Your Dog&apos;s Best Life
        </p>
        <p className="mt-1 text-sm text-white/90 xl:text-base">
          Thank you for letting us <span className="font-semibold text-lobby-teal">play, care &amp; connect!</span>
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Image src={lobbyAssets.syncedBadge} alt="Synced with Gingr" width={190} height={42} className="h-9 w-auto" />
          <span
            className={`lobby-sync-pill rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide xl:text-xs ${
              healthy ? "lobby-sync-pill--live" : "lobby-sync-pill--refresh"
            }`}
          >
            {healthy ? "Live Checkout Sync" : "Refreshing"}
          </span>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tabular-nums text-white xl:text-4xl">{time}</p>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lobby-teal">{date}</p>
        </div>
      </div>
    </header>
  );
}

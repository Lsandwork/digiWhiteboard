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
    <header className="lobby-header mb-1 grid grid-cols-[200px_1fr_auto] items-center gap-6">
      <div>
        <Image
          src={lobbyAssets.logoLockup}
          alt="Fitdog Health and Social Club"
          width={200}
          height={72}
          className="h-[3.25rem] w-auto"
          priority
        />
      </div>

      <div className="text-center">
        <h1 className="text-[2.75rem] font-black uppercase leading-none tracking-wide text-white">Now Checking Out</h1>
        <p className="mt-2 text-base font-bold uppercase tracking-[0.22em] text-lobby-orange">Your Dog&apos;s Best Life</p>
        <p className="mt-1.5 text-lg text-white">
          Thank you for letting us <span className="font-semibold text-lobby-teal">play, care &amp; connect!</span>
        </p>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <Image src={lobbyAssets.syncedBadge} alt="Synced with Gingr" width={175} height={38} className="h-9 w-auto" />
          <span className={`lobby-sync-pill inline-flex items-center ${healthy ? "lobby-sync-pill--live" : "lobby-sync-pill--refresh"}`}>
            <Image
              src={lobbyAssets.syncSignalIcon}
              alt=""
              width={14}
              height={14}
              className="mr-1.5 inline-block h-3.5 w-3.5"
              unoptimized
            />
            {healthy ? "LIVE CHECKOUT SYNC" : "REFRESHING"}
          </span>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold tabular-nums leading-none text-white">{time}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-lobby-teal">{date}</p>
        </div>
      </div>
    </header>
  );
}

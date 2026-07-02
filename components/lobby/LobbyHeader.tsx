"use client";

import Image from "next/image";
import { LobbyAssetImage } from "@/components/lobby/LobbyAssetImage";
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
        <LobbyAssetImage
          src={lobbyAssets.logoBadge}
          alt="Fitdog Health and Social Club"
          width={96}
          height={96}
          className="h-[3.25rem] w-[3.25rem] rounded-full ring-2 ring-lobby-teal/50"
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
          <div
            className="lobby-gingr-badge inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-lobby-orange/55 bg-[#171E24] px-3"
            aria-label="Live with Gingr"
          >
            <Image
              src={lobbyAssets.syncSignalIcon}
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 shrink-0 brightness-0 invert"
              unoptimized
            />
            <span className="text-sm font-extrabold leading-none text-white">Live with</span>
            <Image
              src={lobbyAssets.gingrLogoRed}
              alt="Gingr"
              width={72}
              height={24}
              className="h-5 w-auto shrink-0 object-contain"
              unoptimized
            />
          </div>
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

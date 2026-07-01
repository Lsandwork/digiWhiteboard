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
    <header className="lobby-header grid grid-cols-[auto_1fr_auto] items-start gap-4 lg:gap-6">
      <Image
        src={lobbyAssets.logoLockup}
        alt="Fitdog Health and Social Club"
        width={220}
        height={72}
        className="h-12 w-auto shrink-0 sm:h-14 lg:h-16"
        priority
      />

      <div className="min-w-0 text-center lg:text-left">
        <h1 className="lobby-title text-3xl font-black uppercase tracking-wide text-white sm:text-4xl xl:text-5xl">
          Now Checking Out
        </h1>
        <p className="mt-1 text-sm font-bold uppercase tracking-[0.2em] text-lobby-orange sm:text-base">
          Your Dog&apos;s Best Life
        </p>
        {lobbyMessage ? (
          <p className="mt-1 hidden text-sm text-lobby-muted sm:block lg:text-base">
            <span className="text-lobby-teal">Thank you</span> for letting us{" "}
            <span className="text-lobby-teal">play, care &amp; connect!</span>
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Image
            src={lobbyAssets.syncedBadge}
            alt="Synced with Gingr"
            width={180}
            height={40}
            className="h-8 w-auto"
          />
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide sm:text-xs ${
              healthy
                ? "border-lobby-teal/40 bg-lobby-teal/15 text-lobby-teal"
                : "border-amber-400/40 bg-amber-400/10 text-amber-200"
            }`}
          >
            {healthy ? "Live Checkout Sync" : "Refreshing"}
          </span>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums text-white sm:text-3xl">{time}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lobby-teal sm:text-xs">{date}</p>
        </div>
      </div>
    </header>
  );
}

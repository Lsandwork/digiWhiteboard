"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { LobbyAssetImage } from "@/components/lobby/LobbyAssetImage";
import { lobbyAssets } from "@/lib/lobby/assets";
import { formatBoardDateTime } from "@/lib/board-utils";

type LobbyHeaderProps = {
  clock: Date;
  healthy: boolean;
  hasCheckout?: boolean;
};

export function LobbyHeader({ clock, healthy, hasCheckout = false }: LobbyHeaderProps) {
  const { time, date } = formatBoardDateTime(clock);

  return (
    <header className="lobby-header mb-1 grid grid-cols-[200px_1fr_auto] items-center gap-6">
      <div>
        <Link href="/admin" aria-label="Open Fitdog admin" title="Fitdog Admin" className="inline-block rounded-full transition hover:ring-2 hover:ring-lobby-orange/70">
          <LobbyAssetImage
            src={lobbyAssets.logoBadge}
            alt="Fitdog Health and Social Club"
            width={96}
            height={96}
            className="h-[3.25rem] w-[3.25rem] rounded-full ring-2 ring-lobby-teal/50"
            priority
          />
        </Link>
      </div>

      <div className="text-center">
        {hasCheckout ? (
          <h1 className="text-[2.75rem] font-black uppercase leading-none tracking-wide text-white">Now Checking Out</h1>
        ) : null}

        <div
          className={`lobby-header-tagline ${hasCheckout ? "lobby-header-tagline--compact mt-2" : "lobby-header-tagline--idle"}`}
        >
          <span className="lobby-header-tagline__line" aria-hidden />
          <p className="lobby-header-tagline__text">Your Dog&apos;s Best Life</p>
          <span className="lobby-header-tagline__line" aria-hidden />
        </div>

        <p className={`lobby-header-subtitle ${hasCheckout ? "mt-1.5 text-lg" : "mt-2 text-xl"}`}>
          Thank you for letting us <span className="font-semibold text-lobby-teal">play, care &amp; connect!</span>
        </p>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <div className="lobby-checkout-sync-btn" aria-label="Live checkout sync status">
            <RefreshCw className="h-4 w-4 shrink-0 text-lobby-teal" strokeWidth={2.5} />
            <span>Live Checkout Sync</span>
          </div>
          <span className={`lobby-live-indicator ${healthy ? "lobby-live-indicator--on" : "lobby-live-indicator--refresh"}`}>
            <span className="lobby-live-indicator__dot" aria-hidden />
            {healthy ? "Live" : "Refreshing"}
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

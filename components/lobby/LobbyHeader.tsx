"use client";

import Link from "next/link";
import Image from "next/image";
import { LobbyStatusClock } from "@/components/lobby/LobbyStatusClock";
import { lobbyLightAssets } from "@/lib/lobby/assets";

type LobbyHeaderProps = {
  healthy: boolean;
  hasCheckout?: boolean;
};

export function LobbyHeader({ healthy, hasCheckout = false }: LobbyHeaderProps) {
  return (
    <header className="lobby-header lobby-header--light">
      <div className="lobby-header__brand">
        <Link href="/admin" aria-label="Open Fitdog Digi-board" title="Fitdog Digi-board" className="lobby-header__brand-link">
          <Image
            src={lobbyLightAssets.wordmark}
            alt="Fitdog"
            width={340}
            height={90}
            className="lobby-header__wordmark"
            priority
            unoptimized
          />
        </Link>
      </div>

      <div className="lobby-header__center">
        {hasCheckout ? (
          <h1 className="lobby-header__title">
            <span className="lobby-header__title-navy">NOW </span>
            <span className="lobby-header__title-orange">CHECKING</span>
            <span className="lobby-header__title-navy"> OUT</span>
            <span className="lobby-header__motion" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </h1>
        ) : (
          <div className="lobby-header-tagline lobby-header-tagline--idle">
            <span className="lobby-header-tagline__line" aria-hidden />
            <p className="lobby-header-tagline__text">Your Dog&apos;s Best Life</p>
            <span className="lobby-header-tagline__line" aria-hidden />
          </div>
        )}

        <p className="lobby-header-subtitle">
          Thank you for letting us play, care &amp; connect!
          <Image
            src={lobbyLightAssets.heartOrange}
            alt=""
            width={22}
            height={22}
            className="lobby-header__heart"
            unoptimized
          />
        </p>
      </div>

      <div className="lobby-header__status">
        <div className="lobby-header__status-row">
          <span className={`lobby-live-indicator ${healthy ? "lobby-live-indicator--on" : "lobby-live-indicator--refresh"}`}>
            <span className="lobby-live-indicator__dot" aria-hidden />
            {healthy ? "LIVE" : "Refreshing"}
          </span>
          <div className="lobby-checkout-sync-btn" aria-label="Live checkout sync status">
            <Image src={lobbyLightAssets.syncTeal} alt="" width={18} height={18} className="h-4 w-4 object-contain" unoptimized />
            <span>Live Checkout Sync</span>
          </div>
        </div>
        <LobbyStatusClock />
      </div>
    </header>
  );
}

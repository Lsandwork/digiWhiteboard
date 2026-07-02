"use client";

import type { ReactNode } from "react";
import { Cast, Copy, Link2, Monitor, MonitorOff, Radio, Tv, X } from "lucide-react";

type LobbyCastButtonProps = {
  menuOpen: boolean;
  isCasting: boolean;
  castError: string | null;
  tvCastUrl: string;
  canChromecast: boolean;
  chromecastAppId: string;
  canAirPlay: boolean;
  canFullscreen: boolean;
  onToggle: () => void;
  onCloseMenu: () => void;
  onChromecast: () => void;
  onAirPlay: () => void;
  onFullscreen: () => void;
  onCopyLink: () => void;
  onOpenLink: () => void;
};

function CastOption({
  title,
  description,
  disabled,
  onClick,
  icon
}: {
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      className="lobby-cast-option"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="lobby-cast-option__icon" aria-hidden>
        {icon}
      </span>
      <span className="lobby-cast-option__copy">
        <span className="lobby-cast-option__title">{title}</span>
        <span className="lobby-cast-option__description">{description}</span>
      </span>
    </button>
  );
}

export function LobbyCastButton({
  menuOpen,
  isCasting,
  castError,
  tvCastUrl,
  canChromecast,
  chromecastAppId,
  canAirPlay,
  canFullscreen,
  onToggle,
  onCloseMenu,
  onChromecast,
  onAirPlay,
  onFullscreen,
  onCopyLink,
  onOpenLink
}: LobbyCastButtonProps) {
  return (
    <div className="lobby-cast-control">
      <button
        type="button"
        onClick={onToggle}
        className={`lobby-cast-button ${isCasting ? "lobby-cast-button--active" : ""}`}
        aria-pressed={isCasting || menuOpen}
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
        aria-label={isCasting ? "Stop casting lobby board" : "Cast lobby board to TV"}
      >
        {isCasting ? <MonitorOff className="h-4 w-4 shrink-0" aria-hidden /> : <Tv className="h-4 w-4 shrink-0" aria-hidden />}
        <span>{isCasting ? "Stop Casting" : "Cast to TV"}</span>
        {!isCasting ? <Cast className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden /> : null}
      </button>

      {menuOpen ? (
        <div className="lobby-cast-menu" role="dialog" aria-label="Cast lobby board to TV">
          <div className="lobby-cast-menu__header">
            <div>
              <p className="lobby-cast-menu__title">Cast to TV</p>
              <p className="lobby-cast-menu__subtitle">Choose Chromecast, AirPlay, or a TV browser.</p>
            </div>
            <button type="button" className="lobby-cast-menu__close" onClick={onCloseMenu} aria-label="Close cast menu">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="lobby-cast-menu__options">
            <CastOption
              title="Chromecast"
              description={
                canChromecast
                  ? chromecastAppId
                    ? "Cast the full lobby board to Chromecast or Google TV."
                    : "Opens Chrome's device picker for Chromecast, smart TVs, and wireless displays."
                  : "Use Chrome on desktop to cast to Chromecast."
              }
              disabled={!canChromecast}
              onClick={onChromecast}
              icon={<Cast className="h-4 w-4" />}
            />
            <CastOption
              title="AirPlay"
              description={
                canAirPlay
                  ? "Share this tab, then choose your Apple TV or AirPlay TV."
                  : "Use Safari on Mac, iPhone, or iPad for AirPlay."
              }
              disabled={!canAirPlay}
              onClick={onAirPlay}
              icon={<Radio className="h-4 w-4" />}
            />
            <CastOption
              title="Open on TV browser"
              description="Open the TV layout in a new window for a smart TV or streaming stick browser."
              onClick={onOpenLink}
              icon={<Link2 className="h-4 w-4" />}
            />
            <CastOption
              title="Copy TV link"
              description="Paste this link into the browser on your lobby TV."
              onClick={onCopyLink}
              icon={<Copy className="h-4 w-4" />}
            />
            {canFullscreen ? (
              <CastOption
                title="Fullscreen on this screen"
                description="Use only when this device is already connected to the TV."
                onClick={onFullscreen}
                icon={<Monitor className="h-4 w-4" />}
              />
            ) : null}
          </div>

          <p className="lobby-cast-menu__url" title={tvCastUrl}>
            TV link: {tvCastUrl}
          </p>
          {chromecastAppId ? (
            <p className="lobby-cast-menu__hint">Chromecast app ID: {chromecastAppId}</p>
          ) : null}
        </div>
      ) : null}

      {castError ? <p className="lobby-cast-error">{castError}</p> : null}
    </div>
  );
}

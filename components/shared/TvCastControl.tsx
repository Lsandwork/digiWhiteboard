"use client";

import { useEffect, useState } from "react";
import { Cast, Copy, MonitorOff, Radio, Smartphone, Tv, Wifi, X } from "lucide-react";
import {
  getCastReadyHint,
  getCastUnavailableMessage,
  shouldShowCastMenu,
  supportsAirPlayCast,
  supportsChromecastPicker,
  supportsWirelessPresentationCast
} from "@/lib/lobby/cast-platform";

export type TvCastVariant = "staff" | "lobby";
export type TvCastMethod = "chromecast" | "wireless" | "airplay" | null;

type TvCastControlProps = {
  variant: TvCastVariant;
  boardLabel: string;
  castUrl: string;
  isCasting: boolean;
  castError: string | null;
  canCast: boolean;
  castMethod: TvCastMethod;
  onChromecast: () => void;
  onWireless: () => void;
  onAirPlay: () => void;
  onCopyUrl: () => void;
  onStop: () => void;
  onQuickCast: () => void;
};

function prefix(variant: TvCastVariant, className: string) {
  return `${variant === "staff" ? "staff" : "lobby"}-${className}`;
}

export function TvCastControl({
  variant,
  boardLabel,
  castUrl,
  isCasting,
  castError,
  canCast,
  castMethod,
  onChromecast,
  onWireless,
  onAirPlay,
  onCopyUrl,
  onStop,
  onQuickCast
}: TvCastControlProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const showMenu = shouldShowCastMenu();
  const controlClass = prefix(variant, "cast-control");
  const buttonClass = prefix(variant, "cast-button");
  const errorClass = prefix(variant, "cast-error");
  const menuClass = prefix(variant, "cast-menu");

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const methodLabel =
    castMethod === "wireless"
      ? "Wireless Display"
      : castMethod === "airplay"
        ? "AirPlay"
        : castMethod === "chromecast"
          ? "Chromecast"
          : "Casting";

  async function handleCopy() {
    onCopyUrl();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (isCasting) {
    return (
      <div className={controlClass}>
        <button
          type="button"
          onClick={onStop}
          className={`${buttonClass} ${prefix(variant, "cast-button--active")}`}
          aria-pressed
          aria-label={`Stop casting ${boardLabel}`}
        >
          <MonitorOff className="h-4 w-4 shrink-0" aria-hidden />
          <span>Stop {methodLabel}</span>
        </button>
        {castError ? <p className={errorClass}>{castError}</p> : null}
      </div>
    );
  }

  if (showMenu) {
    return (
      <div className={controlClass}>
        <div className={prefix(variant, "cast-actions")}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className={`${buttonClass} ${menuOpen ? prefix(variant, "cast-button--active") : ""}`}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            disabled={!canCast}
            aria-label={`Cast ${boardLabel} to TV from mobile Chrome`}
          >
            <Smartphone className="h-4 w-4 shrink-0" aria-hidden />
            <span>Cast to TV</span>
            <Cast className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          </button>
        </div>

        {menuOpen ? (
          <div className={menuClass} role="dialog" aria-label={`Cast ${boardLabel}`}>
            <div className={`${menuClass}__header`}>
              <div>
                <p className={`${menuClass}__title`}>Cast {boardLabel}</p>
                <p className={`${menuClass}__subtitle`}>{getCastReadyHint()}</p>
              </div>
              <button type="button" className={`${menuClass}__close`} onClick={() => setMenuOpen(false)} aria-label="Close cast menu">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className={`${menuClass}__options`}>
              <button
                type="button"
                className={`${menuClass}__option`}
                disabled={!supportsWirelessPresentationCast()}
                onClick={() => {
                  setMenuOpen(false);
                  onWireless();
                }}
              >
                <span className={`${menuClass}__option-icon`}>
                  <Wifi className="h-4 w-4" />
                </span>
                <span className={`${menuClass}__option-copy`}>
                  <span className={`${menuClass}__option-title`}>Wireless Display</span>
                  <span className={`${menuClass}__option-description`}>
                    Best for Google Chrome on Android phones and tablets.
                  </span>
                </span>
              </button>

              <button
                type="button"
                className={`${menuClass}__option`}
                disabled={!supportsChromecastPicker()}
                onClick={() => {
                  setMenuOpen(false);
                  onChromecast();
                }}
              >
                <span className={`${menuClass}__option-icon`}>
                  <Cast className="h-4 w-4" />
                </span>
                <span className={`${menuClass}__option-copy`}>
                  <span className={`${menuClass}__option-title`}>Chromecast</span>
                  <span className={`${menuClass}__option-description`}>
                    Use when the Cast icon appears in Chrome and your TV is on the same Wi‑Fi.
                  </span>
                </span>
              </button>

              {supportsAirPlayCast() ? (
                <button
                  type="button"
                  className={`${menuClass}__option`}
                  onClick={() => {
                    setMenuOpen(false);
                    onAirPlay();
                  }}
                >
                  <span className={`${menuClass}__option-icon`}>
                    <Radio className="h-4 w-4" />
                  </span>
                  <span className={`${menuClass}__option-copy`}>
                    <span className={`${menuClass}__option-title`}>AirPlay</span>
                    <span className={`${menuClass}__option-description`}>Mirror this tab to Apple TV or AirPlay TVs.</span>
                  </span>
                </button>
              ) : null}

              <button
                type="button"
                className={`${menuClass}__option`}
                onClick={() => void handleCopy()}
              >
                <span className={`${menuClass}__option-icon`}>
                  <Copy className="h-4 w-4" />
                </span>
                <span className={`${menuClass}__option-copy`}>
                  <span className={`${menuClass}__option-title`}>{copied ? "TV link copied" : "Copy TV link"}</span>
                  <span className={`${menuClass}__option-description`}>
                    Open the link directly on your TV browser or share it with front desk.
                  </span>
                </span>
              </button>
            </div>

            <p className={`${menuClass}__url`}>{castUrl}</p>
            <p className={`${menuClass}__hint`}>Keep this phone tab open while casting. Same Wi‑Fi as the TV works best.</p>
          </div>
        ) : null}

        {castError ? <p className={errorClass}>{castError}</p> : null}
        {!canCast ? <p className={errorClass}>{getCastUnavailableMessage()}</p> : null}
      </div>
    );
  }

  return (
    <div className={controlClass}>
      <button
        type="button"
        onClick={onQuickCast}
        className={buttonClass}
        aria-pressed={false}
        disabled={!canCast}
        aria-label={`Cast ${boardLabel} to TV with Google Chrome`}
        title={canCast ? undefined : getCastUnavailableMessage()}
      >
        <Tv className="h-4 w-4 shrink-0" aria-hidden />
        <span>Cast to TV</span>
        {canCast ? <Cast className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden /> : null}
      </button>

      {castError ? <p className={errorClass}>{castError}</p> : null}
      {!canCast ? <p className={errorClass}>{getCastUnavailableMessage()}</p> : null}
    </div>
  );
}

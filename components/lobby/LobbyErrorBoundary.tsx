"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import Image from "next/image";
import { debugBoardClient } from "@/lib/board-debug";
import { lobbyAssets } from "@/lib/lobby/assets";
import { LobbyIdleSlideshow } from "@/components/lobby/LobbyIdleSlideshow";
import { LobbyAssetImage } from "@/components/lobby/LobbyAssetImage";
import { getDefaultLobbySettings } from "@/lib/lobby/validate";

const LAST_GOOD_LOBBY_BOARD_KEY = "fitdog-lobby-board-last-good";

type LobbyErrorBoundaryProps = {
  children: ReactNode;
  debugBoard?: boolean;
};

type LobbyErrorBoundaryState = {
  hasError: boolean;
  message: string | null;
};

function readLastGoodMessage() {
  if (typeof window === "undefined") return getDefaultLobbySettings().footer_message;
  try {
    const raw = window.sessionStorage.getItem(LAST_GOOD_LOBBY_BOARD_KEY);
    if (!raw) return getDefaultLobbySettings().footer_message;
    const parsed = JSON.parse(raw) as { footerMessage?: string };
    return parsed.footerMessage?.trim() || getDefaultLobbySettings().footer_message;
  } catch {
    return getDefaultLobbySettings().footer_message;
  }
}

export function rememberLobbyBoardHealthyState(footerMessage: string | null | undefined) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      LAST_GOOD_LOBBY_BOARD_KEY,
      JSON.stringify({ footerMessage: footerMessage ?? getDefaultLobbySettings().footer_message })
    );
  } catch {
    // Ignore storage failures on locked-down browsers.
  }
}

export class LobbyErrorBoundary extends Component<LobbyErrorBoundaryProps, LobbyErrorBoundaryState> {
  state: LobbyErrorBoundaryState = {
    hasError: false,
    message: null
  };

  static getDerivedStateFromError(error: Error): LobbyErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "Lobby board hit an unexpected error."
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    debugBoardClient(this.props.debugBoard ?? false, "lobby-error-boundary", "render failure", {
      message: error.message,
      componentStack: info.componentStack
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const footerMessage = readLastGoodMessage();

    return (
      <main className="lobby-shell lobby-idle-state">
        <Image src={lobbyAssets.background} alt="" fill priority className="lobby-background object-cover" unoptimized />
        <div className="lobby-content relative z-10 flex min-h-screen flex-col px-8 py-5">
          <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-sm text-amber-100">
            Lobby board recovered to a safe display. {this.state.message}
          </div>

          <div className="lobby-main-grid mt-4 grid min-h-0 flex-1 grid-cols-[1.75fr_1fr] gap-5">
            <div className="flex min-h-0 flex-col gap-4">
              <LobbyIdleSlideshow />
            </div>
            <section className="social-moments-card flex h-full min-h-0 items-center justify-center rounded-2xl border border-white/10 bg-black/20 p-6 text-center text-white/80">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-white/60">Fitdog Lobby</p>
                <h2 className="mt-2 text-2xl font-black text-white">We&apos;re keeping the board live</h2>
                <p className="mt-2 text-sm">Checkout data will refresh automatically.</p>
              </div>
            </section>
          </div>

          <footer className="lobby-footer mt-4 flex h-14 shrink-0 items-center gap-4 px-8">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center">
              <LobbyAssetImage src={lobbyAssets.pawIcon} alt="" width={20} height={20} className="h-5 w-5 opacity-95" />
            </div>
            <p className="flex-1 text-center text-base font-semibold text-white">{footerMessage}</p>
          </footer>
        </div>
      </main>
    );
  }
}

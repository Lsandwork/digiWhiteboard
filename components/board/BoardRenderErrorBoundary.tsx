"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { debugBoardClient } from "@/lib/board-debug";

type BoardRenderErrorBoundaryProps = {
  children: ReactNode;
  label?: string;
  debugBoard?: boolean;
  /** Auto reload the page after a render crash so unattended TVs self-heal. */
  autoReloadMs?: number;
};

type BoardRenderErrorBoundaryState = {
  hasError: boolean;
  message: string | null;
};

const RELOAD_GUARD_KEY = "fitdog-board-render-reload";

/** Call once a board renders healthy so a later crash can auto-reload again. */
export function clearBoardRenderReloadGuard() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(RELOAD_GUARD_KEY);
  } catch {
    // Ignore storage failures on locked-down TV browsers.
  }
}

export class BoardRenderErrorBoundary extends Component<
  BoardRenderErrorBoundaryProps,
  BoardRenderErrorBoundaryState
> {
  private reloadTimer: number | null = null;

  state: BoardRenderErrorBoundaryState = {
    hasError: false,
    message: null
  };

  static getDerivedStateFromError(error: Error): BoardRenderErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || "The board hit an unexpected error."
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    debugBoardClient(this.props.debugBoard ?? false, "board-error-boundary", "render failure", {
      label: this.props.label,
      message: error.message,
      componentStack: info.componentStack
    });

    if (typeof window === "undefined") return;
    const autoReloadMs = this.props.autoReloadMs ?? 8000;
    if (autoReloadMs <= 0) return;

    let alreadyReloaded = false;
    try {
      alreadyReloaded = window.sessionStorage.getItem(RELOAD_GUARD_KEY) === "1";
    } catch {
      alreadyReloaded = false;
    }
    if (alreadyReloaded) return;

    this.reloadTimer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
      } catch {
        // Ignore storage failures on locked-down TV browsers.
      }
      window.location.reload();
    }, autoReloadMs);
  }

  componentWillUnmount() {
    if (this.reloadTimer) window.clearTimeout(this.reloadTimer);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="grid min-h-screen place-items-center bg-[#02060b] px-8 text-center text-white">
        <div className="max-w-xl">
          <p className="text-sm uppercase tracking-[0.28em] text-lobby-teal/80">Fitdog {this.props.label ?? "Board"}</p>
          <h1 className="mt-3 text-3xl font-black">Reconnecting the board…</h1>
          <p className="mt-3 text-sm text-white/70">
            The display recovered from a temporary error and will refresh automatically.
          </p>
        </div>
      </main>
    );
  }
}

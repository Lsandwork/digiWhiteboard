"use client";

import type { ReactNode } from "react";
import { KioskDebugOverlay } from "@/components/display/KioskDebugOverlay";
import { useDisplayTvLayout } from "@/hooks/useDisplayTvLayout";

type TvLayoutCanvasProps = {
  enabled: boolean;
  className?: string;
  /** Diagnostic surface label for ?kioskDebug=true */
  surface?: "lobby" | "staff" | "lobby-desktop" | "staff-desktop" | string;
  children: ReactNode;
};

export function TvLayoutCanvas({
  enabled,
  className = "",
  surface,
  children
}: TvLayoutCanvasProps) {
  useDisplayTvLayout(enabled);

  const debugSurface =
    surface ?? (enabled ? "tv" : "desktop");

  if (!enabled) {
    return (
      <>
        {children}
        <KioskDebugOverlay
          surface={debugSurface}
          canvasSelector=".board-shell, .lobby-shell, .lobby-root, main"
          stageSelector="body"
        />
      </>
    );
  }

  return (
    <>
      <div className={`fitdog-tv-stage ${className}`.trim()}>
        <div className="fitdog-tv-canvas">{children}</div>
      </div>
      {/* Temporary Fully/TV diagnostic — enable with ?kioskDebug=true */}
      <KioskDebugOverlay
        surface={debugSurface}
        canvasSelector=".fitdog-tv-canvas"
        stageSelector=".fitdog-tv-stage"
      />
    </>
  );
}

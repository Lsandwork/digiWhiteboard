"use client";

import type { ReactNode } from "react";
import { KioskDebugOverlay } from "@/components/display/KioskDebugOverlay";
import { useDisplayTvLayout } from "@/hooks/useDisplayTvLayout";

type TvLayoutCanvasProps = {
  enabled: boolean;
  className?: string;
  children: ReactNode;
};

export function TvLayoutCanvas({ enabled, className = "", children }: TvLayoutCanvasProps) {
  useDisplayTvLayout(enabled);

  if (!enabled) {
    return (
      <>
        {children}
        <KioskDebugOverlay
          surface="lobby-desktop"
          canvasSelector=".lobby-shell, .lobby-root, main"
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
        surface="lobby"
        canvasSelector=".fitdog-tv-canvas"
        stageSelector=".fitdog-tv-stage"
      />
    </>
  );
}

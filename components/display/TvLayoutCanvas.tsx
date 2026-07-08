"use client";

import type { ReactNode } from "react";
import { useDisplayTvLayout } from "@/hooks/useDisplayTvLayout";

type TvLayoutCanvasProps = {
  enabled: boolean;
  className?: string;
  children: ReactNode;
};

export function TvLayoutCanvas({ enabled, className = "", children }: TvLayoutCanvasProps) {
  useDisplayTvLayout(enabled);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div className={`fitdog-tv-stage ${className}`.trim()}>
      <div className="fitdog-tv-canvas">{children}</div>
    </div>
  );
}

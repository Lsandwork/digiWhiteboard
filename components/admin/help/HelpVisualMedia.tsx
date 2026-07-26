"use client";

import type { HelpVisualStep } from "@/lib/admin/help-content";

type HelpVisualMediaProps = {
  step: HelpVisualStep;
  variant?: "lobby" | "staff";
};

export function HelpVisualMedia({ step }: HelpVisualMediaProps) {
  if (step.video) {
    return (
      <div className="admin-help-visual-step-media">
        <video
          className="admin-help-visual-step-video"
          src={step.video}
          poster={step.poster}
          controls
          playsInline
          preload="metadata"
        >
          Your browser does not support embedded help videos.
        </video>
      </div>
    );
  }

  if (step.image) {
    return (
      <div className="admin-help-visual-step-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={step.image} alt={step.title} className="admin-help-visual-step-image" loading="lazy" decoding="async" />
      </div>
    );
  }

  return null;
}

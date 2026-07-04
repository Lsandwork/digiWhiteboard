"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import {
  CastButtonIllustration,
  CastChromeIllustration,
  CastPickerIllustration,
  type HelpCastIllustrationId
} from "@/components/admin/help/CastHelpIllustrations";

type HelpCastWalkthroughProps = {
  variant: "lobby" | "staff";
};

const STEPS: { id: HelpCastIllustrationId; label: string }[] = [
  { id: "cast-chrome", label: "Open Chrome" },
  { id: "cast-button", label: "Click Cast to TV" },
  { id: "cast-picker", label: "Select the TV" }
];

const STEP_MS = 3800;

export function HelpCastWalkthrough({ variant }: HelpCastWalkthroughProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStepIndex((current) => (current + 1) % STEPS.length);
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [playing]);

  const step = STEPS[stepIndex];

  return (
    <div className="admin-help-walkthrough">
      <div className="admin-help-walkthrough-header">
        <div>
          <p className="admin-help-walkthrough-label">Screen demo</p>
          <p className="admin-help-walkthrough-title">
            {variant === "staff" ? "How to cast the staff board" : "How to cast the lobby board"}
          </p>
        </div>
        <button
          type="button"
          className="admin-help-walkthrough-toggle"
          onClick={() => setPlaying((current) => !current)}
          aria-pressed={playing}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "Pause demo" : "Play demo"}
        </button>
      </div>

      <div className="admin-help-walkthrough-stage" key={step.id}>
        {step.id === "cast-chrome" ? <CastChromeIllustration variant={variant} /> : null}
        {step.id === "cast-button" ? <CastButtonIllustration variant={variant} /> : null}
        {step.id === "cast-picker" ? <CastPickerIllustration variant={variant} /> : null}
      </div>

      <div className="admin-help-walkthrough-steps" role="tablist" aria-label="Cast walkthrough steps">
        {STEPS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={index === stepIndex}
            className={`admin-help-walkthrough-step ${index === stepIndex ? "admin-help-walkthrough-step--active" : ""}`}
            onClick={() => {
              setStepIndex(index);
              setPlaying(false);
            }}
          >
            <span>{index + 1}</span>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

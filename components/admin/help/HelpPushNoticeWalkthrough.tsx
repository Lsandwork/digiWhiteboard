"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

const STEPS = [
  {
    id: "compose",
    label: "Open Push Notices",
    image: "/help/push-notices.png",
    caption: "In Digi-Board, open Staff Digital Whiteboard → Standard Notices (Push Notices)."
  },
  {
    id: "board",
    label: "Shows on staff TV",
    image: "/help/staff-whiteboard.png",
    caption: "After you push, the notice appears on the live Staff Digital Whiteboard at staff.ruffops.com."
  }
] as const;

const STEP_MS = 4200;

export function HelpPushNoticeWalkthrough() {
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStepIndex((current) => (current + 1) % STEPS.length);
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [playing]);

  const step = STEPS[stepIndex]!;

  return (
    <div className="admin-help-walkthrough">
      <div className="admin-help-walkthrough-header">
        <div>
          <p className="admin-help-walkthrough-label">Real site demo</p>
          <p className="admin-help-walkthrough-title">Push a handler alert to the staff TV</p>
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={step.image} alt={step.label} className="admin-help-walkthrough-photo" />
        <p className="admin-help-walkthrough-caption">{step.caption}</p>
      </div>

      <div className="admin-help-walkthrough-steps" role="tablist" aria-label="Push notice walkthrough steps">
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

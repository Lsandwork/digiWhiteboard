"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

const STEPS = [
  { id: "tab", label: "Open Push Notices" },
  { id: "compose", label: "Choose a notice" },
  { id: "push", label: "Push to staff TV" }
] as const;

const STEP_MS = 3800;

function PushTabIllustration() {
  return (
    <svg viewBox="0 0 640 360" className="h-auto w-full" role="img" aria-label="Open Push Notices tab">
      <rect width="640" height="360" rx="16" fill="#f8fafc" />
      <rect x="12" y="12" width="616" height="336" rx="12" fill="#241912" stroke="#f15f2a" strokeWidth="2" />
      <rect x="28" y="36" width="560" height="44" rx="8" fill="#1a120d" />
      <rect x="40" y="48" width="110" height="20" rx="6" fill="#f15f2a" />
      <text x="95" y="62" fill="#fff" fontFamily="system-ui, sans-serif" fontSize="11" fontWeight="700" textAnchor="middle">
        Push Notices
      </text>
      <rect x="160" y="48" width="90" height="20" rx="6" fill="#3a2a20" />
      <text x="205" y="62" fill="#b8a89a" fontFamily="system-ui, sans-serif" fontSize="11" textAnchor="middle">
        Overview
      </text>
      <rect x="28" y="96" width="560" height="220" rx="10" fill="#1a120d" />
      <text x="320" y="180" fill="#fff" fontFamily="system-ui, sans-serif" fontSize="22" fontWeight="700" textAnchor="middle">
        Push Notices
      </text>
      <text x="320" y="210" fill="#b8a89a" fontFamily="system-ui, sans-serif" fontSize="14" textAnchor="middle">
        Staff Digital Whiteboard Admin → Push Notices tab
      </text>
    </svg>
  );
}

function PushComposeIllustration() {
  return (
    <svg viewBox="0 0 640 360" className="h-auto w-full" role="img" aria-label="Choose or create a notice">
      <rect width="640" height="360" rx="16" fill="#f8fafc" />
      <rect x="12" y="12" width="616" height="336" rx="12" fill="#241912" stroke="#f15f2a" strokeWidth="2" />
      <rect x="40" y="48" width="260" height="250" rx="10" fill="#1a120d" stroke="#475569" />
      <text x="170" y="78" fill="#fff" fontFamily="system-ui, sans-serif" fontSize="14" fontWeight="700" textAnchor="middle">
        Quick Push
      </text>
      <rect x="60" y="96" width="220" height="44" rx="8" fill="#3a2a20" stroke="#64748b" />
      <rect x="60" y="152" width="220" height="44" rx="8" fill="#3a2a20" stroke="#64748b" />
      <rect x="60" y="208" width="220" height="44" rx="8" fill="#f15f2a" stroke="#fff" strokeWidth="2" />
      <text x="170" y="236" fill="#fff" fontFamily="system-ui, sans-serif" fontSize="12" fontWeight="700" textAnchor="middle">
        Owner Complaint - Phone
      </text>
      <rect x="330" y="48" width="270" height="250" rx="10" fill="#1a120d" stroke="#475569" />
      <text x="465" y="78" fill="#fff" fontFamily="system-ui, sans-serif" fontSize="14" fontWeight="700" textAnchor="middle">
        Create Custom Notice
      </text>
      <rect x="350" y="96" width="230" height="28" rx="6" fill="#120f0d" stroke="#64748b" />
      <rect x="350" y="136" width="230" height="72" rx="6" fill="#120f0d" stroke="#64748b" />
      <rect x="350" y="224" width="120" height="34" rx="8" fill="#3a2a20" />
    </svg>
  );
}

function PushSendIllustration() {
  return (
    <svg viewBox="0 0 640 360" className="h-auto w-full" role="img" aria-label="Push notice to staff whiteboard">
      <rect width="640" height="360" rx="16" fill="#f8fafc" />
      <rect x="12" y="12" width="616" height="336" rx="12" fill="#241912" stroke="#f15f2a" strokeWidth="2" />
      <rect x="40" y="48" width="320" height="250" rx="10" fill="#1a120d" />
      <rect x="390" y="48" width="210" height="250" rx="10" fill="#7f1d1d" stroke="#f87171" strokeWidth="2" />
      <text x="495" y="110" fill="#fff" fontFamily="system-ui, sans-serif" fontSize="16" fontWeight="700" textAnchor="middle">
        YARD HANDLER
      </text>
      <text x="495" y="136" fill="#fff" fontFamily="system-ui, sans-serif" fontSize="16" fontWeight="700" textAnchor="middle">
        ALERT
      </text>
      <rect x="60" y="220" width="160" height="44" rx="10" fill="#f15f2a" stroke="#fff" strokeWidth="2" />
      <text x="140" y="248" fill="#fff" fontFamily="system-ui, sans-serif" fontSize="14" fontWeight="700" textAnchor="middle">
        Push Notice
      </text>
      <path d="M220 242 H390" stroke="#fbbf24" strokeWidth="3" markerEnd="url(#arrow)" />
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#fbbf24" />
        </marker>
      </defs>
    </svg>
  );
}

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

  const step = STEPS[stepIndex];

  return (
    <div className="admin-help-walkthrough">
      <div className="admin-help-walkthrough-header">
        <div>
          <p className="admin-help-walkthrough-label">Screen demo</p>
          <p className="admin-help-walkthrough-title">How to push a handler alert to the staff TV</p>
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
        {step.id === "tab" ? <PushTabIllustration /> : null}
        {step.id === "compose" ? <PushComposeIllustration /> : null}
        {step.id === "push" ? <PushSendIllustration /> : null}
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

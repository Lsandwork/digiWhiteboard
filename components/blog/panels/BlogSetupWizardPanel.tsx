"use client";

import { useEffect, useState } from "react";

const STEPS = [
  "Select publishing destination",
  "Connect at least one AI provider",
  "Configure Fitdog Knowledge Base",
  "Configure Fitdog voice",
  "Configure editorial standards",
  "Configure topic pillars",
  "Configure image policy",
  "Connect Fitdog Media Library",
  "Configure approvals",
  "Configure cost limits",
  "Configure automation schedule",
  "Generate a test topic",
  "Generate a test article",
  "Run Human Editorial Review",
  "Select and approve a real image",
  "Test publishing connection",
  "Activate draft generation",
  "Activate scheduling only after approval"
];

export function BlogSetupWizardPanel() {
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/blog/settings");
      const json = await res.json();
      if (res.ok) {
        setSettings(json.settings);
        setStep(Number(json.settings.setup_step || 0));
      }
    })();
  }, []);

  async function persist(nextStep: number, completed = false) {
    const res = await fetch("/api/blog/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setup_step: nextStep, setup_completed: completed, enabled: completed ? true : settings?.enabled })
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error || "Failed");
      return;
    }
    setSettings(json.settings);
    setStep(nextStep);
    setMessage(completed ? "Setup marked complete. Auto-publish remains off until you explicitly enable it." : `Saved step ${nextStep + 1}.`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Setup Wizard</h2>
        <p className="text-sm text-slate-600">
          Complete these checks before activating draft generation. Do not enable automatic publication until required reviews pass.
        </p>
      </div>
      <ol className="space-y-2">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`rounded border px-3 py-2 text-sm ${
              index === step ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200 dark:border-slate-700"
            }`}
          >
            <span className="mr-2 font-semibold">{index + 1}.</span>
            {label}
            {index < step ? <span className="ml-2 text-xs text-emerald-700">done</span> : null}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border px-3 py-2 text-sm"
          disabled={step <= 0}
          onClick={() => void persist(Math.max(0, step - 1))}
        >
          Back
        </button>
        <button
          type="button"
          className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white"
          onClick={() => {
            if (step >= STEPS.length - 1) void persist(step, true);
            else void persist(step + 1);
          }}
        >
          {step >= STEPS.length - 1 ? "Finish setup" : "Mark step complete"}
        </button>
      </div>
      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
    </div>
  );
}

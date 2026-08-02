"use client";

import { useCallback, useEffect, useState } from "react";

type Settings = {
  setup_completed?: boolean;
  setup_step?: number;
  business_name?: string;
  consent_wording_version?: string;
  review_request_delay_minutes?: number;
  quiet_hours?: { start?: string; end?: string; timezone?: string };
  sending_channels?: { sms?: boolean; email?: boolean };
};

type Flags = {
  enabled?: boolean;
  webchat?: boolean;
  ai?: boolean;
  voice?: boolean;
  campaigns?: boolean;
  automations?: boolean;
  sendingSms?: boolean;
  sendingEmail?: boolean;
  gingrBooking?: boolean;
};

const SETUP_STEPS = [
  "Confirm business profile",
  "Confirm locations",
  "Connect Gingr",
  "Test Gingr API",
  "Register Gingr webhook",
  "Run initial contact sync",
  "Configure SMS",
  "Configure email",
  "Configure consent language",
  "Connect review providers",
  "Configure review destinations",
  "Install web chat",
  "Import knowledge articles",
  "Configure AI voice and tone",
  "Assign Ruffly permissions",
  "Review automation templates",
  "Send a test SMS",
  "Send a test email",
  "Submit a test web chat",
  "Launch Ruffly"
];

export function RufflySettingsPanel({ enabled = true }: { enabled?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [flags, setFlags] = useState<Flags>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ruffly/settings", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load Ruffly Settings.");
      setSettings(body.settings ?? {});
      setFlags(body.flags ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Ruffly Settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save(patch: Record<string, unknown>, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/ruffly/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save settings.");
      setSettings(body.settings ?? patch);
      setMessage(success);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save settings.");
    } finally {
      setBusy(false);
    }
  }

  const step = Number(settings.setup_step || 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-[#1f2933]">Ruffly Settings</h2>
        <p className="mt-1 text-sm text-slate-500">
          Setup wizard, quiet hours, consent wording, and channel readiness. Sending flags stay off until each provider
          is tested.
        </p>
      </div>

      {!enabled ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          `RUFFLY_ENABLED` is false in this environment. Super Admin can still open Ruffly locally; production requires
          the env flag.
        </div>
      ) : null}

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div> : null}
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</div>
      ) : null}

      {loading ? <div className="h-40 animate-pulse rounded-2xl bg-slate-100" /> : null}

      {!loading ? (
        <>
          <section className="rounded-2xl border border-orange-100 bg-[#fff8f3] p-4">
            <h3 className="font-semibold text-[#1f2933]">Setup wizard</h3>
            <p className="mt-1 text-sm text-slate-600">
              Step {Math.min(step + 1, SETUP_STEPS.length)} of {SETUP_STEPS.length}
              {settings.setup_completed ? " · Complete" : ""}
            </p>
            <p className="mt-2 rounded-xl border border-orange-200 bg-white/70 px-3 py-2 text-sm text-slate-700">
              Gingr allows only one webhook URL. Keep{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
                https://staff.ruffops.com/api/gingr/webhook
              </code>{" "}
              in Gingr — DigiBoard fans verified events into Ruffly automatically. Do not switch Gingr to the
              Ruffly-only webhook path.
            </p>
            <ol className="mt-3 max-h-56 space-y-1 overflow-auto text-sm">
              {SETUP_STEPS.map((label, index) => (
                <li key={label} className={index < step ? "text-emerald-700" : index === step ? "font-medium text-[#ff6f26]" : "text-slate-500"}>
                  {index + 1}. {label}
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || step >= SETUP_STEPS.length}
                className="rounded-xl bg-[#ff6f26] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() =>
                  void save(
                    {
                      setup_step: Math.min(step + 1, SETUP_STEPS.length),
                      setup_completed: step + 1 >= SETUP_STEPS.length
                    },
                    "Setup step advanced."
                  )
                }
              >
                Mark step complete
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium"
                onClick={() => void save({ setup_completed: true, setup_step: SETUP_STEPS.length }, "Ruffly marked launched.")}
              >
                Mark launch complete
              </button>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <label className="block rounded-2xl border border-slate-200 p-4 text-sm">
              Business name
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={settings.business_name || ""}
                onChange={(e) => setSettings((current) => ({ ...current, business_name: e.target.value }))}
              />
              <button
                type="button"
                disabled={busy}
                className="mt-3 rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
                onClick={() => void save({ business_name: settings.business_name }, "Business profile saved.")}
              >
                Save profile
              </button>
            </label>
            <label className="block rounded-2xl border border-slate-200 p-4 text-sm">
              Consent wording version
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={settings.consent_wording_version || "v1"}
                onChange={(e) => setSettings((current) => ({ ...current, consent_wording_version: e.target.value }))}
              />
              <button
                type="button"
                disabled={busy}
                className="mt-3 rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
                onClick={() =>
                  void save({ consent_wording_version: settings.consent_wording_version }, "Consent wording saved.")
                }
              >
                Save consent version
              </button>
            </label>
          </section>

          <section className="rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold">Environment flags (read-only)</h3>
            <p className="mt-1 text-sm text-slate-500">
              Sending and channel flags are controlled in Vercel env. Turn each sending flag on only after a successful
              provider test in Integrations.
            </p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {Object.entries(flags).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <dt className="font-medium text-slate-700">{key}</dt>
                  <dd className={value ? "text-emerald-700" : "text-slate-500"}>{value ? "on" : "off"}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Direct Gingr booking remains off until Ruffly can successfully create bookings inside Gingr.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { TlDigiBoardConfig } from "@/lib/tl-digi-board/config";

type AdminPayload = {
  config: TlDigiBoardConfig;
  permissions?: { canView?: boolean; canManage?: boolean };
  error?: string;
};

export function TlDigiBoardPanel() {
  const [config, setConfig] = useState<TlDigiBoardConfig | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tl-digi-board", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as AdminPayload;
      if (!res.ok) {
        throw new Error(json.error || "Unable to load TL Digi Board config.");
      }
      setConfig(json.config);
      setCanManage(Boolean(json.permissions?.canManage));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load TL Digi Board config.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!canManage || !config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tl-digi-board", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display: {
            showOtherSpecial: config.display.showOtherSpecial,
            preferBackOfHouseLodging: config.display.preferBackOfHouseLodging
          }
        })
      });
      const json = (await res.json().catch(() => ({}))) as { config?: TlDigiBoardConfig; error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Save failed.");
      }
      if (json.config) setConfig(json.config);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-admin-border bg-black/20 p-5">
      <header>
        <h2 className="text-xl font-semibold text-white">TL Digi Board</h2>
        <p className="mt-1 text-sm text-admin-muted">
          Configure the Team Lead Alerts + Reminders display. Public TV URL:{" "}
          <code className="text-sky-300">/boards/tl-alerts-reminders</code>
        </p>
      </header>

      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
      ) : null}

      {!config && !error ? <p className="text-sm text-admin-muted">Loading…</p> : null}

      {config ? (
        <div className="space-y-4 max-w-xl">
          <label className="flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              checked={config.display.showOtherSpecial}
              disabled={!canManage || saving}
              onChange={(e) =>
                setConfig({
                  ...config,
                  display: { ...config.display, showOtherSpecial: e.target.checked }
                })
              }
            />
            Show OTHER / SPECIAL medication rows
          </label>

          <label className="flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              checked={config.display.preferBackOfHouseLodging}
              disabled={!canManage || saving}
              onChange={(e) =>
                setConfig({
                  ...config,
                  display: { ...config.display, preferBackOfHouseLodging: e.target.checked }
                })
              }
            />
            Prefer back-of-house lodging labels
          </label>

          <div className="rounded-lg border border-admin-border bg-black/30 px-3 py-2 text-xs text-admin-muted">
            Overnight type mappings:{" "}
            {config.lodging.overnightReservationTypes.map((row) => `${row.labelContains}→${row.areaKey}`).join(", ")}
            {config.protected.lockOvernightTypeMappings ? " (locked)" : ""}
          </div>

          {canManage ? (
            <button
              type="button"
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save configuration"}
            </button>
          ) : (
            <p className="text-sm text-admin-muted">View only — full admin required to edit.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { TlDigiBoardConfig } from "@/lib/tl-digi-board/config";
import type { TlDigiBoardSnapshot } from "@/lib/tl-digi-board/types";
import { TlAlertsRemindersBoard } from "@/components/boards/TlAlertsRemindersBoard";

type AdminPayload = {
  config: TlDigiBoardConfig & {
    displayTitle?: string;
    enabled?: boolean;
    display?: TlDigiBoardConfig["display"];
    lodging?: TlDigiBoardConfig["lodging"];
    protected?: TlDigiBoardConfig["protected"];
  };
  snapshot?: TlDigiBoardSnapshot | null;
  permissions?: { canView?: boolean; canManage?: boolean };
  gingr?: { keyEnv?: string; keyConfigured?: boolean };
  error?: string;
};

type SectionId =
  | "overview"
  | "lodging"
  | "windows"
  | "display"
  | "health"
  | "preview";

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "overview", label: "Board Overview" },
  { id: "lodging", label: "Lodging Areas" },
  { id: "windows", label: "Medication Windows" },
  { id: "display", label: "Display Settings" },
  { id: "health", label: "Board Health" },
  { id: "preview", label: "Live Preview" }
];

export function TlDigiBoardPanel() {
  const [section, setSection] = useState<SectionId>("overview");
  const [config, setConfig] = useState<AdminPayload["config"] | null>(null);
  const [snapshot, setSnapshot] = useState<TlDigiBoardSnapshot | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [tlGingrKeyConfigured, setTlGingrKeyConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tl-digi-board", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as AdminPayload;
      if (!res.ok) throw new Error(json.error || "Unable to load TL Digi Board.");
      setConfig(json.config);
      setSnapshot(json.snapshot ?? null);
      setCanManage(Boolean(json.permissions?.canManage));
      setTlGingrKeyConfigured(Boolean(json.gingr?.keyConfigured));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load TL Digi Board.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveDisplay() {
    if (!canManage || !config?.display) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/admin/tl-digi-board", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayTitle: config.display.displayTitle,
          enabled: config.display.enabled,
          display: {
            showOtherSpecial: config.display.showOtherSpecial,
            preferBackOfHouseLodging: config.display.preferBackOfHouseLodging
          }
        })
      });
      const json = (await res.json().catch(() => ({}))) as { config?: AdminPayload["config"]; error?: string };
      if (!res.ok) throw new Error(json.error || "Changes not saved.");
      if (json.config) setConfig(json.config);
      setSaveMessage("✓ Saved");
      setError(null);
    } catch (err) {
      setSaveMessage(null);
      setError(err instanceof Error ? err.message : "⚠ Changes not saved");
    } finally {
      setSaving(false);
    }
  }

  const display = config?.display;
  const lodging = config?.lodging;
  const meta = snapshot?.meta;
  const summary = snapshot?.summary;

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-admin-border bg-black/20 p-5">
        <h2 className="text-2xl font-semibold text-white">TL Digi Board</h2>
        <p className="mt-1 text-sm text-admin-muted">Configure the Team Lead Alerts + Reminders display</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <HealthChip label="TV Board" value="/boards/tl-alerts-reminders" />
          <HealthChip
            label="Gingr"
            value={meta?.gingrSyncHealth?.toUpperCase() ?? "UNKNOWN"}
            tone={meta?.gingrSyncHealth === "live" ? "good" : meta?.gingrSyncHealth === "delayed" ? "warn" : "bad"}
          />
          <HealthChip
            label="TL_GINGR_KEY"
            value={tlGingrKeyConfigured ? "Configured" : "Missing"}
            tone={tlGingrKeyConfigured ? "good" : "bad"}
          />
          <HealthChip label="Current Period" value={meta?.currentPeriod?.toUpperCase() ?? "—"} />
          <HealthChip
            label="Last Gingr Sync"
            value={meta?.lastSuccessfulSyncAt ? new Date(meta.lastSuccessfulSyncAt).toLocaleTimeString() : "—"}
          />
          <HealthChip label="Timezone" value="America/Los_Angeles" />
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
      ) : null}
      {saveMessage ? (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {saveMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rounded-full px-3 py-1.5 text-sm ${
              section === item.id ? "bg-sky-500 text-white" : "bg-white/5 text-admin-muted hover:bg-white/10"
            }`}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!config && !error ? <p className="text-sm text-admin-muted">Loading…</p> : null}

      {config && section === "overview" ? (
        <Card title="Board Overview">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Row label="Board Name" value={display?.displayTitle ?? "TL Alerts + Reminders"} />
            <Row label="Admin Tool" value="TL Digi Board" />
            <Row label="Enabled" value={display?.enabled ? "Yes" : "No"} />
            <Row label="Medications" value={String(summary?.due ?? "—")} />
            <Row label="Completed" value={String(summary?.completed ?? "—")} />
            <Row label="Remaining" value={String(summary?.remaining ?? "—")} />
            <Row label="Overdue" value={String(summary?.overdue ?? "—")} />
            <Row
              label="Additional services pending"
              value={String(snapshot?.servicesSummary?.remaining ?? "—")}
            />
            <Row
              label="Additional services completed (hidden)"
              value={String(snapshot?.servicesSummary?.completed ?? "—")}
            />
            <Row
              label="Administration status from Gingr API"
              value={
                meta?.administrationStatusAvailable
                  ? "Live from Medication Report history"
                  : "Not available (schedules only)"
              }
            />
          </dl>
        </Card>
      ) : null}

      {config && section === "lodging" ? (
        <Card title="Included Overnight Lodging">
          <p className="mb-3 text-sm text-admin-muted">
            Mapped from live Fitdog Gingr reservation types. Only Super Admin / Admin can change mappings.
          </p>
          <div className="space-y-2">
            {(lodging?.overnightReservationTypes ?? []).map((row) => (
              <div key={`${row.id}-${row.areaKey}`} className="rounded-xl border border-white/10 px-3 py-2">
                <div className="font-medium text-white">{row.labelContains}</div>
                <div className="text-sm text-admin-muted">
                  Gingr ID: {row.id} · Area: {row.areaKey.replace("_", " ")} · ACTIVE
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {config && section === "windows" ? (
        <Card title="Medication Windows (America/Los_Angeles)">
          <ul className="space-y-2 text-sm text-white">
            <li>AM · 4:00 AM → 10:00 AM</li>
            <li>MID-DAY · 10:00 AM → 4:00 PM</li>
            <li>PM · 4:00 PM → 11:59 PM</li>
          </ul>
          <p className="mt-3 text-sm text-admin-muted">
            Protected operational settings: Gingr source, Los Angeles timezone, overdue carry-forward, and stale-data
            warnings remain enabled.
          </p>
        </Card>
      ) : null}

      {config && section === "display" && display ? (
        <Card title="Display Settings">
          <label className="mb-3 block text-sm text-admin-muted">
            Board title
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
              value={display.displayTitle}
              disabled={!canManage || saving}
              onChange={(event) =>
                setConfig({
                  ...config,
                  display: { ...display, displayTitle: event.target.value }
                })
              }
            />
          </label>
          <label className="mb-2 flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              checked={display.enabled}
              disabled={!canManage || saving}
              onChange={(event) =>
                setConfig({
                  ...config,
                  display: { ...display, enabled: event.target.checked }
                })
              }
            />
            Board enabled
          </label>
          <label className="mb-2 flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              checked={display.showOtherSpecial}
              disabled={!canManage || saving}
              onChange={(event) =>
                setConfig({
                  ...config,
                  display: { ...display, showOtherSpecial: event.target.checked }
                })
              }
            />
            Show Other / Special schedules
          </label>
          <label className="mb-4 flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              checked={display.preferBackOfHouseLodging}
              disabled={!canManage || saving}
              onChange={(event) =>
                setConfig({
                  ...config,
                  display: { ...display, preferBackOfHouseLodging: event.target.checked }
                })
              }
            />
            Prefer back-of-house lodging labels
          </label>
          <button
            type="button"
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!canManage || saving}
            onClick={() => void saveDisplay()}
          >
            {saving ? "Saving…" : "Save display settings"}
          </button>
        </Card>
      ) : null}

      {config && section === "health" ? (
        <Card title="System Health">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Row label="Gingr connection" value={meta?.gingrSyncHealth ?? "unknown"} />
            <Row label="TL Digi Board key env" value="TL_GINGR_KEY" />
            <Row label="TL_GINGR_KEY configured" value={tlGingrKeyConfigured ? "Yes" : "No — add in Vercel"} />
            <Row label="Medication sync" value={meta?.isStale ? "stale" : meta?.gingrSyncHealth ?? "unknown"} />
            <Row label="Last Gingr sync" value={meta?.lastSuccessfulSyncAt ?? "—"} />
            <Row label="Last attempt" value={meta?.lastAttemptAt ?? "—"} />
            <Row label="Last error" value={meta?.lastError ?? "none"} />
            <Row
              label="Administration API"
              value={
                meta?.administrationStatusAvailable
                  ? "Live — get_medication_report_history"
                  : "Pending / unavailable — check TL_GINGR_KEY + reservation IDs"
              }
            />
            <Row label="Overdue medications" value={String(summary?.overdue ?? 0)} />
            <Row label="Protected flags" value="Timezone LA · Overdue carry-forward · Stale warnings" />
          </dl>
        </Card>
      ) : null}

      {config && section === "preview" ? (
        <Card title="Live Board Preview">
          <div className="mb-3 flex flex-wrap gap-2">
            <a
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white"
              href="/boards/tl-alerts-reminders"
              target="_blank"
              rel="noreferrer"
            >
              Open Full Board
            </a>
            <button
              type="button"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white"
              onClick={() => setShowPreview((value) => !value)}
            >
              {showPreview ? "Hide embedded preview" : "Show embedded preview"}
            </button>
          </div>
          {showPreview ? (
            <div className="overflow-hidden rounded-xl border border-white/10" style={{ minHeight: 640 }}>
              <TlAlertsRemindersBoard />
            </div>
          ) : (
            <p className="text-sm text-admin-muted">
              Preview uses the same board component and public API as the Team Lead television.
            </p>
          )}
        </Card>
      ) : null}
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-admin-border bg-black/20 p-5">
      <h3 className="mb-3 text-lg font-semibold text-white">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-admin-muted">{label}</dt>
      <dd className="mt-1 text-sm text-white">{value}</dd>
    </div>
  );
}

function HealthChip({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const color =
    tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-red-300" : "text-white";
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-admin-muted">{label}</div>
      <div className={`mt-1 text-sm font-medium ${color}`}>{value}</div>
    </div>
  );
}

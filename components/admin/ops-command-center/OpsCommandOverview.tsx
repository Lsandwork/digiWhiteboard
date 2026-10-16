"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, MapPinned, RefreshCw, ShieldAlert } from "lucide-react";
import { OpsLiveCommandCenter } from "@/components/admin/ops-command-center/OpsLiveCommandCenter";
import { readResponseJson } from "@/lib/http/read-response-json";
import { readPanelCache, writePanelCache } from "@/lib/admin/panel-session-cache";
import {
  COMMAND_CENTER_EXTERNAL_LINKS,
  COMMAND_CENTER_MODULE_LINKS
} from "@/lib/ops-command-center/command-links";
import {
  emptyOpsCommandCenterSnapshot,
  type OpsCommandCenterSnapshot
} from "@/lib/ops-command-center/snapshot";

type ViewMode = "overview" | "live_floor";

const CACHE_KEY = "ops-command-overview";
const CACHE_MS = 90_000;

/**
 * Read-only Command Center homepage.
 * - One-shot DB-backed snapshot (existing My Shift API) — no polling.
 * - Links to existing modules instead of rebuilding them.
 * - Live Floor (Gingr-backed) loads only when the operator opens it.
 */
export function OpsCommandOverview({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [mode, setMode] = useState<ViewMode>("overview");
  const [data, setData] = useState<OpsCommandCenterSnapshot>(() => {
    const cached = readPanelCache<OpsCommandCenterSnapshot>(CACHE_KEY, CACHE_MS);
    if (cached?.shiftSummary) return cached;
    return emptyOpsCommandCenterSnapshot({
      roleKey: "viewer",
      roleLabel: "Staff"
    });
  });
  const [loading, setLoading] = useState(() => !readPanelCache<OpsCommandCenterSnapshot>(CACHE_KEY, CACHE_MS)?.shiftSummary);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8_000);
    try {
      // Default OCC GET = My Shift snapshot (DB + caches). Does not call live_floor / Gingr.
      const res = await fetch("/api/admin/ops-command-center", {
        cache: "no-store",
        signal: controller.signal
      });
      const body = await readResponseJson<OpsCommandCenterSnapshot & { error?: string }>(res);
      if (!res.ok && !body.shiftSummary) {
        throw new Error(body.error || "Unable to load Command Center overview.");
      }
      if (body.shiftSummary || body.greetingName) {
        writePanelCache(CACHE_KEY, body);
        setData(body);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Command Center overview.");
    } finally {
      window.clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(boot);
  }, [load]);

  if (mode === "live_floor") {
    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-admin-border bg-admin-card px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-admin-muted">Ops Command Center</p>
            <h2 className="admin-text-emphasis text-lg font-semibold">Live Floor</h2>
            <p className="text-xs text-admin-muted">
              On-site census and action queue from Gingr (uses the existing live-floor path). Overview stays
              DB-only.
            </p>
          </div>
          <button type="button" className="admin-btn-secondary" onClick={() => setMode("overview")}>
            Back to overview
          </button>
        </div>
        <OpsLiveCommandCenter onNavigate={onNavigate} />
      </section>
    );
  }

  const summary = data.shiftSummary;
  const attention = data.needsAttention.slice(0, 8);

  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-3 rounded-2xl border border-admin-border bg-admin-card p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-admin-muted">Ops Command Center</p>
          <h2 className="admin-text-emphasis mt-1 text-2xl font-semibold sm:text-3xl">Operations overview</h2>
          <p className="mt-1 text-sm text-admin-muted">
            Read-only snapshot from existing RuffOps data. Gingr remains the business system of record.
            {data.roleLabel ? ` · ${data.roleLabel}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs ${
              data.pending || loading || data.gingrHealth.status === "healthy"
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                : data.gingrHealth.status === "offline"
                  ? "border-red-400/40 bg-red-500/10 text-red-100"
                  : "border-amber-400/40 bg-amber-500/10 text-amber-100"
            }`}
            title={data.gingrHealth.detail || undefined}
          >
            {data.pending || loading || data.gingrHealth.status === "unknown"
              ? "Gingr ● Checking…"
              : data.gingrHealth.label}
          </span>
          <button type="button" className="admin-btn-secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button type="button" className="admin-btn-primary" onClick={() => setMode("live_floor")}>
            <MapPinned className="h-4 w-4" />
            Open Live Floor
          </button>
        </div>
      </header>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {data.stale && !loading ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-50">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Showing the last good snapshot while live data catches up. Empty queues do not mean All Clear.</p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Arriving / checking in" value={summary.dogsArriving} />
        <Kpi label="Leaving / checking out" value={summary.dogsCheckingOut} />
        <Kpi label="Open work" value={summary.openWork} />
        <Kpi label="Critical alerts" value={summary.criticalAlerts} />
        <Kpi label="Owner follow-ups" value={summary.ownerFollowUps} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-admin-border bg-admin-card p-4">
          <h3 className="admin-text-emphasis text-sm font-semibold">Needs attention</h3>
          <p className="mt-1 text-xs text-admin-muted">From existing Team Log, issues, alerts, and tasks — not invented.</p>
          <ul className="mt-3 space-y-2">
            {attention.length ? (
              attention.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-2 rounded-xl border border-admin-border px-3 py-2 text-left hover:border-sky-400/40"
                    onClick={() => item.hrefTab && onNavigate(item.hrefTab)}
                  >
                    <span>
                      <span className="admin-text-emphasis block text-sm font-medium">{item.title}</span>
                      {item.detail ? <span className="mt-0.5 block text-xs text-admin-muted">{item.detail}</span> : null}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-admin-muted">{item.priority}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className="text-sm text-admin-muted">
                {loading ? "Loading…" : "No attention items in the current snapshot."}
              </li>
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-admin-border bg-admin-card p-4">
          <h3 className="admin-text-emphasis text-sm font-semibold">Board lanes (DB)</h3>
          <p className="mt-1 text-xs text-admin-muted">
            From `live_transition_dogs` — the same admin lanes Front Desk uses. Not a full Gingr on-site census.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <LaneList title="Arriving" dogs={data.boardLanes.arriving} />
            <LaneList title="Leaving" dogs={data.boardLanes.leaving} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="admin-btn-secondary" onClick={() => onNavigate("front_desk_command")}>
              Front Desk Command
            </button>
            <button type="button" className="admin-btn-secondary" onClick={() => onNavigate("yard_command")}>
              Yard Command
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-admin-border bg-admin-card p-4">
        <h3 className="admin-text-emphasis text-sm font-semibold">Command launchpad</h3>
        <p className="mt-1 text-xs text-admin-muted">
          Open existing RuffOps tools. Access is still enforced by each destination tab.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {COMMAND_CENTER_MODULE_LINKS.map((link) => (
            <button
              key={link.tab}
              type="button"
              className="rounded-xl border border-admin-border px-3 py-3 text-left transition hover:border-sky-400/40"
              onClick={() => onNavigate(link.tab)}
            >
              <span className="admin-text-emphasis flex items-center gap-1.5 text-sm font-medium">
                {link.label}
                <ArrowUpRight className="h-3.5 w-3.5 text-admin-muted" />
              </span>
              <span className="mt-0.5 block text-xs text-admin-muted">{link.description}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {COMMAND_CENTER_EXTERNAL_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-xl border border-admin-border px-3 py-3 transition hover:border-sky-400/40"
            >
              <span className="admin-text-emphasis flex items-center gap-1.5 text-sm font-medium">
                {link.label}
                <ArrowUpRight className="h-3.5 w-3.5 text-admin-muted" />
              </span>
              <span className="mt-0.5 block text-xs text-admin-muted">{link.description}</span>
            </a>
          ))}
        </div>
      </section>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-admin-border bg-admin-card px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-admin-muted">{label}</p>
      <p className="admin-text-emphasis mt-1 text-2xl font-semibold">{Number.isFinite(value) ? value : "—"}</p>
    </div>
  );
}

function LaneList({
  title,
  dogs
}: {
  title: string;
  dogs: Array<{ id: string; name: string; ownerName?: string | null; room?: string | null }>;
}) {
  return (
    <div className="rounded-xl border border-admin-border px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">
        {title} · {dogs.length}
      </p>
      <ul className="mt-2 space-y-1">
        {dogs.length ? (
          dogs.slice(0, 6).map((dog) => (
            <li key={dog.id} className="text-sm">
              <span className="admin-text-emphasis font-medium">{dog.name}</span>
              {dog.room ? <span className="text-admin-muted"> · {dog.room}</span> : null}
            </li>
          ))
        ) : (
          <li className="text-sm text-admin-muted">None in snapshot.</li>
        )}
      </ul>
    </div>
  );
}

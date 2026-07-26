"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PhoneMissed, RefreshCw, Voicemail, X } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { formatPhoneDisplay } from "@/lib/missed-calls/parse-vonage-email";
import type { MissedCall, MissedCallStatus, MissedCallSummary, MissedCallSyncRun } from "@/lib/missed-calls/types";

type ListPayload = {
  rows: MissedCall[];
  total: number;
  summary: MissedCallSummary;
  gmailConfigured: boolean;
  gmailUser: string;
};

function formatWhen(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function callTypeLabel(type: string) {
  if (type === "voicemail") return "Voicemail";
  if (type === "missed_call") return "Missed call";
  return "Call";
}

export function MissedCallsPanel() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | MissedCallStatus>("all");
  const [payload, setPayload] = useState<ListPayload | null>(null);
  const [history, setHistory] = useState<MissedCallSyncRun[]>([]);
  const [selected, setSelected] = useState<MissedCall | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status: statusFilter });
      const [listRes, syncRes] = await Promise.all([
        fetch(`/api/admin/missed-calls?${qs.toString()}`, { credentials: "include" }),
        fetch("/api/admin/missed-calls?view=sync", { credentials: "include" })
      ]);
      const listJson = await listRes.json();
      const syncJson = await syncRes.json();
      if (!listRes.ok) throw new Error(listJson.error || "Failed to load missed calls.");
      setPayload(listJson);
      setHistory(syncJson.history || []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to load missed calls.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = payload?.summary;

  const openRow = async (row: MissedCall) => {
    setDetailLoading(true);
    setSelected(row);
    try {
      const res = await fetch(`/api/admin/missed-calls?view=detail&id=${encodeURIComponent(row.id)}`, {
        credentials: "include"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to open call.");
      setSelected(json.row as MissedCall);
      if (json.row.status === "new") {
        const mark = await fetch("/api/admin/missed-calls", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "set_status", id: row.id, status: "listened" })
        });
        if (mark.ok) {
          const marked = await mark.json();
          setSelected(marked.row as MissedCall);
          void load();
        }
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to open call.", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/missed-calls", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || "Sync failed.");
      showToast(json.message || "Synced missed calls from Gmail.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Sync failed.", "error");
    } finally {
      setSyncing(false);
    }
  };

  const audioSrc = useMemo(() => {
    if (!selected?.voicemail_storage_path) return null;
    return `/api/admin/missed-calls?view=audio&id=${encodeURIComponent(selected.id)}`;
  }, [selected]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[var(--admin-text)]">Missed Calls</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--admin-muted)]">
            Live Vonage missed calls and voicemails pulled from {payload?.gmailUser || "lonnie@fitdog.com"} Gmail.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="admin-btn-secondary inline-flex items-center gap-2" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button type="button" className="admin-btn-primary inline-flex items-center gap-2" onClick={() => void runSync()} disabled={syncing}>
            <PhoneMissed className="h-4 w-4" />
            {syncing ? "Syncing…" : "Sync Gmail"}
          </button>
        </div>
      </div>

      {!payload?.gmailConfigured ? (
        <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Gmail IMAP is not connected yet. An app password for lonnie@fitdog.com must be set as{" "}
          <code className="text-xs">GMAIL_IMAP_APP_PASSWORD</code> on the server.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "New", value: summary?.new_count ?? 0 },
          { label: "Voicemails", value: summary?.voicemail_count ?? 0 },
          { label: "Listened", value: summary?.listened_count ?? 0 },
          { label: "Total logged", value: summary?.total_count ?? 0 }
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-panel)] px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-[var(--admin-muted)]">{card.label}</div>
            <div className="mt-1 text-2xl font-semibold text-[var(--admin-text)]">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "new", "listened", "archived"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={statusFilter === key ? "admin-btn-primary" : "admin-btn-secondary"}
            onClick={() => setStatusFilter(key)}
          >
            {key === "all" ? "All" : key[0]!.toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--admin-border)] bg-[var(--admin-panel)]">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--admin-panel-2)] text-left text-[var(--admin-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Caller</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Subject</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Audio</th>
            </tr>
          </thead>
          <tbody>
            {loading && !payload ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[var(--admin-muted)]">
                  Loading missed calls…
                </td>
              </tr>
            ) : null}
            {(payload?.rows || []).map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-[var(--admin-border)] hover:bg-[var(--admin-panel-2)]"
                onClick={() => void openRow(row)}
              >
                <td className="px-3 py-2 whitespace-nowrap text-[var(--admin-text)]">{formatWhen(row.received_at)}</td>
                <td className="px-3 py-2 text-[var(--admin-text)]">
                  <div className="font-medium">{formatPhoneDisplay(row.from_number)}</div>
                  {row.from_name ? <div className="text-xs text-[var(--admin-muted)]">{row.from_name}</div> : null}
                </td>
                <td className="px-3 py-2 text-[var(--admin-text)]">{callTypeLabel(row.call_type)}</td>
                <td className="px-3 py-2 text-[var(--admin-text)] max-w-[22rem] truncate">{row.subject}</td>
                <td className="px-3 py-2 capitalize text-[var(--admin-text)]">{row.status}</td>
                <td className="px-3 py-2 text-[var(--admin-text)]">
                  {row.voicemail_storage_path || row.voicemail_url ? (
                    <span className="inline-flex items-center gap-1 text-emerald-300">
                      <Voicemail className="h-3.5 w-3.5" /> Yes
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {payload && !payload.rows.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[var(--admin-muted)]">
                  No missed calls logged yet. Click Sync Gmail to pull Vonage emails.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {history.length ? (
        <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-panel)] px-4 py-3">
          <div className="text-sm font-medium text-[var(--admin-text)]">Recent syncs</div>
          <ul className="mt-2 space-y-1 text-xs text-[var(--admin-muted)]">
            {history.slice(0, 5).map((run) => (
              <li key={run.id}>
                {formatWhen(run.started_at)} · {run.trigger} · {run.status}
                {run.message ? ` — ${run.message}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => setSelected(null)}>
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-[var(--admin-border)] bg-[var(--admin-panel)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--admin-border)] px-4 py-3">
              <div>
                <div className="text-lg font-semibold text-[var(--admin-text)]">
                  {callTypeLabel(selected.call_type)} · {formatPhoneDisplay(selected.from_number)}
                </div>
                <div className="text-sm text-[var(--admin-muted)]">{formatWhen(selected.received_at)}</div>
              </div>
              <button type="button" className="admin-btn-secondary p-2" onClick={() => setSelected(null)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-4 py-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-[var(--admin-muted)]">Subject</div>
                <div className="text-sm text-[var(--admin-text)]">{selected.subject}</div>
              </div>
              {detailLoading ? <div className="text-sm text-[var(--admin-muted)]">Loading details…</div> : null}
              {audioSrc ? (
                <div>
                  <div className="mb-2 text-xs uppercase tracking-wide text-[var(--admin-muted)]">Voicemail</div>
                  <audio controls preload="metadata" className="w-full" src={audioSrc}>
                    Your browser does not support audio playback.
                  </audio>
                  {selected.voicemail_filename ? (
                    <div className="mt-1 text-xs text-[var(--admin-muted)]">{selected.voicemail_filename}</div>
                  ) : null}
                </div>
              ) : selected.voicemail_url ? (
                <div>
                  <div className="mb-2 text-xs uppercase tracking-wide text-[var(--admin-muted)]">Voicemail link</div>
                  <a className="text-sm text-sky-300 underline" href={selected.voicemail_url} target="_blank" rel="noreferrer">
                    Open voicemail
                  </a>
                </div>
              ) : (
                <div className="rounded-md border border-[var(--admin-border)] px-3 py-2 text-sm text-[var(--admin-muted)]">
                  No voicemail audio was attached to this email.
                </div>
              )}
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-[var(--admin-muted)]">Email body</div>
                <pre className="whitespace-pre-wrap rounded-md border border-[var(--admin-border)] bg-[var(--admin-panel-2)] p-3 text-xs text-[var(--admin-text)]">
                  {selected.body_text || selected.snippet || "—"}
                </pre>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="admin-btn-secondary"
                  onClick={() =>
                    void fetch("/api/admin/missed-calls", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "set_status", id: selected.id, status: "archived" })
                    }).then(() => {
                      showToast("Archived.", "success");
                      setSelected(null);
                      void load();
                    })
                  }
                >
                  Archive
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

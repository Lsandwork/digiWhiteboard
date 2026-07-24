"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Shield } from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { SortableTh } from "@/components/admin/ui/sortable-table";
import type { TrackIncident, TrackIncidentSummary, TrackIncidentSyncRun } from "@/lib/staff/track-incidents/types";

type ListPayload = {
  rows: TrackIncident[];
  total: number;
  page: number;
  pageSize: number;
  summary: TrackIncidentSummary;
  incidentTypes: string[];
  latestSync: TrackIncidentSyncRun | null;
  canManage?: boolean;
};

function formatWhen(value: string | null) {
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

function statusTone(status: string) {
  switch (status) {
    case "resolved":
      return "bg-emerald-500/15 text-emerald-100 border-emerald-400/30";
    case "in_progress":
      return "bg-orange-500/15 text-orange-100 border-orange-400/30";
    case "follow_up_needed":
      return "bg-violet-500/15 text-violet-100 border-violet-400/30";
    default:
      return "bg-sky-500/15 text-sky-100 border-sky-400/30";
  }
}

function priorityDot(priority: string) {
  if (priority === "high") return "bg-rose-400";
  if (priority === "low") return "bg-emerald-400";
  return "bg-amber-400";
}

export function TrackIncidentsPanel() {
  const { showToast } = useToast();
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<TrackIncidentSyncRun[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [drawer, setDrawer] = useState<TrackIncident | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [incidentType, setIncidentType] = useState("all");
  const [sortBy, setSortBy] = useState("occurred_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [manualForm, setManualForm] = useState({
    dog_name: "",
    owner_name: "",
    dog_breed: "",
    incident_type: "Dog Scuffle",
    notes: "",
    priority: "medium"
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q,
        status,
        source,
        incidentType,
        sortBy,
        sortDir,
        page: "1",
        pageSize: "50"
      });
      const res = await fetch(`/api/admin/track-incidents?${params}`, { cache: "no-store" });
      const json = (await res.json()) as ListPayload & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load incidents.");
      setData(json);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to load incidents.", "error");
    } finally {
      setLoading(false);
    }
  }, [q, status, source, incidentType, sortBy, sortDir, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleSort(column: string) {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir(column.includes("date") || column === "occurred_at" ? "desc" : "asc");
    }
  }

  async function runSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/track-incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" })
      });
      const json = (await res.json()) as { run?: TrackIncidentSyncRun; error?: string };
      if (!res.ok) throw new Error(json.error || "Sync failed.");
      const run = json.run;
      if (run?.status === "skipped") {
        showToast(run.message || "Sync cooling down.", "info");
      } else {
        showToast(
          `Sync complete: ${run?.imported_count ?? 0} new, ${run?.updated_count ?? 0} updated.`,
          "success"
        );
      }
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Sync failed.", "error");
    } finally {
      setSyncing(false);
    }
  }

  async function openHistory() {
    setShowHistory(true);
    try {
      const res = await fetch("/api/admin/track-incidents?view=sync", { cache: "no-store" });
      const json = (await res.json()) as { history?: TrackIncidentSyncRun[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Unable to load sync history.");
      setHistory(json.history ?? []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load sync history.", "error");
    }
  }

  async function createManual() {
    try {
      const res = await fetch("/api/admin/track-incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...manualForm })
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Create failed.");
      showToast("Incident created.", "success");
      setManualOpen(false);
      setManualForm({
        dog_name: "",
        owner_name: "",
        dog_breed: "",
        incident_type: "Dog Scuffle",
        notes: "",
        priority: "medium"
      });
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Create failed.", "error");
    }
  }

  async function patchIncident(id: string, patch: Record<string, unknown>) {
    try {
      const res = await fetch("/api/admin/track-incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, ...patch })
      });
      const json = (await res.json()) as { record?: TrackIncident; error?: string };
      if (!res.ok) throw new Error(json.error || "Update failed.");
      if (json.record) setDrawer(json.record);
      await load();
      showToast("Incident updated.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Update failed.", "error");
    }
  }

  const summary = data?.summary;
  const latest = data?.latestSync;
  const inProgressPct =
    summary && summary.total > 0 ? ((summary.inProgress / summary.total) * 100).toFixed(1) : "0.0";
  const resolvedPct =
    summary && summary.total > 0 ? ((summary.resolved / summary.total) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black admin-text-emphasis">
            <Shield className="h-6 w-6 text-fitdog-orange" />
            Track Incidents
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-admin-muted">
            Incident reports sync from Gingr webhooks. Staff can also enter incidents manually. New
            Gingr incidents upsert live; a catch-up runs every morning at 5:00 AM Pacific.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="crossover-btn crossover-btn--ghost"
            disabled={syncing || !data?.canManage}
            onClick={() => void runSync()}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sync from Gingr
          </button>
          <button
            type="button"
            className="crossover-btn crossover-btn--primary"
            disabled={!data?.canManage}
            onClick={() => setManualOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add Incident Manually
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Total Incidents", value: summary?.total ?? "—", hint: "All time" },
          { label: "In Progress", value: summary?.inProgress ?? "—", hint: `${inProgressPct}% of total` },
          { label: "Resolved", value: summary?.resolved ?? "—", hint: `${resolvedPct}% of total` },
          { label: "New Today", value: summary?.newToday ?? "—", hint: "Since 12:00 AM" },
          { label: "Alert Status", value: "Active", hint: "Webhook + daily catch-up" }
        ].map((card) => (
          <div key={card.label} className="crossover-card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-admin-muted">{card.label}</p>
            <p className="mt-2 text-3xl font-black admin-text-emphasis">{card.value}</p>
            <p className="mt-1 text-xs text-admin-muted">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="crossover-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-bold admin-text-emphasis">
            Gingr Sync · {latest?.status === "completed" || latest?.status === "running" ? "Active" : "Ready"}
          </p>
          <p className="text-xs text-admin-muted">
            Last sync: {latest ? formatWhen(latest.finished_at ?? latest.started_at) : "Never"} · Daily
            catch-up at 5:00 AM Pacific · Live Sync reads the webhook inbox (no Gingr scrape)
          </p>
        </div>
        <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => void openHistory()}>
          View Sync History
        </button>
      </div>

      <div className="crossover-card p-4">
        <div className="mb-4 grid gap-2 md:grid-cols-4">
          <input
            className="admin-input md:col-span-1"
            placeholder="Search incidents..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="admin-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="new">New</option>
            <option value="in_progress">In Progress</option>
            <option value="follow_up_needed">Follow-Up Needed</option>
            <option value="resolved">Resolved</option>
          </select>
          <select className="admin-input" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="all">All sources</option>
            <option value="gingr">Gingr</option>
            <option value="manual">Manual</option>
          </select>
          <select
            className="admin-input"
            value={incidentType}
            onChange={(e) => setIncidentType(e.target.value)}
          >
            <option value="all">All incident types</option>
            {(data?.incidentTypes ?? []).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="admin-table w-full text-sm">
            <thead>
              <tr className="text-left text-admin-muted">
                <SortableTh label="Incident ID" column="incident_number" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <SortableTh label="Date / Time" column="occurred_at" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <SortableTh label="Source" column="source" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <SortableTh label="Dog(s)" column="dog_name" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <SortableTh label="Type" column="incident_type" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <SortableTh label="Reported By" column="reported_by" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <SortableTh label="Status" column="status" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <SortableTh label="Priority" column="priority" sortKey={sortBy} sortDir={sortDir} onToggle={toggleSort} />
                <th className="px-3 py-3">Latest Update</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-admin-muted">
                    Loading incidents…
                  </td>
                </tr>
              ) : (data?.rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-admin-muted">
                    No incidents yet. Click Sync from Gingr or add one manually.
                  </td>
                </tr>
              ) : (
                (data?.rows ?? []).map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-t border-[var(--border)] hover:bg-white/5"
                    onClick={() => setDrawer(row)}
                  >
                    <td className="px-3 py-3 font-semibold admin-text-emphasis">{row.incident_number}</td>
                    <td className="px-3 py-3">{formatWhen(row.occurred_at)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          row.source === "gingr"
                            ? "border-rose-400/40 bg-rose-500/15 text-rose-100"
                            : "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                        }`}
                      >
                        {row.source}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold admin-text-emphasis">{row.dog_name}</div>
                      <div className="text-xs text-admin-muted">{row.owner_name || "—"}</div>
                    </td>
                    <td className="px-3 py-3">{row.incident_type}</td>
                    <td className="px-3 py-3">{row.reported_by}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusTone(row.status)}`}
                      >
                        {row.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-2 capitalize">
                        <span className={`h-2.5 w-2.5 rounded-full ${priorityDot(row.priority)}`} />
                        {row.priority}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-admin-muted">{row.latest_update || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-black/20 px-4 py-3 text-sm text-admin-muted">
        Every new Gingr incident upserts into this ledger when the webhook arrives. Manual Sync and the
        5:00 AM Pacific job catch up from the webhook inbox only — they do not scrape Gingr or slow the
        site.
      </div>

      <Modal open={manualOpen} title="Add incident manually" onClose={() => setManualOpen(false)}>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["dog_name", "Dog name"],
              ["owner_name", "Owner"],
              ["dog_breed", "Breed (optional)"],
              ["incident_type", "Incident type"]
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="grid gap-1 text-sm">
              <span className="admin-label">{label}</span>
              <input
                className="admin-input"
                value={manualForm[key]}
                onChange={(e) => setManualForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </label>
          ))}
          <label className="grid gap-1 text-sm">
            <span className="admin-label">Priority</span>
            <select
              className="admin-input"
              value={manualForm.priority}
              onChange={(e) => setManualForm((f) => ({ ...f, priority: e.target.value }))}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="admin-label">Notes</span>
            <textarea
              className="crossover-input min-h-24"
              value={manualForm.notes}
              onChange={(e) => setManualForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => setManualOpen(false)}>
            Cancel
          </button>
          <button type="button" className="crossover-btn crossover-btn--primary" onClick={() => void createManual()}>
            Save incident
          </button>
        </div>
      </Modal>

      <Modal open={showHistory} title="Sync history" onClose={() => setShowHistory(false)}>
        <div className="space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-admin-muted">No sync runs yet.</p>
          ) : (
            history.map((run) => (
              <div key={run.id} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                <div className="font-semibold admin-text-emphasis">
                  {run.trigger} · {run.status}
                </div>
                <div className="text-xs text-admin-muted">
                  {formatWhen(run.started_at)} · +{run.imported_count} / ~{run.updated_count} / skip{" "}
                  {run.skipped_count}
                </div>
                {run.message ? <div className="mt-1 text-xs text-admin-muted">{run.message}</div> : null}
              </div>
            ))
          )}
        </div>
      </Modal>

      {drawer ? (
        <div className="admin-drawer-backdrop" onClick={() => setDrawer(null)}>
          <aside className="admin-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h3 className="text-lg font-black admin-text-emphasis">{drawer.incident_number}</h3>
              <p className="text-sm text-admin-muted">
                {drawer.dog_name} · {drawer.incident_type}
              </p>
            </div>
            <div className="mb-4 grid gap-2 text-sm">
              <p>
                <span className="text-admin-muted">Owner:</span> {drawer.owner_name || "—"}
              </p>
              <p>
                <span className="text-admin-muted">When:</span> {formatWhen(drawer.occurred_at)}
              </p>
              <p>
                <span className="text-admin-muted">Reported by:</span> {drawer.reported_by}
              </p>
              <p>
                <span className="text-admin-muted">Location:</span> {drawer.location_name || "—"}
              </p>
              <p>
                <span className="text-admin-muted">Notes:</span> {drawer.notes || "—"}
              </p>
            </div>
            {data?.canManage ? (
              <div className="grid gap-2">
                <label className="grid gap-1 text-sm">
                  <span className="admin-label">Status</span>
                  <select
                    className="admin-input"
                    value={drawer.status}
                    onChange={(e) => void patchIncident(drawer.id, { status: e.target.value })}
                  >
                    <option value="new">New</option>
                    <option value="in_progress">In Progress</option>
                    <option value="follow_up_needed">Follow-Up Needed</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="admin-label">Priority</span>
                  <select
                    className="admin-input"
                    value={drawer.priority}
                    onChange={(e) => void patchIncident(drawer.id, { priority: e.target.value })}
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="admin-label">Assigned to</span>
                  <input
                    className="admin-input"
                    defaultValue={drawer.assigned_to_name ?? ""}
                    onBlur={(e) => {
                      if (e.target.value !== (drawer.assigned_to_name ?? "")) {
                        void patchIncident(drawer.id, { assigned_to_name: e.target.value });
                      }
                    }}
                  />
                </label>
              </div>
            ) : null}
            <button type="button" className="crossover-btn crossover-btn--ghost mt-4" onClick={() => setDrawer(null)}>
              Close
            </button>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

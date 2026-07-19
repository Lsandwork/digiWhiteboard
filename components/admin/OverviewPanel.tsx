"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardList,
  Eye,
  Filter,
  HeartPulse,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  Wrench
} from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type { OverviewAlert, OverviewPayload } from "@/lib/admin/overview";
import type { SystemHealthIssue } from "@/lib/admin/system-health-audit";
import type { AdminTab } from "@/lib/admin/types";

type OverviewPanelProps = {
  onNavigate?: (tab: AdminTab) => void;
};

type AlertFilter = "all" | "high" | "unassigned" | "overdue";

function formatRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs)) return "—";
  const minutes = Math.round(diffMs / 60000);
  if (Math.abs(minutes) < 1) return "just now";
  if (Math.abs(minutes) < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

function formatSla(ms: number) {
  if (ms < 0) return "Overdue";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function slaPercent(alert: OverviewAlert) {
  if (alert.sla_total_ms <= 0) return 0;
  const remaining = Math.max(0, alert.sla_remaining_ms);
  return Math.max(0, Math.min(100, Math.round((remaining / alert.sla_total_ms) * 100)));
}

function toneClasses(tone: string) {
  switch (tone) {
    case "red":
      return "border-rose-300/50 bg-rose-50 text-rose-700";
    case "orange":
      return "border-orange-300/50 bg-orange-50 text-orange-700";
    case "purple":
      return "border-violet-300/50 bg-violet-50 text-violet-700";
    case "blue":
      return "border-sky-300/50 bg-sky-50 text-sky-700";
    case "amber":
      return "border-amber-300/50 bg-amber-50 text-amber-800";
    case "green":
      return "border-emerald-300/50 bg-emerald-50 text-emerald-700";
    default:
      return "border-admin-border bg-admin-card text-admin-muted";
  }
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s.includes("escalat") || s.includes("overdue") || s.includes("critical") || s === "failed") {
    return "bg-rose-100 text-rose-700 border-rose-200";
  }
  if (s.includes("review") || s.includes("pending") || s.includes("progress") || s === "open") {
    return "bg-orange-100 text-orange-700 border-orange-200";
  }
  if (s.includes("active") || s.includes("assigned") || s === "fixed" || s.includes("all_clear") || s.includes("all clear")) {
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }
  if (s.includes("new")) return "bg-sky-100 text-sky-700 border-sky-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function healthStatusLabel(status: SystemHealthIssue["status"]) {
  if (status === "all_clear") return "All Clear";
  if (status === "fixed") return "Fixed";
  if (status === "failed") return "Failed";
  return "Open";
}

function overallHealthTone(status: string) {
  if (status === "all_clear") return "bg-emerald-500/15 text-emerald-300 border-emerald-400/30";
  if (status === "failed_fixes") return "bg-rose-500/15 text-rose-300 border-rose-400/30";
  if (status === "issues") return "bg-orange-500/15 text-orange-300 border-orange-400/30";
  return "bg-white/10 text-admin-muted border-admin-border";
}

function priorityDot(priority: OverviewAlert["priority"]) {
  if (priority === "high") return "bg-rose-500";
  if (priority === "low") return "bg-slate-400";
  return "bg-amber-400";
}

export function OverviewPanel({ onNavigate }: OverviewPanelProps) {
  const { showToast } = useToast();
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertFilter, setAlertFilter] = useState<AlertFilter>("all");
  const [alertQuery, setAlertQuery] = useState("");
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [auditing, setAuditing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/overview", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load overview.");
      setData(body as OverviewPayload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load overview.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const filteredAlerts = useMemo(() => {
    const alerts = data?.alerts ?? [];
    const q = alertQuery.trim().toLowerCase();
    return alerts.filter((alert) => {
      if (alertFilter === "high" && alert.priority !== "high") return false;
      if (alertFilter === "unassigned" && alert.assigned_to) return false;
      if (alertFilter === "overdue" && alert.status !== "Overdue" && alert.sla_remaining_ms >= 0) return false;
      if (!q) return true;
      return [alert.type, alert.message, alert.dog_or_employee, alert.assigned_to]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [alertFilter, alertQuery, data?.alerts]);

  function go(tab?: string) {
    if (!tab || !onNavigate) return;
    onNavigate(tab as AdminTab);
  }

  async function runSystemHealthAudit() {
    setAuditing(true);
    try {
      const response = await fetch("/api/admin/overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_system_health_audit", auto_fix: true })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to run system health audit.");
      setData((prev) =>
        prev
          ? {
              ...prev,
              system_health: body.system_health
            }
          : prev
      );
      const summary = body.system_health?.summary;
      if (summary?.all_clear) showToast("System health audit: all clear.", "success");
      else {
        showToast(
          `Audit done — ${summary?.fixed ?? 0} fixed, ${summary?.open ?? 0} open, ${summary?.failed ?? 0} failed.`,
          summary?.failed ? "error" : "info"
        );
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to run audit.", "error");
    } finally {
      setAuditing(false);
    }
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      const response = await fetch("/api/admin/overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_board_note", text: noteText })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save note.");
      setNoteText("");
      showToast("Board note saved.", "success");
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save note.", "error");
    } finally {
      setSavingNote(false);
    }
  }

  if (loading && !data) {
    return <p className="admin-empty-state-text">Loading live overview…</p>;
  }

  if (!data) {
    return (
      <div className="admin-card space-y-3 p-5">
        <p className="admin-empty-state-text">Unable to load overview.</p>
        <button type="button" className="admin-btn-primary" onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="admin-page-title">Overview</h2>
          <p className="admin-page-subtitle mt-1 max-w-3xl">
            Real-time snapshot of staff operations, alerts, HR workflow, and performance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-admin-muted">Last updated {formatRelative(data.generated_at)}</span>
          <button type="button" className="admin-btn-secondary min-h-10" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {data.metrics.map((metric) => (
          <button
            key={metric.key}
            type="button"
            className={`rounded-2xl border p-4 text-left transition hover:shadow-sm ${toneClasses(metric.tone)}`}
            onClick={() => go(metric.href_tab)}
          >
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{metric.label}</p>
            <p className="mt-2 text-3xl font-black tracking-tight">{metric.value}</p>
            <p className="mt-1 text-xs font-medium opacity-90">{metric.detail}</p>
            <p className="mt-2 text-[11px] opacity-75">{metric.trend_label}</p>
          </button>
        ))}
      </div>

      {data.priorities.items.length ? (
        <section className="rounded-2xl border border-orange-200 bg-orange-50/80 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-orange-950">
            <span className="font-semibold">
              Today&apos;s Priorities · {data.priorities.urgent_count} urgent item
              {data.priorities.urgent_count === 1 ? "" : "s"}
            </span>
            {data.priorities.items.map((item) => (
              <button
                key={item.key}
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-white/80 px-2.5 py-1 text-xs font-medium hover:border-fitdog-orange"
                onClick={() => go(item.href_tab)}
              >
                {item.label}
                <span className="rounded-full bg-orange-100 px-1.5 py-0.5 font-bold text-orange-800">{item.count}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="admin-card overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-admin-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-fitdog-orange" />
              <h3 className="text-base font-semibold text-white">Whiteboard & Gingr Health</h3>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${overallHealthTone(
                  data.system_health?.overall_status || "never_run"
                )}`}
              >
                {(data.system_health?.overall_status || "never_run").replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-xs text-admin-muted">
              Tracks push/checkout lag, Cast Keeper heartbeats, stuck overlays, and webhook noise. Safe auto-fixes
              never call live Gingr. {data.system_health?.next_cron_hint}
              {data.system_health?.last_run_at
                ? ` · Last run ${formatRelative(data.system_health.last_run_at)}`
                : " · No audit run yet"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data.system_health?.summary ? (
              <span className="text-xs text-admin-muted">
                Fixed {data.system_health.summary.fixed} · Open {data.system_health.summary.open} · Failed{" "}
                {data.system_health.summary.failed}
              </span>
            ) : null}
            <button
              type="button"
              className="admin-btn-primary min-h-10"
              disabled={auditing}
              onClick={() => void runSystemHealthAudit()}
            >
              {auditing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              {auditing ? "Auditing…" : "Run audit + auto-fix"}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/20 text-xs uppercase tracking-wide text-admin-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Severity</th>
                <th className="px-3 py-2 font-semibold">Issue</th>
                <th className="px-3 py-2 font-semibold">Area</th>
                <th className="px-3 py-2 font-semibold">Detail</th>
                <th className="px-3 py-2 font-semibold">Auto-fix</th>
              </tr>
            </thead>
            <tbody>
              {(data.system_health?.rows?.length ? data.system_health.rows : []).length ? (
                data.system_health.rows.map((row) => (
                  <tr key={row.id} className="border-t border-admin-border/70">
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadge(row.status)}`}>
                        {healthStatusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 capitalize text-admin-muted">{row.severity}</td>
                    <td className="px-3 py-2.5 font-medium text-white">{row.title}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-admin-muted">{row.check.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2.5 max-w-[320px] text-admin-muted">{row.detail}</td>
                    <td className="px-3 py-2.5 text-xs text-admin-muted">
                      {row.auto_fix ? (
                        <span>
                          <span className="font-semibold text-white">{row.auto_fix.result}</span>
                          {row.auto_fix.message ? ` · ${row.auto_fix.message}` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-admin-muted">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-2">
                      <Activity className="h-5 w-5" />
                      <p>No audit results yet. Run an audit now, or wait for the next twice-daily auto audit.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="admin-card overflow-hidden p-0">
            <div className="flex flex-col gap-3 border-b border-admin-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-fitdog-orange" />
                <h3 className="text-base font-semibold text-white">Alerts Queue</h3>
                <button type="button" className="text-xs text-fitdog-orange hover:underline" onClick={() => go("active_issues")}>
                  View all
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ["all", "All"],
                    ["high", "High Priority"],
                    ["unassigned", "Unassigned"],
                    ["overdue", "Overdue"]
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      alertFilter === key
                        ? "bg-fitdog-orange text-black"
                        : "bg-black/20 text-admin-muted hover:text-white"
                    }`}
                    onClick={() => setAlertFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-admin-border px-4 py-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
                <input
                  className="admin-input w-full pl-9"
                  placeholder="Search alerts…"
                  value={alertQuery}
                  onChange={(event) => setAlertQuery(event.target.value)}
                />
              </div>
              <span className="inline-flex items-center gap-1 text-xs text-admin-muted">
                <Filter className="h-3.5 w-3.5" />
                {filteredAlerts.length} shown
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-black/20 text-xs uppercase tracking-wide text-admin-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Priority</th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Message</th>
                    <th className="px-3 py-2 font-semibold">Dog / Employee</th>
                    <th className="px-3 py-2 font-semibold">Assigned</th>
                    <th className="px-3 py-2 font-semibold">Created</th>
                    <th className="px-3 py-2 font-semibold">SLA</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.length ? (
                    filteredAlerts.slice(0, 12).map((alert) => (
                      <tr key={alert.id} className="border-t border-admin-border/70 hover:bg-white/5">
                        <td className="px-3 py-2.5">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${priorityDot(alert.priority)}`} />
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-admin-muted">{alert.type}</td>
                        <td className="px-3 py-2.5 max-w-[220px] truncate font-medium text-white">{alert.message}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-admin-muted">{alert.dog_or_employee || "—"}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-admin-muted">{alert.assigned_to || "Unassigned"}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-admin-muted">{formatRelative(alert.created_at)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 text-xs text-admin-muted">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{
                                background: `conic-gradient(#ff9f1c ${slaPercent(alert)}%, rgba(255,255,255,0.15) 0)`
                              }}
                            />
                            {formatSla(alert.sla_remaining_ms)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadge(alert.status)}`}>
                            {alert.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="admin-btn-ghost min-h-8 px-2"
                              title="Open"
                              onClick={() => go(alert.href_tab)}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className="admin-btn-ghost min-h-8 px-2"
                              title="More"
                              onClick={() => go(alert.href_tab)}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-admin-muted">
                        No alerts match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-card overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-admin-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-fitdog-orange" />
                <h3 className="text-base font-semibold text-white">HR Notifications</h3>
              </div>
              <button type="button" className="text-xs text-fitdog-orange hover:underline" onClick={() => go("hr_hub")}>
                View all
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-black/20 text-xs uppercase tracking-wide text-admin-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Employee</th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Summary</th>
                    <th className="px-3 py-2 font-semibold">Submitted By</th>
                    <th className="px-3 py-2 font-semibold">Date</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {data.hr_notifications.length ? (
                    data.hr_notifications.slice(0, 8).map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-t border-admin-border/70 hover:bg-white/5"
                        onClick={() => go(row.href_tab)}
                      >
                        <td className="px-3 py-2.5 font-medium text-white">{row.employee}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-admin-muted">{row.notification_type}</td>
                        <td className="px-3 py-2.5 max-w-[240px] truncate text-admin-muted">{row.summary}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-admin-muted">{row.submitted_by}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-admin-muted">{formatRelative(row.date)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadge(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-admin-muted">{row.follow_up || "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-admin-muted">
                        No open HR notifications.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-card overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-admin-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-fitdog-orange" />
                <h3 className="text-base font-semibold text-white">Employees on Performance Improvement Plans</h3>
              </div>
              <button type="button" className="text-xs text-fitdog-orange hover:underline" onClick={() => go("hr_pip")}>
                View all
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-black/20 text-xs uppercase tracking-wide text-admin-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Employee</th>
                    <th className="px-3 py-2 font-semibold">Role</th>
                    <th className="px-3 py-2 font-semibold">Start Date</th>
                    <th className="px-3 py-2 font-semibold">Focus Area</th>
                    <th className="px-3 py-2 font-semibold">Next Review</th>
                    <th className="px-3 py-2 font-semibold">Progress</th>
                    <th className="px-3 py-2 font-semibold">Manager</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pip_plans.length ? (
                    data.pip_plans.slice(0, 8).map((plan) => (
                      <tr
                        key={plan.id}
                        className="cursor-pointer border-t border-admin-border/70 hover:bg-white/5"
                        onClick={() => go("hr_pip")}
                      >
                        <td className="px-3 py-2.5 font-medium text-white">{plan.employee_name}</td>
                        <td className="px-3 py-2.5 text-admin-muted">{plan.employee_role || "—"}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-admin-muted">{plan.start_date}</td>
                        <td className="px-3 py-2.5 text-admin-muted">{plan.focus_area}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-admin-muted">{plan.next_review_date || "—"}</td>
                        <td className="px-3 py-2.5 min-w-[140px]">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-fitdog-orange"
                                style={{ width: `${plan.progress_percent}%` }}
                              />
                            </div>
                            <span className="text-xs text-admin-muted">{plan.progress_percent}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-admin-muted">{plan.manager_name || "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadge(plan.status)}`}>
                            {plan.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-admin-muted">
                        No active PIP plans. Add one from the P.I.P tab.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="admin-card space-y-3 p-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-fitdog-orange" />
              <h3 className="text-base font-semibold text-white">Manager Action Center</h3>
            </div>
            <ul className="space-y-2">
              {data.action_center.length ? (
                data.action_center.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl border border-admin-border bg-black/20 px-3 py-2 text-left text-sm hover:border-fitdog-orange/50"
                      onClick={() => go(item.href_tab)}
                    >
                      <span className="text-white">{item.label}</span>
                      <span className="rounded-full bg-fitdog-orange/20 px-2 py-0.5 text-xs font-bold text-fitdog-orange">
                        {item.count}
                      </span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200">
                  <CheckCircle2 className="mb-1 h-4 w-4" />
                  All clear — no urgent manager actions right now.
                </li>
              )}
            </ul>
            <button type="button" className="admin-btn-primary w-full" onClick={() => go("checklist")}>
              Go to Checklist
            </button>
          </section>

          <section className="admin-card space-y-3 p-4">
            <h3 className="text-base font-semibold text-white">Recent Activity</h3>
            <ul className="space-y-3">
              {data.recent_activity.length ? (
                data.recent_activity.slice(0, 8).map((item) => (
                  <li key={item.id} className="border-b border-admin-border/50 pb-2 last:border-0">
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    {item.description ? <p className="mt-0.5 line-clamp-2 text-xs text-admin-muted">{item.description}</p> : null}
                    <p className="mt-1 text-[11px] text-admin-muted">
                      {item.category} · {formatRelative(item.created_at)}
                    </p>
                  </li>
                ))
              ) : (
                <li className="text-sm text-admin-muted">No recent activity yet.</li>
              )}
            </ul>
          </section>

          <section className="admin-card space-y-3 p-4">
            <h3 className="text-base font-semibold text-white">Upcoming Reviews</h3>
            <ul className="space-y-2">
              {data.upcoming_reviews.length ? (
                data.upcoming_reviews.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl border border-admin-border px-3 py-2 text-left hover:border-fitdog-orange/40"
                      onClick={() => go(item.href_tab)}
                    >
                      <div>
                        <p className="text-sm font-medium text-white">{item.name}</p>
                        <p className="text-xs text-admin-muted">
                          {item.kind} · {item.due_date || "No date"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          item.days_remaining <= 2
                            ? "bg-rose-500/20 text-rose-300"
                            : item.days_remaining <= 7
                              ? "bg-orange-500/20 text-orange-300"
                              : "bg-violet-500/20 text-violet-300"
                        }`}
                      >
                        {item.days_remaining < 0
                          ? `${Math.abs(item.days_remaining)}d late`
                          : item.days_remaining === 0
                            ? "Today"
                            : `${item.days_remaining} days`}
                      </span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="text-sm text-admin-muted">No upcoming reviews.</li>
              )}
            </ul>
          </section>

          <section className="admin-card space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Board Notes</h3>
              <HeartPulse className="h-4 w-4 text-admin-muted" />
            </div>
            <textarea
              className="admin-input min-h-[80px] w-full"
              placeholder="Add a note for the management team…"
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
            />
            <button type="button" className="admin-btn-primary w-full" disabled={savingNote || !noteText.trim()} onClick={() => void addNote()}>
              New Note
            </button>
            <ul className="space-y-2">
              {data.board_notes.length ? (
                data.board_notes.slice(0, 5).map((note) => (
                  <li key={note.id} className="rounded-xl border border-admin-border bg-black/20 px-3 py-2">
                    <p className="text-sm text-white">{note.text}</p>
                    <p className="mt-1 text-[11px] text-admin-muted">
                      {note.author} · {formatRelative(note.created_at)}
                    </p>
                  </li>
                ))
              ) : (
                <li className="text-sm text-admin-muted">No board notes yet.</li>
              )}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

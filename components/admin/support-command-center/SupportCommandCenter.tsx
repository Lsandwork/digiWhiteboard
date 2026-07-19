"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  FileWarning,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus
} from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type { ActivityEvent, CommandCenterPayload, UrgentAlertRow } from "@/lib/admin/support-command-center/types";
import type { AdminTab } from "@/lib/admin/types";
import type { ManagementReport } from "@/lib/staff/management-reports";

type Props = {
  onNavigate?: (tab: AdminTab) => void;
};

type FocusFilter =
  | "all"
  | "urgent"
  | "pips"
  | "escalations"
  | "overdue"
  | "compliance"
  | "resolved";

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatSla(ms: number) {
  if (ms < 0) {
    const overdue = Math.abs(ms);
    const minutes = Math.round(overdue / 60000);
    if (minutes < 60) return `Overdue ${minutes}m`;
    const hours = Math.round(minutes / 60);
    return `Overdue ${hours}h`;
  }
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h left`;
  return `${Math.round(hours / 24)}d left`;
}

function severityClass(severity: string) {
  if (severity === "Critical") return "bg-rose-500/20 text-rose-300 border-rose-400/40";
  if (severity === "Urgent") return "bg-orange-500/20 text-orange-300 border-orange-400/40";
  if (severity === "High") return "bg-amber-500/20 text-amber-200 border-amber-400/40";
  if (severity === "Medium") return "bg-yellow-500/15 text-yellow-200 border-yellow-400/30";
  return "bg-white/10 text-admin-muted border-white/15";
}

function riskClass(risk: string) {
  if (risk === "Critical" || risk === "High") return "text-rose-300";
  if (risk === "Moderate" || risk === "Medium") return "text-amber-300";
  return "text-emerald-300";
}

function alertTypeFromReport(report: ManagementReport) {
  if (report.report_type === "owner_complaint_dog_handler") return "Client complaint";
  if (report.report_type.includes("complaint")) return "Employee complaint";
  if (report.report_type.includes("request")) return "Employee request";
  if (report.report_type === "employee_write_up") return "Performance concern";
  return "Support case";
}

function severityFromReport(report: ManagementReport): UrgentAlertRow["severity"] {
  if (report.priority === "Urgent") return report.escalated_at ? "Critical" : "Urgent";
  if (report.priority === "High") return "High";
  return "Medium";
}

function caseToAlertRow(report: ManagementReport): UrgentAlertRow {
  const triggered_at = report.created_at;
  const severity = severityFromReport(report);
  const totalMs = (severity === "Critical" ? 30 : severity === "Urgent" ? 60 : severity === "High" ? 240 : 1440) * 60_000;
  const due = new Date(new Date(triggered_at).getTime() + totalMs);
  const details = report.groomer_submission_details?.description ?? report.summary;
  return {
    id: `case-${report.id}`,
    source: "support_case",
    source_id: report.id,
    severity,
    triggered_at,
    sla_due_at: due.toISOString(),
    sla_remaining_ms: due.getTime() - Date.now(),
    sla_total_ms: totalMs,
    employee: report.employee_name ?? report.dog_handler_name ?? report.submitted_by_name ?? report.created_by ?? "—",
    department: report.department ?? "—",
    alert_type: alertTypeFromReport(report),
    summary: report.title || details.slice(0, 160),
    assigned_manager: report.assigned_to ?? null,
    acknowledged: Boolean(report.acknowledged_at),
    acknowledged_at: report.acknowledged_at ?? null,
    status: report.admin_status ?? report.status,
    report,
    pip: null
  };
}

export function SupportCommandCenter({ onNavigate }: Props) {
  const { showToast } = useToast();
  const [data, setData] = useState<CommandCenterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<FocusFilter>("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [selectedAlert, setSelectedAlert] = useState<UrgentAlertRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReply, setAiReply] = useState("");
  const [aiLabel, setAiLabel] = useState("");
  const [createPipOpen, setCreatePipOpen] = useState(false);
  const [pipForm, setPipForm] = useState({ employee_name: "", focus_area: "", employee_role: "", manager_name: "" });
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/support-command-center", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load Support Command Center.");
      setData(body as CommandCenterPayload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load Support Command Center.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filteredAlerts = useMemo(() => {
    const rows = data?.alerts ?? [];
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (focus === "resolved") return false;
      if (focus === "escalations" && row.severity !== "Critical" && !row.report?.escalated_at) return false;
      if (focus === "overdue" && row.sla_remaining_ms >= 0 && row.status !== "Overdue") return false;
      if (focus === "pips" && row.source !== "pip_review") return false;
      if ((focus === "urgent" || focus === "compliance") && !(row.severity === "Critical" || row.severity === "Urgent" || row.severity === "High")) {
        return false;
      }
      if (!q) return true;
      return [row.employee, row.department, row.summary, row.alert_type, row.assigned_manager, row.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data?.alerts, focus, query]);

  const filteredPips = useMemo(() => {
    const rows = data?.pips ?? [];
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (focus === "overdue" && row.documentation_status !== "Overdue Review") return false;
      if (focus === "resolved") return false;
      if (!q) return true;
      return [row.employee_name, row.department, row.manager_name, row.stage, row.latest_activity]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data?.pips, focus, query]);

  const filteredActivity = useMemo(() => {
    const rows = data?.activity ?? [];
    if (activityFilter === "all") return rows;
    const map: Record<string, string> = {
      alerts: "alert",
      pips: "pip",
      comments: "comment",
      followups: "followup",
      acks: "ack",
      docs: "docs",
      system: "system"
    };
    const cat = map[activityFilter];
    return rows.filter((row) => row.category === cat);
  }, [activityFilter, data?.activity]);

  const openCase = useCallback(
    async (caseId: string) => {
      const fromAlert = data?.alerts.find((row) => row.source === "support_case" && row.source_id === caseId);
      if (fromAlert) {
        setSelectedAlert(fromAlert);
        return;
      }
      const fromCase = data?.cases.find((row) => row.id === caseId);
      if (fromCase?.report) {
        setSelectedAlert(caseToAlertRow(fromCase.report));
        return;
      }
      try {
        const response = await fetch(`/api/admin/support-command-center?case_id=${encodeURIComponent(caseId)}`, {
          cache: "no-store"
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Case not found.");
        setSelectedAlert(caseToAlertRow(body.case as ManagementReport));
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to open case.", "error");
      }
    },
    [data?.alerts, data?.cases, showToast]
  );

  function openActivityItem(event: ActivityEvent) {
    if (event.pip_id) {
      onNavigate?.("hr_pip");
      return;
    }
    if (event.case_id) {
      void openCase(event.case_id);
    }
  }

  async function runCaseAction(action: string, id: string, payload: Record<string, unknown> = {}) {
    setBusyId(id);
    try {
      const response = await fetch("/api/admin/support-command-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id, ...payload })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Action failed.");
      showToast("Updated.", "success");
      setSelectedAlert(null);
      setEscalateOpen(false);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Action failed.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function createPip() {
    if (!pipForm.employee_name.trim() || !pipForm.focus_area.trim()) {
      showToast("Employee and focus area are required.", "error");
      return;
    }
    setBusyId("create-pip");
    try {
      const response = await fetch("/api/admin/support-command-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_pip", ...pipForm, source_record_ids: selectedAlert?.source === "support_case" ? [selectedAlert.source_id] : [] })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to create PIP.");
      showToast("PIP created. Review before sharing with the employee.", "success");
      setCreatePipOpen(false);
      setPipForm({ employee_name: "", focus_area: "", employee_role: "", manager_name: "" });
      await load();
      onNavigate?.("hr_pip");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to create PIP.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function runAi(operation: string) {
    if (!data?.ai.gemini_configured) {
      showToast("AI is unavailable. Configure GEMINI_API_KEY and HR AI settings.", "error");
      return;
    }
    setAiBusy(true);
    setAiReply("");
    try {
      const response = await fetch("/api/admin/support-command-center/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          case_id: selectedAlert?.source === "support_case" ? selectedAlert.source_id : undefined,
          pip_id: selectedAlert?.source === "pip_review" ? selectedAlert.source_id : data.pips[0]?.id,
          message: selectedAlert ? `Focus on ${selectedAlert.employee}: ${selectedAlert.summary}` : "Analyze current command-center priorities."
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "AI unavailable.");
      setAiReply(String(body.reply || ""));
      setAiLabel(String(body.label || "AI-generated — manager review required"));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "AI unavailable.", "error");
    } finally {
      setAiBusy(false);
    }
  }

  const kpis = data?.kpis;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-fitdog-orange">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">Management Support</span>
          </div>
          <h2 className="admin-page-title mt-1">Management Support Command Center</h2>
          <p className="admin-page-subtitle mt-1 max-w-3xl">
            Track employee support, PIPs, urgent incidents, compliance, and AI-assisted action items.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="admin-btn-secondary min-h-11" onClick={() => void load()} disabled={loading || pending}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            className="admin-btn-primary min-h-11"
            onClick={() => {
              setPipForm((prev) => ({
                ...prev,
                employee_name: selectedAlert?.employee || prev.employee_name,
                focus_area: selectedAlert?.summary || prev.focus_area,
                employee_role: selectedAlert?.department || prev.employee_role
              }));
              setCreatePipOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Create PIP
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {[
          { key: "pips" as const, label: "Active PIPs", value: kpis?.active_pips ?? "—", icon: ClipboardList, tip: kpis?.tooltips.active_pips },
          { key: "urgent" as const, label: "Urgent Alerts Open", value: kpis?.urgent_alerts_open ?? "—", icon: AlertTriangle, tip: kpis?.tooltips.urgent_alerts_open },
          { key: "escalations" as const, label: "Escalations Today", value: kpis?.escalations_today ?? "—", icon: TrendingUp, tip: kpis?.tooltips.escalations_today },
          { key: "overdue" as const, label: "Overdue Check-ins", value: kpis?.overdue_checkins ?? "—", icon: Clock3, tip: kpis?.tooltips.overdue_checkins },
          {
            key: "compliance" as const,
            label: "Compliance Risk",
            value: kpis?.compliance_risk ?? "—",
            sub: kpis ? `${kpis.compliance_item_count} items` : undefined,
            icon: ShieldAlert,
            tip: kpis?.tooltips.compliance_risk,
            tone: riskClass(kpis?.compliance_risk || "Low")
          },
          { key: "resolved" as const, label: "Resolved This Week", value: kpis?.resolved_this_week ?? "—", icon: CheckCircle2, tip: kpis?.tooltips.resolved_this_week }
        ].map((card) => (
          <button
            key={card.key}
            type="button"
            title={card.tip}
            className={`admin-card p-4 text-left transition hover:border-fitdog-orange/40 ${focus === card.key ? "border-fitdog-orange/50" : ""}`}
            onClick={() => startTransition(() => setFocus(card.key))}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-admin-muted">{card.label}</p>
              <card.icon className="h-4 w-4 text-fitdog-orange" />
            </div>
            {loading && !data ? (
              <div className="mt-3 h-8 w-16 animate-pulse rounded bg-white/10" />
            ) : (
              <p className={`mt-2 text-3xl font-black ${card.tone || "text-white"}`}>{card.value}</p>
            )}
            {card.sub ? <p className="mt-1 text-xs text-admin-muted">{card.sub}</p> : null}
          </button>
        ))}
      </div>

      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#12161c]/95 p-3 backdrop-blur">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
          <input
            className="admin-input w-full pl-10"
            placeholder="Search employee, subject, case, department, manager…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => { setQuery(""); setFocus("all"); }}>
          Clear filters
        </button>
        <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => onNavigate?.("ms_groomer_complaints")}>
          Complaints log
        </button>
        <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => onNavigate?.("ms_groomer_requests")}>
          Requests log
        </button>
        <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => onNavigate?.("hr_pip")}>
          Track PIP
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="admin-card overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-white">Urgent Alerts Queue</h3>
                <span className="rounded-full border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-200">
                  {filteredAlerts.length} Open
                </span>
              </div>
              <button type="button" className="text-xs text-fitdog-orange hover:underline" onClick={() => setFocus("urgent")}>
                View all alerts
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-black/25 text-xs uppercase tracking-wide text-admin-muted">
                  <tr>
                    <th className="px-3 py-2">Severity</th>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2">Dept</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Summary</th>
                    <th className="px-3 py-2">Manager</th>
                    <th className="px-3 py-2">Ack</th>
                    <th className="px-3 py-2">SLA</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && !data ? (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-admin-muted">Loading alerts…</td></tr>
                  ) : filteredAlerts.length ? (
                    filteredAlerts.map((alert) => (
                      <tr key={alert.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                        <td className="px-3 py-2.5"><span className={`rounded border px-2 py-0.5 text-xs font-semibold ${severityClass(alert.severity)}`}>{alert.severity}</span></td>
                        <td className="px-3 py-2.5 text-admin-muted whitespace-nowrap">{formatWhen(alert.triggered_at)}</td>
                        <td className="px-3 py-2.5 font-medium text-white">{alert.employee}</td>
                        <td className="px-3 py-2.5 text-admin-muted">{alert.department}</td>
                        <td className="px-3 py-2.5 text-admin-muted">{alert.alert_type}</td>
                        <td className="max-w-[220px] px-3 py-2.5 text-admin-muted"><span className="line-clamp-2">{alert.summary}</span></td>
                        <td className="px-3 py-2.5 text-admin-muted">{alert.assigned_manager || "Unassigned"}</td>
                        <td className="px-3 py-2.5 text-admin-muted">{alert.acknowledged ? "Yes" : "No"}</td>
                        <td className={`px-3 py-2.5 whitespace-nowrap ${alert.sla_remaining_ms < 0 ? "text-rose-300" : "text-admin-muted"}`}>{formatSla(alert.sla_remaining_ms)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1">
                            <button type="button" className="admin-btn-ghost min-h-9 px-2" aria-label="Open alert" onClick={() => setSelectedAlert(alert)}><Eye className="h-4 w-4" /></button>
                            {alert.source === "support_case" ? (
                              <button
                                type="button"
                                className="admin-btn-ghost min-h-9 px-2"
                                disabled={busyId === alert.source_id}
                                aria-label="Acknowledge"
                                onClick={() => void runCaseAction("acknowledge", alert.source_id)}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </button>
                            ) : null}
                            <button type="button" className="admin-btn-ghost min-h-9 px-2" aria-label="More" onClick={() => setSelectedAlert(alert)}><MoreHorizontal className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={10} className="px-4 py-10 text-center text-admin-muted">No urgent alerts require attention.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-card overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-white">PIP Manager</h3>
                <span className="rounded-full border border-fitdog-orange/40 bg-fitdog-orange/15 px-2 py-0.5 text-xs font-semibold text-orange-200">
                  {filteredPips.length} Active
                </span>
              </div>
              <button type="button" className="text-xs text-fitdog-orange hover:underline" onClick={() => onNavigate?.("hr_pip")}>
                View all PIPs
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-black/25 text-xs uppercase tracking-wide text-admin-muted">
                  <tr>
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2">Dept</th>
                    <th className="px-3 py-2">Stage</th>
                    <th className="px-3 py-2">Start</th>
                    <th className="px-3 py-2">Next review</th>
                    <th className="px-3 py-2">Progress</th>
                    <th className="px-3 py-2">Manager</th>
                    <th className="px-3 py-2">Risk</th>
                    <th className="px-3 py-2">Docs</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPips.length ? filteredPips.map((pip) => (
                    <tr key={pip.id} className="border-t border-white/5">
                      <td className="px-3 py-2.5 font-medium text-white">{pip.employee_name}</td>
                      <td className="px-3 py-2.5 text-admin-muted">{pip.department || "—"}</td>
                      <td className="px-3 py-2.5 text-sky-300">{pip.stage}</td>
                      <td className="px-3 py-2.5 text-admin-muted">{pip.start_date}</td>
                      <td className="px-3 py-2.5 text-admin-muted">{pip.next_review_date || "—"}</td>
                      <td className="min-w-[140px] px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-fitdog-orange" style={{ width: `${pip.progress_percent}%` }} />
                          </div>
                          <span className="text-xs text-admin-muted">{pip.progress_percent}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-admin-muted">{pip.manager_name || "—"}</td>
                      <td className={`px-3 py-2.5 ${riskClass(pip.risk_level)}`}>{pip.risk_level}</td>
                      <td className="px-3 py-2.5 text-admin-muted">{pip.documentation_status}</td>
                      <td className="px-3 py-2.5">
                        <button type="button" className="admin-btn-secondary min-h-9" onClick={() => onNavigate?.("hr_pip")}>Open</button>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={10} className="px-4 py-10 text-center text-admin-muted">No active PIPs yet. Create one from Quick Actions or HR Records.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-white">Case Timeline</h3>
              <div className="flex flex-wrap gap-1">
                {[
                  ["all", "All Events"],
                  ["alerts", "Alerts"],
                  ["pips", "PIPs"],
                  ["comments", "Comments"],
                  ["followups", "Follow-ups"],
                  ["acks", "Acknowledgments"],
                  ["docs", "Documentation"],
                  ["system", "System"]
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`crossover-btn text-xs ${activityFilter === id ? "crossover-btn--active" : "crossover-btn--ghost"}`}
                    onClick={() => setActivityFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto">
              {filteredActivity.length ? filteredActivity.slice(0, 40).map((event) => (
                <div key={event.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-admin-muted">{formatWhen(event.at)} · {event.actor}</p>
                    <p className="mt-1 text-sm text-white/90">{event.summary}</p>
                    <p className="mt-1 text-xs text-admin-muted">{[event.employee, event.department, event.assigned_manager].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-white/15 px-2 py-0.5 text-xs text-admin-muted">{event.badge}</span>
                    {event.case_id || event.pip_id ? (
                      <button
                        type="button"
                        className="crossover-btn crossover-btn--ghost text-xs"
                        onClick={() => openActivityItem(event)}
                      >
                        View Case
                      </button>
                    ) : null}
                  </div>
                </div>
              )) : (
                <p className="py-8 text-center text-sm text-admin-muted">No activity events yet.</p>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <section className="admin-card space-y-3 p-4">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-5 w-5 text-fitdog-orange" />
              <div>
                <h3 className="text-base font-semibold text-white">AI Support Copilot</h3>
                <p className="text-xs text-admin-muted">BETA · Human review required for every action</p>
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="text-xs uppercase tracking-wide text-admin-muted">Risk summary</p>
              <p className="mt-1 text-sm text-white/90">{data?.ai.risk_summary || "Load the command center to see risk summary."}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-admin-muted">Top risk factors</p>
              <ul className="mt-2 space-y-1 text-sm text-white/85">
                {(data?.ai.top_risk_factors.length ? data.ai.top_risk_factors : [{ label: "No elevated factors", count: 0 }]).map((factor) => (
                  <li key={factor.label} className="flex justify-between gap-2">
                    <span>{factor.label}</span>
                    <span className="text-admin-muted">{factor.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-admin-muted">Suggested next steps</p>
              <ul className="mt-2 space-y-1 text-sm text-white/85">
                {(data?.ai.suggested_next_steps ?? []).map((step) => (
                  <li key={step}>• {step}</li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["draft_follow_up", "Draft Follow-Up"],
                ["summarize_case", "Summarize Case"],
                ["recommend_pip_action", "Recommend PIP Action"],
                ["escalate_summary", "Escalate to HR"]
              ].map(([op, label]) => (
                <button
                  key={op}
                  type="button"
                  className={`crossover-btn text-xs ${op === "escalate_summary" ? "crossover-btn--primary col-span-2" : "crossover-btn--ghost"}`}
                  disabled={aiBusy || !data?.ai.gemini_configured}
                  onClick={() => {
                    if (op === "escalate_summary") {
                      if (selectedAlert?.source === "support_case") setEscalateOpen(true);
                      else void runAi(op);
                      return;
                    }
                    void runAi(op);
                  }}
                >
                  {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {label}
                </button>
              ))}
            </div>
            {!data?.ai.gemini_configured ? (
              <p className="text-xs text-admin-muted">AI unavailable until GEMINI_API_KEY is configured. The rest of this page still works.</p>
            ) : null}
            {aiReply ? (
              <div className="max-h-64 overflow-y-auto rounded-xl border border-fitdog-orange/30 bg-fitdog-orange/5 p-3 text-sm text-white/90 whitespace-pre-wrap">
                <p className="mb-2 text-xs font-semibold text-fitdog-orange">{aiLabel}</p>
                {aiReply}
              </div>
            ) : null}
          </section>

          <section className="admin-card p-4">
            <h3 className="text-base font-semibold text-white">Quick Actions</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="crossover-btn crossover-btn--ghost text-xs" onClick={() => setCreatePipOpen(true)}><Plus className="h-3.5 w-3.5" /> Create PIP</button>
              <button type="button" className="crossover-btn crossover-btn--ghost text-xs" onClick={() => onNavigate?.("management_support")}><FileWarning className="h-3.5 w-3.5" /> Add Incident</button>
              <button type="button" className="crossover-btn crossover-btn--ghost text-xs" onClick={() => onNavigate?.("emergency_alerts")}><AlertTriangle className="h-3.5 w-3.5" /> Create Urgent Alert</button>
              <button type="button" className="crossover-btn crossover-btn--ghost text-xs" disabled={!selectedAlert?.source_id || selectedAlert.source !== "support_case"} onClick={() => {
                const name = window.prompt("Assign manager name or email");
                if (name && selectedAlert?.source === "support_case") void runCaseAction("assign", selectedAlert.source_id, { assigned_to: name });
              }}><UserPlus className="h-3.5 w-3.5" /> Assign Manager</button>
              <button type="button" className="crossover-btn crossover-btn--ghost text-xs" onClick={() => onNavigate?.("hr_pip")}><Clock3 className="h-3.5 w-3.5" /> Schedule Review</button>
              <button type="button" className="crossover-btn crossover-btn--ghost text-xs" onClick={() => onNavigate?.("hr_pip")}><ClipboardList className="h-3.5 w-3.5" /> Add Check-In</button>
            </div>
          </section>

          <section className="admin-card space-y-4 p-4">
            <h3 className="text-base font-semibold text-white">Insights at a Glance</h3>
            <div>
              <p className="text-xs uppercase tracking-wide text-admin-muted">PIP completion rate</p>
              <p className="mt-1 text-3xl font-black text-white">{data?.insights.pip_completion_rate ?? 0}%</p>
              <p className="text-xs text-admin-muted" title="Completed PIPs ÷ closed/completed PIPs">
                {data?.insights.pip_completed ?? 0} completed / {data?.insights.pip_closed_total ?? 0} closed
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-admin-muted">Open alerts by dept</p>
              <div className="mt-2 space-y-2">
                {(data?.insights.open_alerts_by_department.length ? data.insights.open_alerts_by_department : [{ department: "None", count: 0 }]).map((row) => {
                  const max = Math.max(1, ...(data?.insights.open_alerts_by_department.map((d) => d.count) ?? [1]));
                  return (
                    <div key={row.department}>
                      <div className="mb-1 flex justify-between text-xs text-admin-muted">
                        <span>{row.department}</span>
                        <span>{row.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.round((row.count / max) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-admin-muted">Urgent issue trend (7d)</p>
              <div className="mt-2 flex h-20 items-end gap-1">
                {(data?.insights.urgent_issue_trend ?? []).map((point) => {
                  const max = Math.max(1, ...(data?.insights.urgent_issue_trend.map((p) => p.count) ?? [1]));
                  return (
                    <div key={point.day} className="flex flex-1 flex-col items-center gap-1" title={`${point.day}: ${point.count}`}>
                      <div className="w-full rounded-t bg-fitdog-orange/80" style={{ height: `${Math.max(8, Math.round((point.count / max) * 64))}px` }} />
                      <span className="text-[10px] text-admin-muted">{point.day.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </aside>
      </div>

      <Modal open={Boolean(selectedAlert)} title={selectedAlert?.summary || "Case details"} onClose={() => setSelectedAlert(null)}>
        {selectedAlert ? (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 md:grid-cols-2">
              <p><span className="font-bold text-white">Case ID:</span> {selectedAlert.source_id}</p>
              <p><span className="font-bold text-white">Type:</span> {selectedAlert.alert_type}</p>
              <p><span className="font-bold text-white">Severity:</span> {selectedAlert.severity}</p>
              <p><span className="font-bold text-white">Employee / subject:</span> {selectedAlert.employee}</p>
              <p><span className="font-bold text-white">Department:</span> {selectedAlert.department}</p>
              <p><span className="font-bold text-white">SLA:</span> {formatSla(selectedAlert.sla_remaining_ms)}</p>
              <p><span className="font-bold text-white">Manager:</span> {selectedAlert.assigned_manager || "Unassigned"}</p>
              <p><span className="font-bold text-white">Status:</span> {selectedAlert.status}</p>
              <p><span className="font-bold text-white">Opened:</span> {formatWhen(selectedAlert.triggered_at)}</p>
              {selectedAlert.report?.created_by ? (
                <p><span className="font-bold text-white">Submitted by:</span> {selectedAlert.report.submitted_by_name ?? selectedAlert.report.created_by}</p>
              ) : null}
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="font-bold text-white">Details</p>
              <p className="mt-2 whitespace-pre-wrap text-admin-muted">
                {selectedAlert.report?.groomer_submission_details?.description ??
                  selectedAlert.report?.summary ??
                  selectedAlert.summary}
              </p>
            </div>
            {selectedAlert.report?.management_response ? (
              <div className="rounded-xl border border-fitdog-orange/30 bg-fitdog-orange/10 p-3">
                <p className="font-bold text-white">Management response</p>
                <p className="mt-2 whitespace-pre-wrap text-admin-muted">{selectedAlert.report.management_response}</p>
              </div>
            ) : null}
            {selectedAlert.source === "support_case" ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="admin-btn-secondary" disabled={busyId === selectedAlert.source_id} onClick={() => void runCaseAction("acknowledge", selectedAlert.source_id)}>Acknowledge</button>
                <button type="button" className="admin-btn-secondary" onClick={() => {
                  const name = window.prompt("Assign manager name or email", selectedAlert.assigned_manager || "");
                  if (name) void runCaseAction("assign", selectedAlert.source_id, { assigned_to: name });
                }}>Assign</button>
                <button type="button" className="admin-btn-secondary" onClick={() => {
                  const note = window.prompt("Internal note");
                  if (note) void runCaseAction("add_internal_note", selectedAlert.source_id, { body: note, user_role: data?.currentUser.role || "admin" });
                }}>Add note</button>
                <button type="button" className="admin-btn-secondary" onClick={() => setEscalateOpen(true)}>Escalate to HR</button>
                <button type="button" className="admin-btn-primary" onClick={() => {
                  if (window.confirm("Mark this alert/case resolved?")) void runCaseAction("change_status", selectedAlert.source_id, { status: "Resolved" });
                }}>Mark resolved</button>
                <button type="button" className="admin-btn-secondary" onClick={() => {
                  setPipForm({
                    employee_name: selectedAlert.employee,
                    focus_area: selectedAlert.summary.slice(0, 160),
                    employee_role: selectedAlert.department === "—" ? "" : selectedAlert.department,
                    manager_name: selectedAlert.assigned_manager || ""
                  });
                  setCreatePipOpen(true);
                }}>Create PIP from alert</button>
              </div>
            ) : (
              <button type="button" className="admin-btn-primary" onClick={() => onNavigate?.("hr_pip")}>Open PIP workspace</button>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal open={createPipOpen} title="Create Performance Improvement Plan" onClose={() => setCreatePipOpen(false)}>
        <div className="space-y-3">
          <label className="admin-label">Employee<input className="admin-input mt-1" value={pipForm.employee_name} onChange={(e) => setPipForm((p) => ({ ...p, employee_name: e.target.value }))} /></label>
          <label className="admin-label">Department / role<input className="admin-input mt-1" value={pipForm.employee_role} onChange={(e) => setPipForm((p) => ({ ...p, employee_role: e.target.value }))} /></label>
          <label className="admin-label">Manager<input className="admin-input mt-1" value={pipForm.manager_name} onChange={(e) => setPipForm((p) => ({ ...p, manager_name: e.target.value }))} /></label>
          <label className="admin-label">
            Focus / concern
            <textarea className="admin-input mt-1 min-h-[90px]" value={pipForm.focus_area} onChange={(e) => setPipForm((p) => ({ ...p, focus_area: e.target.value }))} />
          </label>
          <p className="text-xs text-admin-muted">Activation creates an audit event. Employee notifications are not sent automatically.</p>
          <button type="button" className="admin-btn-primary" disabled={busyId === "create-pip"} onClick={() => void createPip()}>
            {busyId === "create-pip" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create PIP
          </button>
        </div>
      </Modal>

      <Modal open={escalateOpen} title="Escalate to HR / Owner" onClose={() => setEscalateOpen(false)}>
        <div className="space-y-3 text-sm">
          <p className="text-admin-muted">This marks the case Urgent, records escalation, and writes an audit event. AI cannot escalate by itself — you must confirm.</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="admin-btn-primary"
              disabled={!selectedAlert || selectedAlert.source !== "support_case" || busyId === selectedAlert.source_id}
              onClick={() => {
                if (selectedAlert?.source === "support_case") {
                  void runCaseAction("escalate", selectedAlert.source_id, { escalation_destination: "HR / Owner" });
                }
              }}
            >
              Confirm escalation
            </button>
            <button type="button" className="admin-btn-secondary" onClick={() => { setEscalateOpen(false); void runAi("escalate_summary"); }}>
              Draft summary only
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

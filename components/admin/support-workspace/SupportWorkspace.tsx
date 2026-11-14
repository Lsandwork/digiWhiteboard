"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { RichText } from "@/components/admin/ui/RichText";
import { readResponseJson } from "@/lib/http/read-response-json";
import type { ManagementReport, ManagementReportType } from "@/lib/staff/management-reports";
import type { SupportInboxRow } from "@/lib/staff/management-support-admin";
import { caseDisplayTitle } from "@/lib/staff/support-case-display";
import {
  attentionFlag,
  canonicalSupportStatus,
  formatSupportWhen,
  hasVisibleManagementReply,
  isOpenWorkflowStatus,
  SUPPORT_PRIORITIES
} from "@/lib/staff/support-workflow";
import "./support-workspace.css";

type Assignee = { id: string; name: string; role: string };

type HubPayload = {
  items: SupportInboxRow[];
  allItems?: SupportInboxRow[];
  assignees?: Assignee[];
};

type KindFilter = "all" | "complaint" | "request";
type StatusFilter = "all" | "new" | "urgent" | "in_progress" | "waiting_response" | "resolved";

const ROLE_LABEL: Record<string, string> = {
  owner_admin: "Super Admin",
  manager_admin: "Admin",
  assistant_manager: "Management"
};

function statusClass(status: string) {
  if (status === "New") return "crossover-badge crossover-badge--urgent";
  if (status === "Acknowledged") return "crossover-badge crossover-badge--info";
  if (status === "In Progress") return "crossover-badge crossover-badge--warning";
  if (status === "Resolved") return "crossover-badge crossover-badge--resolved";
  return "crossover-badge";
}

function priorityClass(priority: string) {
  if (priority === "Urgent") return "crossover-badge crossover-badge--urgent";
  if (priority === "High") return "crossover-badge crossover-badge--warning";
  if (priority === "Low") return "crossover-badge";
  return "crossover-badge crossover-badge--info";
}

export function SupportWorkspace({
  initialKind = "all",
  reportTypes
}: {
  initialKind?: KindFilter;
  reportTypes?: ManagementReportType[];
}) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<SupportInboxRow[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>(initialKind);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [assigneeId, setAssigneeId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (reportTypes?.length) params.set("report_type", reportTypes.join(","));
      const res = await fetch(`/api/admin/management-support-hub?${params.toString()}`, { cache: "no-store" });
      const body = (await readResponseJson(res)) as HubPayload & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Unable to load complaints and requests.");
      setRows(body.allItems ?? body.items ?? []);
      setAssignees(body.assignees ?? []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load complaints and requests.", "error");
    } finally {
      setLoading(false);
    }
  }, [reportTypes, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const counts = useMemo(() => {
    const open = rows.filter((row) => isOpenWorkflowStatus(canonicalSupportStatus(row.status)));
    return {
      fresh: rows.filter((row) => row.status === "New").length,
      waitingAck: rows.filter((row) => row.status === "New").length,
      inProgress: rows.filter((row) => row.status === "Acknowledged" || row.status === "In Progress").length,
      waitingResponse: open.filter((row) => !hasVisibleManagementReply(row.report)).length,
      resolved: rows.filter((row) => row.status === "Resolved" || row.status === "Closed").length,
      urgent: open.filter((row) => row.priority === "Urgent").length
    };
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (kind === "complaint" && row.item_type !== "Complaint") return false;
      if (kind === "request" && row.item_type !== "Request") return false;
      if (statusFilter === "new" && row.status !== "New") return false;
      if (statusFilter === "urgent" && !(row.priority === "Urgent" && isOpenWorkflowStatus(canonicalSupportStatus(row.status)))) return false;
      if (statusFilter === "in_progress" && row.status !== "Acknowledged" && row.status !== "In Progress") return false;
      if (statusFilter === "waiting_response" && !(isOpenWorkflowStatus(canonicalSupportStatus(row.status)) && !hasVisibleManagementReply(row.report))) return false;
      if (statusFilter === "resolved" && row.status !== "Resolved" && row.status !== "Closed") return false;
      if (!q) return true;
      const haystack = [row.submitted_by, row.subject, row.details_preview, row.status, formatSupportWhen(row.date_submitted)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [kind, query, rows, statusFilter]);

  const selected = rows.find((row) => row.id === selectedId) ?? visible[0] ?? null;
  const report = selected?.report ?? null;

  useEffect(() => {
    if (!report) return;
    const match = assignees.find((person) => person.name === report.assigned_to);
    setAssigneeId(match?.id ?? "");
    setResponse("");
    setInternalNote("");
  }, [assignees, report]);

  async function run(action: string, payload: Record<string, unknown> = {}) {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/management-support-hub", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selected.id, action, ...payload })
      });
      const body = (await readResponseJson(res)) as {
        error?: string;
        warning?: string | null;
        item?: ManagementReport;
        notificationDelivered?: boolean;
      };
      if (!res.ok) throw new Error(body.error ?? "Unable to update this submission.");
      if (body.warning || body.notificationDelivered === false) {
        showToast(body.warning || "Saved, but the notification did not send.", "error");
      } else {
        showToast("Saved.", "success");
      }
      setResponse("");
      setInternalNote("");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update this submission.", "error");
    } finally {
      setBusy(false);
    }
  }

  const status = report ? canonicalSupportStatus(report.admin_status ?? report.status) : "New";
  const waiting = report ? attentionFlag(report) : null;
  const visibleThread = (report?.comments ?? []).filter((entry) => entry.visibility === "visible_to_submitter");
  const internalThread = (report?.comments ?? []).filter((entry) => entry.visibility === "internal");

  return (
    <div className="support-workspace">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Complaints & Requests</h2>
          <p className="admin-page-subtitle">See what needs attention, acknowledge it, reply to the employee, and track it until it is resolved.</p>
        </div>
        <button type="button" className="crossover-btn crossover-btn--outline inline-flex items-center gap-2" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </header>

      <div className="support-workspace__stats">
        <Stat label="New" value={counts.fresh} active={statusFilter === "new"} onClick={() => setStatusFilter("new")} />
        <Stat label="Awaiting acknowledgment" value={counts.waitingAck} active={statusFilter === "new"} onClick={() => setStatusFilter("new")} />
        <Stat label="In progress" value={counts.inProgress} active={statusFilter === "in_progress"} onClick={() => setStatusFilter("in_progress")} />
        <Stat label="Awaiting response" value={counts.waitingResponse} active={statusFilter === "waiting_response"} onClick={() => setStatusFilter("waiting_response")} />
        <Stat label="Resolved" value={counts.resolved} active={statusFilter === "resolved"} onClick={() => setStatusFilter("resolved")} />
        <Stat label="Urgent" value={counts.urgent} active={statusFilter === "urgent"} alert onClick={() => setStatusFilter("urgent")} />
      </div>

      <div className="support-workspace__filters">
        <FilterButton active={kind === "all" && statusFilter === "all"} onClick={() => { setKind("all"); setStatusFilter("all"); }}>All</FilterButton>
        <FilterButton active={kind === "complaint"} onClick={() => setKind("complaint")}>Complaints</FilterButton>
        <FilterButton active={kind === "request"} onClick={() => setKind("request")}>Requests</FilterButton>
        <FilterButton active={statusFilter === "new"} onClick={() => setStatusFilter("new")}>New</FilterButton>
        <FilterButton active={statusFilter === "urgent"} onClick={() => setStatusFilter("urgent")}>Urgent</FilterButton>
        <FilterButton active={statusFilter === "in_progress"} onClick={() => setStatusFilter("in_progress")}>In Progress</FilterButton>
        <FilterButton active={statusFilter === "resolved"} onClick={() => setStatusFilter("resolved")}>Resolved</FilterButton>
        <input
          className="admin-input min-w-[220px] flex-1"
          placeholder="Search employee, subject, date, or status"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {loading ? <p className="text-sm text-admin-muted">Loading submissions…</p> : null}

      <div className="support-workspace__layout">
        <div className="support-workspace__list">
          {visible.map((row) => {
            const flag = attentionFlag(row.report);
            return (
              <button
                key={row.id}
                type="button"
                className={`support-workspace__item ${selected?.id === row.id ? "is-selected" : ""}`}
                onClick={() => setSelectedId(row.id)}
              >
                <div className="support-workspace__item-top">
                  <span className={statusClass(row.status)}>{row.status}</span>
                  <span className={priorityClass(row.priority)}>{row.priority}</span>
                </div>
                <h3>{row.subject}</h3>
                <p>{row.item_type} · {row.submitted_by}</p>
                <div className="support-workspace__item-meta">
                  <span>{formatSupportWhen(row.date_submitted)}</span>
                  <span>{row.assigned_to ?? "Unassigned"}{flag ? ` · ${flag}` : ""}</span>
                </div>
              </button>
            );
          })}
          {!loading && !visible.length ? <p className="p-4 text-sm text-admin-muted">No submissions match this view.</p> : null}
        </div>

        <aside className="support-workspace__detail">
          {!report || !selected ? (
            <p className="text-sm text-admin-muted">Select a submission to review it.</p>
          ) : (
            <>
              <div>
                <p className="text-xs uppercase tracking-wide text-admin-muted">{selected.item_type}</p>
                <h3 className="mt-1 text-xl font-black text-white">{caseDisplayTitle(report)}</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={statusClass(status)}>{status}</span>
                  <span className={priorityClass(report.priority ?? "Normal")}>{report.priority ?? "Normal"}</span>
                  {waiting ? <span className="crossover-badge crossover-badge--urgent">{waiting}</span> : null}
                  {!report.management_notified_at ? <span className="crossover-badge crossover-badge--warning">Alert pending</span> : null}
                </div>
              </div>

              <dl className="support-workspace__facts">
                <Fact label="Employee" value={report.submitted_by_name ?? "Staff"} />
                <Fact label="Role" value={report.submitted_by_role ?? "staff"} />
                <Fact label="Submitted" value={formatSupportWhen(report.created_at)} />
                <Fact label="Updated" value={formatSupportWhen(report.updated_at)} />
                <Fact label="Assigned" value={report.assigned_to ?? "Unassigned"} />
                <Fact label="Acknowledged" value={report.acknowledged_by ? `${report.acknowledged_by} · ${formatSupportWhen(report.acknowledged_at ?? report.updated_at)}` : "Not yet"} />
                <Fact label="In progress" value={report.in_progress_by ? `${report.in_progress_by} · ${formatSupportWhen(report.in_progress_at ?? report.updated_at)}` : "Not yet"} />
                <Fact label="Resolved" value={report.resolved_by ? `${report.resolved_by} · ${formatSupportWhen(report.resolved_at ?? report.updated_at)}` : "Not yet"} />
              </dl>

              <div className="support-workspace__original">
                <p className="font-bold text-white">Original submission</p>
                <div className="mt-2 text-admin-muted">
                  <RichText value={report.groomer_submission_details?.description ?? report.summary} empty="No details provided." />
                </div>
              </div>

              <div className="grid gap-2">
                <p className="font-bold text-white">Conversation with employee</p>
                {visibleThread.length ? visibleThread.map((entry) => (
                  <article key={entry.id} className={`support-workspace__message ${entry.user_role === report.submitted_by_role ? "support-workspace__message--staff" : "support-workspace__message--management"}`}>
                    <p className="text-xs text-admin-muted">{entry.user_name} · {formatSupportWhen(entry.created_at)}</p>
                    <p className="mt-1 text-white">{entry.body}</p>
                  </article>
                )) : <p className="text-sm text-admin-muted">No messages sent to the employee yet.</p>}
              </div>

              <div className="grid gap-2">
                <p className="font-bold text-white">Internal notes</p>
                <p className="text-xs text-admin-muted">Visible to management only. Employees never see these.</p>
                {internalThread.map((entry) => (
                  <article key={entry.id} className="support-workspace__note">
                    <p className="text-xs text-admin-muted">{entry.user_name} · {formatSupportWhen(entry.created_at)}</p>
                    <p className="mt-1 text-white">{entry.body}</p>
                  </article>
                ))}
              </div>

              <div className="support-workspace__actions">
                <label className="grid gap-1">
                  <span className="admin-label">Priority</span>
                  <select
                    className="admin-input"
                    value={report.priority ?? "Normal"}
                    disabled={busy}
                    onChange={(event) => void run("change_priority", { priority: event.target.value })}
                  >
                    {SUPPORT_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="admin-label">Assign to</span>
                  <select className="admin-input" value={assigneeId} disabled={busy} onChange={(event) => setAssigneeId(event.target.value)}>
                    <option value="">Unassigned</option>
                    {assignees.map((person) => (
                      <option key={person.id} value={person.id}>{person.name} · {ROLE_LABEL[person.role] ?? person.role}</option>
                    ))}
                  </select>
                </label>
                <div className="support-workspace__action-row">
                  <button type="button" className="crossover-btn crossover-btn--primary" disabled={busy || status !== "New"} onClick={() => void run("acknowledge")}>Acknowledge</button>
                  <button type="button" className="crossover-btn crossover-btn--outline" disabled={busy || status === "In Progress"} onClick={() => void run("mark_in_progress")}>In progress</button>
                  <button type="button" className="crossover-btn crossover-btn--outline" disabled={busy} onClick={() => {
                    const person = assignees.find((entry) => entry.id === assigneeId);
                    void run("assign", { assigned_to: person?.name ?? "", assigned_to_user_id: person?.id ?? "" });
                  }}>Save assignment</button>
                  {!report.management_notified_at ? (
                    <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy} onClick={() => void run("retry_management_alert")}>Retry alert</button>
                  ) : null}
                  <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy} onClick={() => void run("resend_employee_notice")}>Resend notice</button>
                </div>
              </div>

              <label className="support-workspace__compose">
                <span className="admin-label">Message to employee</span>
                <textarea className="crossover-input min-h-28" value={response} disabled={busy} placeholder="Write the update the employee should see." onChange={(event) => setResponse(event.target.value)} />
                <div className="support-workspace__action-row">
                  <button type="button" className="crossover-btn crossover-btn--primary" disabled={busy || !response.trim()} onClick={() => void run("add_response", { body: response })}>Send to employee</button>
                  <button type="button" className="crossover-btn crossover-btn--outline" disabled={busy || !response.trim()} onClick={() => void run("add_response", { body: response, mark_resolved: true })}>Send and resolve</button>
                  <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy || status === "Resolved"} onClick={() => void run("change_status", { status: "Resolved", resolution: response })}>Mark resolved</button>
                </div>
              </label>

              <label className="support-workspace__compose">
                <span className="admin-label">Internal note</span>
                <textarea className="crossover-input min-h-20" value={internalNote} disabled={busy} placeholder="Private note for management. The employee will not see this." onChange={(event) => setInternalNote(event.target.value)} />
                <div className="support-workspace__action-row">
                  <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy || !internalNote.trim()} onClick={() => void run("add_internal_note", { body: internalNote })}>Save internal note</button>
                  <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy || status === "Closed"} onClick={() => {
                    if (window.confirm("Close this submission? The employee will be notified.")) void run("close");
                  }}>Close</button>
                </div>
              </label>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, active, alert, onClick }: { label: string; value: number; active: boolean; alert?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`support-workspace__stat ${active ? "is-active" : ""} ${alert ? "support-workspace__stat--alert" : ""}`} onClick={onClick}>
      <strong>{value}</strong>
      <span>{label}</span>
    </button>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className={`crossover-btn ${active ? "crossover-btn--active" : "crossover-btn--ghost"}`} onClick={onClick}>
      {children}
    </button>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

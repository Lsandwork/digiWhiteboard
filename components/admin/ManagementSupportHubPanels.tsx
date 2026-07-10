"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, MessageSquare, RefreshCw, UserRound } from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type { ManagementReport, ManagementReportType } from "@/lib/staff/management-reports";
import type { SupportHubStats, SupportInboxRow, TrainerEntryAdminRow } from "@/lib/staff/management-support-admin";

type HubPayload = {
  stats: SupportHubStats;
  items: SupportInboxRow[];
  currentUser: { email: string | null; role: string | null };
};

type TrainerEntriesPayload = {
  entries: TrainerEntryAdminRow[];
};

const STATUS_OPTIONS = ["Submitted", "In Review", "Needs More Info", "Resolved", "Closed"] as const;
const PRIORITY_OPTIONS = ["Normal", "High", "Urgent"] as const;

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function priorityBadgeClass(priority: string) {
  if (priority === "Urgent") return "crossover-badge crossover-badge--urgent";
  if (priority === "High") return "crossover-badge crossover-badge--warning";
  return "crossover-badge";
}

function statusBadgeClass(status: string) {
  if (status === "Submitted") return "crossover-badge crossover-badge--info";
  if (status === "In Review") return "crossover-badge crossover-badge--warning";
  if (status === "Needs More Info") return "crossover-badge crossover-badge--review";
  if (status === "Resolved") return "crossover-badge crossover-badge--resolved";
  return "crossover-badge";
}

function SupportDetailModal({
  item,
  open,
  busy,
  onClose,
  onAction
}: {
  item: ManagementReport | null;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onAction: (action: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [response, setResponse] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [status, setStatus] = useState("In Review");

  useEffect(() => {
    if (!item) return;
    const timer = window.setTimeout(() => {
      setAssignedTo(item.assigned_to ?? "");
      setStatus(item.admin_status ?? "Submitted");
      setResponse("");
      setInternalNote("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [item]);

  if (!item) return null;
  const details = item.groomer_submission_details?.description ?? item.summary;
  const internalComments = (item.comments ?? []).filter((c) => c.visibility === "internal");
  const visibleComments = (item.comments ?? []).filter((c) => c.visibility === "visible_to_submitter");

  return (
    <Modal open={open} title={item.title} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <p><span className="font-bold text-white">Submitted by:</span> {item.submitted_by_name ?? item.created_by}</p>
          <p><span className="font-bold text-white">Role:</span> {item.submitted_by_role ?? "staff"}</p>
          <p><span className="font-bold text-white">Department:</span> {item.department}</p>
          <p><span className="font-bold text-white">Type:</span> {item.item_type ?? "complaint"}</p>
          <p><span className="font-bold text-white">Priority:</span> <span className={priorityBadgeClass(item.priority ?? "Normal")}>{item.priority ?? "Normal"}</span></p>
          <p><span className="font-bold text-white">Status:</span> <span className={statusBadgeClass(item.admin_status ?? "Submitted")}>{item.admin_status ?? "Submitted"}</span></p>
        </div>
        <div className="rounded-xl border border-admin-border p-4">
          <p className="font-bold text-white">Details</p>
          <p className="mt-2 whitespace-pre-wrap text-admin-muted">{details}</p>
        </div>
        {item.management_response ? (
          <div className="rounded-xl border border-fitdog-orange/30 bg-fitdog-orange/10 p-4">
            <p className="font-bold text-white">Management Response</p>
            <p className="mt-2 text-admin-muted">{item.management_response}</p>
          </div>
        ) : null}
        {visibleComments.length ? (
          <div className="space-y-2">
            <p className="font-bold text-white">Visible Responses</p>
            {visibleComments.map((comment) => (
              <p key={comment.id} className="rounded-lg border border-admin-border p-3 text-admin-muted">
                <span className="font-bold text-white">{comment.user_name}:</span> {comment.body}
              </p>
            ))}
          </div>
        ) : null}
        {internalComments.length ? (
          <div className="space-y-2">
            <p className="font-bold text-white">Internal Notes</p>
            {internalComments.map((comment) => (
              <p key={comment.id} className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-3 text-admin-muted">
                <span className="font-bold text-white">{comment.user_name}:</span> {comment.body}
              </p>
            ))}
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1">
            <span className="admin-label">Assign to</span>
            <input className="admin-input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Admin or management user" />
          </label>
          <label className="grid gap-1">
            <span className="admin-label">Change status</span>
            <select className="admin-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
        <label className="grid gap-1">
          <span className="admin-label">Response visible to submitter</span>
          <textarea className="crossover-input min-h-24" value={response} onChange={(e) => setResponse(e.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className="admin-label">Internal note</span>
          <textarea className="crossover-input min-h-20" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy} onClick={() => void onAction("assign", { assigned_to: assignedTo })}>Assign</button>
          <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy} onClick={() => void onAction("change_status", { status })}>Update Status</button>
          {internalNote.trim() ? (
            <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy} onClick={() => void onAction("add_internal_note", { body: internalNote })}>Add Internal Note</button>
          ) : null}
          {response.trim() ? (
            <button type="button" className="crossover-btn crossover-btn--primary" disabled={busy} onClick={() => void onAction("add_response", { body: response })}>Send Response</button>
          ) : null}
          <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy} onClick={() => void onAction("mark_reviewed", {})}>Mark Reviewed</button>
          <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy} onClick={() => void onAction("close", {})}>Close</button>
          <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy} onClick={() => void onAction("reopen", {})}>Reopen</button>
        </div>
      </div>
    </Modal>
  );
}

function SupportFilters({
  filters,
  setFilters
}: {
  filters: Record<string, string>;
  setFilters: (next: Record<string, string>) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
      <input className="admin-input md:col-span-2" placeholder="Search subject, details, names…" value={filters.query ?? ""} onChange={(e) => setFilters({ ...filters, query: e.target.value })} />
      <select className="admin-input" value={filters.department ?? ""} onChange={(e) => setFilters({ ...filters, department: e.target.value })}>
        <option value="">All departments</option>
        <option value="Grooming">Grooming</option>
        <option value="Training">Training</option>
        <option value="Front Desk">Front Desk</option>
        <option value="Other">Other</option>
      </select>
      <select className="admin-input" value={filters.item_type ?? ""} onChange={(e) => setFilters({ ...filters, item_type: e.target.value })}>
        <option value="">All types</option>
        <option value="Complaint">Complaint</option>
        <option value="Request">Request</option>
      </select>
      <select className="admin-input" value={filters.priority ?? ""} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}>
        <option value="">All priorities</option>
        {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select className="admin-input" value={filters.status ?? ""} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}

function SupportTable({
  rows,
  nameColumn,
  onView
}: {
  rows: SupportInboxRow[];
  nameColumn: string;
  onView: (row: SupportInboxRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="crossover-table w-full min-w-[1100px]">
        <thead>
          <tr>
            <th>Date</th>
            <th>{nameColumn}</th>
            <th>Subject</th>
            <th>Details</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Assigned</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDateTime(row.date_submitted)}</td>
              <td>{row.submitted_by}</td>
              <td>{row.subject}</td>
              <td className="max-w-xs truncate">{row.details_preview}</td>
              <td><span className={priorityBadgeClass(row.priority)}>{row.priority}</span></td>
              <td><span className={statusBadgeClass(row.status)}>{row.status}</span></td>
              <td>{row.assigned_to ?? "—"}</td>
              <td>{formatDateTime(row.last_updated)}</td>
              <td>
                <button type="button" className="crossover-link-btn inline-flex items-center gap-1" onClick={() => onView(row)}>
                  <Eye className="h-4 w-4" /> View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? <p className="mt-4 text-sm text-admin-muted">No items match the current filters.</p> : null}
    </div>
  );
}

function useSupportHub(reportType?: ManagementReportType, cardFilter?: string) {
  const { showToast } = useToast();
  const [data, setData] = useState<HubPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<ManagementReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (reportType) params.set("report_type", reportType);
      if (cardFilter) params.set("card", cardFilter);
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const response = await fetch(`/api/admin/management-support-hub?${params.toString()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load support inbox.");
      setData(body as HubPayload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load support inbox.", "error");
    } finally {
      setLoading(false);
    }
  }, [cardFilter, filters, reportType, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function runAction(action: string, payload: Record<string, unknown>) {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/management-support-hub", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id: selected.id, ...payload, user_role: data?.currentUser.role ?? "admin" })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to update item.");
      showToast("Support item updated.", "success");
      setSelected(body.item as ManagementReport);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update item.", "error");
    } finally {
      setBusy(false);
    }
  }

  return { data, loading, busy, filters, setFilters, selected, setSelected, load, runAction };
}

export function ManagementSupportHubPanel({ onCardFilter }: { onCardFilter?: (card: string) => void }) {
  const hub = useSupportHub(undefined, undefined);
  const cards = useMemo(() => [
    { id: "new_complaints", label: "New Complaints", value: hub.data?.stats.new_complaints ?? 0 },
    { id: "new_requests", label: "New Requests", value: hub.data?.stats.new_requests ?? 0 },
    { id: "needs_review", label: "Needs Review", value: hub.data?.stats.needs_review ?? 0 },
    { id: "urgent_items", label: "Urgent Items", value: hub.data?.stats.urgent_items ?? 0 },
    { id: "open_items", label: "Open Items", value: hub.data?.stats.open_items ?? 0 },
    { id: "closed_this_week", label: "Closed This Week", value: hub.data?.stats.closed_this_week ?? 0 }
  ], [hub.data?.stats]);

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Management Support</h2>
          <p className="admin-page-subtitle">Review, assign, respond to, and track all groomer and trainer support submissions.</p>
        </div>
        <button type="button" className="crossover-btn crossover-btn--outline inline-flex items-center gap-2" onClick={() => void hub.load()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className="admin-card p-4 text-left transition hover:border-fitdog-orange/40"
            onClick={() => {
              hub.setFilters({ ...hub.filters, card: card.id });
              onCardFilter?.(card.id);
            }}
          >
            <p className="text-3xl font-black text-white">{card.value}</p>
            <p className="text-sm text-admin-muted">{card.label}</p>
          </button>
        ))}
      </div>

      <section className="crossover-card p-5 space-y-4">
        <h3 className="crossover-card__title">Support Inbox</h3>
        <SupportFilters filters={hub.filters} setFilters={hub.setFilters} />
        {hub.loading ? <p className="text-sm text-admin-muted">Loading inbox…</p> : null}
        <SupportTable rows={hub.data?.items ?? []} nameColumn="Submitted By" onView={(row) => hub.setSelected(row.report)} />
      </section>

      <SupportDetailModal open={Boolean(hub.selected)} item={hub.selected} busy={hub.busy} onClose={() => hub.setSelected(null)} onAction={hub.runAction} />
    </div>
  );
}

function AdminSupportListPage({
  title,
  subtitle,
  reportType,
  nameColumn
}: {
  title: string;
  subtitle: string;
  reportType: ManagementReportType;
  nameColumn: string;
}) {
  const hub = useSupportHub(reportType);
  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">{title}</h2>
          <p className="admin-page-subtitle">{subtitle}</p>
        </div>
        <button type="button" className="crossover-btn crossover-btn--outline inline-flex items-center gap-2" onClick={() => void hub.load()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </header>
      <section className="crossover-card p-5 space-y-4">
        <SupportFilters filters={hub.filters} setFilters={hub.setFilters} />
        {hub.loading ? <p className="text-sm text-admin-muted">Loading…</p> : null}
        <SupportTable rows={hub.data?.items ?? []} nameColumn={nameColumn} onView={(row) => hub.setSelected(row.report)} />
      </section>
      <SupportDetailModal open={Boolean(hub.selected)} item={hub.selected} busy={hub.busy} onClose={() => hub.setSelected(null)} onAction={hub.runAction} />
    </div>
  );
}

export function GroomerComplaintsAdminPanel() {
  return (
    <AdminSupportListPage
      title="Groomer Complaints"
      subtitle="Review complaints submitted by groomers, assign follow-up, and respond directly to the submitter."
      reportType="groomer_complaint"
      nameColumn="Groomer"
    />
  );
}

export function GroomerRequestsAdminPanel() {
  return (
    <AdminSupportListPage
      title="Groomer Requests"
      subtitle="Review requests submitted by groomers and track resolution status."
      reportType="groomer_request"
      nameColumn="Groomer"
    />
  );
}

export function TrainerComplaintsAdminPanel() {
  return (
    <AdminSupportListPage
      title="Trainer Complaints"
      subtitle="Review complaints submitted by trainers, assign follow-up, and respond directly to the submitter."
      reportType="trainer_complaint"
      nameColumn="Trainer"
    />
  );
}

export function TrainerRequestsAdminPanel() {
  return (
    <AdminSupportListPage
      title="Trainer Requests"
      subtitle="Review requests submitted by trainers and track resolution status."
      reportType="trainer_request"
      nameColumn="Trainer"
    />
  );
}

export function AdminTrainerEntriesPanel() {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<TrainerEntryAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/management-support-hub?view=trainer_entries", { cache: "no-store" });
      const body = (await response.json()) as TrainerEntriesPayload;
      if (!response.ok) throw new Error((body as { error?: string }).error ?? "Unable to load trainer entries.");
      setEntries(body.entries ?? []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load trainer entries.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) =>
      [entry.trainer_name, entry.subject, entry.details_preview, entry.dog_name, entry.owner_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [entries, query]);

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Trainer Entries</h2>
          <p className="admin-page-subtitle">View all shift log entries submitted through Trainer&apos;s Entry.</p>
        </div>
        <button type="button" className="crossover-btn crossover-btn--outline inline-flex items-center gap-2" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </header>
      <section className="crossover-card p-5 space-y-4">
        <input className="admin-input max-w-xl" placeholder="Search trainer, dog, owner, subject…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {loading ? <p className="text-sm text-admin-muted">Loading trainer entries…</p> : null}
        <div className="overflow-x-auto">
          <table className="crossover-table w-full min-w-[1000px]">
            <thead>
              <tr>
                <th>Date</th>
                <th>Trainer</th>
                <th>Entry Type</th>
                <th>Dog</th>
                <th>Owner</th>
                <th>Subject</th>
                <th>Priority</th>
                <th>Follow-Up</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id} className={entry.urgent ? "bg-red-500/10" : undefined}>
                  <td>{formatDateTime(entry.date_submitted)}</td>
                  <td>{entry.trainer_name}</td>
                  <td>{entry.entry_type}</td>
                  <td>{entry.dog_name ?? "—"}</td>
                  <td>{entry.owner_name ?? "—"}</td>
                  <td>{entry.subject}</td>
                  <td><span className={priorityBadgeClass(entry.priority)}>{entry.priority}</span></td>
                  <td>{entry.follow_up_needed ? "Yes" : "No"}</td>
                  <td>{entry.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !filtered.length ? <p className="mt-4 text-sm text-admin-muted">No trainer entries found.</p> : null}
        </div>
      </section>
    </div>
  );
}

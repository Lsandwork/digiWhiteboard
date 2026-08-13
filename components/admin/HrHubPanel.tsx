"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, FileText, RefreshCw, Search, ShieldAlert, Trash2, Upload } from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type { ManagementReport } from "@/lib/staff/management-reports";
import { STAFF_DEPARTMENTS, type StaffDirectoryMember } from "@/lib/staff/admin-ops";
import { buildHrHubStats, formatHrReportType, type HrRecord } from "@/lib/hr/records";

type HubPayload = {
  records: HrRecord[];
  stats: ReturnType<typeof buildHrHubStats>;
  currentUser?: { email: string | null; role: string | null };
};

const UPLOAD_DEPARTMENTS = [...STAFF_DEPARTMENTS, "Overnight", "Other"] as const;

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function kindBadge(kind: HrRecord["kind"]) {
  return kind === "write_up" ? "crossover-badge crossover-badge--warning" : "crossover-badge crossover-badge--urgent";
}

function statusBadge(status: string) {
  if (status === "Closed" || status === "Resolved") return "crossover-badge crossover-badge--resolved";
  if (status === "Needs Review" || status === "Needs More Info") return "crossover-badge crossover-badge--review";
  if (status === "In Review") return "crossover-badge crossover-badge--warning";
  return "crossover-badge crossover-badge--info";
}

function HrRecordDetailModal({
  report,
  open,
  onClose
}: {
  report: ManagementReport | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!report) return null;
  const writeUp = report.write_up_details;

  return (
    <Modal open={open} title={report.title} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <p><span className="font-bold text-white">Type:</span> {formatHrReportType(report.report_type, report.source === "hr_upload")}</p>
          <p><span className="font-bold text-white">Status:</span> {report.admin_status ?? report.status}</p>
          <p><span className="font-bold text-white">Created:</span> {formatWhen(report.created_at)}</p>
          <p><span className="font-bold text-white">Created by:</span> {report.created_by ?? "—"}</p>
        </div>

        {writeUp ? (
          <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <p><span className="font-bold text-white">Employee:</span> {writeUp.employee_name} ({writeUp.employee_department})</p>
            {writeUp.violation_types?.length ? (
              <p><span className="font-bold text-white">Violations:</span> {writeUp.violation_types.join(", ")}</p>
            ) : null}
            <p className="text-admin-muted">{writeUp.statement_of_violation}</p>
            {writeUp.text_report ? <pre className="warning-notice-text-report">{writeUp.text_report}</pre> : null}
            {writeUp.pdf_filename ? (
              <a
                className="crossover-btn crossover-btn--ghost inline-flex items-center gap-2"
                href={`/api/admin/write-ups/${report.id}/pdf`}
                download={writeUp.pdf_filename}
              >
                <FileText className="h-4 w-4" />
                {report.source === "hr_upload" ? "Download uploaded write-up" : "Download warning notice PDF"}
              </a>
            ) : null}
          </div>
        ) : (
          <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-admin-muted">
            {report.groomer_submission_details?.description ?? report.summary}
          </p>
        )}
      </div>
    </Modal>
  );
}

export function HrHubPanel({
  onOpenConsult,
  onOpenPip
}: {
  onOpenConsult?: (recordId: string) => void;
  onOpenPip?: () => void;
}) {
  const { showToast } = useToast();
  const [data, setData] = useState<HubPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "write_up" | "complaint">("all");
  const [detailReport, setDetailReport] = useState<ManagementReport | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const lastSelectedRowIndexRef = useRef<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [directory, setDirectory] = useState<StaffDirectoryMember[]>([]);
  const [uploadForm, setUploadForm] = useState({
    employee_name: "",
    employee_department: "",
    violation_date: "",
    documented_by: "",
    notes: ""
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/hr", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load HR records.");
      setData(body as HubPayload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load HR records.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/staff-operations", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (cancelled) return;
        const members = Array.isArray(body.staff_directory) ? (body.staff_directory as StaffDirectoryMember[]) : [];
        setDirectory(members.filter((member) => member.status === "Active"));
      } catch {
        // Directory picker is optional; names can still be typed.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const records = data?.records ?? [];
    const q = query.trim().toLowerCase();
    return records.filter((record) => {
      if (filter !== "all" && record.kind !== filter) return false;
      if (!q) return true;
      return [
        record.title,
        record.subject_name,
        record.department,
        record.summary,
        record.created_by
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [data, filter, query]);

  const pageRowIds = useMemo(() => filtered.map((row) => row.id), [filtered]);
  const allPageSelected = pageRowIds.length > 0 && pageRowIds.every((id) => selected.includes(id));
  const somePageSelected = pageRowIds.some((id) => selected.includes(id)) && !allPageSelected;

  useEffect(() => {
    lastSelectedRowIndexRef.current = null;
  }, [filter, query]);

  const toggleRowSelection = useCallback(
    (rowId: string, rowIndex: number, checked: boolean, shiftKey: boolean) => {
      setSelected((current) => {
        if (shiftKey && lastSelectedRowIndexRef.current !== null) {
          const anchor = lastSelectedRowIndexRef.current;
          const start = Math.min(anchor, rowIndex);
          const end = Math.max(anchor, rowIndex);
          const rangeIds = pageRowIds.slice(start, end + 1);
          return [...new Set([...current, ...rangeIds])];
        }
        lastSelectedRowIndexRef.current = rowIndex;
        return checked ? [...new Set([...current, rowId])] : current.filter((id) => id !== rowId);
      });
    },
    [pageRowIds]
  );

  const toggleSelectAllOnPage = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelected((current) => current.filter((id) => !pageRowIds.includes(id)));
        return;
      }
      setSelected((current) => [...new Set([...current, ...pageRowIds])]);
    },
    [pageRowIds]
  );

  function openUploadModal() {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
    setUploadForm({
      employee_name: "",
      employee_department: "",
      violation_date: today,
      documented_by: data?.currentUser?.email ?? "",
      notes: ""
    });
    setUploadFile(null);
    setUploadOpen(true);
  }

  function chooseDirectoryEmployee(name: string) {
    const member = directory.find((entry) => entry.name === name);
    setUploadForm((current) => ({
      ...current,
      employee_name: name,
      employee_department: member?.department || current.employee_department
    }));
  }

  async function submitUpload() {
    if (!uploadFile) {
      showToast("Choose a write-up file to upload.", "error");
      return;
    }
    if (!uploadForm.employee_name.trim()) {
      showToast("Employee name is required.", "error");
      return;
    }
    if (!uploadForm.employee_department.trim()) {
      showToast("Employee department is required.", "error");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", uploadFile);
      form.set("employee_name", uploadForm.employee_name.trim());
      form.set("employee_department", uploadForm.employee_department.trim());
      form.set("violation_date", uploadForm.violation_date.trim());
      form.set("documented_by", uploadForm.documented_by.trim());
      form.set("notes", uploadForm.notes.trim());

      const response = await fetch("/api/admin/hr/upload-write-up", {
        method: "POST",
        body: form
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to upload write-up.");
      showToast("Uploaded write-up added to HR Records.", "success");
      setUploadOpen(false);
      setUploadFile(null);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to upload write-up.", "error");
    } finally {
      setUploading(false);
    }
  }

  async function openDetail(id: string) {
    try {
      const response = await fetch(`/api/admin/hr?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load record.");
      setDetailReport(body.report as ManagementReport);
      setDetailOpen(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load record.", "error");
    }
  }

  async function copySelectedSummary() {
    const rows = filtered.filter((row) => selected.includes(row.id));
    if (!rows.length) {
      showToast("Select at least one HR record first.", "error");
      return;
    }
    const text = rows
      .map(
        (row) =>
          `${row.kind === "write_up" ? "Write-Up" : "Complaint"} | ${row.subject_name ?? "—"} | ${row.status} | ${row.title}`
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Copied ${rows.length} HR record${rows.length === 1 ? "" : "s"}.`, "success");
    } catch {
      showToast("Unable to copy selection.", "error");
    }
  }

  async function patchSelected(action: string, extra?: Record<string, string>) {
    if (!selected.length) {
      showToast("Select at least one HR record first.", "error");
      return;
    }
    setBusyAction(true);
    try {
      const response = await fetch("/api/admin/hr", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected, action, ...extra })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to update HR records.");
      showToast(`Updated ${body.updated ?? selected.length} record${selected.length === 1 ? "" : "s"}.`, "success");
      setSelected([]);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update HR records.", "error");
    } finally {
      setBusyAction(false);
    }
  }

  async function removeSelected() {
    if (!selected.length) return;
    const ok = window.confirm(
      `Remove ${selected.length} record${selected.length === 1 ? "" : "s"} from HR Records?\n\nThis hides them from this hub. Underlying write-ups/complaints are kept for documentation.`
    );
    if (!ok) return;
    await patchSelected("remove");
  }

  async function createPipFromSelected() {
    if (!selected.length) {
      showToast("Select at least one HR record first.", "error");
      return;
    }
    setBusyAction(true);
    try {
      const response = await fetch("/api/admin/hr/pip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_from_records", record_ids: selected })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to create PIP.");
      const count = Number(body.created || body.plans?.length || 0);
      showToast(
        `Created ${count} supportive PIP growth plan${count === 1 ? "" : "s"}. Open P.I.P to coach and refine.`,
        "success"
      );
      setSelected([]);
      onOpenPip?.();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to create PIP.", "error");
    } finally {
      setBusyAction(false);
    }
  }

  const stats = data?.stats;
  const selectedVisibleCount = pageRowIds.filter((id) => selected.includes(id)).length;
  const selectionDisabled = selected.length === 0 || busyAction;

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">HR Records</h2>
          <p className="admin-page-subtitle">
            All employee write-ups and workplace complaints in one place — including paper write-ups entered outside RuffOps.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="crossover-btn crossover-btn--primary inline-flex items-center gap-2"
            onClick={openUploadModal}
          >
            <Upload className="h-4 w-4" />
            Upload write-up
          </button>
          <button type="button" className="crossover-btn crossover-btn--ghost inline-flex items-center gap-2" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total records" value={stats.total} />
          <StatCard label="Write-ups" value={stats.write_ups} />
          <StatCard label="Complaints" value={stats.complaints} />
          <StatCard label="Open" value={stats.open} />
          <StatCard label="Urgent" value={stats.urgent} accent />
        </div>
      ) : null}

      <section className="crossover-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
            <input
              className="crossover-input w-full pl-10"
              placeholder="Search by name, department, summary…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "write_up", "complaint"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`crossover-btn ${filter === value ? "crossover-btn--active" : "crossover-btn--ghost"}`}
                onClick={() => setFilter(value)}
              >
                {value === "all" ? "All" : value === "write_up" ? "Write-Ups" : "Complaints"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="admin-ledger-bulk-bar sticky top-0 z-20 flex flex-wrap items-center gap-2 p-3">
        <label className="inline-flex items-center gap-2 text-sm admin-text-emphasis">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={allPageSelected}
            ref={(el) => {
              if (el) el.indeterminate = somePageSelected;
            }}
            onChange={(e) => toggleSelectAllOnPage(e.target.checked)}
            aria-label="Select all visible HR records"
          />
          <span>
            {selected.length > 0
              ? `${selected.length} selected${selectedVisibleCount !== selected.length ? ` (${selectedVisibleCount} visible)` : ""}`
              : "Select rows · Shift+click a second row to select the range"}
          </span>
        </label>
        <button
          type="button"
          className="crossover-btn crossover-btn--primary"
          disabled={selectionDisabled}
          onClick={() => void createPipFromSelected()}
        >
          Create PIP
        </button>
        <button
          type="button"
          className="crossover-btn crossover-btn--ghost"
          disabled={selectionDisabled}
          onClick={() => void patchSelected("set_status", { admin_status: "In Review" })}
        >
          Mark in review
        </button>
        <button
          type="button"
          className="crossover-btn crossover-btn--ghost"
          disabled={selectionDisabled}
          onClick={() => void patchSelected("set_status", { admin_status: "Resolved" })}
        >
          Mark resolved
        </button>
        <button
          type="button"
          className="crossover-btn crossover-btn--ghost"
          disabled={selectionDisabled}
          onClick={() => void patchSelected("set_priority", { priority: "Urgent" })}
        >
          Flag urgent
        </button>
        <button
          type="button"
          className="crossover-btn crossover-btn--ghost"
          disabled={selectionDisabled}
          onClick={() => void copySelectedSummary()}
        >
          Copy selected
        </button>
        {onOpenConsult && selected.length === 1 ? (
          <button
            type="button"
            className="crossover-btn crossover-btn--primary"
            disabled={busyAction}
            onClick={() => onOpenConsult(selected[0]!)}
          >
            Consult selected
          </button>
        ) : null}
        <button
          type="button"
          className="crossover-btn crossover-btn--ghost inline-flex items-center gap-1 text-red-300"
          disabled={selectionDisabled}
          onClick={() => void removeSelected()}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </button>
        {selected.length > 0 ? (
          <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => setSelected([])}>
            Clear selection
          </button>
        ) : null}
      </div>

      <section className="crossover-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="admin-table min-w-full">
            <thead>
              <tr>
                <th className="w-12">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageSelected;
                    }}
                    onChange={(e) => toggleSelectAllOnPage(e.target.checked)}
                    aria-label="Select all visible HR records"
                  />
                </th>
                <th>Type</th>
                <th>Subject</th>
                <th>Department</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((record, rowIndex) => {
                const isSelected = selected.includes(record.id);
                return (
                  <tr
                    key={record.id}
                    className={`admin-ledger-row ${isSelected ? "admin-ledger-row--selected" : ""}`}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        e.preventDefault();
                        toggleRowSelection(record.id, rowIndex, true, true);
                      }
                    }}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={isSelected}
                        aria-label={`Select HR record for ${record.subject_name ?? record.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (e.shiftKey) {
                            toggleRowSelection(record.id, rowIndex, true, true);
                            return;
                          }
                          toggleRowSelection(record.id, rowIndex, !isSelected, false);
                        }}
                      />
                    </td>
                    <td>
                      <span className={kindBadge(record.kind)}>
                        {record.kind === "write_up" ? (record.uploaded ? "Uploaded" : "Write-Up") : "Complaint"}
                      </span>
                      <p className="mt-1 text-xs text-admin-muted">{formatHrReportType(record.report_type, record.uploaded)}</p>
                    </td>
                    <td>
                      <p className="font-bold text-white">{record.subject_name ?? "—"}</p>
                      <p className="mt-1 max-w-xs truncate text-xs text-admin-muted">{record.title}</p>
                    </td>
                    <td>{record.department ?? "—"}</td>
                    <td><span className={statusBadge(record.status)}>{record.status}</span></td>
                    <td>{record.priority}</td>
                    <td className="whitespace-nowrap text-xs text-admin-muted">{formatWhen(record.created_at)}</td>
                    <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <button type="button" className="crossover-btn crossover-btn--ghost text-xs" onClick={() => void openDetail(record.id)}>
                          View
                        </button>
                        {onOpenConsult ? (
                          <button type="button" className="crossover-btn crossover-btn--primary text-xs" onClick={() => onOpenConsult(record.id)}>
                            Consult
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-admin-muted">No HR records match your filters yet.</p>
        ) : null}
      </section>

      <section className="crossover-card p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-[var(--crossover-gold)]" />
          <div>
            <h3 className="crossover-card__title">Confidential HR workspace</h3>
            <p className="mt-2 text-sm text-admin-muted">
              Records here include HR-tracked write-ups and formal complaints. Use HR Consult for guidance — it supports California context for Fitdog in Santa Monica but is not a substitute for licensed legal counsel.
            </p>
          </div>
        </div>
      </section>

      <HrRecordDetailModal report={detailReport} open={detailOpen} onClose={() => setDetailOpen(false)} />

      <Modal
        open={uploadOpen}
        title="Upload write-up"
        description="Use this for write-ups that were entered manually instead of creating them in RuffOps."
        onClose={() => !uploading && setUploadOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="crossover-btn crossover-btn--ghost"
              disabled={uploading}
              onClick={() => setUploadOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="crossover-btn crossover-btn--primary inline-flex items-center gap-2"
              disabled={uploading}
              onClick={() => void submitUpload()}
            >
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : "Upload write-up"}
            </button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <label className="block space-y-1">
            <span className="font-bold text-white">Employee</span>
            <input
              className="crossover-input w-full"
              list="hr-upload-employees"
              value={uploadForm.employee_name}
              onChange={(event) => chooseDirectoryEmployee(event.target.value)}
              placeholder="Name on the paper write-up"
            />
            <datalist id="hr-upload-employees">
              {directory.map((member) => (
                <option key={member.id} value={member.name} />
              ))}
            </datalist>
          </label>

          <label className="block space-y-1">
            <span className="font-bold text-white">Department</span>
            <select
              className="crossover-input w-full"
              value={uploadForm.employee_department}
              onChange={(event) => setUploadForm((current) => ({ ...current, employee_department: event.target.value }))}
            >
              <option value="">Select department</option>
              {UPLOAD_DEPARTMENTS.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="font-bold text-white">Date of write-up</span>
              <input
                className="crossover-input w-full"
                type="date"
                value={uploadForm.violation_date}
                onChange={(event) => setUploadForm((current) => ({ ...current, violation_date: event.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="font-bold text-white">Documented by</span>
              <input
                className="crossover-input w-full"
                value={uploadForm.documented_by}
                onChange={(event) => setUploadForm((current) => ({ ...current, documented_by: event.target.value }))}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="font-bold text-white">Notes (optional)</span>
            <textarea
              className="crossover-input min-h-[88px] w-full"
              value={uploadForm.notes}
              onChange={(event) => setUploadForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Short context if the scan doesn’t include it"
            />
          </label>

          <label className="block space-y-1">
            <span className="font-bold text-white">Write-up file</span>
            <input
              className="crossover-input w-full"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/*"
              onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-admin-muted">PDF or image, 8 MB or smaller.</p>
          </label>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`crossover-card p-4 ${accent ? "border-fitdog-orange/40" : ""}`}>
      <p className="text-xs uppercase tracking-wide text-admin-muted">{label}</p>
      <p className={`mt-2 text-3xl font-black ${accent ? "text-fitdog-orange" : "text-white"}`}>{value}</p>
    </div>
  );
}

export function HrConsultLauncherLink({ recordId }: { recordId?: string }) {
  const href = recordId ? `/admin?board=staff&tab=hr_consult&record=${encodeURIComponent(recordId)}` : "/admin?board=staff&tab=hr_consult";
  return (
    <a href={href} className="crossover-btn crossover-btn--ghost inline-flex items-center gap-2">
      <ExternalLink className="h-4 w-4" />
      Open HR Consult
    </a>
  );
}

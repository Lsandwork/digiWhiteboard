"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type { ManagementReport } from "@/lib/staff/management-reports";
import { buildHrHubStats, formatHrReportType, type HrRecord } from "@/lib/hr/records";

type HubPayload = {
  records: HrRecord[];
  stats: ReturnType<typeof buildHrHubStats>;
};

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
          <p><span className="font-bold text-white">Type:</span> {formatHrReportType(report.report_type)}</p>
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
                Download warning notice PDF
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

export function HrHubPanel({ onOpenConsult }: { onOpenConsult?: (recordId: string) => void }) {
  const { showToast } = useToast();
  const [data, setData] = useState<HubPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "write_up" | "complaint">("all");
  const [detailReport, setDetailReport] = useState<ManagementReport | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

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

  const stats = data?.stats;

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">HR Records</h2>
          <p className="admin-page-subtitle">
            All employee write-ups and workplace complaints in one place — write-ups, owner complaints, groomer and trainer complaints.
          </p>
        </div>
        <button type="button" className="crossover-btn crossover-btn--ghost inline-flex items-center gap-2" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
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

      <section className="crossover-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="admin-table min-w-full">
            <thead>
              <tr>
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
              {filtered.map((record) => (
                <tr key={record.id}>
                  <td>
                    <span className={kindBadge(record.kind)}>{record.kind === "write_up" ? "Write-Up" : "Complaint"}</span>
                    <p className="mt-1 text-xs text-admin-muted">{formatHrReportType(record.report_type)}</p>
                  </td>
                  <td>
                    <p className="font-bold text-white">{record.subject_name ?? "—"}</p>
                    <p className="mt-1 max-w-xs truncate text-xs text-admin-muted">{record.title}</p>
                  </td>
                  <td>{record.department ?? "—"}</td>
                  <td><span className={statusBadge(record.status)}>{record.status}</span></td>
                  <td>{record.priority}</td>
                  <td className="whitespace-nowrap text-xs text-admin-muted">{formatWhen(record.created_at)}</td>
                  <td className="whitespace-nowrap">
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
              ))}
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

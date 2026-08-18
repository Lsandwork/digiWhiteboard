"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Camera,
  CheckSquare,
  ClipboardList,
  Download,
  Footprints,
  HeartHandshake,
  LogIn,
  RefreshCw
} from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { defaultReportRange, formatPacificDate, formatPacificDateTime } from "@/lib/admin-reports/dates";
import type { NamedCountRow, ReportKind, ReportsPayload } from "@/lib/admin-reports/types";

type HubCard = {
  kind: ReportKind;
  title: string;
  detail: string;
  icon: typeof CheckSquare;
  overviewKey?: keyof NonNullable<ReportsPayload["overview"]>;
};

const HUB: HubCard[] = [
  {
    kind: "checklist",
    title: "Checklist completions",
    detail: "Shared RuffOps Checklist stamps — who completed what, by date.",
    icon: CheckSquare,
    overviewKey: "checklistCompletions"
  },
  {
    kind: "photos",
    title: "Photo uploads",
    detail: "How many pictures each person uploaded, searchable by date.",
    icon: Camera,
    overviewKey: "photosUploaded"
  },
  {
    kind: "logins",
    title: "Logins by day & week",
    detail: "How many times each user signed in per day and per week.",
    icon: LogIn,
    overviewKey: "logins"
  },
  {
    kind: "walks",
    title: "Walks Board",
    detail: "Physical whiteboard walk-check completions by person and date.",
    icon: Footprints,
    overviewKey: "walksCompleted"
  },
  {
    kind: "team_log",
    title: "Team Log",
    detail: "Shift log volume by author and note type.",
    icon: ClipboardList,
    overviewKey: "teamLogEntries"
  },
  {
    kind: "care",
    title: "Follow-ups, issues & support",
    detail: "Owner follow-ups, active issues, write-ups, and complaints.",
    icon: HeartHandshake,
    overviewKey: "supportItems"
  }
];

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const lines = [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function CountTable({ rows, left, right }: { rows: NamedCountRow[]; left: string; right: string }) {
  if (!rows.length) {
    return <p className="text-sm text-admin-muted">No rows in this date range.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="crossover-table w-full">
        <thead>
          <tr>
            <th>{left}</th>
            <th>{right}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportsPanel() {
  const { showToast } = useToast();
  const defaults = useMemo(() => defaultReportRange(), []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [kind, setKind] = useState<ReportKind>("overview");
  const [payload, setPayload] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (nextKind: ReportKind, nextFrom: string, nextTo: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ kind: nextKind, from: nextFrom, to: nextTo });
        const response = await fetch(`/api/admin/reports?${params.toString()}`, { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Unable to load reports.");
        setPayload(body as ReportsPayload);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load reports.", "error");
      } finally {
        setLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    void load(kind, from, to);
  }, [from, kind, load, to]);

  const overview = payload?.overview;
  const title = kind === "overview" ? "Reports" : HUB.find((item) => item.kind === kind)?.title ?? "Reports";

  function exportCurrent() {
    if (!payload) return;
    if (payload.kind === "photos" && payload.photos) {
      downloadCsv(
        `ruffops-photos-${from}-to-${to}.csv`,
        ["service_date", "uploaded_by", "filename", "category", "yard", "status", "created_at"],
        payload.photos.rows.map((row) => [row.serviceDate, row.userLabel, row.filename, row.category, row.yard, row.status, row.createdAt])
      );
      return;
    }
    if (payload.kind === "checklist" && payload.checklist) {
      downloadCsv(
        `ruffops-checklist-${from}-to-${to}.csv`,
        ["completed_at", "shift_date", "user", "source", "title"],
        payload.checklist.rows.map((row) => [row.completedAt, row.shiftDate, row.userLabel, row.source, row.title])
      );
      return;
    }
    if (payload.kind === "logins" && payload.logins) {
      downloadCsv(
        `ruffops-logins-by-day-${from}-to-${to}.csv`,
        ["date", "user", "logins"],
        payload.logins.byDay.map((row) => [row.dateKey, row.userLabel, row.count])
      );
      return;
    }
    if (payload.kind === "walks" && payload.walks) {
      downloadCsv(
        `ruffops-walks-${from}-to-${to}.csv`,
        ["shift_date", "hour", "status", "completed_by", "completed_at"],
        payload.walks.rows.map((row) => [row.shiftDate, row.hourLabel, row.status, row.userLabel, row.completedAt])
      );
      return;
    }
    if (payload.kind === "team_log" && payload.teamLog) {
      downloadCsv(
        `ruffops-team-log-${from}-to-${to}.csv`,
        ["created_at", "type", "subject", "user", "status", "priority"],
        payload.teamLog.rows.map((row) => [row.createdAt, row.logType, row.subject, row.userLabel, row.status, row.priority])
      );
      return;
    }
    if (payload.kind === "care" && payload.care) {
      downloadCsv(
        `ruffops-care-${from}-to-${to}.csv`,
        ["created_at", "kind", "title", "user", "status"],
        [...payload.care.followUps, ...payload.care.issues, ...payload.care.support].map((row) => [
          row.createdAt,
          row.kind,
          row.title,
          row.userLabel,
          row.status
        ])
      );
    }
  }

  return (
    <section className="crossover-card p-5">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-admin-ink">
            <BarChart3 className="h-5 w-5 text-fitdog-orange" />
            {title}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-admin-muted">
            Admin and Management reports from RuffOps data. Pick a date range, then open a report. Gingr remains the
            business system of record — these numbers are what happened inside RuffOps.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {kind !== "overview" ? (
            <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-admin-border px-3 py-1.5 text-sm" onClick={() => setKind("overview")}>
              <ArrowLeft className="h-4 w-4" />
              All reports
            </button>
          ) : null}
          <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-admin-border px-3 py-1.5 text-sm" onClick={() => void load(kind, from, to)}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          {kind !== "overview" ? (
            <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-admin-border px-3 py-1.5 text-sm" onClick={exportCurrent}>
              <Download className="h-4 w-4" />
              CSV
            </button>
          ) : null}
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-admin-muted">From</span>
          <input type="date" className="rounded-lg border border-admin-border bg-transparent px-3 py-1.5" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-admin-muted">To</span>
          <input type="date" className="rounded-lg border border-admin-border bg-transparent px-3 py-1.5" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <p className="pb-2 text-xs text-admin-muted">Pacific dates · {from} → {to}</p>
      </div>

      {loading && !payload ? <p className="text-sm text-admin-muted">Loading reports…</p> : null}

      {kind === "overview" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {HUB.map((card) => {
            const Icon = card.icon;
            const count = card.overviewKey && overview ? overview[card.overviewKey] : null;
            return (
              <button
                key={card.kind}
                type="button"
                onClick={() => setKind(card.kind)}
                className="rounded-2xl border border-fitdog-orange/40 bg-fitdog-orange/5 p-4 text-left hover:border-fitdog-orange"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-semibold text-admin-ink">
                    <Icon className="h-4 w-4 text-fitdog-orange" />
                    {card.title}
                  </span>
                  {count != null ? <span className="text-2xl font-black text-admin-ink">{count}</span> : null}
                </span>
                <span className="mt-2 block text-sm text-admin-muted">{card.detail}</span>
              </button>
            );
          })}
          {overview ? (
            <div className="rounded-2xl border border-admin-border p-4">
              <p className="font-semibold text-admin-ink">Range snapshot</p>
              <p className="mt-2 text-sm text-admin-muted">
                {overview.uniqueLogins} people signed in ({overview.logins} total logins). {overview.openFollowUps} open
                owner follow-ups. {overview.openIssues} open issues.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {kind === "checklist" && payload?.checklist ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Completions by person</h3>
              <CountTable rows={payload.checklist.totalsByUser} left="Person" right="Completed" />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">By source</h3>
              <CountTable rows={payload.checklist.totalsBySource} left="Source" right="Completed" />
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">By date</h3>
            <CountTable rows={payload.checklist.totalsByDate} left="Date" right="Completed" />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Timestamped completions</h3>
            <div className="overflow-x-auto">
              <table className="crossover-table w-full">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Person</th>
                    <th>Source</th>
                    <th>Item</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.checklist.rows.map((row) => (
                    <tr key={`${row.itemKey}-${row.completedAt}`}>
                      <td>{formatPacificDateTime(row.completedAt)}</td>
                      <td>{row.userLabel}</td>
                      <td>{row.source}</td>
                      <td>{row.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {kind === "photos" && payload?.photos ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Pictures by person</h3>
              <CountTable rows={payload.photos.totalsByUser} left="Uploader" right="Photos" />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Pictures by date</h3>
              <CountTable rows={payload.photos.totalsByDate} left="Service date" right="Photos" />
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Upload log</h3>
            <div className="overflow-x-auto">
              <table className="crossover-table w-full">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Uploader</th>
                    <th>File</th>
                    <th>Category</th>
                    <th>Yard</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.photos.rows.slice(0, 400).map((row, index) => (
                    <tr key={`${row.createdAt}-${row.filename}-${index}`}>
                      <td>{formatPacificDate(row.serviceDate)}</td>
                      <td>{row.userLabel}</td>
                      <td>{row.filename}</td>
                      <td>{row.category ?? "—"}</td>
                      <td>{row.yard ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {kind === "logins" && payload?.logins ? (
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Logins per person in this range</h3>
            <CountTable rows={payload.logins.totalsByUser} left="User" right="Logins" />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Per day</h3>
            <div className="overflow-x-auto">
              <table className="crossover-table w-full">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>User</th>
                    <th>Logins</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.logins.byDay.map((row) => (
                    <tr key={`${row.userKey}-${row.dateKey}`}>
                      <td>{row.dateLabel}</td>
                      <td>{row.userLabel}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Per week (Monday start, Pacific)</h3>
            <div className="overflow-x-auto">
              <table className="crossover-table w-full">
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>User</th>
                    <th>Logins</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.logins.byWeek.map((row) => (
                    <tr key={`${row.userKey}-${row.weekKey}`}>
                      <td>{row.weekLabel}</td>
                      <td>{row.userLabel}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Last login (all active users)</h3>
            <div className="overflow-x-auto">
              <table className="crossover-table w-full">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Last login</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.logins.lastLoginByUser.map((row) => (
                    <tr key={row.userLabel}>
                      <td>{row.userLabel}</td>
                      <td>{row.lastLoginAt ? formatPacificDateTime(row.lastLoginAt) : "Never"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {kind === "walks" && payload?.walks ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Completions by person</h3>
              <CountTable rows={payload.walks.totalsByUser} left="Person" right="Completed" />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">By date</h3>
              <CountTable rows={payload.walks.totalsByDate} left="Date" right="Completed" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="crossover-table w-full">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Alarm</th>
                  <th>Status</th>
                  <th>Completed by</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {payload.walks.rows.map((row, index) => (
                  <tr key={`${row.shiftDate}-${row.hourLabel}-${index}`}>
                    <td>{formatPacificDate(row.shiftDate)}</td>
                    <td>{row.hourLabel}</td>
                    <td>{row.status}</td>
                    <td>{row.userLabel}</td>
                    <td>{formatPacificDateTime(row.completedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {kind === "team_log" && payload?.teamLog ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Entries by person</h3>
              <CountTable rows={payload.teamLog.totalsByUser} left="Author" right="Entries" />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">By type</h3>
              <CountTable rows={payload.teamLog.totalsByType} left="Type" right="Entries" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="crossover-table w-full">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Subject</th>
                  <th>Author</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payload.teamLog.rows.map((row) => (
                  <tr key={`${row.createdAt}-${row.subject}`}>
                    <td>{formatPacificDateTime(row.createdAt)}</td>
                    <td>{row.logType}</td>
                    <td>{row.subject}</td>
                    <td>{row.userLabel}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {kind === "care" && payload?.care ? (
        <div className="space-y-6">
          <CountTable rows={payload.care.totals} left="Category" right="Count" />
          <div>
            <h3 className="mb-2 text-sm font-semibold">Owner follow-ups</h3>
            <CareTable rows={payload.care.followUps} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Active issues</h3>
            <CareTable rows={payload.care.issues} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Write-ups & support</h3>
            <CareTable rows={payload.care.support} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CareTable({
  rows
}: {
  rows: Array<{ createdAt: string; kind: string; title: string; userLabel: string; status: string }>;
}) {
  if (!rows.length) return <p className="text-sm text-admin-muted">None in this date range.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="crossover-table w-full">
        <thead>
          <tr>
            <th>When</th>
            <th>Kind</th>
            <th>Title</th>
            <th>Logged by</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.createdAt}-${row.title}-${index}`}>
              <td>{formatPacificDateTime(row.createdAt)}</td>
              <td>{row.kind}</td>
              <td>{row.title}</td>
              <td>{row.userLabel}</td>
              <td>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

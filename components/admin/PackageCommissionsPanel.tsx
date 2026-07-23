"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  MessageSquare,
  RefreshCw,
  Upload,
  X
} from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { SortableTh } from "@/components/admin/ui/sortable-table";
import { trainerRatePercentForPackage } from "@/lib/staff/commission-ledger/location-rate";
import { centsToDisplay, bpsToDisplay } from "@/lib/staff/commission-ledger/money";
import type { PackageCommissionRecord } from "@/lib/staff/commission-ledger/types";

type TrainerOption = { id: string; full_name: string; email: string };

type SummaryDisplay = {
  grossSales: string;
  totalCommissions: string;
  pendingReview: string;
  approved: string;
  readyForPayroll: string;
  paid: string;
  refunded: string;
  openQuestions: number;
};

type LedgerPayload = {
  rows: PackageCommissionRecord[];
  total: number;
  page: number;
  pageSize: number;
  summaryDisplay?: SummaryDisplay;
  trainers?: TrainerOption[];
  canManage: boolean;
  canComment: boolean;
  report?: CommissionReportPayload;
  currentUser?: {
    email: string | null;
    role: string | null;
    roleKey?: string | null;
    isTrainerOnly?: boolean;
    isSuperAdmin?: boolean;
  };
};

type TabKey =
  | "ledger"
  | "needs_review"
  | "approval"
  | "payroll"
  | "imports"
  | "rules"
  | "reports";

type CommissionReportPayload = {
  reportType: string;
  title: string;
  generatedAt: string;
  dateRange: { from: string | null; to: string | null; field: string };
  totals: {
    records: number;
    grossSales: string;
    commission: string;
    refund: string;
  };
  byTrainer: Array<{
    trainerName: string;
    trainerEmail: string | null;
    records: number;
    grossSales: string;
    commission: string;
  }>;
  byType: Array<{
    commissionType: string;
    records: number;
    grossSales: string;
    commission: string;
  }>;
  rows: PackageCommissionRecord[];
};

type ReportTypeKey =
  | "trainer_statement"
  | "package_summary"
  | "class_summary"
  | "pending_approval"
  | "refund_report"
  | "date_range";

function sourceLinkLabel(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("gingr")) return "Gingr";
    if (host.includes("fitdog.com") || host.includes("app.fitdog")) return "APP";
  } catch {
    /* fall through */
  }
  return "Source";
}

function statusPill(
  label: string,
  tone: "amber" | "green" | "sky" | "rose" | "slate" | "orange",
  large = false
) {
  const tones = {
    amber: "bg-amber-500/15 text-amber-100 border-amber-400/30",
    green: "bg-emerald-500/15 text-emerald-100 border-emerald-400/30",
    sky: "bg-sky-500/15 text-sky-100 border-sky-400/30",
    rose: "bg-rose-500/15 text-rose-100 border-rose-400/30",
    slate: "border-[var(--border)] bg-[var(--surface-hover)] text-[var(--text-secondary)]",
    orange: "bg-orange-500/15 text-orange-100 border-orange-400/30"
  };
  return (
    <span
      className={`inline-flex rounded-full border font-bold uppercase tracking-wide ${tones[tone]} ${
        large ? "px-3 py-1 text-base" : "px-2 py-0.5 text-[10px]"
      }`}
    >
      {label}
    </span>
  );
}

export function PackageCommissionsPanel({ embedded = false }: { embedded?: boolean }) {
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [data, setData] = useState<LedgerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkModal, setBulkModal] = useState<{
    action: string;
    label: string;
    requiresReason: boolean;
    ids: string[];
  } | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const lastSelectedRowIndexRef = useRef<number | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{
    record: PackageCommissionRecord;
    threads: unknown[];
    audit: unknown[];
  } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [commentField, setCommentField] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    trainer_user_id: "",
    trainer_name: "",
    trainer_email: "",
    sale_date: "",
    service_date: "",
    client_name: "",
    dog_name: "",
    commission_type: "package_sale",
    package_or_class: "",
    quantity: "1",
    gross_amount: "",
    discount_amount: "",
    commission_rate: "50",
    final_commission: "",
    is_manual_override: false,
    override_reason: "",
    internal_notes: ""
  });

  const tab = (searchParams.get("pcTab") as TabKey) || "ledger";
  const reportType = (searchParams.get("pcReport") as ReportTypeKey) || "trainer_statement";
  const page = Number(searchParams.get("page") ?? 1);
  const pageSizeParam = searchParams.get("pageSize") ?? "25";
  const pageSize = pageSizeParam === "all" ? 5000 : Number(pageSizeParam);
  const isViewAll = pageSizeParam === "all" || pageSize >= 5000;
  const q = searchParams.get("q") ?? "";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const trainerIds = searchParams.get("trainerIds") ?? "";
  const sortBy = searchParams.get("sortBy") ?? "sale_date";
  const sortDir = (searchParams.get("sortDir") === "asc" ? "asc" : "desc") as "asc" | "desc";

  const isTrainer = Boolean(data?.currentUser?.isTrainerOnly);
  const ledgerBodyText = isTrainer ? "text-2xl leading-snug" : "text-3xl leading-snug";
  const ledgerHeadText = isTrainer ? "text-base" : "text-lg";
  const ledgerTypeText = isTrainer ? "text-lg" : "text-xl";
  const ledgerPillLarge = !isTrainer;
  const ledgerCommentIcon = isTrainer ? "h-6 w-6" : "h-8 w-8";
  const canManage = Boolean(data?.canManage);
  const pageRowIds = useMemo(() => (data?.rows ?? []).map((row) => row.id), [data?.rows]);
  const allPageSelected = pageRowIds.length > 0 && pageRowIds.every((id) => selected.includes(id));
  const somePageSelected = pageRowIds.some((id) => selected.includes(id)) && !allPageSelected;

  const toggleRowSelection = useCallback(
    (rowId: string, rowIndex: number, checked: boolean, shiftKey: boolean) => {
      if (!canManage) return;
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
    [canManage, pageRowIds]
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

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (!next.get("board")) next.set("board", "staff");
      if (!next.get("tab")) next.set("tab", "package_commissions");
      router.replace(`${pathname}?${next.toString()}`);
    },
    [pathname, router, searchParams]
  );

  function toggleLedgerSort(column: string) {
    const nextDir =
      sortBy === column ? (sortDir === "asc" ? "desc" : "asc") : column.includes("date") || column.includes("cents") ? "desc" : "asc";
    setParams({ sortBy: column, sortDir: nextDir, page: "1" });
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", "ledger");
      if (tab === "ledger" || tab === "reports") {
        params.delete("reviewStatus");
        params.delete("approvalStatus");
      }
      if (tab === "needs_review") {
        params.set("reviewStatus", "needs_review,disputed");
        params.delete("approvalStatus");
      }
      if (tab === "approval") {
        params.set("approvalStatus", "pending");
        params.delete("reviewStatus");
      }
      if (tab === "rules" || tab === "payroll" || tab === "imports") {
        params.set("view", tab === "rules" ? "rules" : tab === "payroll" ? "payroll" : "imports");
      }
      if (tab === "reports") {
        params.set("view", "report");
        params.set("reportType", reportType);
        params.set("pageSize", "5000");
      }

      const response = await fetch(`/api/admin/package-commissions?${params.toString()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load commissions.");
      if (tab === "reports") {
        setData({
          rows: body.report?.rows ?? [],
          total: body.report?.rows?.length ?? 0,
          page: 1,
          pageSize: body.report?.rows?.length ?? 0,
          summaryDisplay: body.report
            ? {
                grossSales: body.report.totals.grossSales,
                totalCommissions: body.report.totals.commission,
                pendingReview: "$0.00",
                approved: "$0.00",
                readyForPayroll: "$0.00",
                paid: "$0.00",
                refunded: body.report.totals.refund,
                openQuestions: 0
              }
            : undefined,
          report: body.report,
          trainers: body.trainers ?? [],
          canManage: body.canManage ?? false,
          canComment: false,
          currentUser: data?.currentUser
        });
      } else if (tab === "ledger" || tab === "needs_review" || tab === "approval") {
        setData(body as LedgerPayload);
      } else {
        setData((current) => ({
          rows: current?.rows ?? [],
          total: current?.total ?? 0,
          page: current?.page ?? 1,
          pageSize: current?.pageSize ?? 25,
          summaryDisplay: current?.summaryDisplay,
          trainers: body.trainers ?? current?.trainers,
          canManage: body.canManage ?? current?.canManage ?? false,
          canComment: body.canComment ?? current?.canComment ?? false,
          currentUser: body.currentUser ?? current?.currentUser,
          // stash extras
          ...(body as object)
        }));
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load commissions.", "error");
    } finally {
      setLoading(false);
    }
  }, [searchParams, showToast, tab, reportType]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    setSelected([]);
    lastSelectedRowIndexRef.current = null;
  }, [page, tab]);

  async function postAction(payload: Record<string, unknown>) {
    const response = await fetch("/api/admin/package-commissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Request failed.");
    return body;
  }

  async function openDrawer(id: string) {
    setDrawerId(id);
    try {
      const response = await fetch(`/api/admin/package-commissions?view=record&id=${encodeURIComponent(id)}`, {
        cache: "no-store"
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load record.");
      setDrawer({ record: body.record, threads: body.threads ?? [], audit: body.audit ?? [] });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to open record.", "error");
      setDrawerId(null);
    }
  }

  const tabs = useMemo(() => {
    if (isTrainer) return [{ key: "ledger" as TabKey, label: "My Commissions" }];
    return [
      { key: "ledger" as TabKey, label: "Commission Ledger" },
      { key: "needs_review" as TabKey, label: "Needs Review" },
      { key: "approval" as TabKey, label: "Approval Queue" },
      { key: "payroll" as TabKey, label: "Payroll Periods" },
      { key: "imports" as TabKey, label: "CSV Imports" },
      { key: "rules" as TabKey, label: "Commission Rules" },
      { key: "reports" as TabKey, label: "Reports" }
    ];
  }, [isTrainer]);

  const summary = data?.summaryDisplay;

  const bulkActions = useMemo(
    () => [
      { action: "approve", label: "Approve", requiresReason: false },
      { action: "reject", label: "Reject", requiresReason: true },
      { action: "hold", label: "Put on Hold", requiresReason: true },
      { action: "mark_reviewed", label: "Mark Reviewed", requiresReason: false },
      { action: "ready_for_payroll", label: "Ready for Payroll", requiresReason: false },
      { action: "mark_paid", label: "Mark Paid", requiresReason: false },
      { action: "void", label: "Void", requiresReason: true }
    ],
    []
  );

  function openBulkModal(
    action: string,
    label: string,
    requiresReason: boolean,
    ids: string[] = selected
  ) {
    if (!ids.length) {
      showToast("Select one or more commission rows first.", "error");
      return;
    }
    setBulkReason("");
    setBulkModal({ action, label, requiresReason, ids });
  }

  async function confirmBulkAction() {
    if (!bulkModal || !bulkModal.ids.length) return;
    if (bulkModal.requiresReason && !bulkReason.trim()) {
      showToast("A reason is required for this action.", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await postAction({
        action: "bulk",
        bulk_action: bulkModal.action,
        ids: bulkModal.ids,
        reason: bulkModal.requiresReason ? bulkReason.trim() : undefined
      });
      const updated = result.results?.length ?? 0;
      const failed = result.errors?.length ?? 0;
      if (failed > 0) {
        showToast(`Updated ${updated} record(s). ${failed} could not be updated.`, "error");
      } else {
        showToast(`Updated ${updated} record(s).`, "success");
      }
      setSelected([]);
      setBulkModal(null);
      setBulkReason("");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Bulk update failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={embedded ? "" : "admin-page"}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={`font-black admin-text-emphasis ${isTrainer ? "text-lg" : "text-xl"}`}>
            {isTrainer ? "My Commissions" : "Package & Class Commissions"}
          </h2>
          <p className={`mt-1 text-admin-muted ${isTrainer ? "text-xs" : "text-sm"}`}>
            {isTrainer
              ? "Review your package and class earnings, ask questions on specific fields, and download statements."
              : "Ledger, approvals, payroll, CSV imports, rules, and trainer questions — fully integrated."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          {canManage ? (
            <>
              <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => setShowImport(true)}>
                <Upload className="h-4 w-4" /> Import CSV
              </button>
              <button
                type="button"
                className="crossover-btn crossover-btn--ghost"
                onClick={async () => {
                  setBusy(true);
                  try {
                    const body = await postAction({ action: "export_csv", filters: Object.fromEntries(searchParams.entries()) });
                    const blob = new Blob([body.csv ?? ""], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "commission-ledger.csv";
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (error) {
                    showToast(error instanceof Error ? error.message : "Export failed.", "error");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Download className="h-4 w-4" /> Export
              </button>
              <button type="button" className="crossover-btn crossover-btn--primary" onClick={() => setManualOpen(true)}>
                Add Record
              </button>
            </>
          ) : null}
        </div>
      </div>

      {summary ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {[
            ["Gross Sales", summary.grossSales],
            ["Total Commissions", summary.totalCommissions],
            ["Pending Review", summary.pendingReview],
            ["Approved", summary.approved],
            ["Ready for Payroll", summary.readyForPayroll],
            ["Paid", summary.paid],
            ["Refunded", summary.refunded],
            ["Open Questions", String(summary.openQuestions)]
          ].map(([label, value]) => (
            <div key={label} className="admin-surface-panel px-3 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-admin-muted">{label}</p>
              <p className={`mt-1 font-black admin-text-emphasis ${isTrainer ? "text-base" : "text-lg"}`}>{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={`crossover-btn ${tab === entry.key ? "crossover-btn--active" : "crossover-btn--ghost"}`}
            onClick={() => setParams({ pcTab: entry.key, page: "1" })}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {(tab === "ledger" || tab === "needs_review" || tab === "approval" || tab === "reports") && (
        <>
          <div className="admin-ledger-filter-bar mb-3 flex flex-wrap items-end gap-2 p-3">
            <label className="grid gap-1 text-xs">
              <span className="text-admin-muted">Search</span>
              <input
                className="admin-input min-w-[12rem]"
                defaultValue={q}
                placeholder="Client, dog, package…"
                onBlur={(e) => setParams({ q: e.target.value || null, page: "1" })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setParams({ q: (e.target as HTMLInputElement).value || null, page: "1" });
                  }
                }}
              />
            </label>
            {!isTrainer ? (
              <label className="grid gap-1 text-xs">
                <span className="text-admin-muted">Trainers (multi-select)</span>
                <select
                  className="admin-input min-h-[5.5rem]"
                  multiple
                  value={trainerIds ? trainerIds.split(",").filter(Boolean) : []}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
                    setParams({ trainerIds: values.length ? values.join(",") : null, page: "1" });
                  }}
                >
                  {(data?.trainers ?? []).map((trainer) => (
                    <option key={trainer.id} value={trainer.id}>
                      {trainer.full_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="grid gap-1 text-xs">
              <span className="text-admin-muted">From</span>
              <input
                type="date"
                className="admin-input"
                value={dateFrom}
                onChange={(e) => setParams({ dateFrom: e.target.value || null, page: "1" })}
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-admin-muted">To</span>
              <input
                type="date"
                className="admin-input"
                value={dateTo}
                onChange={(e) => setParams({ dateTo: e.target.value || null, page: "1" })}
              />
            </label>
            <button
              type="button"
              className="crossover-btn crossover-btn--ghost"
              onClick={() =>
                setParams({
                  q: null,
                  trainerIds: null,
                  dateFrom: null,
                  dateTo: null,
                  reviewStatus: null,
                  approvalStatus: null,
                  paymentStatus: null,
                  hasOpenComments: null,
                  page: "1"
                })
              }
            >
              <Filter className="h-4 w-4" /> Clear filters
            </button>
          </div>

          {tab !== "reports" ? (
          <>
          {canManage ? (
            <div className="admin-ledger-bulk-bar sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 p-3">
              <label className="inline-flex items-center gap-2 text-sm admin-text-emphasis">
                <input
                  type="checkbox"
                  className="h-6 w-6"
                  checked={allPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = somePageSelected;
                  }}
                  onChange={(e) => toggleSelectAllOnPage(e.target.checked)}
                  aria-label="Select all rows on this page"
                />
                <span>
                  {selected.length > 0
                    ? `${selected.length} selected`
                    : "Select rows · Shift+click a second row to select the range"}
                </span>
              </label>
              {bulkActions.map((entry) => (
                <button
                  key={entry.action}
                  type="button"
                  className="crossover-btn crossover-btn--ghost"
                  disabled={busy || selected.length === 0}
                  onClick={() => openBulkModal(entry.action, entry.label, entry.requiresReason)}
                >
                  {entry.label}
                </button>
              ))}
              {tab === "approval" && selected.length === 0 && pageRowIds.length > 0 ? (
                <button
                  type="button"
                  className="crossover-btn crossover-btn--primary"
                  disabled={busy}
                  onClick={() => openBulkModal("approve", "Approve all on page", false, pageRowIds)}
                >
                  Approve all on page
                </button>
              ) : null}
              {selected.length > 0 ? (
                <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => setSelected([])}>
                  Clear selection
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="admin-ledger-table-wrap">
            <table className="min-w-[1800px] w-full border-collapse text-left">
              <thead className="admin-ledger-table-head">
                <tr className={`border-b border-[var(--border)] uppercase tracking-wide text-admin-muted ${ledgerHeadText}`}>
                  {canManage ? (
                    <th className="px-4 py-4">
                      <input
                        type="checkbox"
                        className="h-6 w-6"
                        checked={allPageSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = somePageSelected;
                        }}
                        onChange={(e) => toggleSelectAllOnPage(e.target.checked)}
                        aria-label="Select all rows on this page"
                      />
                    </th>
                  ) : null}
                  <SortableTh className="px-4 py-4" label="Status" column="approval_status" sortKey={sortBy} sortDir={sortDir} onToggle={toggleLedgerSort} />
                  <SortableTh className="px-4 py-4" label="Trainer" column="trainer_name" sortKey={sortBy} sortDir={sortDir} onToggle={toggleLedgerSort} />
                  <SortableTh className="px-4 py-4" label="Sale Date" column="sale_date" sortKey={sortBy} sortDir={sortDir} onToggle={toggleLedgerSort} />
                  <SortableTh className="px-4 py-4" label="Client" column="client_name" sortKey={sortBy} sortDir={sortDir} onToggle={toggleLedgerSort} />
                  <SortableTh className="px-4 py-4" label="Dog" column="dog_name" sortKey={sortBy} sortDir={sortDir} onToggle={toggleLedgerSort} />
                  <SortableTh className="px-4 py-4" label="Type / Package" column="package_or_class" sortKey={sortBy} sortDir={sortDir} onToggle={toggleLedgerSort} />
                  <SortableTh className="px-4 py-4" label="Gross" column="gross_amount_cents" sortKey={sortBy} sortDir={sortDir} onToggle={toggleLedgerSort} />
                  <th className="px-4 py-4">Rate</th>
                  <SortableTh className="px-4 py-4" label="Final" column="final_commission_cents" sortKey={sortBy} sortDir={sortDir} onToggle={toggleLedgerSort} />
                  <SortableTh className="px-4 py-4" label="Source" column="source" sortKey={sortBy} sortDir={sortDir} onToggle={toggleLedgerSort} />
                  <th className="px-4 py-4">Comments</th>
                </tr>
              </thead>
              <tbody className={ledgerBodyText}>
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-admin-muted">
                      Loading commission ledger…
                    </td>
                  </tr>
                ) : !data?.rows?.length ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-admin-muted">
                      No commission records match these filters.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((row, rowIndex) => {
                    const isSelected = selected.includes(row.id);
                    return (
                    <tr
                      key={row.id}
                      className={`admin-ledger-row ${isSelected ? "admin-ledger-row--selected" : ""}`}
                      onClick={(e) => {
                        if (canManage && e.shiftKey) {
                          e.preventDefault();
                          toggleRowSelection(row.id, rowIndex, true, true);
                          return;
                        }
                        void openDrawer(row.id);
                      }}
                    >
                      {canManage ? (
                        <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="h-6 w-6"
                            checked={isSelected}
                            aria-label={`Select commission for ${row.dog_name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (e.shiftKey) {
                                toggleRowSelection(row.id, rowIndex, true, true);
                                return;
                              }
                              toggleRowSelection(row.id, rowIndex, !isSelected, false);
                            }}
                          />
                        </td>
                      ) : null}
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-2">
                          {statusPill(row.approval_status.replace(/_/g, " "), row.approval_status === "approved" ? "green" : row.approval_status === "rejected" ? "rose" : "amber", ledgerPillLarge)}
                          {statusPill(row.payment_status.replace(/_/g, " "), row.payment_status === "paid" ? "sky" : "slate", ledgerPillLarge)}
                          {row.review_status === "needs_review" || row.has_open_comments
                            ? statusPill("needs review", "orange", ledgerPillLarge)
                            : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 admin-text-emphasis">{row.trainer_name}</td>
                      <td className="px-4 py-4">{row.sale_date ?? "—"}</td>
                      <td className="px-4 py-4">{row.client_name}</td>
                      <td className="px-4 py-4 font-semibold admin-text-emphasis">{row.dog_name}</td>
                      <td className="px-4 py-4">
                        <div className={`uppercase text-admin-muted ${ledgerTypeText}`}>{row.commission_type.replace(/_/g, " ")}</div>
                        <div>{row.package_or_class}</div>
                      </td>
                      <td className="px-4 py-4">{centsToDisplay(row.gross_amount_cents)}</td>
                      <td className="px-4 py-4">{bpsToDisplay(row.commission_rate_bps) || "—"}</td>
                      <td className="px-4 py-4 font-bold text-fitdog-orange">{centsToDisplay(row.final_commission_cents)}</td>
                      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        {row.gingr_transaction_url ? (
                          <a
                            href={row.gingr_transaction_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-sky-300 underline decoration-sky-400/60 underline-offset-2 hover:text-sky-200"
                            title={row.gingr_transaction_url}
                          >
                            {sourceLinkLabel(row.gingr_transaction_url)}
                          </a>
                        ) : (
                          <span className="text-admin-muted">{row.source || "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {row.has_open_comments ? (
                          <span className="inline-flex items-center gap-2 text-amber-200">
                            <MessageSquare className={ledgerCommentIcon} /> Open
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-admin-muted">
            <span>
              {isViewAll
                ? `Showing all ${data?.total ?? 0} records`
                : `Page ${data?.page ?? page} · ${data?.total ?? 0} records`}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="crossover-btn crossover-btn--ghost"
                disabled={page <= 1 || isViewAll}
                onClick={() => setParams({ page: String(Math.max(1, page - 1)) })}
              >
                Previous
              </button>
              <button
                type="button"
                className="crossover-btn crossover-btn--ghost"
                disabled={isViewAll || (data?.page ?? 1) * (data?.pageSize ?? 25) >= (data?.total ?? 0)}
                onClick={() => setParams({ page: String(page + 1) })}
              >
                Next
              </button>
              {!isViewAll ? (
                <button
                  type="button"
                  className="crossover-btn crossover-btn--ghost"
                  onClick={() => setParams({ pageSize: "all", page: "1" })}
                >
                  View all
                </button>
              ) : (
                <button
                  type="button"
                  className="crossover-btn crossover-btn--ghost"
                  onClick={() => setParams({ pageSize: "25", page: "1" })}
                >
                  Paged view
                </button>
              )}
            </div>
          </div>
          </>
          ) : null}
        </>
      )}

      {tab === "reports" && !isTrainer ? (
        <ReportsTab
          report={data?.report ?? null}
          reportType={reportType}
          loading={loading}
          busy={busy}
          filters={Object.fromEntries(searchParams.entries())}
          onReportTypeChange={(next) => setParams({ pcReport: next })}
          onExport={async () => {
            setBusy(true);
            try {
              const body = await postAction({
                action: "export_csv",
                report_type: reportType,
                filters: Object.fromEntries(searchParams.entries())
              });
              const blob = new Blob([body.csv ?? ""], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `commission-report-${reportType}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              showToast("Report exported.", "success");
            } catch (error) {
              showToast(error instanceof Error ? error.message : "Export failed.", "error");
            } finally {
              setBusy(false);
            }
          }}
          onPrint={() => window.print()}
          onRefresh={() => void load()}
        />
      ) : null}

      {tab === "payroll" && canManage ? <PayrollTab onRefresh={() => void load()} /> : null}
      {tab === "imports" && canManage ? <ImportsTab onOpenImport={() => setShowImport(true)} /> : null}
      {tab === "rules" && canManage ? <RulesTab trainers={data?.trainers ?? []} /> : null}

      {/* Drawer */}
      {drawerId && drawer ? (
        <div className="admin-drawer-backdrop" onClick={() => { setDrawerId(null); setDrawer(null); }}>
          <aside
            className="admin-drawer-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black admin-text-emphasis">{drawer.record.dog_name}</h3>
                <p className="text-sm text-admin-muted">
                  {drawer.record.client_name} · {drawer.record.package_or_class}
                </p>
              </div>
              <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => { setDrawerId(null); setDrawer(null); }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
              <Info label="Trainer" value={drawer.record.trainer_name} />
              <Info label="Sale date" value={drawer.record.sale_date ?? "—"} />
              <Info label="Gross" value={centsToDisplay(drawer.record.gross_amount_cents)} />
              <Info label="Rate" value={bpsToDisplay(drawer.record.commission_rate_bps) || "—"} />
              <Info label="Calculated" value={centsToDisplay(drawer.record.calculated_commission_cents)} />
              <Info label="Final" value={centsToDisplay(drawer.record.final_commission_cents)} />
              <Info label="Approval" value={drawer.record.approval_status} />
              <Info label="Payment" value={drawer.record.payment_status} />
              <div className="col-span-2 rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-admin-muted">Source</div>
                {drawer.record.gingr_transaction_url ? (
                  <a
                    href={drawer.record.gingr_transaction_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block font-semibold text-sky-300 underline decoration-sky-400/60 underline-offset-2 hover:text-sky-200"
                  >
                    {sourceLinkLabel(drawer.record.gingr_transaction_url)} — open link
                  </a>
                ) : (
                  <div className="mt-1 font-semibold admin-text-emphasis">{drawer.record.source || "—"}</div>
                )}
              </div>
            </div>

            {data?.canComment ? (
              <div className="mb-4 rounded-xl border border-[var(--border)] p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-admin-muted">Ask about a field</p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {["final_commission", "gross_amount", "commission_rate", "sale_date", "client", "dog", "package_or_class"].map((field) => (
                    <button
                      key={field}
                      type="button"
                      className={`crossover-btn ${commentField === field ? "crossover-btn--active" : "crossover-btn--ghost"}`}
                      onClick={() => setCommentField(field)}
                    >
                      {field.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
                <textarea
                  className="crossover-input min-h-24"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Describe the question or correction request…"
                />
                <button
                  type="button"
                  className="crossover-btn crossover-btn--primary mt-2"
                  disabled={busy || !commentField || !commentBody.trim()}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await postAction({
                        action: "comment_cell",
                        record_id: drawer.record.id,
                        field_name: commentField,
                        body: commentBody
                      });
                      showToast("Comment submitted for review.", "success");
                      setCommentBody("");
                      setCommentField(null);
                      await openDrawer(drawer.record.id);
                      await load();
                    } catch (error) {
                      showToast(error instanceof Error ? error.message : "Unable to comment.", "error");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Submit comment
                </button>
              </div>
            ) : null}

            <section className="mb-4">
              <h4 className="mb-2 text-sm font-bold admin-text-emphasis">Comment threads</h4>
              {(drawer.threads as Array<Record<string, unknown>>).length === 0 ? (
                <p className="text-sm text-admin-muted">No comments yet.</p>
              ) : (
                (drawer.threads as Array<Record<string, unknown>>).map((thread) => (
                  <div key={String(thread.id)} className="mb-3 rounded-lg border border-[var(--border)] p-3 text-sm">
                    <div className="mb-1 flex justify-between gap-2">
                      <strong className="admin-text-emphasis">{String(thread.field_name).replace(/_/g, " ")}</strong>
                      {statusPill(String(thread.status).replace(/_/g, " "), thread.status === "resolved" ? "green" : "amber")}
                    </div>
                    <p className="text-xs text-admin-muted">Value when commented: {String(thread.field_value_at_comment ?? "—")}</p>
                    <ul className="mt-2 space-y-1">
                      {((thread.replies as Array<Record<string, unknown>>) ?? []).map((reply) => (
                        <li key={String(reply.id)} className="rounded bg-[var(--surface-hover)] px-2 py-1">
                          <span className="font-semibold admin-text-emphasis">{String(reply.author_name)}:</span> {String(reply.body)}
                        </li>
                      ))}
                    </ul>
                    {canManage && thread.status !== "resolved" ? (
                      <button
                        type="button"
                        className="crossover-btn crossover-btn--ghost mt-2"
                        onClick={async () => {
                          const note = window.prompt("Resolution note (required):") ?? "";
                          if (!note.trim()) return;
                          await postAction({
                            action: "comment_resolve",
                            thread_id: thread.id,
                            resolution_code: "other",
                            resolution_note: note
                          });
                          showToast("Thread resolved.", "success");
                          await openDrawer(drawer.record.id);
                          await load();
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4" /> Resolve
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </section>

            {canManage ? (
              <div className="mb-4 flex flex-wrap gap-2">
                <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => void postAction({ action: "approve", id: drawer.record.id }).then(load)}>
                  Approve
                </button>
                <button
                  type="button"
                  className="crossover-btn crossover-btn--ghost"
                  onClick={() => {
                    const reason = window.prompt("Rejection reason:") ?? "";
                    if (!reason.trim()) return;
                    void postAction({ action: "reject", id: drawer.record.id, reason }).then(load);
                  }}
                >
                  Reject
                </button>
                <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => void postAction({ action: "ready_for_payroll", id: drawer.record.id }).then(load)}>
                  Ready for payroll
                </button>
                <button type="button" className="crossover-btn crossover-btn--primary" onClick={() => void postAction({ action: "mark_paid", id: drawer.record.id }).then(load)}>
                  Mark paid
                </button>
                <button
                  type="button"
                  className="crossover-btn crossover-btn--ghost"
                  onClick={() => {
                    const amount = window.prompt("Refund amount (dollars):") ?? "";
                    const reason = window.prompt("Refund reason:") ?? "";
                    if (!amount || !reason.trim()) return;
                    void postAction({
                      action: "refund",
                      original_record_id: drawer.record.id,
                      amount,
                      reason
                    }).then(() => {
                      showToast("Refund adjustment created.", "success");
                      return load();
                    });
                  }}
                >
                  Process refund
                </button>
              </div>
            ) : null}

            <section>
              <h4 className="mb-2 text-sm font-bold admin-text-emphasis">Audit history</h4>
              <ul className="space-y-1 text-xs text-admin-muted">
                {(drawer.audit as Array<Record<string, unknown>>).slice(0, 40).map((event) => (
                  <li key={String(event.id)}>
                    {String(event.created_at)} · {String(event.action)}
                    {event.reason ? ` — ${String(event.reason)}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      ) : null}

      <Modal
        open={Boolean(bulkModal)}
        title={bulkModal ? `${bulkModal.label} (${bulkModal.ids.length} records)` : "Bulk action"}
        onClose={() => {
          setBulkModal(null);
          setBulkReason("");
        }}
      >
        <p className="mb-3 text-sm text-admin-muted">
          {bulkModal?.requiresReason
            ? "This action will apply to every selected commission row. A reason is required."
            : `Apply ${bulkModal?.label ?? "this action"} to ${bulkModal?.ids.length ?? 0} selected commission row(s)?`}
        </p>
        {bulkModal?.requiresReason ? (
          <textarea
            className="crossover-input min-h-24 w-full"
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            placeholder="Reason (required)"
          />
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="crossover-btn crossover-btn--ghost"
            onClick={() => {
              setBulkModal(null);
              setBulkReason("");
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="crossover-btn crossover-btn--primary"
            disabled={busy || (bulkModal?.requiresReason && !bulkReason.trim())}
            onClick={() => void confirmBulkAction()}
          >
            Confirm
          </button>
        </div>
      </Modal>

      <Modal open={showImport} title="Import Trainers Invoice CSV" onClose={() => setShowImport(false)}>
        <p className="mb-3 text-sm text-admin-muted">
          Upload a Gingr trainers invoice export or Fitdog commission CSV. Valid rows become editable ledger records.
        </p>
        <label className="mb-3 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-4 py-6">
          <FileSpreadsheet className="h-5 w-5 text-fitdog-orange" />
          <span className="text-sm font-semibold admin-text-emphasis">{csvFileName ?? "Choose CSV file"}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setCsvText(await file.text());
              setCsvFileName(file.name);
            }}
          />
        </label>
        <textarea className="crossover-input min-h-40 font-mono text-xs" value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="Paste CSV…" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => setShowImport(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="crossover-btn crossover-btn--primary"
            disabled={busy || !csvText.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const body = await postAction({ action: "import_csv", csv: csvText, filename: csvFileName ?? "paste.csv" });
                showToast(`Imported ${body.imported ?? 0} row(s).`, "success");
                setShowImport(false);
                setCsvText("");
                setCsvFileName(null);
                await load();
              } catch (error) {
                showToast(error instanceof Error ? error.message : "Import failed.", "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Import to ledger
          </button>
        </div>
      </Modal>

      <Modal open={manualOpen} title="Add commission record" onClose={() => setManualOpen(false)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="admin-label">Trainer</span>
            <select
              className="admin-input"
              value={manualForm.trainer_user_id}
              onChange={(e) => {
                const trainer = (data?.trainers ?? []).find((t) => t.id === e.target.value);
                setManualForm((f) => ({
                  ...f,
                  trainer_user_id: e.target.value,
                  trainer_name: trainer?.full_name ?? "",
                  trainer_email: trainer?.email ?? ""
                }));
              }}
            >
              <option value="">Select trainer</option>
              {(data?.trainers ?? []).map((trainer) => (
                <option key={trainer.id} value={trainer.id}>
                  {trainer.full_name}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["sale_date", "Sale date", "date"],
              ["service_date", "Service date", "date"],
              ["client_name", "Client", "text"],
              ["dog_name", "Dog", "text"],
              ["package_or_class", "Package / Class", "text"],
              ["gross_amount", "Gross amount", "text"],
              ["discount_amount", "Discount", "text"],
              ["commission_rate", "Rate %", "text"],
              ["final_commission", "Final commission (optional override)", "text"]
            ] as const
          ).map(([key, label, type]) => (
            <label key={key} className="grid gap-1 text-sm">
              <span className="admin-label">{label}</span>
              <input
                type={type}
                className="admin-input"
                value={manualForm[key]}
                onChange={(e) => {
                  const value = e.target.value;
                  setManualForm((f) => {
                    if (key === "package_or_class") {
                      return {
                        ...f,
                        package_or_class: value,
                        commission_rate: String(trainerRatePercentForPackage(value))
                      };
                    }
                    return { ...f, [key]: value };
                  });
                }}
              />
              {key === "commission_rate" ? (
                <span className="text-xs text-slate-400">
                  At-home packages/sessions: 70% trainer / 30% Fitdog. Facility: 50% / 50%.
                </span>
              ) : null}
            </label>
          ))}
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="admin-label">Internal notes</span>
            <textarea
              className="crossover-input min-h-20"
              value={manualForm.internal_notes}
              onChange={(e) => setManualForm((f) => ({ ...f, internal_notes: e.target.value }))}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => setManualOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="crossover-btn crossover-btn--primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const override = Boolean(manualForm.final_commission.trim());
                await postAction({
                  action: "create",
                  ...manualForm,
                  quantity: Number(manualForm.quantity || 1),
                  is_manual_override: override,
                  override_reason: override ? manualForm.override_reason || "Manual override on create" : null
                });
                showToast("Commission record created.", "success");
                setManualOpen(false);
                await load();
              } catch (error) {
                showToast(error instanceof Error ? error.message : "Unable to create record.", "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-admin-muted">{label}</p>
      <p className="admin-text-emphasis">{value}</p>
    </div>
  );
}

function PayrollTab({ onRefresh }: { onRefresh: () => void }) {
  const { showToast } = useToast();
  const [periods, setPeriods] = useState<Array<Record<string, unknown>>>([]);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/package-commissions?view=payroll", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to load payroll.");
    setPeriods(body.periods ?? []);
  }, []);

  useEffect(() => {
    void load().catch((error) => showToast(error instanceof Error ? error.message : "Payroll load failed.", "error"));
  }, [load, showToast]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] p-4">
        <h3 className="mb-3 font-bold admin-text-emphasis">Create payroll period</h3>
        <div className="flex flex-wrap gap-2">
          <input className="admin-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="date" className="admin-input" value={start} onChange={(e) => setStart(e.target.value)} />
          <input type="date" className="admin-input" value={end} onChange={(e) => setEnd(e.target.value)} />
          <button
            type="button"
            className="crossover-btn crossover-btn--primary"
            onClick={async () => {
              const response = await fetch("/api/admin/package-commissions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "payroll_create", name, start_date: start, end_date: end })
              });
              const body = await response.json();
              if (!response.ok) {
                showToast(body.error ?? "Unable to create period.", "error");
                return;
              }
              showToast("Payroll period created.", "success");
              setName("");
              await load();
              onRefresh();
            }}
          >
            Create
          </button>
        </div>
      </div>
      <div className="overflow-auto rounded-xl border border-[var(--border)]">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-admin-muted">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Dates</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={String(period.id)} className="border-b border-[var(--divider)]">
                <td className="px-3 py-2 admin-text-emphasis">{String(period.name)}</td>
                <td className="px-3 py-2">
                  {String(period.start_date)} → {String(period.end_date)}
                </td>
                <td className="px-3 py-2">{String(period.status)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {["under_review", "ready_for_payroll", "paid", "locked"].map((status) => (
                      <button
                        key={status}
                        type="button"
                        className="crossover-btn crossover-btn--ghost"
                        onClick={async () => {
                          const reason =
                            period.status === "locked"
                              ? window.prompt("Reason to change locked period (Super Admin):") ?? ""
                              : undefined;
                          const response = await fetch("/api/admin/package-commissions", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ action: "payroll_status", id: period.id, status, reason })
                          });
                          const body = await response.json();
                          if (!response.ok) showToast(body.error ?? "Failed", "error");
                          else {
                            showToast(`Period marked ${status}.`, "success");
                            await load();
                          }
                        }}
                      >
                        {status.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportsTab({ onOpenImport }: { onOpenImport: () => void }) {
  const { showToast } = useToast();
  const [batches, setBatches] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    void fetch("/api/admin/package-commissions?view=imports", { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (body.error) throw new Error(body.error);
        setBatches(body.batches ?? []);
      })
      .catch((error) => showToast(error instanceof Error ? error.message : "Unable to load imports.", "error"));
  }, [showToast]);

  return (
    <div className="space-y-3">
      <button type="button" className="crossover-btn crossover-btn--primary" onClick={onOpenImport}>
        <Upload className="h-4 w-4" /> Upload new CSV
      </button>
      <div className="overflow-auto rounded-xl border border-[var(--border)]">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-admin-muted">
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2">Uploaded</th>
              <th className="px-3 py-2">Imported</th>
              <th className="px-3 py-2">Failed</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => (
              <tr key={String(batch.id)} className="border-b border-[var(--divider)]">
                <td className="px-3 py-2 admin-text-emphasis">{String(batch.original_filename)}</td>
                <td className="px-3 py-2">{String(batch.uploaded_at)}</td>
                <td className="px-3 py-2">{String(batch.imported_rows)}</td>
                <td className="px-3 py-2">{String(batch.failed_rows)}</td>
                <td className="px-3 py-2">{String(batch.status)}</td>
                <td className="px-3 py-2">
                  {batch.status !== "undone" ? (
                    <button
                      type="button"
                      className="crossover-btn crossover-btn--ghost"
                      onClick={async () => {
                        if (!window.confirm("Undo this import? Unpaid imported rows will be archived.")) return;
                        const response = await fetch("/api/admin/package-commissions", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ action: "undo_import", batch_id: batch.id })
                        });
                        const body = await response.json();
                        if (!response.ok) showToast(body.error ?? "Undo failed.", "error");
                        else {
                          showToast(`Archived ${body.archived ?? 0} imported row(s).`, "success");
                          setBatches((current) =>
                            current.map((item) => (item.id === batch.id ? { ...item, status: "undone" } : item))
                          );
                        }
                      }}
                    >
                      Undo import
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RulesTab({ trainers }: { trainers: TrainerOption[] }) {
  const { showToast } = useToast();
  const [rules, setRules] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({ name: "", rate: "50", commission_type: "package_sale", calculation_type: "percentage_of_gross" });

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/package-commissions?view=rules", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to load rules.");
    setRules(body.rules ?? []);
  }, []);

  useEffect(() => {
    void load().catch((error) => showToast(error instanceof Error ? error.message : "Rules failed.", "error"));
  }, [load, showToast]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] p-4">
        <h3 className="mb-3 font-bold admin-text-emphasis">Create commission rule</h3>
        <div className="flex flex-wrap gap-2">
          <input className="admin-input" placeholder="Rule name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="admin-input" placeholder="Rate %" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
          <select className="admin-input" value={form.commission_type} onChange={(e) => setForm({ ...form, commission_type: e.target.value })}>
            <option value="package_sale">Package sale</option>
            <option value="group_class">Group class</option>
            <option value="private_session">Private session</option>
            <option value="evaluation">Evaluation</option>
            <option value="bonus">Bonus</option>
          </select>
          <button
            type="button"
            className="crossover-btn crossover-btn--primary"
            onClick={async () => {
              const response = await fetch("/api/admin/package-commissions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "rule_create", ...form })
              });
              const body = await response.json();
              if (!response.ok) showToast(body.error ?? "Unable to create rule.", "error");
              else {
                showToast("Rule created.", "success");
                setForm({ name: "", rate: "50", commission_type: "package_sale", calculation_type: "percentage_of_gross" });
                await load();
              }
            }}
          >
            Save rule
          </button>
        </div>
        <p className="mt-2 text-xs text-admin-muted">{trainers.length} trainers available for trainer-specific rules.</p>
      </div>
      <div className="overflow-auto rounded-xl border border-[var(--border)]">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-admin-muted">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Calc</th>
              <th className="px-3 py-2">Rate</th>
              <th className="px-3 py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={String(rule.id)} className="border-b border-[var(--divider)]">
                <td className="px-3 py-2 admin-text-emphasis">{String(rule.name)}</td>
                <td className="px-3 py-2">{String(rule.commission_type)}</td>
                <td className="px-3 py-2">{String(rule.calculation_type)}</td>
                <td className="px-3 py-2">{rule.rate_bps != null ? bpsToDisplay(Number(rule.rate_bps)) : "—"}</td>
                <td className="px-3 py-2">{rule.is_active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const REPORT_OPTIONS: { key: ReportTypeKey; label: string }[] = [
  { key: "trainer_statement", label: "Trainer Commission Statement" },
  { key: "package_summary", label: "Package Commission Summary" },
  { key: "class_summary", label: "Class Commission Summary" },
  { key: "pending_approval", label: "Pending Approval Report" },
  { key: "refund_report", label: "Refund and Reversal Report" },
  { key: "date_range", label: "Commission by Date Range" }
];

function ReportsTab({
  report,
  reportType,
  loading,
  busy,
  onReportTypeChange,
  onExport,
  onPrint,
  onRefresh
}: {
  report: CommissionReportPayload | null;
  reportType: ReportTypeKey;
  loading: boolean;
  busy: boolean;
  filters: Record<string, string>;
  onReportTypeChange: (type: ReportTypeKey) => void;
  onExport: () => void;
  onPrint: () => void;
  onRefresh: () => void;
}) {
  return (
    <div id="commission-report-print" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-4">
        <label className="grid gap-1 text-sm">
          <span className="text-admin-muted">Report type</span>
          <select
            className="admin-input min-w-[16rem]"
            value={reportType}
            onChange={(e) => onReportTypeChange(e.target.value as ReportTypeKey)}
          >
            {REPORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="crossover-btn crossover-btn--ghost" onClick={onRefresh} disabled={loading}>
            <RefreshCw className="h-4 w-4" /> Generate
          </button>
          <button type="button" className="crossover-btn crossover-btn--ghost" onClick={onExport} disabled={busy || !report?.rows?.length}>
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button type="button" className="crossover-btn crossover-btn--primary" onClick={onPrint} disabled={!report?.rows?.length}>
            Print report
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[var(--border)] p-8 text-admin-muted">Generating report…</div>
      ) : !report || report.rows.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] p-8 text-admin-muted">
          No commission records match the current filters. Adjust trainer or date filters above, then click Generate.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-4">
            <h3 className="text-lg font-black admin-text-emphasis">{report.title}</h3>
            <p className="mt-1 text-sm text-admin-muted">
              Generated {new Date(report.generatedAt).toLocaleString()}
              {report.dateRange.from || report.dateRange.to
                ? ` · ${report.dateRange.from ?? "…"} to ${report.dateRange.to ?? "…"} (${report.dateRange.field})`
                : ""}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Records", String(report.totals.records)],
                ["Gross Sales", report.totals.grossSales],
                ["Total Commission", report.totals.commission],
                ["Refunds", report.totals.refund]
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-[var(--border)] px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-admin-muted">{label}</p>
                  <p className="text-lg font-black admin-text-emphasis">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {report.byTrainer.length > 0 ? (
            <div className="overflow-auto rounded-xl border border-[var(--border)]">
              <h4 className="border-b border-[var(--border)] px-4 py-3 text-sm font-bold admin-text-emphasis">By trainer</h4>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-admin-muted">
                    <th className="px-3 py-2">Trainer</th>
                    <th className="px-3 py-2">Records</th>
                    <th className="px-3 py-2">Gross</th>
                    <th className="px-3 py-2">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byTrainer.map((row) => (
                    <tr key={`${row.trainerName}-${row.trainerEmail ?? ""}`} className="border-b border-[var(--divider)]">
                      <td className="px-3 py-2 admin-text-emphasis">
                        {row.trainerName}
                        {row.trainerEmail ? <span className="block text-xs text-admin-muted">{row.trainerEmail}</span> : null}
                      </td>
                      <td className="px-3 py-2">{row.records}</td>
                      <td className="px-3 py-2">{row.grossSales}</td>
                      <td className="px-3 py-2 font-semibold text-fitdog-orange">{row.commission}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="overflow-auto rounded-xl border border-[var(--border)]">
            <h4 className="border-b border-[var(--border)] px-4 py-3 text-sm font-bold admin-text-emphasis">Detail lines</h4>
            <table className="min-w-[1200px] w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-admin-muted">
                  <th className="px-3 py-2">Trainer</th>
                  <th className="px-3 py-2">Sale Date</th>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Dog</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Package / Class</th>
                  <th className="px-3 py-2">Gross</th>
                  <th className="px-3 py-2">Commission</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--divider)]">
                    <td className="px-3 py-2 admin-text-emphasis">{row.trainer_name}</td>
                    <td className="px-3 py-2">{row.sale_date ?? "—"}</td>
                    <td className="px-3 py-2">{row.client_name}</td>
                    <td className="px-3 py-2">{row.dog_name}</td>
                    <td className="px-3 py-2">{row.commission_type.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2">{row.package_or_class}</td>
                    <td className="px-3 py-2">{centsToDisplay(row.gross_amount_cents)}</td>
                    <td className="px-3 py-2 font-semibold text-fitdog-orange">{centsToDisplay(row.final_commission_cents)}</td>
                    <td className="px-3 py-2">
                      {row.approval_status} / {row.payment_status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

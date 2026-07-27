"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ExternalLink, RefreshCw, X } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { SortableTh } from "@/components/admin/ui/sortable-table";
import type {
  FitdogAlertType,
  FitdogIntegrationSettings,
  FitdogSyncRun,
  OperationsAlert,
  OperationsAlertActivity,
  OperationsAlertStatus,
  OperationsAlertSummary
} from "@/lib/fitdog-ops/types";
import {
  formatFitdogAlertType,
  formatOperationsAlertStatus,
  isClosedAlertStatus,
  isDeclinedPaymentAlert
} from "@/lib/fitdog-ops/display";
import { FITDOG_ALERT_TYPES, OPERATIONS_ALERT_STATUSES } from "@/lib/fitdog-ops/types";
import { formatUsd } from "@/lib/fitdog-ops/money";

type PanelView = "alerts" | "resolved" | "sync" | "settings";

type SummaryFocus =
  | "new"
  | "card_declined"
  | "other"
  | "failed"
  | "missed"
  | "resolved_today";

type AlertRow = OperationsAlert & { amount_due_label?: string };

const FAILED_PAYMENT_TYPES = new Set<string>([
  "PAYMENT_FAILED",
  "PAYMENT_PROCESSING_ERROR",
  "PAYMENT_RETRY_FAILED",
  "PAYMENT_ERROR"
]);

const SUMMARY_FOCUS_LABELS: Record<SummaryFocus, string> = {
  new: "New Alerts",
  card_declined: "Card Declined",
  other: "Other Alerts",
  failed: "Failed Payments",
  missed: "Missed Payments",
  resolved_today: "Resolved Today"
};

function startOfLocalDay(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function rowMatchesSummaryFocus(row: AlertRow, focus: SummaryFocus) {
  if (focus === "new") return row.status === "new";
  if (focus === "card_declined") return isDeclinedPaymentAlert(row);
  if (focus === "failed") return FAILED_PAYMENT_TYPES.has(String(row.alert_type));
  if (focus === "missed") return row.alert_type === "PAYMENT_MISSED";
  if (focus === "other") {
    // Residual open category: not declined / failed / missed
    return (
      !isDeclinedPaymentAlert(row) &&
      !FAILED_PAYMENT_TYPES.has(String(row.alert_type)) &&
      row.alert_type !== "PAYMENT_MISSED"
    );
  }
  if (focus === "resolved_today") {
    if (!row.resolved_at) return false;
    return new Date(row.resolved_at).getTime() >= startOfLocalDay().getTime();
  }
  return true;
}

function alertWasUpdated(row: Pick<OperationsAlert, "created_at" | "updated_at">) {
  if (!row.created_at || !row.updated_at) return false;
  return new Date(row.updated_at).getTime() - new Date(row.created_at).getTime() > 2000;
}

type AssignableUser = { id: string; name: string; email: string; role: string };

type ListPayload = {
  rows: Array<OperationsAlert & { amount_due_label?: string }>;
  total: number;
  summary: OperationsAlertSummary;
  settings: FitdogIntegrationSettings;
  assignableUsers: AssignableUser[];
  canManage?: boolean;
};

type DetailPayload = {
  alert: OperationsAlert;
  activity: OperationsAlertActivity[];
  payments: Array<Record<string, unknown>>;
  amount_due_label?: string;
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

function severityTone(severity: string) {
  if (severity === "critical") return "bg-rose-500/20 text-rose-100 border-rose-400/40";
  if (severity === "high") return "bg-orange-500/20 text-orange-100 border-orange-400/40";
  if (severity === "low") return "bg-emerald-500/15 text-emerald-100 border-emerald-400/30";
  return "bg-amber-500/15 text-amber-100 border-amber-400/30";
}

function statusTone(status: string) {
  if (isClosedAlertStatus(status) || status === "waived" || status === "false_positive") {
    return "bg-emerald-500/15 text-emerald-100 border-emerald-400/40";
  }
  if (status === "new") return "bg-rose-500/15 text-rose-100 border-rose-400/30";
  return "bg-sky-500/15 text-sky-100 border-sky-400/30";
}

function AlertSection({
  title,
  subtitle,
  rows,
  loading,
  sortBy,
  sortDir,
  onToggleSort,
  onOpen,
  emptyLabel,
  accent = false
}: {
  title: string;
  subtitle: string;
  rows: AlertRow[];
  loading: boolean;
  sortBy: string;
  sortDir: "asc" | "desc";
  onToggleSort: (column: string) => void;
  onOpen: (id: string) => void;
  emptyLabel: string;
  accent?: boolean;
}) {
  return (
    <section className={`admin-card ${accent ? "border-rose-400/40 ring-1 ring-rose-400/20" : ""}`}>
      <div className={`border-b border-admin-border px-4 py-3 ${accent ? "bg-rose-500/10" : ""}`}>
        <h3 className="text-base font-black text-white sm:text-lg">{title}</h3>
        <p className="text-sm text-admin-muted">{subtitle}</p>
      </div>

      {/* Mobile: stacked tappable cards (no horizontal scroll) */}
      <div className="space-y-2 p-3 md:hidden">
        {rows.map((row) => {
          const updated = alertWasUpdated(row);
          return (
            <button
              key={row.id}
              type="button"
              className="admin-table-card flex w-full flex-col gap-2 p-3 text-left transition hover:bg-white/[0.03] active:bg-white/[0.06]"
              onClick={() => onOpen(row.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-white">{row.owner_name}</p>
                  <p className="mt-0.5 truncate text-sm text-admin-muted">
                    {row.dog_name || "No dog"} · {formatFitdogAlertType(row.alert_type)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${severityTone(row.severity)}`}>
                    {row.severity}
                  </span>
                  <ChevronRight className="h-4 w-4 text-admin-muted" aria-hidden />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full border px-2 py-0.5 font-semibold tracking-wide ${statusTone(row.status)}`}>
                  {formatOperationsAlertStatus(row.status)}
                </span>
                {updated ? (
                  <span className="rounded-full border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 font-semibold text-sky-100">
                    Updated
                  </span>
                ) : (
                  <span className="rounded-full border border-admin-border px-2 py-0.5 font-semibold text-admin-muted">
                    New
                  </span>
                )}
                <span className="font-semibold text-white">
                  {row.amount_due_label || formatUsd(row.amount_due, row.currency)}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-admin-muted">
                <span>{formatWhen(row.detected_at)}</span>
                {row.service_name ? <span>{row.service_name}</span> : null}
                <span>{row.assigned_user_name || "Unassigned"}</span>
              </div>
              {row.failure_reason ? (
                <p className="line-clamp-2 text-xs text-admin-muted">{row.failure_reason}</p>
              ) : null}
            </button>
          );
        })}
        {!loading && !rows.length ? (
          <p className="px-2 py-6 text-center text-sm text-admin-muted">{emptyLabel}</p>
        ) : null}
        {loading && !rows.length ? (
          <p className="px-2 py-6 text-center text-sm text-admin-muted">Loading…</p>
        ) : null}
      </div>

      {/* Desktop: full table; entire row opens details */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-admin-border text-admin-muted">
              <SortableTh label="Priority" column="severity" sortKey={sortBy} sortDir={sortDir} onToggle={onToggleSort} />
              <SortableTh label="Detected" column="detected_at" sortKey={sortBy} sortDir={sortDir} onToggle={onToggleSort} />
              <th className="px-3 py-3 font-semibold">Alert Type</th>
              <th className="px-3 py-3 font-semibold">Owner</th>
              <th className="px-3 py-3 font-semibold">Dog</th>
              <th className="px-3 py-3 font-semibold">Service</th>
              <th className="px-3 py-3 font-semibold">Service Date</th>
              <SortableTh label="Amount Due" column="amount_due" sortKey={sortBy} sortDir={sortDir} onToggle={onToggleSort} />
              <th className="px-3 py-3 font-semibold">Details</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Updated</th>
              <th className="px-3 py-3 font-semibold">Assigned To</th>
              <th className="px-3 py-3 font-semibold">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const updated = alertWasUpdated(row);
              return (
                <tr
                  key={row.id}
                  className={`cursor-pointer border-b border-admin-border/60 hover:bg-white/[0.04] focus-visible:bg-white/[0.06] focus-visible:outline-none${
                    row.severity === "critical" || row.severity === "high" ? " fitdog-alert-row--important" : ""
                  }`}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open alert for ${row.owner_name}`}
                  onClick={() => onOpen(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen(row.id);
                    }
                  }}
                >
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${severityTone(row.severity)}`}>
                      {row.severity}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-admin-muted">{formatWhen(row.detected_at)}</td>
                  <td className="px-3 py-3 font-medium text-white" title={row.alert_type}>
                    {formatFitdogAlertType(row.alert_type)}
                  </td>
                  <td className="px-3 py-3 text-white">{row.owner_name}</td>
                  <td className="px-3 py-3 text-admin-muted">{row.dog_name || "—"}</td>
                  <td className="px-3 py-3 text-admin-muted">{row.service_name || "—"}</td>
                  <td className="px-3 py-3 text-admin-muted">{formatWhen(row.service_date)}</td>
                  <td className="px-3 py-3 font-semibold text-white">
                    {row.amount_due_label || formatUsd(row.amount_due, row.currency)}
                  </td>
                  <td
                    className={`px-3 py-3 text-admin-muted ${
                      row.severity === "critical" || row.severity === "high"
                        ? "max-w-[320px] whitespace-normal break-words"
                        : "max-w-[280px] truncate"
                    }`}
                    title={row.failure_reason || ""}
                  >
                    {row.failure_reason || "—"}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wide ${statusTone(row.status)}`}
                      title={row.status}
                    >
                      {formatOperationsAlertStatus(row.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {updated ? (
                      <span
                        className="rounded-full border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-100"
                        title={formatWhen(row.updated_at)}
                      >
                        Updated
                      </span>
                    ) : (
                      <span className="rounded-full border border-admin-border px-2 py-0.5 text-xs font-semibold text-admin-muted">
                        New
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-admin-muted">{row.assigned_user_name || "Unassigned"}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1 text-fitdog-orange">
                      Open <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </td>
                </tr>
              );
            })}
            {!loading && !rows.length ? (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-admin-muted">
                  {emptyLabel}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function FitdogAlertsPanel() {
  const { showToast } = useToast();
  const [panelView, setPanelView] = useState<PanelView>("alerts");
  const [summaryFocus, setSummaryFocus] = useState<SummaryFocus | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [history, setHistory] = useState<FitdogSyncRun[]>([]);
  const [drawer, setDrawer] = useState<DetailPayload | null>(null);
  const [note, setNote] = useState("");
  const [assignUserId, setAssignUserId] = useState("");
  const [q, setQ] = useState("");
  const [alertType, setAlertType] = useState<FitdogAlertType | "all">("all");
  const [status, setStatus] = useState<OperationsAlertStatus | "all">("all");
  const [assignedUserId, setAssignedUserId] = useState("all");
  const [owner, setOwner] = useState("");
  const [dog, setDog] = useState("");
  const [service, setService] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("detected_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [settingsForm, setSettingsForm] = useState({
    integration_mode: "api",
    sync_enabled: true,
    missed_payment_grace_minutes: 60,
    backfill_days: 365,
    reconciliation_days: 30,
    incremental_interval_minutes: 8,
    notes: ""
  });

  const listView = panelView === "resolved" ? "resolved" : "payment";
  const effectiveStatus = panelView === "resolved" && status !== "all" && !isClosedAlertStatus(status) ? "all" : status;

  const load = useCallback(async () => {
    if (panelView === "sync" || panelView === "settings") return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        listView,
        q,
        alertType,
        status: effectiveStatus,
        assignedUserId,
        owner,
        dog,
        service,
        unassignedOnly: unassignedOnly ? "1" : "0",
        dateFrom,
        dateTo,
        minAmount,
        sortBy: panelView === "resolved" && sortBy === "detected_at" ? "resolved_at" : sortBy,
        sortDir,
        page: "1",
        pageSize: panelView === "resolved" ? "100" : "50"
      });
      const res = await fetch(`/api/admin/fitdog-alerts?${params}`, { cache: "no-store" });
      const json = (await res.json()) as ListPayload & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load Fitdog alerts.");
      setData(json);
      setSettingsForm({
        integration_mode: json.settings.integration_mode,
        sync_enabled: json.settings.sync_enabled,
        missed_payment_grace_minutes: json.settings.missed_payment_grace_minutes,
        backfill_days: json.settings.backfill_days,
        reconciliation_days: json.settings.reconciliation_days,
        incremental_interval_minutes: json.settings.incremental_interval_minutes,
        notes: json.settings.notes || ""
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to load Fitdog alerts.", "error");
    } finally {
      setLoading(false);
    }
  }, [
    panelView,
    listView,
    q,
    alertType,
    effectiveStatus,
    assignedUserId,
    owner,
    dog,
    service,
    unassignedOnly,
    dateFrom,
    dateTo,
    minAmount,
    sortBy,
    sortDir,
    showToast
  ]);

  const loadSync = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/fitdog-alerts?view=sync", { cache: "no-store" });
      const json = (await res.json()) as {
        history?: FitdogSyncRun[];
        settings?: FitdogIntegrationSettings;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Unable to load sync history.");
      setHistory(json.history || []);
      if (json.settings) {
        setSettingsForm({
          integration_mode: json.settings.integration_mode,
          sync_enabled: json.settings.sync_enabled,
          missed_payment_grace_minutes: json.settings.missed_payment_grace_minutes,
          backfill_days: json.settings.backfill_days,
          reconciliation_days: json.settings.reconciliation_days,
          incremental_interval_minutes: json.settings.incremental_interval_minutes,
          notes: json.settings.notes || ""
        });
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load sync history.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (panelView === "sync" || panelView === "settings") void loadSync();
    else void load();
  }, [panelView, load, loadSync]);

  async function openDetail(id: string) {
    try {
      const res = await fetch(`/api/admin/fitdog-alerts?view=detail&id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = (await res.json()) as DetailPayload & { error?: string };
      if (!res.ok) throw new Error(json.error || "Unable to load alert.");
      setDrawer(json);
      setNote("");
      setAssignUserId(json.alert.assigned_user_id || "");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load alert.", "error");
    }
  }

  async function runAction(action: string, extra: Record<string, unknown> = {}) {
    if (!data?.canManage && panelView !== "sync") {
      showToast("You do not have permission to manage Fitdog alerts.", "error");
      return;
    }
    try {
      const res = await fetch("/api/admin/fitdog-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extra.alert_id || drawer?.alert.id ? { action, alert_id: drawer?.alert.id, ...extra } : { action, ...extra })
      });
      const json = (await res.json()) as { error?: string; run?: FitdogSyncRun };
      if (!res.ok) throw new Error(json.error || "Action failed.");
      if (action === "sync") {
        const detail =
          json.run?.status === "failed"
            ? json.run?.error_details || json.run?.message || "Unknown sync error"
            : null;
        showToast(
          detail
            ? `Sync failed: ${detail}`
            : `Sync ${json.run?.status}: ${json.run?.alerts_created ?? 0} created, ${json.run?.alerts_updated ?? 0} updated, ${json.run?.alerts_resolved ?? 0} resolved.`,
          json.run?.status === "failed" ? "error" : "success"
        );
      } else {
        showToast("Updated.", "success");
      }
      if (drawer?.alert.id) await openDetail(drawer.alert.id);
      if (panelView === "sync" || panelView === "settings") await loadSync();
      else await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Action failed.", "error");
    }
  }

  async function runSync(mode: "incremental" | "backfill" | "reconciliation" = "incremental") {
    setSyncing(true);
    try {
      await runAction("sync", { mode });
    } finally {
      setSyncing(false);
    }
  }

  const summary = data?.summary;
  const tabs: Array<{ id: PanelView; label: string }> = useMemo(
    () => [
      { id: "alerts", label: "Fitdog Alerts" },
      { id: "resolved", label: "Past Alerts" },
      { id: "sync", label: "Sync History" },
      { id: "settings", label: "Integration Settings" }
    ],
    []
  );

  const clearSummaryFocus = useCallback(() => {
    setSummaryFocus(null);
    setAlertType("all");
    setStatus("all");
  }, []);

  const applySummaryFocus = useCallback(
    (focus: SummaryFocus | "sync") => {
      if (focus === "sync") {
        setSummaryFocus(null);
        setPanelView("sync");
        return;
      }

      const nextFocus = summaryFocus === focus ? null : focus;
      setSummaryFocus(nextFocus);

      if (!nextFocus) {
        setAlertType("all");
        setStatus("all");
        if (panelView === "resolved") {
          setSortBy("resolved_at");
          setSortDir("desc");
        } else {
          setSortBy("detected_at");
          setSortDir("desc");
        }
        return;
      }

      setQ("");
      setAssignedUserId("all");
      setOwner("");
      setDog("");
      setService("");
      setMinAmount("");
      setUnassignedOnly(false);
      setDateFrom("");
      setDateTo("");

      if (nextFocus === "resolved_today") {
        setPanelView("resolved");
        setAlertType("all");
        setStatus("all");
        setSortBy("resolved_at");
        setSortDir("desc");
      } else {
        setPanelView("alerts");
        setSortBy("detected_at");
        setSortDir("desc");
        if (nextFocus === "new") {
          setAlertType("all");
          setStatus("new");
        } else if (nextFocus === "card_declined") {
          setAlertType("CARD_DECLINED");
          setStatus("all");
        } else if (nextFocus === "missed") {
          setAlertType("PAYMENT_MISSED");
          setStatus("all");
        } else {
          // failed / other: load open alerts, then filter client-side by category
          setAlertType("all");
          setStatus("all");
        }
      }

      window.setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    },
    [panelView, summaryFocus]
  );

  const allRows = useMemo(() => (data?.rows || []) as AlertRow[], [data?.rows]);

  const focusedRows = useMemo(() => {
    if (!summaryFocus) return allRows;
    return allRows.filter((row) => rowMatchesSummaryFocus(row, summaryFocus));
  }, [allRows, summaryFocus]);

  const declinedRows = useMemo(
    () => (summaryFocus ? focusedRows : allRows).filter((row) => isDeclinedPaymentAlert(row)),
    [allRows, focusedRows, summaryFocus]
  );
  const otherRows = useMemo(
    () => (summaryFocus ? focusedRows : allRows).filter((row) => !isDeclinedPaymentAlert(row)),
    [allRows, focusedRows, summaryFocus]
  );

  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fitdog-orange">Operations · Fitdog Alerts</p>
          <h2 className="mt-1 text-2xl font-black text-white">Fitdog Alerts</h2>
          <p className="mt-1 text-sm text-admin-muted">
            Card declines, payment errors, cancellations, vaccinations, and payment issues synced from app.fitdog.com.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="admin-btn-secondary min-h-11" onClick={() => void (panelView === "sync" ? loadSync() : load())} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {data?.canManage !== false ? (
            <button type="button" className="admin-btn-primary min-h-11" onClick={() => void runSync("incremental")} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
          ) : null}
        </div>
      </header>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`shrink-0 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
              panelView === tab.id
                ? "border-fitdog-orange bg-fitdog-orange/20 text-white"
                : "border-admin-border text-admin-muted hover:text-white"
            }`}
            onClick={() => {
              setSummaryFocus(null);
              setPanelView(tab.id);
              if (tab.id === "resolved") {
                setStatus("all");
                setAlertType("all");
                setSortBy("resolved_at");
                setSortDir("desc");
              } else if (tab.id === "alerts") {
                setStatus("all");
                setAlertType("all");
                setSortBy("detected_at");
                setSortDir("desc");
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {panelView !== "sync" && panelView !== "settings" ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-7">
            {(
              [
                { id: "new" as const, label: "New Alerts", value: summary?.new_alerts ?? 0 },
                {
                  id: "card_declined" as const,
                  label: "Card Declined",
                  value: summary?.card_declined ?? 0
                },
                {
                  id: "other" as const,
                  label: "Other Alerts",
                  value: summary?.other_notifications ?? otherRows.length
                },
                { id: "failed" as const, label: "Failed Payments", value: summary?.failed_payments ?? 0 },
                { id: "missed" as const, label: "Missed Payments", value: summary?.missed_payments ?? 0 },
                { id: "resolved_today" as const, label: "Resolved Today", value: summary?.resolved_today ?? 0 },
                {
                  id: "sync" as const,
                  label: "Last Fitdog Sync",
                  value: formatWhen(summary?.last_successful_sync_at),
                  wide: true,
                  sync: true
                }
              ] as const
            ).map((card) => {
              const active = card.id !== "sync" && summaryFocus === card.id;
              return (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => applySummaryFocus(card.id)}
                  aria-pressed={card.id === "sync" ? undefined : active}
                  title={
                    card.id === "sync"
                      ? "Open sync history"
                      : active
                        ? `Clear ${card.label} filter`
                        : `View ${card.label}`
                  }
                  className={`admin-card p-3 text-left transition sm:p-4 ${
                    "wide" in card && card.wide ? "col-span-2 lg:col-span-3 xl:col-span-1" : ""
                  } ${
                    active
                      ? "border-fitdog-orange ring-1 ring-fitdog-orange/40"
                      : "hover:border-fitdog-orange/50 hover:bg-white/[0.03]"
                  }`}
                >
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-admin-muted sm:text-xs">
                    {card.label}
                  </p>
                  <p
                    className={`mt-1.5 font-black text-white ${
                      "sync" in card && card.sync
                        ? "flex items-center gap-2 text-sm leading-snug sm:text-base"
                        : "text-xl sm:text-2xl"
                    }`}
                  >
                    <span className="min-w-0 break-words">{card.value}</span>
                    {"sync" in card && card.sync && summary?.last_successful_sync_at ? (
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-fitdog-orange"
                        title="Last successful sync"
                        aria-hidden
                      />
                    ) : null}
                  </p>
                  {card.id !== "sync" ? (
                    <p className="mt-1 text-[0.65rem] font-semibold text-fitdog-orange sm:text-xs">
                      {active ? "Showing · tap to clear" : "Tap to view"}
                    </p>
                  ) : (
                    <p className="mt-1 text-[0.65rem] font-semibold text-fitdog-orange sm:text-xs">Tap for sync history</p>
                  )}
                </button>
              );
            })}
          </div>

          {summaryFocus ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-fitdog-orange/35 bg-fitdog-orange/10 px-3 py-2 text-sm">
              <p className="font-semibold text-white">
                Showing <span className="text-fitdog-orange">{SUMMARY_FOCUS_LABELS[summaryFocus]}</span>
                <span className="ml-2 font-medium text-admin-muted">({focusedRows.length})</span>
              </p>
              <button type="button" className="admin-btn-secondary min-h-9 gap-1 px-3 text-xs" onClick={clearSummaryFocus}>
                <X className="h-3.5 w-3.5" />
                Clear filter
              </button>
            </div>
          ) : null}

          <div className="admin-card grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-4">
            <input
              className="admin-input min-h-11 sm:col-span-2 xl:col-span-1"
              placeholder="Search owner, dog, reason…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="admin-select min-h-11"
              value={alertType}
              onChange={(e) => {
                setSummaryFocus(null);
                setAlertType(e.target.value as FitdogAlertType | "all");
              }}
            >
              <option value="all">All alert types</option>
              {FITDOG_ALERT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <select
              className="admin-select min-h-11"
              value={effectiveStatus}
              onChange={(e) => {
                setSummaryFocus(null);
                setStatus(e.target.value as OperationsAlertStatus | "all");
              }}
            >
              <option value="all">{panelView === "resolved" ? "All resolved" : "All statuses"}</option>
              {(panelView === "resolved"
                ? OPERATIONS_ALERT_STATUSES.filter((value) => isClosedAlertStatus(value))
                : OPERATIONS_ALERT_STATUSES
              ).map((value) => (
                <option key={value} value={value}>
                  {formatOperationsAlertStatus(value)}
                  {isClosedAlertStatus(value) && value !== "resolved" ? ` (${value})` : ""}
                </option>
              ))}
            </select>
            <select className="admin-select min-h-11" value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)}>
              <option value="all">All assignees</option>
              <option value="unassigned">Unassigned</option>
              {(data?.assignableUsers || []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
            <input className="admin-input min-h-11" placeholder="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
            <input className="admin-input min-h-11" placeholder="Dog" value={dog} onChange={(e) => setDog(e.target.value)} />
            <input className="admin-input min-h-11" placeholder="Service" value={service} onChange={(e) => setService(e.target.value)} />
            <input className="admin-input min-h-11" placeholder="Min amount" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
            <input className="admin-input min-h-11" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <input className="admin-input min-h-11" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <label className="flex min-h-11 items-center gap-2 text-sm text-admin-muted">
              <input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} />
              Unassigned only
            </label>
          </div>

          <div ref={resultsRef} className="space-y-5">
            {summaryFocus ? (
              <AlertSection
                title={SUMMARY_FOCUS_LABELS[summaryFocus]}
                subtitle={
                  summaryFocus === "new"
                    ? "Open alerts that still need first acknowledgment."
                    : summaryFocus === "card_declined"
                      ? "Class cancellations caused by a declined credit card. Contact the customer to reschedule."
                      : summaryFocus === "failed"
                        ? "Failed charges, processing errors, and retry failures."
                        : summaryFocus === "missed"
                          ? "Payments that were missed past the grace window."
                          : summaryFocus === "resolved_today"
                            ? "Alerts marked resolved, paid, waived, or false positive today."
                            : "Cancellations, vaccinations, document uploads, and other non-declined alerts."
                }
                accent={summaryFocus === "card_declined" || summaryFocus === "failed" || summaryFocus === "new"}
                rows={focusedRows}
                loading={loading}
                sortBy={sortBy}
                sortDir={sortDir}
                onToggleSort={(column) => {
                  setSortBy(column);
                  setSortDir(sortBy === column && sortDir === "desc" ? "asc" : "desc");
                }}
                onOpen={(id) => void openDetail(id)}
                emptyLabel={`No ${SUMMARY_FOCUS_LABELS[summaryFocus].toLowerCase()} right now.`}
              />
            ) : panelView === "alerts" ? (
              <>
                <AlertSection
                  title="Card declined — call to reschedule"
                  subtitle="Class cancellations caused by a declined credit card. Contact the customer to reschedule."
                  accent
                  rows={declinedRows}
                  loading={loading}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onToggleSort={(column) => {
                    setSortBy(column);
                    setSortDir(sortBy === column && sortDir === "desc" ? "asc" : "desc");
                  }}
                  onOpen={(id) => void openDetail(id)}
                  emptyLabel="No open card-declined cancellations."
                />
                <AlertSection
                  title="Other Fitdog alerts"
                  subtitle="Cancellations, vaccinations, document uploads, and other payment issues."
                  rows={otherRows}
                  loading={loading}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onToggleSort={(column) => {
                    setSortBy(column);
                    setSortDir(sortBy === column && sortDir === "desc" ? "asc" : "desc");
                  }}
                  onOpen={(id) => void openDetail(id)}
                  emptyLabel="No other open Fitdog alerts."
                />
              </>
            ) : (
              <>
                <AlertSection
                  title="Past declined payments"
                  subtitle="Card declines and declined-payment cancellations marked RESOLVED."
                  accent
                  rows={declinedRows}
                  loading={loading}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onToggleSort={(column) => {
                    setSortBy(column);
                    setSortDir(sortBy === column && sortDir === "desc" ? "asc" : "desc");
                  }}
                  onOpen={(id) => void openDetail(id)}
                  emptyLabel="No past declined payments yet."
                />
                <AlertSection
                  title="Other past alerts"
                  subtitle="Failed payments, missed payments, notifications, and other closed Fitdog alerts — status RESOLVED."
                  rows={otherRows}
                  loading={loading}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onToggleSort={(column) => {
                    setSortBy(column);
                    setSortDir(sortBy === column && sortDir === "desc" ? "asc" : "desc");
                  }}
                  onOpen={(id) => void openDetail(id)}
                  emptyLabel="No other past alerts match these filters."
                />
              </>
            )}
          </div>
        </>
      ) : null}

      {panelView === "sync" ? (
        <div className="admin-card overflow-x-auto p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" className="admin-btn-primary" disabled={syncing} onClick={() => void runSync("incremental")}>
              Sync Now
            </button>
            <button type="button" className="admin-btn-secondary" disabled={syncing} onClick={() => void runSync("reconciliation")}>
              Run Reconciliation
            </button>
            <button type="button" className="admin-btn-secondary" disabled={syncing} onClick={() => void runSync("backfill")}>
              Run Backfill
            </button>
          </div>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-admin-border text-admin-muted">
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Trigger</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Scanned</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2">Resolved</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Message</th>
              </tr>
            </thead>
            <tbody>
              {history.map((run) => (
                <tr key={run.id} className="border-b border-admin-border/50">
                  <td className="px-3 py-2 text-admin-muted">{formatWhen(run.started_at)}</td>
                  <td className="px-3 py-2 text-white">{run.trigger}</td>
                  <td className="px-3 py-2 text-white">{run.mode}</td>
                  <td className="px-3 py-2 text-white">{run.status}</td>
                  <td className="px-3 py-2 text-admin-muted">{run.records_scanned}</td>
                  <td className="px-3 py-2 text-admin-muted">{run.alerts_created}</td>
                  <td className="px-3 py-2 text-admin-muted">{run.alerts_updated}</td>
                  <td className="px-3 py-2 text-admin-muted">{run.alerts_resolved}</td>
                  <td className="px-3 py-2 text-admin-muted">{run.duration_ms != null ? `${Math.round(run.duration_ms / 1000)}s` : "—"}</td>
                  <td className="px-3 py-2 text-admin-muted">{run.error_details || run.message || "—"}</td>
                </tr>
              ))}
              {!history.length ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-admin-muted">
                    No sync runs yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {panelView === "settings" ? (
        <div className="admin-card grid max-w-3xl gap-3 p-5">
          <label className="grid gap-1 text-sm">
            <span className="text-admin-muted">Integration mode</span>
            <select
              className="admin-select"
              value={settingsForm.integration_mode}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, integration_mode: e.target.value }))}
            >
              <option value="api">Fitdog activity API (recommended)</option>
              <option value="playwright">Playwright browser fallback</option>
              <option value="webhook">Webhook + pull reconciliation</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              checked={settingsForm.sync_enabled}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, sync_enabled: e.target.checked }))}
            />
            Sync enabled
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-admin-muted">Missed payment grace (minutes)</span>
            <input
              className="admin-input"
              type="number"
              value={settingsForm.missed_payment_grace_minutes}
              onChange={(e) =>
                setSettingsForm((prev) => ({ ...prev, missed_payment_grace_minutes: Number(e.target.value || 60) }))
              }
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-admin-muted">Backfill days</span>
              <input
                className="admin-input"
                type="number"
                value={settingsForm.backfill_days}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, backfill_days: Number(e.target.value || 365) }))}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-admin-muted">Reconciliation days</span>
              <input
                className="admin-input"
                type="number"
                value={settingsForm.reconciliation_days}
                onChange={(e) =>
                  setSettingsForm((prev) => ({ ...prev, reconciliation_days: Number(e.target.value || 30) }))
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-admin-muted">Incremental interval (min)</span>
              <input
                className="admin-input"
                type="number"
                value={settingsForm.incremental_interval_minutes}
                onChange={(e) =>
                  setSettingsForm((prev) => ({ ...prev, incremental_interval_minutes: Number(e.target.value || 8) }))
                }
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-admin-muted">Notes</span>
            <textarea
              className="admin-input min-h-24"
              value={settingsForm.notes}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </label>
          <p className="text-xs text-admin-muted">
            Credentials stay in server env vars (`FITDOG_EMPLOYEE_EMAIL`, `FITDOG_EMPLOYEE_PASSWORD`, `FITDOG_API_TOKEN`,
            `FITDOG_WEBHOOK_SECRET`). Sessions are encrypted at rest.
          </p>
          <button
            type="button"
            className="admin-btn-primary w-fit"
            onClick={() => void runAction("update_settings", settingsForm)}
          >
            Save settings
          </button>
        </div>
      ) : null}

      {drawer ? (
        <div className="admin-drawer-backdrop" onClick={() => setDrawer(null)}>
          <aside className="admin-drawer-panel" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-fitdog-orange">
                  {formatFitdogAlertType(drawer.alert.alert_type)}
                </p>
                <h3 className="mt-1 text-xl font-black text-white">{drawer.alert.owner_name}</h3>
                <p className="text-sm text-admin-muted">{drawer.alert.dog_name || "No dog listed"}</p>
                <p className="mt-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wide ${statusTone(drawer.alert.status)}`}
                    title={drawer.alert.status}
                  >
                    {formatOperationsAlertStatus(drawer.alert.status)}
                  </span>
                </p>
              </div>
              <button type="button" className="admin-btn-secondary" onClick={() => setDrawer(null)}>
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-2 text-sm">
              <p><span className="font-semibold text-white">Amount due:</span> {drawer.amount_due_label || formatUsd(drawer.alert.amount_due)}</p>
              <p><span className="font-semibold text-white">Service:</span> {drawer.alert.service_name || "—"} · {formatWhen(drawer.alert.service_date)}</p>
              <p><span className="font-semibold text-white">Failure reason:</span> {drawer.alert.failure_reason || "—"}</p>
              <p><span className="font-semibold text-white">Card:</span> {[drawer.alert.payment_method_brand, drawer.alert.payment_method_last_four ? `•••• ${drawer.alert.payment_method_last_four}` : null].filter(Boolean).join(" ") || "—"}</p>
              <p><span className="font-semibold text-white">Package/credit check:</span> {JSON.stringify(drawer.alert.package_credit_check || {})}</p>
              <p><span className="font-semibold text-white">Invoice:</span> {drawer.alert.invoice_id || "—"}</p>
              <p><span className="font-semibold text-white">Assigned:</span> {drawer.alert.assigned_user_name || "Unassigned"}</p>
              {drawer.alert.source_url ? (
                <a className="inline-flex items-center gap-1 text-fitdog-orange hover:underline" href={drawer.alert.source_url} target="_blank" rel="noreferrer">
                  Open in Fitdog <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {[
                ["acknowledge", "Acknowledge"],
                ["assign_to_me", "Assign to me"],
                ["owner_contacted", "Owner contacted"],
                ["awaiting_payment", "Awaiting payment"],
                ["record_manual_payment", "Record manual payment"],
                ["mark_paid", "Mark paid"],
                ["mark_waived", "Mark waived"],
                ["mark_false_positive", "False positive"],
                ["resolve", "Resolve"],
                ["reopen", "Reopen"],
                ["sync", "Run reconciliation"]
              ].map(([action, label]) => (
                <button
                  key={action}
                  type="button"
                  className="admin-btn-secondary min-h-11 justify-center text-sm"
                  onClick={() => void runAction(action === "sync" ? "sync" : action, action === "sync" ? { mode: "reconciliation" } : {})}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-2">
              <label className="grid gap-1 text-sm">
                <span className="text-admin-muted">Assign to</span>
                <div className="flex gap-2">
                  <select className="admin-select" value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)}>
                    <option value="">Unassigned</option>
                    {(data?.assignableUsers || []).map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="admin-btn-secondary"
                    onClick={() => {
                      const user = (data?.assignableUsers || []).find((item) => item.id === assignUserId);
                      void runAction("assign", {
                        assigned_user_id: assignUserId || null,
                        assigned_user_name: user?.name || null
                      });
                    }}
                  >
                    Assign
                  </button>
                </div>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-admin-muted">Add note</span>
                <textarea className="admin-input min-h-20" value={note} onChange={(e) => setNote(e.target.value)} />
                <button type="button" className="admin-btn-secondary w-fit" onClick={() => void runAction("add_note", { note })}>
                  Save note
                </button>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-admin-muted">Schedule follow-up</span>
                <input
                  className="admin-input"
                  type="datetime-local"
                  onChange={(e) => void runAction("schedule_follow_up", { follow_up_at: new Date(e.target.value).toISOString() })}
                />
              </label>
            </div>

            <div className="mt-5">
              <h4 className="font-semibold text-white">Payment attempt timeline</h4>
              <ul className="mt-2 space-y-2 text-sm text-admin-muted">
                {(drawer.payments || []).map((payment) => (
                  <li key={String(payment.id || payment.fitdog_transaction_id)} className="rounded-lg border border-admin-border p-2">
                    {String(payment.status)} · {formatUsd(payment.amount)} · {formatWhen(String(payment.attempted_at || payment.succeeded_at || ""))}
                    {payment.failure_reason ? ` · ${String(payment.failure_reason)}` : ""}
                  </li>
                ))}
                {!drawer.payments?.length ? <li>No linked payment attempts stored yet.</li> : null}
              </ul>
            </div>

            <div className="mt-5">
              <h4 className="font-semibold text-white">Audit history</h4>
              <ul className="mt-2 space-y-2 text-sm text-admin-muted">
                {(drawer.activity || []).map((item) => (
                  <li key={item.id} className="rounded-lg border border-admin-border p-2">
                    <span className="text-white">{item.activity_type}</span> · {item.message}
                    <div className="text-xs">{item.actor_name || "System"} · {formatWhen(item.created_at)}</div>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

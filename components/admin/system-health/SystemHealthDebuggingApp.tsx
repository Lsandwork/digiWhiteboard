"use client";

import { readResponseJson } from "@/lib/http/read-response-json";
import { humanizeUnknownError, LIVE_DATA_SLOW_MESSAGE } from "@/lib/safe-url";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type SectionId =
  | "overview"
  | "live"
  | "errors"
  | "route_audits"
  | "audit_issues"
  | "integrations"
  | "storage"
  | "api_logs"
  | "jobs"
  | "user_activity"
  | "system_events"
  | "debug_search"
  | "cursor_bridge"
  | "settings";

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "live", label: "Live Activity" },
  { id: "errors", label: "Errors" },
  { id: "route_audits", label: "Route Audits" },
  { id: "audit_issues", label: "Audit Issues" },
  { id: "integrations", label: "Integrations" },
  { id: "storage", label: "Cloud Storage" },
  { id: "api_logs", label: "API Logs" },
  { id: "jobs", label: "Background Jobs" },
  { id: "user_activity", label: "User Activity" },
  { id: "system_events", label: "System Events" },
  { id: "debug_search", label: "Debug Search" },
  { id: "cursor_bridge", label: "Cursor Debug Bridge" },
  { id: "settings", label: "Settings" }
];

const JOB_STATUSES = [
  "all",
  "queued",
  "running",
  "waiting_for_authentication",
  "completed",
  "completed_with_warnings",
  "failed",
  "cancelled"
] as const;

function statusClass(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "HEALTHY" || s === "PASS" || s === "PASSED" || s === "OPERATIONAL" || s === "TRUE" || s === "OK") {
    return "bg-emerald-500/20 text-emerald-200 border-emerald-400/30";
  }
  if (s === "WARNING" || s === "PASS_WITH_WARNINGS" || s === "WAITING_FOR_AUTHENTICATION") {
    return "bg-amber-500/20 text-amber-100 border-amber-400/30";
  }
  if (s === "DEGRADED" || s === "RUNNING" || s === "QUEUED") {
    return "bg-orange-500/20 text-orange-100 border-orange-400/30";
  }
  if (s === "FAILED" || s === "FAIL" || s === "ERROR" || s === "CRITICAL" || s === "FALSE") {
    return "bg-rose-500/20 text-rose-100 border-rose-400/30";
  }
  return "bg-white/10 text-admin-muted border-white/10";
}

function StatusBadge({ value }: { value: string }) {
  const raw = String(value || "").trim();
  // Never show UNKNOWN — it is a dead-end label for operators
  const normalized =
    !raw || raw.toUpperCase() === "UNKNOWN"
      ? "WARNING"
      : raw;
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusClass(normalized)}`}
    >
      {normalized}
    </span>
  );
}

function Card({
  title,
  value,
  hint,
  onClick
}: {
  title: string;
  value: string | number;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
    >
      <p className="text-xs uppercase tracking-wide text-admin-muted">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-admin-muted">{hint}</p> : null}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-admin-muted">
      {text}
    </p>
  );
}

function ToolBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function ToolButton({
  label,
  onClick,
  active,
  tone = "default",
  disabled = false
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  tone?: "default" | "accent" | "danger";
  disabled?: boolean;
}) {
  const toneClass =
    tone === "accent"
      ? "border-fitdog-orange/40 bg-fitdog-orange/20 text-white"
      : tone === "danger"
        ? "border-rose-400/40 bg-rose-500/15 text-rose-50"
        : active
          ? "border-white/30 bg-white/15 text-white"
          : "border-white/15 bg-white/5 text-white hover:bg-white/10";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (disabled) return;
        onClick();
      }}
      className={`rounded-xl border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      {label}
    </button>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function serviceTargetTab(serviceId: string): SectionId {
  if (serviceId === "storage") return "storage";
  if (serviceId === "background_worker" || serviceId === "job_queue") return "jobs";
  if (serviceId === "route_generator") return "route_audits";
  if (["gingr", "samsara", "twilio", "maps", "email", "realtime"].includes(serviceId)) {
    return "integrations";
  }
  if (serviceId === "ruffops") return "audit_issues";
  return "overview";
}

export function SystemHealthDebuggingApp() {
  const [section, setSection] = useState<SectionId>("overview");
  const [bundle, setBundle] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<unknown>(null);
  const [selectedAudit, setSelectedAudit] = useState<string | null>(null);
  const [auditDetail, setAuditDetail] = useState<Record<string, unknown> | null | undefined>(undefined);
  const [auditDetailMissing, setAuditDetailMissing] = useState(false);
  const [sectionData, setSectionData] = useState<unknown>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, unknown> | null>(null);
  const [jobStatusFilter, setJobStatusFilter] = useState<string>("all");
  const [liveSeverity, setLiveSeverity] = useState<string>("all");
  const [errorFilter, setErrorFilter] = useState<string>("all");
  const [integrationFilter, setIntegrationFilter] = useState<string>("all");
  const [schemaBusy, setSchemaBusy] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditIssues, setAuditIssues] = useState<Record<string, unknown> | null>(null);
  const bundleRef = useRef(bundle);
  bundleRef.current = bundle;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch("/api/admin/system-health?view=dashboard", {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal
      });
      const body = await readResponseJson(res);
      if (!res.ok) throw new Error(body.error || "Failed to load System Health");
      setBundle(body);
      setSettingsDraft((body.settings as Record<string, unknown>) || null);
      if (body.warning || body.degraded) {
        setError(typeof body.warning === "string" ? body.warning : LIVE_DATA_SLOW_MESSAGE);
      }
    } catch (err) {
      const aborted = (err instanceof DOMException && err.name === "AbortError") || controller.signal.aborted;
      if (aborted && bundleRef.current) {
        setError(LIVE_DATA_SLOW_MESSAGE);
      } else {
        setError(humanizeUnknownError(err, "Failed to load System Health"));
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  const loadAuditIssues = useCallback(async () => {
    const res = await fetch("/api/admin/system-health?view=audit_issues", {
      cache: "no-store",
      credentials: "same-origin"
    });
    const body = await readResponseJson(res);
    if (!res.ok) {
      setError(body.error || "Failed to load audit issues");
      return null;
    }
    const data = (body.data as Record<string, unknown>) || null;
    setAuditIssues(data);
    setSectionData(data);
    return data;
  }, []);

  const loadSection = useCallback(
    async (id: SectionId, opts?: { jobStatus?: string }) => {
      if (id === "audit_issues") {
        await loadAuditIssues();
        return;
      }
      const view =
        id === "api_logs"
          ? "api_logs"
          : id === "jobs"
            ? "jobs"
            : id === "storage"
              ? "storage"
              : id === "user_activity"
                ? "user_activity"
                : id === "system_events" || id === "live"
                  ? "events"
                  : id === "errors"
                    ? "errors"
                    : id === "integrations"
                      ? "integrations"
                      : null;
      if (!view) return;
      const params = new URLSearchParams({ view });
      if (id === "jobs" && opts?.jobStatus && opts.jobStatus !== "all") {
        params.set("status", opts.jobStatus);
      }
      if (id === "live" && liveSeverity !== "all") params.set("severity", liveSeverity);
      const res = await fetch(`/api/admin/system-health?${params.toString()}`, {
        cache: "no-store",
        credentials: "same-origin"
      });
      const body = await readResponseJson(res);
      if (res.ok) setSectionData(body.data ?? body);
      else setError(body.error || "Failed to load section");
    },
    [liveSeverity, loadAuditIssues]
  );

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (
      section === "overview" ||
      section === "route_audits" ||
      section === "settings" ||
      section === "cursor_bridge" ||
      section === "debug_search"
    ) {
      return;
    }
    void loadSection(section, { jobStatus: jobStatusFilter });
  }, [section, jobStatusFilter, loadSection]);

  useEffect(() => {
    if (!selectedAudit) {
      setAuditDetail(undefined);
      setAuditDetailMissing(false);
      return;
    }
    setAuditDetail(undefined);
    setAuditDetailMissing(false);
    void (async () => {
      const res = await fetch(
        `/api/admin/system-health?view=route_audit&correlationId=${encodeURIComponent(selectedAudit)}`,
        { cache: "no-store" }
      );
      const body = await readResponseJson(res);
      if (!res.ok) {
        setError(body.error || "Failed to load route audit");
        setAuditDetail(null);
        setAuditDetailMissing(true);
        return;
      }
      if (body.data == null) {
        setAuditDetail(null);
        setAuditDetailMissing(true);
        return;
      }
      setAuditDetail(body.data as Record<string, unknown>);
      setAuditDetailMissing(false);
    })();
  }, [selectedAudit]);

  const overview = (bundle?.overview as Record<string, unknown>) || null;
  const summary = (overview?.summary as Record<string, unknown>) || {};
  const services = (overview?.services as Array<Record<string, unknown>>) || [];
  const activity = (bundle?.activity as Array<Record<string, unknown>>) || [];
  const errors = (bundle?.errors as Array<Record<string, unknown>>) || [];
  const audits = (bundle?.audits as Array<Record<string, unknown>>) || [];
  const integrations = (bundle?.integrations as Array<Record<string, unknown>>) || [];
  const liveDebug = (bundle?.liveDebug as Array<Record<string, unknown>>) || [];
  const schema =
    ((bundle?.schema as Record<string, unknown> | null) ||
      ((overview as Record<string, unknown> | null)?.schema as Record<string, unknown> | null) ||
      null);

  const applyMigration072 = async () => {
    setSchemaBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/system-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply_migration_072" })
      });
      const body = await readResponseJson(res);
      if (!res.ok || body.ok === false) {
        setError(body.detail || body.error || "Unable to apply migration 072");
        return;
      }
      setCopyNote(body.detail || "Migration 072 applied");
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setSchemaBusy(false);
    }
  };

  const copyMigrationSql = async () => {
    setSchemaBusy(true);
    try {
      const res = await fetch("/api/admin/system-health?view=migration_sql", { cache: "no-store" });
      const body = await readResponseJson(res);
      if (!res.ok) {
        // Fall back to public path hint for non-configure roles
        const ok = await copyText(
          "Open supabase/migrations/072_system_health_debugging.sql in the repo and paste into Supabase SQL Editor."
        );
        setCopyNote(ok ? "Fallback instruction copied" : "Copy failed");
        if (!res.ok) setError(body.error || "Need configure permission to fetch SQL");
        return;
      }
      const sql = String(body.data?.sql || "");
      const ok = await copyText(sql);
      setCopyNote(ok ? "Migration 072 SQL copied — paste into Supabase SQL Editor" : "Copy failed");
    } finally {
      setSchemaBusy(false);
    }
  };

  const go = (id: SectionId) => setSection(id);

  const storageService = services.find((s) => s.id === "storage");
  const storageBuckets =
    ((storageService?.meta as Record<string, unknown>)?.buckets as Array<Record<string, unknown>>) ||
    [];

  const runSearch = async () => {
    const res = await fetch("/api/admin/system-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "search", query: search })
    });
    const body = await readResponseJson(res);
    if (res.ok) setSearchResult(body.data ?? body);
    else setError(body.error || "Search failed");
  };

  const saveSettings = async () => {
    if (!settingsDraft) return;
    const res = await fetch("/api/admin/system-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_settings", settings: settingsDraft })
    });
    const body = await readResponseJson(res);
    if (!res.ok) {
      setError(body.error || "Unable to save settings");
      return;
    }
    setCopyNote("Settings saved");
    void refresh();
  };

  const startLiveDebug = async () => {
    const res = await fetch("/api/admin/system-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "start_live_debug",
        feature: "route_generator",
        durationMinutes: 30,
        reason: "Temporary elevated diagnostics"
      })
    });
    const body = await readResponseJson(res);
    if (!res.ok) {
      setError(body.error || "Unable to start live debug");
      return;
    }
    setCopyNote("Live debug enabled for 30 minutes");
    void refresh();
  };

  const endLiveDebug = async () => {
    const res = await fetch("/api/admin/system-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end_live_debug" })
    });
    const body = await readResponseJson(res);
    if (!res.ok) {
      setError(body.error || "Unable to end live debug");
      return;
    }
    setCopyNote(`Ended ${Number(body.ended || 0)} live debug session(s)`);
    void refresh();
  };

  const runWhiteboardAudit = async () => {
    setAuditBusy(true);
    setError(null);
    setCopyNote("Running whiteboard audit + auto-fix…");
    setSection("audit_issues");
    try {
      const res = await fetch("/api/admin/system-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "run_whiteboard_audit", auto_fix: true })
      });
      const body = await readResponseJson(res).catch(() => ({}));
      if (!res.ok) {
        setError(String(body.error || `Unable to run whiteboard audit (${res.status})`));
        setCopyNote(null);
        return;
      }
      const open = Number(body.open_issues || 0);
      const fixed = Number(body.summary?.fixed || 0);
      setAuditIssues({
        last_run_at: new Date().toISOString(),
        overall_status: body.overall_status,
        open_issues: body.open_issue_rows || [],
        recent_rows: body.recent_rows || [],
        summary: body.summary || null
      });
      setSectionData({
        last_run_at: new Date().toISOString(),
        overall_status: body.overall_status,
        open_issues: body.open_issue_rows || [],
        recent_rows: body.recent_rows || [],
        summary: body.summary || null
      });
      setCopyNote(
        open ? `Audit done · ${fixed} fixed · ${open} still open` : `Audit done · ${fixed} fixed · all clear`
      );
      await refresh();
      await loadAuditIssues();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to run whiteboard audit");
      setCopyNote(null);
    } finally {
      setAuditBusy(false);
    }
  };

  const acknowledgeAuditIssue = async (issueId?: string | null) => {
    setAuditBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/system-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "acknowledge_audit_issue",
          issueId: issueId || null,
          note: issueId ? "Acknowledged from Audit Issues." : "Acknowledged all remaining open audit issues."
        })
      });
      const body = await readResponseJson(res).catch(() => ({}));
      if (!res.ok) {
        setError(String(body.error || `Unable to acknowledge issue (${res.status})`));
        return;
      }
      setCopyNote(
        Number(body.open_issues || 0)
          ? `Acknowledged · ${body.open_issues} still open`
          : "Acknowledged · all clear"
      );
      await refresh();
      await loadAuditIssues();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to acknowledge issue");
    } finally {
      setAuditBusy(false);
    }
  };

  const openAuditDetails = () => {
    setError(null);
    setSection("audit_issues");
    void loadAuditIssues();
  };

  const copyDebugContext = async (correlationId: string) => {
    const res = await fetch("/api/admin/system-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bug_context", correlationId })
    });
    const body = await readResponseJson(res);
    if (!res.ok) {
      setError(body.error || "Unable to build debug context");
      return;
    }
    const text = String(body.text || JSON.stringify(body.data, null, 2));
    const ok = await copyText(text);
    setCopyNote(ok ? "Debug context copied" : "Could not copy — see developer details");
  };

  const mutateError = async (action: "resolve_error" | "reopen_error", errorId: string) => {
    const res = await fetch("/api/admin/system-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, errorId })
    });
    const body = await readResponseJson(res);
    if (!res.ok) {
      setError(body.error || "Unable to update error");
      return;
    }
    setCopyNote(action === "resolve_error" ? "Error marked resolved" : "Error reopened");
    void refresh();
    void loadSection("errors");
  };

  const headerSubtitle = useMemo(
    () =>
      "Live probes for RuffOps — Route Generator, worker/queue, Supabase cloud storage, Realtime, integrations, and Cursor evidence.",
    []
  );

  const liveRows = useMemo(() => {
    const source =
      (section === "system_events" || section === "live" || section === "user_activity") &&
      Array.isArray(sectionData)
        ? (sectionData as Array<Record<string, unknown>>)
        : activity;
    if (liveSeverity === "all") return source;
    return source.filter((ev) => String(ev.severity || "").toLowerCase() === liveSeverity);
  }, [activity, liveSeverity, section, sectionData]);

  const filteredErrors = useMemo(() => {
    const source =
      section === "errors" && Array.isArray(sectionData)
        ? (sectionData as Array<Record<string, unknown>>)
        : errors;
    if (errorFilter === "all") return source;
    return source.filter((e) => String(e.status || "unresolved") === errorFilter);
  }, [errors, errorFilter, section, sectionData]);

  const filteredIntegrations = useMemo(() => {
    const source =
      section === "integrations" && Array.isArray(sectionData)
        ? (sectionData as Array<Record<string, unknown>>)
        : integrations;
    if (integrationFilter === "all") return source;
    return source.filter((r) => String(r.integration) === integrationFilter);
  }, [integrationFilter, integrations, section, sectionData]);

  const jobsPayload = (sectionData as Record<string, unknown> | null) || null;
  const jobs = (jobsPayload?.jobs as Array<Record<string, unknown>>) || [];
  const jobCounts = (jobsPayload?.counts as Record<string, number>) || {};
  const apiLogs = Array.isArray(sectionData) ? (sectionData as Array<Record<string, unknown>>) : [];
  const storageProbe =
    section === "storage" && sectionData && typeof sectionData === "object"
      ? (sectionData as Record<string, unknown>)
      : null;

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-admin-border bg-black/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">System Health &amp; Debugging</h2>
            <p className="mt-1 max-w-3xl text-sm text-admin-muted">{headerSubtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ToolButton
              label={auditBusy ? "Auditing…" : "Run audit + auto-fix"}
              disabled={auditBusy}
              onClick={() => void runWhiteboardAudit()}
            />
            <ToolButton label="Refresh probes" onClick={() => void refresh()} tone="accent" />
            {copyNote ? <span className="self-center text-xs text-emerald-300">{copyNote}</span> : null}
          </div>
        </div>
        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(s.id)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
                section === s.id
                  ? "border-fitdog-orange/50 bg-fitdog-orange/20 text-white"
                  : "border-white/10 bg-white/[0.03] text-admin-muted hover:text-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
      ) : null}
      {loading && !bundle ? <Empty text="Loading system health…" /> : null}

      {section === "overview" && overview ? (
        <div className="space-y-4">
          {schema && schema.ready === false ? (
            <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4">
              <p className="text-sm font-semibold text-rose-50">Migration 072 required</p>
              <p className="mt-1 text-sm text-rose-50/90">{String(schema.detail || "")}</p>
              <p className="mt-2 text-xs text-rose-100/80">
                Missing tables: {Array.isArray(schema.missing) ? schema.missing.join(", ") : "—"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <ToolButton
                  label={schemaBusy ? "Working…" : "Apply migration 072 now"}
                  tone="accent"
                  onClick={() => void applyMigration072()}
                />
                <ToolButton
                  label="Copy 072 SQL"
                  onClick={() => void copyMigrationSql()}
                />
              </div>
              <p className="mt-2 text-xs text-admin-muted">
                One-click apply needs <code>SUPABASE_DB_PASSWORD</code> or <code>DATABASE_URL</code> on
                Vercel. Otherwise paste the copied SQL into the Supabase SQL Editor and run it.
              </p>
            </div>
          ) : schema?.ready ? (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">
              System Health schema (072) is present.
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card
              title="System Health"
              value={String(
                !summary.systemHealth || String(summary.systemHealth).toUpperCase() === "UNKNOWN"
                  ? "WARNING"
                  : summary.systemHealth
              )}
              hint="Worst critical service"
              onClick={() => go("integrations")}
            />
            <Card title="Errors Today" value={Number(summary.errorsToday || 0)} onClick={() => go("errors")} />
            <Card title="Warnings Today" value={Number(summary.warningsToday || 0)} onClick={() => go("live")} />
            <Card title="Failed Jobs" value={Number(summary.failedJobs || 0)} onClick={() => go("jobs")} />
            <Card
              title="Integration Failures"
              value={Number(summary.integrationFailures || 0)}
              onClick={() => go("integrations")}
            />
            <Card
              title="Route Audit Failures"
              value={Number(summary.routeAuditFailures || 0)}
              onClick={() => go("route_audits")}
            />
            <Card title="Users Active" value={Number(summary.usersActive || 0)} onClick={() => go("user_activity")} />
            <Card
              title="Queue Depth"
              value={summary.queueDepth != null ? Number(summary.queueDepth) : "—"}
              onClick={() => go("jobs")}
            />
            <Card
              title="Storage Buckets OK"
              value={summary.storageBucketsOk != null ? Number(summary.storageBucketsOk) : "—"}
              onClick={() => go("storage")}
            />
            <Card
              title="Schema 072"
              value={summary.schemaReady === false ? "MISSING" : summary.schemaReady ? "OK" : "—"}
              hint="system_health_* tables"
              onClick={() => go("settings")}
            />
            <Card title="Deploy Version" value={String(summary.releaseVersion || "—")} hint="Recent deploy / commit" />
            <Card
              title="Last Route Generation"
              value={
                summary.lastRouteGeneration
                  ? new Date(String(summary.lastRouteGeneration)).toLocaleString()
                  : "—"
              }
              onClick={() => go("route_audits")}
            />
            <Card
              title="Last Gingr Sync"
              value={summary.lastGingrSync ? new Date(String(summary.lastGingrSync)).toLocaleString() : "—"}
            />
            <Card
              title="Last Samsara Export"
              value={
                summary.lastSamsaraExport ? new Date(String(summary.lastSamsaraExport)).toLocaleString() : "—"
              }
            />
          </div>

          {liveDebug.length ? (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-amber-100">LIVE DEBUGGING ACTIVE</p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-50/90">
                    {liveDebug.map((row) => (
                      <li key={String(row.id)}>
                        {String(row.feature)} · expires{" "}
                        {row.expires_at ? new Date(String(row.expires_at)).toLocaleString() : "—"}
                      </li>
                    ))}
                  </ul>
                </div>
                <ToolButton label="End live debug" onClick={() => void endLiveDebug()} />
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {services.map((svc) => {
              const id = String(svc.id);
              const status = String(svc.status || "UNKNOWN").toUpperCase();
              const needsAuditFix = id === "ruffops" && (status === "WARNING" || status === "DEGRADED");
              const needsRouteView = id === "route_generator" && (status === "WARNING" || status === "DEGRADED");
              return (
                <article
                  key={id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-white/20"
                >
                  <button
                    type="button"
                    onClick={() => go(serviceTargetTab(id))}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-white">{String(svc.label)}</p>
                      <StatusBadge value={String(svc.status || "UNKNOWN")} />
                    </div>
                    <p className="mt-2 text-sm text-admin-muted">{String(svc.detail || "")}</p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-admin-muted">
                      <div>
                        <dt>Response</dt>
                        <dd className="text-white">{svc.responseTimeMs != null ? `${svc.responseTimeMs} ms` : "—"}</dd>
                      </div>
                      <div>
                        <dt>Errors 24h</dt>
                        <dd className="text-white">{Number(svc.errorsLast24h || 0)}</dd>
                      </div>
                      <div>
                        <dt>Last success</dt>
                        <dd className="text-white">
                          {svc.lastSuccessAt ? new Date(String(svc.lastSuccessAt)).toLocaleString() : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Success rate</dt>
                        <dd className="text-white">{svc.successRate24h != null ? `${svc.successRate24h}%` : "—"}</dd>
                      </div>
                    </dl>
                    {svc.lastError ? (
                      <p className="mt-2 text-xs text-rose-200">Last error: {String(svc.lastError)}</p>
                    ) : null}
                  </button>
                  {needsAuditFix || needsRouteView || liveDebug.length || id === "ruffops" ? (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">
                      {needsAuditFix ? (
                        <ToolButton
                          label={auditBusy ? "Fixing…" : "Fix audit issues"}
                          tone="accent"
                          disabled={auditBusy}
                          onClick={() => void runWhiteboardAudit()}
                        />
                      ) : null}
                      {needsRouteView ? (
                        <ToolButton label="Open route audits" onClick={() => go("route_audits")} />
                      ) : null}
                      {id === "route_generator" && liveDebug.length ? (
                        <ToolButton label="End live debug" disabled={auditBusy} onClick={() => void endLiveDebug()} />
                      ) : null}
                      <ToolButton
                        label="Details"
                        onClick={() => {
                          if (id === "ruffops") openAuditDetails();
                          else go(serviceTargetTab(id));
                        }}
                      />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {section === "live" || section === "user_activity" || section === "system_events" ? (
        <div className="space-y-3">
          <ToolBar>
            {(["all", "info", "warning", "error", "critical"] as const).map((sev) => (
              <ToolButton
                key={sev}
                label={sev}
                active={liveSeverity === sev}
                onClick={() => {
                  setLiveSeverity(sev);
                  if (section === "live" || section === "system_events") void loadSection(section);
                }}
              />
            ))}
            <ToolButton
              label="Reload feed"
              onClick={() => void loadSection(section === "user_activity" ? "user_activity" : section)}
            />
          </ToolBar>
          {liveRows.length === 0 ? (
            <Empty text="No diagnostic history available yet." />
          ) : (
            <ul className="space-y-2">
              {liveRows.map((ev) => (
                <li key={String(ev.id)} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm text-white">
                      <span className="text-admin-muted">
                        {ev.occurred_at ? new Date(String(ev.occurred_at)).toLocaleTimeString() : "—"}
                      </span>{" "}
                      <span className="font-medium">{String(ev.message || ev.event_type)}</span>
                    </div>
                    <StatusBadge value={String(ev.severity || "info")} />
                  </div>
                  <p className="mt-1 text-xs text-admin-muted">
                    {[ev.user_email, ev.module, ev.correlation_id, ev.integration].filter(Boolean).join(" · ")}
                  </p>
                  {ev.correlation_id ? (
                    <button
                      type="button"
                      className="mt-2 text-xs text-fitdog-orange underline"
                      onClick={() => {
                        setSelectedAudit(String(ev.correlation_id));
                        go("route_audits");
                      }}
                    >
                      Open correlation
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {section === "audit_issues" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">Whiteboard &amp; Gingr audit issues</h3>
                <p className="mt-1 text-sm text-admin-muted">
                  These are the open system-health audit findings that yellow the RuffOps Application card.
                  Run auto-fix first; acknowledge anything that remains if it is expected (for example TVs powered off).
                </p>
                <p className="mt-2 text-xs text-admin-muted">
                  Status{" "}
                  <span className="font-semibold text-white">
                    {String((auditIssues || (sectionData as Record<string, unknown> | null))?.overall_status || "—")}
                  </span>
                  {" · "}
                  Last run{" "}
                  {(auditIssues || (sectionData as Record<string, unknown> | null))?.last_run_at
                    ? new Date(
                        String((auditIssues || (sectionData as Record<string, unknown>))?.last_run_at)
                      ).toLocaleString()
                    : "never"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ToolButton
                  label={auditBusy ? "Fixing…" : "Run audit + auto-fix"}
                  tone="accent"
                  disabled={auditBusy}
                  onClick={() => void runWhiteboardAudit()}
                />
                <ToolButton
                  label={auditBusy ? "Working…" : "Acknowledge all open"}
                  disabled={auditBusy}
                  onClick={() => void acknowledgeAuditIssue(null)}
                />
                <ToolButton label="Reload" onClick={() => void loadAuditIssues()} />
              </div>
            </div>
          </div>

          {(() => {
            const payload = (auditIssues || (sectionData as Record<string, unknown> | null) || {}) as Record<
              string,
              unknown
            >;
            const openRows = Array.isArray(payload.open_issues)
              ? (payload.open_issues as Array<Record<string, unknown>>)
              : [];
            const recentRows = Array.isArray(payload.recent_rows)
              ? (payload.recent_rows as Array<Record<string, unknown>>)
              : [];
            const rows = openRows.length ? openRows : recentRows;
            if (!rows.length) {
              return <Empty text="No audit results yet. Click Run audit + auto-fix." />;
            }
            return (
              <ul className="space-y-2">
                {rows.map((row) => {
                  const status = String(row.status || "open");
                  const isOpen = status === "open" || status === "failed";
                  return (
                    <li key={String(row.id)} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge value={status} />
                            <span className="text-xs uppercase tracking-wide text-admin-muted">
                              {String(row.severity || "—")} · {String(row.check || "").replace(/_/g, " ")}
                            </span>
                          </div>
                          <p className="mt-2 font-medium text-white">{String(row.title || "Issue")}</p>
                          <p className="mt-1 text-sm text-admin-muted">{String(row.detail || "")}</p>
                          {row.auto_fix && typeof row.auto_fix === "object" ? (
                            <p className="mt-2 text-xs text-admin-muted">
                              Auto-fix:{" "}
                              <span className="text-white">
                                {String((row.auto_fix as Record<string, unknown>).result || "—")}
                              </span>
                              {(row.auto_fix as Record<string, unknown>).message
                                ? ` · ${String((row.auto_fix as Record<string, unknown>).message)}`
                                : ""}
                            </p>
                          ) : null}
                        </div>
                        {isOpen ? (
                          <ToolButton
                            label={auditBusy ? "Working…" : "Acknowledge"}
                            disabled={auditBusy}
                            onClick={() => void acknowledgeAuditIssue(String(row.id))}
                          />
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </div>
      ) : null}

      {section === "errors" ? (
        <div className="space-y-3">
          <ToolBar>
            {(["all", "unresolved", "resolved"] as const).map((f) => (
              <ToolButton key={f} label={f} active={errorFilter === f} onClick={() => setErrorFilter(f)} />
            ))}
            <ToolButton label="Reload errors" onClick={() => void loadSection("errors")} />
          </ToolBar>
          {filteredErrors.length === 0 ? (
            <Empty text="No captured errors yet." />
          ) : (
            filteredErrors.map((err) => (
              <div key={String(err.id)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white">{String(err.error_message)}</p>
                    <p className="mt-1 text-xs text-admin-muted">
                      {String(err.application_module || "app")} · {Number(err.occurrence_count || 1)}× · last{" "}
                      {err.last_occurrence_at ? new Date(String(err.last_occurrence_at)).toLocaleString() : "—"}
                    </p>
                  </div>
                  <StatusBadge value={String(err.status || "unresolved")} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {err.correlation_id ? (
                    <ToolButton
                      label="Open related audit"
                      onClick={() => {
                        setSelectedAudit(String(err.correlation_id));
                        go("route_audits");
                      }}
                    />
                  ) : null}
                  <ToolButton
                    label="Copy diagnostic"
                    onClick={() =>
                      void copyText(
                        `Error ${err.id}\n${err.error_message}\nmodule=${err.application_module}\ncorrelation=${err.correlation_id || ""}`
                      ).then((ok) => setCopyNote(ok ? "Diagnostic summary copied" : "Copy failed"))
                    }
                  />
                  {String(err.status) !== "resolved" ? (
                    <ToolButton
                      label="Resolve"
                      tone="accent"
                      onClick={() => void mutateError("resolve_error", String(err.id))}
                    />
                  ) : (
                    <ToolButton label="Reopen" onClick={() => void mutateError("reopen_error", String(err.id))} />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {section === "route_audits" ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-2">
            <ToolBar>
              <ToolButton label="Refresh audits" onClick={() => void refresh()} />
            </ToolBar>
            {audits.length === 0 ? (
              <Empty text="No route audits yet. Generate routes to create the first audit (migration 072)." />
            ) : (
              audits.map((a) => (
                <button
                  key={String(a.id)}
                  type="button"
                  onClick={() => setSelectedAudit(String(a.correlation_id))}
                  className={`w-full rounded-xl border px-4 py-3 text-left ${
                    selectedAudit === a.correlation_id
                      ? "border-fitdog-orange/40 bg-fitdog-orange/10"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-sm text-white">{String(a.correlation_id)}</p>
                    <StatusBadge value={String(a.quality_gate || a.status || "UNKNOWN")} />
                  </div>
                  <p className="mt-1 text-xs text-admin-muted">
                    {String(a.operating_date || "")} · expected {Number(a.expected_dogs || 0)} · generated{" "}
                    {Number(a.generated_dogs || 0)} · {String(a.actor_email || "system")}
                  </p>
                </button>
              ))
            )}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            {!selectedAudit ? (
              <Empty text="Select a route audit to inspect pipeline and dog traces." />
            ) : auditDetailMissing ? (
              <Empty text="Audit not found for this correlation ID. Refresh Overview and re-select the audit." />
            ) : !auditDetail ? (
              <Empty text="Loading audit…" />
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-white">{selectedAudit}</h3>
                  <div className="flex gap-2">
                    <ToolButton label="Copy Debug Context" onClick={() => void copyDebugContext(selectedAudit)} />
                    <ToolButton
                      label="Copy Cursor Command"
                      onClick={() =>
                        void copyText(`npm run ruffops:debug -- bug ${selectedAudit}`).then((ok) =>
                          setCopyNote(ok ? "Cursor command copied" : "Copy failed")
                        )
                      }
                    />
                  </div>
                </div>
                {(() => {
                  const audit = (auditDetail.audit as Record<string, unknown>) || {};
                  const traces = (auditDetail.traces as Array<Record<string, unknown>>) || [];
                  const pipeline = (audit.pipeline_stages as Array<Record<string, unknown>>) || [];
                  const missing = (audit.missing_dogs as Array<Record<string, unknown>>) || [];
                  return (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge value={String(audit.quality_gate || "UNKNOWN")} />
                        <span className="text-xs text-admin-muted">
                          {Number(audit.expected_dogs || 0)} expected · {Number(audit.generated_dogs || 0)} generated ·{" "}
                          {audit.duration_ms != null ? `${audit.duration_ms} ms` : ""}
                        </span>
                      </div>
                      {missing.length ? (
                        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-50">
                          <p className="font-semibold">ROUTE AUDIT FAILED — Missing dogs</p>
                          <ul className="mt-1 list-disc pl-5">
                            {missing.map((m, i) => (
                              <li key={`${m.dog}-${i}`}>
                                {String(m.dog)} · {String(m.stage)} · {String(m.reason)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div>
                        <p className="mb-2 text-xs uppercase tracking-wide text-admin-muted">Pipeline</p>
                        <ul className="space-y-1">
                          {pipeline.map((stage) => (
                            <li
                              key={String(stage.key)}
                              className="flex items-center justify-between gap-2 rounded-lg border border-white/5 px-2 py-1.5 text-sm"
                            >
                              <span className="text-white">
                                {String(stage.stage).padStart(2, "0")} {String(stage.label)}
                              </span>
                              <StatusBadge value={String(stage.status)} />
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="mb-2 text-xs uppercase tracking-wide text-admin-muted">Dog traces</p>
                        <ul className="max-h-80 space-y-2 overflow-auto">
                          {traces.map((t) => (
                            <li key={String(t.id)} className="rounded-lg border border-white/10 px-3 py-2 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-medium text-white">{String(t.dog_name || "unknown")}</span>
                                <StatusBadge value={String(t.validation_status || t.eligibility || "—")} />
                              </div>
                              <p className="mt-1 text-xs text-admin-muted">
                                {String(t.service_canonical || t.service_raw || "")} · {String(t.direction || "")} ·
                                expected {String(t.expected_destination || "—")} · generated{" "}
                                {String(t.generated_destination || "—")}
                                {t.error_code ? ` · ${String(t.error_code)}` : ""}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <details className="rounded-xl border border-white/10 p-3">
                        <summary className="cursor-pointer text-sm text-admin-muted">Developer Details</summary>
                        <pre className="mt-2 max-h-64 overflow-auto text-[11px] text-admin-muted">
                          {JSON.stringify(auditDetail, null, 2)}
                        </pre>
                      </details>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {section === "integrations" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {services
              .filter((s) =>
                ["gingr", "samsara", "twilio", "maps", "email", "database", "storage", "realtime"].includes(
                  String(s.id)
                )
              )
              .map((svc) => (
                <button
                  key={String(svc.id)}
                  type="button"
                  onClick={() => go(serviceTargetTab(String(svc.id)))}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-white">{String(svc.label)}</p>
                    <StatusBadge value={String(svc.status)} />
                  </div>
                  <p className="mt-2 text-sm text-admin-muted">{String(svc.detail)}</p>
                  <p className="mt-2 text-xs text-admin-muted">
                    {svc.responseTimeMs != null ? `${svc.responseTimeMs} ms · ` : ""}
                    {svc.lastSuccessAt ? `last ${new Date(String(svc.lastSuccessAt)).toLocaleString()}` : ""}
                  </p>
                </button>
              ))}
          </div>
          <ToolBar>
            {(["all", "gingr", "samsara", "twilio"] as const).map((f) => (
              <ToolButton
                key={f}
                label={f}
                active={integrationFilter === f}
                onClick={() => setIntegrationFilter(f)}
              />
            ))}
            <ToolButton label="Reload calls" onClick={() => void loadSection("integrations")} />
          </ToolBar>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-admin-muted">Recent integration calls</p>
            {filteredIntegrations.length === 0 ? (
              <Empty text="No integration diagnostic calls recorded yet." />
            ) : (
              <ul className="space-y-2">
                {filteredIntegrations.map((row) => (
                  <li key={String(row.id)} className="rounded-xl border border-white/10 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-white">
                        {String(row.integration)} · {String(row.action)}
                      </span>
                      <StatusBadge value={row.success ? "HEALTHY" : "FAILED"} />
                    </div>
                    <p className="text-xs text-admin-muted">
                      {row.occurred_at ? new Date(String(row.occurred_at)).toLocaleString() : ""} ·{" "}
                      {row.latency_ms != null ? `${row.latency_ms} ms` : ""} · {String(row.error_message || "")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {section === "storage" ? (
        <div className="space-y-4">
          <ToolBar>
            <ToolButton label="Re-probe buckets" tone="accent" onClick={() => void loadSection("storage")} />
            <ToolButton
              label="Copy bucket report"
              onClick={() =>
                void copyText(JSON.stringify(storageProbe || { buckets: storageBuckets }, null, 2)).then((ok) =>
                  setCopyNote(ok ? "Storage report copied" : "Copy failed")
                )
              }
            />
          </ToolBar>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-white">Supabase Cloud Storage</h3>
                <p className="mt-1 text-sm text-admin-muted">
                  {(storageProbe?.detail as string) ||
                    (storageService?.detail as string) ||
                    "Probes photo-uploads, cast-videos, cast-tv-media, lobby-slideshow."}
                </p>
              </div>
              <StatusBadge
                value={String(storageProbe?.status || storageService?.status || "UNKNOWN")}
              />
            </div>
            <p className="mt-2 text-xs text-admin-muted">
              Backend: Supabase Storage · binaries never leave object storage · metadata in Postgres
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              ((storageProbe?.buckets as Array<Record<string, unknown>>) || storageBuckets) as Array<
                Record<string, unknown>
              >
            ).map((b) => (
              <div key={String(b.bucket)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-sm text-white">{String(b.bucket)}</p>
                  <StatusBadge value={b.listOk ? "HEALTHY" : "FAILED"} />
                </div>
                <p className="mt-2 text-sm text-admin-muted">{String(b.purpose || "")}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-admin-muted">
                  <div>
                    <dt>Critical</dt>
                    <dd className="text-white">{b.critical ? "yes" : "optional"}</dd>
                  </div>
                  <div>
                    <dt>Latency</dt>
                    <dd className="text-white">{b.latencyMs != null ? `${b.latencyMs} ms` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Sample objects</dt>
                    <dd className="text-white">
                      {b.objectSampleCount != null ? Number(b.objectSampleCount) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Present</dt>
                    <dd className="text-white">{b.present ? "yes" : "no"}</dd>
                  </div>
                </dl>
                {b.error ? <p className="mt-2 text-xs text-rose-200">{String(b.error)}</p> : null}
              </div>
            ))}
          </div>
          {!storageProbe && storageBuckets.length === 0 ? (
            <Empty text="Run Refresh probes on Overview, then open Cloud Storage." />
          ) : null}
        </div>
      ) : null}

      {section === "api_logs" ? (
        <div className="space-y-3">
          <ToolBar>
            <ToolButton label="Reload API logs" onClick={() => void loadSection("api_logs")} />
            <ToolButton
              label="Copy latest 20"
              onClick={() =>
                void copyText(JSON.stringify(apiLogs.slice(0, 20), null, 2)).then((ok) =>
                  setCopyNote(ok ? "API logs copied" : "Copy failed")
                )
              }
            />
          </ToolBar>
          {!sectionData ? (
            <Empty text="Loading…" />
          ) : apiLogs.length === 0 ? (
            <Empty text="No API diagnostic logs yet." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-left text-xs text-admin-muted">
                <thead className="bg-white/[0.04] text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Endpoint</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Latency</th>
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2">Request</th>
                  </tr>
                </thead>
                <tbody>
                  {apiLogs.map((row) => (
                    <tr key={String(row.id)} className="border-t border-white/5">
                      <td className="px-3 py-2 whitespace-nowrap text-white">
                        {row.occurred_at ? new Date(String(row.occurred_at)).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2">{String(row.method || "")}</td>
                      <td className="px-3 py-2 font-mono text-white">{String(row.endpoint || "")}</td>
                      <td className="px-3 py-2">
                        <StatusBadge value={String(row.status_code || "")} />
                      </td>
                      <td className="px-3 py-2">{row.latency_ms != null ? `${row.latency_ms} ms` : "—"}</td>
                      <td className="px-3 py-2">{String(row.user_email || "—")}</td>
                      <td className="px-3 py-2 font-mono">{String(row.request_id || row.correlation_id || "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {section === "jobs" ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {Object.entries(jobCounts).map(([k, v]) => (
              <Card key={k} title={k.replace(/_/g, " ")} value={Number(v)} onClick={() => setJobStatusFilter(k)} />
            ))}
            <Card
              title="Failed today"
              value={Number((jobsPayload?.failedToday as number) || 0)}
              onClick={() => setJobStatusFilter("failed")}
            />
          </div>
          <ToolBar>
            {JOB_STATUSES.map((s) => (
              <ToolButton
                key={s}
                label={s}
                active={jobStatusFilter === s}
                onClick={() => setJobStatusFilter(s)}
              />
            ))}
            <ToolButton label="Reload jobs" onClick={() => void loadSection("jobs", { jobStatus: jobStatusFilter })} />
          </ToolBar>
          {!sectionData ? (
            <Empty text="Loading…" />
          ) : jobs.length === 0 ? (
            <Empty text={(jobsPayload?.note as string) || "No route worker jobs found."} />
          ) : (
            <ul className="space-y-2">
              {jobs.map((job) => (
                <li key={String(job.id)} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-white">
                        {String(job.job_type)}{" "}
                        <span className="font-mono text-xs text-admin-muted">{String(job.id).slice(0, 8)}</span>
                      </p>
                      <p className="mt-1 text-xs text-admin-muted">
                        attempts {Number(job.attempts || 0)}/{Number(job.max_attempts || 0)} · created{" "}
                        {job.created_at ? new Date(String(job.created_at)).toLocaleString() : "—"}
                        {job.completed_at
                          ? ` · completed ${new Date(String(job.completed_at)).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                    <StatusBadge value={String(job.status)} />
                  </div>
                  {job.error_message ? (
                    <p className="mt-2 text-xs text-rose-200">{String(job.error_message)}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {job.correlation_id ? (
                      <ToolButton
                        label={`Open ${String(job.correlation_id)}`}
                        onClick={() => {
                          setSelectedAudit(String(job.correlation_id));
                          go("route_audits");
                        }}
                      />
                    ) : null}
                    <ToolButton
                      label="Copy job id"
                      onClick={() =>
                        void copyText(String(job.id)).then((ok) => setCopyNote(ok ? "Job id copied" : "Copy failed"))
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {section === "debug_search" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Dog, correlation ID, employee, error…"
              className="min-w-[16rem] flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
            />
            <ToolButton label="Search" tone="accent" onClick={() => void runSearch()} />
          </div>
          {searchResult ? (
            <pre className="max-h-[28rem] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-[11px] text-admin-muted">
              {JSON.stringify(searchResult, null, 2)}
            </pre>
          ) : (
            <Empty text="Search across route audits, dog traces, errors, and events." />
          )}
        </div>
      ) : null}

      {section === "cursor_bridge" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="font-semibold text-white">Cursor Debug Bridge</h3>
            <p className="mt-1 text-sm text-admin-muted">
              Read-only developer diagnostics. Never exposes secrets. Production access requires explicit settings.
            </p>
            <ul className="mt-3 space-y-1 font-mono text-xs text-admin-muted">
              <li>npm run ruffops:debug -- health</li>
              <li>npm run ruffops:debug -- route-run RG-YYYYMMDD-#####</li>
              <li>npm run ruffops:debug -- dog Baxter --date 2026-08-12</li>
              <li>npm run ruffops:debug -- errors --last 1h</li>
              <li>npm run ruffops:debug -- integration samsara --last 24h</li>
              <li>npm run ruffops:debug -- search &quot;Captain&quot;</li>
              <li>npm run ruffops:debug -- context --feature route-generator --last 24h</li>
              <li>npm run ruffops:debug -- bug RG-YYYYMMDD-#####</li>
            </ul>
          </div>
          <ToolButton
            label="Enable Live Debug (Route Generator, 30 min)"
            tone="accent"
            onClick={() => void startLiveDebug()}
          />
          <ToolButton label="End all live debug sessions" onClick={() => void endLiveDebug()} />
        </div>
      ) : null}

      {section === "settings" && settingsDraft ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="font-semibold text-white">Migration 072 — System Health schema</h3>
            <p className="mt-1 text-sm text-admin-muted">
              {schema
                ? String(schema.detail || "")
                : "Refresh Overview to load schema readiness."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ToolButton
                label={schemaBusy ? "Working…" : "Apply migration 072"}
                tone="accent"
                onClick={() => void applyMigration072()}
              />
              <ToolButton label="Copy 072 SQL" onClick={() => void copyMigrationSql()} />
            </div>
          </div>
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          {(
            [
              ["debugLoggingEnabled", "Debug logging enabled"],
              ["verboseLogging", "Verbose logging"],
              ["routeDecisionTracing", "Route decision tracing"],
              ["apiDiagnostics", "API diagnostics"],
              ["integrationDiagnostics", "Integration diagnostics"],
              ["liveActivityEnabled", "Live activity"],
              ["developerBridgeEnabled", "Developer bridge access"],
              ["cursorBridgeEnabled", "Cursor bridge enabled"],
              ["productionDiagnosticAccess", "Production diagnostic access (read-only)"],
              ["piiMasking", "PII masking"]
            ] as Array<[string, string]>
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 text-sm text-white">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={Boolean(settingsDraft[key])}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, [key]: e.target.checked })}
              />
            </label>
          ))}
          <ToolButton label="Save settings" tone="accent" onClick={() => void saveSettings()} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
